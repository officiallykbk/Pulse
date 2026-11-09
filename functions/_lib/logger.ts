/**
 * Server-Side Structured & Sanitized Logger for Cloudflare Pages Functions.
 *
 * Enforces strict redaction of:
 * - Passwords and credentials
 * - Bearer tokens and API keys
 * - Session cookies and CSRF tokens
 * - Mobile Money PINs and phone numbers
 * - Credit card numbers and CVVs
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pass',
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'access_token',
  'refresh_token',
  'csrf_token',
  'x-csrf-token',
  'secret',
  'api_key',
  'apikey',
  'anon_key',
  'service_role_key',
  'pin',
  'momo_pin',
  'pin_code',
  'phone',
  'phonenumber',
  'phone_number',
  'mobile',
  'msisdn',
  'card',
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
]);

const BEARER_PATTERN = /Bearer\s+([a-zA-Z0-9_\-.]+)/gi;
const COOKIE_TOKEN_PATTERN = /(__Host-pulse_[a-zA-Z0-9_]+|age_verified)=([^;]+)/gi;
const PHONE_PATTERN = /(\+?233|0)[235][0-9]{8}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,16}\b/g;

/**
 * Sanitizes a string value by masking bearer tokens, cookies, phones, and card numbers.
 */
export function sanitizeString(text: string): string {
  if (typeof text !== 'string') return text;
  return text
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(COOKIE_TOKEN_PATTERN, '$1=[REDACTED]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(CARD_PATTERN, '[REDACTED_CARD]');
}

/**
 * Recursively sanitizes any JavaScript object or value, masking sensitive fields.
 */
export function sanitizeData<T>(data: T, seen = new WeakSet()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (seen.has(data as object)) {
    return '[CIRCULAR]' as unknown as T;
  }
  seen.add(data as object);

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeString(data.message),
      stack: data.stack ? sanitizeString(data.stack) : undefined,
    } as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeData(value, seen);
    }
  }

  return result as T;
}

/**
 * Sanitizes HTTP Headers, keeping harmless metadata while redacting auth and cookies.
 */
export function sanitizeHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeString(val);
      }
    });
  } else if (typeof headers === 'object' && headers !== null) {
    for (const [key, val] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeString(val);
      }
    }
  }

  return result;
}

export function safeLog(tag: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[${tag}] ${message}`, sanitizeData(data));
  } else {
    console.log(`[${tag}] ${message}`);
  }
}

export function safeWarn(tag: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.warn(`[${tag}] ${message}`, sanitizeData(data));
  } else {
    console.warn(`[${tag}] ${message}`);
  }
}

export function safeError(tag: string, message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(`[${tag}] ${message}`, sanitizeData(error));
  } else {
    console.error(`[${tag}] ${message}`);
  }
}
