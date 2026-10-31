import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Hangar from './Hangar'
import './index.css'
import './touch.css'
import { setupMusic } from './audio/music'

// 録画・動作確認用
if (location.hash.includes('debug')) void import('./debugHooks')

if (!location.hash.startsWith('#hangar')) setupMusic()

// マウスや指で押したボタンからは、すぐにフォーカスを外す。残っていると、そのあと Enter（ワープ）や Space（上昇）を押したときに
// 同じボタンがもう一度押されてしまう（「ブリッジに入る」を押してから Enter でワープすると、ブリッジから出てしまうなど）。
// キーボードで押したとき（detail が 0）はフォーカスを残す
document.addEventListener('click', (e) => {
  const button = e.target instanceof Element ? e.target.closest('button') : null
  if (button && e.detail > 0) button.blur()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash.startsWith('#hangar') ? <Hangar /> : <App />}
  </StrictMode>,
)
