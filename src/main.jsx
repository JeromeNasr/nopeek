import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// After a new version is deployed, a tab opened earlier may ask for page files that no
// longer exist. Reload once to pick up the new version instead of showing an error.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('touchtype.reloadedForUpdate')) return
    sessionStorage.setItem('touchtype.reloadedForUpdate', '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('touchtype.reloadedForUpdate') } catch { /* ignore */ } }, 10000)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)