"""
自機の glb に、Blender で焼いた（ベイクした）テクスチャを足して書き出し直す。全機体で使い回せる。

build_fleet.py / build_hull.py が書き出した public/models/ship-*.glb を読み込み、

  1. ベイク専用の重ならない UV（2 番目の UV「Bake」）を作る
  2. Cycles でテクスチャを焼く（プロシージャルなノードは glTF に出せないので、すべて画像にする）
     - detail   : ベースカラーに掛ける明るさ。AO（すき間の暗さ）・曲率（角の明るさ）・パネルの継ぎ目の墨入れ・
                  パネルごとの色ムラ（±4%）・エンジン後方のすす汚れ
     - rough    : ラフネス（つや消しの板とつやのある板を混ぜる。すすの部分はつや消し）
     - normal   : パネルの継ぎ目の溝と細かな凹凸（タンジェント空間のノーマルマップ）
     - emissive : 船体の小さな窓明かり
  3. glb に書き出す（Hull の材質に 4 枚を付ける。three.js 側は名前で材質を差し替えるので、
     src/components/ship/bakedMaps.ts がこの 4 枚を取り出して、全部の材質の UV 2 番で使う）

パネルの継ぎ目は、ナイフやインセットで実際に溝を彫ると面の数が何倍にもなるので、
継ぎ目の模様から「溝の凹凸」をノーマルマップに、「溝の暗さ」を detail に焼き込む（見た目は彫った溝と同じ）。

実行（Blender の Python モジュール bpy が入った Python 3.13 で）:
  .venv/bin/python tools/blender/bake_ship.py                 # 全部
  SHIPS=heron .venv/bin/python tools/blender/bake_ship.py      # 1 隻だけ
  SIZE=1024 SAMPLES=8 ...                                      # 試し焼き（速い）
  PREVIEW_DIR=/tmp/bake ...                                    # 焼いた画像を PNG でも保存して確認する

何度実行しても同じ結果になる（読み込んだ glb の UV「Bake」と画像は作り直す）。
"""

import math
import os
import sys
import time

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'models')
SIZE = int(os.environ.get('SIZE', '2048'))
SAMPLES = int(os.environ.get('SAMPLES', '32'))

# detail の「平らな面」の明るさ。角を明るくする余地を残すため 1 より下にしてある
# （今までの外板の絵もこのくらい暗かったので、three.js 側の材質の色はそのまま）
DETAIL_BASE = 0.85

# 船ごとの設定。lines: 継ぎ目の墨入れと溝、ao: AO を焼く、windows: 窓明かり、normal: ノーマルマップ
# SV-01 の機関部は three.js 側の外板の絵（窓・文字・パネル線）があり、AO も頂点カラーに焼いてあるので、
# 色ムラ・曲率・すす・つやだけにする
SHIPS = {
    'heron': dict(file='ship-heron.glb'),
    'sorakaze': dict(file='ship-sorakaze.glb'),
    'hakobune': dict(file='ship-hakobune.glb'),
    'meguri': dict(file='ship-meguri.glb'),
    'amatsu': dict(file='ship-amatsu.glb'),
    'sv01': dict(file='ship-hull.glb', lines=False, ao=False, windows=False, normal=False, uv_scale=1.0),
}

# 材質の種類（build_fleet.py の材質名）
PAINTED = {'Hull', 'Hull2', 'Accent', 'CargoA', 'CargoB', 'CargoC', 'CargoD', 'Nacelle'}
BARE = {'Dark', 'Metal', 'Gold', 'Radiator', 'Sail'}
WINDOWED = {'Hull', 'Hull2', 'Nacelle'}
# パネル 1 枚の大きさ（模型の単位。全長がおよそ 1）。UV「UVMap」は 1 単位 = 6（build_fleet.py の box_uvs）
PANEL = 0.036
GROOVE = 0.0008


# ---- ノードを組む道具 -------------------------------------------------------------


class Nodes:
    """材質のノードを短く書くための入れ物"""

    def __init__(self, mat):
        mat.use_nodes = True
        self.tree = mat.node_tree
        self.tree.nodes.clear()
        self.x = 0

    def node(self, kind, **inputs):
        n = self.tree.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 200
        for key, value in inputs.items():
            if key.startswith('_'):
                setattr(n, key[1:], value)
            else:
                self.link(value, n.inputs[key])
        return n

    def link(self, value, socket):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        elif isinstance(value, bpy.types.Node):
            self.tree.links.new(value.outputs[0], socket)
        else:
            socket.default_value = value

    def _math(self, op, a, b, clamp):
        n = self.tree.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        n.location = (self.x, -300)
        self.x += 150
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        return n.outputs[0]

    def mix(self, a, b, t):
        """a + (b - a) * t"""
        return self._math('ADD', a, self._math('MULTIPLY', self._math('SUBTRACT', b, a, False), t, False), False)


def panel_field(n, uv_scale):
    """パネルの模様：継ぎ目（1 で溝）と、パネルごとの乱数（0〜1）を返す"""
    uv = n.node('ShaderNodeUVMap', _uv_map='UVMap')
    s = uv_scale
    brick = n.node('ShaderNodeTexBrick', Vector=uv.outputs[0])
    # 段ごとに少しだけずらす（レンガのような互い違いにはしない）
    brick.offset = 0.12
    brick.offset_frequency = 3
    brick.squash = 1.0
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = PANEL * s
    brick.inputs['Row Height'].default_value = PANEL * s * 0.7
    brick.inputs['Mortar Size'].default_value = GROOVE * s
    brick.inputs['Mortar Smooth'].default_value = 0.3
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Color1'].default_value = (0, 0, 0, 1)
    brick.inputs['Color2'].default_value = (1, 1, 1, 1)
    brick.inputs['Mortar'].default_value = (0, 0, 0, 1)
    # 大きな区画の継ぎ目（パネル 4 枚ごと、少し太く）
    big = n.node('ShaderNodeTexBrick', Vector=uv.outputs[0])
    big.offset = 0.25
    big.inputs['Scale'].default_value = 1.0
    big.inputs['Brick Width'].default_value = PANEL * s * 3.2
    big.inputs['Row Height'].default_value = PANEL * s * 2.1
    big.inputs['Mortar Size'].default_value = GROOVE * s * 1.5
    big.inputs['Mortar Smooth'].default_value = 0.3
    groove = n._math('MAXIMUM', brick.outputs['Fac'], big.outputs['Fac'], True)
    rand = n.node('ShaderNodeSeparateColor', Color=brick.outputs['Color']).outputs[0]
    return groove, rand


def soot_field(n):
    """エンジン後方のすす：頂点ごとに計算した Soot（0〜1）を、船の前後方向に伸ばした縞で崩す"""
    attr = n.node('ShaderNodeAttribute', _attribute_name='Soot', _attribute_type='GEOMETRY')
    geo = n.node('ShaderNodeNewGeometry')
    stretch = n.node('ShaderNodeMapping', Vector=geo.outputs['Position'])
    stretch.inputs['Scale'].default_value = (60.0, 6.0, 60.0)
    noise = n.node('ShaderNodeTexNoise', Vector=stretch.outputs[0])
    noise.inputs['Detail'].default_value = 6
    streak = n._math('POWER', noise.outputs['Fac'], 1.6, False)
    return n._math('MULTIPLY', attr.outputs['Fac'], n._math('MULTIPLY', streak, 1.8, False), True)


def ao_field(n, enabled):
    if not enabled:
        return 1.0
    ao = n.node('ShaderNodeAmbientOcclusion')
    ao.samples = 16
    ao.inputs['Distance'].default_value = 0.05
    # そのまま掛けると暗すぎるので、陰影だけを残す
    return n.mix(1.0, ao.outputs['AO'], 0.8)


def edge_field(n):
    """角の明るさ（曲率）：面取りした法線と元の法線のずれが大きいところ"""
    bevel = n.node('ShaderNodeBevel')
    bevel.samples = 8
    bevel.inputs['Radius'].default_value = 0.003
    geo = n.node('ShaderNodeNewGeometry')
    dot = n.node('ShaderNodeVectorMath', _operation='DOT_PRODUCT')
    n.link(bevel.outputs[0], dot.inputs[0])
    n.link(geo.outputs['Normal'], dot.inputs[1])
    return n._math('MULTIPLY', n._math('SUBTRACT', 1.0, dot.outputs['Value'], False), 8.0, True)


def emit(n, value):
    out = n.node('ShaderNodeOutputMaterial')
    em = n.node('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    if isinstance(value, (int, float)):
        value = (value, value, value, 1.0)
    if isinstance(value, bpy.types.NodeSocket) and value.type == 'VALUE':
        rgb = n.node('ShaderNodeCombineColor')
        for i in range(3):
            n.link(value, rgb.inputs[i])
        value = rgb.outputs[0]
    n.link(value, em.inputs['Color'])
    n.link(em.outputs[0], out.inputs['Surface'])


def build_pass(mat, pass_name, cfg, image):
    name = mat.name
    n = Nodes(mat)
    painted = name in PAINTED
    bare = name in BARE
    lines = cfg.get('lines', True) and painted
    uv_scale = cfg.get('uv_scale', 6.0)

    if pass_name == 'detail':
        if not (painted or bare):
            emit(n, 1.0)  # 光る部品・窓などは触らない
        else:
            value = DETAIL_BASE
            ao = ao_field(n, cfg.get('ao', True))
            value = n._math('MULTIPLY', value, ao, False)
            soot = soot_field(n)
            value = n._math('MULTIPLY', value, n._math('SUBTRACT', 1.0, n._math('MULTIPLY', soot, 0.45 if painted else 0.3, False), False), False)
            if painted:
                groove, rand = panel_field(n, uv_scale)
                tint = n._math('ADD', 1.0, n._math('MULTIPLY', n._math('SUBTRACT', rand, 0.5, False), 0.09, False), False)
                value = n._math('MULTIPLY', value, tint, False)
                if lines:
                    value = n._math('MULTIPLY', value, n._math('SUBTRACT', 1.0, n._math('MULTIPLY', groove, 0.38, False), False), False)
            value = n._math('ADD', value, n._math('MULTIPLY', edge_field(n), 1 - DETAIL_BASE, False), True)
            emit(n, value)
    elif pass_name == 'rough':
        if painted:
            groove, rand = panel_field(n, uv_scale)
            # 4 枚に 1 枚くらい、つやのある板（ラフネス 0.6 倍）
            glossy = n._math('GREATER_THAN', rand, 0.74, False)
            value = n.mix(n._math('ADD', 0.85, n._math('MULTIPLY', rand, 0.15, False), False), 0.6, glossy)
        elif bare:
            noise = n.node('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 40.0
            value = n._math('ADD', 0.8, n._math('MULTIPLY', noise.outputs['Fac'], 0.2, False), False)
        else:
            value = 1.0
        if painted or bare:
            value = n.mix(value, 1.0, soot_field(n))
        emit(n, value)
    elif pass_name == 'emissive':
        if cfg.get('windows', True) and name in WINDOWED:
            uv = n.node('ShaderNodeUVMap', _uv_map='UVMap')
            s = uv_scale
            win = n.node('ShaderNodeTexBrick', Vector=uv.outputs[0])
            win.offset = 0.0
            win.inputs['Scale'].default_value = 1.0
            win.inputs['Brick Width'].default_value = 0.0034 * s
            win.inputs['Row Height'].default_value = 0.0095 * s
            win.inputs['Mortar Size'].default_value = 0.0012 * s
            win.inputs['Mortar Smooth'].default_value = 0.0
            win.inputs['Bias'].default_value = 0.0
            win.inputs['Color1'].default_value = (0, 0, 0, 1)
            win.inputs['Color2'].default_value = (1, 1, 1, 1)
            rand = n.node('ShaderNodeSeparateColor', Color=win.outputs['Color']).outputs[0]
            lit = n._math('MULTIPLY', n._math('GREATER_THAN', rand, 0.84, False), n._math('SUBTRACT', 1.0, win.outputs['Fac'], False), False)
            # 窓は横向きの面だけ・まとまって並ぶように（大きなノイズで区画ごとに点ける）
            geo = n.node('ShaderNodeNewGeometry')
            nz = n.node('ShaderNodeSeparateXYZ', Vector=geo.outputs['Normal']).outputs[2]
            side = n._math('LESS_THAN', n._math('ABSOLUTE', nz, 0, False), 0.55, False)
            cluster = n.node('ShaderNodeTexNoise', Vector=geo.outputs['Position'])
            cluster.inputs['Scale'].default_value = 9.0
            on = n._math('GREATER_THAN', cluster.outputs['Fac'], 0.56, False)
            mask = n._math('MULTIPLY', n._math('MULTIPLY', lit, side, False), on, False)
            warm = n.node('ShaderNodeMix', _data_type='RGBA')
            warm.inputs['Factor'].default_value = 0
            n.link(mask, warm.inputs['Factor'])
            warm.inputs[6].default_value = (0, 0, 0, 1)
            warm.inputs[7].default_value = (1.0, 0.78, 0.5, 1)
            emit(n, warm.outputs[2])
        else:
            emit(n, (0, 0, 0, 1))
    elif pass_name == 'normal':
        out = n.node('ShaderNodeOutputMaterial')
        bsdf = n.node('ShaderNodeBsdfPrincipled')
        if lines:
            groove, _ = panel_field(n, uv_scale)
            fine = n.node('ShaderNodeTexNoise')
            fine.inputs['Scale'].default_value = 900.0
            height = n._math('ADD', n._math('MULTIPLY', groove, -1.0, False), n._math('MULTIPLY', fine.outputs['Fac'], 0.08, False), False)
            bump = n.node('ShaderNodeBump', Height=height)
            bump.inputs['Strength'].default_value = 0.6
            bump.inputs['Distance'].default_value = 0.0004
            n.link(bump.outputs[0], bsdf.inputs['Normal'])
        n.link(bsdf.outputs[0], out.inputs['Surface'])

    tex = n.tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    n.tree.nodes.active = tex


# ---- 準備 ------------------------------------------------------------------------


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for o in objs:
        for layer in list(o.data.uv_layers)[1:]:
            o.data.uv_layers.remove(layer)
    return objs


def bake_uvs(objs):
    """全部のオブジェクトをまとめて、重ならないように 1 枚の画像に並べる UV を作る"""
    for o in objs:
        layer = o.data.uv_layers.new(name='Bake')
        o.data.uv_layers.active = layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    margin = 6 / SIZE
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def soot_attribute(objs):
    """エンジンの噴射口（Glow の面）の近くほど 1 になる値を、頂点ごとに作る"""
    centers = []
    for o in objs:
        m = o.matrix_world
        for p in o.data.polygons:
            if o.data.materials[p.material_index].name == 'Glow':
                centers.append(m @ p.center)
    centers = np.array([c[:] for c in centers]) if centers else np.zeros((0, 3))
    if len(centers) > 400:
        centers = centers[np.random.default_rng(1).choice(len(centers), 400, replace=False)]
    for o in objs:
        co = np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices])
        soot = np.zeros(len(co))
        if len(centers):
            # 噴射口から後ろ（−Y）よりも、前（船体の側）へ広がる汚れ。前後に長く、横には狭く
            for chunk in range(0, len(co), 20000):
                d = co[chunk:chunk + 20000, None, :] - centers[None, :, :]
                dist = np.sqrt((d[..., 0] / 0.9) ** 2 + (d[..., 1] / 1.8) ** 2 + (d[..., 2] / 0.9) ** 2)
                soot[chunk:chunk + 20000] = np.exp(-(dist.min(1) / 0.08) ** 2)
        attr = o.data.attributes.new('Soot', 'FLOAT', 'POINT')
        attr.data.foreach_set('value', soot.astype(np.float32))


def setup_cycles():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    scene.world = bpy.data.worlds.new('world')


def bake(objs, mats, cfg, pass_name, color):
    image = bpy.data.images.new(f'{cfg["id"]}-{pass_name}', SIZE, SIZE, alpha=False, float_buffer=False)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    for mat in mats:
        build_pass(mat, pass_name, cfg, image)
    scene = bpy.context.scene
    scene.cycles.samples = {'detail': SAMPLES, 'rough': 4, 'emissive': 4, 'normal': 8}[pass_name]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time()
    if pass_name == 'normal':
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    else:
        bpy.ops.object.bake(type='EMIT')
    print(f'  {pass_name}: {time.time() - t:.1f}s', flush=True)
    image.pack()
    if os.environ.get('PREVIEW_DIR'):
        os.makedirs(os.environ['PREVIEW_DIR'], exist_ok=True)
        image.filepath_raw = os.path.join(os.environ['PREVIEW_DIR'], f'{image.name}.png')
        image.file_format = 'PNG'
        image.save()
    return image


def export_material(mat, images=None):
    """書き出す材質。Hull だけに焼いた 4 枚を付け、UV「Bake」（TEXCOORD_1）で貼る"""
    n = Nodes(mat)
    out = n.node('ShaderNodeOutputMaterial')
    bsdf = n.node('ShaderNodeBsdfPrincipled')
    n.link(bsdf.outputs[0], out.inputs['Surface'])
    if not images:
        return
    uv = n.node('ShaderNodeUVMap', _uv_map='Bake')

    def tex(kind):
        t = n.node('ShaderNodeTexImage', Vector=uv.outputs[0])
        t.image = images[kind]
        return t

    n.link(tex('detail').outputs['Color'], bsdf.inputs['Base Color'])
    rough = n.node('ShaderNodeSeparateColor', Color=tex('rough').outputs['Color'])
    n.link(rough.outputs[1], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'normal' in images:
        nm = n.node('ShaderNodeNormalMap', Color=tex('normal').outputs['Color'])
        nm.uv_map = 'Bake'
        n.link(nm.outputs[0], bsdf.inputs['Normal'])
    if 'emissive' in images:
        n.link(tex('emissive').outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0


def run(ship_id):
    cfg = dict(SHIPS[ship_id], id=ship_id)
    path = os.path.join(MODELS, cfg['file'])
    print(f'== {ship_id} ({cfg["file"]})', flush=True)
    t = time.time()
    objs = load(path)
    bake_uvs(objs)
    soot_attribute(objs)
    setup_cycles()
    mats = sorted({m for o in objs for m in o.data.materials if m}, key=lambda m: m.name)
    images = {'detail': bake(objs, mats, cfg, 'detail', True), 'rough': bake(objs, mats, cfg, 'rough', False)}
    if cfg.get('normal', True):
        images['normal'] = bake(objs, mats, cfg, 'normal', False)
    if cfg.get('windows', True):
        images['emissive'] = bake(objs, mats, cfg, 'emissive', True)
    holder = 'Hull' if any(m.name == 'Hull' for m in mats) else mats[0].name
    for mat in mats:
        export_material(mat, images if mat.name == holder else None)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
        o.data.attributes.remove(o.data.attributes['Soot'])
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_vertex_color='ACTIVE',
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_jpeg_quality=90,
        export_image_quality=90,
        export_yup=True,
    )
    print(f'wrote {path} {os.path.getsize(path) // 1024} KB in {time.time() - t:.0f}s', flush=True)


def main():
    for ship_id in os.environ.get('SHIPS', ','.join(SHIPS)).split(','):
        run(ship_id)


if __name__ == '__main__':
    sys.exit(main())
