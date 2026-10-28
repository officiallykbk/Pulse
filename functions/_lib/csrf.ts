/**
 * CSRF Protection Library for Pulse.
 * Implements strict Double-Submit Cookie pattern paired with strict Origin verification.
 */

import { parseCookies, getCookieNames } from './cookies';

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function verifyOrigin(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const originHeader = request.headers.get('origin');

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      return originUrl.origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  // Fallback to Referer header if Origin is absent
  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return refererUrl.origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  // State-changing requests without Origin or Referer are rejected
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface CsrfVerificationResult {
  valid: boolean;
  reason?: string;
}

export function verifyCsrf(request: Request): CsrfVerificationResult {
  const method = request.method.toUpperCase();
  // Safe methods do not require CSRF token
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }

  // 1. Strict Origin verification
  if (!verifyOrigin(request)) {
    return { valid: false, reason: 'Invalid or missing Origin header' };
  }

  // 2. Double-Submit Cookie verification
  const cookies = parseCookies(request);
  const cookieNames = getCookieNames(true);
  const plainNames = getCookieNames(false);

  const cookieToken = cookies[cookieNames.csrf] || cookies[plainNames.csrf];
  const headerToken = request.headers.get('x-csrf-token');

  if (!cookieToken || !headerToken) {
    return { valid: false, reason: 'Missing CSRF token in cookie or header' };
  }

  if (!timingSafeEqual(cookieToken, headerToken)) {
    return { valid: false, reason: 'CSRF token mismatch' };
  }

  return { valid: true };
}
