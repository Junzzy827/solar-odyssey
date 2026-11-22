# 映画のカットの確認の道具

月ミッションの打ち上げ（components/moonMission/LaunchWorld.tsx と launchFilm.ts）を、本物の写真とくらべるための道具です。CI では使いません。

1. `npm run build`（画面を変えたら毎回）
2. `SHOTS="9:refNight,30:refLiftoff" OUT=/tmp/shots node tools/film/shots.mjs`
   - 時刻は秒読みを始めてからの秒。T-8.9 で点火ボタンを押すので、点火は 11.1 秒、離昇は約 17〜20 秒。
   - 名前は `launchFilm.ts` の `Shot`。`refNight`・`refLiftoff` は手本の写真と同じ向きのカメラ（ふだんのカット割りには出ない）。
   - `QUALITY=low|medium|high`、`W`・`H` で画面の大きさ。
3. `python3 tools/film/compare.py /tmp/cmp.jpg 手本.jpg /tmp/shots/0030-refLiftoff.jpg --label 手本 アプリ`

手本の写真（NASA、パブリックドメイン）は `/mnt/project-files/moon-mission/ref/` にあります。

| 写真 | カメラ |
| --- | --- |
| S72-54813（11 月、満月とサーチライト） | `refNight` |
| S72-55070（12 月 7 日、塔を越えた直後） | `refLiftoff` |

注意：ブラウザーを使う確認（この道具・`tools/smoke`）は、同時に 2 つ走らせない（SwiftShader がとても遅くなる）。
