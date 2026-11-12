import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/context/SessionProvider';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

// Use the framed composition only when both dimensions can support it.
try {
  if (typeof window !== 'undefined') {
    const roomyViewport = window.matchMedia?.(
      '(min-width: 768px) and (min-height: 720px), (min-width: 900px) and (min-height: 600px)',
    );
    const syncFrameClass = () => document.body.classList.toggle('desktop-frame', Boolean(roomyViewport?.matches));
    syncFrameClass();
    roomyViewport?.addEventListener?.('change', syncFrameClass);
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
