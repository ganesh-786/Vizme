import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import ErrorBoundary from '@/components/ErrorBoundary';
import { validateEnv } from '@/config/env';
import '@/index.css';
import '@/store/themeStore';

validateEnv();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
