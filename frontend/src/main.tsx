import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import './index.css'
import App from './App.tsx'

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('appUrlOpen', (event) => {
    if (event.url) {
      window.location.href = event.url
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
