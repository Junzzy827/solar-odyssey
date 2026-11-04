// ui/GalleryPanel.tsx の文言（日本語）

export const galleryPanelJa = {
  viewingMode: '鑑賞モード',
  shipSummary: (registry: string, name: string, kind: string, len: number, _nameEn: string, _kindEn: string) => `${registry} ${name}（${kind}・全長 約${len}m）`,
  autoTour: 'おまかせ',
  compareSizes: '大きさくらべ',
  labels: '名札',
  comparedAtRealSize: '本物の大きさでくらべる',
  shipLength: (registry: string, len: number) => `${registry}：${len}m`,
  fromStory: '（この船の設定）',
  compareLength: (name: string, meters: number, _nameEn: string) => `${name}：${meters}m`,
  compareNote: (note: string, _noteEn: string) => `（${note}）`,
  enterBridge: '▶ 艦橋（ブリッジ）の中に入る',
  autoTourNote: 'いくつかの角度から、ゆっくり順に見せます。ドラッグすると自分で動かせます。',
  touchHint: '指でなぞって回転、2本指で寄ったり引いたり。名札や下の一覧をタップすると、その部分の説明が出ます。',
  mouseHint: 'ドラッグで回転、ホイールで寄ったり引いたり。名札や下の一覧をクリックすると、その部分の説明が出ます。',
  shipParts: '各部の名前',
  fictionNote: 'この船の形や設定は、このアプリのオリジナルの空想です。',
  backToCockpit: '操縦席へもどる',
}
