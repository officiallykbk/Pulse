/**
 * Edge Rate Limiter for Cloudflare Pages Functions.
 *
 * Implements sliding-window rate limiting for sensitive endpoints:
 * - Authentication (sign-in, sign-up)
 * - Age verification declaration
 * - Media upload URL signing
 * - Anonymous-to-account synchronization
 *
 * Supports Cloudflare KV storage with an automatic in-memory fallback for local dev & testing.
 */

import { errorResponse } from './http';
import type { KVNamespaceLike } from './ageVerification';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  limit: number;
}

// In-memory sliding window store for local dev, test environments, or when KV is omitted
const inMemoryStore = new Map<string, number[]>();

export function _resetRateLimitStore(): void {
  inMemoryStore.clear();
}

/**
 * Extracts client IP from standard Cloudflare / reverse proxy headers.
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0];
    if (first) return first.trim();
  }

  return '127.0.0.1';
}

/**
 * Checks sliding-window rate limit for a given key.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  kv?: KVNamespaceLike
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const storageKey = `rate:${key}`;

  let timestamps: number[] = [];

  if (kv) {
    try {
      const raw = await kv.get(storageKey);
      if (raw) {
        timestamps = JSON.parse(raw);
      }
    } catch {
      timestamps = [];
    }
  } else {
    timestamps = inMemoryStore.get(storageKey) || [];
  }

  // Filter out timestamps outside the active sliding window
  const cutoff = now - windowMs;
  timestamps = timestamps.filter((t) => typeof t === 'number' && t > cutoff);

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0] ?? now;
    const resetMs = Math.max(0, oldestInWindow + windowMs - now);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
      limit: config.maxRequests,
    };
  }

  // Record this request
  timestamps.push(now);

  if (kv) {
    try {
      await kv.put(storageKey, JSON.stringify(timestamps), {
        expirationTtl: Math.max(60, config.windowSeconds * 2),
      });
    } catch {
      // Fallback silently
    }
  } else {
    inMemoryStore.set(storageKey, timestamps);
  }

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    resetSeconds: config.windowSeconds,
    limit: config.maxRequests,
  };
}

/**
 * Standard 429 response with RFC-compliant Retry-After and rate limit headers.
 */
export function buildRateLimitResponse(result: RateLimitResult): Response {
  return errorResponse('Too many requests. Please try again later.', 429, {
    'Retry-After': String(result.resetSeconds),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(result.resetSeconds),
  });
}
