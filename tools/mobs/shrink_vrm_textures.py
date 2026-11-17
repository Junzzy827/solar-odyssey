# Repack a .vrm/.glb: shrink textures (opaque -> JPEG q85, alpha -> PNG at half size).
# Usage: python3 -I tools/mobs/shrink_vrm_textures.py in.vrm out.vrm [maxSize=1024]
# Repack a .vrm (glb): resize textures, opaque -> JPEG, alpha -> PNG
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
f = open(src, 'rb').read()
jl = struct.unpack('<I', f[12:16])[0]
j = json.loads(f[20:20+jl])
bo = 20 + jl
bl = struct.unpack('<I', f[bo:bo+4])[0]
bin_ = f[bo+8:bo+8+bl]
views = j['bufferViews']
datas = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']] for v in views]
for im in j['images']:
    i = im['bufferView']
    img = Image.open(io.BytesIO(datas[i]))
    name = im.get('name', '')
    alpha = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 250
    lim = MAX if not alpha else MAX // 2
    if 'eye' in name and 'brow' not in name and 'lash' not in name: lim = 256
    if max(img.size) > lim:
        img = img.resize((lim, lim) if img.size[0] == img.size[1] else (lim, int(img.size[1]*lim/img.size[0])), Image.LANCZOS)
    out = io.BytesIO()
    if alpha:
        img.save(out, 'PNG', optimize=True); im['mimeType'] = 'image/png'
    else:
        img.convert('RGB').save(out, 'JPEG', quality=85, optimize=True); im['mimeType'] = 'image/jpeg'
    print(name, alpha, img.size, len(datas[i]), '->', len(out.getvalue()))
    datas[i] = out.getvalue()
nb = bytearray()
for v, d in zip(views, datas):
    while len(nb) % 4: nb.append(0)
    v['byteOffset'] = len(nb); v['byteLength'] = len(d); nb += d
while len(nb) % 4: nb.append(0)
j['buffers'][0]['byteLength'] = len(nb)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(nb)
o = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + bytes(nb)
open(dst, 'wb').write(o)
print(dst, len(o))
