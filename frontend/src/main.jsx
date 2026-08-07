import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Enable Service Worker precaching and runtime caching of static files in Cache Storage
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.info('[MagnusCI] New static bundle content available, updating cache.');
  },
  onOfflineReady() {
    console.info('[MagnusCI] Static assets cached locally in browser storage for instant reloads.');
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

