# 段階 0/1：ISS の色の絵をアプリ用にする（Pillow だけ。Blender は使わない）。
#   WORK=/tmp/iss-work MODULES=us_lab python3 -I tools/iss/textures.py
# 1. $WORK/tex_src/<名前>.png（split_modules.py が FBX から出した元の絵）に、logo_masks.json の四角を塗る
#    （ロゴ・ワッペン。まわりの色の中央値で塗りつぶす）
# 2. 確かめの一覧（SHEETS=1）：$PREVIEW_DIR/s0-textures-<n>.jpg（塗った所は赤紫のわくで示す）
# 3. MODULES のモジュールが使う絵を public/models/iss/tex/<名前>.<大きさ>.webp に
#    （大きさは「1 m あたりの画素数」の高い順に、テクスチャのメモリの予算に入るまで縮めて決める）
# 4. public/models/iss/<module>.json：材質 → 絵の名前・大きさ（PC / スマホ）・透け・光る、と光の絵の大きさ
import json
import math
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('WORK', '/tmp/iss-work')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', os.path.join(os.environ.get('WORK', '/tmp/iss-work'), 'preview'))
OUT = os.environ.get('OUT_DIR', os.path.join(HERE, '..', '..', 'public', 'models', 'iss'))
MODULES = [m for m in os.environ.get('MODULES', 'us_lab').split(',') if m]
SHEETS = os.environ.get('SHEETS', '0') == '1'
# 部屋の色の絵に使ってよいメモリ（MB、ミップマップ込み・RGBA）。光の絵・地球は別に数える
BUDGET = {'pc': float(os.environ.get('BUDGET_PC', '125')), 'phone': float(os.environ.get('BUDGET_PHONE', '36'))}
MAX = {'pc': 2048, 'phone': 1024}
MIN = 256
QUALITY = int(os.environ.get('WEBP_Q', '86'))

info = json.load(open(os.path.join(HERE, 'modules.json')))
masks = json.load(open(os.path.join(HERE, 'logo_masks.json')))
weight = json.load(open(os.path.join(WORK, 'weight.json')))
mats = info['materials']


def mem_mb(size):
    return size * size * 4 * 4 / 3 / 1e6


def painted(key):
    """元の絵にロゴ消しの四角を塗ったもの（RGBA）"""
    im = Image.open(os.path.join(WORK, 'tex_src', f'{key}.png'))
    im = im.convert('RGBA')
    k = im.width / 4096
    for m in masks.get(key, []):
        x0, y0, x1, y1 = [int(round(v * k)) for v in m['rect']]
        # まわり 4 画素の帯の色の中央値
        ring = []
        for (a, b, c, d) in ((x0 - 4, y0 - 4, x1 + 4, y0), (x0 - 4, y1, x1 + 4, y1 + 4), (x0 - 4, y0, x0, y1), (x1, y0, x1 + 4, y1)):
            ring.extend(list(im.crop((max(a, 0), max(b, 0), min(c, im.width), min(d, im.height))).get_flattened_data()))
        ring.sort(key=lambda p: p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11)
        col = ring[len(ring) // 2] if ring else (200, 200, 200, 255)
        ImageDraw.Draw(im).rectangle((x0, y0, x1, y1), fill=col)
    return im


def sheets():
    names = sorted(f[:-4] for f in os.listdir(os.path.join(WORK, 'tex_src')))
    per = 6
    for s in range(0, len(names), per):
        sheet = Image.new('RGB', (1920, 1300), (36, 36, 36))
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(names[s:s + per]):
            im = painted(n).convert('RGB').resize((640, 620))
            x, y = (i % 3) * 640, (i // 3) * 650
            sheet.paste(im, (x, y + 28))
            k = 640 / 4096
            for m in masks.get(n, []):
                x0, y0, x1, y1 = m['rect']
                d.rectangle((x + x0 * k, y + 28 + y0 * 620 / 4096, x + x1 * k, y + 28 + y1 * 620 / 4096), outline=(255, 0, 255), width=2)
            hidden = mats.get('Patches1', {}).get('texture') == n or mats.get('Patches2', {}).get('texture') == n
            label = f'{n}  ({len(masks.get(n, []))} painted)' + ('  HIDDEN: objects removed, never shipped' if hidden else '')
            d.text((x + 6, y + 6), label, fill=(255, 220, 0))
        p = os.path.join(PREVIEW_DIR, f's0-textures-{s // per + 1}.jpg')
        sheet.save(p, quality=84)
        print('sheet', p)


def plan(module):
    """モジュールの材質ごとに、絵と大きさ（PC / スマホ）を決める"""
    used = {}
    for mat, d in weight.items():
        if module not in d or mats.get(mat, {}).get('hidden'):
            continue
        area, uv, _n = d[module]
        tex = mats[mat]['texture']
        if tex is None:
            continue
        u = used.setdefault(tex, {'area': 0.0, 'uv': 0.0})
        u['area'] += area
        u['uv'] += min(uv, 1.5)  # 同じ絵を何度も使う（くり返す）所は 1.5 まで
    out = {}
    for platform in ('pc', 'phone'):
        size = {t: MAX[platform] for t in used}

        def dens(t, s):
            return math.sqrt(max(used[t]['uv'], 1e-4) * s * s / max(used[t]['area'], 1e-4))

        # 小さく使う絵は、1 m あたり 600 画素（PC）/ 300（スマホ）を超えない大きさまで先に縮める
        cap = 600 if platform == 'pc' else 300
        for t in used:
            while size[t] > MIN and dens(t, size[t] // 2) >= cap:
                size[t] //= 2
        # ほんの少しだけ使う絵（3 m² 未満）は PC 1024・スマホ 512 まで
        for t in used:
            if used[t]['area'] < 3:
                size[t] = min(size[t], MAX[platform] // 2)
        while sum(mem_mb(s) for s in size.values()) > BUDGET[platform]:
            t = max((t for t in used if size[t] > MIN), key=lambda t: dens(t, size[t]))
            size[t] //= 2
        out[platform] = size
        print(module, platform, f'{sum(mem_mb(s) for s in size.values()):.1f} MB', {t: (s, round(dens(t, s))) for t, s in sorted(size.items())})
    return used, out


def build(module):
    used, sizes = plan(module)
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    alpha_tex = {mats[m]['texture'] for m in mats if mats[m]['alpha'] and mats[m]['texture']}
    for t in used:
        src = None
        for s in sorted({sizes['pc'][t], sizes['phone'][t]}):
            p = os.path.join(OUT, 'tex', f'{t}.{s}.webp')
            if os.path.exists(p) and os.environ.get('FORCE') != '1':
                continue
            if src is None:
                src = painted(t)
                if t not in alpha_tex:
                    src = src.convert('RGB')
            src.resize((s, s), Image.LANCZOS).save(p, 'WEBP', quality=QUALITY, method=6)
            print('wrote', p, os.path.getsize(p) // 1024, 'KB')
    mod = next(m for m in info['modules'] if m['id'] == module)
    manifest = {
        'id': module,
        'key': mod['key'],
        'glb': f'{module}.glb',
        'light': {'pc': f'{module}.light.2048.jpg', 'phone': f'{module}.light.1024.jpg'},
        # three の MeshBasic は光の絵を π で割る。焼くときに ×0.5 で保存したので、2π を掛けてもどす
        'lightIntensity': 2 * math.pi,
        'materials': {},
        'bboxMin': mod['bboxMin'],
        'bboxMax': mod['bboxMax'],
        'center': mod['center'],
        'neighbours': mod['neighbours'],
        'hatches': mod['hatches'],
    }
    for mat in mod['materials']:
        mi = mats[mat]
        if mi['hidden']:
            continue
        t = mi['texture']
        manifest['materials'][mat] = {
            'tex': t,
            'pc': sizes['pc'].get(t) if t else None,
            'phone': sizes['phone'].get(t) if t else None,
            'alpha': mi['alpha'],
            # ランプの面は光の絵を掛けずに明るく（暗くしない）
            'lamp': mat == 'Generic_Lights',
            'emissive': mi['emissive'],
        }
    p = os.path.join(OUT, f'{module}.json')
    json.dump(manifest, open(p, 'w'), indent=1)
    print('wrote', p)


if __name__ == '__main__':
    if SHEETS:
        sheets()
    for m in MODULES:
        build(m)
    sys.exit(0)
