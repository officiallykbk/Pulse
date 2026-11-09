/**
 * First-party Cookie Management Library for Pulse.
 * Implements strict security policies:
 * - __Host- prefix in production (forces Secure, Path=/, no Domain)
 * - HttpOnly for access & refresh tokens
 * - SameSite=Strict
 * - Expiration synchronization with Supabase token lifetimes
 */

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  maxAge?: number;
  expires?: Date;
}

export interface AuthCookieNames {
  access: string;
  refresh: string;
  csrf: string;
}

export function isLocalhost(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isSecureContext(request: Request): boolean {
  // If explicitly in development on localhost without SSL, secure may be false.
  // Deployed hostnames MUST ALWAYS use Secure.
  const url = new URL(request.url);
  if (isLocalhost(request.url) && url.protocol === 'http:') {
    return false;
  }
  return true;
}

export function getCookieNames(isSecure: boolean): AuthCookieNames {
  if (isSecure) {
    return {
      access: '__Host-pulse_access',
      refresh: '__Host-pulse_refresh',
      csrf: '__Host-pulse_csrf',
    };
  }
  return {
    access: 'pulse_access',
    refresh: 'pulse_refresh',
    csrf: 'pulse_csrf',
  };
}

export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  // Path is always '/' for root scope
  parts.push(`Path=${options.path || '/'}`);

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  } else if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  const sameSite = options.sameSite || 'Strict';
  parts.push(`SameSite=${sameSite}`);

  return parts.join('; ');
}

export interface SetAuthCookiesParams {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresInSeconds?: number;
  isSecure: boolean;
}

export function buildAuthCookieHeaders(params: SetAuthCookiesParams): string[] {
  const names = getCookieNames(params.isSecure);
  const headers: string[] = [];

  // 1. Access token: short-lived, HttpOnly, matches Supabase token lifetime (default 3600s)
  const accessMaxAge = params.expiresInSeconds && params.expiresInSeconds > 0
    ? params.expiresInSeconds
    : 3600;

  headers.push(
    serializeCookie(names.access, params.accessToken, {
      httpOnly: true,
      secure: params.isSecure,
      sameSite: 'Strict',
      path: '/',
      maxAge: accessMaxAge,
    })
  );

  // 2. Refresh token: 30 days, HttpOnly
  headers.push(
    serializeCookie(names.refresh, params.refreshToken, {
      httpOnly: true,
      secure: params.isSecure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 2592000, // 30 days
    })
  );

  // 3. CSRF token: readable by JavaScript (NOT HttpOnly), SameSite=Strict
  headers.push(
    serializeCookie(names.csrf, params.csrfToken, {
      httpOnly: false,
      secure: params.isSecure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 2592000,
    })
  );

  return headers;
}

export function buildClearAuthCookieHeaders(isSecure: boolean): string[] {
  // Clear both Host-prefixed and non-prefixed variants to handle transition
  const hostNames = getCookieNames(true);
  const plainNames = getCookieNames(false);
  const headers: string[] = [];

  const allNames = Array.from(new Set([
    hostNames.access, hostNames.refresh, hostNames.csrf,
    plainNames.access, plainNames.refresh, plainNames.csrf,
  ]));

  for (const name of allNames) {
    const isHostPrefixed = name.startsWith('__Host-');
    headers.push(
      serializeCookie(name, '', {
        httpOnly: !name.includes('csrf'),
        secure: isHostPrefixed || isSecure,
        sameSite: 'Strict',
        path: '/',
        maxAge: 0,
      })
    );
  }

  return headers;
}
