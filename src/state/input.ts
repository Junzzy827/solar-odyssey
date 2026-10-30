/**
 * タッチ操作（スマホ・タブレット）の入力。操縦（Ship）とビーム（Phaser）が、
 * キーボード・マウスの入力と合わせて毎フレーム読む
 */
export const touchInput = {
  /** 左のスティック：x は右、y は後ろ（-1〜1） */
  x: 0,
  y: 0,
  /** 上昇・下降ボタン（1 で上昇、-1 で下降） */
  lift: 0,
  /** 回転ボタン（1 で左回り、-1 で右回り） */
  roll: 0,
  /** 指でなぞった量（ピクセル）。船の向きを変える */
  lookX: 0,
  lookY: 0,
  /** ビームのボタンを押している（短く押すと通常のビーム、長押しでチャージビーム） */
  beam: false,
  /** ビームのボタンを押した（次のフレームで読んで消す。押してすぐ離しても取りこぼさないように） */
  beamPressed: false,
}

/** 指で操作する端末か（マウスのないスマホ・タブレット）。#touch を付けると、パソコンでも試せる */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia('(hover: none) and (pointer: coarse)').matches || location.hash.includes('touch'))
