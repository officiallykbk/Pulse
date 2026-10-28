/**
 * Privacy-First Age Verification Token Management.
 *
 * Implements:
 * - 32 cryptographically random bytes for opaque tokens
 * - Cloudflare KV storage with native 30-day (2,592,000s) TTL
 * - In-memory fallback adapter for testing and environments without KV
 * - Strictly zero collection of PII (names, birthdates, IDs, emails)
 * - Exact cookie name 'age_verified' with HttpOnly, Secure, SameSite=Strict
 */

import { parseCookies, serializeCookie } from './cookies';

export const AGE_COOKIE_NAME = 'age_verified';
export const AGE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2,592,000 seconds

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface InMemoryEntry {
  value: string;
  expiresAt: number;
}

// In-memory fallback store used in tests or local dev without KV binding
const inMemoryKvStore = new Map<string, InMemoryEntry>();

/**
 * Resets the in-memory fallback store (primarily for unit test teardown)
 */
export function _resetAgeMemoryStore(): void {
  inMemoryKvStore.clear();
}

/**
 * Generates an opaque, cryptographically secure 32-byte hexadecimal token.
 */
export function generateAgeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores an age verification token in Cloudflare KV (or in-memory fallback).
 * Only records the affirmation timestamp and boolean; stores zero PII.
 */
export async function saveAgeVerification(
  token: string,
  kv?: KVNamespaceLike,
  ttlSeconds: number = AGE_TTL_SECONDS
): Promise<void> {
  const key = `age:${token}`;
  const recordValue = JSON.stringify({
    declaredOver18: true,
    declaredAt: new Date().toISOString(),
  });

  if (kv && typeof kv.put === 'function') {
    await kv.put(key, recordValue, { expirationTtl: ttlSeconds });
    return;
  }

  // Fallback to in-memory store
  inMemoryKvStore.set(key, {
    value: recordValue,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Validates whether an age token is present and unexpired.
 */
export async function verifyAgeToken(
  token: string | null | undefined,
  kv?: KVNamespaceLike
): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return false;
  }

  // Token format sanity check (64 hex characters)
  if (!/^[0-9a-fA-F]{64}$/.test(token)) {
    return false;
  }

  const key = `age:${token}`;

  if (kv && typeof kv.get === 'function') {
    const raw = await kv.get(key);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.declaredOver18 === true;
    } catch {
      return false;
    }
  }

  // In-memory fallback check
  const entry = inMemoryKvStore.get(key);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    inMemoryKvStore.delete(key);
    return false;
  }

  try {
    const parsed = JSON.parse(entry.value);
    return parsed && parsed.declaredOver18 === true;
  } catch {
    return false;
  }
}

/**
 * Revokes an age verification token.
 */
export async function revokeAgeVerification(
  token: string,
  kv?: KVNamespaceLike
): Promise<void> {
  const key = `age:${token}`;
  if (kv && typeof kv.delete === 'function') {
    await kv.delete(key);
    return;
  }
  inMemoryKvStore.delete(key);
}

/**
 * Extracts the age verification token from the request's cookies.
 */
export function getAgeTokenFromRequest(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies[AGE_COOKIE_NAME] || null;
}

/**
 * Serializes the exact age_verified Set-Cookie header.
 */
export function buildAgeCookieHeader(token: string, isSecure: boolean): string {
  return serializeCookie(AGE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict',
    path: '/',
    maxAge: AGE_TTL_SECONDS,
  });
}

/**
 * Serializes an expired Set-Cookie header to clear the age_verified cookie.
 */
export function buildClearAgeCookieHeader(isSecure: boolean): string {
  return serializeCookie(AGE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}
