import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app/i18n'
import App from './app/App'
import { requestPersistentStorage } from './db/db'

void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
