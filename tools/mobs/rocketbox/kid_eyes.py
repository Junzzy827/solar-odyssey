# Paint toon eyes into a Rocketbox glb's head texture: bigger iris, dark rim, catchlight. usage: eyes.py in.glb out.glb scale
import json, struct, io, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, dst, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
HL = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0  # catchlight size
SKIN = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0  # shadow lift on skin
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); bo = 20 + jl + 8
binc = bytearray(b[bo:])
head = next(m for m in j['materials'] if m['name'].endswith('_head'))
ti = head['pbrMetallicRoughness']['baseColorTexture']['index']; ii = j['textures'][ti]['source']
bv = j['bufferViews'][j['images'][ii]['bufferView']]
off = bv.get('byteOffset', 0); data = bytes(binc[off:off + bv['byteLength']])
im = Image.open(io.BytesIO(data)).convert('RGB'); W, H = im.size
a = np.asarray(im).astype(np.float32)
# eyeball region: top-left area of the atlas (x 18-37 %, y 0-16 %)
x0, x1, y0, y1 = int(W * .18), int(W * .37), 0, int(H * .16)
reg = a[y0:y1, x0:x1].mean(2)
bright = np.percentile(reg, 92)  # sclera
by, bx = np.nonzero(reg > bright * 0.85); cy0, cx0 = by.mean(), bx.mean()
Rs = np.sqrt(len(by) / np.pi)  # sclera disk radius
yy, xx = np.mgrid[0:reg.shape[0], 0:reg.shape[1]]
inside = np.hypot(yy - cy0, xx - cx0) < Rs * 0.85
dark = inside & (reg < bright * 0.6)
ys, xs = np.nonzero(dark)
cy, cx = ys.mean() + y0, xs.mean() + x0
R = max(6, np.sqrt(dark.sum() / np.pi))
ring = [(y, x) for y in range(int(cy - R), int(cy + R) + 1) for x in range(int(cx - R), int(cx + R) + 1) if 0.5 * R < np.hypot(y - cy, x - cx) < 0.9 * R]
col = np.median(np.array([a[y, x] for y, x in ring]), 0)
# a clearer, a bit more saturated iris colour
g = col.mean(); col = np.clip(g + (col - g) * 1.6 + 10, 0, 255)
R2 = R * scale
S = 4
big = Image.new('RGBA', (int(R2 * 2 * S + 8 * S),) * 2, (0, 0, 0, 0)); dr = ImageDraw.Draw(big); c = big.size[0] / 2
for k in range(40, 0, -1):
    t = k / 40; rr = R2 * S * t
    shade = 0.55 + 0.45 * (1 - t) ** 0.7  # lighter toward the centre
    cc = tuple(int(v * shade) for v in col) + (255,)
    dr.ellipse((c - rr, c - rr, c + rr, c + rr), fill=cc)
dr.ellipse((c - R2 * S, c - R2 * S, c + R2 * S, c + R2 * S), outline=tuple(int(v * 0.35) for v in col) + (255,), width=int(R2 * S * 0.16))
pr = R2 * S * 0.42; dr.ellipse((c - pr, c - pr, c + pr, c + pr), fill=(14, 10, 10, 255))
hr = R2 * S * 0.24 * HL; hx, hy = c - R2 * S * 0.38, c + R2 * S * 0.38
dr.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), fill=(255, 255, 255, 255))
hr2 = hr * (0.45 if HL == 1 else 0.55); dr.ellipse((c + R2 * S * 0.35 - hr2, c - R2 * S * 0.32 - hr2, c + R2 * S * 0.35 + hr2, c - R2 * S * 0.32 + hr2), fill=(255, 255, 255, 220))
small = big.resize((big.size[0] // S,) * 2, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))
if SKIN > 0:
    A = np.asarray(im).astype(np.float32)
    L = A.mean(2)
    bl = np.asarray(Image.fromarray(L.astype(np.uint8)).filter(ImageFilter.GaussianBlur(W / 45))).astype(np.float32)
    skin = (A[..., 0] > A[..., 2] + 8) & (L > 40)
    lift = np.clip(bl - L, 0, 28) * SKIN * skin
    yy, xx = np.mgrid[0:H, 0:W]
    lift[(xx < W * 0.40) & (yy < H * 0.18)] = 0  # keep the eyeball atlas
    A2 = A + lift[..., None] * (A / np.maximum(L[..., None], 1))
    sm = np.asarray(Image.fromarray(np.clip(A2, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)
    A2 = A2 * (1 - 0.5 * skin[..., None]) + sm * 0.5 * skin[..., None]
    A2[(xx < W * 0.40) & (yy < H * 0.18)] = A[(xx < W * 0.40) & (yy < H * 0.18)]
    im = Image.fromarray(np.clip(A2, 0, 255).astype(np.uint8))
im.paste(small, (int(cx - small.size[0] / 2), int(cy - small.size[1] / 2)), small)
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90); new = buf.getvalue()
# rebuild the binary chunk with the new image
delta = len(new) - bv['byteLength']; pad = (-(len(binc) + delta)) % 4
binc = binc[:off] + new + binc[off + bv['byteLength']:] + b'\0' * pad
bv['byteLength'] = len(new)
for v in j['bufferViews']:
    if v is not bv and v.get('byteOffset', 0) > off: v['byteOffset'] = v.get('byteOffset', 0) + delta
j['buffers'][0]['byteLength'] = len(binc)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + binc
open(dst, 'wb').write(out)
print(src, 'iris at', round(cx), round(cy), 'R', round(R, 1), 'col', col.astype(int))
