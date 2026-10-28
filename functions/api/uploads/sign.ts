import { verifyCsrf } from '../../_lib/csrf';
import { errorResponse, jsonResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';
import { checkRateLimit, getClientIp, buildRateLimitResponse } from '../../_lib/rateLimit';
import { safeLog, safeError } from '../../_lib/logger';
import type { KVNamespaceLike } from '../../_lib/ageVerification';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RATE_LIMITS?: KVNamespaceLike;
}

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_POSTER_SIZE = 5 * 1024 * 1024;  // 5MB

const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm'];
const ALLOWED_VIDEO_EXTS = ['mp4', 'webm'];

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/webp', 'image/png'];
const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'webp', 'png'];

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Upload service unavailable', 503);
  }

  // 1. Authenticate session from HttpOnly cookies FIRST
  const session = await resolveSession(request, env);
  if (!session.user || !session.accessToken) {
    return errorResponse('Authentication required to upload media', 401);
  }

  // Rate limit: 20 upload signing requests per 60 seconds per user
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(
    `upload:sign:${session.user.id || ip}`,
    { maxRequests: 20, windowSeconds: 60 },
    env.RATE_LIMITS
  );
  if (!rateLimit.allowed) {
    safeLog('upload:sign', `Rate limit exceeded for user ${session.user.id}`);
    return buildRateLimitResponse(rateLimit);
  }

  // 2. Verify CSRF & Origin
  const csrfCheck = verifyCsrf(request);
  if (!csrfCheck.valid) {
    return errorResponse(csrfCheck.reason || 'Invalid CSRF token', 403);
  }

  // 3. Server-side ban check
  try {
    const profileUrl = new URL('/rest/v1/profiles', supabaseUrl);
    profileUrl.searchParams.set('id', `eq.${session.user.id}`);
    profileUrl.searchParams.set('select', 'is_banned,ban_reason');
    profileUrl.searchParams.set('limit', '1');

    const profileRes = await fetch(profileUrl.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (profileRes.ok) {
      const rows = await profileRes.json() as Array<{ is_banned?: boolean; ban_reason?: string | null }>;
      if (rows?.[0]?.is_banned) {
        return errorResponse(rows[0].ban_reason || 'Account is suspended from uploading', 403);
      }
    }
  } catch {
    // If profiles query fails non-critically, proceed
  }

  // 4. Validate payload
  let body: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    prefix?: string;
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON payload', 400);
  }

  const prefix = body.prefix === 'posters' ? 'posters' : 'raw';
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;
  const mimeType = (body.mimeType || '').toLowerCase().trim();
  const rawFileName = (body.fileName || '').toLowerCase().trim();
  const ext = rawFileName.split('.').pop() || '';

  if (prefix === 'raw') {
    if (fileSize <= 0 || fileSize > MAX_VIDEO_SIZE) {
      return errorResponse(`Video file size must be between 1 byte and 100MB`, 400);
    }
    if (!ALLOWED_VIDEO_MIMES.includes(mimeType) && !ALLOWED_VIDEO_EXTS.includes(ext)) {
      return errorResponse('Unsupported video format. Only MP4 and WebM videos are allowed.', 400);
    }
  } else {
    if (fileSize <= 0 || fileSize > MAX_POSTER_SIZE) {
      return errorResponse(`Poster image size must be between 1 byte and 5MB`, 400);
    }
    if (!ALLOWED_IMAGE_MIMES.includes(mimeType) && !ALLOWED_IMAGE_EXTS.includes(ext)) {
      return errorResponse('Unsupported image format. Only JPEG and WebP images are allowed.', 400);
    }
  }

  // 5. Generate unique path scoped to allowed prefix
  const finalExt = ext || (prefix === 'raw' ? 'mp4' : 'jpg');
  const uniqueSegment = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const objectPath = `${prefix}/${uniqueSegment}.${finalExt}`;

  // 6. Request signed upload URL from Supabase Storage
  try {
    const effectiveKey = serviceKey || anonKey || '';
    const signEndpoint = new URL(`/storage/v1/object/upload/sign/videos/${objectPath}`, supabaseUrl);
    const headers = new Headers();
    headers.set('apikey', effectiveKey);
    headers.set('Authorization', `Bearer ${effectiveKey}`);
    headers.set('Content-Type', 'application/json');

    const signRes = await fetch(signEndpoint.toString(), {
      method: 'POST',
      headers,
    });

    if (!signRes.ok) {
      // Fallback
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${objectPath}`;
      safeLog('upload:sign', `Storage sign URL fallback used for user ${session.user.id}`);
      return jsonResponse({
        uploadUrl: `${supabaseUrl}/storage/v1/object/videos/${objectPath}`,
        path: objectPath,
        publicUrl,
      });
    }

    const signData = await signRes.json() as { url?: string };
    const relativeUrl = signData.url || '';
    const uploadUrl = relativeUrl.startsWith('http')
      ? relativeUrl
      : `${supabaseUrl}/storage/v1${relativeUrl}`;

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${objectPath}`;

    safeLog('upload:sign', `Generated signed upload URL for path: ${objectPath}`);

    return jsonResponse(
      {
        uploadUrl,
        path: objectPath,
        publicUrl,
      },
      200,
      {},
      session.newCookies
    );
  } catch (err) {
    safeError('upload:sign', 'Failed to generate signed upload URL', err);
    return errorResponse('Failed to generate signed upload URL', 502);
  }
}
