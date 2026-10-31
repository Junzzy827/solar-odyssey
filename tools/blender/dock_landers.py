"""
メグリ（RS-06）に、全部の船で共通の着陸船（public/models/ship-lander.glb）を 2 機ドッキングさせる。

軸の上と下に 1 機ずつ、機首を前へ、腹（脚の側）を軸へ向けて置く。ドッキング中は脚をたたんでいるので、
脚（Legs）は入れない。着陸船の材質（焼いた Baked と、Glow・NavRed・NavGreen）はそのまま持ってくるので、
three.js 側（VariantModel）で着陸船だけ焼いた質感のまま表示される。

順番（bake_ship.py は読みこんだ glb の画像を消して焼き直すので、必ずこのスクリプトを最後に）:
  SHIPS=meguri python tools/blender/build_fleet.py
  SHIPS=meguri python tools/blender/bake_ship.py
  python tools/blender/dock_landers.py

何度実行しても同じ結果になる（前に差しこんだ着陸艇は消してから置き直す）。
"""

import os
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'models')
SHIP = os.path.join(MODELS, 'ship-meguri.glb')
LANDER = os.path.join(MODELS, 'ship-lander.glb')

# build_fleet.py の LANDER_DOCK_Y / LANDER_DOCK_Z と同じ値（Blender の座標：y が前、z が上）
DOCK_Y = 0.18
DOCK_Z = 0.062
# メグリは 1 単位 = 45 / 0.42 m（src/data/ships.ts の metersPerUnit）、着陸船の glb は 1 単位 = 24 m
SCALE = 24 / (45 / 0.42)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def world_bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def main():
    reset_scene()
    ship = import_glb(SHIP)
    # 前に差しこんだ着陸艇を消す
    for o in list(ship):
        if o.name.startswith('Lander'):
            bpy.data.objects.remove(o, do_unlink=True)
            ship.remove(o)

    for side, label in ((1, 'Top'), (-1, 'Bottom')):
        new = import_glb(LANDER)
        bpy.context.view_layer.update()
        meshes = [o for o in new if o.type == 'MESH' and o.name.split('.')[0] != 'Legs']
        # 親を外しても位置が変わらないよう、先に世界座標を覚えておく
        world = {o.name: o.matrix_world.copy() for o in meshes}
        for o in meshes:
            o.parent = None
            o.matrix_world = world[o.name]
        # 脚はたたんでいる（ドッキング中）ので入れない。空のノード（親）も片づける
        for o in new:
            if o not in meshes:
                bpy.data.objects.remove(o, do_unlink=True)
        for o in meshes:
            # 材質の名前をそろえる（読みこむと Glow.001 のようになるので、メグリや 1 機目の同じ名前の材質へ）
            for slot in o.material_slots:
                base = slot.material.name.split('.')[0] if slot.material else None
                if not base or slot.material.name == base:
                    continue
                if base in bpy.data.materials:
                    slot.material = bpy.data.materials[base]
                else:
                    slot.material.name = base
            o.data = o.data.copy()
            o.name = f'Lander{label}_{o.name.split(".")[0]}'
            o.data.name = o.name
        # 大きさ：メグリの単位へ。下の機は上下を返す（機首は前のまま、y 軸のまわりに半回転）
        rot = Matrix.Rotation(3.14159265 if side < 0 else 0, 4, 'Y')
        for o in meshes:
            o.matrix_world = rot @ Matrix.Scale(SCALE, 4) @ o.matrix_world
        bpy.context.view_layer.update()
        lo, hi = world_bounds(meshes)
        # 前後の中心を DOCK_Y に、腹を軸から DOCK_Z の高さに
        dy = DOCK_Y - (lo.y + hi.y) / 2
        dz = (DOCK_Z - lo.z) if side > 0 else (-DOCK_Z - hi.z)
        dx = -(lo.x + hi.x) / 2
        for o in meshes:
            o.matrix_world = Matrix.Translation((dx, dy, dz)) @ o.matrix_world
        bpy.context.view_layer.update()
        lo, hi = world_bounds(meshes)
        print(f'{label}: x {lo.x:.3f}..{hi.x:.3f} y {lo.y:.3f}..{hi.y:.3f} z {lo.z:.3f}..{hi.z:.3f}', flush=True)
        ship += meshes

    for o in bpy.context.scene.objects:
        o.select_set(o in ship or o.name.startswith('Lander'))
    bpy.ops.export_scene.gltf(
        filepath=SHIP,
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
    print('wrote', SHIP, os.path.getsize(SHIP) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    sys.exit(main())
