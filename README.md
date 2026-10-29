# Solar Voyager

宇宙船で太陽系を旅しながら学べる、教育用の3Dウェブアプリです。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力
```

## 構成

- Vite + TypeScript + React Three Fiber（Three.js）
- `src/data/bodies.ts` 天体データ（NASA Planetary Fact Sheet の概数）
- `src/data/scale.ts` 表示スケール。距離は対数で圧縮し、惑星は同じ平面上の同心円で公転する

## 公開

`main` へのpushで GitHub Actions が GitHub Pages にデプロイします。
初回のみ、リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。

## 版権について

特定の作品の名称・ロゴ・設定画・音声は使わず、宇宙船や画面デザインはオリジナルで制作します。
