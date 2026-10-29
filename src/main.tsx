import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Hangar from './Hangar'
import './index.css'
import { setupMusic } from './audio/music'

// 録画・動作確認用
if (location.hash.includes('debug')) void import('./debugHooks')

if (!location.hash.startsWith('#hangar')) setupMusic()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash.startsWith('#hangar') ? <Hangar /> : <App />}
  </StrictMode>,
)
