# tools/iss：宇宙ステーション（ISS）の中をアプリ用にする

元の模型は NASA 3D Resources の「International Space Station (ISS) [internal]」（FBX、12 のモジュール）で、
クレジットは public/models/iss/SOURCE.txt にある。
元の FBX はリポジトリに入れない。信用しないデータとして扱い、スクリプトは FBX のフォルダの外に置いて `python -I` で動かす。

## 必要なもの
- Blender の Python モジュール：`python -m venv .venv && .venv/bin/pip install bpy numpy scipy pillow`
- node（glb の圧縮 tools/glb/compress.mjs、撮影 capture.mjs は Playwright）
- Blender は 1 つずつ動かす（メモリをたくさん使うので、同時に 2 つ動かさない）

## 作る順番

```
export ISS_SRC="<…>/International Space Station (ISS) [internal].fbx"
export WORK=/tmp/iss-work
PY=.venv/bin/python

# 段階 0：モジュールに分けて調べる → tools/iss/modules.json、$WORK/tex_src/*.png、$WORK/weight.json
$PY -I tools/iss/split_modules.py
# 色の絵の一覧（ロゴを消した所を赤紫のわくで）→ s0-textures-*.jpg
SHEETS=1 MODULES= $PY -I tools/iss/textures.py
# 12 モジュールの重さの見積もり → s0-weight-table.md
$PY -I tools/iss/weight_table.py
# モジュールの全体の絵 → s0-<module>.png
MODULE=node2 PREVIEW=1 VIEWS=overview PREFIX=s0-node2 $PY -I tools/iss/build_module.py

# 段階 1：デスティニー（us_lab）
MODULE=us_lab BAKE=1 EXPORT=1 PREVIEW_DIR=$WORK/preview $PY -I tools/iss/build_module.py   # 約 5 分
node tools/glb/compress.mjs public/models/iss/us_lab.glb
MODULES=us_lab $PY -I tools/iss/textures.py      # tex/*.webp と us_lab.json
```

```
# 段階 2：12 モジュール全部（1 つ 1〜6 分。Blender は 1 つずつ）
for m in us_lab node2 node1 node3 jpm jlp columbus airlock cupola pmm beam bishop; do
  MODULE=$m BAKE=1 EXPORT=1 $PY -I tools/iss/build_module.py && node tools/glb/compress.mjs public/models/iss/$m.glb
done
$PY -I tools/iss/textures.py       # tex/*.webp（near・far の 2 段）と station.json
# 光の UV の詰まり方だけ数える（焼かない）：MODULE=node1 UVTEST=1 UV_ANGLE=66 $PY -I tools/iss/build_module.py
# 撮影：アプリを npx vite --port 5201 で動かして
node tools/iss/capture_s2.mjs            # s2-<部屋>.jpg と weight-s2-pc.json
node tools/iss/capture_s2.mjs --phone    # s2-phone-*.jpg と weight-s2-phone.json
node tools/iss/flythrough.mjs            # s2-flythrough.mp4（1 コマずつ。SwiftShader で数時間）
```

焼き直さずに光の明るさだけを直すときは `MODULE=us_lab $PY -I tools/iss/light_finish.py` を使う。
調子を変える値は TARGET、GAMMA、FLOOR。

## ファイル
| ファイル | すること |
|---|---|
| iss_common.py | 座標の変換（元：0.1 m・+X 前・+Z 天頂 → アプリ：m・three の −Z 前・+Y 天頂、原点はノード 1 の真ん中）、モジュールの名前の頭、つなぎ目、隠す材質、動く部品 |
| split_modules.py | 全部の物をモジュールに分け、範囲・となり・ハッチ・三角形・材質を modules.json に書く |
| logo_masks.json | 色の絵の中のロゴ・ワッペンの四角（4096 画素の座標）。textures.py がまわりの色で塗る |
| textures.py | ロゴを消し、「1 m あたりの画素数」とメモリの予算で大きさを決めて WebP にする（near・far の 2 段）。全体の manifest（station.json）も書く |
| build_module.py | 1 つのモジュールを glb（絵なし）と焼いた光（2 番目の UV、OIDN でノイズ取り）にする。確かめの絵（PREVIEW）も |
| light_finish.py | 焼いた光のすきま埋め・明るさの調子 → JPEG（B・B/2・B/4） |
| weight_table.py | 12 モジュールの重さの見積もり表 |
| capture.mjs | 段階 1 の撮影（s1-app-*.jpg）＋重さ |
| capture_s2.mjs | 段階 2：部屋ごとの見本（s2-<部屋>.jpg）・スマホ（s2-phone-*.jpg）＋重さ（weight-s2-pc/phone.json） |
| flythrough.mjs | 段階 2：通りぬける動画（s2-flythrough.mp4）。道は src/components/iss/film.ts |
| inspect_glb.mjs | glb の部品・材質・頂点の属性を一覧にする |
| FACTS.md | カードの文の事実と出典 |

## アプリ側
- src/components/iss/：IssView（Canvas・キー・見回し）、IssWorld（部屋の出し入れ・幕・動き・印）、IssEarth（窓の地球：ステンシル）、
  WaterBall、Drifters、floatControl（無重力の動き。ほかのファイルを読まないので、シャトルでも使える）、issAudio、IssHud、IssMap（地図）
- 段階 2 の読みこみ：station.ts（全体の地図）→ moduleStreamer.ts（いる部屋・口の 4 m 以内・口ごしに見える部屋を決める。
  3 秒たってから捨てる）→ moduleLoader.ts（glb・材質・当たり判定。当たり判定の木は bvhWorker.ts で別のスレッド）→
  texManager.ts（同じ絵は 1 回だけ GPU に。1 コマに 1 枚ずつ載せる。使わなくなったらすぐ消す）
- 撮影の道：film.ts（時刻 t だけで場所と向きが決まる）
- src/state/iss.ts（流れ・操作・`__sv.iss`）、src/state/saves/iss.ts（記録）、src/i18n/iss.ja.ts / iss.en.ts
- 試しの URL `?iss=sample` か `#iss=sample` のときだけ読む（ふだんは何も読まない）

## 材質の扱い（アプリ）
- MeshBasicMaterial に、色の絵（1 番目の UV）と焼いた光（2 番目の UV、lightMapIntensity 2π）を貼る。toneMapped は false、DoubleSide。
- ランプの面（Generic_Lights）は光の絵を掛けない。
- 透ける絵は alphaTest 0.5。
- 元の模型のノーマル・メタル・ラフネスの絵は使わない（焼いた光で十分に見え、重さが半分以下になるため）。
