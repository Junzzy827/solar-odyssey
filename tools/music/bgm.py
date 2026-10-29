"""アプリと紹介動画のBGM（オリジナル曲）をシンセで作る。

アプリで流しているのは loop 版（public/music/bgm-loop.ogg・.mp3）。
作り直したら: python3 tools/music/bgm.py /tmp/bgm.wav loop の結果を ogg（libvorbis）と mp3 に変換して置きかえる。

壮大なオーケストラ風：ゆったりした弦、ホルンの主題、ティンパニ、シンバル。
旋律と和声はこのアプリのために書いたオリジナル。既存の曲の旋律・動機は使わない。
120 BPM、小節の頭は 1, 3, 5 … 秒（ショットの切れ目に合わせる）。
31 秒からのサビは 3/4 拍子の大らかな賛歌風（1小節 1.5 秒）。

使い方: python3 bgm.py out.wav video   … 紹介動画用（40 秒、サビを短くして終わる）
        python3 bgm.py out.wav loop    … ループ用（約 66 秒、終わりが頭につながる）
"""
import sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 44100
KIND = sys.argv[2] if len(sys.argv) > 2 else 'video'
DUR = 40.0 if KIND == 'video' else 66.0
N = int(SR * (DUR + 3))
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def hz(name):
    """'F#4' → 周波数"""
    p = NOTE[name[0]]
    i = 1
    while name[i] in '#b':
        p += 1 if name[i] == '#' else -1
        i += 1
    octave = int(name[i:])
    return 440.0 * 2 ** ((p + 12 * (octave + 1) - 69) / 12)


def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    j = min(N, i + len(sig))
    if j <= i:
        return
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan))
    R[i:j] += s * np.sqrt(0.5 * (1 + pan))


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def env(n, a, r, sustain=1.0):
    """立ち上がり a 秒・余韻 r 秒の包絡（長さ n サンプル）"""
    e = np.full(n, sustain)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, sustain, na) ** 1.5
    nr = max(1, int(r * SR))
    e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


def strings(name, t, d, gain=0.12, pan=0.0, attack=0.5, bright=2600):
    """弦楽合奏：少しずつ音程のずれたノコギリ波を重ね、ビブラートとフィルターで柔らかく"""
    n = int((d + 1.2) * SR)
    f = hz(name)
    tt = np.arange(n) / SR
    s = np.zeros(n)
    for k, det in enumerate((-0.11, -0.04, 0.0, 0.05, 0.12)):
        vib = 1 + 0.0025 * np.sin(2 * np.pi * (5.1 + 0.3 * k) * tt + k)
        ph = np.cumsum(f * (1 + det / 100 * 6) * vib) / SR
        s += 2 * ((ph + rng.random()) % 1.0) - 1
    s = lowpass(s / 5, bright, 2)
    add(s * env(n, attack, 1.2), t, pan, gain)


def horn(name, t, d, gain=0.16, pan=-0.25):
    """ホルン：息の強さに合わせて音色が明るくなる金管"""
    n = int((d + 0.35) * SR)
    f = hz(name)
    tt = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 4.8 * tt) * np.clip((tt - 0.25) * 2, 0, 1)
    ph = np.cumsum(f * vib) / SR
    s = (2 * (ph % 1.0) - 1) + 0.6 * (2 * ((ph * 1.003 + 0.3) % 1.0) - 1)
    e = env(n, 0.07, 0.3)
    swell = 0.55 + 0.45 * np.clip(tt / 0.35, 0, 1)
    # 音色：時間で動くフィルター（ブロック単位で近似）
    out = np.zeros(n)
    blk = 2048
    for i in range(0, n, blk):
        fc = 500 + 1900 * swell[i] * e[i]
        out[i:i + blk] = lowpass(s[i:i + blk], fc, 2)
    out = lowpass(out, 3200, 2)
    add(out * e * swell, t, pan, gain)


def timpani(name, t, gain=0.5, pan=0.15):
    n = int(2.2 * SR)
    f = hz(name)
    tt = np.arange(n) / SR
    fr = f * (1 + 0.06 * np.exp(-tt * 30))
    ph = np.cumsum(fr) / SR
    s = np.sin(2 * np.pi * ph) + 0.35 * np.sin(2 * np.pi * ph * 1.5) * np.exp(-tt * 6)
    s *= np.exp(-tt * 2.2)
    hit = lowpass(rng.standard_normal(n), 900) * np.exp(-tt * 40) * 0.6
    add((s + hit) * env(n, 0.003, 0.2), t, pan, gain)


def timp_roll(name, t, d, g0=0.05, g1=0.35):
    k = int(d / 0.0625)
    for i in range(k):
        timpani(name, t + i * 0.0625, gain=g0 + (g1 - g0) * (i / k) ** 2, pan=0.15 + 0.05 * (i % 2))


def cymbal(t, gain=0.22, decay=2.6):
    n = int(decay * 1.6 * SR)
    tt = np.arange(n) / SR
    for pan in (-0.35, 0.35):
        s = lowpass(highpass(rng.standard_normal(n), 3500, 2), 11000, 2)
        s *= np.exp(-tt * 3.5 / decay) * env(n, 0.002, 0.5)
        add(s, t, pan, gain * 0.6)


def swell(t, d, gain=0.16):
    """シンバルの逆再生のような、だんだん大きくなる音"""
    n = int(d * SR)
    tt = np.arange(n) / SR
    s = highpass(rng.standard_normal(n), 3000, 2) * (tt / d) ** 3
    add(s, t, -0.3, gain)
    add(highpass(rng.standard_normal(n), 3000, 2) * (tt / d) ** 3, t, 0.3, gain)


def bass_drum(t, gain=0.6):
    """大太鼓（グラン・カッサ）：低く長く響く"""
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    f = 48 * (1 + 0.5 * np.exp(-tt * 18))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.6)
    s += 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.47) / SR) * np.exp(-tt * 3.0)
    s += lowpass(rng.standard_normal(n), 220) * np.exp(-tt * 9) * 1.5
    add(s * env(n, 0.004, 0.3), t, 0.0, gain)


def snare(t, gain=0.12):
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    s = highpass(rng.standard_normal(n), 1500) * np.exp(-tt * 18) + 0.4 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30)
    add(s, t, 0.1, gain)


def pluck(name, t, gain=0.09, pan=0.4, decay=2.5):
    """ハープ"""
    n = int(decay * SR)
    f = hz(name)
    tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 4)
         + 0.1 * np.sin(6 * np.pi * f * tt) * np.exp(-tt * 8))
    add(s * np.exp(-tt * 3.0 / decay) * env(n, 0.004, 0.1), t, pan, gain)


def celesta(name, t, gain=0.06, pan=-0.4):
    n = int(2.0 * SR)
    f = hz(name)
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * f * 4.0 * tt) * np.exp(-tt * 9)
    add(s * np.exp(-tt * 2.2) * env(n, 0.002, 0.1), t, pan, gain)


def bass(name, t, d, gain=0.16):
    """コントラバス・チェロの低音"""
    strings(name, t, d, gain=gain, pan=0.2, attack=0.15, bright=900)


def ostinato(root, t, d, gain=0.07):
    """低弦の刻み（8分音符のスタッカート）"""
    pattern = [root + '2', root + '2', root + '3', root + '2', root + '2', root + '3', root + '2', root + '3']
    k = int(d / 0.25)
    for i in range(k):
        name = pattern[i % 8]
        n = int(0.22 * SR)
        f = hz(name)
        s = lowpass(saw(f, n) + saw(f * 1.004, n, 0.5), 1400)
        add(s * env(n, 0.01, 0.08), t + i * 0.25, -0.1, gain * (1.25 if i % 4 == 0 else 1))


CHORD = {
    'D': ['D3', 'A3', 'D4', 'F#4', 'A4'],
    'Dsus': ['D3', 'A3', 'D4', 'G4', 'A4'],
    'Bm': ['B2', 'F#3', 'D4', 'F#4', 'B4'],
    'G': ['G2', 'D3', 'B3', 'D4', 'G4'],
    'A': ['A2', 'E3', 'C#4', 'E4', 'A4'],
    'Asus': ['A2', 'E3', 'D4', 'E4', 'A4'],
    'Em': ['E3', 'B3', 'E4', 'G4', 'B4'],
    'C': ['C3', 'G3', 'C4', 'E4', 'G4'],
    'F#m': ['F#2', 'C#3', 'A3', 'C#4', 'F#4'],
}
ROOT = {'D': 'D', 'Dsus': 'D', 'Bm': 'B', 'G': 'G', 'A': 'A', 'Asus': 'A', 'Em': 'E', 'C': 'C', 'F#m': 'F#'}


def pad(chord, t, d, gain=0.1, attack=0.6):
    for i, nm in enumerate(CHORD[chord]):
        strings(nm, t, d, gain=gain, pan=-0.5 + i * 0.25, attack=attack)
    bass(ROOT[chord] + '2', t, d, gain=gain * 1.1)


def arp(chord, t, d, step=0.25, gain=0.07):
    notes = [n[:-1] + str(int(n[-1]) + 1) for n in CHORD[chord][1:]]
    seq = notes + notes[-2:0:-1]
    for i in range(int(d / step)):
        pluck(seq[i % len(seq)], t + i * step, gain=gain)


def melody(notes, t0, inst=horn, **kw):
    """notes: [(音名 or None, 拍数)]。1拍 = 0.5 秒"""
    t = t0
    for name, beats in notes:
        d = beats * 0.5
        if name:
            inst(name, t, d * 0.97, **kw)
        t += d


# ---- 0〜1 秒：つかみ（ワープの光に合わせて高まる）
swell(0.0, 1.0, gain=0.2)
strings('A5', 0.0, 1.0, gain=0.03, attack=0.9)
timp_roll('D2', 0.0, 1.0, 0.02, 0.18)

# ---- 1〜9 秒：導入。弦とハープで広がる宇宙
timpani('D2', 1.0, gain=0.55)
cymbal(1.0, gain=0.12)
for t, ch in [(1, 'D'), (3, 'Bm'), (5, 'G'), (7, 'Asus')]:
    pad(ch, t, 2.0, gain=0.075)
    arp(ch, t, 2.0, gain=0.055)
# 独奏ホルンの前ぶれ（主題の断片）
melody([('A4', 2), ('B4', 1), ('D5', 1), ('C#5', 3), (None, 1)], 5.0, gain=0.09)

# ---- 9〜11 秒：ワープに向けて高まる
pad('A', 9, 2.0, gain=0.1, attack=1.4)
timp_roll('A1', 9.0, 2.0, 0.05, 0.45)
swell(9.5, 1.5, gain=0.22)
for i, nm in enumerate(['A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G#4', 'A4']):
    strings(nm, 9.0 + i * 0.25, 0.3, gain=0.05, attack=0.03)

# ---- 11〜21 秒：主題（ホルン全開）
cymbal(11.0, gain=0.28)
timpani('D2', 11.0, gain=0.8)
theme = [
    ('D5', 2), ('E5', 1), ('F#5', 1), ('A5', 3), ('G5', 1),      # 11–15
    ('F#5', 2), ('E5', 1), ('D5', 1), ('B4', 4),                 # 15–19
    ('C#5', 1), ('D5', 1), ('E5', 2), ('A4', 2), (None, 0),      # 19–21
]
melody(theme, 11.0, gain=0.15, pan=-0.2)
melody([(n[:-1] + str(int(n[-1]) - 1) if n else None, b) for n, b in theme], 11.0, gain=0.09, pan=0.25)
for t, ch in [(11, 'D'), (13, 'G'), (15, 'Bm'), (17, 'G'), (19, 'A')]:
    pad(ch, t, 2.0, gain=0.1, attack=0.25)
    timpani(ROOT[ch] + '2' if ROOT[ch] in 'DCB' else ROOT[ch] + '1', t, gain=0.45)
    timpani(ROOT[ch] + '2' if ROOT[ch] in 'DCB' else ROOT[ch] + '1', t + 1.0, gain=0.25)

# ---- 21〜25 秒：静かな驚き（宇宙望遠鏡）
for t, ch in [(21, 'Bm'), (23, 'G')]:
    pad(ch, t, 2.0, gain=0.07, attack=0.8)
for i, nm in enumerate(['F#6', 'D6', 'B5', 'D6', 'A6', 'F#6', 'D6', 'F#6',
                        'G6', 'D6', 'B5', 'D6', 'B6', 'G6', 'D6', 'G6']):
    celesta(nm, 21.0 + i * 0.25, gain=0.05)
melody([('F#5', 3), ('E5', 1), ('D5', 2), ('B4', 2)], 21.0, inst=strings, gain=0.06, pan=0.0, attack=0.3, bright=3500)

# ---- 25〜31 秒：もう一度高まる（大きさくらべ・本物の太陽）
for t, ch in [(25, 'Em'), (27, 'F#m'), (29, 'G')]:
    pad(ch, t, 2.0, gain=0.085, attack=0.4)
    arp(ch, t, 2.0, step=0.125, gain=0.04)
melody([('B4', 2), ('C#5', 1), ('D5', 1), ('E5', 2), ('F#5', 2), ('G5', 3), ('A5', 1)], 25.0, gain=0.1)
timp_roll('A1', 30.0, 1.0, 0.1, 0.5)
swell(30.0, 1.0, gain=0.2)


# 大太鼓：主題の入りと大きな山
for t in (1.0, 11.0, 15.0, 19.0, 31.0):
    bass_drum(t, gain=0.55 if t != 1.0 else 0.35)

# ---- 31 秒〜：サビ（3/4 拍子の賛歌風。旋律はオリジナル）
BAR3 = 1.5  # 3/4 拍子の1小節（秒）
HYMN = [
    # (旋律 [(音, 拍)], 和音)
    ([('D5', 2), ('C#5', 1)], 'D'),
    ([('B4', 1), ('A4', 1), ('B4', 1)], 'G'),
    ([('D5', 1.5), ('E5', 0.5), ('F#5', 1)], 'D'),
    ([('E5', 3)], 'A'),
    ([('F#5', 2), ('G5', 1)], 'D'),
    ([('A5', 1.5), ('G5', 0.5), ('F#5', 1)], 'D'),
    ([('E5', 1), ('D5', 1), ('C#5', 1)], 'A'),
    ([('D5', 3)], 'D'),
    ([('A5', 2), ('B5', 1)], 'G'),
    ([('A5', 1), ('F#5', 1), ('D5', 1)], 'Bm'),
    ([('G5', 1.5), ('F#5', 0.5), ('E5', 1)], 'Em'),
    ([('F#5', 3)], 'D'),
    ([('B4', 1), ('D5', 1), ('G5', 1)], 'G'),
    ([('F#5', 1.5), ('E5', 0.5), ('D5', 1)], 'D'),
    ([('E5', 2), ('C#5', 1)], 'A'),
    ([('D5', 3)], 'D'),
]


def down(n, k=1):
    return n[:-1] + str(int(n[-1]) - k)


def hymn_bar(i, t, full):
    notes, ch = HYMN[i]
    # 旋律：弦の合奏とホルン（盛り上がりではオクターブで重ねる）
    melody(notes, t, inst=strings, gain=0.11 if full else 0.15, pan=0.0, attack=0.12, bright=3800)
    melody([(down(n), b) for n, b in notes], t, inst=strings, gain=0.08 if full else 0.09, pan=-0.3, attack=0.12, bright=3000)
    if full:
        melody([(down(n), b) for n, b in notes], t, gain=0.12, pan=-0.2)
        melody(notes, t, gain=0.07, pan=0.25)
    pad(ch, t, BAR3, gain=0.075 if full else 0.07, attack=0.2)
    # 低音は1拍目、内声は2・3拍目に刻んで3拍子を感じさせる
    for k in (1, 2):
        for nm in CHORD[ch][2:4]:
            strings(nm, t + k * 0.5, 0.4, gain=0.03, attack=0.04, pan=0.3)
    if full:
        bass_drum(t, gain=0.4 if i % 4 else 0.6)
        timpani(ROOT[ch] + ('2' if ROOT[ch] in 'DCB' else '1'), t, gain=0.35)
        if i % 4 == 0:
            cymbal(t, gain=0.16)
    else:
        arp(ch, t, BAR3, step=0.25, gain=0.06)
        # 前半はホルン1本で旋律の下を支える
        melody([(down(n), b) for n, b in notes], t, gain=0.06, pan=-0.3)
        if i % 4 == 0:
            timpani(ROOT[ch] + ('2' if ROOT[ch] in 'DCB' else '1'), t, gain=0.3)


if KIND == 'video':
    # 動画：31〜40 秒にサビの後半（山と終わり）だけ。最後の和音を 38.5 秒から伸ばす
    cymbal(31.0, gain=0.24)
    for k, i in enumerate([8, 9, 10, 11, 14]):
        hymn_bar(i, 31.0 + k * BAR3, True)
    t_end = 31.0 + 5 * BAR3  # 38.5
    melody([('D5', 3)], t_end, inst=strings, gain=0.11, attack=0.1, bright=3800)
    melody([('D4', 3)], t_end, gain=0.13)
    for nm in CHORD['D'] + ['D5', 'A5']:
        strings(nm, t_end, 1.6, gain=0.08, attack=0.08)
    bass('D2', t_end, 1.6, gain=0.15)
    bass_drum(t_end, gain=0.75)
    timpani('D2', t_end, gain=0.8)
    cymbal(t_end, gain=0.3, decay=3.0)
else:
    # ループ：サビを丸ごと（前半は静かに、後半は全員で）→ 刻み → 終わりの和音 → 頭のふくらみへ戻る
    cymbal(31.0, gain=0.2)
    for i in range(16):
        hymn_bar(i, 31.0 + i * BAR3, i >= 8)
    t = 31.0 + 16 * BAR3  # 55
    for tt, ch in [(t, 'D'), (t + 2, 'C'), (t + 4, 'A')]:
        pad(ch, tt, 2.0, gain=0.08, attack=0.15)
        ostinato(ROOT[ch], tt, 2.0, gain=0.07)
        for k in range(4):
            snare(tt + k * 0.5 + 0.25, gain=0.06)
        timpani(ROOT[ch] + ('2' if ROOT[ch] in 'DC' else '1'), tt, gain=0.45)
    melody([('A5', 1), ('F#5', 1), ('D5', 1), ('E5', 1), ('G5', 2), ('E5', 1), ('C5', 1),
            ('D5', 1), ('E5', 1), ('F#5', 1), ('E5', 1)], t, gain=0.13)
    timp_roll('A1', t + 5.0, 1.0, 0.1, 0.5)
    t += 6.0  # 61
    cymbal(t, gain=0.28, decay=3.5)
    bass_drum(t, gain=0.75)
    timpani('D2', t, gain=0.85)
    melody([('F#5', 1), ('D5', 7)], t, gain=0.14)
    for nm in CHORD['D'] + ['D5', 'A5']:
        strings(nm, t, 4.0, gain=0.08, attack=0.08)
    bass('D2', t, 4.0, gain=0.14)

# ---- 響き（ホール）
n = int(2.8 * SR)
tt = np.arange(n) / SR
irL = lowpass(rng.standard_normal(n) * np.exp(-tt * 2.4), 6000)
irR = lowpass(rng.standard_normal(n) * np.exp(-tt * 2.4), 6000)
wet = 0.22 / np.sqrt(np.sum(irL ** 2))
outL = L + fftconvolve(L, irL)[:N] * wet
outR = R + fftconvolve(R, irR)[:N] * wet
out = np.stack([outL, outR], 1)
K = int(DUR * SR)
if KIND == 'video':
    out = out[:K]
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
else:
    # 終わりからはみ出た余韻を頭に重ねて、つなぎ目をなくす
    tail = out[K:]
    out = out[:K].copy()
    out[: len(tail)] += tail
out = np.tanh(out / np.max(np.abs(out)) * 1.4) / np.tanh(1.4) * 0.89
wavfile.write(sys.argv[1], SR, (out * 32767).astype(np.int16))
print('wrote', sys.argv[1], out.shape[0] / SR, 's')
