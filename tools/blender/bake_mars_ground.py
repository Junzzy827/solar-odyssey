"""
火星の地面の素材を Blender で焼く（つなぎ目無しで繰り返せる模様のタイル）。

着陸地表の火星の地面は、1 つのなめらかな地形に、シェーダーが 1 画素ずつ「何でできているか」を選んで塗る。
その素材の見本（タイル）をここで作る。どれも真上から撮ったつなぎ目の無い四角で、UV は使わず、
シェーダーが 3 方向から貼る（三面投影）。

  dust     細かい砂ぼこり：なめらかで明るい黄土色。ゆるい起伏、うすい風紋、半分うまった小石が少し
  gravel   小石の原：砂の上に、黒っぽい玄武岩の小石（4〜45 mm、小さいほど多い）がびっしり。角ばったものも
  darkSand 黒い砂：玄武岩の暗い砂のさざ波（波長 30 cm ほど）。山にはやや明るい粗い粒
  bedrock  岩盤：ゲール・クレーターの泥岩のような、割れ目で区切られた平たい板。割れ目には砂がたまる

作り方:
  1. 地面の高さと明るさを numpy で作る（FFT で作るので、端と端がぴったりつながる）
  2. Blender で地面のメッシュを作り、小石（ゆがめた多面体）を本物の 3D の形で並べる（端をまたぐ石は反対側にも置く）
  3. 真上から正射影のカメラで Cycles で 2 回撮る：高さ（Z）と明るさ（アルベド）。小石の上を向いた面には砂ぼこり
  4. PNG に書き出す：R = 高さの上位 8 ビット、B = 下位 8 ビット（16 ビットの高さ）、G = 明るさ（0 = 黒い玄武岩、1 = 明るい砂ぼこり）
     高さは全素材で同じ範囲 H_MIN〜H_MAX（m）。three.js 側（surface/marsGround.ts）が高さから凹凸（法線）を作る

実行（Blender の Python モジュール bpy が入った Python 3.13 で）:
  .venv/bin/python tools/blender/bake_mars_ground.py
  SIZE=256 SAMPLES=4 PREVIEW_DIR=/tmp/mars ... で試し焼き（PREVIEW_DIR には見やすい陰影つきの絵も出す）

同じ種なら何度実行しても同じ結果になる。
"""

import math
import os
import struct
import zlib

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'textures', 'ground')
SIZE = int(os.environ.get('SIZE', '512'))
SAMPLES = int(os.environ.get('SAMPLES', '16'))
PREVIEW = os.environ.get('PREVIEW_DIR')

# 高さの範囲（m）。marsGround.ts の H_MIN / H_MAX と同じ
H_MIN, H_MAX = -0.06, 0.08

# 素材ごとのタイルの大きさ（m）。marsGround.ts の TILE と同じ
TILE = {'dust': 2.0, 'gravel': 1.5, 'darkSand': 3.0, 'bedrock': 3.0}

GRID = 384  # 地面メッシュの 1 辺の分割数


# ---- つなぎ目の無い模様（numpy） ----------------------------------------------------------------

def spectral(rng, n, beta, lo=1.0, hi=None, aniso=None):
    """周期的なノイズ（平均 0、標準偏差 1）。パワーが 1/f^beta。aniso=(角度, 強さ) で一方向に伸ばす"""
    white = rng.standard_normal((n, n))
    f = np.fft.fft2(white)
    ky = np.fft.fftfreq(n) * n
    kx = np.fft.fftfreq(n) * n
    KX, KY = np.meshgrid(kx, ky)
    if aniso:
        a, s = aniso
        u = KX * math.cos(a) + KY * math.sin(a)
        v = -KX * math.sin(a) + KY * math.cos(a)
        k = np.sqrt(u * u + (v * s) ** 2)
    else:
        k = np.sqrt(KX * KX + KY * KY)
    amp = np.where(k >= lo, 1.0 / np.maximum(k, 1e-6) ** (beta / 2), 0.0)
    if hi:
        amp *= np.exp(-((k / hi) ** 2))
    out = np.real(np.fft.ifft2(f * amp))
    return (out - out.mean()) / (out.std() + 1e-9)


def ripples(rng, n, k0, width, angle, spread):
    """風紋：波数 k0（タイルあたりの波の数）のまわりだけ残したノイズ。向きは angle のまわり"""
    white = rng.standard_normal((n, n))
    f = np.fft.fft2(white)
    k = np.fft.fftfreq(n) * n
    KX, KY = np.meshgrid(k, k)
    r = np.sqrt(KX * KX + KY * KY)
    th = np.arctan2(KY, KX)
    d = np.angle(np.exp(1j * (th - angle) * 2)) / 2  # 向き（180° 同じ）
    amp = np.exp(-(((r - k0) / width) ** 2)) * np.exp(-((d / spread) ** 2))
    out = np.real(np.fft.ifft2(f * amp))
    out = (out - out.mean()) / (out.std() + 1e-9)
    # 山はとがり、谷は丸く（本物の風紋の形）
    return np.sign(out) * np.abs(out) ** 0.8 - 0.25 * np.maximum(-out, 0)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def voronoi_periodic(rng, n, cells):
    """周期的なボロノイ：いちばん近い点の番号と、境目までの距離（タイルを 1 とした長さ）"""
    pts = rng.random((cells, 2))
    # 3×3 に並べて、端をまたいでもつながるように
    offs = np.array([(i, j) for i in (-1, 0, 1) for j in (-1, 0, 1)], dtype=float)
    allp = (pts[None, :, :] + offs[:, None, :]).reshape(-1, 2)
    ids = np.tile(np.arange(cells), 9)
    ys, xs = np.mgrid[0:n, 0:n] / n
    Q = np.stack([xs, ys], -1).reshape(-1, 2)
    id_out = np.empty(len(Q), dtype=int)
    edge = np.empty(len(Q))
    for s in range(0, len(Q), 16384):  # 少しずつ（一度に全部だとメモリが足りない）
        q = Q[s:s + 16384]
        d = np.linalg.norm(q[:, None, :] - allp[None, :, :], axis=2)
        order = np.argsort(d, axis=1)[:, :2]
        p1 = allp[order[:, 0]]
        p2 = allp[order[:, 1]]
        # 2 点の垂直二等分線までの距離
        mid = (p1 + p2) / 2
        dirv = p2 - p1
        dirv /= np.linalg.norm(dirv, axis=1, keepdims=True)
        edge[s:s + 16384] = np.abs(np.sum((q - mid) * dirv, axis=1))
        id_out[s:s + 16384] = ids[order[:, 0]]
    return id_out.reshape(n, n), edge.reshape(n, n), pts


# ---- 素材ごとの地面と石 -------------------------------------------------------------------------

def make_dust(rng, n, T):
    h = 0.006 * spectral(rng, n, 3.2, lo=1) + 0.0012 * spectral(rng, n, 1.6, lo=8)
    patch = smooth(0.0, 1.2, spectral(rng, n, 4.0, lo=1))
    h += 0.0009 * patch * ripples(rng, n, T / 0.12, 1.6, 0.5, 0.25)
    alb = 0.84 + 0.06 * spectral(rng, n, 3.0, lo=1) + 0.03 * spectral(rng, n, 1.0, lo=20)
    # 風下へのびる、ほんの少し暗い筋（砂ぼこりの薄いところ）
    alb -= 0.05 * smooth(0.6, 1.6, spectral(rng, n, 3.0, lo=1, aniso=(0.5, 5.0)))
    stones = scatter(rng, T, count=140, rmin=0.004, rmax=0.016, power=2.6, bury=(0.45, 0.7), alb=(0.18, 0.4), angular=0.4, dust=0.5)
    return h, alb, stones


def make_gravel(rng, n, T):
    h = 0.004 * spectral(rng, n, 3.0, lo=1) + 0.001 * spectral(rng, n, 1.4, lo=10)
    alb = 0.62 + 0.05 * spectral(rng, n, 2.8, lo=1)
    stones = scatter(rng, T, count=2200, rmin=0.004, rmax=0.045, power=2.3, bury=(0.2, 0.6), alb=(0.06, 0.42), angular=0.65, dust=0.35)
    return h, alb, stones


def make_dark_sand(rng, n, T):
    rip = ripples(rng, n, T / 0.3, 1.2, 0.3, 0.18)
    h = 0.011 * rip + 0.004 * spectral(rng, n, 3.4, lo=1) + 0.0008 * spectral(rng, n, 1.2, lo=20)
    # 山（風紋の頂上）は粗い粒で少し明るい、谷は細かい暗い砂
    alb = 0.24 + 0.07 * smooth(0.2, 1.4, rip) + 0.025 * spectral(rng, n, 2.5, lo=2)
    stones = scatter(rng, T, count=60, rmin=0.004, rmax=0.012, power=2.5, bury=(0.5, 0.7), alb=(0.15, 0.3), angular=0.3, dust=0.2)
    return h, alb, stones


def make_bedrock(rng, n, T):
    ids, edge, pts = voronoi_periodic(rng, n, 26)
    ncell = len(pts)
    base = rng.uniform(-0.012, 0.016, ncell)
    tilt = rng.normal(0, 0.035, (ncell, 2))
    tone = rng.uniform(0.36, 0.56, ncell)
    ys, xs = np.mgrid[0:n, 0:n] / n
    # 板ごとの傾き（板の中心からの距離 × 傾き）。周期をこえないよう、中心からの差は -0.5〜0.5 に折り返す
    cx = pts[ids, 0]
    cy = pts[ids, 1]
    dx = (xs - cx + 0.5) % 1 - 0.5
    dy = (ys - cy + 0.5) % 1 - 0.5
    plate = base[ids] + (tilt[ids, 0] * dx + tilt[ids, 1] * dy) * T
    # 割れ目：幅 1〜2.5 cm、深さ 3 cm。縁は少し丸い
    wmap = (0.006 + 0.008 * smooth(-1, 1, spectral(rng, n, 3.0, lo=2))) / T
    crack = 1 - smooth(0.0, 1.0, edge / wmap)
    rough = 0.0035 * spectral(rng, n, 2.2, lo=3)
    # 地層（うすい縞）：板の高さに沿った細い段
    lam = 0.0015 * np.sin((plate + 0.004 * spectral(rng, n, 3, lo=1)) / 0.006 * 2 * math.pi)
    h = plate + rough + lam - 0.035 * crack
    # 割れ目にたまった砂は平ら（-0.02 m で止まる）
    sand_level = -0.02 + 0.003 * spectral(rng, n, 3, lo=2)
    filled = h < sand_level
    h = np.where(filled, sand_level, h)
    alb = tone[ids] + 0.05 * spectral(rng, n, 2.0, lo=4) + 6 * lam
    alb = np.where(filled, 0.74 + 0.04 * spectral(rng, n, 2.5, lo=2), alb)
    # 板の上のくぼみにも、うすく砂ぼこり
    alb = alb + 0.18 * smooth(0.004, -0.002, rough) * (1 - crack)
    stones = scatter(rng, T, count=110, rmin=0.006, rmax=0.05, power=2.2, bury=(0.1, 0.35), alb=(0.32, 0.52), angular=1.0, dust=0.3)
    return h, alb, stones


def scatter(rng, T, count, rmin, rmax, power, bury, alb, angular, dust):
    """小石の並べ方：大きさはべき分布（小さいほど多い）、半分ほど砂にうまる"""
    out = []
    for _ in range(count):
        u = rng.random()
        r = (rmin ** (1 - power) + u * (rmax ** (1 - power) - rmin ** (1 - power))) ** (1 / (1 - power))
        out.append(dict(
            x=rng.random() * T, y=rng.random() * T, r=r,
            flat=rng.uniform(0.45, 0.8), stretch=rng.uniform(0.75, 1.3),
            rot=rng.random() * math.tau, tilt=rng.normal(0, 0.25, 2),
            bury=rng.uniform(*bury), alb=rng.uniform(*alb),
            angular=rng.random() < angular, dust=dust, seed=int(rng.integers(1 << 30)),
        ))
    return out


# ---- Blender ---------------------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.filter_size = 1.0
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[1].default_value = 0
    sc.world = w
    return sc


def ground_mesh(h, alb, T):
    n = h.shape[0]
    g = GRID
    # numpy の模様を GRID にとり直す。タイルの外にも少しはみ出して作る（端の画素の外側が空っぽだと、端が暗い線になる）
    pad = 6
    ii = np.arange(-pad, g + pad + 1)
    idx = (ii % g) * n // g
    H = h[np.ix_(idx, idx)]
    A = alb[np.ix_(idx, idx)]
    m = len(ii)
    verts = [(ii[i] / g * T, ii[j] / g * T, float(H[j, i])) for j in range(m) for i in range(m)]
    faces = []
    for j in range(m - 1):
        for i in range(m - 1):
            a = j * m + i
            faces.append((a, a + 1, a + m + 1, a + m))
    me = bpy.data.meshes.new('ground')
    me.from_pydata(verts, [], faces)
    attr = me.attributes.new('alb', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', A.reshape(-1).astype(np.float32))
    ob = bpy.data.objects.new('ground', me)
    bpy.context.collection.objects.link(ob)
    ob['alb'] = 0.0
    ob['is_ground'] = 1.0
    Hc = H[pad:pad + g, pad:pad + g]
    return ob, (lambda x, y: float(Hc[int(round(y / T * g)) % g, int(round(x / T * g)) % g]))


def stone_mesh(s):
    """ゆがめた多面体の小石。角ばったものは面を少なく、丸いものは細かく"""
    rng = np.random.default_rng(s['seed'])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if s['angular'] else 2, radius=1)
    ob = bpy.context.active_object
    me = ob.data
    planes = [(rng.normal(size=3), rng.uniform(0.55, 0.9)) for _ in range(5 if s['angular'] else 0)]
    for v in me.vertices:
        p = np.array(v.co)
        p *= 1 + rng.uniform(-0.12, 0.12)
        # 角ばった石：何枚かの平面で切り落としたように
        for nrm, d in planes:
            nn = nrm / np.linalg.norm(nrm)
            k = p @ nn
            if k > d:
                p -= nn * (k - d)
        v.co = p
    return ob


def place_stones(stones, height_at, T):
    obs = []
    for s in stones:
        r = s['r']
        sx, sy, sz = r * s['stretch'], r / s['stretch'], r * s['flat']
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                x, y = s['x'] + ox, s['y'] + oy
                # タイルの外へ大きくはみ出す写しは要らない
                if x < -r * 2 or x > T + r * 2 or y < -r * 2 or y > T + r * 2:
                    continue
                ob = stone_mesh(s)
                ob.scale = (sx, sy, sz)
                ob.rotation_euler = (s['tilt'][0], s['tilt'][1], s['rot'])
                gz = height_at(s['x'] % T, s['y'] % T)
                ob.location = (x, y, gz + sz * (1 - 2 * s['bury']))
                ob['alb'] = s['alb']
                ob['dust'] = s['dust']
                ob['is_ground'] = 0.0
                obs.append(ob)
    return obs


def material(mode):
    """mode = 'height'：高さを H_MIN〜H_MAX で 0〜1 に、'albedo'：明るさ（石の上を向いた面には砂ぼこり）"""
    m = bpy.data.materials.new(mode)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    if mode == 'height':
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], sep.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs[1].default_value = H_MIN
        mr.inputs[2].default_value = H_MAX
        nt.links.new(sep.outputs[2], mr.inputs[0])
        nt.links.new(mr.outputs[0], em.inputs[0])
        return m
    # 明るさ：地面は頂点の値、石はオブジェクトの値
    va = nt.nodes.new('ShaderNodeAttribute')
    va.attribute_type = 'GEOMETRY'
    va.attribute_name = 'alb'
    oa = nt.nodes.new('ShaderNodeAttribute')
    oa.attribute_type = 'OBJECT'
    oa.attribute_name = 'alb'
    isg = nt.nodes.new('ShaderNodeAttribute')
    isg.attribute_type = 'OBJECT'
    isg.attribute_name = 'is_ground'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    nt.links.new(isg.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(oa.outputs['Fac'], mix.inputs['A'])
    nt.links.new(va.outputs['Fac'], mix.inputs['B'])
    # 石の上を向いた面のうち、ノイズで決めたところに砂ぼこり（明るさ 0.78）
    sepn = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sepn.inputs[0])
    up = nt.nodes.new('ShaderNodeMapRange')
    up.inputs[1].default_value = 0.75
    up.inputs[2].default_value = 0.97
    nt.links.new(sepn.outputs[2], up.inputs[0])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 120
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    nm = nt.nodes.new('ShaderNodeMapRange')
    nm.inputs[1].default_value = 0.42
    nm.inputs[2].default_value = 0.62
    nt.links.new(noise.outputs['Fac'], nm.inputs[0])
    dust = nt.nodes.new('ShaderNodeAttribute')
    dust.attribute_type = 'OBJECT'
    dust.attribute_name = 'dust'
    m1 = nt.nodes.new('ShaderNodeMath')
    m1.operation = 'MULTIPLY'
    nt.links.new(up.outputs[0], m1.inputs[0])
    nt.links.new(nm.outputs[0], m1.inputs[1])
    m2 = nt.nodes.new('ShaderNodeMath')
    m2.operation = 'MULTIPLY'
    nt.links.new(m1.outputs[0], m2.inputs[0])
    nt.links.new(dust.outputs['Fac'], m2.inputs[1])
    mix2 = nt.nodes.new('ShaderNodeMix')
    mix2.data_type = 'FLOAT'
    nt.links.new(m2.outputs[0], mix2.inputs['Factor'])
    nt.links.new(mix.outputs[0], mix2.inputs['A'])
    mix2.inputs['B'].default_value = 0.78
    nt.links.new(mix2.outputs[0], em.inputs[0])
    return m


def camera(T):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = T
    cam.clip_start = 0.01
    cam.clip_end = 10
    ob = bpy.data.objects.new('cam', cam)
    ob.location = (T / 2, T / 2, 2)
    bpy.context.collection.objects.link(ob)
    bpy.context.scene.camera = ob


def render(sc, objs, mat, path):
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
    bpy.data.images.remove(img)
    return px[:, :, 0]  # 下の行から上へ（Blender の画素の並び）


def write_png(path, rgb):
    """8 ビット RGB の PNG（上の行から）"""
    hgt, wid, _ = rgb.shape
    raw = b''.join(b'\x00' + rgb[y].astype(np.uint8).tobytes() for y in range(hgt))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', wid, hgt, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def bake(name, maker, seed):
    T = TILE[name]
    rng = np.random.default_rng(seed)
    n = 512
    h, alb, stones = maker(rng, n, T)
    sc = reset()
    ground, height_at = ground_mesh(h, np.clip(alb, 0, 1), T)
    obs = [ground] + place_stones(stones, height_at, T)
    camera(T)
    tmp = os.path.join(bpy.app.tempdir or '/tmp', f'mars_{name}')
    hh = render(sc, obs, material('height'), tmp + '_h.exr')
    aa = render(sc, obs, material('albedo'), tmp + '_a.exr')
    # Blender の画素は下の行から。PNG は上の行から書くので上下を返す（three.js は flipY で元にもどす）
    hh = np.clip(hh[::-1], 0, 1)
    aa = np.clip(aa[::-1], 0, 1)
    h16 = np.round(hh * 65535).astype(np.uint32)
    rgb = np.stack([h16 >> 8, np.round(aa * 255), h16 & 255], -1)
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, f'mars_{name}.png'), rgb)
    # スマホ用の半分の大きさ（2×2 の平均）
    half = lambda a: a.reshape(SIZE // 2, 2, SIZE // 2, 2).mean((1, 3))
    h2 = np.round(half(hh) * 65535).astype(np.uint32)
    write_png(os.path.join(OUT, f'mars_{name}_s.png'), np.stack([h2 >> 8, np.round(half(aa) * 255), h2 & 255], -1))
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        hm = H_MIN + hh * (H_MAX - H_MIN)
        texel = T / SIZE
        gy, gx = np.gradient(hm, texel)
        nrm = np.stack([-gx, gy, np.ones_like(gx)], -1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
        sun = np.array([0.6, 0.35, 0.72])
        sun /= np.linalg.norm(sun)
        shade = np.clip(nrm @ sun, 0, 1) * 0.85 + 0.15
        col = np.array([0.36, 0.33, 0.31])[None, None, :] * (1 - aa[..., None]) + np.array([0.78, 0.55, 0.38])[None, None, :] * aa[..., None]
        write_png(os.path.join(PREVIEW, f'{name}_shaded.png'), np.clip(col * shade[..., None] * 255, 0, 255))
    print('baked', name, T, 'm', len(stones), 'stones')


if __name__ == '__main__':
    only = os.environ.get('ONLY')
    for i, (name, maker) in enumerate([('dust', make_dust), ('gravel', make_gravel), ('darkSand', make_dark_sand), ('bedrock', make_bedrock)]):
        if only and only != name:
            continue
        bake(name, maker, 9100 + i * 7)
