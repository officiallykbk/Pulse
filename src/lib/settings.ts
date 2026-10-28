import { APP_IDENTITY } from '@/config/appIdentity';

const SETTINGS_KEY = APP_IDENTITY.storageKeys.settings;

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
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write issues
  }
}
