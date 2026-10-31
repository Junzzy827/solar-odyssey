"""Pack the real elevation maps (built by the terrain fetch scripts, see /mnt/project-files/terrain/README.md)
into small files the app can load in a browser.

Input : <src>/<name>_near.png / _far.png  (16-bit grayscale, elevation = min + value * step, see the .json sidecars)
Output: public/terrain/<id>_near.png / _far.png  (8-bit RGB: R = high byte, G = low byte of a 16-bit height code)
        public/terrain/<id>.json                  (how to decode, extent, attribution)

Heights are stored relative to the landing spot (0 m there). The far map is shifted so that it meets the near map
at the near map's edge (the two source datasets differ by a few metres).

usage: python3 tools/terrain/pack_dem.py /mnt/project-files/terrain/ public/terrain/
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SITES = {'mars': 'mars_gale', 'earth': 'earth_monument_valley'}
NEAR = dict(size=1024, step=0.05, offset=1000.0)
FAR = dict(size=512, step=0.25, offset=2000.0)


def load(src: Path, name: str):
    meta = json.loads((src / f'{name}.json').read_text())
    raw = np.asarray(Image.open(src / f'{name}.png')).astype(np.float64)
    elev = meta['elevation_min_m'] + raw * meta['height_step_m']
    return elev, meta


def shrink(a: np.ndarray, size: int):
    f = a.shape[0] // size
    return a.reshape(size, f, size, f).mean(axis=(1, 3))


def ring_mean(a: np.ndarray, extent: float, r0: float, r1: float):
    n = a.shape[0]
    c = (np.arange(n) - (n - 1) / 2) * (extent / n)
    x, z = np.meshgrid(c, c)
    r = np.hypot(x, z)
    return a[(r >= r0) & (r <= r1)].mean()


def encode(h: np.ndarray, step: float, offset: float):
    code = np.clip(np.round((h + offset) / step), 0, 65535).astype(np.uint16)
    rgb = np.zeros(code.shape + (3,), np.uint8)
    rgb[..., 0] = code >> 8
    rgb[..., 1] = code & 255
    return Image.fromarray(rgb, 'RGB')


def main(src: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for app_id, name in SITES.items():
        near, mn = load(src, f'{name}_near')
        far, mf = load(src, f'{name}_far')
        near = shrink(near - mn['landing_elevation_m'], NEAR['size'])
        far = shrink(far - mf['landing_elevation_m'], FAR['size'])
        ext_n = mn['extent_m']
        ext_f = mf['extent_m']
        # 遠くの地図を、近くの地図のふち（2.6〜3.1 km の輪）で高さがそろうようにずらす
        shift = ring_mean(near, ext_n, 2600, 3100) - ring_mean(far, ext_f, 2600, 3100)
        far = far + shift
        encode(near, NEAR['step'], NEAR['offset']).save(out / f'{app_id}_near.png', optimize=True)
        encode(far, FAR['step'], FAR['offset']).save(out / f'{app_id}_far.png', optimize=True)
        meta = {
            'site': mn['site'],
            'decode': 'height_m = (R * 256 + G) * step - offset; x = east, z = south; pixel (0,0) is the north-west corner',
            'near': {'size': NEAR['size'], 'extent_m': ext_n, 'step': NEAR['step'], 'offset': NEAR['offset']},
            'far': {'size': FAR['size'], 'extent_m': ext_f, 'step': FAR['step'], 'offset': FAR['offset'], 'shift_m': round(shift, 2)},
            'centre_lat': mn['centre_lat'],
            'centre_lon': mn['centre_lon'],
            'attribution': [mn['attribution'], mf['attribution']],
            'licence': [mn['licence'], mf['licence']],
        }
        (out / f'{app_id}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))
        print(app_id, 'near', near.min().round(1), near.max().round(1), 'far', far.min().round(1), far.max().round(1), 'shift', round(shift, 2))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
