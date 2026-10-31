"""天の川の淡い光だけの全天画像 public/textures/milky_way_glow.jpg を作る。

元の 2k_stars_milky_way.jpg（Solar System Scope, CC BY 4.0）から、にじんだ星の点を削って（メディアンフィルタ）、
暗い階調が残るように明るく引き伸ばす（アプリ側で暗く掛ける）。星そのものは星表（public/stars/bsc5.bin）の鋭い点で描く。
使い方: python3 scripts/build-milkyway-glow.py（Pillow と numpy が要る）
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter



root = Path(__file__).resolve().parent.parent / 'public' / 'textures'
# 色は JPEG のにじみで紫に転ぶので、明るさだけ使い、少し温かい白にする
im = Image.open(root / '2k_stars_milky_way.jpg').convert('L')
a = np.asarray(im, dtype=np.float32)
# 星の点（数ピクセル）だけを削る：まわりの明るさ（7 ピクセルのメディアン）より少し上で頭打ちにする。
# 天の川のざらざらした細かい模様（見分けられないほど遠い星の集まり）は残す
m = np.asarray(im.filter(ImageFilter.MedianFilter(7)), dtype=np.float32)
a = np.minimum(a, m * 1.25 + 2)
# 一番明るい銀河の中心が白になるように
a = np.clip(a / max(np.percentile(a, 99.98), 1), 0, 1)
rgb = np.stack([a, a * 0.96, a * 0.9], -1)
Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(root / 'milky_way_glow.jpg', quality=92)
print('saved', root / 'milky_way_glow.jpg')
