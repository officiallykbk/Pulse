import { APP_IDENTITY } from '@/config/appIdentity';

const SETTINGS_KEY = APP_IDENTITY.storageKeys.settings;
export const SETTINGS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AppSettings {
  dataSaver: boolean;
  autoplay: boolean;
  viewingInsights: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { dataSaver: false, autoplay: true, viewingInsights: false };

export function loadAppSettings(): AppSettings {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
    let raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw && APP_IDENTITY.storageKeys.legacySettings) {
      for (const legacyKey of APP_IDENTITY.storageKeys.legacySettings) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;

    // If TTL expiration exists, enforce 24-hour limit
    if (typeof parsed.expiresAt === 'number' && Date.now() >= parsed.expiresAt) {
      try {
        localStorage.removeItem(SETTINGS_KEY);
      } catch {
        // Ignore
      }
      return DEFAULT_SETTINGS;
    }

    const settingsObj = ('value' in parsed && typeof parsed.value === 'object' && parsed.value !== null)
      ? (parsed.value as Record<string, unknown>)
      : parsed;

    return {
      dataSaver: typeof settingsObj.dataSaver === 'boolean' ? settingsObj.dataSaver : DEFAULT_SETTINGS.dataSaver,
      autoplay: typeof settingsObj.autoplay === 'boolean' ? settingsObj.autoplay : DEFAULT_SETTINGS.autoplay,
      viewingInsights: typeof settingsObj.viewingInsights === 'boolean' ? settingsObj.viewingInsights : DEFAULT_SETTINGS.viewingInsights,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings, ttlMs: number = SETTINGS_TTL_MS): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload = {
      ...settings,
      expiresAt: Date.now() + ttlMs,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write issues
  }
}
