import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Initialize theme store
import './store/themeStore'

// Mount React WITHOUT StrictMode to prevent double effect invocation
// StrictMode causes auth effects to run twice, creating race conditions with Keycloak
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

