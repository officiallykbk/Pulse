/**
 * HTTP helper utilities for Cloudflare Pages Functions.
 * Enforces no-store caching and secure response headers across all auth/proxy endpoints.
 */

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  cookies: string[] = []
): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('X-Content-Type-Options', 'nosniff');

  for (const [key, val] of Object.entries(extraHeaders)) {
    headers.set(key, val);
  }

  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export function errorResponse(
  message: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
  cookies: string[] = []
): Response {
  return jsonResponse({ error: message }, status, extraHeaders, cookies);
}
