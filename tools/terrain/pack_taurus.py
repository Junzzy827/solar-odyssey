"""Pack the Moon race site (Apollo 17, Taurus-Littrow valley) into the app's terrain files, and write the race line.

Sources
  near + detail : Apollo 17 landing site DTM, 1.5 m/px, from LROC NAC stereo (Haase et al. 2018, USGS Astrogeology),
                  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Apollo17/APOLLO17_DTM_150CM.TIFF
  far           : LRO LOLA + SELENE Kaguya TC DEM merge 60N60S, 512 ppd (~59 m), read remotely.

Output (same layout as pack_coprates.py, so dem.ts reads it unchanged)
  public/terrain/moon_taurus.json, _near.png (6.4 km), _far.png (100 km), _detail.png (3.2 km)
  and prints RAW for src/data/moonCourse.ts (race line, 10 m spacing, app x = east, z = south)

usage: python3 tools/terrain/pack_taurus.py APOLLO17_DTM_150CM.TIFF public/terrain/ route.npy
  route.npy: smoothed race line in "6 m planning pixels" (DTM pixel = PLAN_X0 + 4 * px, PLAN_Y0 + 4 * py), first point = app origin
"""
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject, transform as warp_xy
from rasterio.windows import from_bounds
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')

LOLA = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/LolaKaguya_Topo/Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif'
MOON_R = 1737400.0
# planning grid origin (DTM px) used when the route was drawn
PLAN_X0, PLAN_Y0 = 2503, 1697
# DTM columns where two NAC stereo models meet: noisy stripe, smoothed away
SEAM = (4990, 5290)

# 6.25 m per pixel; wide enough to drive to the Apollo 17 stations (station 2 at 7.2 km)
NEAR = dict(size=2560, step=0.05, offset=1000.0, extent=16000.0)
FAR = dict(size=512, step=0.25, offset=4000.0, extent=100000.0)
DETAIL = dict(size=2048, extent=3200.0, step=0.01)


def aeqd(lat, lon, n, s):
    crs = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +R={MOON_R} +units=m +no_defs +type=crs')
    tr = Affine(s, 0, -(n / 2) * s, 0, -s, (n / 2) * s)
    return crs, tr


def load_dtm(path):
    with rasterio.open(path) as d:
        a = d.read(1).astype(np.float32)
        tr, crs = d.transform, d.crs
    a[a < -1e30] = np.nan
    # seam: blend in a smoothed copy across the stripe (soft edges)
    c0, c1 = SEAM
    band = a[:, c0 - 40:c1 + 40].copy()
    sm = gaussian_filter(np.nan_to_num(band, nan=float(np.nanmean(band))), 10)
    w = np.ones(band.shape[1])
    ramp = np.linspace(0, 1, 40)
    w[:40] = ramp
    w[-40:] = ramp[::-1]
    a[:, c0 - 40:c1 + 40] = band * (1 - w) + sm * w
    return a, tr, crs


def dtm_to(a, tr, crs, lat, lon, n, s):
    dcrs, dtr = aeqd(lat, lon, n, s)
    out = np.full((n, n), np.nan, np.float32)
    reproject(a, out, src_transform=tr, src_crs=crs, src_nodata=np.nan, dst_transform=dtr, dst_crs=dcrs,
              dst_nodata=np.nan, resampling=Resampling.average)
    return out.astype(np.float64)


def lola(lat, lon, n, s):
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', GDAL_HTTP_MULTIRANGE='YES', VSI_CACHE='TRUE')
    with rasterio.Env(**env), rasterio.open('/vsicurl/' + LOLA) as d:
        k = math.pi / 180 * MOON_R
        half = n * s / 2 * 1.5
        hx = half / math.cos(math.radians(lat))
        w = from_bounds(lon * k - hx, lat * k - half, lon * k + hx, lat * k + half, d.transform).round_offsets().round_lengths()
        a = d.read(1, window=w).astype(np.float32) * float(d.scales[0])
        src_tr, src_crs = d.window_transform(w), d.crs
    crs, tr = aeqd(lat, lon, n, s)
    out = np.full((n, n), np.nan, np.float32)
    reproject(a, out, src_transform=src_tr, src_crs=src_crs, dst_transform=tr, dst_crs=crs, dst_nodata=np.nan, resampling=Resampling.bilinear)
    return out.astype(np.float64)


def encode(h, step, offset):
    code = np.clip(np.round((h + offset) / step), 0, 65535).astype(np.uint16)
    rgb = np.zeros(code.shape + (3,), np.uint8)
    rgb[..., 0] = code >> 8
    rgb[..., 1] = code & 255
    return Image.fromarray(rgb, 'RGB')


def bilinear(m, extent, x, z):
    n = m.shape[0]
    fx = np.clip((x + extent / 2) / extent * n - 0.5, 0, n - 1.001)
    fz = np.clip((z + extent / 2) / extent * n - 0.5, 0, n - 1.001)
    i = np.floor(fx).astype(int)
    j = np.floor(fz).astype(int)
    tx, tz = fx - i, fz - j
    a, b, c, d = m[j, i], m[j, i + 1], m[j + 1, i], m[j + 1, i + 1]
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz


def grid(n, s):
    c = (np.arange(n) - (n - 1) / 2) * s
    return np.meshgrid(c, c)


def main(img, out: Path, route):
    a, tr, crs = load_dtm(img)
    ps = np.load(route)
    # DTM pixel centres of the route -> map coords -> lon/lat
    px = PLAN_X0 + 4 * ps[:, 0] + 0.5
    py = PLAN_Y0 + 4 * ps[:, 1] + 0.5
    mx = tr.c + px * tr.a
    my = tr.f + py * tr.e
    geo = CRS.from_proj4(f'+proj=longlat +R={MOON_R} +no_defs +type=crs')
    lons, lats = warp_xy(crs, geo, list(mx), list(my))
    lat, lon = lats[0], lons[0]
    print('origin', round(lat, 5), round(lon, 5))
    crs0, _ = aeqd(lat, lon, 2, 1)
    ex, ny = warp_xy(geo, crs0, lons, lats)
    line = np.stack([np.array(ex), -np.array(ny)], 1)
    # resample every 10 m
    seg = np.hypot(*np.diff(line, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    ss = np.arange(0, s[-1], 10.0)
    rx = np.interp(ss, s, line[:, 0])
    rz = np.interp(ss, s, line[:, 1])
    print('course length', round(s[-1]))

    ns = NEAR['extent'] / NEAR['size']
    near = dtm_to(a, tr, crs, lat, lon, NEAR['size'], ns)
    far = lola(lat, lon, FAR['size'], FAR['extent'] / FAR['size'])
    X, Z = grid(NEAR['size'], ns)
    r = np.hypot(X, Z)
    land = np.nanmean(near[r < 40])
    fx = bilinear(np.nan_to_num(far, nan=np.nanmean(far)), FAR['extent'], X, Z)
    ring = (r > 1500) & (r < 3000) & ~np.isnan(near)
    shift = np.mean(near[ring] - fx[ring])
    far = far + shift
    fx = fx + shift
    hole = binary_dilation(np.isnan(near), iterations=6)
    if hole.any():
        d = distance_transform_edt(~hole) * ns
        k = np.clip(d / 300, 0, 1)
        k = k * k * (3 - 2 * k)
        near = np.where(hole, fx, np.nan_to_num(near) * k + fx * (1 - k))
    near -= land
    far -= land
    print('near', near.min().round(1), near.max().round(1), 'holes', hole.mean().round(3), 'far', np.nanmin(far).round(1), np.nanmax(far).round(1), 'shift', round(shift, 1))
    far = np.nan_to_num(far, nan=float(np.nanmean(far)))
    encode(near, NEAR['step'], NEAR['offset']).save(out / 'moon_taurus_near.png', optimize=True)
    encode(far, FAR['step'], FAR['offset']).save(out / 'moon_taurus_far.png', optimize=True)

    dn, ds = DETAIL['size'], DETAIL['extent'] / DETAIL['size']
    fine = dtm_to(a, tr, crs, lat, lon, dn, ds) - land
    q = np.asarray(Image.open(out / 'moon_taurus_near.png')).astype(np.float64)
    qn = (q[..., 0] * 256 + q[..., 1]) * NEAR['step'] - NEAR['offset']
    DX, DZ = grid(dn, ds)
    up = bilinear(qn, NEAR['extent'], DX, DZ)
    res = np.nan_to_num(fine - up, nan=0.0)
    hk = np.asarray(Image.fromarray((~hole).astype(np.uint8) * 255).resize((dn, dn), Image.BILINEAR)).astype(np.float64) / 255
    res *= hk
    code = np.clip(np.round(res / DETAIL['step']) + 128, 0, 255).astype(np.uint8)
    Image.fromarray(code, 'L').save(out / 'moon_taurus_detail.png', optimize=True)
    print('residual', res.min().round(2), res.max().round(2), 'clipped', float((np.abs(res) > 1.27).mean()))

    meta = {
        'site': 'Moon - Taurus-Littrow valley, Apollo 17 landing site (race track)',
        'decode': 'height_m = (R * 256 + G) * step - offset; x = east, z = south; pixel (0,0) is the north-west corner',
        'near': {'size': NEAR['size'], 'extent_m': NEAR['extent'], 'step': NEAR['step'], 'offset': NEAR['offset']},
        'far': {'size': FAR['size'], 'extent_m': FAR['extent'], 'step': FAR['step'], 'offset': FAR['offset'], 'shift_m': round(float(shift), 2)},
        'centre_lat': round(lat, 5),
        'centre_lon': round(lon, 5),
        'attribution': [
            'Elevation: Apollo 17 landing site DTM 1.5 m (LROC NAC), Haase, I. et al. (2018), Coordinates and Maps of the Apollo 17 Landing Site, Earth and Space Science; USGS Astrogeology. NASA/GSFC/Arizona State University.',
            'Elevation: LRO LOLA and SELENE Kaguya TC DEM merge 60N60S 512 ppd, Barker, M.K. et al. (2016); USGS Astrogeology. NASA/GSFC, JAXA.',
        ],
        'licence': ['NASA PDS / USGS Astrogeology products, free to use with credit.'],
        'detail': {
            'size': dn, 'extent_m': DETAIL['extent'], 'step': DETAIL['step'], 'zero': 128,
            'decode': 'height_m = near_map_height(x, z) + (value - 128) * step  (8-bit grayscale, same orientation as near)',
            'source': 'Apollo 17 DTM 1.5 m -> 1.5625 m',
        },
    }
    (out / 'moon_taurus.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    flat = []
    for x, z in zip(rx, rz):
        flat += [int(round(x)), int(round(z))]
    print('RAW =', json.dumps(flat, separators=(',', ':')))


if __name__ == '__main__':
    main(sys.argv[1], Path(sys.argv[2]), sys.argv[3])
