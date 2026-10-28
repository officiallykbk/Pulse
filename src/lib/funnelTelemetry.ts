/**
 * Privacy-Preserving Funnel Telemetry for Pulse.
 *
 * Requirements:
 * - Strictly zero personally identifiable information (PII)
 * - Ephemeral sessionStorage session identifiers (discarded upon tab close)
 * - Zero cross-device, cross-session, or continuous fingerprinting
 * - Fire-and-forget delivery via navigator.sendBeacon with fetch fallback
 * - Purpose-limited event catalog to evaluate guest-to-member conversion
 */

export type FunnelEventName =
  | 'guest_session_start'
  | 'guest_save_added'
  | 'guest_save_limit_reached'
  | 'auth_modal_shown'
  | 'auth_modal_dismissed'
  | 'signup_started'
  | 'signup_completed'
  | 'ad_opportunity'
  | 'ad_filled'
  | 'ad_no_fill'
  | 'report_submitted';

export interface FunnelEventPayload {
  event: FunnelEventName;
  sessionId: string;
  timestamp: string;
  properties?: Record<string, string | number | boolean>;
}

const STORAGE_KEY_SESSION_ID = 'pulse_ephemeral_session_id';
const STORAGE_KEY_SESSION_START = 'pulse_session_start_tracked';

let inMemorySessionId: string | null = null;
let lastDispatchedEvent: FunnelEventPayload | null = null;

const DISALLOWED_PROPERTY_KEYS = new Set([
  'email',
  'password',
  'token',
  'jwt',
  'authorization',
  'cookie',
  'phone',
  'card',
  'pin',
]);

/**
 * Returns an ephemeral session identifier that dies when the tab is closed.
 */
export function getEphemeralSessionId(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      let id = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(STORAGE_KEY_SESSION_ID, id);
      }
      return id;
    }
  } catch {
    // Storage access blocked; fallback to in-memory
  }

  if (!inMemorySessionId) {
    inMemorySessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Math.random().toString(36).slice(2)}`;
  }
  return inMemorySessionId;
}

/**
 * Sanitizes event properties to guarantee no PII is forwarded.
 */
function sanitizeProperties(
  props?: Record<string, unknown>
): Record<string, string | number | boolean> | undefined {
  if (!props || typeof props !== 'object') return undefined;

  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    const lowerKey = key.toLowerCase();
    if (DISALLOWED_PROPERTY_KEYS.has(lowerKey)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = value.slice(0, 100);
    } else if (typeof value === 'number' && !isNaN(value)) {
      result[key] = value;
    } else if (typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Tracks a privacy-preserving conversion funnel event.
 */
export function trackFunnelEvent(
  event: FunnelEventName,
  properties?: Record<string, string | number | boolean>
): void {
  const payload: FunnelEventPayload = {
    event,
    sessionId: getEphemeralSessionId(),
    timestamp: new Date().toISOString(),
    properties: sanitizeProperties(properties),
  };

  lastDispatchedEvent = payload;

  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon('/api/telemetry/event', body);
      if (queued) return;
    }

    if (typeof fetch !== 'undefined') {
      fetch('/api/telemetry/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Discard silently on transport error
      });
    }
  } catch {
    // Telemetry errors must never crash or block UI
  }
}

/**
 * Tracks guest session start once per tab session.
 */
export function trackGuestSessionStartOnce(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (!sessionStorage.getItem(STORAGE_KEY_SESSION_START)) {
        sessionStorage.setItem(STORAGE_KEY_SESSION_START, '1');
        trackFunnelEvent('guest_session_start');
      }
      return;
    }
  } catch {
    // Storage access blocked
  }
}

export function _resetFunnelSessionForTesting(): void {
  inMemorySessionId = null;
  lastDispatchedEvent = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_SESSION_ID);
      sessionStorage.removeItem(STORAGE_KEY_SESSION_START);
    }
  } catch {
    // Ignore
  }
}

export function _getLastTrackedEventForTesting(): FunnelEventPayload | null {
  return lastDispatchedEvent;
}
