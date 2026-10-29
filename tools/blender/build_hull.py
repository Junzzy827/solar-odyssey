"""
自機の機関部（首・副船体・パイロン・ナセル）を Blender で生成して glb に書き出す。

部品ごとに符号付き距離関数（SDF）を作り、なめらかな最小値（smooth min）で
つなぎ合わせてから等値面を取り出す。部品の継ぎ目に自然なフィレット（丸み）が付き、
実物の模型のように一体成形された形になる。

そのあと Blender で
  - ポリゴンを間引き（Decimate）
  - 部品ごとに UV を割り当て（円筒投影・平面投影）
  - 円盤部を遮蔽物として置き、環境遮蔽（AO）を頂点カラーに焼き込み
  - public/models/ship-hull.glb に書き出し

座標は three.js と同じ（Y が上、前方が -Z、全長およそ 1）。
寸法は src/components/ship/ShipModel.tsx の定数と合わせてある。

実行（Blender の Python モジュール bpy が入った Python 3.13 で）:
  python -m venv .venv && .venv/bin/pip install bpy scikit-image
  .venv/bin/python tools/blender/build_hull.py
"""

import math
import os
import sys
import time

import numpy as np
from scipy.spatial import cKDTree
from skimage import measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'ship-hull.glb')
VOXEL = float(os.environ.get('VOXEL', '0.0016'))

# ---- ShipModel.tsx と同じ寸法 -------------------------------------------------
SAUCER = [
    (0, -0.13), (0.05, -0.13), (0.1, -0.124), (0.16, -0.11), (0.3, -0.09), (0.5, -0.072), (0.75, -0.05),
    (0.92, -0.032), (0.985, -0.018), (1.0, -0.003), (0.985, 0.01), (0.92, 0.022), (0.75, 0.04),
    (0.5, 0.062), (0.25, 0.085), (0.11, 0.105), (0.075, 0.12), (0.05, 0.134), (0, 0.136),
]
SECONDARY = [
    (0, 0), (0.042, 0.001), (0.054, 0.014), (0.062, 0.05), (0.064, 0.15), (0.06, 0.3), (0.052, 0.4),
    (0.042, 0.46), (0.028, 0.5), (0, 0.512),
]
NACELLE = [
    (0, 0), (0.024, 0.004), (0.033, 0.018), (0.037, 0.045), (0.038, 0.12), (0.038, 0.36), (0.035, 0.4),
    (0.028, 0.425), (0.013, 0.435), (0, 0.437),
]
SAUCER_SCALE = (0.32, 0.32, 0.29)
SAUCER_POS = (0, 0.07, -0.17)
SECONDARY_Y = -0.085
SECONDARY_H = 0.8  # 副船体の断面の高さ／幅
NACELLE_X = 0.2
NACELLE_Y = 0.068
NACELLE_Z = 0.14
NACELLE_H = 0.62


def catmull_rom(points, samples=400):
    """three.js の SplineCurve と同じ一様 Catmull-Rom で断面をなめらかにする"""
    p = np.array(points, dtype=np.float64)
    n = len(p)
    out = []
    for t in np.linspace(0, 1, samples):
        f = (n - 1) * t
        i = min(int(f), n - 2)
        w = f - i
        p0, p1 = p[max(i - 1, 0)], p[i]
        p2, p3 = p[min(i + 1, n - 1)], p[min(i + 2, n - 1)]
        v0, v1 = (p2 - p0) * 0.5, (p3 - p1) * 0.5
        out.append((2 * p1 - 2 * p2 + v0 + v1) * w**3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * w**2 + v0 * w + p1)
    return np.array(out)


def radius_fn(profile):
    """断面を「軸方向の位置 a → 半径 r」の関数（内外判定用）と、密な点列（距離計算用）にする"""
    s = catmull_rom(profile, 4000)
    r = np.maximum(s[:, 0], 0)
    a = np.maximum.accumulate(s[:, 1])
    keep = np.concatenate([[True], np.diff(a) > 1e-7])
    return a[keep], r[keep], cKDTree(np.stack([r, s[:, 1]], axis=1))


def revolved(rho, axial, fn):
    """回転体の符号付き距離。rho は断面方向の正規化半径、axial は軸方向の位置。
    距離は断面の点列への最近傍で求める（平らな前面などでも正しく出る）"""
    a, r, tree = fn
    shape = rho.shape
    d, _ = tree.query(np.stack([rho.ravel(), axial.ravel()], axis=1), workers=-1)
    d = d.reshape(shape)
    inside = (rho < np.interp(axial, a, r)) & (axial > a[0]) & (axial < a[-1])
    return np.where(inside, -d, d)


def smin(d1, d2, k):
    h = np.maximum(k - np.abs(d1 - d2), 0) / k
    return np.minimum(d1, d2) - h * h * k * 0.25


SEC_FN = radius_fn(SECONDARY)
NAC_FN = radius_fn(NACELLE)


def secondary_sdf(x, y, z):
    yy = y - SECONDARY_Y
    # 下側ほど細くして竜骨（キール）のような断面に
    keel = 1 + 0.35 * np.clip(-yy / (0.05), 0, 1)
    xs = np.abs(x) * keel
    p = 2.4
    rho = (xs**p + (np.abs(yy) / SECONDARY_H) ** p) ** (1 / p)
    return revolved(rho, z, SEC_FN) * SECONDARY_H


def nacelle_sdf(x, y, z, side):
    xx = x - side * NACELLE_X
    yy = y - NACELLE_Y
    rho = np.sqrt(xx * xx + (yy / NACELLE_H) ** 2)
    return revolved(rho, z - NACELLE_Z, NAC_FN) * NACELLE_H


def round_rect(px, pz, hx, hz, r):
    qx = np.abs(px) - hx + r
    qz = np.abs(pz) - hz + r
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qz, 0) ** 2) + np.minimum(np.maximum(qx, qz), 0) - r


# 首：下（副船体の中）から上（円盤の中）へ、前に傾きながら少し幅を増す
NECK_Y0, NECK_Y1 = -0.07, 0.06
NECK_VIS0, NECK_VIS1 = -0.034, 0.03


def neck_sdf(x, y, z):
    t = np.clip((y - NECK_VIS0) / (NECK_VIS1 - NECK_VIS0), -0.6, 1.6)
    zc = 0.115 - 0.075 * t
    hx = 0.018 + 0.011 * t
    hz = 0.08 - 0.004 * t
    d2 = round_rect(x, z - zc, hx, hz, 0.014)
    ym = (NECK_Y0 + NECK_Y1) / 2
    hy = (NECK_Y1 - NECK_Y0) / 2
    wy = np.abs(y - ym) - hy
    return np.minimum(np.maximum(d2, wy), 0) + np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(wy, 0) ** 2)


# パイロン：副船体の後ろ寄りの肩から、外・上・後ろへ伸びてナセルの下につながる
def pylon_frame(side):
    a = np.array([side * 0.035, SECONDARY_Y + 0.022, 0.33])
    b = np.array([side * (NACELLE_X - 0.012), NACELLE_Y - 0.008, 0.375])
    u = (b - a) / np.linalg.norm(b - a)
    chord = np.array([0, 0, 1.0])
    chord -= u * chord.dot(u)
    chord /= np.linalg.norm(chord)
    thick = np.cross(u, chord)
    return a, b, u, chord, thick


def pylon_sdf(x, y, z, side):
    a, b, u, chord, thick = pylon_frame(side)
    length = np.linalg.norm(b - a)
    px, py, pz = x - a[0], y - a[1], z - a[2]
    s = px * u[0] + py * u[1] + pz * u[2]
    c = px * chord[0] + py * chord[1] + pz * chord[2]
    t = px * thick[0] + py * thick[1] + pz * thick[2]
    f = np.clip(s / length, 0, 1)
    half_chord = 0.042 - 0.012 * f  # 付け根が太く、先が細い
    c = c + 0.012 * f  # 先端に向かって後ろへ流す
    thickness = 0.0065 - 0.0015 * f
    # 断面は両端の丸い細長い形（翼のような板）
    d2 = np.sqrt(t * t + np.maximum(np.abs(c) - half_chord, 0) ** 2) - thickness
    w = np.abs(s - length / 2) - length / 2 - 0.02
    return np.minimum(np.maximum(d2, w), 0) + np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(w, 0) ** 2)


def saucer_lower():
    """円盤下面の高さを「楕円で正規化した半径 → 高さ」の関数にする"""
    pts = catmull_rom(SAUCER, 600)
    rim = int(np.argmax(pts[:, 0]))
    low = pts[: rim + 1]
    r = np.maximum.accumulate(np.maximum(low[:, 0], 0))
    keep = np.concatenate([[True], np.diff(r) > 1e-7])
    return r[keep], low[keep, 1] * SAUCER_SCALE[1] + SAUCER_POS[1]


SAUCER_LOW = saucer_lower()
SKIN = 0.0015  # 首のフィレットは円盤の外板よりこれだけ内側で止める


def saucer_sdf(x, y, z):
    """円盤の下面からの距離（近似、正が下側＝外）。外板より SKIN だけ内側にずらす"""
    rho = np.sqrt((x / SAUCER_SCALE[0]) ** 2 + ((z - SAUCER_POS[2]) / SAUCER_SCALE[2]) ** 2)
    ylow = np.interp(rho, *SAUCER_LOW)
    return np.maximum(ylow + SKIN - y, (rho - 1) * SAUCER_SCALE[2])


NECK_FILLET = 0.02


def neck_with_fillet(x, y, z):
    """首と円盤下面をなめらかにつなぐ。フィレットの外側は円盤の中に隠れるよう切り落とす"""
    neck = neck_sdf(x, y, z)
    blend = smin(neck, saucer_sdf(x, y, z), NECK_FILLET)
    return np.maximum(blend, neck - NECK_FILLET)


def parts_sdf(x, y, z):
    """部品ごとの距離（どの部品の面かを決めるのに使う）"""
    return {
        'hull': secondary_sdf(x, y, z),
        'neck': neck_with_fillet(x, y, z),
        'pylonL': pylon_sdf(x, y, z, -1),
        'pylonR': pylon_sdf(x, y, z, 1),
        'nacelleL': nacelle_sdf(x, y, z, -1),
        'nacelleR': nacelle_sdf(x, y, z, 1),
    }


def field(x, y, z):
    p = parts_sdf(x, y, z)
    d = smin(p['hull'], p['neck'], 0.03)
    for side in ('L', 'R'):
        pyl = p['pylon' + side]
        d = smin(d, pyl, 0.018)
        d = smin(d, p['nacelle' + side], 0.012)
    return d


def build_field():
    lo = np.array([-0.26, -0.17, -0.03])
    hi = np.array([0.26, 0.12, 0.6])
    n = np.ceil((hi - lo) / VOXEL).astype(int) + 1
    print(f'grid {n} = {n.prod() / 1e6:.1f}M voxels', flush=True)
    xs = lo[0] + np.arange(n[0]) * VOXEL
    ys = lo[1] + np.arange(n[1]) * VOXEL
    zs = lo[2] + np.arange(n[2]) * VOXEL
    vol = np.empty(n, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    for k, zv in enumerate(zs):
        vol[:, :, k] = field(X, Y, np.full_like(X, zv))
    return vol, lo


def extract():
    t = time.time()
    vol, lo = build_field()
    print(f'field {time.time() - t:.1f}s', flush=True)
    verts, faces, normals, _ = measure.marching_cubes(vol, 0.0, spacing=(VOXEL,) * 3, allow_degenerate=False)
    verts += lo
    print(f'marching cubes: {len(verts)} verts {len(faces)} faces ({time.time() - t:.1f}s)', flush=True)
    return verts, faces


# ---- Blender -----------------------------------------------------------------
import bpy  # noqa: E402
import bmesh  # noqa: E402


def to_blender(v):
    """three.js (x, y, z) → Blender (x, -z, y)"""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1)


def from_blender(v):
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mesh(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    vb = to_blender(verts).astype(np.float32)
    mesh.vertices.add(len(vb))
    mesh.vertices.foreach_set('co', vb.ravel())
    f = faces.astype(np.int32)
    mesh.loops.add(len(f) * 3)
    mesh.loops.foreach_set('vertex_index', f.ravel())
    mesh.polygons.add(len(f))
    mesh.polygons.foreach_set('loop_start', np.arange(0, len(f) * 3, 3, dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def decimate(obj, ratio):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = True


def saucer_occluder():
    """AO を焼くときの遮蔽物として円盤を置く（書き出さない）"""
    s = catmull_rom(SAUCER, 200)
    seg = 96
    verts, faces = [], []
    for i in range(seg):
        ang = 2 * math.pi * i / seg
        for r, y in s:
            verts.append((r * math.sin(ang) * SAUCER_SCALE[0] + SAUCER_POS[0], y * SAUCER_SCALE[1] + SAUCER_POS[1],
                          r * math.cos(ang) * SAUCER_SCALE[2] + SAUCER_POS[2]))
    m = len(s)
    for i in range(seg):
        j = (i + 1) % seg
        for k in range(m - 1):
            faces.append((i * m + k, j * m + k, j * m + k + 1, i * m + k + 1))
    mesh = bpy.data.meshes.new('saucer')
    mesh.from_pydata([tuple(v) for v in to_blender(np.array(verts))], [], faces)
    obj = bpy.data.objects.new('saucer', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


PART_MATERIAL = {'hull': 'Hull', 'neck': 'Hull', 'pylonL': 'Hull', 'pylonR': 'Hull', 'nacelleL': 'Nacelle', 'nacelleR': 'Nacelle'}


def part_uv(part, p):
    """部品ごとの UV。円筒投影は継ぎ目を真下に置く"""
    x, y, z = p
    if part in ('hull', 'neck'):
        if part == 'neck':
            return (z * 1.6, (y - SECONDARY_Y) * 1.6)
        u = math.atan2(x, (y - SECONDARY_Y) / SECONDARY_H) / (2 * math.pi) + 0.5
        return (u, 1 - z / SECONDARY[-1][1])
    if part.startswith('nacelle'):
        side = -1 if part.endswith('L') else 1
        u = math.atan2(x - side * NACELLE_X, (y - NACELLE_Y) / NACELLE_H) / (2 * math.pi) + 0.5
        return (u, 1 - (z - NACELLE_Z) / NACELLE[-1][1])
    # パイロン：翼弦方向と翼幅方向の平面投影
    side = -1 if part.endswith('L') else 1
    a, b, u_, chord, thick = pylon_frame(side)
    d = np.array(p) - a
    return (0.5 + d.dot(chord) * 4, d.dot(u_) * 4)


def assign_parts_and_uvs(obj):
    mesh = obj.data
    mats = {}
    for name in ('Hull', 'Nacelle'):
        mat = bpy.data.materials.new(name)
        mesh.materials.append(mat)
        mats[name] = len(mesh.materials) - 1

    n = len(mesh.polygons)
    centers = np.empty(n * 3, dtype=np.float32)
    mesh.polygons.foreach_get('center', centers)
    c = from_blender(centers.reshape(-1, 3))
    dists = parts_sdf(c[:, 0], c[:, 1], c[:, 2])
    names = list(dists.keys())
    owner = np.argmin(np.stack([dists[k] for k in names]), axis=0)
    mat_index = np.array([mats[PART_MATERIAL[names[o]]] for o in owner], dtype=np.int32)
    mesh.polygons.foreach_set('material_index', mat_index)

    uv = mesh.uv_layers.new(name='UVMap')
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', co)
    co = from_blender(co.reshape(-1, 3))
    loop_vert = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loop_vert)
    uvs = np.empty((len(mesh.loops), 2), dtype=np.float32)
    for pi, poly in enumerate(mesh.polygons):
        part = names[owner[pi]]
        idx = range(poly.loop_start, poly.loop_start + poly.loop_total)
        face_uv = [part_uv(part, co[loop_vert[li]]) for li in idx]
        # 円筒投影の継ぎ目をまたぐ面は u をそろえる
        us = [u for u, _ in face_uv]
        if max(us) - min(us) > 0.5:
            face_uv = [(u + 1 if u < 0.5 else u, v) for u, v in face_uv]
        for li, val in zip(idx, face_uv):
            uvs[li] = val
    uv.data.foreach_set('uv', uvs.ravel())


AO_FLOOR = 0.35


def bake_ao(obj, occluders):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('AO_SAMPLES', '96'))
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = 0.12  # これより遠い面は遮蔽とみなさない
    attr = obj.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
    obj.data.color_attributes.active_color = attr
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    t = time.time()
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    print(f'AO bake {time.time() - t:.1f}s', flush=True)
    # 焼いた AO をそのまま掛けると暗すぎるので、明るい側に寄せて陰影だけを残す
    col = np.empty(len(attr.data) * 4, dtype=np.float32)
    attr.data.foreach_get('color', col)
    col = col.reshape(-1, 4)
    ao = col[:, 0]
    print('AO raw min/mean/max', ao.min(), ao.mean(), ao.max(), flush=True)
    soft = AO_FLOOR + (1 - AO_FLOOR) * ao
    col[:, 0] = col[:, 1] = col[:, 2] = soft
    col[:, 3] = 1
    attr.data.foreach_set('color', col.ravel())


def export(obj, occluders):
    for o in occluders:
        bpy.data.objects.remove(o)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=True,
        export_vertex_color='ACTIVE',
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_yup=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


def main():
    verts, faces = extract()
    reset_scene()
    obj = make_mesh('EngineeringHull', verts, faces)
    target = int(os.environ.get('TRIS', '160000'))
    decimate(obj, min(1.0, target / len(faces)))
    print('after decimate', len(obj.data.polygons), 'faces', flush=True)
    assign_parts_and_uvs(obj)
    saucer = saucer_occluder()
    bake_ao(obj, [saucer])
    export(obj, [saucer])


if __name__ == '__main__':
    sys.exit(main())
