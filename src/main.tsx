import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from 'sonner';

// Desktop keeps the phone layout in a centered device-style frame.
if (window.matchMedia('(min-width: 768px)').matches) {
  document.body.classList.add('desktop-frame');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" theme="dark" richColors duration={3500} visibleToasts={1} />
  </StrictMode>
);
