import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Desktop keeps the phone layout in a centered device-style frame.
if (window.matchMedia('(min-width: 768px)').matches) {
  document.body.classList.add('desktop-frame');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
