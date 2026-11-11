/**
 * Local Age Confirmation Persistence Module for Pulse.
 *
 * Implements resilient local storage for the mandatory 18+ age verification gate.
 * Ensures users are prompted on their first visit, but once confirmed,
 * the response is safely remembered locally and NEVER flashes or pops up on page refresh.
 *
 * Resilience features:
 * - Safe exception shielding (handles Safari Private Browsing & Brave Shields DOMExceptions)
 * - In-memory fallback if storage is restricted or disabled
 * - Synchronous initial evaluation to prevent modal flash or layout shifts
 * - Background synchronization with the first-party server HttpOnly cookie layer
 */

import { ageVerificationService } from '@/services/ageVerification';
import { safeLocalStorage } from '@/lib/safeStorage';

export const AGE_CONFIRMATION_STORAGE_KEY = 'pulse:age_confirmed:v1';

let inMemoryAgeConfirmed = false;

/**
 * Safely checks if the user has already confirmed they are 18+ on this device.
 * Evaluates synchronously so initial React render knows immediately.
 */
export function isAgeConfirmedLocally(): boolean {
  if (inMemoryAgeConfirmed) {
    return true;
  }

  try {
    const stored = safeLocalStorage.getItem(AGE_CONFIRMATION_STORAGE_KEY);
    if (stored === 'true' || stored === '1') {
      inMemoryAgeConfirmed = true;
      return true;
    }
  } catch {
    // Local storage access blocked (e.g. strict privacy mode or embedded iframe)
  }

  return false;
}

/**
 * Stores the 18+ confirmation locally and synchronizes with the server session cookie.
 */
export function setAgeConfirmedLocally(): void {
  inMemoryAgeConfirmed = true;

  try {
    safeLocalStorage.setItem(AGE_CONFIRMATION_STORAGE_KEY, 'true');
  } catch {
    // In-memory fallback already set
  }

  // Asynchronously synchronize with first-party server cookie
  try {
    ageVerificationService.declareAdult().catch((err) => {
      // Non-fatal if offline or backend proxy unavailable; local confirmation is established
      console.warn('Background age declaration cookie sync notice:', err);
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Resets the confirmation state for testing or privacy data clear.
 */
export function resetAgeConfirmedLocallyForTesting(): void {
  inMemoryAgeConfirmed = false;
  try {
    safeLocalStorage.removeItem(AGE_CONFIRMATION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
