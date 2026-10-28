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
 */

import { jsonResponse, errorResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';
import { verifyCsrf } from '../../_lib/csrf';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Database service unavailable', 503);
  }

  // 1. Authenticate user from session cookies
  const session = await resolveSession(request, env);
  if (!session.user || !session.accessToken) {
    return errorResponse('Authentication required to synchronize anonymous data', 401);
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
    return errorResponse('Payload must be an object', 400);
  }

  const payload = rawBody as SyncPayload;

  // Validate savedVideoIds
  const validSavedIds: string[] = [];
  if (Array.isArray(payload.savedVideoIds)) {
    for (const item of payload.savedVideoIds.slice(0, MAX_SAVED_SYNC)) {
      if (typeof item === 'string' && item.trim().length > 0) {
        validSavedIds.push(item.trim().slice(0, 100));
      }
    }
  }

  // Validate progress
  const validProgress: IncomingProgress[] = [];
  if (Array.isArray(payload.progress)) {
    for (const item of payload.progress.slice(0, MAX_PROGRESS_SYNC)) {
      if (typeof item === 'object' && item !== null) {
        const p = item as Record<string, unknown>;
        if (
          typeof p.videoId === 'string' &&
          typeof p.positionSeconds === 'number' &&
          Number.isFinite(p.positionSeconds) &&
          typeof p.updatedAt === 'string'
        ) {
          validProgress.push({
            videoId: p.videoId.trim().slice(0, 100),
            positionSeconds: Math.max(0, Math.floor(p.positionSeconds)),
            completed: Boolean(p.completed),
            updatedAt: p.updatedAt,
          });
        }
      }
    }
  }

  const acknowledgedSavedIds: string[] = [];
  const acknowledgedProgressVideoIds: string[] = [];
  const userId = session.user.id;
  const userJwt = session.accessToken;

  // 4. Upsert saved_videos (idempotent, ignore duplicates)
  if (validSavedIds.length > 0) {
    const saveRows = validSavedIds.map((videoId) => ({
      user_id: userId,
      video_id: videoId,
    }));

    try {
      const endpoint = new URL('/rest/v1/saved_videos', supabaseUrl);
      const res = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${userJwt}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(saveRows),
      });

      if (res.ok) {
        acknowledgedSavedIds.push(...validSavedIds);
      }
    } catch (err) {
      console.error('Failed to sync saved_videos:', err);
    }
  }

  // 5. Merge watch progress
  if (validProgress.length > 0) {
    try {
      const videoIds = validProgress.map((p) => p.videoId);
      const queryEndpoint = new URL('/rest/v1/video_watch_progress', supabaseUrl);
      queryEndpoint.searchParams.set('user_id', `eq.${userId}`);
      queryEndpoint.searchParams.set('video_id', `in.(${videoIds.join(',')})`);
      queryEndpoint.searchParams.set('select', 'video_id,last_position_seconds,completed,updated_at');

      const existingRes = await fetch(queryEndpoint.toString(), {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${userJwt}`,
        },
      });

      const existingRows = existingRes.ok
        ? ((await existingRes.json()) as Array<{
            video_id: string;
            last_position_seconds: number;
            completed: boolean;
            updated_at: string;
          }>)
        : [];

      const existingMap = new Map(existingRows.map((r) => [r.video_id, r]));
      const rowsToUpsert: Array<{
        user_id: string;
        video_id: string;
        last_position_seconds: number;
        completed: boolean;
        updated_at: string;
      }> = [];

      for (const item of validProgress) {
        const existing = existingMap.get(item.videoId);
        let finalPos = item.positionSeconds;
        let finalCompleted = item.completed;
        let finalUpdatedAt = item.updatedAt;

        if (existing) {
          // Completed status is monotonic
          finalCompleted = existing.completed || item.completed;

          const existingTime = new Date(existing.updated_at).getTime();
          const incomingTime = new Date(item.updatedAt).getTime();

          if (existingTime > incomingTime) {
            // Newer server state wins position
            finalPos = existing.last_position_seconds;
            finalUpdatedAt = existing.updated_at;
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
      console.error('Failed to sync video_watch_progress:', err);
    }
  }

  return jsonResponse(
    {
      acknowledgedSavedIds,
      acknowledgedProgressVideoIds,
    },
    200,
    { 'Cache-Control': 'no-store, private' }
  );
}
