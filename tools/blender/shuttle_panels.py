"""
スペースシャトルの操縦室のパネルを「データ」で書き、並べ方（レイアウト）と表の絵（刻印の文字・枠・つまみの台座）を作る。
3D の部品（スイッチのレバー、回路遮断器、つまみ）は build_shuttle_cabin.py がこの並べ方から作る。

パネルの書き方（1 枚）:
    panel('F7', w, h, rows)
    rows = [(高さの比, [グループ, ...]), ...]   上の行から
    グループ = (種類, 数, '見出し'[, '下の文字'])

種類:
    tog   トグルスイッチ          togg  ふた（ガード）つきのトグル
    cb    回路遮断器（色は見出しから：MN=黄、ESS=赤、ほかは黒）   cby / cbr / cbk で色を決める
    knob  回すつまみ               pb    押しボタン          tb  表示窓（灰色・縞の旗）
    lamp  警告灯のます（数＝ますの数）   meter テープ式の計器（縦長）
    dial  丸い計器                adi   姿勢球（3D の球、別の部品）   hsi  水平位置指示器（丸い計器、大）
    crt   CRT の画面（別の部品 screen_*）  mon  CCTV のモニター（別の部品）
    kb    キーボード（数＝キーの数）       gap   すき間（数×3 cm）
    card  手順カード（白い紙、線で字の行を表す。実在しない字は書かない）

文字は実在の機器の刻印にある言葉（MN A、FLOOD、OMS ENG など）だけを使う。ロゴ・記章は描かない。
"""

import math
import random

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

# パネルの色（sRGB）。写真（s103e0169・sts054-40-022）の青みのある灰色
PANEL_RGB = (96, 104, 114)
PANEL_DARK = (70, 76, 84)
ENGRAVE = (236, 238, 232)  # 白い刻印
LINE = (205, 210, 206)

# 種類ごとの横の間隔（m）
PITCH = {
    'tog': 0.030, 'togg': 0.034, 'cb': 0.025, 'cby': 0.025, 'cbr': 0.025, 'cbk': 0.025, 'knob': 0.052,
    'pb': 0.032, 'tb': 0.030, 'lamp': 0.036, 'meter': 0.030, 'dial': 0.075, 'adi': 0.17, 'hsi': 0.15,
    'crt': 0.25, 'mon': 0.23, 'kb': 0.024, 'gap': 0.03, 'card': 0.11,
}

# 本物のパネルの刻印にある言葉（写真 s103e0163/0169/0172・sts054-40-022 で読めたもの）
WORDS = [
    'MN A', 'MN B', 'MN C', 'ESS 1BC', 'ESS 2CA', 'ESS 3AB', 'CNTL AB1', 'CNTL BC2', 'CNTL CA3', 'FLOOD', 'FWD', 'AFT', 'LEFT', 'RIGHT',
    'HTR', 'LINE HTR', 'NOZ HTR', 'CRYO O2', 'CRYO H2', 'TK 1', 'TK 2', 'TK 3', 'FUEL CELL', 'REAC', 'PURGE', 'APU', 'HYD', 'CIRC PUMP',
    'OMS ENG', 'RCS JET', 'MANF', 'XFEED', 'ISOL VLV', 'GPC', 'MDM', 'DDU', 'ADI', 'TACAN', 'MLS', 'RADAR ALT', 'ACCEL', 'RGA',
    'CABIN PRESS', 'O2/N2 CNTLR', 'N2 SUPPLY', 'H2O LOOP', 'FREON', 'SMOKE DETN', 'FIRE SUPPR', 'ANNUN', 'AUDIO', 'CCTV', 'KU ANT',
    'S BAND', 'UHF', 'PWR', 'BUS', 'INST', 'DISPLAYS', 'LIGHTING', 'PANEL', 'MIDDECK', 'AIRLOCK', 'GALLEY', 'WCS', 'BRAKES', 'NOSE WHEEL',
    'STEERING', 'MPS', 'ET SEP', 'SRB SEP', 'VENT DOOR', 'PL BAY DOOR', 'RADIATOR', 'LATCH', 'MECH PWR', 'STAR TRKR', 'IMU', 'CRT',
    'MASTER ALARM', 'EVENT TIMER', 'MISSION TIMER', 'SPEED BRAKE', 'BODY FLAP', 'TRIM', 'AUTO', 'MAN', 'PITCH', 'ROLL', 'YAW',
]
UNDER = [('ON', 'OFF'), ('OPEN', 'CLOSE'), ('AUTO', 'MAN'), ('ARM', 'SAFE'), ('A', 'B'), ('ENA', 'INH'), ('UP', 'DN')]


def panel(name, w, h, rows, seed=None, color=PANEL_RGB, frame=True):
    return {'name': name, 'w': w, 'h': h, 'rows': rows, 'seed': seed if seed is not None else sum(map(ord, name)), 'color': color, 'frame': frame}


def fill(name, w, h, nrows, kinds=('cb',), seed=None, per=(3, 7), cards=0):
    """細かく決めないパネル：本物らしい密度で、遮断器やスイッチの列を乱数で並べる（同じ名前なら毎回同じ）"""
    rnd = random.Random(seed if seed is not None else sum(map(ord, name)) * 7)
    # 本物のパネルは 1 行 約 4.5 cm でぎっしり
    nrows = max(nrows, int(h / 0.046))
    rows = []
    for _ in range(nrows):
        groups = []
        width = 0.0
        while True:
            k = rnd.choice(kinds)
            n = rnd.randint(*per)
            gw = PITCH[k] * n + 0.014
            if width + gw > w - 0.03:
                break
            groups.append((k, n, rnd.choice(WORDS)))
            width += gw
        rows.append((1.0, groups))
    for _ in range(cards):
        i = rnd.randrange(len(rows))
        rows[i] = (rows[i][0], rows[i][1][:-1] + [('card', 1, '')])
    return panel(name, w, h, rows, seed=seed)


# ---- 並べ方 ------------------------------------------------------------------------
MARGIN = 0.012
LABEL_H = 0.011  # 見出しの帯の高さ
GAP = 0.010


def layout(p):
    """部品の置き場所の一覧を返す：[{kind, x, z, w, h, label, under, color}]（パネルの左下が原点、m）"""
    rnd = random.Random(p['seed'])
    items = []
    groups_out = []
    W, H = p['w'], p['h']
    total = sum(r[0] for r in p['rows']) or 1
    top = H - MARGIN
    for weight, groups in p['rows']:
        rh = (H - 2 * MARGIN) * weight / total
        z0 = top - rh
        top = z0
        if not groups:
            continue
        widths = [PITCH[g[0]] * (g[1] if g[0] not in ('crt', 'mon', 'adi', 'hsi', 'card') else 1) + 0.006 for g in groups]
        if any(g[0] == 'kb' for g in groups):
            widths = [PITCH['kb'] * math.ceil(g[1] / 3) + 0.006 if g[0] == 'kb' else wd for g, wd in zip(groups, widths)]
        need = sum(widths) + GAP * (len(groups) - 1)
        avail = W - 2 * MARGIN
        k = min(1.0, avail / need)
        extra = (avail - need * k) / max(1, len(groups))
        x = MARGIN + extra / 2
        for g, gw in zip(groups, widths):
            kind, n, label = g[0], g[1], g[2]
            gw *= k
            under = g[3] if len(g) > 3 else rnd.choice(UNDER)
            body_top = z0 + rh - (LABEL_H if label else 0.003)
            body_h = body_top - z0 - 0.004
            groups_out.append({'x': x, 'z': z0, 'w': gw, 'h': rh, 'label': label, 'kind': kind})
            if kind in ('crt', 'mon', 'adi', 'hsi', 'dial', 'card'):
                size = min(gw, body_h)
                if kind in ('crt', 'mon'):
                    cw, ch = gw * 0.94, min(body_h * 0.94, gw * 0.8)
                    items.append({'kind': kind, 'x': x + gw / 2, 'z': z0 + 0.004 + body_h / 2, 'w': cw, 'h': ch, 'label': label, 'n': n})
                elif kind == 'card':
                    items.append({'kind': kind, 'x': x + gw / 2, 'z': z0 + 0.004 + body_h / 2, 'w': gw * 0.9, 'h': body_h * 0.92, 'label': label, 'seed': rnd.random()})
                else:
                    items.append({'kind': kind, 'x': x + gw / 2, 'z': z0 + 0.004 + body_h / 2, 'w': size * 0.92, 'h': size * 0.92, 'label': label})
            elif kind == 'kb':
                cols = math.ceil(n / 3)
                pitch = (gw - 0.006) / cols
                kh = min(body_h / 3, pitch)
                for i in range(n):
                    c, r = i % cols, i // cols
                    items.append({'kind': 'key', 'x': x + 0.003 + pitch * (c + 0.5), 'z': body_top - kh * (r + 0.5) - 0.002, 'w': pitch * 0.8, 'h': kh * 0.8})
            elif kind == 'meter':
                pitch = (gw - 0.006) / n
                for i in range(n):
                    items.append({'kind': 'meter', 'x': x + 0.003 + pitch * (i + 0.5), 'z': z0 + 0.004 + body_h / 2, 'w': pitch * 0.7, 'h': body_h * 0.9, 'seed': rnd.random()})
            elif kind == 'gap':
                pass
            else:
                pitch = (gw - 0.006) / n
                for i in range(n):
                    color = kind
                    if kind == 'cb':
                        color = 'cby' if label.startswith('MN') else 'cbr' if label.startswith('ESS') else rnd.choice(('cbk', 'cbk', 'cby', 'cbk'))
                    items.append({'kind': kind, 'x': x + 0.003 + pitch * (i + 0.5), 'z': z0 + 0.004 + body_h * 0.55, 'w': pitch, 'h': body_h, 'under': under, 'color': color,
                                  'up': rnd.random() < 0.6, 'lit': rnd.random() < 0.25})
            x += gw + GAP * k + extra
    return items, groups_out


# ---- 表の絵 ------------------------------------------------------------------------
_fonts = {}


def font(px):
    px = max(6, int(px))
    if px not in _fonts:
        _fonts[px] = ImageFont.truetype(FONT_PATH, px)
    return _fonts[px]


def text(img, d, s, cx, cy, hpx, fill=ENGRAVE, squeeze=0.78):
    """細めの刻印の文字（横を縮めて、本物の刻印の細長い字に近づける）"""
    if not s:
        return
    f = font(hpx * 1.3)
    l, t, r, b = d.textbbox((0, 0), s, font=f)
    tw, th = r - l + 2, b - t + 2
    if tw <= 2 or th <= 2:
        return
    tmp = Image.new('L', (tw, th), 0)
    ImageDraw.Draw(tmp).text((1 - l, 1 - t), s, font=f, fill=255)
    nw = max(1, int(tw * squeeze))
    tmp = tmp.resize((nw, th), Image.LANCZOS)
    col = Image.new('RGB', tmp.size, fill)
    img.paste(col, (int(cx - nw / 2), int(cy - th / 2)), tmp)


def paint(p, ppm, glow=None):
    """パネル 1 枚の絵（RGB）と、暗い操縦室で光らせる所（L：刻印・照光ボタン）。ppm は 1 m あたりの画素"""
    W, H = max(8, int(p['w'] * ppm)), max(8, int(p['h'] * ppm))
    rnd = random.Random(p['seed'] + 1)
    img = Image.new('RGB', (W, H), p['color'])
    gl = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    dg = ImageDraw.Draw(gl)
    px = lambda x: x * ppm
    py = lambda z: H - z * ppm
    # 色むらと、こすれた跡（よく触る所ほど明るく）
    for _ in range(int(p['w'] * p['h'] * 400) + 3):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(0.003, 0.02) * ppm
        c = tuple(max(0, min(255, v + rnd.randint(-3, 3))) for v in p['color'])
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    # パネルの縁とねじ
    if p['frame']:
        d.rectangle((0, 0, W - 1, H - 1), outline=PANEL_DARK, width=max(2, int(0.004 * ppm)))
        for sx, sy in ((0.008, 0.008), (p['w'] - 0.008, 0.008), (0.008, p['h'] - 0.008), (p['w'] - 0.008, p['h'] - 0.008)):
            r = 0.0035 * ppm
            d.ellipse((px(sx) - r, py(sy) - r, px(sx) + r, py(sy) + r), fill=(150, 152, 150), outline=(50, 52, 55))
            d.line((px(sx) - r * 0.7, py(sy), px(sx) + r * 0.7, py(sy)), fill=(60, 60, 60), width=max(1, int(r * 0.3)))
    # パネルの名前（左上、小さく。写真の「O15」「R14」）
    text(img, d, p['name'], px(0.02 + len(p['name']) * 0.004), py(p['h'] - 0.012), 0.008 * ppm)
    text(gl, dg, p['name'], px(0.02 + len(p['name']) * 0.004), py(p['h'] - 0.012), 0.008 * ppm, fill=200)
    items, groups = layout(p)
    lw = max(1, int(0.0012 * ppm))
    for g in groups:
        if g['kind'] in ('gap',):
            continue
        x0, x1 = px(g['x']), px(g['x'] + g['w'])
        y0, y1 = py(g['z'] + g['h'] - 0.004), py(g['z'] + 0.002)
        if g['label']:
            # 見出しの両わきに線（グループの囲み）
            ly = py(g['z'] + g['h'] - LABEL_H / 2 - 0.002)
            d.line((x0, ly, x0, y1), fill=LINE, width=lw)
            d.line((x1, ly, x1, y1), fill=LINE, width=lw)
            d.line((x0, y1, x1, y1), fill=LINE, width=lw)
            text(img, d, g['label'], (x0 + x1) / 2, ly, 0.0068 * ppm)
            text(gl, dg, g['label'], (x0 + x1) / 2, ly, 0.0068 * ppm, fill=230)
    for it in items:
        k = it['kind']
        cx, cy = px(it['x']), py(it['z'])
        if k in ('tog', 'togg'):
            r = 0.0075 * ppm
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(48, 50, 54))
            a, b = it['under']
            text(img, d, a, cx, cy - 0.013 * ppm, 0.0048 * ppm)
            text(img, d, b, cx, cy + 0.013 * ppm, 0.0048 * ppm)
            text(gl, dg, a, cx, cy - 0.013 * ppm, 0.0048 * ppm, fill=200)
            text(gl, dg, b, cx, cy + 0.013 * ppm, 0.0048 * ppm, fill=200)
        elif k.startswith('cb'):
            r = 0.0085 * ppm
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(40, 40, 42))
            text(img, d, str(rnd.choice((3, 3, 5, 5, 10, 15, 20))), cx, cy + 0.013 * ppm, 0.0045 * ppm)
        elif k == 'knob':
            r = 0.016 * ppm
            d.ellipse((cx - r * 1.5, cy - r * 1.5, cx + r * 1.5, cy + r * 1.5), outline=LINE, width=lw)
            for j in range(5):
                a = math.radians(-140 + j * 70)
                d.line((cx + math.sin(a) * r * 1.5, cy - math.cos(a) * r * 1.5, cx + math.sin(a) * r * 1.85, cy - math.cos(a) * r * 1.85), fill=LINE, width=lw)
        elif k == 'pb':
            s = 0.011 * ppm
            lit = it['lit']
            d.rectangle((cx - s, cy - s, cx + s, cy + s), fill=(200, 200, 190) if lit else (36, 38, 40), outline=(20, 20, 20))
            if lit:
                dg.rectangle((cx - s, cy - s, cx + s, cy + s), fill=255)
        elif k == 'tb':
            s = 0.008 * ppm
            d.rectangle((cx - s, cy - s, cx + s, cy + s), fill=(25, 25, 25))
            if rnd.random() < 0.5:
                for j in range(-3, 4):
                    d.line((cx - s, cy + j * s / 3, cx + s, cy + j * s / 3 + s / 2), fill=(230, 230, 230), width=max(1, int(s / 5)))
            else:
                d.rectangle((cx - s * 0.8, cy - s * 0.8, cx + s * 0.8, cy + s * 0.8), fill=(130, 132, 128))
        elif k == 'lamp':
            s = 0.016 * ppm
            col = rnd.choice(((180, 40, 30), (200, 150, 40), (60, 60, 60), (60, 60, 60)))
            d.rectangle((cx - s, cy - s * 0.7, cx + s, cy + s * 0.7), fill=col, outline=(20, 20, 20), width=lw)
            text(img, d, rnd.choice(WORDS)[:8], cx, cy, 0.005 * ppm, fill=(250, 240, 220))
            dg.rectangle((cx - s, cy - s * 0.7, cx + s, cy + s * 0.7), fill=110 if col[0] > 100 else 40)
        elif k == 'meter':
            hw, hh = it['w'] / 2 * ppm, it['h'] / 2 * ppm
            d.rectangle((cx - hw, cy - hh, cx + hw, cy + hh), fill=(20, 20, 22), outline=(10, 10, 10))
            # テープの目盛りと、指している所
            rr = random.Random(it['seed'])
            for j in range(12):
                yy = cy - hh + (j + 0.5) * hh * 2 / 12
                d.line((cx - hw * 0.8, yy, cx - hw * 0.1, yy), fill=(220, 220, 210), width=lw)
            fillh = rr.uniform(0.2, 0.85)
            d.rectangle((cx + hw * 0.15, cy + hh - fillh * hh * 2, cx + hw * 0.75, cy + hh), fill=(235, 235, 225))
            dg.rectangle((cx - hw, cy - hh, cx + hw, cy + hh), fill=70)
        elif k in ('dial', 'hsi', 'adi'):
            r = it['w'] / 2 * ppm
            d.rectangle((cx - r * 1.08, cy - r * 1.08, cx + r * 1.08, cy + r * 1.08), fill=(34, 36, 40))
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(14, 14, 16), outline=(120, 120, 120), width=lw)
            if k != 'adi':
                for j in range(36):
                    a = j * math.pi / 18
                    l2 = 0.82 if j % 3 else 0.72
                    d.line((cx + math.sin(a) * r * l2, cy - math.cos(a) * r * l2, cx + math.sin(a) * r * 0.92, cy - math.cos(a) * r * 0.92), fill=(230, 230, 220), width=lw)
                if k == 'hsi':
                    d.polygon([(cx, cy - r * 0.62), (cx - r * 0.08, cy - r * 0.45), (cx + r * 0.08, cy - r * 0.45)], fill=(240, 200, 60))
                    d.line((cx, cy - r * 0.45, cx, cy + r * 0.6), fill=(240, 200, 60), width=lw * 2)
                else:
                    a = random.Random(cx).uniform(-2, 2)
                    d.line((cx, cy, cx + math.sin(a) * r * 0.75, cy - math.cos(a) * r * 0.75), fill=(240, 240, 240), width=lw * 2)
                dg.ellipse((cx - r, cy - r, cx + r, cy + r), outline=120, width=lw)
        elif k in ('crt', 'mon'):
            hw, hh = it['w'] / 2 * ppm, it['h'] / 2 * ppm
            d.rectangle((cx - hw * 1.06, cy - hh * 1.1, cx + hw * 1.06, cy + hh * 1.1), fill=(30, 32, 35))
            d.rectangle((cx - hw, cy - hh, cx + hw, cy + hh), fill=(8, 12, 10))
        elif k == 'key':
            hw, hh = it['w'] / 2 * ppm, it['h'] / 2 * ppm
            d.rectangle((cx - hw * 1.1, cy - hh * 1.1, cx + hw * 1.1, cy + hh * 1.1), fill=(40, 42, 46))
        elif k == 'card':
            hw, hh = it['w'] / 2 * ppm, it['h'] / 2 * ppm
            draw_card(d, cx - hw, cy - hh, cx + hw, cy + hh, random.Random(it['seed']), ppm)
    return img, gl, items


def draw_card(d, x0, y0, x1, y1, rnd, ppm):
    """手順カード：白い紙に、字の行を灰色の線で表す（実在しない文字は書かない）"""
    d.rectangle((x0, y0, x1, y1), fill=(232, 230, 220), outline=(170, 168, 160))
    lh = 0.0055 * ppm
    y = y0 + lh * 1.5
    d.rectangle((x0 + lh, y - lh * 0.5, x1 - lh, y + lh * 0.4), fill=(70, 70, 75))
    y += lh * 2
    while y < y1 - lh:
        indent = lh * rnd.choice((1, 1, 1, 2.5))
        length = rnd.uniform(0.3, 0.95) * (x1 - x0 - indent - lh)
        d.line((x0 + indent, y, x0 + indent + length, y), fill=(95, 95, 100), width=max(1, int(lh * 0.35)))
        y += lh * rnd.choice((1.15, 1.15, 1.15, 1.9))


# ---- 本物のパネルの並び（写真と一般的な図から。細部は「本物らしい密度」） ----------------------------
def panels():
    P = {}
    # 前の計器板：左から F2（船長の左）・F4（船長の画面の下）・F6（船長の正面）・F7（真ん中・CRT 3 台）・F8（操縦士の正面）・F9（右）
    # 前の計器板（1993 年のエンデバー：CRT 3 台＋電気機械式の計器。写真 sts061-53-001・-010・61b-21-008）
    # 主の段：F1（左の端）・F6（船長の正面）・F7（真ん中）・F8（操縦士の正面）・F9（右の端）
    # ひさしの前の細い帯：F2（左）・F3（真ん中）・F4（右）。ひざの前：F5（左）・F10（右）
    P['F6'] = panel('F6', 0.62, 0.52, [
        (0.55, [('lamp', 2, 'MASTER ALARM'), ('tb', 4, 'FLT CNTLR'), ('lamp', 6, 'RCS'), ('pb', 3, 'SBTC')]),
        (1.75, [('meter', 3, 'ALPHA'), ('adi', 1, 'ADI'), ('meter', 4, 'H')]),
        (1.45, [('meter', 2, 'MACH'), ('hsi', 1, 'HSI'), ('meter', 3, 'VEL')]),
        (0.6, [('tog', 4, 'ADI', ('ATT', 'RATE')), ('tog', 3, 'ERR'), ('knob', 2, 'SENSE')]),
    ])
    P['F7'] = panel('F7', 0.90, 0.52, [
        (1.55, [('crt', 1, 'CRT 1'), ('crt', 1, 'CRT 3'), ('crt', 1, 'CRT 2')]),
        (0.45, [('pb', 8, 'MAJOR FUNC'), ('tog', 3, 'CRT PWR'), ('pb', 8, 'MAJOR FUNC')]),
        (0.5, [('lamp', 20, 'CAUTION/WARNING')]),
        (0.5, [('lamp', 20, '')]),
    ])
    P['F8'] = panel('F8', 0.62, 0.52, [
        (0.55, [('pb', 3, 'SBTC'), ('lamp', 6, 'RCS'), ('tb', 4, 'FLT CNTLR'), ('lamp', 2, 'MASTER ALARM')]),
        (1.75, [('meter', 4, 'H'), ('adi', 1, 'ADI'), ('meter', 3, 'ALPHA')]),
        (1.45, [('meter', 3, 'VEL'), ('hsi', 1, 'HSI'), ('meter', 2, 'MACH')]),
        (0.6, [('knob', 2, 'SENSE'), ('tog', 3, 'ERR'), ('tog', 4, 'ADI', ('ATT', 'RATE'))]),
    ])
    P['F1'] = panel('F1', 0.24, 0.52, [
        (1, [('pb', 4, 'DAP')]), (1, [('tog', 3, 'HUD')]), (1.4, [('dial', 1, 'ACCEL')]), (1, [('togg', 2, 'DRAG CHUTE', ('ARM', 'SAFE'))])])
    P['F9'] = panel('F9', 0.24, 0.52, [
        (1, [('pb', 4, 'DAP')]), (1, [('tog', 3, 'HUD')]), (1.4, [('dial', 1, 'BRAKES')]), (1, [('togg', 2, 'LANDING GEAR', ('ARM', 'DN'))])])
    # ひさしの前の帯（押しボタンと表示灯が横に並ぶ）
    P['F2'] = panel('F2', 0.74, 0.10, [(1, [('pb', 6, 'DAP'), ('lamp', 4, 'BODY FLAP'), ('pb', 5, 'PITCH'), ('pb', 5, 'ROLL/YAW')])])
    P['F3'] = panel('F3', 0.42, 0.10, [(1, [('lamp', 6, 'RNG'), ('pb', 4, 'HUD'), ('tog', 2, 'DRAG CHUTE')])])
    P['F4'] = panel('F4', 0.74, 0.10, [(1, [('pb', 5, 'ROLL/YAW'), ('pb', 5, 'PITCH'), ('lamp', 4, 'BODY FLAP'), ('pb', 6, 'DAP')])])
    # 下の段（計器板の下、ひざの前）
    P['F5'] = fill('F5', 0.50, 0.22, 3, kinds=('tog', 'pb', 'tb'), per=(2, 4))
    P['F10'] = fill('F10', 0.50, 0.22, 3, kinds=('tog', 'pb', 'tb'), per=(2, 4))
    # センター台（C1〜C3）
    P['C1'] = panel('C1', 0.46, 0.32, [
        (1, [('tog', 4, 'MDU'), ('tog', 3, 'FLT CNTLR PWR')]),
        (1, [('kb', 32, 'KEYBOARD')]),
    ])
    P['C2'] = panel('C2', 0.46, 0.28, [
        (1, [('dial', 1, 'EVENT TIMER'), ('tog', 4, 'TIMER'), ('pb', 3, 'CRT SEL')]),
        (1, [('kb', 32, 'KEYBOARD')]),
    ])
    P['C3'] = panel('C3', 0.46, 0.38, [
        (1, [('togg', 4, 'OMS ENG', ('ARM', 'OFF')), ('tog', 2, 'BODY FLAP')]),
        (1, [('pb', 6, 'DAP'), ('tog', 3, 'AIR DATA')]),
        (1, [('tog', 6, 'RCS JET'), ('knob', 2, 'TRIM')]),
    ])
    # 頭上（O1〜O17）：ぎっしりの遮断器とスイッチ
    for n, nr in (('O1', 5), ('O2', 5), ('O3', 5), ('O5', 6), ('O6', 6), ('O7', 6), ('O8', 6), ('O9', 6), ('O13', 5), ('O14', 5), ('O15', 5), ('O16', 5), ('O17', 5)):
        kinds = ('cb', 'cb', 'tog') if n in ('O13', 'O14', 'O15', 'O16', 'O17') else ('tog', 'togg', 'tb', 'cb')
        P[n] = fill(n, 0.42 if n in ('O1', 'O2', 'O3', 'O9', 'O8', 'O7') else 0.36, 0.40, nr, kinds=kinds, per=(3, 7))
    # 左右の壁（L1〜L4、R1〜R4）：sts054-40-022 の R1/R2 のような電源・低温タンクの列
    P['R1'] = panel('R1', 0.52, 0.44, [
        (1, [('tog', 4, 'PWR DIST'), ('tb', 4, 'MN A'), ('tog', 3, 'FC/MAIN BUS')]),
        (1, [('tog', 4, 'MN B'), ('tb', 4, 'MN B'), ('tog', 3, 'AC CONTR')]),
        (1, [('tog', 4, 'MN C'), ('tb', 4, 'MN C'), ('tog', 3, 'INV PWR')]),
        (1, [('tog', 5, 'CRYO O2'), ('tb', 3, 'TK 1'), ('tog', 3, 'FUEL CELL')]),
        (0.8, [('card', 1, ''), ('tog', 6, 'H2 TK HEATERS')]),
    ])
    P['R2'] = fill('R2', 0.52, 0.40, 5, kinds=('tog', 'togg', 'tb'), per=(3, 6))
    P['R3'] = fill('R3', 0.34, 0.30, 4, kinds=('tog', 'tb'), per=(2, 4))
    P['R4'] = fill('R4', 0.34, 0.26, 3, kinds=('tog', 'pb'), per=(2, 4))
    P['L1'] = panel('L1', 0.52, 0.44, [
        (1, [('tog', 4, 'FIRE SUPPR'), ('pb', 3, 'SMOKE DETN')]),
        (1, [('tog', 4, 'CABIN PRESS'), ('tb', 3, 'O2/N2 CNTLR'), ('tog', 2, 'N2 SUPPLY')]),
        (1, [('tog', 5, 'H2O LOOP'), ('tb', 3, 'FREON')]),
        (1, [('tog', 4, 'CABIN FAN'), ('tog', 3, 'HUMIDITY')]),
        (0.8, [('dial', 1, 'CABIN PRESS'), ('dial', 1, 'dP/dT'), ('card', 1, '')]),
    ])
    P['L2'] = fill('L2', 0.52, 0.40, 5, kinds=('tog', 'togg', 'tb'), per=(3, 6))
    P['L3'] = fill('L3', 0.34, 0.30, 4, kinds=('tog', 'tb'), per=(2, 4))
    P['L4'] = fill('L4', 0.34, 0.26, 3, kinds=('tog', 'pb'), per=(2, 4))
    # 後ろの台（A 群）。A8 は写真 sts061-23-037 の刻印に合わせたアームの台
    P['A1'] = panel('A1', 0.50, 0.36, [
        (1.4, [('mon', 1, 'CCTV MON 1'), ('mon', 1, 'CCTV MON 2')]),
        (0.6, [('tog', 4, 'CAMR SEL'), ('pb', 6, 'VIDEO OUTPUT')]),
    ])
    P['A2'] = panel('A2', 0.30, 0.36, [
        (1, [('dial', 1, 'RANGE'), ('meter', 2, 'R/RDOT')]),
        (1, [('tog', 3, 'DIGI DIS'), ('pb', 2, 'MISSION TIME')]),
    ])
    P['A3'] = panel('A3', 0.50, 0.30, [
        (1, [('pb', 8, 'VIDEO INPUT'), ('tog', 3, 'PAN/TILT')]),
        (1, [('pb', 8, 'VIDEO OUTPUT'), ('tog', 3, 'ZOOM')]),
        (1, [('tog', 6, 'CAMR CMD'), ('tog', 3, 'LIGHTING')]),
    ])
    P['A4'] = panel('A4', 0.30, 0.14, [(1, [('meter', 4, 'MISSION TIME'), ('meter', 3, 'EVENT TIME')])])
    P['A6'] = panel('A6', 0.50, 0.30, [
        (1, [('crt', 1, 'CRT 4'), ('tog', 4, 'FLT CNTLR PWR')]),
        (0.7, [('pb', 6, 'DAP'), ('tog', 3, 'SENSE')]),
    ])
    P['A7'] = fill('A7', 0.50, 0.40, 3, kinds=('tog', 'togg', 'tb'), per=(3, 5))
    P['A8'] = panel('A8', 0.62, 0.40, [
        (1, [('tog', 3, 'BRAKES', ('ON', 'OFF')), ('knob', 1, 'MODE'), ('tog', 2, 'AUTO SEQ'), ('lamp', 4, 'CAUTION'), ('tb', 3, 'END EFFECTOR')]),
        (0.6, [('tb', 3, 'SHOULDER'), ('tb', 3, 'ELBOW'), ('tb', 3, 'WRIST')]),
        (1, [('knob', 1, 'JOINT'), ('knob', 1, 'PARAMETER'), ('knob', 1, 'JOINT')]),
        (0.8, [('tog', 2, 'SINGLE/DIRECT DRIVE'), ('knob', 2, 'LIGHTING'), ('togg', 1, 'SHOULDER BRACE', ('STBD', 'PORT'))]),
    ])
    P['A5'] = fill('A5', 0.32, 0.36, 5, kinds=('tog', 'tb', 'pb'), per=(2, 4))
    P['A9'] = fill('A9', 0.48, 0.40, 5, kinds=('tog', 'togg', 'tb'), per=(3, 5))
    P['A10'] = fill('A10', 0.40, 0.36, 5, kinds=('cb', 'tog'), per=(3, 6))
    P['A15'] = fill('A15', 0.40, 0.36, 5, kinds=('tog', 'tb'), per=(3, 5), cards=1)
    P['A16'] = fill('A16', 0.38, 0.36, 5, kinds=('cb', 'tog'), per=(3, 6))
    P['A11'] = fill('A11', 0.40, 0.36, 5, kinds=('cb', 'tog'), per=(3, 6))
    P['A12'] = fill('A12', 0.40, 0.36, 4, kinds=('tog', 'tb', 'pb'), per=(3, 5))
    P['A13'] = fill('A13', 0.40, 0.36, 4, kinds=('tog', 'tb'), per=(3, 5))
    P['A14'] = fill('A14', 0.40, 0.36, 4, kinds=('cb', 'tog'), per=(3, 6))
    # 後ろの左右の壁（L9〜L12、R10〜R14）と後ろの台の下
    for n in ('L9', 'L10', 'L11', 'L12', 'R10', 'R11', 'R12', 'R13', 'R14'):
        P[n] = fill(n, 0.44, 0.40, 5, kinds=('cb', 'tog', 'tb'), per=(3, 6), cards=1 if n in ('L10', 'R11') else 0)
    # ミッドデッキの遮断器（ML31C・ML86B・MO 群：写真 s103e0163 のような黄・赤の輪）
    for n in ('ML31C', 'ML86B', 'MA73C', 'MO13Q', 'MO51F', 'MO58F'):
        P[n] = fill(n, 0.46, 0.42, 6, kinds=('cb', 'cb', 'tog'), per=(3, 6))
    return P
