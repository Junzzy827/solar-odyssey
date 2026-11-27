"""
発射台に立つスペースシャトル（オービター・外部タンク・固体ロケット 2 本）を、NASA 3D Resources のモデルから組み立てる。

元のモデル（NASA 3D Resources、https://github.com/nasa/NASA-3D-Resources、著作権なし）：
  - オービター：「Space Shuttle (D)」（19k 三角形、写真の絵つき、実寸（インチ）。Draco 圧縮 → tools/shuttle/decode_draco.mjs でほどく）
    荷物室の扉（door-prt / door-stb）は別のファイル。扉の絵は配られていないので、白い材質をつける
    メインエンジンのノズル（eng.glb）と OMS のノズル（rcs.glb）も別のファイルで、ここで 3 基 / 2 基を置く
  - 外部タンク：「Space Shuttle Parts / External tank」（6.3k 三角形、オレンジの断熱材の絵）
  - 固体ロケット：「Space Shuttle Parts / Solid Rocket Booster」（4.1k 三角形、白い絵）
  タンクとロケットの絵にはロゴが無い。オービターの絵には NASA のマーク、国旗、「United States」の文字があるので、
  まわりの白いタイルの色で塗りつぶす（PAINT_OUT。2026-11-28 に絵を並べて場所を決めた）

並べ方（アプリへは glTF の Y 上で書き出す。Blender では Z が上）：
  - 原点：固体ロケットの後ろのスカートの底（移動発射台の甲板）、外部タンクの中心線の真下
  - オービターは西（Blender の −X、three の −x）。腹を東のタンクへ、背中（荷物室の扉）を西へ
  - 固体ロケットは南北（Blender の ±Y）。オービターの左（ポート、乗組員のハッチ）は北の発射塔の側
    （塔は発射台の北側、という NASA の資料からの見当。FACTS.md、UNVERIFIED）
  - 高さ（EST、FACTS.md）：外部タンクの底 9.3 m、オービターの機首の先 39.4 m（タンクとの前後の結合点の位置から）

書き出す部品（three で別々に動かせる）：Orbiter、Doors、SSME_1〜3（原点はノズルの付け根、−Z 向き＝下向き）、
OMS_L / OMS_R、ET、SRB_N、SRB_S（原点は後ろの底の中心）

実行：
  node tools/shuttle/decode_draco.mjs "<NASA>/3D Models/Space Shuttle (D)/Space Shuttle (D).glb" /tmp/shuttleD.glb
  ORB=/tmp/shuttleD.glb ORB_DIR="<NASA>/3D Models/Space Shuttle (D)" \
  ET_SRC="<NASA>/3D Models/Space Shuttle Parts/External tank.glb" SRB_SRC="<NASA>/3D Models/Space Shuttle Parts/Solid Rocket Booster.glb" \
  OUT=public/models/shuttle-stack.glb flock /tmp/claude-0/locks/blender.lock /home/user/.bpyvenv/bin/python -I tools/blender/build_shuttle_stack.py
  node tools/glb/compress.mjs public/models/shuttle-stack.glb
  PREVIEW=1 PREVIEW_DIR=<dir> VIEWS=hero,west,nose,base,night EXPORT=0 ...   確かめの絵
"""

import math
import os
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'shuttle-stack.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp/shuttle-stack-prev')

INCH = 0.0254
SRB_Y = 6.36  # 外部タンクの中心線から固体ロケットの中心線まで（EST）
ET_AFT_Z = 9.3  # 外部タンクの底の高さ（スタックの高さ 56.1 m − タンクの長さ 46.9 m）
NOSE_Z = 39.4  # オービターの機首の先の高さ（EST：タンクとの後ろの結合点 Xt 2058 ↔ Xo 1317 が 12.2 m）
BELLY_GAP = 1.0  # タンクの表面とオービターの腹のすき間（EST）

# オービター (D) の材質：荷物室の中のもの（扉を閉じると見えない）は捨てる
DROP = ('shut-handrails', 'shut-bay-win', 'shut-bay-fwd', 'shut-bay-aft', 'shut-cam-cargo', 'doorlatc', 'wedges',
        'evarail')
DROP_EXACT = ('shut-bay',)

# ロゴ・国旗・文字を塗りつぶす場所：絵の名前 → [(x0, y0, x1, y1)]（絵の画素、左上が原点）
PAINT_OUT = {
    'wingtop': [(34, 128, 104, 206), (60, 410, 110, 490)],  # NASA のマーク、国旗
    'side-stb': [(84, 36, 264, 62)],  # マーク、「United States」、国旗
    'side-prt': [(84, 36, 264, 62)],
}

COLORS = {
    'DoorWhite': ((0.78, 0.78, 0.75), 0.8, 0.0),
    'Engine': ((0.22, 0.20, 0.19), 0.45, 0.85),
    'EngineIn': ((0.06, 0.05, 0.045), 0.6, 0.5),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    col, rough, metal = COLORS[name]
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def import_glb(path):
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o.name not in before]


STASHED = []


def stash(objs):
    """読み込んだ元の物は、最後にまとめて隠す（途中で消したり隠したりすると、次の glTF の読み込みで Blender 5.3 が落ちる）"""
    STASHED.extend(objs)


def hide_stashed():
    meshes = [o.data for o in STASHED if o.type == 'MESH']
    bpy.data.batch_remove(STASHED + meshes)


def world_mesh(o):
    """評価済みの面を世界の座標で（頂点、面、面ごとの材質、UV）"""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    mw = o.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    # 評価済みの面の材質は、依存グラフの一時的なコピー。元の材質（original）を使う（コピーを使うと後で Blender が落ちる）
    slots = [m.original if m else None for m in me.materials]
    mats = [slots[p.material_index] if slots else None for p in me.polygons]
    faces = [list(p.vertices) for p in me.polygons]
    uv = None
    if me.uv_layers:
        lay = me.uv_layers.active.data
        uv = [[tuple(lay[li].uv) for li in p.loop_indices] for p in me.polygons]
    ev.to_mesh_clear()
    return verts, faces, mats, uv


def build_object(name, verts, faces, mats, uvs=None, origin=(0, 0, 0), smooth_angle=35):
    """mats は bpy の材質（面ごと）"""
    mesh = bpy.data.meshes.new(name)
    ox, oy, oz = origin
    # 同じ頂点を 2 度使う面（つぶれた三角形）は from_pydata を壊すので捨てる
    good = [k for k, fc in enumerate(faces) if len(set(fc)) == len(fc) and len(fc) >= 3]
    if len(good) < len(faces):
        print(f'{name}: dropped {len(faces) - len(good)} degenerate faces', flush=True)
        faces = [faces[k] for k in good]
        mats = [mats[k] for k in good]
        uvs = [uvs[k] for k in good] if uvs else None
    mesh.from_pydata([(v[0] - ox, v[1] - oy, v[2] - oz) for v in verts], [], faces)
    uniq = []
    for m in mats:
        if m not in uniq:
            uniq.append(m)
    for m in uniq:
        mesh.materials.append(m)
    idx = {m: i for i, m in enumerate(uniq)}
    for p, m in zip(mesh.polygons, mats):
        p.material_index = idx[m]
    if uvs:
        lay = mesh.uv_layers.new(name='UVMap')
        for p in mesh.polygons:
            for j, li in enumerate(p.loop_indices):
                lay.data[li].uv = uvs[p.index][j]
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = origin
    for p in mesh.polygons:
        p.use_smooth = True
    try:
        mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
    except AttributeError:
        pass
    return obj


def collect(objs, xf=lambda v: v, keep=lambda m: True):
    """メッシュを 1 つの頂点・面の並びにまとめる"""
    V, F, M, U = [], [], [], []
    for o in objs:
        if o.type != 'MESH':
            continue
        verts, faces, mats, uv = world_mesh(o)
        o0 = len(V)
        V += [xf(v) for v in verts]
        for k, fc in enumerate(faces):
            if not keep(mats[k]):
                continue
            F.append([i + o0 for i in fc])
            M.append(mats[k])
            U.append(uv[k] if uv else [(0, 0)] * len(fc))
    return V, F, M, U


def compact(V, F):
    """使われていない頂点を捨てる"""
    used = sorted({i for fc in F for i in fc})
    remap = {old: new for new, old in enumerate(used)}
    return [V[i] for i in used], [[remap[i] for i in fc] for fc in F]


# ---- 絵のロゴを塗りつぶす ----------------------------------------------------------------


def paint_out(img, rects):
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, img.channels)
    for x0, y0, x1, y1 in rects:
        # 絵の上下を Blender の下からの行に
        r0, r1 = H - 1 - y1, H - 1 - y0
        x0, x1 = max(x0, 3), min(x1, W - 4)
        r0, r1 = max(r0, 3), min(r1, H - 4)
        left = px[r0:r1 + 1, x0 - 3:x0].mean(axis=1)
        right = px[r0:r1 + 1, x1 + 1:x1 + 4].mean(axis=1)
        bot = px[r0 - 3:r0, x0:x1 + 1].mean(axis=0)
        top = px[r1 + 1:r1 + 4, x0:x1 + 1].mean(axis=0)
        tx = np.linspace(0, 1, x1 - x0 + 1)[None, :, None]
        ty = np.linspace(0, 1, r1 - r0 + 1)[:, None, None]
        h = left[:, None, :] * (1 - tx) + right[:, None, :] * tx
        v = bot[None, :, :] * (1 - ty) + top[None, :, :] * ty
        # 端に近いほうの補間を強く（四隅の色がにじまない）
        wx = np.minimum(tx, 1 - tx)
        wy = np.minimum(ty, 1 - ty)
        wh = wy / (wx + wy + 1e-6)
        px[r0:r1 + 1, x0:x1 + 1] = h * wh + v * (1 - wh)
    img.pixels[:] = px.ravel()
    img.update()
    img.pack()


def recolor_stripes(img):
    """固体ロケットの後ろの黄色い帯（1993 年のロケットには無い）を、まわりのクリーム色に"""
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, img.channels)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    mask = (r > 0.75) & (g > 0.4) & (g < 0.8) & (b < 0.35)
    cream = np.array([0.93, 0.91, 0.84, 1.0][:img.channels], dtype=np.float32)
    px[mask] = cream
    img.pixels[:] = px.ravel()
    img.update()
    img.pack()
    print('recoloured', int(mask.sum()), 'stripe pixels in', img.name, flush=True)


def clean_textures():
    done = []
    for img in bpy.data.images:
        base = os.path.splitext(img.name)[0]
        for key, rects in PAINT_OUT.items():
            if base == key or base.startswith(key + '.'):
                paint_out(img, rects)
                done.append(img.name)
    print('painted over', done, flush=True)


# ---- オービター ----------------------------------------------------------------------------
# (D) の座標：前が +X、上が −Y（腹が +Y）、右（スターボード）が −Z。発射台では 前 → 上 (+Z)、上 → 西 (−X)、右 → 南 (−Y)


def d_to_stack(v):
    return Vector((v.y, v.z, v.x)) * INCH


def orbiter(orb_path, orb_dir):
    objs = import_glb(orb_path)
    clean_textures()

    def keep(m):
        n = m.name if m else ''
        base = n.split('.')[0]
        return not (any(k in n for k in DROP) or base in DROP_EXACT)

    V, F, M, U = collect(objs, d_to_stack, keep)
    V, F = compact(V, F)
    # 機首の先の高さと、腹とタンクのすき間を合わせる
    nose = max(v.z for v in V)
    mid = [v.x for v in V if nose - 30 < v.z < nose - 8]
    belly = max(mid)
    shift = Vector((-(ET_R + BELLY_GAP) - belly, 0, NOSE_Z - nose))
    V = [v + shift for v in V]
    # メインエンジンの付け根：後ろの面の絵にある 3 つの穴の中心（UV → 3D）
    aft_mat = next((m for m in set(M) if m and m.name.startswith('fusolage aft eng')), None)
    holes = [(434 / 640, 1 - 152 / 640), (145 / 640, 1 - 290 / 640), (434 / 640, 1 - 411 / 640)]
    mounts = []
    for uv in holes:
        p = uv_to_point(V, F, M, U, aft_mat, uv)
        mounts.append(p)
    lower = [p for p in mounts if p is not None and abs(p.y) > 0.8]
    upper = [p for p in mounts if p is not None and abs(p.y) <= 0.8]
    if lower and upper:
        lo, up = lower[0], upper[0]
        mounts = [Vector((up.x, 0.0, up.z)), Vector((lo.x, abs(lo.y), lo.z)), Vector((lo.x, -abs(lo.y), lo.z))]
    print('SSME mounts', [tuple(round(c, 2) for c in p) if p else None for p in mounts], flush=True)
    stash(objs)
    out = [build_object('Orbiter', V, F, M, U)]
    # 荷物室の扉（閉じた位置）
    dv, df, dm, du = [], [], [], []
    for side in ('prt', 'stb'):
        p = os.path.join(orb_dir, f'Space Shuttle (D) door-{side}.glb')
        dobjs = import_glb(p)
        a, b, c, d = collect(dobjs, d_to_stack)
        o0 = len(dv)
        dv += [v + shift for v in a]
        df += [[i + o0 for i in fc] for fc in b]
        dm += c
        du += d
        stash(dobjs)
    white = material('DoorWhite')
    out.append(build_object('Doors', dv, df, [white] * len(df)))
    # メインエンジン 3 基と OMS のノズル 2 つ
    eng = nozzle(os.path.join(orb_dir, 'Space Shuttle (D) eng.glb'))
    for k, p in enumerate(mounts):
        if p is None:
            continue
        out.append(place_nozzle(f'SSME_{k + 1}', eng, p))
    oms = nozzle(os.path.join(orb_dir, 'Space Shuttle (D) rcs.glb'))
    for nm, key in (('OMS_L', 'OMS pod prt back'), ('OMS_R', 'OMS pod stb back')):
        pts = [V[i] for fc, m in zip(F, M) if m and m.name.startswith(key) for i in fc]
        if pts:
            c = sum(pts, Vector()) / len(pts)
            out.append(place_nozzle(nm, oms, Vector((c.x, c.y, min(p.z for p in pts) + 0.2))))
    return out


def uv_to_point(V, F, M, U, mat, uv):
    """材質 mat の面のうち、UV に uv を含む三角形の上の 3D の点"""
    u, w = uv
    best = None
    for fc, m, t in zip(F, M, U):
        if m != mat:
            continue
        for k in range(1, len(fc) - 1):
            a, b, c = t[0], t[k], t[k + 1]
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-12:
                continue
            l1 = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (w - c[1])) / den
            l2 = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (w - c[1])) / den
            l3 = 1 - l1 - l2
            if min(l1, l2, l3) >= -1e-4:
                p = V[fc[0]] * l1 + V[fc[k]] * l2 + V[fc[k + 1]] * l3
                if best is None or p.z < best.z:
                    best = p
    return best


def nozzle(path):
    """ノズル（(D) の座標で −X が口）を、付け根を原点・口を −Z に向けた頂点の並びに"""
    objs = import_glb(path)
    V, F, M, U = collect(objs, d_to_stack)
    stash(objs)
    zs = [v.z for v in V]
    z0, z1 = min(zs), max(zs)

    def rad(z):
        pts = [v for v in V if abs(v.z - z) < (z1 - z0) * 0.04]
        return max(math.hypot(v.x, v.y) for v in pts) if pts else 0

    flip = rad(z1) > rad(z0)  # 口（太い側）が上なら、ひっくり返す
    if flip:
        V = [Vector((v.x, -v.y, -v.z)) for v in V]
    top = max(v.z for v in V)
    V = [v - Vector((0, 0, top)) for v in V]
    mats = [material('EngineIn') if m and 'in' in m.name.split('.')[0].split()[-1] else material('Engine') for m in M]
    print('nozzle', os.path.basename(path), f'{z1 - z0:.2f} m long, mouth radius {max(rad(z0), rad(z1)):.2f}', flush=True)
    return V, F, mats


def place_nozzle(name, noz, at):
    V, F, M = noz
    return build_object(name, [v + at for v in V], F, M, origin=tuple(at))


# ---- 絵つきの部品：外部タンク、固体ロケット ------------------------------------------------


def textured_part(path):
    objs = import_glb(path)
    V, F, M, U = collect(objs, lambda v: v * INCH)
    stash(objs)
    return V, F, M, U


def upright(V):
    """長い軸を Z に（回すだけ、鏡にしない）。細い側（機首）を上に、機首の先を中心線に"""
    ext = [max(v[i] for v in V) - min(v[i] for v in V) for i in range(3)]
    a = ext.index(max(ext))
    perm = {0: lambda v: Vector((v.y, v.z, v.x)), 1: lambda v: Vector((v.z, v.x, v.y)), 2: lambda v: Vector(v)}[a]
    W = [perm(v) for v in V]
    z0, z1 = min(v.z for v in W), max(v.z for v in W)
    L = z1 - z0

    def end_radius(lo, hi):
        pts = [v for v in W if lo <= v.z <= hi]
        cx = sum(v.x for v in pts) / len(pts)
        cy = sum(v.y for v in pts) / len(pts)
        return max(math.hypot(v.x - cx, v.y - cy) for v in pts)

    if end_radius(z1 - 0.04 * L, z1) > end_radius(z0, z0 + 0.04 * L):
        W = [Vector((v.x, -v.y, -v.z)) for v in W]  # X のまわりに半回転
    z0, z1 = min(v.z for v in W), max(v.z for v in W)
    tip = [v for v in W if v.z > z1 - 0.01 * (z1 - z0)]
    cx = sum(v.x for v in tip) / len(tip)
    cy = sum(v.y for v in tip) / len(tip)
    return [Vector((v.x - cx, v.y - cy, v.z - z0)) for v in W]


def body_radius(W):
    """胴の半径（長さの中ほどの頂点の、中心線からの距離の中央値）"""
    z1 = max(v.z for v in W)
    rs = sorted(math.hypot(v.x, v.y) for v in W if 0.35 * z1 < v.z < 0.6 * z1)
    return rs[len(rs) // 2]


def turn(W, ang):
    rot = Matrix.Rotation(ang, 4, 'Z')
    return [(rot @ v.to_4d()).to_3d() for v in W]


def face_dir(W, F, sel):
    pts = [sum((W[i] for i in fc), Vector()) / len(fc) for fc, s in zip(F, sel) if s]
    if not pts:
        return None
    c = sum(pts, Vector()) / len(pts)
    return math.atan2(c.y, c.x)


ET_R = 4.2  # 置き換える（外部タンクの部品から測る）


def external_tank():
    global ET_R
    V, F, M, U = textured_part(os.environ['ET_SRC'])
    W = upright(V)
    ET_R = body_radius(W)
    # オービターとつなぐ棒（et_attach_bar*）を西（−X、角度 π）へ
    ang = face_dir(W, F, [bool(m and m.name.startswith('et_attach_bar')) for m in M])
    if ang is not None:
        W = turn(W, math.pi - ang)
    W = [v + Vector((0, 0, ET_AFT_Z)) for v in W]
    print(f'ET length {max(v.z for v in W) - ET_AFT_Z:.2f} m, radius {ET_R:.2f} m, attach bars at {math.degrees(ang or 0):.0f} deg', flush=True)
    return build_object('ET', W, F, M, U)


def boosters():
    V, F, M, U = textured_part(os.environ['SRB_SRC'])
    for img in {n.image for m in set(M) if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
        recolor_stripes(img)
    W = upright(V)
    r = body_radius(W)
    z1 = max(v.z for v in W)
    # タンクの側の金具：胴から飛び出した頂点（スカートと機首を除く）
    sel = []
    for fc in F:
        c = sum((W[i] for i in fc), Vector()) / len(fc)
        sel.append(0.15 * z1 < c.z < 0.85 * z1 and math.hypot(c.x, c.y) > r * 1.08)
    ang = face_dir(W, F, sel)
    print(f'SRB length {z1:.2f} m, radius {r:.2f} m, fittings at {math.degrees(ang) if ang is not None else None}', flush=True)
    out = []
    for nm, y in (('SRB_N', SRB_Y), ('SRB_S', -SRB_Y)):
        # 金具をタンクの側（北のロケットは −Y、南は +Y）へ
        w = turn(W, (-math.pi / 2 if y > 0 else math.pi / 2) - ang) if ang is not None else W
        w = [v + Vector((0, y, 0)) for v in w]
        out.append(build_object(nm, w, F, M, U, origin=(0, y, 0)))
    return out


# ---- 確かめの絵 -----------------------------------------------------------------------


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(os.environ.get('SAMPLES', '24'))
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    ground = bpy.data.objects.new('Ground', bpy.data.meshes.new('Ground'))
    ground.data.from_pydata([(-300, -300, 0), (300, -300, 0), (300, 300, 0), (-300, 300, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('G')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.25, 0.24, 1)
    ground.data.materials.append(gm)
    scene.collection.objects.link(ground)
    lights = []

    def light(kind, loc, tgt, energy, size=30):
        L = bpy.data.objects.new('L', bpy.data.lights.new('L', kind))
        L.data.energy = energy
        if kind == 'SPOT':
            L.data.spot_size = math.radians(size)
        L.location = loc
        d = Vector(tgt) - Vector(loc)
        L.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(L)
        lights.append(L)

    shots = {
        'hero': ((-70, -55, 22), (0, 0, 28), 40, 'day'),
        'west': ((-95, 0, 28), (0, 0, 28), 40, 'day'),
        'north': ((0, 95, 28), (0, 0, 28), 40, 'day'),
        'nose': ((-24, 16, 50), (-6, 0, 40), 35, 'day'),
        'base': ((-32, -26, 4), (-3, 0, 6), 28, 'day'),
        'aft': ((-14, -6, -4), (-6, 0, 4), 24, 'day'),
        'night': ((-160, -150, 12), (0, 0, 30), 55, 'night'),
    }
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for v in os.environ.get('VIEWS', 'hero,west,nose,base,night').split(','):
        for L in lights:
            bpy.data.objects.remove(L, do_unlink=True)
        lights.clear()
        loc, tgt, lens, lt = shots[v]
        ground.hide_render = v == 'aft'
        if lt == 'day':
            bg.inputs['Strength'].default_value = 1.0
            bg.inputs['Color'].default_value = (0.35, 0.45, 0.6, 1)
            light('SUN', (-60, -80, 120), (0, 0, 0), 4.0)
        else:
            bg.inputs['Strength'].default_value = 1.0
            bg.inputs['Color'].default_value = (0.004, 0.006, 0.014, 1)
            for x, y in ((-150, -170), (-200, 120), (150, -200)):
                light('SPOT', (x, y, -6), (0, 0, 35), 4.0e6, 22)
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = lens
        scene.render.resolution_x, scene.render.resolution_y = (700, 1000) if v in ('night', 'west', 'north') else (1000, 700)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'stack-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, flush=True)


# ---- まとめ ---------------------------------------------------------------------------


def main():
    t0 = time.time()
    reset()
    objs = [external_tank()]
    objs += boosters()
    objs += orbiter(os.environ['ORB'], os.environ['ORB_DIR'])
    hide_stashed()
    bpy.context.view_layer.update()
    nt = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print(f'{nt} triangles, {len(objs)} objects, {len(bpy.data.materials)} materials ({time.time() - t0:.1f}s)', flush=True)
    for o in objs:
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        print(o.name, [round(min(b[i] for b in bb), 2) for i in range(3)], [round(max(b[i] for b in bb), 2) for i in range(3)], flush=True)
    if os.environ.get('EXPORT', '1') == '1':
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        for o in bpy.data.objects:
            o.select_set(o in objs)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True,
                                  export_yup=True, export_materials='EXPORT', export_image_format='WEBP')
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)
    if os.environ.get('PREVIEW'):
        preview(objs)


if __name__ == '__main__':
    main()
