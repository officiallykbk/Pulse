import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEphemeralSessionId,
  trackFunnelEvent,
  trackGuestSessionStartOnce,
  _resetFunnelSessionForTesting,
  _getLastTrackedEventForTesting,
} from './lib/funnelTelemetry';
import { onRequestPost as handleTelemetryEvent } from '../functions/api/telemetry/event';
import { _resetRateLimitStore } from '../functions/_lib/rateLimit';
import { anonymousState } from './lib/anonymousState';

describe('Phase 3: Privacy-Preserving Funnel Telemetry', () => {
  beforeEach(() => {
    _resetFunnelSessionForTesting();
    _resetRateLimitStore();
    anonymousState.clearAll();
    vi.restoreAllMocks();
  });

  describe('1. Ephemeral Session Identifier Management', () => {
    it('creates an ephemeral session ID in sessionStorage', () => {
      const id1 = getEphemeralSessionId();
      expect(id1).toBeDefined();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);

      // Subsequent calls in the same tab return the identical session ID
      const id2 = getEphemeralSessionId();
      expect(id2).toBe(id1);
    });

    it('generates a new session ID when the session storage is cleared (tab closed/reset)', () => {
      const id1 = getEphemeralSessionId();
      _resetFunnelSessionForTesting();
      const id2 = getEphemeralSessionId();
      expect(id2).not.toBe(id1);
    });
  });

  describe('2. Client Event Tracking & PII Redaction', () => {
    it('dispatches valid funnel events with session ID, timestamp, and sanitized properties', () => {
      let sentBody = '';
      const beaconMock = vi.fn().mockImplementation((_url, body) => {
        sentBody = body;
        return true;
      });

      Object.defineProperty(navigator, 'sendBeacon', {
        value: beaconMock,
        configurable: true,
        writable: true,
      });

      trackFunnelEvent('auth_modal_shown', {
        intent: 'save-limit',
        viewCount: 5,
        isGuest: true,
      });

      expect(beaconMock).toHaveBeenCalledWith('/api/telemetry/event', expect.any(String));

      const parsed = JSON.parse(sentBody);
      expect(parsed.event).toBe('auth_modal_shown');
      expect(parsed.sessionId).toBe(getEphemeralSessionId());
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.properties).toEqual({
        intent: 'save-limit',
        viewCount: 5,
        isGuest: true,
      });
    });

    it('redacts sensitive keys (email, password, token, card, phone, pin) from properties', () => {
      let sentBody = '';
      Object.defineProperty(navigator, 'sendBeacon', {
        value: vi.fn().mockImplementation((_url, body) => {
          sentBody = body;
          return true;
        }),
        configurable: true,
        writable: true,
      });

      trackFunnelEvent('signup_started', {
        email: 'user@example.com',
        password: 'password123',
        token: 'secret-token',
        phone: '0241234567',
        intent: 'upload',
      } as any);

      const parsed = JSON.parse(sentBody);
      expect(parsed.properties.intent).toBe('upload');
      expect(parsed.properties.email).toBeUndefined();
      expect(parsed.properties.password).toBeUndefined();
      expect(parsed.properties.token).toBeUndefined();
      expect(parsed.properties.phone).toBeUndefined();
    });

    it('falls back to fetch if sendBeacon is unavailable or returns false', () => {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: vi.fn().mockReturnValue(false),
        configurable: true,
        writable: true,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

      trackFunnelEvent('ad_opportunity', { tier: 'anonymous' });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/telemetry/event',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
        })
      );
    });

    it('tracks guest_session_start exactly once per session', () => {
      const beaconMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: beaconMock,
        configurable: true,
        writable: true,
      });

      trackGuestSessionStartOnce();
      trackGuestSessionStartOnce();
      trackGuestSessionStartOnce();

      expect(beaconMock).toHaveBeenCalledTimes(1);
      const last = _getLastTrackedEventForTesting();
      expect(last?.event).toBe('guest_session_start');
    });
  });

  describe('3. Edge Endpoint: POST /api/telemetry/event', () => {
    const env = {};

    it('accepts whitelisted funnel events and returns 204 No Content', async () => {
      const req = new Request('https://pulse.app/api/telemetry/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'guest_save_limit_reached',
          sessionId: 'sess-123',
          timestamp: new Date().toISOString(),
          properties: { count: 5 },
        }),
      });

      const res = await handleTelemetryEvent({ request: req, env });
      expect(res.status).toBe(204);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('rejects unsupported event names with 400', async () => {
      const req = new Request('https://pulse.app/api/telemetry/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'unsupported_arbitrary_event',
          sessionId: 'sess-123',
        }),
      });

      const res = await handleTelemetryEvent({ request: req, env });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid or unsupported funnel event');
    });

    it('rejects invalid or missing sessionId with 400', async () => {
      const req = new Request('https://pulse.app/api/telemetry/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'guest_session_start',
          sessionId: '',
        }),
      });

      const res = await handleTelemetryEvent({ request: req, env });
      expect(res.status).toBe(400);
    });

    it('enforces IP rate-limiting (60 events per minute per IP)', async () => {
      const makeReq = () =>
        new Request('https://pulse.app/api/telemetry/event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': '203.0.113.77',
          },
          body: JSON.stringify({
            event: 'guest_session_start',
            sessionId: 'sess-rate-1',
          }),
        });

      // 60 events succeed
      for (let i = 0; i < 60; i++) {
        const res = await handleTelemetryEvent({ request: makeReq(), env });
        expect(res.status).toBe(204);
      }

      // 61st event is blocked by sliding window rate limiter
      const blockedRes = await handleTelemetryEvent({ request: makeReq(), env });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('4. Touchpoint Instrumentation Integration', () => {
    it('dispatches guest_save_added on local save, and guest_save_limit_reached on 6th attempt', () => {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      // Save 1
      anonymousState.toggleSaved('vid-1');
      expect(_getLastTrackedEventForTesting()?.event).toBe('guest_save_added');
      expect(_getLastTrackedEventForTesting()?.properties?.count).toBe(1);

      // Save 2..5
      anonymousState.toggleSaved('vid-2');
      anonymousState.toggleSaved('vid-3');
      anonymousState.toggleSaved('vid-4');
      anonymousState.toggleSaved('vid-5');
      expect(_getLastTrackedEventForTesting()?.event).toBe('guest_save_added');
      expect(_getLastTrackedEventForTesting()?.properties?.count).toBe(5);

      // Save 6 (Limit reached!)
      const result6 = anonymousState.toggleSaved('vid-6');
      expect(result6.limitReached).toBe(true);
      expect(_getLastTrackedEventForTesting()?.event).toBe('guest_save_limit_reached');
    });
  });
});
