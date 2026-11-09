/**
 * POST /api/sync/anonymous
 *
 * Anonymous-to-Account Synchronization Endpoint.
 *
 * Requirements:
 * 1. Authenticated via HttpOnly session cookies (returns 401 if unauthenticated)
 * 2. Strict CSRF and Origin checks
 * 3. Bounded, schema-validated payload
 * 4. Idempotent upsert into `saved_videos`
 * 5. Monotonic completion and timestamp comparison for `video_watch_progress`
 * 6. Returns per-item acknowledgements
 * 7. Rate-limited to prevent abuse
 */

import { jsonResponse, errorResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';
import { verifyCsrf } from '../../_lib/csrf';
import { checkRateLimit, getClientIp, buildRateLimitResponse } from '../../_lib/rateLimit';
import { safeLog, safeError } from '../../_lib/logger';
import type { KVNamespaceLike } from '../../_lib/ageVerification';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RATE_LIMITS?: KVNamespaceLike;
}

interface IncomingProgress {
  videoId: string;
  positionSeconds: number;
  completed: boolean;
  updatedAt: string;
}

interface SyncPayload {
  savedVideoIds?: unknown[];
  progress?: unknown[];
}

const MAX_SAVED_SYNC = 10;
const MAX_PROGRESS_SYNC = 50;

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Database service unavailable', 503);
  }

  // 1. Authenticate user from session cookies
  const session = await resolveSession(request, env);
  if (!session.user || !session.accessToken) {
    return errorResponse('Authentication required to synchronize anonymous data', 401);
  }

  // Rate limit: 10 sync requests per 60 seconds per user / IP
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(
    `sync:anonymous:${session.user.id || ip}`,
    { maxRequests: 10, windowSeconds: 60 },
    env.RATE_LIMITS
  );
  if (!rateLimit.allowed) {
    safeLog('sync:anonymous', `Rate limit exceeded for user ${session.user.id}`);
    return buildRateLimitResponse(rateLimit);
  }

  // 2. CSRF Verification
  const csrfResult = verifyCsrf(request);
  if (!csrfResult.valid) {
    return errorResponse(csrfResult.reason || 'Invalid CSRF token', 403);
  }

  // 3. Parse & Validate Payload
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof rawBody !== 'object' || rawBody === null) {
    return errorResponse('Expected an object body', 400);
  }

  const body = rawBody as SyncPayload;
  const rawSavedIds = Array.isArray(body.savedVideoIds) ? body.savedVideoIds : [];
  const rawProgress = Array.isArray(body.progress) ? body.progress : [];

  // Sanitize and cap saved IDs (strings, max 10)
  const validSavedIds = rawSavedIds
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .slice(0, MAX_SAVED_SYNC);

  // Sanitize and cap progress items (max 50)
  const validProgress: IncomingProgress[] = [];
  for (const item of rawProgress.slice(0, MAX_PROGRESS_SYNC)) {
    if (typeof item === 'object' && item !== null) {
      const p = item as Record<string, unknown>;
      if (
        typeof p.videoId === 'string' &&
        p.videoId.trim().length > 0 &&
        typeof p.positionSeconds === 'number' &&
        !isNaN(p.positionSeconds) &&
        p.positionSeconds >= 0 &&
        typeof p.completed === 'boolean'
      ) {
        const updatedAt =
          typeof p.updatedAt === 'string' && !isNaN(Date.parse(p.updatedAt))
            ? p.updatedAt
            : new Date().toISOString();

        validProgress.push({
          videoId: p.videoId.trim(),
          positionSeconds: Math.floor(p.positionSeconds),
          completed: p.completed,
          updatedAt,
        });
      }
    }
  }

  const acknowledgedSavedIds: string[] = [];
  const acknowledgedProgressVideoIds: string[] = [];

  const userId = session.user.id;
  const userJwt = session.accessToken;

  // 4. Upsert saved_videos (idempotent, batch-insert via PostgREST)
  if (validSavedIds.length > 0) {
    try {
      const rows = validSavedIds.map((videoId) => ({
        user_id: userId,
        video_id: videoId,
      }));

      const endpoint = new URL('/rest/v1/saved_videos', supabaseUrl);
      const res = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${userJwt}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      });

      if (res.ok || res.status === 201 || res.status === 409) {
        acknowledgedSavedIds.push(...validSavedIds);
      }
    } catch (err) {
      safeError('sync:anonymous', 'Failed to sync saved_videos', err);
    }
  }

  // 5. Monotonic merge for video_watch_progress
  if (validProgress.length > 0) {
    try {
      const videoIds = validProgress.map((p) => p.videoId);
      const queryEndpoint = new URL('/rest/v1/video_watch_progress', supabaseUrl);
      queryEndpoint.searchParams.set('user_id', `eq.${userId}`);
      queryEndpoint.searchParams.set('video_id', `in.(${videoIds.map((id) => `"${id}"`).join(',')})`);
      queryEndpoint.searchParams.set('select', 'video_id,last_position_seconds,completed,updated_at');

      const existingRes = await fetch(queryEndpoint.toString(), {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${userJwt}`,
        },
      });

      interface ExistingRow {
        video_id: string;
        last_position_seconds: number;
        completed: boolean;
        updated_at: string;
      }

      const existingMap = new Map<string, ExistingRow>();
      if (existingRes.ok) {
        const rows = (await existingRes.json()) as ExistingRow[];
        for (const row of rows) {
          existingMap.set(row.video_id, row);
        }
      }

      const rowsToUpsert: Array<{
        user_id: string;
        video_id: string;
        last_position_seconds: number;
        completed: boolean;
        updated_at: string;
      }> = [];

      for (const item of validProgress) {
        const existing = existingMap.get(item.videoId);

        let finalCompleted = item.completed;
        let finalPos = item.positionSeconds;
        let finalUpdatedAt = item.updatedAt;

        if (existing) {
          finalCompleted = existing.completed || item.completed;

          const existingTime = Date.parse(existing.updated_at) || 0;
          const incomingTime = Date.parse(item.updatedAt) || 0;

          if (existingTime > incomingTime) {
            finalPos = existing.last_position_seconds;
            finalUpdatedAt = existing.updated_at;
          } else {
            finalPos = item.positionSeconds;
            finalUpdatedAt = item.updatedAt;
          }
        }

        rowsToUpsert.push({
          user_id: userId,
          video_id: item.videoId,
          last_position_seconds: finalPos,
          completed: finalCompleted,
          updated_at: finalUpdatedAt,
        });

        acknowledgedProgressVideoIds.push(item.videoId);
      }

      if (rowsToUpsert.length > 0) {
        const upsertEndpoint = new URL('/rest/v1/video_watch_progress', supabaseUrl);
        await fetch(upsertEndpoint.toString(), {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${userJwt}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(rowsToUpsert),
        });
      }
    } catch (err) {
      safeError('sync:anonymous', 'Failed to sync video_watch_progress', err);
    }
  }

  safeLog('sync:anonymous', `Synchronized ${acknowledgedSavedIds.length} saves and ${acknowledgedProgressVideoIds.length} progress items for user ${userId}`);

  return jsonResponse(
    {
      acknowledgedSavedIds,
      acknowledgedProgressVideoIds,
    },
    200,
    { 'Cache-Control': 'no-store, private' }
  );
}
