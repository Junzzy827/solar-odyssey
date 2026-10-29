import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Hangar from './Hangar'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash.startsWith('#hangar') ? <Hangar /> : <App />}
  </StrictMode>,
)
