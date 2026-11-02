"""Pack the fine "detail" map for the wide rover area (Mars only for now).

The app's near map is 6.25 m per pixel. Around the landing spot the rover can drive +-1.5 km, so we add a finer map
over 3.2 km (1.5625 m per pixel) taken from the 1 m source mosaic. To keep the file small it stores only the
difference from the near map (what the near map cannot show: small craters, ledges, ridges), as an 8-bit
grayscale PNG: residual_m = (value - 128) * step.

Input : a window of the 1 m source read with /mnt/project-files/terrain/scripts/fetch.py
        (python3 fetch.py <MSL_Gale_DEM_Mosaic_1m_v3.tif url> -4.5890 137.4366 1750 gale_detail_src.npz)
        and the projection helper warp.py next to it.
Output: public/terrain/mars_detail.png and a "detail" entry in public/terrain/mars.json

Run it after pack_dem.py (which rewrites mars.json).

usage: python3 tools/terrain/pack_detail.py <gale_detail_src.npz> <dir with warp.py> public/terrain/
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

N, S = 2048, 1.5625  # 3.2 km
STEP = 0.01
LAT, LON = -4.5890, 137.4366
LANDING_ELEVATION = -4498.9  # mars_gale_near.json landing_elevation_m


def main(npz: str, scripts: str, out: Path):
    sys.path.insert(0, scripts)
    from rasterio.warp import Resampling
    from warp import warp

    h, _, _ = warp(npz, LAT, LON, N, S, 'mars', Resampling.average)
    assert not np.isnan(h).any()
    h = h - LANDING_ELEVATION
    meta = json.loads((out / 'mars.json').read_text())
    nm = meta['near']
    im = np.asarray(Image.open(out / 'mars_near.png')).astype(np.float64)
    near = (im[..., 0] * 256 + im[..., 1]) * nm['step'] - nm['offset']
    n = nm['size']
    c = (np.arange(N) - (N - 1) / 2) * S
    f = (c + nm['extent_m'] / 2) / nm['extent_m'] * n - 0.5
    i = np.floor(f).astype(int)
    t = f - i
    X, Z = np.meshgrid(i, i)
    TX, TZ = np.meshgrid(t, t)
    a, b, cc, d = near[Z, X], near[Z, X + 1], near[Z + 1, X], near[Z + 1, X + 1]
    up = a + (b - a) * TX + (cc - a) * TZ + (a - b - cc + d) * TX * TZ
    r = h - up
    code = np.clip(np.round(r / STEP) + 128, 0, 255).astype(np.uint8)
    Image.fromarray(code, 'L').save(out / 'mars_detail.png', optimize=True)
    meta['detail'] = {
        'size': N, 'extent_m': N * S, 'step': STEP, 'zero': 128,
        'decode': 'height_m = near_map_height(x, z) + (value - 128) * step  (8-bit grayscale, same orientation as near)',
        'source': 'MSL_Gale_DEM_Mosaic_1m_v3, GDAL average 1 m -> 1.5625 m',
    }
    (out / 'mars.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print('residual', r.min().round(2), r.max().round(2), 'clipped', float((np.abs(r) > 1.27).mean()))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], Path(sys.argv[3]))
