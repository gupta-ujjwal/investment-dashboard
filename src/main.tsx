import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Mount point #root not found in index.html')
}
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Request persistent storage so the browser's storage-pressure eviction (and
// Safari ITP's 7-day-no-interaction wipe) can't silently delete a user's
// only copy of their portfolio data — manual backup/export is the sole
// recovery path otherwise. Fire-and-forget: the browser either already
// granted it, prompts once, or declines based on its own site-engagement
// heuristics — this call cannot make anything worse than not calling it.
// Feature-detected since Vitest's jsdom environment doesn't implement the
// Storage API.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}
