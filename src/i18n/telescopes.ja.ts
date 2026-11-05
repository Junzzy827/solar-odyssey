// data/telescopes.ts の文言（日本語）

export const telescopesJa = {
  hubbleSpaceTelescope: 'ハッブル宇宙望遠鏡',
  webbSpaceTelescope: 'ウェッブ宇宙望遠鏡',
  hubble: 'ハッブル',
  webb: 'ウェッブ',
  found: (name: string) => `${name}のそばに来ました。\nT キーで、望遠鏡の目で深宇宙をのぞいてみよう。（I で航海日誌）`,
  tooFar: (name: string) => `${name}のそばまで行くと、望遠鏡の写真をのぞけます。`,
}
