import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SafeStorageAdapter, safeGetJson, safeSetJson, safeLocalStorage, safeSessionStorage } from '@/lib/safeStorage';
import { fetchWithTimeout } from '@/lib/safeFetch';
import { loadAppSettings, saveAppSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AdController } from '@/components/AdController';
import { useVideos } from '@/hooks/useVideos';
import { sessionService } from '@/services/session';
import * as vastModule from '@/services/vast';
import { supabase } from '@/services/supabase';

describe('Phase 4: Privacy-First Self-Contained Deployment & Browser/Extension Resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    safeLocalStorage._resetMemoryForTesting();
    safeSessionStorage._resetMemoryForTesting();
  });

  describe('1. Universal Storage Shield (safeStorage)', () => {
    it('falls back seamlessly to in-memory dictionary when native localStorage throws SecurityError', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      const shield = new SafeStorageAdapter('localStorage');
      expect(shield.isNativeAvailable()).toBe(false);

      // Should NOT throw and must retain value in-memory
      expect(() => shield.setItem('pulse:test', 'shielded-value')).not.toThrow();
      expect(shield.getItem('pulse:test')).toBe('shielded-value');

      // Remove should work in-memory
      shield.removeItem('pulse:test');
      expect(shield.getItem('pulse:test')).toBeNull();
    });

    it('gracefully handles QuotaExceededError during sessionStorage write while retaining in-memory value', () => {
      vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      const shield = new SafeStorageAdapter('sessionStorage');
      expect(safeSetJson(shield, 'prefs', { autoplay: false })).toBe(true);
      expect(safeGetJson(shield, 'prefs', { autoplay: true })).toEqual({ autoplay: false });
    });

    it('recovers in-memory value on partial QuotaExceededError when getItem natively returns null', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation((key: string) => {
        if (key === 'large_payload') {
          throw new DOMException('Quota exceeded for large key', 'QuotaExceededError');
        }
      });

      const shield = new SafeStorageAdapter('localStorage');
      shield.setItem('large_payload', 'kept-in-memory');
      expect(shield.getItem('large_payload')).toBe('kept-in-memory');
    });

    it('protects loadAppSettings and saveAppSettings in restricted browser modes', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('Blocked by extension', 'SecurityError');
      });
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Blocked by extension', 'SecurityError');
      });

      // Must return defaults safely rather than crashing
      expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS);
      expect(() => saveAppSettings({ dataSaver: true, autoplay: false, viewingInsights: false })).not.toThrow();
      // In-memory shield retains saved settings for the session
      expect(loadAppSettings().dataSaver).toBe(true);
      expect(loadAppSettings().autoplay).toBe(false);
    });
  });

  describe('2. Self-Contained Infrastructure & Zero External Trackers Audit', () => {
    it('enforces self-contained CSP without external Google Fonts CDN or trackers in public/_headers', () => {
      const headersContent = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf-8');
      expect(headersContent).not.toContain('fonts.googleapis.com');
      expect(headersContent).not.toContain('fonts.gstatic.com');
      expect(headersContent).not.toContain('google-analytics');
      expect(headersContent).not.toContain('googletagmanager');
      expect(headersContent).toContain("Content-Security-Policy: default-src 'self'");
      expect(headersContent).toContain('/sw.js');
      expect(headersContent).toContain('/registerSW.js');
    });

    it('matches self-contained CSP inside Edge API http helper', () => {
      const httpHelper = readFileSync(resolve(process.cwd(), 'functions/_lib/http.ts'), 'utf-8');
      expect(httpHelper).not.toContain('fonts.googleapis.com');
      expect(httpHelper).not.toContain('fonts.gstatic.com');
      expect(httpHelper).toContain("default-src 'self'");
    });

    it('contains zero third-party analytics, pixels, or external CDN references in index.html', () => {
      const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(indexHtml).not.toContain('bolt.new');
      expect(indexHtml).not.toContain('fonts.googleapis.com');
      expect(indexHtml).not.toContain('gtag');
      expect(indexHtml).not.toContain('analytics');
      expect(indexHtml).not.toContain('fbevents');
    });
  });

  describe('3. Boot & Data Hook Resilience (Zero Infinite Loading Freeze)', () => {
    it('recovers cleanly to non-loading state in useVideos if network/extension rejects query', async () => {
      vi.spyOn(supabase, 'from').mockImplementation(() => {
        throw new TypeError('Failed to fetch: ERR_BLOCKED_BY_CLIENT');
      });

      const { result } = renderHook(() => useVideos());

      await act(async () => {
        await result.current.loadVideos(true);
      });

      expect(result.current.initialLoading).toBe(false);
      expect(result.current.loadingMore).toBe(false);
      expect(result.current.error).toContain('ERR_BLOCKED_BY_CLIENT');
    });

    it('sessionService.bootstrap() transitions out of loading cleanly if /api/auth/session is blocked', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('ERR_BLOCKED_BY_CLIENT'));
      // Reset private bootstrapped flag for clean test execution
      (sessionService as unknown as { bootstrapped: boolean }).bootstrapped = false;

      const snapshot = await sessionService.bootstrap();
      expect(snapshot.loading).toBe(false);
      expect(snapshot.tier).toBe('anonymous');
      expect(snapshot.user).toBeNull();
    });

    it('fetchWithTimeout aborts hung network/extension requests instead of freezing forever', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });

      await expect(fetchWithTimeout('https://example.com/slow', {}, 25)).rejects.toThrow();
    });

    it('sessionService.getCsrfToken() handles document.cookie SecurityError gracefully', () => {
      (sessionService as unknown as { csrfToken: string | null }).csrfToken = null;
      const cookieGetterSpy = vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
        throw new DOMException('Cookies are disabled in sandbox', 'SecurityError');
      });

      expect(() => sessionService.getCsrfToken()).not.toThrow();
      expect(sessionService.getCsrfToken()).toBeNull();

      cookieGetterSpy.mockRestore();
    });
  });

  describe('4. AppErrorBoundary Extension Mutation Resilience', () => {
    it('catches extension-induced render errors and renders clean recovery screen instead of white screen', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function CrashingChild() {
        throw new Error('Failed to execute removeChild on Node (extension DOM mutation)');
        return null;
      }

      render(
        <AppErrorBoundary>
          <CrashingChild />
        </AppErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something interrupted playback/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reload Pulse/i })).toBeInTheDocument();

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('5. Ad-Blocker (ERR_BLOCKED_BY_CLIENT) Fail-Safe in AdController', () => {
    it('unlocks scroll immediately and displays zero error banners when ad network is blocked by extension', async () => {
      const onNext = vi.fn();
      const onLockChange = vi.fn();

      // Simulate uBlock Origin / Brave Shields rejecting ad tag fetch
      vi.spyOn(vastModule, 'fetchVastAd').mockRejectedValue(new TypeError('Failed to fetch: ERR_BLOCKED_BY_CLIENT'));

      render(
        <AdController
          tier="anonymous"
          onNext={onNext}
          onUpgrade={vi.fn()}
          onLockChange={onLockChange}
          vastUrl="https://blocked-ad-network.example.com/vast.xml"
        />
      );

      await waitFor(() => {
        expect(onLockChange).toHaveBeenCalledWith(false);
      });

      // No error message banner should appear to the viewer
      expect(screen.queryByText(/ERR_BLOCKED_BY_CLIENT/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument();

      // Immediate Skip Ad button must remain clickable
      const skipBtn = await screen.findByRole('button', { name: /Skip Ad/i });
      fireEvent.click(skipBtn);
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });
});
