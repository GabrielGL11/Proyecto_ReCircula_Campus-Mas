import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import RequiereSesion from './auth/RequiereSesion.tsx'
import SesionProvider from './auth/SesionProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SesionProvider>
      <RequiereSesion>
        <App />
      </RequiereSesion>
    </SesionProvider>
  </StrictMode>,
)
