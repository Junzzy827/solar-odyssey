"""Pack the Valles Marineris race site (Coprates Chasma floor) into the app's terrain files.

Sources
  near + detail : HiRISE DTM DTEEC_018347_1660_026417_1660_A01 ("Along the Floor of Coprates Chasma", 1 m/px),
                  https://www.uahirise.org/PDS/DTM/ESP/ORB_018300_018399/ESP_018347_1660_ESP_026417_1660/
  far           : Mars MGS MOLA - MEX HRSC Blended DEM Global 200 m v2 (USGS Astrogeology), read remotely.

Output (same layout as pack_dem.py + pack_detail.py, so dem.ts reads it unchanged)
  public/terrain/mars_coprates.json, _near.png (6.4 km, 6.25 m), _far.png (100 km), _detail.png (3.2 km, 1.5625 m)

The site centre (app origin, where the lander stands and the race starts) is the DTM pixel ORIGIN below.
Where the narrow HiRISE strip has no data, the near map falls back to the far map.

usage: python3 tools/terrain/pack_coprates.py <DTEEC_...IMG> public/terrain/
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
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')

# HiRISE DTM label values
RECORD_BYTES, LINES, SAMPLES = 26220, 15377, 6555
SCALE = 1.0106411505385
LINE_OFF, SAMPLE_OFF = -804958.50000001, 2994.5
LAT_TS, LON0 = -10.0, 300.97
R_HIRISE = 3395582.0270805

# app origin: (sample, line) in the DTM. Start line of the race, on the canyon floor
ORIGIN = (2760, 5820)

HRSC = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.vrt'
MARS_R = 3396190.0

NEAR = dict(size=1024, step=0.05, offset=1000.0, extent=6400.0)
FAR = dict(size=512, step=0.25, offset=2000.0, extent=100000.0)
DETAIL = dict(size=2048, extent=3200.0, step=0.01)


def origin_latlon():
    s, l = ORIGIN
    x = (s - SAMPLE_OFF) * SCALE
    y = (LINE_OFF - l) * SCALE
    lat = math.degrees(y / R_HIRISE)
    lon = LON0 + math.degrees(x / (R_HIRISE * math.cos(math.radians(LAT_TS))))
    return lat, lon


def aeqd(lat, lon, n, s):
    crs = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +R={MARS_R} +units=m +no_defs +type=crs')
    tr = Affine(s, 0, -(n / 2) * s, 0, -s, (n / 2) * s)
    return crs, tr


def hirise(img: str, lat, lon, n, s):
    a = np.memmap(img, dtype='<f4', mode='r', offset=RECORD_BYTES, shape=(LINES, SAMPLES))
    # only the lines around the site (the strip is narrow; +-4.6 km covers the 6.4 km square diagonal)
    l0 = max(0, ORIGIN[1] - 4600)
    l1 = min(LINES, ORIGIN[1] + 4600)
    src = np.array(a[l0:l1], dtype=np.float32)
    src[src < -1e5] = np.nan
    src_crs = CRS.from_proj4(f'+proj=eqc +lat_ts={LAT_TS} +lat_0=0 +lon_0={LON0} +R={R_HIRISE} +units=m +no_defs +type=crs')
    src_tr = Affine(SCALE, 0, -SAMPLE_OFF * SCALE, 0, -SCALE, (LINE_OFF - l0) * SCALE)
    crs, tr = aeqd(lat, lon, n, s)
    out = np.full((n, n), np.nan, np.float32)
    reproject(src, out, src_transform=src_tr, src_crs=src_crs, src_nodata=np.nan, dst_transform=tr, dst_crs=crs,
              dst_nodata=np.nan, resampling=Resampling.average)
    return out.astype(np.float64)


def hrsc(lat, lon, n, s):
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', VSI_CACHE='TRUE')
    with rasterio.Env(**env), rasterio.open('/vsicurl/' + HRSC) as d:
        k = math.pi / 180 * MARS_R
        lo = lon - 360 if lon > 180 else lon
        half = n * s / 2 * 1.5
        hx = half / math.cos(math.radians(lat))
        w = from_bounds(lo * k - hx, lat * k - half, lo * k + hx, lat * k + half, d.transform).round_offsets().round_lengths()
        a = d.read(1, window=w).astype(np.float32)
        a[a == d.nodata] = np.nan
        src_tr = d.window_transform(w)
        src_crs = d.crs
    crs, tr = aeqd(lat, lon if lon <= 180 else lon - 360, n, s)
    out = np.full((n, n), np.nan, np.float32)
    reproject(a, out, src_transform=src_tr, src_crs=src_crs, src_nodata=np.nan, dst_transform=tr, dst_crs=crs,
              dst_nodata=np.nan, resampling=Resampling.bilinear)
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


def main(img: str, out: Path):
    lat, lon = origin_latlon()
    print('origin', round(lat, 5), round(lon, 5))
    ns = NEAR['extent'] / NEAR['size']
    near = hirise(img, lat, lon, NEAR['size'], ns)
    far = hrsc(lat, lon, FAR['size'], FAR['extent'] / FAR['size'])
    # landing elevation: mean of the HiRISE heights within 40 m
    X, Z = grid(NEAR['size'], ns)
    r = np.hypot(X, Z)
    land = np.nanmean(near[r < 40])
    # far meets near on the ring 1.5-2.8 km (where both have data)
    fx = bilinear(np.nan_to_num(far, nan=np.nanmean(far)), FAR['extent'], X, Z)
    ring = (r > 1500) & (r < 2800) & ~np.isnan(near)
    shift = np.mean(near[ring] - fx[ring])
    far = far + shift
    fx = fx + shift
    # holes in the strip: far map, blended over 150 m so the edge of the strip has no step
    # the outer ~60 m of the strip is noisy (stereo edge), so treat it as a hole too
    from scipy.ndimage import binary_dilation, distance_transform_edt
    hole = binary_dilation(np.isnan(near), iterations=10)
    if hole.any():
        d = distance_transform_edt(~hole) * ns
        k = np.clip(d / 300, 0, 1)
        k = k * k * (3 - 2 * k)
        near = np.where(hole, fx, np.nan_to_num(near) * k + fx * (1 - k))
    near -= land
    far -= land
    print('near', near.min().round(1), near.max().round(1), 'holes', hole.mean().round(3), 'far', np.nanmin(far).round(1), np.nanmax(far).round(1), 'shift', round(shift, 1))
    far = np.nan_to_num(far, nan=float(np.nanmean(far)))
    encode(near, NEAR['step'], NEAR['offset']).save(out / 'mars_coprates_near.png', optimize=True)
    encode(far, FAR['step'], FAR['offset']).save(out / 'mars_coprates_far.png', optimize=True)

    # detail: residual of the 1.5625 m map against the near map as the app decodes it
    dn, ds = DETAIL['size'], DETAIL['extent'] / DETAIL['size']
    fine = hirise(img, lat, lon, dn, ds) - land
    q = np.asarray(Image.open(out / 'mars_coprates_near.png')).astype(np.float64)
    qn = (q[..., 0] * 256 + q[..., 1]) * NEAR['step'] - NEAR['offset']
    DX, DZ = grid(dn, ds)
    up = bilinear(qn, NEAR['extent'], DX, DZ)
    res = np.nan_to_num(fine - up, nan=0.0)
    # fade the detail out where the near map is the far-map fill
    hk = np.asarray(Image.fromarray((~hole).astype(np.uint8) * 255).resize((dn, dn), Image.BILINEAR)).astype(np.float64) / 255
    res *= hk
    code = np.clip(np.round(res / DETAIL['step']) + 128, 0, 255).astype(np.uint8)
    Image.fromarray(code, 'L').save(out / 'mars_coprates_detail.png', optimize=True)
    print('residual', res.min().round(2), res.max().round(2), 'clipped', float((np.abs(res) > 1.27).mean()))

    meta = {
        'site': 'Mars - Valles Marineris, floor of Coprates Chasma (race track)',
        'decode': 'height_m = (R * 256 + G) * step - offset; x = east, z = south; pixel (0,0) is the north-west corner',
        'near': {'size': NEAR['size'], 'extent_m': NEAR['extent'], 'step': NEAR['step'], 'offset': NEAR['offset']},
        'far': {'size': FAR['size'], 'extent_m': FAR['extent'], 'step': FAR['step'], 'offset': FAR['offset'], 'shift_m': round(float(shift), 2)},
        'centre_lat': round(lat, 5),
        'centre_lon': round(lon, 5),
        'attribution': [
            'Elevation: HiRISE DTM DTEEC_018347_1660_026417_1660_A01 (Along the Floor of Coprates Chasma), NASA/JPL/University of Arizona.',
            'Elevation: Mars MGS MOLA - MEX HRSC Blended DEM Global 200 m v2 - Fergason, R.L., Hare, T.M. and Laura, J. (2018), Astrogeology PDS Annex, U.S. Geological Survey. MOLA: NASA/GSFC; HRSC: ESA/DLR/FU Berlin.',
        ],
        'licence': [
            'HiRISE products are NASA PDS data, free to use with credit to NASA/JPL/University of Arizona.',
            'USGS Astrogeology product. Use Constraints "None"; please cite authors.',
        ],
        'detail': {
            'size': dn, 'extent_m': DETAIL['extent'], 'step': DETAIL['step'], 'zero': 128,
            'decode': 'height_m = near_map_height(x, z) + (value - 128) * step  (8-bit grayscale, same orientation as near)',
            'source': 'HiRISE DTEEC_018347_1660_026417_1660_A01, average 1 m -> 1.5625 m',
        },
    }
    (out / 'mars_coprates.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main(sys.argv[1], Path(sys.argv[2]))
