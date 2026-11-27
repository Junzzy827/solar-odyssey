# ISS の場面で使う事実と出典

カード（src/i18n/iss.ja.ts / iss.en.ts）と場面の動きに使っている事実。1 つずつ出典を付けた。
2026-11-27 に確認。出典が見つからなかったものは UNVERIFIED と書いた。

## カードの文

| # | 文（ja） | 事実 | 出典 |
|---|---|---|---|
| 1 | 水は落ちない。まるい玉になって浮かぶ。 | 重力がないと、水の粒は表面積がいちばん小さい形（球）になる | USGS Water Science School「Water in Space」 https://www.usgs.gov/water-science-school/science/water-space-how-does-water-behave-outer-space |
| 2 | つつくと、ぷるぷるゆれて分かれる。 | 場面の遊び（演出）。事実として言っていない | — |
| 3 | 水の中の空気の泡も、上へ浮かばない。 | 同じ USGS のページ。写真のキャプションは "outer space water forms a sphere and air bubble doesn't rise" | https://www.usgs.gov/water-science-school/science/water-space-how-does-water-behave-outer-space ・ https://www.usgs.gov/media/images/outer-space-water-forms-a-sphere-and-air-bubble-doesnt-rise |
| 4 | 宇宙では、毎日 2 時間ほど運動する。 | "Crew members now average two hours of exercise per day"。facts-and-figures のページには "at least two hours a day" | https://www.nasa.gov/missions/station/iss-research/astronaut-exercise ・ https://www.nasa.gov/international-space-station/space-station-facts-and-figures/ |
| 5 | 体を使わないと、骨と筋肉が弱くなるから。 | "Without Earth's gravity, both bone and muscle atrophy, or become smaller and weaker" | https://www.nasa.gov/missions/station/iss-research/astronaut-exercise |
| 6 | 足をペダルにつけ、ベルトで体をとめてこぐ。 | 自転車（CEVIS）では、足をペダルにつけ、"strap in with the seatbelt" | Space Center Houston「Solving Space: Space Bike」 https://spacecenter.org/solving-space-space-bike/ |
| 7 | 床の下の窓から、真下の地球が見える。 | デスティニーの窓は nadir viewing window（真下の地球を見る窓）で、WORF のラックがその前にある | NASA Earth Observatory「ISS Window Observational Research Facility」 https://science.nasa.gov/earth/earth-observatory/iss-window-observational-research-facility/ |
| 8 | ステーションは 地上 約 400 km を飛んでいる。 | "orbits Earth at an average altitude of approximately 250 miles"。250 mi ≈ 402 km | https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-the-international-space-station/ |
| 9 | 90 分ほどで地球を 1 周する。 | "orbiting Earth about every 90 minutes"・"16 orbits of Earth" in 24 hours | https://www.nasa.gov/international-space-station/space-station-facts-and-figures/ |

最初の案の文から 2 つを差し替えた。出典が見つからなかったため。
- 「こぼした水は、吸いとって集める」は 3 に差し替えた。
- 「サドルは無い」は 6 に差し替えた。上の出典にはサドルの話が出てこない。

## 場面の作りに使った事実

| 事実 | 使った所 | 出典 |
|---|---|---|
| 自転車（CEVIS）は US Lab（デスティニー）の LAB1P3 にある | 自転車の印の場所。模型の CEVIS の位置そのもの | NASA GRC PIMS ISS Handbook「CEVIS」 https://gipoc.grc.nasa.gov/pims/pimsdocs/public/ISS%20Handbook/hb_vib_crew_Cycle_Ergometer_with_Vibration_Isolation_System_(CEVIS).pdf |
| 1 周は 92.7 分 | IssEarth.tsx の地球の回る速さ | UNVERIFIED。上の NASA のページには「about 90 minutes」しかない。92.7 分は一般に言われる値。カードには出さない |
| 窓の下に見える地球の最初の場所（北緯 23°・西経 76°、バハマのあたり） | IssEarth.tsx | 演出。事実ではない（軌道傾斜 51.6° の中に入るように選んだ） |
| 窓の内径は約 0.5 m | WINDOW_R 0.26 m | 模型（NASA 3D Resources）の寸法を測った値。本物の寸法は確かめていない（UNVERIFIED） |
| 部屋の大きさ（デスティニーは長さ約 8.5 m、直径約 4.3 m） | — | 模型の寸法をそのまま使った。数字はカードに出していない |

## 出さないと決めたもの

- 実在の宇宙飛行士の名前・言葉は出さない。
- NASA・各国の宇宙機関・会社のロゴ、記章、クルーのワッペンは出さない（tools/iss/logo_masks.json で消している）。
