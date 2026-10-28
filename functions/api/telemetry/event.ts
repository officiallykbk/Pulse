/**
 * POST /api/telemetry/event
 *
 * Privacy-Preserving Conversion Funnel Telemetry Endpoint.
 *
 * Characteristics:
 * - Rate-limited by IP (60 events per minute)
 * - Validated against strict event whitelist
 * - Zero PII logged or stored
 * - Cache-Control: no-store
 * - Returns 204 No Content
 */

import { errorResponse } from '../../_lib/http';
import { checkRateLimit, getClientIp, buildRateLimitResponse } from '../../_lib/rateLimit';
import { safeLog, sanitizeData } from '../../_lib/logger';
import type { KVNamespaceLike } from '../../_lib/ageVerification';

interface Env {
  RATE_LIMITS?: KVNamespaceLike;
}

export const ALLOWED_FUNNEL_EVENTS = new Set([
  'guest_session_start',
  'guest_save_added',
  'guest_save_limit_reached',
  'auth_modal_shown',
  'auth_modal_dismissed',
  'signup_started',
  'signup_completed',
  'ad_opportunity',
  'ad_filled',
  'ad_no_fill',
  'report_submitted',
]);

interface TelemetryPayload {
  event?: unknown;
  sessionId?: unknown;
  timestamp?: unknown;
  properties?: unknown;
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const ip = getClientIp(request);

  // Rate limit: 60 telemetry events per minute per IP
  const rateLimit = await checkRateLimit(
    `telemetry:${ip}`,
    { maxRequests: 60, windowSeconds: 60 },
    env.RATE_LIMITS
  );

  if (!rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit);
  }

  let body: TelemetryPayload;
  try {
    body = (await request.json()) as TelemetryPayload;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof body.event !== 'string' || !ALLOWED_FUNNEL_EVENTS.has(body.event)) {
    return errorResponse('Invalid or unsupported funnel event name', 400);
  }

  if (typeof body.sessionId !== 'string' || body.sessionId.length < 1 || body.sessionId.length > 64) {
    return errorResponse('Invalid sessionId', 400);
  }

  // Sanitize properties to prevent credential injection into logs
  const sanitized = sanitizeData({
    event: body.event,
    sessionId: body.sessionId,
    timestamp: body.timestamp || new Date().toISOString(),
    properties: body.properties,
  });

  safeLog('telemetry', `Funnel event: ${body.event}`, sanitized);

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
