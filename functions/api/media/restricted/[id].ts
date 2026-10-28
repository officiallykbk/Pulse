/**
 * GET /api/media/restricted/:id
 *
 * Dedicated endpoint for age-restricted media playback and poster URLs.
 * Requires a valid, unexpired 'age_verified' cookie.
 *
 * Returns short-lived signed URLs for playback and poster.
 * Unverified, expired, or forged requests receive 403 Forbidden.
 */

import { jsonResponse, errorResponse } from '../../../_lib/http';
import {
  getAgeTokenFromRequest,
  verifyAgeToken,
  type KVNamespaceLike,
} from '../../../_lib/ageVerification';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AGE_VERIFICATIONS?: KVNamespaceLike;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { id: string };
}

/**
 * Extracts a storage object path from a canonical path or storage URL.
 */
function extractStoragePath(raw: string | null | undefined, bucket: string): string | null {
  if (!raw) return null;
  // If already relative object path
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return raw.replace(/^\/+/, '');
  }

  // If full Supabase storage URL: .../storage/v1/object/public/<bucket>/<path>
  const marker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const authMarker = `/storage/v1/object/${bucket}/`;

  for (const m of [marker, signMarker, authMarker]) {
    const idx = raw.indexOf(m);
    if (idx !== -1) {
      const remainder = raw.slice(idx + m.length);
      return remainder.split('?')[0];
    }
  }

  return null;
}

export async function onRequestGet({
  request,
  env,
  params,
}: PagesContext): Promise<Response> {
  const videoId = params.id;
  if (!videoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId)) {
    return errorResponse('Invalid video ID format', 400);
  }

  // 1. Strict age verification check
  const ageToken = getAgeTokenFromRequest(request);
  const isVerified = await verifyAgeToken(ageToken, env.AGE_VERIFICATIONS);

  if (!isVerified) {
    return errorResponse('Age verification required to access this content', 403);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return errorResponse('Media delivery service unavailable', 503);
  }

  // 2. Query video metadata using service role to access restricted record
  const queryUrl = new URL('/rest/v1/videos', supabaseUrl);
  queryUrl.searchParams.set('id', `eq.${videoId}`);
  queryUrl.searchParams.set('is_active', 'eq.true');
  queryUrl.searchParams.set('limit', '1');

  let video: Record<string, unknown> | null = null;
  try {
    const res = await fetch(queryUrl.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) {
      return errorResponse('Failed to look up video record', 502);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    video = rows[0] || null;
  } catch {
    return errorResponse('Database connection failed', 502);
  }

  if (!video) {
    return errorResponse('Video not found or unavailable', 404);
  }

  // Ensure this endpoint only serves age-restricted content
  if (video.visibility !== 'age_restricted') {
    return errorResponse('This content is not age-restricted', 400);
  }

  // 3. Generate short-lived signed URLs (5 minutes = 300 seconds) for media & poster
  const rawVideoUrl = (video.hls_master_url || video.video_url) as string | undefined;
  const rawThumbnailUrl = video.thumbnail_url as string | undefined;

  let signedVideoUrl = rawVideoUrl;
  let signedPosterUrl = rawThumbnailUrl;

  const bucket = 'videos';

  if (rawVideoUrl) {
    const videoObjPath = extractStoragePath(rawVideoUrl, bucket) || rawVideoUrl;
    try {
      const signEndpoint = new URL(
        `/storage/v1/object/sign/${bucket}/${videoObjPath}`,
        supabaseUrl
      );
      const signRes = await fetch(signEndpoint.toString(), {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
      });
      if (signRes.ok) {
        const signData = (await signRes.json()) as { signedURL?: string };
        if (signData.signedURL) {
          signedVideoUrl = `${supabaseUrl}/storage/v1${signData.signedURL}`;
        }
      }
    } catch {
      // Keep canonical URL if signing unavailable
    }
  }

  if (rawThumbnailUrl) {
    const posterObjPath = extractStoragePath(rawThumbnailUrl, bucket) || rawThumbnailUrl;
    try {
      const signEndpoint = new URL(
        `/storage/v1/object/sign/${bucket}/${posterObjPath}`,
        supabaseUrl
      );
      const signRes = await fetch(signEndpoint.toString(), {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
      });
      if (signRes.ok) {
        const signData = (await signRes.json()) as { signedURL?: string };
        if (signData.signedURL) {
          signedPosterUrl = `${supabaseUrl}/storage/v1${signData.signedURL}`;
        }
      }
    } catch {
      // Keep canonical URL if signing unavailable
    }
  }

  return jsonResponse(
    {
      id: video.id,
      title: video.title,
      description: video.description,
      video_url: signedVideoUrl,
      thumbnail_url: signedPosterUrl,
      duration_seconds: video.duration_seconds,
      visibility: video.visibility,
      status: video.status,
      expires_in: 300,
    },
    200,
    {
      'Cache-Control': 'no-store, private',
    }
  );
}
