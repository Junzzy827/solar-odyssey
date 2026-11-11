// Shift+F12：画面の文字とボタンをぜんぶ消して、3D の場面だけにする（スクリーンショットや、景色をながめるとき）。もう一度押すと戻る。
// <html> に clean-screen をつけるだけで、消すのは index.css。ゲームの中身は何も変えない（止めない・レースの時計もそのまま・ほかのキーも効く）。
// 覚えておかないので、読み込み直すと、ふつうの画面に戻る
export function setupCleanScreen() {
  window.addEventListener(
    'keydown',
    (e) => {
      // Ctrl・Alt・Meta もいっしょに押したときは、ブラウザのキーとして残す
      if (e.code !== 'F12' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()
      if (!e.repeat) document.documentElement.classList.toggle('clean-screen')
    },
    true,
  )
}
