import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { logClientError } from './lib/api';
import './index.css';

window.addEventListener('error', (e) => logClientError(e.message));
window.addEventListener('unhandledrejection', (e) => logClientError(e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
