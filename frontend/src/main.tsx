import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'antd/dist/reset.css'
import { preloadChoices } from './hooks/useChoices'

// Warm the choices cache before the first component mounts
preloadChoices()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
