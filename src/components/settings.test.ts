import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppSettings, saveAppSettings } from '@/lib/settings';
import { APP_IDENTITY } from '@/config/appIdentity';

describe('app settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is saved', () => {
    const settings = loadAppSettings();
    expect(settings).toEqual({ dataSaver: false, autoplay: true, viewingInsights: false });
  });

  it('saves and round-trips settings', () => {
    saveAppSettings({ dataSaver: true, autoplay: false, viewingInsights: true });
    expect(loadAppSettings()).toEqual({ dataSaver: true, autoplay: false, viewingInsights: true });
  });

  it('merges saved settings over defaults (forward compatibility)', () => {
    localStorage.setItem(
      APP_IDENTITY.storageKeys.settings,
      JSON.stringify({ dataSaver: true })
    );
    const settings = loadAppSettings();
    expect(settings.dataSaver).toBe(true);
    expect(settings.autoplay).toBe(true);
  });

  it('supports legacy settings key fallback', () => {
    localStorage.setItem(
      'ghanareels:settings',
      JSON.stringify({ dataSaver: true, autoplay: false })
    );
    const settings = loadAppSettings();
    expect(settings.dataSaver).toBe(true);
    expect(settings.autoplay).toBe(false);
  });

  it('falls back to defaults on corrupted storage', () => {
    localStorage.setItem(APP_IDENTITY.storageKeys.settings, '{not json');
    expect(loadAppSettings()).toEqual({ dataSaver: false, autoplay: true, viewingInsights: false });
  });
});
