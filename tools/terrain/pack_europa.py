"""Europa ice race site: a synthetic height map in the same format as the real DEM sites.

There is no metre-scale elevation data for Europa (Galileo stereo covers only a few small areas),
so this builds a plausible landscape modelled on Galileo photos of the Conamara Chaos region:
a smooth band of ice (the race course) between two double ridges (~100 m high crests with a
central trough), background double ridges crossing at many angles, and a field of tilted chaos
blocks to the north-west. Three low transverse ridges cross the course as jumps.

Usage: python3 tools/terrain/pack_europa.py public/terrain/
The course runs in the central trough of a large arc-shaped double ridge (like Europa's cycloid ridges).
Writes europa_conamara{.json,_near.png,_far.png,_detail.png} and prints RAW = course points (10 m).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

NEAR = dict(size=1024, step=0.05, offset=1000.0, extent=6400.0)
FAR = dict(size=512, step=0.25, offset=4000.0, extent=100000.0)
DETAIL = dict(size=2048, extent=3200.0, step=0.01)

# course control points (x east, z south, m); start at the landing spot
CTRL = [(0, 0), (90, -150), (260, -270), (470, -280), (650, -360), (760, -560), (740, -780),
        (840, -960), (1020, -1050)]
BAND = 45.0      # smooth ice half-width
WALL = 250.0     # distance from course to the centre of each flanking double ridge
JUMPS = (330.0, 760.0, 1180.0)
rng = np.random.default_rng(7)


def catmull(pts, step=2.0):
    p = np.array([pts[0]] + pts + [pts[-1]], float)
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        n = max(2, int(np.hypot(*(p2 - p1)) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-2])
    return np.array(out)


def noise2(x, z, scale, seed, octaves=4):
    """cheap value-noise fbm on arrays"""
    total = np.zeros_like(x)
    amp, f, norm = 1.0, 1.0 / scale, 0.0
    for o in range(octaves):
        r = np.random.default_rng(seed + o)
        ph = r.uniform(0, 2 * np.pi, 6)
        ang = r.uniform(0, np.pi, 3)
        acc = np.zeros_like(x)
        for k in range(3):
            u = (x * math.cos(ang[k]) + z * math.sin(ang[k])) * f
            acc += np.sin(u * 2 * np.pi + ph[k]) * np.cos((x * math.sin(ang[k]) - z * math.cos(ang[k])) * f * 1.7 * np.pi + ph[k + 3])
        total += amp * acc / 3
        norm += amp
        amp *= 0.5
        f *= 2.03
    return total / norm


def double_ridge(u, h, w):
    """two crests at +-w*0.8 with a trough between (u = distance from the ridge centre line)"""
    c = w * 0.8
    s = w * 0.5
    return h * (np.exp(-((u - c) / s) ** 2) + np.exp(-((u + c) / s) ** 2)) * 0.85 + h * 0.25 * np.exp(-(u / (w * 1.6)) ** 2)


LINE = catmull(CTRL)
# the double ridge the course runs along continues past both ends of the course (a cycloid-like arc)
RIDGE_CTRL = [(-1400, 3600), (-900, 1600), (-380, 420)] + CTRL + [(1280, -1060), (1700, -900), (2300, -850), (3200, -1100)]
RIDGE = catmull(RIDGE_CTRL, 4.0)
RTREE = cKDTree(RIDGE)
SEG = np.hypot(*np.diff(LINE, axis=0).T)
S = np.concatenate([[0], np.cumsum(SEG)])
TAN = np.gradient(LINE, axis=0)
TAN /= np.linalg.norm(TAN, axis=1, keepdims=True)
TREE = cKDTree(LINE)

# background double ridges: (angle, offset, height, width)
BG = [(rng.uniform(0, np.pi), rng.uniform(-30000, 30000), rng.uniform(50, 170), rng.uniform(140, 320)) for _ in range(60)]
BG += [(0.9, 2600.0, 140.0, 260.0), (2.3, -2400.0, 160.0, 280.0), (0.2, 3300.0, 120.0, 220.0)]
CHAOS_C = np.array([-2600.0, -1900.0])
CHAOS_R = 1900.0
BLOCKS = CHAOS_C + rng.uniform(-1, 1, (140, 2)) * CHAOS_R
BLOCK_H = rng.uniform(40, 110, len(BLOCKS))
BLOCK_TILT = rng.uniform(-0.12, 0.12, (len(BLOCKS), 2))
BTREE = cKDTree(BLOCKS)


def height(X, Z, fine=False):
    pts = np.stack([X.ravel(), Z.ravel()], 1)
    d, i = TREE.query(pts)
    d = d.reshape(X.shape)
    i = i.reshape(X.shape)
    # signed side not needed: both walls are the same distance away
    s = S[i]
    h = noise2(X, Z, 9000, 1) * 60 + noise2(X, Z, 1800, 11) * 12
    # the big double ridge whose central trough holds the course: crests WALL m either side
    rd = TREE.query(pts)[0].reshape(X.shape) * 0 + RTREE.query(pts)[0].reshape(X.shape)
    wall_h = 95 * (1 + 0.25 * noise2(X, Z, 700, 21))
    # broad crests: sharper ones alias into a saw-tooth on the coarse distant mesh
    walls = double_ridge(rd - WALL, wall_h, 85)
    # background ridges, kept out of the course corridor
    bg = np.zeros_like(X)
    for a, off, hh, w in BG:
        u = X * math.cos(a) + Z * math.sin(a) - off
        near = np.abs(u) < w * 4 + 400
        if near.any():
            # a gentle wobble so the ridges are not ruler-straight
            uu = u[near] + 260 * noise2(X[near], Z[near], 6000, 50 + (int(abs(off)) % 997))
            v = double_ridge(uu, hh, w)
            bg[near] = np.maximum(bg[near], v)
    keep = np.clip((rd - 330) / 220, 0, 1)
    keep = keep * keep * (3 - 2 * keep)
    h += np.maximum(walls, bg * keep)
    # chaos: tilted ice blocks in a lowered hummocky matrix
    cd = np.hypot(X - CHAOS_C[0], Z - CHAOS_C[1])
    inside = np.clip((CHAOS_R + 300 - cd) / 600, 0, 1)
    if inside.any():
        # polygonal rafts: Voronoi cells of the block centres, with gaps between neighbours
        bd, bi = BTREE.query(pts, k=2)
        gap = (bd[:, 1] - bd[:, 0]).reshape(X.shape)
        bi = bi[:, 0].reshape(X.shape)
        top = BLOCK_H[bi] + (X - BLOCKS[bi, 0]) * BLOCK_TILT[bi, 0] + (Z - BLOCKS[bi, 1]) * BLOCK_TILT[bi, 1]
        edge = np.clip((gap - 40 - (bi * 37 % 60)) / 30, 0, 1)
        matrix = -25 + noise2(X, Z, 90, 31) * 8
        h += inside * (matrix + edge * (top - matrix))
    # the course: a smooth band of young ice, a gentle bank toward the walls
    band = np.clip((np.minimum(d, rd) - BAND) / 60, 0, 1)
    band = band * band * (3 - 2 * band)
    floor = noise2(X, Z, 9000, 1) * 60 + noise2(X, Z, 1800, 11) * 12
    h = floor + band * (h - floor)
    # jumps: low ridges across the band
    for js in JUMPS:
        h += 3.6 * np.exp(-((s - js) / 11) ** 2) * (1 - np.clip((d - BAND) / 25, 0, 1))
    if fine:
        h += noise2(X, Z, 40, 41, 3) * (0.15 + 0.6 * band) + noise2(X, Z, 9, 43, 2) * 0.12 * band
    return h


def grid(n, s):
    c = (np.arange(n) - (n - 1) / 2) * s
    return np.meshgrid(c, c)


def encode(h, step, offset):
    v = np.clip(np.round((h + offset) / step), 0, 65535).astype(np.uint32)
    rgb = np.zeros(h.shape + (3,), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    return Image.fromarray(rgb, 'RGB')


def bilinear(m, extent, x, z):
    n = m.shape[0]
    fx = np.clip((x + extent / 2) / extent * n - 0.5, 0, n - 1.001)
    fz = np.clip((z + extent / 2) / extent * n - 0.5, 0, n - 1.001)
    i, j = fx.astype(int), fz.astype(int)
    tx, tz = fx - i, fz - j
    return (m[j, i] * (1 - tx) * (1 - tz) + m[j, i + 1] * tx * (1 - tz) + m[j + 1, i] * (1 - tx) * tz + m[j + 1, i + 1] * tx * tz)


def main(out: Path):
    print('course length', round(S[-1]))
    X, Z = grid(NEAR['size'], NEAR['extent'] / NEAR['size'])
    near = height(X, Z)
    land = float(near[(np.hypot(X, Z) < 30)].mean())
    near -= land
    FX, FZ = grid(FAR['size'], FAR['extent'] / FAR['size'])
    far = height(FX, FZ) - land
    print('near', near.min().round(1), near.max().round(1), 'far', far.min().round(1), far.max().round(1))
    encode(near, NEAR['step'], NEAR['offset']).save(out / 'europa_conamara_near.png', optimize=True)
    encode(far, FAR['step'], FAR['offset']).save(out / 'europa_conamara_far.png', optimize=True)
    q = np.asarray(Image.open(out / 'europa_conamara_near.png')).astype(np.float64)
    qn = (q[..., 0] * 256 + q[..., 1]) * NEAR['step'] - NEAR['offset']
    DX, DZ = grid(DETAIL['size'], DETAIL['extent'] / DETAIL['size'])
    fine = height(DX, DZ, fine=True) - land
    res = fine - bilinear(qn, NEAR['extent'], DX, DZ)
    code = np.clip(np.round(res / DETAIL['step']) + 128, 0, 255).astype(np.uint8)
    Image.fromarray(code, 'L').save(out / 'europa_conamara_detail.png', optimize=True)
    print('residual', res.min().round(2), res.max().round(2))
    meta = {
        'site': 'Europa - ice race course near Conamara Chaos (illustrative terrain)',
        'decode': 'height_m = (R * 256 + G) * step - offset; x = east, z = south; pixel (0,0) is the north-west corner',
        'near': {'size': NEAR['size'], 'extent_m': NEAR['extent'], 'step': NEAR['step'], 'offset': NEAR['offset']},
        'far': {'size': FAR['size'], 'extent_m': FAR['extent'], 'step': FAR['step'], 'offset': FAR['offset']},
        'attribution': [
            'Terrain: illustrative reconstruction of Europa double ridges and chaos terrain, modelled on NASA/JPL Galileo SSI images of the Conamara Chaos region. Not measured elevation data.',
        ],
        'licence': ['Generated by tools/terrain/pack_europa.py.'],
        'detail': {
            'size': DETAIL['size'], 'extent_m': DETAIL['extent'], 'step': DETAIL['step'], 'zero': 128,
            'decode': 'height_m = near_map_height(x, z) + (value - 128) * step  (8-bit grayscale, same orientation as near)',
        },
    }
    (out / 'europa_conamara.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    ss = np.arange(0, S[-1], 10.0)
    rx = np.interp(ss, S, LINE[:, 0])
    rz = np.interp(ss, S, LINE[:, 1])
    flat = []
    for x, z in zip(rx, rz):
        flat += [int(round(x)), int(round(z))]
    print('RAW =', json.dumps(flat, separators=(',', ':')))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
