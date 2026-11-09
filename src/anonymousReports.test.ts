import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onRequestPost as handleReportSubmit } from '../functions/api/reports/submit';
import { _resetRateLimitStore } from '../functions/_lib/rateLimit';
import { submitReport } from './services/reportService';

describe('Phase 2: Anonymous Content & Comment Safety Reporting', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.restoreAllMocks();
  });

  describe('Edge Endpoint: POST /api/reports/submit', () => {
    const env = {
      SUPABASE_URL: 'https://pulse-test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };

    it('rejects cross-origin requests with 403', async () => {
      const req = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: {
          Origin: 'https://malicious-site.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: 'v1', reason: 'spam' }),
      });

      const res = await handleReportSubmit({ request: req, env });
      expect(res.status).toBe(403);
    });

    it('rejects requests missing required fields (reason or target)', async () => {
      // Missing reason
      const req1 = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: { Origin: 'https://pulse.app', 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: 'v1' }),
      });
      const res1 = await handleReportSubmit({ request: req1, env });
      expect(res1.status).toBe(400);

      // Missing videoId AND reportedUserId
      const req2 = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: { Origin: 'https://pulse.app', 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'spam' }),
      });
      const res2 = await handleReportSubmit({ request: req2, env });
      expect(res2.status).toBe(400);
    });

    it('records an anonymous guest report with is_anonymous=true and reporter_id=null', async () => {
      let capturedBody: Array<Record<string, unknown>> = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (url.toString().includes('/rest/v1/reports')) {
          capturedBody = JSON.parse(init?.body as string) as Array<Record<string, unknown>>;
          return new Response(JSON.stringify([{ id: 'rep-anon-1' }]), { status: 201 });
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: {
          Origin: 'https://pulse.app',
          'cf-connecting-ip': '203.0.113.10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: 'vid-target-1',
          reason: 'inappropriate',
          details: 'Contains explicit content',
        }),
      });

      const res = await handleReportSubmit({ request: req, env });
      expect(res.status).toBe(201);
      const json = await res.json() as { success: boolean; reportId: string };
      expect(json.success).toBe(true);
      expect(json.reportId).toBe('rep-anon-1');

      // Verify payload passed to Supabase
      expect(capturedBody).toBeInstanceOf(Array);
      expect(capturedBody[0]?.video_id).toBe('vid-target-1');
      expect(capturedBody[0]?.is_anonymous).toBe(true);
      expect(capturedBody[0]?.reporter_id).toBeNull();
      expect(capturedBody[0]?.status).toBe('open');
    });

    it('enforces IP rate-limiting for anonymous guests (5 reports per 10m)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/rest/v1/reports')) {
          return new Response(JSON.stringify([{ id: 'rep-id' }]), { status: 201 });
        }
        return new Response('Not found', { status: 404 });
      });

      const makeReq = (videoId: string) =>
        new Request('https://pulse.app/api/reports/submit', {
          method: 'POST',
          headers: {
            Origin: 'https://pulse.app',
            'cf-connecting-ip': '198.51.100.99',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId, reason: 'spam' }),
        });

      // 5 distinct target reports succeed
      for (let i = 1; i <= 5; i++) {
        const res = await handleReportSubmit({ request: makeReq(`vid-${i}`), env });
        expect(res.status).toBe(201);
      }

      // 6th report is rate-limited at edge
      const blockedRes = await handleReportSubmit({ request: makeReq('vid-6'), env });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('Retry-After')).toBeDefined();
    });

    it('suppresses duplicate anonymous reports for the same target from the same IP within 24h', async () => {
      let insertCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('/rest/v1/reports')) {
          insertCount++;
          return new Response(JSON.stringify([{ id: 'rep-dup-1' }]), { status: 201 });
        }
        return new Response('Not found', { status: 404 });
      });

      const req1 = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: {
          Origin: 'https://pulse.app',
          'cf-connecting-ip': '198.51.100.50',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: 'same-video', reason: 'spam' }),
      });

      // First report: successfully inserts
      const res1 = await handleReportSubmit({ request: req1, env });
      expect(res1.status).toBe(201);
      expect(insertCount).toBe(1);

      // Second report from same IP for same target: duplicate suppressed, returns 200 without second DB insert
      const req2 = new Request('https://pulse.app/api/reports/submit', {
        method: 'POST',
        headers: {
          Origin: 'https://pulse.app',
          'cf-connecting-ip': '198.51.100.50',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: 'same-video', reason: 'spam' }),
      });

      const res2 = await handleReportSubmit({ request: req2, env });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.message).toContain('already received');
      expect(insertCount).toBe(1); // No duplicate DB row
    });
  });

  describe('Client Service: submitReport', () => {
    it('dispatches report to /api/reports/submit and returns result', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, reportId: 'client-rep-1' }), { status: 201 })
      );

      const result = await submitReport({
        videoId: 'vid-client-1',
        reason: 'harassment',
        details: 'User attacking creator',
      });

      expect(result.success).toBe(true);
      expect(result.reportId).toBe('client-rep-1');
    });

    it('surfaces 429 rate limit error cleanly to client', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Too many requests. Please try again later.' }),
          { status: 429 }
        )
      );

      const result = await submitReport({
        videoId: 'vid-client-2',
        reason: 'spam',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many requests');
    });
  });
});
