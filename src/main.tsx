import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/context/SessionProvider';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

// Desktop keeps the phone layout in a centered device-style frame.
try {
  if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)')?.matches) {
    document.body.classList.add('desktop-frame');
  }
} catch {
  // Ignore on restricted environments
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <SessionProvider>
        <App />
        <Toaster position="top-center" theme="dark" richColors duration={3500} visibleToasts={1} />
      </SessionProvider>
    </AppErrorBoundary>
  </StrictMode>
);
