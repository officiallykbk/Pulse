import { verifyCsrf } from '../../_lib/csrf';
import { errorResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: {
    path?: string | string[];
  };
}

// Whitelisted paths for authenticated account queries and scoped storage
function isAllowedPath(path: string): boolean {
  // Reject auth endpoints, admin routes, or any service role manipulation
  if (
    path.startsWith('auth/') ||
    path.startsWith('admin/') ||
    path.includes('..') ||
    path.startsWith('/')
  ) {
    return false;
  }

  // Allow PostgREST endpoints
  if (path.startsWith('rest/v1/')) {
    return true;
  }

  // Allow authorized Storage operations (e.g. avatars, user folder uploads)
  if (path.startsWith('storage/v1/object/')) {
    return true;
  }

  return false;
}

export async function onRequest({ request, env, params }: PagesContext): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Database gateway unavailable', 503);
  }

  // Reconstruct subpath
  const subPath = Array.isArray(params.path)
    ? params.path.join('/')
    : (params.path || '');

  if (!isAllowedPath(subPath)) {
    return errorResponse('Endpoint not permitted through account proxy', 403);
  }

  const method = request.method.toUpperCase();

  // 1. Enforce CSRF & Origin on mutation methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfCheck = verifyCsrf(request);
    if (!csrfCheck.valid) {
      return errorResponse(csrfCheck.reason || 'Forbidden: CSRF check failed', 403);
    }
  }

  // 2. Resolve session from HttpOnly cookies
  const session = await resolveSession(request, env);
  if (!session.user || !session.accessToken) {
    return errorResponse('Authentication required', 401, {}, session.newCookies);
  }

  // 3. Construct upstream URL
  const clientUrl = new URL(request.url);
  const targetUrl = new URL(`/${subPath}${clientUrl.search}`, supabaseUrl);

  // 4. Sanitize and prepare headers
  const forwardHeaders = new Headers();

  // Copy permissible client headers
  const allowedHeaders = [
    'accept',
    'content-type',
    'prefer',
    'range',
    'content-range',
    'if-match',
    'if-none-match',
    'x-client-info',
  ];

  for (const [key, value] of request.headers.entries()) {
    if (allowedHeaders.includes(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }

  // Strip client auth and attach server credentials
  forwardHeaders.set('apikey', anonKey);
  forwardHeaders.set('Authorization', `Bearer ${session.accessToken}`);

  // 5. Forward request to Supabase
  try {
    const init: RequestInit = {
      method,
      headers: forwardHeaders,
    };

    if (method !== 'GET' && method !== 'HEAD') {
      init.body = request.body;
      // @ts-expect-error duplex is required on Node/edge runtimes when streaming request body
      init.duplex = 'half';
    }

    const upstreamResponse = await fetch(targetUrl.toString(), init);

    // 6. Build response with strict Cache-Control: no-store
    const responseHeaders = new Headers();
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    // Copy safe response headers from upstream
    const safeResponseHeaders = [
      'content-type',
      'content-range',
      'range',
      'preference-applied',
      'location',
    ];

    for (const [key, value] of upstreamResponse.headers.entries()) {
      if (safeResponseHeaders.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // Attach rotated cookies if access token was renewed
    for (const cookie of session.newCookies) {
      responseHeaders.append('Set-Cookie', cookie);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return errorResponse('Failed to proxy database request', 502);
  }
}
