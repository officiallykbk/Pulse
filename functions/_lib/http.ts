/**
 * HTTP helper utilities for Cloudflare Pages Functions.
 * Enforces no-store caching and secure response headers across all auth/proxy endpoints.
 */

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.paystack.co" "https://checkout.stripe.com")',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://js.paystack.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://checkout.stripe.com; frame-src 'self' https://js.paystack.co https://checkout.stripe.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

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

  // Apply default security headers
  for (const [key, val] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, val);
  }

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
