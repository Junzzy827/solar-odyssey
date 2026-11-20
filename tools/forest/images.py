# 森の部品の画像を作る（tools/forest/bake.mjs から呼ぶ）。
#   python3 -I images.py <元の素材の場所> <出す場所> <一覧の JSON>
# 切り抜きのある葉は、色と切り抜きを 1 枚（透明つきの WebP）にまとめる。切り抜きの外の色は、ふちの色で埋める
# （縮めたときに黒いふちが出ないように）。大きい方と、その半分（スマホ用、名前に .half）を出す。
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

raw, out, spec = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
os.makedirs(out, exist_ok=True)


def bleed(rgb, mask, rounds=24):
    """切り抜きの外を、近くの中の色で埋める"""
    rgb = rgb.astype(np.float32)
    known = mask.copy()
    for _ in range(rounds):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        fill = (~known) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][..., None]
        known |= fill
    if not known.all():
        mean = rgb[mask].mean(0) if mask.any() else np.array([60, 80, 40], np.float32)
        rgb[~known] = mean
    return rgb.clip(0, 255).astype(np.uint8)


for im in spec:
    src = Image.open(os.path.join(raw, im['src'])).convert('RGB')
    size = im['size']
    if im.get('alpha'):
        a = Image.open(os.path.join(raw, im['alpha'])).convert('L').resize(src.size, Image.LANCZOS)
        mask = np.asarray(a) > 96
        rgb = Image.fromarray(bleed(np.asarray(src), mask))
        src = Image.merge('RGBA', (*rgb.split(), a))
    sizes = [(size, '')] + ([(size // 2, '.half')] if im.get('half', True) else [])
    for s, tag in sizes:
        img = src.resize((s, s), Image.LANCZOS) if src.size != (s, s) else src
        path = os.path.join(out, f"{im['out']}{tag}.webp")
        # 凹凸の画像は色がにじむと向きが狂うので、質を高めに
        img.save(path, 'WEBP', quality=90 if im.get('data') else 84, method=6, alpha_quality=92)
        print(f"{os.path.basename(path):28s} {s:5d} px {os.path.getsize(path) / 1024:7.0f} KB")
