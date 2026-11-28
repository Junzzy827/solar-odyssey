# 段階 0：NASA の ISS 内部の FBX を読み、全部の物をモジュールに分けて調べる。
#   ISS_SRC=<FBX> WORK=/tmp/iss-work .venv/bin/python -I tools/iss/split_modules.py
# 書き出すもの：
#   tools/iss/modules.json            モジュールごとの範囲・真ん中・向き・となり（つなぎ目の位置）・三角形・材質・動く部品
#   $WORK/tex_src/<元の名前>.png       FBX に入っていた色の絵（元のまま。textures.py が WebP にする）
#   $WORK/weight.json                 材質ごとの使われ方（どのモジュールで何 m²、絵の何 % を使うか）→ weight_table.py
# FBX は信用しないデータとして読むだけ（このスクリプトは FBX のフォルダの外に置き、-I で動かす）
import bpy
import sys
import os
import json
import time
import collections
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iss_common as C  # noqa: E402
from mathutils import Vector  # noqa: E402

SRC = os.environ['ISS_SRC']
WORK = C.env('WORK', '/tmp/iss-work')
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(WORK, 'tex_src'), exist_ok=True)

t = time.time()
C.import_fbx(SRC)
print('import', round(time.time() - t, 1), 's')
origin = C.to_app_frame()
print('station origin (source units)', tuple(round(x, 3) for x in origin))

# ---- 色の絵を元のまま書き出す ---------------------------------------------------------------
images = {}
for mat in bpy.data.materials:
    img = C.diffuse_image(mat)
    if img is None:
        continue
    key = C.tex_key(img.name)
    images.setdefault(key, img)
for key, img in images.items():
    path = os.path.join(WORK, 'tex_src', f'{key}.png')
    if not os.path.exists(path):
        if img.packed_file:
            with open(path, 'wb') as f:
                f.write(img.packed_file.data)
        else:
            img.save(filepath=path)
    print('texture', key, tuple(img.size))

# ---- 物をモジュールに分ける ---------------------------------------------------------------------
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
unassigned = []
by_module = collections.defaultdict(list)
for o in meshes:
    m = C.module_of(o.name)
    if m is None:
        unassigned.append(o)
    else:
        by_module[m].append(o)


def box_of(objs):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in objs:
        a, b = C.world_bbox(o)
        for i in range(3):
            mn[i] = min(mn[i], a[i])
            mx[i] = max(mx[i], b[i])
    return mn, mx


# 名前で決まらない物（EXPRESS ラック・EDR2 など）は、真ん中が入るモジュールの箱で決める。
# 箱は大きな部品（300 三角形以上、つなぎ目以外）だけで作る（部屋の外まで広がった照明の板などを入れない）
core = {}
for mid, objs in by_module.items():
    big = [o for o in objs if C.tris_of(o) >= 300 and o.name not in C.CONNECTORS]
    core[mid] = box_of(big or objs)
for o in unassigned:
    a, b = C.world_bbox(o)
    c = (a + b) / 2
    best = None
    for mid, (mn, mx) in core.items():
        if all(mn[i] - 0.3 <= c[i] <= mx[i] + 0.3 for i in range(3)):
            vol = (mx - mn).x * (mx - mn).y * (mx - mn).z
            if best is None or vol < best[1]:
                best = (mid, vol)
    if best is None:
        print('UNASSIGNED', o.name)
        continue
    by_module[best[0]].append(o)


module_of_obj = {o.name: mid for mid, objs in by_module.items() for o in objs}


# ---- 材質ごとの面積（m²）と絵の上の面積（0..1）を数える --------------------------------------
def mesh_areas(o):
    me = o.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    if n == 0:
        return {}
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    M = np.array(o.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    tv = np.empty(n * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', tv)
    tl = np.empty(n * 3, np.int32)
    me.loop_triangles.foreach_get('loops', tl)
    mi = np.empty(n, np.int32)
    me.loop_triangles.foreach_get('material_index', mi)
    p = co[tv].reshape(n, 3, 3)
    wa = 0.5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)
    if me.uv_layers:
        uv = np.empty(len(me.loops) * 2, np.float32)
        me.uv_layers[0].data.foreach_get('uv', uv)
        q = uv.reshape(-1, 2)[tl].reshape(n, 3, 2)
        d1 = q[:, 1] - q[:, 0]
        d2 = q[:, 2] - q[:, 0]
        ua = 0.5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0])
    else:
        ua = np.zeros(n)
    out = {}
    for i, slot in enumerate(o.material_slots):
        sel = mi == i
        if not sel.any():
            continue
        name = slot.material.name if slot.material else '(none)'
        a = out.setdefault(name, [0.0, 0.0, 0])
        a[0] += float(wa[sel].sum())
        a[1] += float(ua[sel].sum())
        a[2] += int(sel.sum())
    return out


# ---- つながり（ハッチの位置）を見つける -----------------------------------------------------------
# 1. つなぎ目の物（Module_Connect.*）があるもの：その物の真ん中
# 2. 無いもの（キューポラ・BEAM・ビショップ）：2 つのモジュールの箱が 1 つの向きで接していたら、小さい方の箱の
#    接する面の真ん中（ハッチの穴の真ん中）
# 軸（axis）と向き（このモジュールから相手へ ±1）も書く。アプリはそこに幕（まだ読んでいない部屋）を置く
AXES = 'xyz'


def bcenter(o):
    a, b = C.world_bbox(o)
    return (a + b) / 2


def thin_axis(o):
    a, b = C.world_bbox(o)
    d = b - a
    return min(range(3), key=lambda i: d[i])


links = []  # {a, b, center(Blender), axis(0..2), connector}
for cname, (own, other) in C.CONNECTORS.items():
    o = bpy.data.objects[cname]
    links.append({'a': own, 'b': other, 'center': bcenter(o), 'axis': thin_axis(o), 'connector': cname})
ids = [m[0] for m in C.MODULES]
for i, ma in enumerate(ids):
    for mb in ids[i + 1:]:
        if any({l['a'], l['b']} == {ma, mb} for l in links):
            continue
        (amn, amx), (bmn, bmx) = core[ma], core[mb]
        for k in range(3):
            touch = abs(amx[k] - bmn[k]) < C.TOUCH_TOL or abs(bmx[k] - amn[k]) < C.TOUCH_TOL
            others = [j for j in range(3) if j != k]
            ov = [min(amx[j], bmx[j]) - max(amn[j], bmn[j]) for j in others]
            if touch and min(ov) > C.TOUCH_OVERLAP:
                # 小さい方の箱の、相手に接する面の真ん中
                va = (amx - amn).x * (amx - amn).y * (amx - amn).z
                vb = (bmx - bmn).x * (bmx - bmn).y * (bmx - bmn).z
                small, smn, smx, big = (ma, amn, amx, mb) if va < vb else (mb, bmn, bmx, ma)
                bc = (core[big][0] + core[big][1]) / 2
                c = (smn + smx) / 2
                c[k] = smx[k] if bc[k] > c[k] else smn[k]
                links.append({'a': ma, 'b': mb, 'center': c, 'axis': k, 'connector': None})
                print('found link', ma, mb, 'axis', AXES[k], tuple(round(v, 3) for v in c))
                break


def mod_center(mid):
    mn, mx = core[mid]
    return (mn + mx) / 2


def three_axis(k, sgn):
    """Blender の軸と向き → three の向き（x→x、y→−z、z→y）"""
    v = [0, 0, 0]
    v[k] = sgn
    return [v[0], v[2], -v[1]]


# ハッチの名前の向き → three の向き（ノード 1〜3・PMM・コロンバスなどは、名前の向きがアプリの向きと同じ）
NAME_DIR = {'fwd': [0, 0, -1], 'aft': [0, 0, 1], 'port': [-1, 0, 0], 'stbd': [1, 0, 0], 'zenith': [0, 1, 0], 'nadir': [0, -1, 0]}


def link_normal(l, mid):
    """つながりの口の向き（mid から外へ、three）"""
    k = l['axis']
    mc = mod_center(mid)
    return three_axis(k, 1 if l['center'][k] > mc[k] else -1)


def out_axis(o, mid):
    """外への口の向き（Blender の軸と ±1）。薄い物（閉じたハッチの板）はその薄い向き。厚い物（枠ごとの形）は、
    モジュールの真ん中からのずれが、モジュールの大きさに比べていちばん大きい向き"""
    a, b = C.world_bbox(o)
    d = sorted(b - a)
    mn, mx = core[mid]
    c = bcenter(o)
    mc = (mn + mx) / 2
    if d[0] < 0.35 * d[1]:
        k = thin_axis(o)
    else:
        k = max(range(3), key=lambda i: abs(c[i] - mc[i]) / max((mx[i] - mn[i]) / 2, 1e-3))
    return k, (1 if c[k] > mc[k] else -1)


# ハッチの物（開いた形・閉じた形）を、つながり・外への口に振り分ける
#   つながっている口：開いた形だけ出す（閉じた形しか無ければ、開いた形を作る：C.SYNTH_HATCHES）
#   外への口（模型に無い所へ）：閉じた形だけ出す。札の種類は C.OUTER_KIND
#   どこにも当たらない開いたハッチ（クエストの中の仕切り）は、そのまま
drop = set()
synth = collections.defaultdict(list)
outer = collections.defaultdict(list)
hatch_of_link = {}
for mid in ids:
    hs = [o for o in by_module.get(mid, []) if C.is_hatch(o.name)]
    names = {o.name for o in hs}
    for o in hs:
        if o.name.endswith('_Closed'):
            continue
        # 閉じた形と組になっている開いた形は、閉じた形の方で決める
        if o.name + '_Closed' in names:
            continue
        # 開いた形だけ：近いつながり（1.8 m 以内）の開いたハッチ。開いたハッチは 2 つの口の間の角にあることがあり
        # （ノード 3）、近さだけでは決まらないので、名前の向き（Fwd・Aft…）と口の向きが合うものを先に選ぶ
        c = bcenter(o)
        near = [l for l in links if mid in (l['a'], l['b']) and l['b'] is not None and (l['center'] - c).length < 1.8]
        word = next((w for w in NAME_DIR if w in o.name.lower()), None)
        named = [l for l in near if word and link_normal(l, mid) == NAME_DIR[word]]
        pick = named[0] if named else (min(near, key=lambda l: (l['center'] - c).length) if near else None)
        if pick:
            hatch_of_link.setdefault(id(pick), []).append(o.name)
        else:
            print('internal hatch (kept open)', mid, o.name)
    for o in hs:
        if not o.name.endswith('_Closed'):
            continue
        c = bcenter(o)
        near = [l for l in links if mid in (l['a'], l['b']) and (l['center'] - c).length < 0.6]
        open_name = o.name[: -len('_Closed')]
        if near and near[0]['b'] is not None:
            # つながっている：開いた形を出す
            drop.add(o.name)
            if open_name in names:
                hatch_of_link.setdefault(id(near[0]), []).append(open_name)
            elif o.name in C.SYNTH_HATCHES:
                synth[mid].append(o.name)
                hatch_of_link.setdefault(id(near[0]), []).append(C.SYNTH_HATCHES[o.name]['name'])
                print('synth open hatch for', o.name)
            else:
                print('WARNING: connected but only closed', o.name)
        else:
            # 外への口：閉じた形を出し、開いた形は出さない
            if open_name in names:
                drop.add(open_name)
            k, sgn = out_axis(o, mid)
            outer[mid].append({'object': o.name, 'kind': C.OUTER_KIND.get(o.name, 'closed'), 'center': c, 'axis': k, 'dir': sgn})
            if o.name not in C.OUTER_KIND:
                print('WARNING: outer hatch without kind', o.name)
    for name in C.OUTER_EXTRA:
        o = bpy.data.objects.get(name)
        if o is not None and module_of_obj.get(name) == mid:
            k, sgn = out_axis(o, mid)
            outer[mid].append({'object': name, 'kind': C.OUTER_KIND[name], 'center': bcenter(o), 'axis': k, 'dir': sgn})
print('dropped hatch variants', sorted(drop))


mat_use = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0, 0.0, 0]))
modules = []
names = {m[0]: m[1] for m in C.MODULES}
for mid, _key, _p in C.MODULES:
    objs = by_module.get(mid, [])
    mn, mx = box_of([o for o in objs if not o.name.startswith('Node1_Int_Lights')] or objs)
    hidden = [o.name for o in objs if any(s.material and s.material.name in C.HIDE_MATERIALS for s in o.material_slots)]
    # 出さないハッチの形（つながっている口の閉じた形・外への口の開いた形）
    hidden += [o.name for o in objs if o.name in drop]
    tris = 0
    mats = collections.Counter()
    movable = []
    for o in objs:
        n = C.tris_of(o)
        if o.name in hidden:
            continue
        tris += n
        for name, (wa, ua, nt) in mesh_areas(o).items():
            u = mat_use[name][mid]
            u[0] += wa
            u[1] += ua
            u[2] += nt
            mats[name] += nt
        if C.is_movable(o.name):
            a, b = C.world_bbox(o)
            movable.append({
                'name': o.name,
                'origin': C.b2three(o.matrix_world.translation),
                'center': C.b2three((a + b) / 2),
                'closed': o.name.endswith('_Closed'),
                'tris': n,
            })
    size = mx - mn
    axis = 'xyz'[max(range(3), key=lambda i: size[i])]
    # ハッチ：つながり（to = 相手）と外への口（to = null、kind）。normal はこのモジュールから外へ向く向き（three）
    hatches = []
    mc = mod_center(mid)
    for l in links:
        if mid not in (l['a'], l['b']):
            continue
        to = l['b'] if mid == l['a'] else l['a']
        k = l['axis']
        sgn = 1 if l['center'][k] > mc[k] else -1
        h = {'id': f"{mid}>{to or 'out'}", 'connector': l['connector'], 'to': to, 'center': C.b2three(l['center']), 'normal': three_axis(k, sgn)}
        if to is None:
            # つなぎ目はあるが先が無い（ノード 2 の下）：閉じたハッチの札は outer の方で付ける
            continue
        h['hatchObjects'] = hatch_of_link.get(id(l), [])
        hatches.append(h)
    for i, oh in enumerate(outer.get(mid, [])):
        hatches.append({
            'id': f'{mid}>out{i}',
            'connector': None,
            'to': None,
            'kind': oh['kind'],
            'object': oh['object'],
            'center': C.b2three(oh['center']),
            'normal': three_axis(oh['axis'], oh['dir']),
        })
    modules.append({
        'id': mid,
        'key': names[mid],
        'bboxMin': C.b2three(Vector((mn.x, mn.y, mn.z))),
        'bboxMax': C.b2three(Vector((mx.x, mx.y, mx.z))),
        'center': C.b2three((mn + mx) / 2),
        # 長い向き（Blender の軸 → three の軸：x→x、y→−z、z→y）
        'axis': {'x': 'x', 'y': 'z', 'z': 'y'}[axis],
        'neighbours': sorted({h['to'] for h in hatches if h['to']}),
        'hatches': hatches,
        'synthHatches': synth.get(mid, []),
        'triangles': tris,
        'materials': dict(mats.most_common()),
        'objects': sorted(o.name for o in objs if o.name not in hidden),
        'hidden': hidden,
        'movable': movable,
    })
    print(f'{mid:9s} objs {len(objs):3d} tris {tris:7d} mats {len(mats):2d} movable {len(movable)} hidden {hidden}')

# three.js の箱は min/max の向きが Blender の y → −z で入れかわるので直す
for m in modules:
    a, b = m['bboxMin'], m['bboxMax']
    m['bboxMin'] = [min(a[i], b[i]) for i in range(3)]
    m['bboxMax'] = [max(a[i], b[i]) for i in range(3)]

mat_info = {}
for mat in bpy.data.materials:
    img = C.diffuse_image(mat)
    mat_info[mat.name] = {
        'texture': C.tex_key(img.name) if img else None,
        'textureSize': list(img.size) if img else None,
        'alpha': C.uses_alpha(mat),
        'emissive': C.emissive(mat),
        'hidden': mat.name in C.HIDE_MATERIALS,
    }

out = {
    'source': 'NASA 3D Resources: International Space Station (ISS) (E) (Internal), ISS_Interior_PBR_24.05_revA',
    'frame': 'metres; three.js +X starboard, +Y zenith, -Z forward; origin = Node 1 centre',
    'sourceOrigin': [round(x, 4) for x in origin],
    'sourceUnit': C.SRC_UNIT,
    'modules': modules,
    'materials': mat_info,
}
with open(os.path.join(HERE, 'modules.json'), 'w') as f:
    json.dump(out, f, indent=1)
with open(os.path.join(WORK, 'weight.json'), 'w') as f:
    json.dump({k: {m: v for m, v in d.items()} for k, d in mat_use.items()}, f, indent=1)
print('wrote modules.json and weight.json')
