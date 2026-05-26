import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { initTheme } from './lib/theme'
import './styles/globals.css'

initTheme()

// Block the browser's default "navigate to dropped file" behavior anywhere
// outside an explicit drop target. The terminal pane opts back in via its
// own onDragOver/onDrop handlers (which call preventDefault first).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
