import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const basePath = import.meta.env.BASE_URL || '/';
      await navigator.serviceWorker.register(`${basePath}service-worker.js`, {
        scope: basePath,
      });
      console.info('[PWA] Service worker registered');
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
    }
  });
}
