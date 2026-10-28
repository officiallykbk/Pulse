/**
 * POST /api/reports/submit
 *
 * Unified Content & Comment Safety Reporting Endpoint.
 * Supports both authenticated users and anonymous guests.
 *
 * Guards:
 * - Origin / Referer check
 * - IP-based sliding-window rate limit for guests (5 reports per 10 minutes)
 * - Duplicate report suppression per IP + target within 24 hours
 * - Strict schema validation
 * - Zero PII logged or stored for guests
 */

import { jsonResponse, errorResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';
import { verifyOrigin } from '../../_lib/csrf';
import { checkRateLimit, getClientIp, buildRateLimitResponse } from '../../_lib/rateLimit';
import { safeLog, safeError } from '../../_lib/logger';
import type { KVNamespaceLike } from '../../_lib/ageVerification';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RATE_LIMITS?: KVNamespaceLike;
}

interface ReportRequestBody {
  videoId?: string | null;
  reportedUserId?: string | null;
  commentId?: string | null;
  reason?: string;
  details?: string | null;
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Reporting service temporarily unavailable', 503);
  }

  // 1. Verify Origin
  if (!verifyOrigin(request)) {
    return errorResponse('Invalid request origin', 403);
  }

  // 2. Parse payload
  let body: ReportRequestBody;
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const reason = (body.reason || '').trim();
  if (!reason) {
    return errorResponse('A report reason is required', 400);
  }

  const videoId = body.videoId ? body.videoId.trim() : null;
  const reportedUserId = body.reportedUserId ? body.reportedUserId.trim() : null;
  const commentId = body.commentId ? body.commentId.trim() : null;

  if (!videoId && !reportedUserId) {
    return errorResponse('Either videoId or reportedUserId must be provided', 400);
  }

  // 3. Resolve session (check if authenticated)
  const session = await resolveSession(request, env);
  const isAuthenticated = !!(session.user && session.accessToken);
  const reporterId = isAuthenticated ? session.user!.id : null;
  const isAnonymous = !isAuthenticated;

  // 4. For anonymous guests: enforce IP sliding window rate-limiting and duplicate suppression
  if (isAnonymous) {
    const ip = getClientIp(request);

    // Rate limit: 5 reports per 10 minutes (600s) per IP
    const rateLimit = await checkRateLimit(
      `reports:submit:${ip}`,
      { maxRequests: 5, windowSeconds: 600 },
      env.RATE_LIMITS
    );

    if (!rateLimit.allowed) {
      safeLog('reports:submit', `Rate limit exceeded for IP: ${ip}`);
      return buildRateLimitResponse(rateLimit);
    }

    // Duplicate suppression: max 1 report per IP per target within 24 hours (86,400s)
    const targetKey = videoId || reportedUserId || 'unknown';
    const dupCheck = await checkRateLimit(
      `reports:dup:${ip}:${targetKey}`,
      { maxRequests: 1, windowSeconds: 86400 },
      env.RATE_LIMITS
    );

    if (!dupCheck.allowed) {
      safeLog('reports:submit', `Duplicate report suppressed for IP: ${ip}, target: ${targetKey}`);
      return jsonResponse(
        {
          success: true,
          message: 'Report already received. Thank you for keeping Pulse safe.',
        },
        200
      );
    }
  }

  // 5. Construct details string
  let detailsText = body.details ? body.details.trim() : null;
  if (commentId && (!detailsText || !detailsText.includes(commentId))) {
    detailsText = detailsText ? `${detailsText} (Comment ID: ${commentId})` : `Comment ID: ${commentId}`;
  }

  // 6. Insert report into Supabase
  try {
    const effectiveKey = serviceKey || anonKey;
    const reportEndpoint = new URL('/rest/v1/reports', supabaseUrl);

    const reportRow = {
      video_id: videoId,
      reported_user_id: reportedUserId,
      reporter_id: reporterId,
      is_anonymous: isAnonymous,
      reason,
      details: detailsText,
      status: 'open',
    };

    const headers = new Headers();
    headers.set('apikey', effectiveKey);
    headers.set('Authorization', `Bearer ${effectiveKey}`);
    headers.set('Content-Type', 'application/json');
    headers.set('Prefer', 'return=representation');

    const res = await fetch(reportEndpoint.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify([reportRow]),
    });

    if (!res.ok) {
      const errText = await res.text();
      safeError('reports:submit', 'Supabase rejected report insertion', { status: res.status, errText });
      return errorResponse('Failed to record report. Please try again.', res.status || 500);
    }

    const insertedRows = (await res.json()) as Array<{ id: string }>;
    const reportId = insertedRows?.[0]?.id || crypto.randomUUID();

    safeLog(
      'reports:submit',
      `Report recorded successfully: ${reportId} (anonymous: ${isAnonymous})`
    );

    return jsonResponse(
      {
        success: true,
        reportId,
        message: 'Report submitted. Thank you for keeping Pulse safe.',
      },
      201
    );
  } catch (err) {
    safeError('reports:submit', 'Unexpected error submitting report', err);
    return errorResponse('Internal error processing report', 500);
  }
}
