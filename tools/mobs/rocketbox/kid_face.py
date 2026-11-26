# Reshape a Rocketbox child's face in the glb mesh: bigger eye area, smaller nose, shorter chin, rounder cheeks.
# Kids in the park: python3 kid_eyes.py orig.glb tmp.glb 1.75 1.0 0.7 && python3 kid_face.py tmp.glb out.glb 0.05 v2
# usage: kidface.py in.glb out.glb
import json, struct, sys
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
CH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.06
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); bo = 20 + jl + 8
binc = bytearray(b[bo:])
def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert a['componentType'] == 5126 and v.get('byteStride', n * 4) == n * 4
    return off, np.frombuffer(binc, np.float32, a['count'] * n, off).reshape(a['count'], n).copy()
skin = j['skins'][0]
_, ibm = acc(skin['inverseBindMatrices'])
names = [j['nodes'][k].get('name', '') for k in skin['joints']]
def jpos(name):
    m = ibm[names.index(name)].reshape(4, 4).T  # column-major
    return np.linalg.inv(m)[:3, 3]
eL, eR, head = jpos('Bip01_LEye'), jpos('Bip01_REye'), jpos('Bip01_Head')
up = head - jpos('Bip01_Pelvis'); up /= np.linalg.norm(up)
mid = (eL + eR) / 2
fwd = mid - head; fwd -= up * fwd.dot(up); fwd /= np.linalg.norm(fwd)
neck = jpos('Bip01_Neck'); hd = (head - neck).dot(up)
V2 = len(sys.argv) > 4
eyeD = np.linalg.norm(eL - eR)  # about 5-6 cm in mesh units
U = eyeD / 5.5  # 1 = 1 cm-ish
def fall(d, r0, r1):
    t = np.clip((d - r0) / (r1 - r0), 0, 1); return 1 - t * t * (3 - 2 * t)
for me in j['meshes']:
    for p in me['primitives']:
        off, P = acc(p['attributes']['POSITION'])
        Q = P.copy()
        # 1 eyes: scale the eye area (ball + lids) about each eye centre
        for e in (eL, eR):
            d = np.linalg.norm(P - e, axis=1); w = fall(d, 1.1 * U, 2.4 * U)
            Q += (P - e) * (0.08 * w)[:, None]
        # 2 nose: pull the nose (below the eyes, in front) back and in
        nose = mid - up * 2.6 * U + fwd * 1.2 * U
        d = np.linalg.norm(P - nose, axis=1); w = fall(d, 0.8 * U, 2.6 * U)
        Q += ((mid - up * 2.6 * U - fwd * 0.6 * U) - P) * (0.08 * w)[:, None]
        # 3 chin: below the mouth only, narrow a little sideways and tuck back (no vertical move, mouth untouched)
        h = (P - mid).dot(up); f = (P - head).dot(fwd)
        side = (eL - eR); side /= np.linalg.norm(side)
        low = np.clip((-h - 6.2 * U) / (1.5 * U), 0, 1) * np.clip(1 - (-h - 9.5 * U) / (1.5 * U), 0, 1) * np.clip(f / (1.0 * U) + 1, 0, 1)
        sx = (P - mid).dot(side)
        Q -= fwd[None, :] * (low * CH * 3 * U)[:, None]
        # 4 cheeks: puff out sideways/forward a little below the eyes
        for e in (eL, eR):
            ch = e - up * 3.0 * U + fwd * 0.2 * U
            d = np.linalg.norm(P - ch, axis=1); w = fall(d, 0.5 * U, 2.6 * U)
            out = (e - mid); out /= np.linalg.norm(out); dirv = out * 0.8 + fwd * 0.6
            Q += dirv[None, :] * (0.14 * U * w)[:, None]
        if V2:
            # 5 rounder, shorter chin: lift only the chin tip (well below the mouth), rounding its front
            tip = np.clip((-h - 7.0 * U) / (1.6 * U), 0, 1) * np.clip(f / (1.5 * U) + 0.5, 0, 1) * np.clip(1 - (-h - 10.5 * U) / (1.5 * U), 0, 1)
            Q -= fwd[None, :] * (tip * 0.2 * U)[:, None]
            # 6 higher, fuller cheekbones
            for e in (eL, eR):
                ch = e - up * 1.7 * U + fwd * 0.3 * U
                d = np.linalg.norm(P - ch, axis=1); w = fall(d, 0.4 * U, 2.2 * U)
                out = (e - mid); out /= np.linalg.norm(out)
                Q += (out * 0.7 + fwd * 0.7)[None, :] * (0.13 * U * w)[:, None]
            # 7 thicker neck (less thin, adult-like line)
            hn = (P - neck).dot(up)
            band = np.clip(hn / (1.0 * U) + 1.5, 0, 1) * np.clip(1 - (hn - (hd - 2.0 * U)) / (1.5 * U), 0, 1)
            rad = (P - neck) - up[None, :] * hn[:, None]
            rl = np.linalg.norm(rad, axis=1)
            Q += rad * (band * 0.07 * fall(rl, 2.6 * U, 3.6 * U))[:, None]
        binc[off:off + Q.nbytes] = Q.astype(np.float32).tobytes()
        a = j['accessors'][p['attributes']['POSITION']]; a['min'] = Q.min(0).tolist(); a['max'] = Q.max(0).tolist()
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + binc
open(dst, 'wb').write(out)
print(src, 'up', up.round(2), 'eyeD', round(float(eyeD), 2), 'fwd', fwd.round(2))
