"""
アポロ 17 号の宇宙服（A7LB）を作って public/models/apollo-suit.glb に書き出す。

アプリの宇宙飛行士（src/components/surface/astronaut.ts の Rig）と同じ関節の位置で、部品ごとの固い形に分けて作る。
three.js 側（src/components/surface/apolloSuit.ts）は、部品を Rig の関節の箱（Group）に入れるだけで動く。

部品の名前は「関節__印」：関節は torso / shoulder0 / elbow0 / shoulder1 / elbow1 / hip0 / knee0 / hip1 / knee1、
印（無くてもよい）は、着る人や場面で出したり消したりするもの：
  plss … 月面の背中の生命維持装置（PLSS）と、その上の非常用酸素（OPS）
  ops  … 船外活動の司令船パイロット（エバンス飛行士）が背負った非常用酸素だけ
  leva … ヘルメットの上にかぶる日よけ（金色のバイザーと横の日よけ）
  cdr  … 船長（サーナン飛行士）の赤い帯（腕・脚・日よけの上）
  rcu  … 月面で胸に付けた操作箱（カメラの台つき）
番号 0 は体の左（three.js の +X）。体の正面は three.js の +Z（Blender では -Y）。

形のポイント（実物の写真から）：
  白いベータ布の、たっぷりしたしわ。関節のじゃばら（肩・ひじ・ひざ）は布の下でふくらんで見える。
  首の金属リングと、丸い泡のヘルメット。胸の 2 列の酸素の口（青が入り口、赤が出口）。
  手首の回るリング（左が赤、右が青）。手袋の指先は青灰色のシリコーン。月面用の上ばき（白、青灰色の厚い底）。
  左の手首に、作業の手順書（カフ・チェックリスト）。ももにポケット。

すき間の暗さ（AO）は頂点の色に焼く（UV もテクスチャもいらない）。布の織り目は、小さな繰り返しのノーマルマップ 1 枚。

実行（Blender の Python モジュール bpy の入った Python で）:
  python3 -m venv ~/.bpyvenv && ~/.bpyvenv/bin/pip install bpy
  ~/.bpyvenv/bin/python tools/blender/build_apollo_suit.py           # 書き出す
  PREVIEW=/tmp/suit ~/.bpyvenv/bin/python tools/blender/build_apollo_suit.py   # 確認の絵も描く
  AO=0 ...                                                            # AO を焼かない（速い）
そのあと node tools/glb/compress.mjs public/models/apollo-suit.glb
"""

import math
import os

import bpy  # noqa: I001（bmesh より先に読む）
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'apollo-suit.glb'))
PREVIEW = os.environ.get('PREVIEW', '')
AO = os.environ.get('AO', '1') != '0'
SEED = 17

# 関節（Blender の座標：Z が上、-Y が正面）。astronaut.ts の HIP_Y・THIGH・SHIN と肩・ひじの位置に合わせる
HIP_Y = 0.98
J = {
    'torso': (0.0, 0.0, HIP_Y),
    'shoulder0': (0.35, 0.0, HIP_Y + 0.55),
    'shoulder1': (-0.35, 0.0, HIP_Y + 0.55),
    'elbow0': (0.35, 0.0, HIP_Y + 0.25),
    'elbow1': (-0.35, 0.0, HIP_Y + 0.25),
    'hip0': (0.125, 0.0, HIP_Y),
    'hip1': (-0.125, 0.0, HIP_Y),
    'knee0': (0.125, 0.0, HIP_Y - 0.44),
    'knee1': (-0.125, 0.0, HIP_Y - 0.44),
}
ANKLE_Z = HIP_Y - 0.88

rng = np.random.default_rng(SEED)

# ---- 材質 ------------------------------------------------------------------------------------

MAT_DEF = {
    # 名前: (色, ラフネス, メタリック)
    'Beta': ((0.86, 0.86, 0.84), 0.9, 0.0),  # ベータ布（ガラス繊維の白い布）
    'Hard': ((0.9, 0.9, 0.88), 0.45, 0.0),  # 日よけの殻・背中の箱（白い固い殻）
    'Metal': ((0.62, 0.64, 0.66), 0.32, 1.0),  # 首・手首・腰のアルミのリング
    'Red': ((0.62, 0.06, 0.05), 0.4, 0.4),
    'Blue': ((0.06, 0.18, 0.55), 0.4, 0.4),
    'Silicone': ((0.33, 0.38, 0.44), 0.7, 0.0),  # 指先・靴底の青灰色のゴム
    'Dark': ((0.05, 0.05, 0.055), 0.6, 0.2),
    'Gold': ((1.0, 0.72, 0.28), 0.08, 1.0),  # 金のバイザー
    'Bubble': ((0.9, 0.93, 0.95), 0.02, 0.0),  # 透明な泡のヘルメット（three.js で透明にする）
    'Stripe': ((0.66, 0.05, 0.05), 0.85, 0.0),  # 船長の赤い帯（布）
    'Paper': ((0.82, 0.8, 0.72), 0.95, 0.0),  # 手順書の紙
}
MATS = {}


def weave_normal(path, n=128):
    """ベータ布の織り目（たてよこの糸）のノーマルマップを PNG に描く。繰り返して使う"""
    x = np.arange(n)
    X, Y = np.meshgrid(x, x)
    k = 2 * np.pi * 16 / n
    warp = np.sin(X * k) * (np.sin(Y * k / 2) > 0)
    weft = np.sin(Y * k) * (np.sin(Y * k / 2) <= 0)
    h = warp + weft + rng.normal(0, 0.15, (n, n))
    gy, gx = np.gradient(h)
    s = 0.6
    nx, ny, nz = -gx * s, -gy * s, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    img = np.stack([nx / L * 0.5 + 0.5, ny / L * 0.5 + 0.5, nz / L * 0.5 + 0.5, np.ones_like(h)], -1)
    im = bpy.data.images.new('weave', n, n, alpha=False)
    im.pixels = img[::-1].astype(np.float32).ravel()
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    im.colorspace_settings.name = 'Non-Color'
    return im


def make_materials():
    weave = weave_normal('/tmp/apollo-suit-weave.png')
    for name, (col, rough, metal) in MAT_DEF.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*col, 1.0)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if name in ('Beta', 'Stripe'):
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = weave
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.35
            nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if name == 'Bubble':
            bsdf.inputs['Alpha'].default_value = 0.18
        MATS[name] = m


# ---- 形を作る道具 ------------------------------------------------------------------------------


class Part:
    """ひとつの部品（Blender の 1 オブジェクト）。頂点は世界の座標で足していき、最後に関節を原点にする"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mat_index = {}

    def mi(self, mat):
        if mat not in self.mat_index:
            self.mat_index[mat] = len(self.mat_index)
        return self.mat_index[mat]

    def add_grid(self, rows, mat, close_u=True, cap0=False, cap1=False, smooth=True):
        """rows：輪っかの点の並び（同じ数）。となりの輪をつないで筒にする"""
        bm = self.bm
        vs = [[bm.verts.new(p) for p in row] for row in rows]
        m = self.mi(mat)
        nu = len(rows[0])
        for a, b in zip(vs, vs[1:]):
            for i in range(nu if close_u else nu - 1):
                j = (i + 1) % nu
                f = bm.faces.new((a[i], a[j], b[j], b[i]))
                f.material_index = m
                f.smooth = smooth
        for cap, row, flip in ((cap0, vs[0], True), (cap1, vs[-1], False)):
            if cap:
                c = bm.verts.new(tuple(np.mean([v.co for v in row], 0)))
                for i in range(nu):
                    j = (i + 1) % nu
                    f = bm.faces.new((row[j], row[i], c) if flip else (row[i], row[j], c))
                    f.material_index = m
                    f.smooth = smooth

    def lathe(self, profile, mat, center=(0, 0, 0), seg=24, sx=1.0, sy=1.0, axis=None, cap0=False, cap1=False, wobble=0.0, flat_back=0.0):
        """profile：(半径, 高さ) の並び。center の上下に回して筒にする。axis があれば、その向きに倒す"""
        rot = rot_to(axis) if axis else Matrix.Identity(3)
        rows = []
        for k, (r, h) in enumerate(profile):
            row = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                rr = r * (1 + wobble * noise1(k * 7.1 + i * 0.37 + len(self.name)))
                x, y = math.cos(a) * rr * sx, math.sin(a) * rr * sy
                if flat_back and y > 0:
                    y *= 1 - flat_back
                p = rot @ Vector((x, y, h))
                row.append(tuple(Vector(center) + p))
            rows.append(row)
        self.add_grid(rows, mat, cap0=cap0, cap1=cap1)

    def box(self, center, size, mat, bevel=0.01, rot=None, seg=2):
        """角の丸い箱（丸めは bmesh の bevel で）"""
        bm2 = bmesh.new()
        bmesh.ops.create_cube(bm2, size=1.0)
        for v in bm2.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=min(bevel, min(size) * 0.45), segments=seg, affect='EDGES', profile=0.5)
        R = rot_euler(rot) if rot else Matrix.Identity(3)
        self.merge(bm2, mat, lambda co: Vector(center) + R @ co)

    def sphere(self, center, r, mat, scale=(1, 1, 1), seg=24, rings=16, cut=None, rot=None):
        """球（cut=(z0, z1) なら、その高さのあいだの帯だけ。z は -1〜1 の割合）"""
        rows = []
        z0, z1 = cut if cut else (-1, 1)
        R = rot_euler(rot) if rot else Matrix.Identity(3)
        for k in range(rings + 1):
            t = math.acos(z1) + (math.acos(z0) - math.acos(z1)) * k / rings
            z, rr = math.cos(t), math.sin(t)
            row = [tuple(Vector(center) + R @ Vector((math.cos(2 * math.pi * i / seg) * rr * r * scale[0], math.sin(2 * math.pi * i / seg) * rr * r * scale[1], z * r * scale[2]))) for i in range(seg)]
            rows.append(row)
        self.add_grid(rows, mat, cap0=cut is not None and z1 < 1, cap1=cut is not None and z0 > -1)

    def tube(self, pts, r, mat, seg=10, n=24, cap=True, ribs=0.0, ribn=0):
        """点を通るなめらかなホース（ribs があれば、じゃばらのホース）"""
        P = catmull(pts, n)
        rows = []
        prev = None
        for k, p in enumerate(P):
            t = P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]
            t.normalize()
            if prev is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                u = t.cross(ref).normalized()
            else:
                u = (prev - t * prev.dot(t)).normalized()
            prev = u
            w = t.cross(u)
            rr = r * (1 + ribs * math.sin(k / max(1, len(P) - 1) * math.pi * 2 * ribn)) if ribn else r
            rows.append([tuple(p + (u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg)) * rr) for i in range(seg)])
        self.add_grid(rows, mat, cap0=cap, cap1=cap)

    def merge(self, bm2, mat, xf):
        m = self.mi(mat)
        vmap = {}
        for v in bm2.verts:
            vmap[v] = self.bm.verts.new(tuple(xf(v.co)))
        for f in bm2.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = m
            nf.smooth = True
        bm2.free()

    def build(self, joint, subdiv=0, wrinkle=0.0, wrinkle_scale=0.06, budget=4000):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        mats = sorted(self.mat_index.items(), key=lambda kv: kv[1])
        for name, _ in mats:
            me.materials.append(MATS[name])
        bpy.context.view_layer.objects.active = ob
        if subdiv:
            mod = ob.modifiers.new('sub', 'SUBSURF')
            mod.levels = subdiv
            mod.render_levels = subdiv
        if wrinkle:
            # 布のしわ：大きなゆるい波（ふくらみ）と、細かいしわ
            tex = bpy.data.textures.new(self.name + '_wr', 'CLOUDS')
            tex.noise_scale = wrinkle_scale
            tex.noise_depth = 2
            d = ob.modifiers.new('wr', 'DISPLACE')
            d.texture = tex
            d.strength = wrinkle
            d.mid_level = 0.5
            d.texture_coords = 'GLOBAL'
            tex2 = bpy.data.textures.new(self.name + '_wr2', 'STUCCI')
            tex2.noise_scale = wrinkle_scale * 0.45
            tex2.stucci_type = 'WALL_OUT'
            d2 = ob.modifiers.new('wr2', 'DISPLACE')
            d2.texture = tex2
            d2.strength = wrinkle * 0.35
            d2.texture_coords = 'GLOBAL'
        for mod in list(ob.modifiers):
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        # 面を減らす（スマホのため）：形の大事なところは残る collapse
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if tris > budget:
            dm = ob.modifiers.new('dec', 'DECIMATE')
            dm.ratio = budget / tris
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_apply(modifier='dec')
        # 関節を原点に
        off = Vector(J[joint])
        me.transform(Matrix.Translation(-off))
        ob.location = off
        # 織り目のための UV（箱の投影、5 cm で 1 回くり返す）
        uv_box(me, 0.022)
        return ob


def noise1(x):
    return math.sin(x * 12.9898) * 0.5 + math.sin(x * 4.1414 + 1.3) * 0.5


def rot_to(axis):
    a = Vector(axis).normalized()
    z = Vector((0, 0, 1))
    return z.rotation_difference(a).to_matrix()


def rot_euler(r):
    from mathutils import Euler
    return Euler(r, 'XYZ').to_matrix()


def catmull(pts, n):
    P = [Vector(p) for p in pts]
    if len(P) == 2:
        return [P[0].lerp(P[1], i / (n - 1)) for i in range(n)]
    out = []
    segs = len(P) - 1
    for i in range(n):
        u = i / (n - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = P[max(k - 1, 0)], P[k], P[k + 1], P[min(k + 2, segs)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    return out


def uv_box(me, size):
    """面の向きで XY・YZ・XZ のどれかに投影する UV"""
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u / size, v / size)


def convolute(part, center, r, length, n, mat, axis=(0, 0, 1), depth=0.12, seg=24, sx=1.0, sy=1.0):
    """関節のじゃばら（布をかぶせたふくらみ）：n 段の山"""
    prof = []
    steps = n * 6
    for k in range(steps + 1):
        t = k / steps
        h = (t - 0.5) * length
        bump = math.sin(t * math.pi * n) ** 2
        prof.append((r * (1 - depth + depth * 1.6 * bump), h))
    part.lathe(prof, mat, center=center, seg=seg, sx=sx, sy=sy, axis=axis)


# ---- 体 ------------------------------------------------------------------------------------


def build_torso():
    P = Part('torso')
    z0 = HIP_Y
    # 腰から胸：たっぷりした布（前は少し出て、背中は平ら）。前後につぶした楕円
    prof = [
        (0.205, z0 - 0.17), (0.235, z0 - 0.08), (0.245, z0 + 0.02), (0.232, z0 + 0.12), (0.236, z0 + 0.22),
        (0.255, z0 + 0.34), (0.268, z0 + 0.45), (0.262, z0 + 0.54), (0.22, z0 + 0.61), (0.16, z0 + 0.645), (0.14, z0 + 0.655),
    ]
    P.lathe(prof, 'Beta', seg=28, sx=1.12, sy=0.78, flat_back=0.12, wobble=0.012)
    # 腰の布のじゃばら（腰を曲げるための）
    convolute(P, (0, 0, z0 + 0.15), 0.236, 0.1, 2, 'Beta', depth=0.05, sx=1.1, sy=0.78, seg=28)
    # 腰のリング（ベルトの金具）と、ももの付け根の帯
    P.lathe([(0.238, z0 - 0.03), (0.245, z0 - 0.02), (0.245, z0 + 0.0), (0.238, z0 + 0.01)], 'Beta', seg=28, sx=1.11, sy=0.79)
    # 首のリング（アルミ、少し前に傾く）と、その下の布の受け
    neck_c = (0, -0.015, z0 + 0.665)
    P.lathe([(0.143, -0.012), (0.158, -0.008), (0.16, 0.012), (0.16, 0.03), (0.15, 0.042), (0.138, 0.044)], 'Metal', center=neck_c, seg=32, axis=(0, -0.18, 1))
    # 胸の酸素の口：2 組（青が入り口、赤が出口）
    for row, z in enumerate((z0 + 0.43, z0 + 0.34)):
        for side, mat in ((1, 'Blue'), (-1, 'Red')):
            x = 0.055 * side
            base = Vector((x, -0.205, z))
            P.lathe([(0.032, 0.0), (0.034, 0.012), (0.03, 0.02)], 'Metal', center=base, seg=16, axis=(0, -1, 0), cap1=True)
            P.lathe([(0.026, 0.02), (0.026, 0.04), (0.02, 0.046)], mat, center=base, seg=16, axis=(0, -1, 0), cap1=True)
    # 胸の真ん中の圧力のゲージと、ジッパーの縦の線（布のふくらみ）
    P.box((0, -0.205, z0 + 0.52), (0.07, 0.025, 0.05), 'Metal', bevel=0.008)
    P.box((0, -0.214, z0 + 0.52), (0.05, 0.008, 0.032), 'Dark', bevel=0.003)
    P.tube([(0.0, -0.2, z0 + 0.25), (0.0, -0.218, z0 + 0.1), (0.0, -0.212, z0 - 0.06)], 0.009, 'Beta', seg=8)
    # 体を締める細いワイヤーの通る、胸の横のふくらみ（左右）
    for side in (1, -1):
        P.tube([(0.2 * side, -0.16, z0 + 0.5), (0.25 * side, -0.05, z0 + 0.42), (0.25 * side, 0.08, z0 + 0.4)], 0.012, 'Beta', seg=8)
    return P


def build_helmet(P):
    """首のリングに乗った、泡のヘルメット（透明）。中に頭（顔は描かない：暗い）"""
    c = Vector((0, -0.04, HIP_Y + 0.85))
    # 泡（透明）
    P.sphere(c, 0.19, 'Bubble', scale=(1.0, 1.02, 1.05), seg=32, rings=20, cut=(-0.62, 1.0))
    # 泡の下のリング（首のリングとつながる）
    P.lathe([(0.152, -0.162), (0.162, -0.152), (0.162, -0.135), (0.152, -0.13)], 'Metal', center=c, seg=32)
    # 中の布の帽子（通信用キャップ：白と茶色）……暗く見えるように黒っぽい頭
    P.sphere(c + Vector((0, 0.015, 0.01)), 0.115, 'Dark', scale=(0.85, 1.0, 1.05), seg=18, rings=12)
    # 泡の後ろの空気の入り口（白い管）
    P.tube([c + Vector((-0.06, 0.15, -0.12)), c + Vector((0, 0.17, -0.06)), c + Vector((0.06, 0.15, -0.12))], 0.012, 'Hard', seg=8)


def build_leva(P):
    """日よけ（LEVA）：白い殻と金のバイザー、横と上の日よけ"""
    c = Vector((0, -0.04, HIP_Y + 0.85))
    # 殻：後ろと上をおおう（正面は開いている）
    rows = []
    seg_u, seg_v = 28, 16
    for k in range(seg_v + 1):
        t = k / seg_v  # 0 下 → 1 上
        el = -0.75 + t * (math.pi / 2 + 0.75)
        row = []
        for i in range(seg_u + 1):
            # 正面の開き：左右 ±1.15 rad（-Y が正面）。後ろ側を回る
            a = -math.pi / 2 + 1.05 + i / seg_u * (2 * math.pi - 2.1)
            rr = 0.218
            x = math.cos(a) * math.cos(el) * rr
            y = math.sin(a) * math.cos(el) * rr * 1.04
            z = math.sin(el) * rr * 1.08
            row.append(tuple(c + Vector((x, y, z))))
        rows.append(row)
    P.add_grid(rows, 'Hard', close_u=False)
    # 殻の内側（厚みに見せる）
    rows_in = [[tuple(c + (Vector(p) - c) * 0.95) for p in reversed(r)] for r in rows]
    P.add_grid(rows_in, 'Hard', close_u=False)
    # 金のバイザー（上にあげた状態より少し下げた位置：顔の前）
    rows = []
    for k in range(13):
        el = -0.6 + k / 12 * 1.35
        row = []
        for i in range(21):
            a = -math.pi / 2 - 1.2 + i / 20 * 2.4
            rr = 0.228
            row.append(tuple(c + Vector((math.cos(a) * math.cos(el) * rr, math.sin(a) * math.cos(el) * rr * 1.04, math.sin(el) * rr * 1.06))))
        rows.append(row)
    P.add_grid(rows, 'Gold', close_u=False)
    # バイザーのふち（白い枠）と、両横の回転の軸
    rows = []
    for k in range(2):
        el = 0.75 + k * 0.08
        rows.append([tuple(c + Vector((math.cos(-math.pi / 2 - 1.25 + i / 20 * 2.5) * math.cos(el) * 0.232, math.sin(-math.pi / 2 - 1.25 + i / 20 * 2.5) * math.cos(el) * 0.232 * 1.04, math.sin(el) * 0.232 * 1.06))) for i in range(21)])
    P.add_grid(rows, 'Hard', close_u=False)
    for side in (1, -1):
        P.lathe([(0.03, -0.012), (0.03, 0.012)], 'Hard', center=c + Vector((0.226 * side, -0.02, 0.0)), seg=14, axis=(side, 0, 0), cap0=True, cap1=True)
        # 横の日よけ（板）：こめかみの前
        P.box(c + Vector((0.192 * side, -0.118, 0.03)), (0.012, 0.08, 0.13), 'Hard', bevel=0.004, rot=(0, 0, -0.53 * side))
    # 上の日よけ（真ん中のひさし）
    P.box(c + Vector((0, -0.19, 0.155)), (0.15, 0.06, 0.01), 'Hard', bevel=0.004, rot=(0.45, 0, 0))


def build_plss(P):
    """月面の背中の箱（PLSS）と上の非常用酸素（OPS）、肩の帯、アンテナ"""
    z0 = HIP_Y
    P.box((0, 0.33, z0 + 0.36), (0.47, 0.25, 0.62), 'Hard', bevel=0.04, seg=3)
    # 箱のふたの線とベルト、下の水の口
    P.box((0, 0.457, z0 + 0.36), (0.42, 0.01, 0.5), 'Hard', bevel=0.006)
    for z in (z0 + 0.2, z0 + 0.48):
        P.box((0, 0.462, z), (0.43, 0.012, 0.03), 'Beta', bevel=0.004)
    P.box((0, 0.3, z0 + 0.79), (0.42, 0.2, 0.22), 'Hard', bevel=0.035, seg=3)  # OPS
    P.box((0, 0.3, z0 + 0.79), (0.43, 0.205, 0.025), 'Beta', bevel=0.005)
    # アンテナ（上の短い棒）
    P.tube([(0.15, 0.32, z0 + 0.9), (0.15, 0.33, z0 + 1.04)], 0.006, 'Metal', seg=6)
    # 背中から胸の口へのホース（左右に回る、じゃばら）
    for side, mat in ((1, 'Blue'), (-1, 'Red')):
        P.tube([(0.2 * side, 0.22, z0 + 0.25), (0.28 * side, 0.05, z0 + 0.3), (0.2 * side, -0.17, z0 + 0.36), (0.055 * side, -0.24, z0 + 0.39)], 0.022, 'Beta', seg=10, n=40, ribs=0.12, ribn=14)
    # 肩の帯
    for side in (1, -1):
        P.tube([(0.14 * side, 0.21, z0 + 0.62), (0.16 * side, 0.0, z0 + 0.665), (0.15 * side, -0.19, z0 + 0.58), (0.15 * side, -0.215, z0 + 0.4)], 0.014, 'Beta', seg=6)


def build_ops_only(P):
    """司令船パイロットの船外活動：背中の非常用酸素（OPS）だけと、それを留める帯"""
    z0 = HIP_Y
    P.box((0, 0.28, z0 + 0.42), (0.4, 0.17, 0.26), 'Hard', bevel=0.035, seg=3)
    P.box((0, 0.28, z0 + 0.42), (0.41, 0.175, 0.025), 'Beta', bevel=0.005)
    for side in (1, -1):
        P.tube([(0.13 * side, 0.2, z0 + 0.55), (0.16 * side, 0.0, z0 + 0.66), (0.15 * side, -0.19, z0 + 0.58), (0.15 * side, -0.215, z0 + 0.4)], 0.013, 'Beta', seg=6)
    # OPS から胸へのホース（左）
    P.tube([(-0.2, 0.22, z0 + 0.38), (-0.28, 0.05, z0 + 0.36), (-0.2, -0.17, z0 + 0.36), (-0.055, -0.24, z0 + 0.35)], 0.016, 'Beta', seg=8, n=30, ribs=0.1, ribn=10)


def build_rcu(P):
    """月面の胸の操作箱（RCU）とカメラの台"""
    z0 = HIP_Y
    P.box((0, -0.27, z0 + 0.4), (0.22, 0.09, 0.14), 'Hard', bevel=0.012)
    P.box((0, -0.318, z0 + 0.41), (0.18, 0.01, 0.1), 'Metal', bevel=0.004)
    for x, mat in ((-0.06, 'Red'), (0.0, 'Dark'), (0.06, 'Blue')):
        P.lathe([(0.012, 0), (0.012, 0.016)], mat, center=(x, -0.322, z0 + 0.44), seg=10, axis=(0, -1, 0), cap1=True)
    P.box((0, -0.335, z0 + 0.36), (0.07, 0.035, 0.035), 'Metal', bevel=0.005)  # カメラの台


def build_arm(i):
    side = 1 if i == 0 else -1
    sh = Vector(J[f'shoulder{i}'])
    el = Vector(J[f'elbow{i}'])
    U = Part(f'shoulder{i}')
    # 肩のじゃばら（大きく、胴体からはみ出す）と上腕
    # 肩の丸み（胴体とつながる）と、肩のじゃばら（腕の付け根を回る山）、上腕
    U.sphere(sh + Vector((-0.02 * side, 0, 0.0)), 0.122, 'Beta', scale=(1.0, 0.95, 0.9), seg=22, rings=12)
    convolute(U, sh + Vector((0, 0, -0.065)), 0.116, 0.1, 3, 'Beta', depth=0.12, seg=22)
    U.lathe([(0.112, -0.11), (0.106, -0.16), (0.098, -0.22), (0.092, -0.27)], 'Beta', center=sh, seg=20, wobble=0.02)
    F = Part(f'elbow{i}')
    convolute(F, el + Vector((0, 0, 0.0)), 0.092, 0.11, 3, 'Beta', depth=0.15, seg=20)
    F.lathe([(0.088, -0.05), (0.086, -0.12), (0.078, -0.19), (0.07, -0.215)], 'Beta', center=el, seg=20, wobble=0.02)
    # 手首のリング（回る金具）：左が赤、右が青
    wr = el + Vector((0, 0, -0.225))
    F.lathe([(0.066, 0.012), (0.074, 0.006), (0.074, -0.018), (0.066, -0.024)], 'Red' if side > 0 else 'Blue', center=wr, seg=22)
    F.lathe([(0.06, -0.024), (0.064, -0.03), (0.064, -0.04), (0.058, -0.044)], 'Metal', center=wr, seg=22)
    build_glove(F, wr + Vector((0, 0, -0.045)), side)
    # 左の手首の手順書（カフ・チェックリスト）
    if side > 0:
        F.box(el + Vector((0.0, -0.075, -0.15)), (0.11, 0.035, 0.12), 'Beta', bevel=0.01)
        F.box(el + Vector((0.0, -0.094, -0.15)), (0.095, 0.006, 0.105), 'Paper', bevel=0.003)
    # 右の上腕のポケット（ペンライトなど）
    if side < 0:
        U.box(sh + Vector((-0.06, -0.07, -0.15)), (0.05, 0.04, 0.1), 'Beta', bevel=0.012)
    # 船長の赤い帯（ひじの上と下）
    S = Part(f'shoulder{i}__cdr')
    S.lathe([(0.105, -0.163), (0.11, -0.17), (0.108, -0.205), (0.103, -0.212)], 'Stripe', center=sh, seg=20)
    return [(U, 1, 0.008), (F, 1, 0.006), (S, 1, 0.008)]


def build_glove(P, base, side):
    """月面用の手袋：白い甲のカバーと、青灰色の指先。指は軽く曲げる"""
    palm_c = base + Vector((0, -0.008, -0.065))
    P.lathe([(0.06, 0.04), (0.064, 0.0), (0.056, -0.035)], 'Beta', center=base, seg=18, sx=1.0, sy=0.85)  # 手首の布
    P.box(palm_c, (0.098, 0.052, 0.105), 'Beta', bevel=0.022, seg=3)
    # 指（4 本）：根元 → 先（ゆるく前に曲がる）
    for k in range(4):
        x = (-0.034 + k * 0.0225) * side
        root = palm_c + Vector((x, -0.006, -0.048))
        ln = 1.0 if k in (1, 2) else 0.85
        pts = [root, root + Vector((0, -0.016, -0.03 * ln)), root + Vector((0, -0.042 * ln, -0.046 * ln))]
        P.tube(pts, 0.0125, 'Beta', seg=8, n=8)
        P.sphere(pts[-1] + Vector((0, -0.007, -0.002)), 0.0128, 'Silicone', seg=10, rings=6)
    # 親指（体の内側）
    root = palm_c + Vector((-0.05 * side, -0.016, -0.0))
    P.tube([root, root + Vector((-0.01 * side, -0.034, -0.028))], 0.014, 'Beta', seg=8, n=6)
    P.sphere(root + Vector((-0.011 * side, -0.04, -0.034)), 0.0135, 'Silicone', seg=10, rings=6)


def build_leg(i):
    side = 1 if i == 0 else -1
    hp = Vector(J[f'hip{i}'])
    kn = Vector(J[f'knee{i}'])
    T = Part(f'hip{i}')
    T.lathe([(0.13, 0.02), (0.135, -0.06), (0.128, -0.18), (0.118, -0.3), (0.108, -0.385)], 'Beta', center=hp, seg=22, wobble=0.02)
    # ももの外側のポケット
    T.box(hp + Vector((0.1 * side, -0.035, -0.22)), (0.035, 0.11, 0.13), 'Beta', bevel=0.012)
    K = Part(f'knee{i}')
    convolute(K, kn + Vector((0, 0, 0.0)), 0.108, 0.12, 3, 'Beta', depth=0.13, seg=22)
    K.lathe([(0.105, -0.05), (0.104, -0.14), (0.095, -0.24), (0.09, -0.3)], 'Beta', center=kn, seg=22, wobble=0.02)
    build_boot(K, Vector((kn.x, kn.y, ANKLE_Z)), side)
    S = Part(f'hip{i}__cdr')
    S.lathe([(0.12, -0.268), (0.127, -0.276), (0.123, -0.322), (0.116, -0.33)], 'Stripe', center=hp, seg=22)
    return [(T, 1, 0.009), (K, 1, 0.007), (S, 1, 0.009)]


def build_boot(P, ank, side):
    """月面用の上ばき（白い布の長靴、青灰色の厚い底、前のベルト）。足首 ank（すねの下の端）"""
    z = ANKLE_Z
    # くるぶしの上までの筒
    P.lathe([(0.095, 0.16), (0.1, 0.1), (0.098, 0.04), (0.092, 0.0)], 'Beta', center=(ank.x, ank.y, z), seg=22)
    # 足の甲（前に長い、丸い）
    P.box((ank.x, ank.y - 0.05, 0.075), (0.15, 0.3, 0.1), 'Beta', bevel=0.045, seg=3)
    P.sphere((ank.x, ank.y - 0.16, 0.07), 0.075, 'Beta', scale=(1.0, 0.9, 0.7), seg=16, rings=10)
    # 厚い底（ギザギザのみぞ）
    P.box((ank.x, ank.y - 0.055, 0.02), (0.165, 0.33, 0.04), 'Silicone', bevel=0.016, seg=2)
    # 底のみぞ（低い山。底と同じゴムで、影だけで見える）
    for k in range(7):
        P.box((ank.x, ank.y + 0.08 - k * 0.042, 0.001), (0.14, 0.014, 0.005), 'Silicone', bevel=0.0015, seg=1)
    # 前と横のベルト（とめ具）
    P.box((ank.x, ank.y - 0.06, 0.128), (0.15, 0.05, 0.012), 'Beta', bevel=0.004, rot=(0.25, 0, 0))
    P.box((ank.x, ank.y + 0.0, 0.17), (0.2, 0.02, 0.03), 'Beta', bevel=0.006)


# ---- 組み立て・AO・書き出し ---------------------------------------------------------------------


def build_all():
    objs = []
    T = build_torso()
    objs.append(T.build('torso', subdiv=2, wrinkle=0.009, wrinkle_scale=0.07, budget=9000))
    H = Part('torso__helmet')
    build_helmet(H)
    objs.append(H.build('torso'))
    L = Part('torso__leva')
    build_leva(L)
    objs.append(L.build('torso', subdiv=0, budget=3000))
    Lc = Part('torso__cdr')
    # 船長の日よけの上の赤い帯
    c = Vector((0, -0.04, HIP_Y + 0.85))
    rows = []
    for k in range(5):
        el = 0.95 + k * 0.08
        rows.append([tuple(c + Vector((math.cos(a) * math.cos(el) * 0.221, math.sin(a) * math.cos(el) * 0.221 * 1.04, math.sin(el) * 0.221 * 1.08))) for a in np.linspace(-math.pi / 2 + 1.1, 3 * math.pi / 2 - 1.1, 24)])
    Lc.add_grid(rows, 'Stripe', close_u=False)
    objs.append(Lc.build('torso'))
    Pl = Part('torso__plss')
    build_plss(Pl)
    objs.append(Pl.build('torso', subdiv=1, budget=3000))
    Op = Part('torso__ops')
    build_ops_only(Op)
    objs.append(Op.build('torso', subdiv=1, budget=1500))
    Rc = Part('torso__rcu')
    build_rcu(Rc)
    objs.append(Rc.build('torso', subdiv=1, budget=1200))
    for i in range(2):
        for P, sub, wr in build_arm(i) + build_leg(i):
            joint = P.name.split('__')[0]
            objs.append(P.build(joint, subdiv=sub, wrinkle=wr, wrinkle_scale=0.05, budget=600 if '__' in P.name else 3200))
    return objs


def bake_ao(objs):
    """すき間の暗さを頂点の色に焼く（Cycles）。腕は少し開いた姿で焼く（体の影が腕に焼き付かないように）"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = int(os.environ.get('AO_SAMPLES', '48'))
    sc.world = bpy.data.worlds.new('w')
    for ob in objs:
        if ob.data.color_attributes.get('Col') is None:
            ob.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    # 印の付いた部品のうち、同時に着けないものは焼くときに隠す（OPS だけ・RCU は焼きに入れない）
    skip = {'torso__ops'}
    for ob in objs:
        ob.hide_render = ob.name in skip
    for ob in objs:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        was = ob.hide_render
        ob.hide_render = False
        if ob.name.endswith('__ops'):
            for o in objs:
                if o.name.endswith('__plss'):
                    o.hide_render = True
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for o in objs:
            o.hide_render = o.name in skip
        ob.hide_render = was
        # 透明・金・小物は AO を弱く（白に近づける）
        col = ob.data.color_attributes['Col']
        a = np.zeros(len(col.data) * 4, np.float32)
        col.data.foreach_get('color', a)
        a = a.reshape(-1, 4)
        v = a[:, 0]
        v = 0.35 + 0.65 * np.clip(v, 0, 1) ** 0.8
        if '__helmet' in ob.name or '__leva' in ob.name:
            v = 0.6 + 0.4 * v
        a[:, 0] = a[:, 1] = a[:, 2] = v
        a[:, 3] = 1
        col.data.foreach_set('color', a.ravel())
        print('  ao', ob.name, flush=True)


def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_normals=True, export_texcoords=True,
              export_tangents=False, export_materials='EXPORT', export_image_format='AUTO', export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_colors=True)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', tris, 'tris', flush=True)


def preview(objs):
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 720, 900
    w = sc.world or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.02, 0.03, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (0.9, 0.2, -0.6)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 60
    sc.collection.objects.link(cam)
    sc.camera = cam
    for ob in objs:
        ob.hide_render = ob.name.endswith('__ops') or ob.name.endswith('__rcu')
    for tag, pos in (('front', (1.2, -3.6, 1.35)), ('back', (-1.6, 3.4, 1.5)), ('head', (0.5, -1.2, 1.85))):
        cam.location = pos
        tgt = Vector((0, 0, 1.75 if tag == 'head' else 1.0))
        d = tgt - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW, f'suit-{tag}.png')
        bpy.ops.render.render(write_still=True)
        print('preview', sc.render.filepath, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    objs = build_all()
    if AO:
        bake_ao(objs)
    export(objs)
    if PREVIEW:
        preview(objs)


main()
