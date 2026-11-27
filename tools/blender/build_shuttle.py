"""
スペースシャトルのオービター（外側）を Blender で組み立てて書き出す。この段階では「乗員室の窓から見える所」用：
開いた荷物室（扉と放熱板・縁）、左の縁にたたんだロボットアーム、尾翼と OMS ポッド、主翼、機首の上面、エンジン。
窓の所は外板に穴を開けておく（乗員室の窓から外が見えるように）。

座標は乗員室と同じ（build_shuttle_cabin.py）：m、X 右、Y 前、Z 上、原点はミッドデッキの床・乗員室の後ろの壁。
動く部品は別の物にして、原点を蝶番・関節に置く（段階 2 でそのまま動かせる）：
  door_{port,stbd}_{fwd,aft}（荷物室の扉、Y 軸まわり）、rms_yaw → rms_pitch → rms_upper → rms_elbow → rms_lower → rms_wrist（アーム）、
  elevon_{l,r}_{in,out}、body_flap、rudder、ssme_{1,2,3}、oms_{l,r}
書き出すとき関節はすべて 0（扉は閉じ、アームはたたむ）。アプリが開く。

環境変数：
  EXPORT=1     public/models/shuttle-orbiter.glb
  PREVIEW=1    確認の絵（PREVIEW_DIR）
  COMPARE=1    NASA 3D Resources の Space Shuttle (A)・(D) と並べた比較（s0-exterior-compare.png）。NASA のファイルは引数で渡す：
               … build_shuttle.py -- "<A.glb>" "<D.glb>"
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'shuttle-orbiter.glb'))
PI = math.pi

# ---- 寸法（cabin.md の「外」） ---------------------------------------------------------------
BAY_Y0, BAY_Y1 = -0.6, -18.9  # 荷物室（長さ 18.3 m）
BAY_R = 2.32  # 荷物室の半径（直径 4.6 m）
BAY_ZC = 1.70  # 荷物室の中心の高さ
SILL_Z = 2.00  # 扉の蝶番の高さ
SKIN_HW = 2.65  # 胴の半分の幅
BELLY_Z = -1.55
ARM_SHOULDER = Vector((-2.45, -1.2, 2.25))
ARM_UPPER, ARM_LOWER = 6.4, 7.1
HUBBLE_Y = -15.2  # ハッブルを立てて置く所（荷物室の後ろ）

# 機首の外板の断面（Y, 半幅, 下, 上, 上の角の丸み, 下の角の丸み）
NOSE_SECTIONS = [
    (-0.62, SKIN_HW, BELLY_Z, 4.72, 1.6, 0.9),
    (2.4, SKIN_HW, BELLY_Z, 4.78, 1.6, 0.9),
    (3.6, 2.55, BELLY_Z, 4.45, 1.6, 0.9),
    (4.5, 2.40, -1.45, 3.92, 1.5, 0.9),
    (5.6, 2.15, -1.30, 2.95, 1.4, 0.9),
    (7.0, 1.60, -0.95, 1.95, 1.1, 0.8),
    (8.2, 0.95, -0.55, 1.05, 0.7, 0.6),
    (8.9, 0.30, -0.05, 0.45, 0.25, 0.22),
]


def lin(h):
    c = tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


MATS = {}


def mat(name, color, rough=0.7, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    MATS[name] = m
    return m


def materials():
    mat('tile_white', '#e8e6df', 0.8)
    mat('tile_black', '#1d1e20', 0.85)
    mat('liner', '#d8d6cf', 0.9)
    mat('radiator', '#c9ccce', 0.35, 0.3)
    mat('sill', '#9c9e9e', 0.6)
    mat('arm', '#e4e2da', 0.6)
    mat('arm_joint', '#7d8186', 0.5, 0.4)
    mat('engine', '#4b4d50', 0.45, 0.7)
    mat('rcc', '#5a5c5f', 0.7)
    mat('gold', '#c9a24a', 0.4, 0.8)


def obj(name, bm, material, parent=None, origin=None):
    if origin is not None:
        bmesh.ops.translate(bm, vec=-Vector(origin), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if isinstance(material, str):
        o.data.materials.append(MATS[material])
    else:
        for m in material:
            o.data.materials.append(MATS[m])
    if origin is not None:
        o.location = Vector(origin)
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


def ring_pts(hw, zb, zt, rt, rb, n=6):
    pts = []

    def arc(cx, cz, r, a0, a1):
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    arc(-hw + rb, zb + rb, rb, PI, 1.5 * PI)
    arc(hw - rb, zb + rb, rb, 1.5 * PI, 2 * PI)
    arc(hw - rt, zt - rt, rt, 0, 0.5 * PI)
    arc(-hw + rt, zt - rt, rt, 0.5 * PI, PI)
    return pts


def loft(sections, cap0=False, cap1=True):
    bm = bmesh.new()
    rings = []
    for y, hw, zb, zt, rt, rb in sections:
        rings.append([bm.verts.new((x, y, z)) for x, z in ring_pts(hw, zb, zt, rt, rb)])
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def sweep_y(profile, y0, y1, closed=False):
    """断面（X, Z の列）を Y 方向にのばす（荷物室の壁・扉）"""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in profile]
    b = [bm.verts.new((x, y1, z)) for x, z in profile]
    n = len(profile)
    for k in range(n if closed else n - 1):
        k2 = (k + 1) % n
        bm.faces.new((a[k], a[k2], b[k2], b[k]))
    return bm


def box_bm(size, center, bm=None):
    bm = bm or bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=r['verts'])
    bmesh.ops.translate(bm, vec=center, verts=r['verts'])
    return bm


def cyl_bm(r1, r2, h, M, seg=16, bm=None):
    bm = bm or bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.transform(bm, matrix=M @ Matrix.Translation((0, 0, h / 2)), verts=r['verts'])
    return bm


def prism_y(poly, y0, y1, bm=None):
    """平面形（X, Y の列）に厚みを付けた板（主翼）: poly は (x, y) で、z0〜z1"""
    raise NotImplementedError


def wing(side):
    """主翼（三角翼）：平面形の多角形に厚み。前縁は灰色（RCC）"""
    s = side
    plan = [(2.6, -5.5), (4.2, -11.0), (11.9, -21.8), (11.9, -23.6), (2.6, -24.4)]
    bm = bmesh.new()
    top = [bm.verts.new((s * x, y, -0.95 - 0.03 * (x - 2.6))) for x, y in plan]
    bot = [bm.verts.new((s * x, y, -1.45 + 0.01 * (x - 2.6))) for x, y in plan]
    n = len(plan)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((top[k], bot[k], bot[k2], top[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj(f'wing_{"l" if s < 0 else "r"}', bm, ['tile_white'])
    # 下面は黒いタイル：下向きの面だけ黒に
    o.data.materials.append(MATS['tile_black'])
    for p in o.data.polygons:
        if p.normal.z < -0.3:
            p.material_index = 1
    # 前縁（灰色の帯）
    bm = bmesh.new()
    for (x0, y0), (x1, y1) in zip(plan[:3], plan[1:4]):
        a = Vector((s * x0, y0, -1.2))
        b = Vector((s * x1, y1, -1.2 - 0.02 * (x1 - 2.6)))
        d = (b - a)
        M = Matrix.Translation(a) @ d.to_track_quat('Z', 'X').to_matrix().to_4x4()
        cyl_bm(0.26, 0.24, d.length, M, seg=8, bm=bm)
    obj(f'wing_le_{"l" if s < 0 else "r"}', bm, 'rcc')
    # 補助翼（エレボン 2 枚）：原点は前の縁（蝶番）
    for i, (xa, xb) in enumerate(((3.0, 7.2), (7.4, 11.6))):
        bm = box_bm((xb - xa, 1.3, 0.3), (s * (xa + xb) / 2, -24.4 - 0.62 + 0.0, -1.22))
        obj(f'elevon_{"l" if s < 0 else "r"}_{"in" if i == 0 else "out"}', bm, 'tile_white', origin=(s * (xa + xb) / 2, -24.3, -1.22))


def build():
    materials()
    # 機首（乗員室を包む外板）。窓の所に穴
    bm = loft(NOSE_SECTIONS, cap0=False, cap1=True)
    nose = obj('nose', bm, ['tile_white', 'tile_black'])
    for p in nose.data.polygons:
        # 下面と、窓のまわりの黒いタイル（機首の上の前半分）
        if p.normal.z < -0.25 or (p.center.y > 3.4 and p.center.z > 1.0) or p.center.y > 7.6:
            p.material_index = 1
    cut_windows(nose)
    # 荷物室：外板の U 字と、白い内張り、縁
    skin = [(-SKIN_HW, SILL_Z)] + [(-SKIN_HW + 0.9 - 0.9 * math.cos(a), BELLY_Z + 0.9 - 0.9 * math.sin(a)) for a in [PI / 2 * (1 - i / 6) for i in range(7)]][::1]
    skin = [(-SKIN_HW, SILL_Z), (-SKIN_HW, BELLY_Z + 0.9)] + [(-SKIN_HW + 0.9 - 0.9 * math.cos(PI / 2 * i / 6), BELLY_Z + 0.9 - 0.9 * math.sin(PI / 2 * i / 6)) for i in range(1, 7)]
    skin = skin + [(-x, z) for x, z in reversed(skin)]
    bm = sweep_y(skin, BAY_Y0, BAY_Y1)
    o = obj('mid_skin', bm, ['tile_white', 'tile_black'])
    for p in o.data.polygons:
        if p.normal.z < -0.3 or p.center.z < -0.4:
            p.material_index = 1
    liner = [(-BAY_R, SILL_Z)] + [(BAY_R * math.cos(PI + PI * i / 16), BAY_ZC + BAY_R * math.sin(PI + PI * i / 16)) for i in range(17)] + [(BAY_R, SILL_Z)]
    bm = sweep_y(liner, BAY_Y0, BAY_Y1)
    obj('bay_liner', bm, 'liner')
    for s in (-1, 1):
        bm = box_bm((SKIN_HW - BAY_R + 0.02, BAY_Y0 - BAY_Y1, 0.12), (s * (SKIN_HW + BAY_R) / 2, (BAY_Y0 + BAY_Y1) / 2, SILL_Z - 0.06))
        obj(f'sill_{"l" if s < 0 else "r"}', bm, 'sill')
    # 荷物室の前と後ろの壁（白）
    for y, sgn in ((BAY_Y0, 1), (BAY_Y1, -1)):
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, z)) for x, z in liner]
        bm.faces.new(vs)
        obj('bay_wall', bm, 'liner')
    # 荷物室の扉（各側 2 枚、原点は蝶番）。内側に放熱板
    for s, side in ((-1, 'port'), (1, 'stbd')):
        for i, (ya, yb) in enumerate(((BAY_Y0, (BAY_Y0 + BAY_Y1) / 2), ((BAY_Y0 + BAY_Y1) / 2, BAY_Y1))):
            hinge = Vector((s * SKIN_HW, 0, SILL_Z))
            prof_out = [(s * (SKIN_HW - (SKIN_HW) * (1 - math.cos(PI / 2 * j / 10))), SILL_Z + (SKIN_HW + 0.0) * math.sin(PI / 2 * j / 10) * 0.95) for j in range(11)]
            prof_in = [(x - s * 0.12 * (1 - j / 10), z - 0.12) for j, (x, z) in enumerate(prof_out)]
            bm = sweep_y(prof_out, ya, yb)
            sweep_in = sweep_y(list(reversed(prof_in)), ya, yb)
            me_tmp = bpy.data.meshes.new('t')
            sweep_in.to_mesh(me_tmp)
            sweep_in.free()
            bm.from_mesh(me_tmp)
            bpy.data.meshes.remove(me_tmp)
            name = f'door_{side}_{"fwd" if i == 0 else "aft"}'
            o = obj(name, bm, ['tile_white', 'radiator'], origin=(hinge.x, (ya + yb) / 2, hinge.z))
            for p in o.data.polygons:
                # 内側の面（放熱板）
                c = p.center + o.location
                if abs(c.x) < SKIN_HW - 0.05 and (Vector((0, 0, BAY_ZC + 0.3)) - c).dot(p.normal) > 0:
                    p.material_index = 1
    # 後ろの胴と OMS ポッド、尾翼
    bm = box_bm((2 * SKIN_HW, 5.6, 3.6), (0, BAY_Y1 - 2.8, 0.25))
    obj('aft_body', bm, ['tile_white'])
    for s in (-1, 1):
        bm = loft([(BAY_Y1 + 0.6, 0.9, 1.6, 3.3, 0.8, 0.5), (BAY_Y1 - 3.0, 1.0, 1.4, 3.6, 0.9, 0.5), (BAY_Y1 - 6.3, 0.8, 1.6, 3.2, 0.7, 0.4)], cap0=True)
        bmesh.ops.translate(bm, vec=(s * 1.75, 0, 0), verts=bm.verts)
        obj(f'oms_pod_{"l" if s < 0 else "r"}', bm, ['tile_white'])
        bm = cyl_bm(0.32, 0.55, 1.2, Matrix.Translation((s * 1.75, BAY_Y1 - 6.2, 2.45)) @ Matrix.Rotation(PI / 2, 4, 'X'), seg=12)
        obj(f'oms_{"l" if s < 0 else "r"}', bm, 'engine', origin=(s * 1.75, BAY_Y1 - 6.2, 2.45))
    # 尾翼（後退した台形）と、後ろの縁の方向舵（2 枚に割れてスピードブレーキ）
    fin = [(BAY_Y1 - 0.8, 2.4), (BAY_Y1 - 6.0, 2.4), (BAY_Y1 - 8.3, 12.4), (BAY_Y1 - 6.4, 12.4)]
    bm = bmesh.new()
    a = [bm.verts.new((-0.22, y, z)) for y, z in fin]
    b = [bm.verts.new((0.22, y, z)) for y, z in fin]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for k in range(4):
        k2 = (k + 1) % 4
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj('fin', bm, 'tile_white')
    bm = bmesh.new()
    rud = [(BAY_Y1 - 6.0, 3.6), (BAY_Y1 - 7.6, 3.6), (BAY_Y1 - 8.25, 12.2), (BAY_Y1 - 7.3, 12.2)]
    a = [bm.verts.new((-0.16, y, z)) for y, z in rud]
    b = [bm.verts.new((0.16, y, z)) for y, z in rud]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for k in range(4):
        k2 = (k + 1) % 4
        bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj('rudder', bm, 'tile_white', origin=(0, BAY_Y1 - 6.0, 3.6))
    # 主エンジン 3 基と、ボディフラップ
    for i, (x, z) in enumerate(((0, 2.0), (-1.35, 0.25), (1.35, 0.25))):
        M = Matrix.Translation((x, BAY_Y1 - 5.6, z)) @ Matrix.Rotation(PI / 2, 4, 'X')
        bm = cyl_bm(0.55, 1.15, 3.0, M, seg=20)
        bm = cyl_bm(0.5, 0.5, 0.6, M @ Matrix.Translation((0, 0, -0.5)), seg=12, bm=bm)
        obj(f'ssme_{i + 1}', bm, 'engine', origin=(x, BAY_Y1 - 5.6, z))
    bm = box_bm((4.3, 2.0, 0.35), (0, BAY_Y1 - 6.4, -1.3))
    obj('body_flap', bm, 'tile_black', origin=(0, BAY_Y1 - 5.5, -1.3))
    wing(-1)
    wing(1)
    build_arm()


def build_arm():
    """ロボットアーム（左の縁にたたむ）。親子：rms_yaw → rms_pitch → 上腕 → rms_elbow → 下腕 → rms_wrist → 先"""
    root = obj('rms_base', box_bm((0.5, 0.6, 0.5), ARM_SHOULDER + Vector((0, 0, -0.15))), 'arm_joint')
    yaw = bpy.data.objects.new('rms_yaw', None)
    yaw.location = ARM_SHOULDER
    bpy.context.collection.objects.link(yaw)
    pitch = bpy.data.objects.new('rms_pitch', None)
    bpy.context.collection.objects.link(pitch)
    pitch.parent = yaw
    pitch.location = (0, 0, 0)
    # 上腕：肩から後ろ（−Y）へ
    bm = cyl_bm(0.19, 0.19, ARM_UPPER - 0.5, Matrix.Translation((0, -0.35, 0)) @ Matrix.Rotation(PI / 2, 4, 'X'), seg=14)
    box_bm((0.5, 0.6, 0.5), (0, 0, 0), bm)
    up = obj('rms_upper', bm, 'arm')
    up.parent = pitch
    elbow = bpy.data.objects.new('rms_elbow', None)
    bpy.context.collection.objects.link(elbow)
    elbow.parent = pitch
    elbow.location = (0, -ARM_UPPER, 0)
    bm = cyl_bm(0.17, 0.17, ARM_LOWER - 0.6, Matrix.Translation((0, -0.3, 0)) @ Matrix.Rotation(PI / 2, 4, 'X'), seg=14)
    box_bm((0.45, 0.55, 0.45), (0, 0, 0), bm)
    lo = obj('rms_lower', bm, 'arm')
    lo.parent = elbow
    wrist = bpy.data.objects.new('rms_wrist', None)
    bpy.context.collection.objects.link(wrist)
    wrist.parent = elbow
    wrist.location = (0, -ARM_LOWER, 0)
    bm = box_bm((0.4, 0.5, 0.4), (0, 0, 0))
    cyl_bm(0.21, 0.21, 0.9, Matrix.Translation((0, -0.2, 0)) @ Matrix.Rotation(PI / 2, 4, 'X'), seg=14, bm=bm)
    ee = obj('rms_ee', bm, 'arm_joint')
    ee.parent = wrist
    # 肩・ひじの金色の断熱（写真の金色の帯）
    for parent, y in ((pitch, -0.1), (elbow, 0.0)):
        bm = cyl_bm(0.26, 0.26, 0.4, Matrix.Translation((0, y + 0.2, 0)) @ Matrix.Rotation(PI / 2, 4, 'X'), seg=14)
        g = obj(f'rms_band_{parent.name}', bm, 'gold')
        g.parent = parent


def cut_windows(nose):
    """乗員室の窓の前の外板に穴（乗員室のスクリプトから窓の位置をもらう）"""
    sys.path.insert(0, HERE)
    import build_shuttle_cabin as cab
    wins = cab.fd_window_frames()
    for x, y in cab.TOP_WIN:
        wins.append(('top', Vector((x, y, cab.FD_TOP)), Vector((0, 0, 1)), 0.51, 0.51, Vector((0, 1, 0))))
    wins.append(('side', cab.SIDE_HATCH.copy(), Vector((-1, 0, 0)), 0.32, 0.32, Vector((0, 0, 1))))
    for name, c, n, w, h, up in wins:
        bm = bmesh.new()
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w + 0.25, 6.0, h + 0.25), verts=r['verts'])
        right = up.cross(n)
        M = Matrix((right, n, up)).transposed().to_4x4()
        # 穴の箱は窓の面より 0.5 m 内側から始める（ちょうど窓の面で終わると、その面が外板に残った）
        M.translation = c + n * 2.5
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        me = bpy.data.meshes.new('cut')
        bm.to_mesh(me)
        bm.free()
        cut = bpy.data.objects.new('cut', me)
        bpy.context.collection.objects.link(cut)
        m = nose.modifiers.new('b', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = cut
        bpy.context.view_layer.objects.active = nose
        bpy.ops.object.select_all(action='DESELECT')
        nose.select_set(True)
        bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.data.objects.remove(cut, do_unlink=True)
    # 開いた筒の外板では穴あけ（boolean）が効かないことがあるので、窓から外へ向けた線が当たる面は消す
    # （外板の面は大きいので穴も大きくなるが、外から機首を見ることはない）
    import bmesh as _bm
    from mathutils.bvhtree import BVHTree
    bm = _bm.new()
    bm.from_mesh(nose.data)
    bm.transform(nose.matrix_world)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    hit = set()
    # 目の位置（席・後ろ・天井の窓の下）から、窓の各点を通る線
    eyes = [Vector(e) for e in ((0, 2.95, 3.5), (-0.58, 2.78, 3.4), (0.58, 2.78, 3.4), (0, 1.6, 3.6), (0, 0.8, 3.7), (-0.45, 1.25, 3.0), (0.45, 1.25, 3.0))]
    for name, c, n, w, h, up in wins:
        right = up.cross(n)
        for a in range(9):
            for b in range(9):
                q = c + right * (w * (a / 8 - 0.5)) + up * (h * (b / 8 - 0.5))
                for e in eyes:
                    dvec = q - e
                    if dvec.dot(n) <= 0.05:
                        continue
                    dvec.normalize()
                    o = e
                    for _ in range(4):
                        loc, nn, fi, dist = tree.ray_cast(o, dvec, 6.0)
                        if fi is None:
                            break
                        hit.add(fi)
                        o = loc + dvec * 0.002
    kill = [bm.faces[i] for i in hit]
    _bm.ops.delete(bm, geom=kill, context='FACES')
    bm.transform(nose.matrix_world.inverted())
    bm.to_mesh(nose.data)
    bm.free()
    print('nose faces removed in front of windows:', len(kill))


def setup_render(sc, w=1280, h=720, samples=32):
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.view_settings.view_transform = 'AgX'
    wd = bpy.data.worlds.new('w')
    wd.use_nodes = True
    wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.025, 0.04, 1)
    sc.world = wd
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(40), math.radians(-30), math.radians(30))
    bpy.context.collection.objects.link(sun)


def look(sc, eye, target, lens=35, name='cam'):
    cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, bpy.data.cameras.new(name))
    if cam.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(cam)
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 500
    sc.camera = cam


def compare(paths, out):
    """NASA の (A)・(D) と自作を同じ向きで描き、横に並べる"""
    from PIL import Image, ImageDraw
    imgs = []
    tmp = os.path.join(os.path.dirname(out), '_cmp')
    os.makedirs(tmp, exist_ok=True)
    for i, src in enumerate(paths + ['self']):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        if src == 'self':
            build()
            # 扉を開く（比べるとき）
            for o in bpy.data.objects:
                if o.name.startswith('door_'):
                    o.rotation_euler.y = math.radians(170) * (-1 if 'port' in o.name else 1)
        else:
            bpy.ops.import_scene.gltf(filepath=src)
            # 大きさと向きを合わせる：いちばん長い向きを 37 m に、+Y を前に
            objs = [o for o in bpy.data.objects if o.type == 'MESH']
            pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
            mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            size = mx - mn
            root = bpy.data.objects.new('root', None)
            bpy.context.collection.objects.link(root)
            for o in bpy.context.scene.objects:
                if o.parent is None and o is not root:
                    o.parent = root
            k = 37.2 / max(size)
            root.scale = (k, k, k)
            ax = max(range(3), key=lambda j: size[j])
            c = (mn + mx) / 2
            root.location = -c * k
            print('nasa model', src, 'size', tuple(round(v, 2) for v in size), 'long axis', ax)
        setup_render(sc, 960, 540, 24)
        if src == 'self':
            look(sc, (17, -30, 22), (0, -9, 1), lens=30)
        else:
            look(sc, (17, -21, 22), (0, 0, 1), lens=30)
        sc.render.filepath = os.path.join(tmp, f'{i}.png')
        bpy.ops.render.render(write_still=True)
        imgs.append(Image.open(sc.render.filepath).convert('RGB'))
    W, H = imgs[0].size
    sheet = Image.new('RGB', (W * len(imgs), H + 40), (12, 12, 14))
    d = ImageDraw.Draw(sheet)
    for i, (im, label) in enumerate(zip(imgs, ['NASA Space Shuttle (A)', 'NASA Space Shuttle (D)', 'self-built STAGE=1 (build_shuttle.py)'])):
        sheet.paste(im, (i * W, 40))
        d.text((i * W + 12, 12), label, fill=(230, 230, 230))
    sheet.save(out)
    print('wrote', out)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if os.environ.get('COMPARE'):
        compare(argv[:2], os.path.join(os.environ.get('PREVIEW_DIR', '/tmp'), 's0-exterior-compare.png'))
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build()
    sc = bpy.context.scene
    if os.environ.get('PREVIEW'):
        setup_render(sc)
        for o in bpy.data.objects:
            if o.name.startswith('door_'):
                o.rotation_euler.y = math.radians(170) * (-1 if 'port' in o.name else 1)
        out = os.environ.get('PREVIEW_DIR', '/tmp')
        for name, eye, tgt in (('hero', (17, -30, 22), (0, -9, 1)), ('aftwin', (0.3, 0.2, 3.72), (0, -15, 3.0)), ('top', (0, -9, 45), (0, -9, 0))):
            look(sc, eye, tgt, lens=18 if name == 'aftwin' else 30)
            sc.render.filepath = os.path.join(out, f's0-orbiter-{name}.png')
            bpy.ops.render.render(write_still=True)
        return
    if os.environ.get('EXPORT'):
        if bpy.context.window:
            bpy.context.window.scene = sc
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_normals=True,
                                  export_materials='EXPORT', export_cameras=False, export_lights=False, export_texcoords=False)
        tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', tris, 'tris')


if __name__ == '__main__':
    main()
