# 段階 0：12 のモジュール全部の重さの見積もり表（s0-weight-table.md）を作る。Blender は使わない。
#   WORK=/tmp/iss-work python3 -I tools/iss/weight_table.py [出力 .md]
# 使うもの：tools/iss/modules.json と $WORK/weight.json（split_modules.py が書く）、textures.py の大きさの決め方。
# 見積もりの式（実測は us_lab だけ。ほかは us_lab の実測の比で見積もる）：
#   描画の数 ≈ 材質の数（静かな部品は材質ごとに 1 つ）＋ 動く部品の数
#   glb（meshopt）≈ 三角形 × us_lab の実測（バイト / 三角形）
#   色の絵のダウンロード ≈ 画素数 × us_lab の実測（バイト / 画素）。モジュールどうしで同じ絵は 1 回だけ数える列も出す
#   焼いた光 ≈ PC 2048 / スマホ 1024 の JPEG（us_lab の実測）
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault('MODULES', '')
import textures as T  # noqa: E402

OUT_MD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('WORK', '/tmp/iss-work'), 's0-weight-table.md')
PUB = os.path.join(HERE, '..', '..', 'public', 'models', 'iss')

info = T.info
mods = info['modules']


def measured():
    """us_lab の実測：glb のバイト / 三角形、webp のバイト / 画素、光の絵のバイト"""
    lab = next(m for m in mods if m['id'] == 'us_lab')
    glb = os.path.getsize(os.path.join(PUB, 'us_lab.glb'))
    px = by = 0
    for f in os.listdir(os.path.join(PUB, 'tex')):
        s = int(f.split('.')[-2])
        px += s * s
        by += os.path.getsize(os.path.join(PUB, 'tex', f))
    light = {k: os.path.getsize(os.path.join(PUB, f'us_lab.light.{s}.jpg')) for k, s in (('pc', 2048), ('phone', 1024))}
    return glb / lab['triangles'], by / px, light


per_tri, per_px, light = measured()
rows = []
seen = {'pc': set(), 'phone': set()}
for m in mods:
    used, sizes = T.plan(m['id'])
    mats = [k for k in m['materials'] if not info['materials'].get(k, {}).get('hidden')]
    draws = len(mats) + len(m.get('movable', []))
    r = {'id': m['id'], 'key': m['key'], 'tris': m['triangles'], 'mats': len(mats), 'movable': len(m.get('movable', [])), 'draws': draws, 'tex': len(used)}
    for p in ('pc', 'phone'):
        s = sizes[p]
        r[f'mem_{p}'] = sum(T.mem_mb(v) for v in s.values()) + T.mem_mb(2048 if p == 'pc' else 1024)
        r[f'dl_{p}'] = (m['triangles'] * per_tri + sum(v * v for v in s.values()) * per_px + light[p]) / 1e6
        new = {t for t in s if t not in seen[p]}
        r[f'dl_new_{p}'] = (m['triangles'] * per_tri + sum(s[t] ** 2 for t in new) * per_px + light[p]) / 1e6
        seen[p] |= set(s)
    rows.append(r)

# 絵がどのモジュールで共有されているか
share = {}
for mat, d in T.weight.items():
    t = info['materials'].get(mat, {}).get('texture')
    if not t or info['materials'][mat].get('hidden'):
        continue
    for mod in d:
        share.setdefault(t, set()).add(mod)

L = []
L.append('# ISS 12 モジュールの重さの見積もり（段階 0）\n')
L.append('元：NASA 3D Resources「ISS Interior」。座標・分け方は tools/iss/modules.json。us_lab だけは実測（段階 1 で書き出した物）、ほかは us_lab の実測の比で見積もった。\n')
L.append(f'実測の比：glb（meshopt）{per_tri:.1f} バイト / 三角形、色の絵（WebP q{T.QUALITY}）{per_px:.3f} バイト / 画素、焼いた光 PC {light["pc"] / 1e6:.2f} MB / スマホ {light["phone"] / 1e6:.2f} MB。\n')
L.append('テクスチャのメモリは RGBA＋ミップマップ（×4/3）、光の絵（PC 2048 / スマホ 1024）を含む。窓の地球の絵（PC 4k ≈ 45 MB、スマホ 2k ≈ 11 MB＋雲 2k ≈ 11 MB）は含まない。\n')
L.append('「続けて読む」は、上の行のモジュールをもう読んでいるとき、新しく増える分（同じ絵は 1 回だけ）。\n')
L.append('予算（1 モジュールを見ているとき）：ダウンロード PC ≤ 6 MB / スマホ ≤ 3 MB、テクスチャのメモリ PC ≤ 200 MB / スマホ ≤ 64 MB、描画 PC ≤ 150 / スマホ ≤ 100。\n')
L.append('| モジュール | 三角形 | 材質 | 動く部品 | 描画（見積） | 絵の数 | メモリ PC MB | メモリ スマホ MB | DL PC MB | DL スマホ MB | 続けて読む PC MB | 続けて読む スマホ MB |')
L.append('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for r in rows:
    L.append(f"| {r['id']} ({r['key']}) | {r['tris']:,} | {r['mats']} | {r['movable']} | {r['draws']} | {r['tex']} | {r['mem_pc']:.0f} | {r['mem_phone']:.0f} | {r['dl_pc']:.2f} | {r['dl_phone']:.2f} | {r['dl_new_pc']:.2f} | {r['dl_new_phone']:.2f} |")
tot = sum(r['tris'] for r in rows)
L.append(f"| 合計 | {tot:,} | | | | | | | | | {sum(r['dl_new_pc'] for r in rows):.1f} | {sum(r['dl_new_phone'] for r in rows):.1f} |")
L.append('\n## 複数のモジュールで共有される絵\n')
L.append('| 絵 | 使うモジュール |')
L.append('|---|---|')
for t, ms in sorted(share.items(), key=lambda kv: -len(kv[1])):
    if len(ms) > 1:
        L.append(f'| {t} | {", ".join(sorted(ms))} |')
L.append('\n## 読み方\n')
L.append('- どのモジュールも、1 つだけなら予算に入る見積もり。いちばん重いのは us_lab（三角形 67k、絵 10 枚）。beam と bishop は材質 1 つで三角形が多い（5 万台）。')
L.append('- スマホのダウンロード 3 MB は、1 モジュールずつ読めば入る。となりも先に読むと、2 つ目からは共有の絵の分だけ軽くなる。')
L.append('- 段階 2 で「いるモジュール＋となり」を読むときは、共有の絵（Generic_HubAndMetals・Generic_Misc_Details など）は texManager の数え方で 1 回だけ載る。')
L.append('- 描画の数は材質ごとにまとめたときの見積もり。窓の地球（2〜3）、水の玉（1〜7）、小物（9 前後）が別に増える。')
open(OUT_MD, 'w').write('\n'.join(L) + '\n')
print('wrote', OUT_MD)
for r in rows:
    print(r)
