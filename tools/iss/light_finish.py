# 焼いた光（build_module.py が書く $WORK/<module>.light.raw.npy、線形の放射照度）を、アプリ用の絵にする。
#   MODULE=us_lab .venv/bin/python -I tools/iss/light_finish.py
# Blender は使わない（焼き直さずに、明るさの調子だけ何度でもやり直せる）。
# 0. 段階 2：build_module.py が、すきまを埋めてから OpenImageDenoise でならした絵と、島の画素（<module>.light.mask.npy）を
#    書く。そのときは、ここでのぼかしは弱くする（DENOISE 0.8）
# 1. 島（焼いた画素）の中だけでぼかしてノイズを取り、とがった点（ホタル）をおさえる
# 2. すきま（島の外）を近い島の値で埋める（にじみ・継ぎ目を隠す）
# 3. 明るさの調子：明るい面の中央値を TARGET にそろえ、明暗の差を GAMMA で縮める。
#    本物の ISS の写真は、白い壁と多くの照明で、ほぼ一様に明るい（ランプの近くだけ真っ白・奥が真っ黒、にしない）
# 4. ×0.5 で保存（アプリで lightMapIntensity = 2π）。sRGB の JPEG（焼いた大きさ、その 1/2、1/4：
#    アプリは、いる部屋を大きい方で、となりの部屋を小さい方で読む）
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('WORK', '/tmp/iss-work')
OUT_DIR = os.environ.get('OUT_DIR', os.path.join(HERE, '..', '..', 'public', 'models', 'iss'))
LIGHT_STORE = 0.5


def finish(module, size=None, target=None, gamma=None, floor=None, denoise=None, preview_dir=None):
    target = float(os.environ.get('TARGET', '0.9')) if target is None else target
    gamma = float(os.environ.get('GAMMA', '0.55')) if gamma is None else gamma
    floor = float(os.environ.get('FLOOR', '0.22')) if floor is None else floor
    px = np.load(os.path.join(WORK, f'{module}.light.raw.npy')).astype(np.float32)
    mask_path = os.path.join(WORK, f'{module}.light.mask.npy')
    denoised = os.path.exists(mask_path)
    sig = float(os.environ.get('DENOISE', '0.8' if denoised else '1.4')) if denoise is None else denoise
    n = px.shape[0]
    size = size or n
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    # 焼いた画素（島の中）：値が入っている所。真っ黒な隠れた面もすきまと同じに扱う（見えないので、となりの値で埋まってよい）
    if denoised:
        mask = np.load(mask_path).astype(np.float32)
    else:
        mask = (lum > 1e-5).astype(np.float32)
    # ランプの面そのもの（とても明るい）は、まわりのぼかしにまぜない
    cap = np.percentile(lum[mask > 0], 98)
    px = np.minimum(px, cap)
    num = np.stack([ndimage.gaussian_filter(px[..., i] * mask, sig) for i in range(3)], -1)
    den = ndimage.gaussian_filter(mask, sig)[..., None]
    sm = np.where(den > 1e-4, num / np.maximum(den, 1e-4), 0)
    out = np.where(mask[..., None] > 0, np.minimum(px, sm * 2.5) * 0.3 + sm * 0.7, 0)
    idx = ndimage.distance_transform_edt(mask == 0, return_distances=False, return_indices=True)
    out = out[idx[0], idx[1]]
    # 明るさの調子
    lum = out[..., 0] * 0.2126 + out[..., 1] * 0.7152 + out[..., 2] * 0.0722
    lit = lum[(mask > 0) & (lum > 0.15 * np.median(lum[mask > 0]))]
    ref = float(np.median(lit))
    tl = target * np.power(np.maximum(lum, 1e-6) / ref, gamma)
    # やわらかい頭打ち（2.0 まで）と、いちばん暗い所の下限（白い部屋の、まわりからの照り返し）
    tl = 2.0 * np.tanh(tl / 2.0)
    tl = np.maximum(tl, floor)
    out = out * (tl / np.maximum(lum, 1e-6))[..., None]
    out = np.clip(out * LIGHT_STORE, 0, 1)
    srgb = np.where(out <= 0.0031308, out * 12.92, 1.055 * np.power(out, 1 / 2.4) - 0.055)
    rgb8 = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]
    im = Image.fromarray(rgb8, 'RGB')
    if size != n:
        im = im.resize((size, size), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    paths = []
    for s in (size, size // 2, size // 4):
        p = os.path.join(OUT_DIR, f'{module}.light.{s}.jpg')
        (im if s == size else im.resize((s, s), Image.LANCZOS)).save(p, quality=88, optimize=True)
        paths.append(p)
        print('wrote', p, os.path.getsize(p) // 1024, 'KB')
    if preview_dir:
        im.resize((1024, 1024), Image.LANCZOS).save(os.path.join(preview_dir, f's1-bake-{module}-lightmap.jpg'), quality=85)
    stats = {'ref': ref, 'target': target, 'gamma': gamma, 'floor': floor, 'coverage': float(mask.mean())}
    print('light', json.dumps(stats))
    return stats


if __name__ == '__main__':
    finish(os.environ.get('MODULE', 'us_lab'), preview_dir=os.environ.get('PREVIEW_DIR'))
    sys.exit(0)
