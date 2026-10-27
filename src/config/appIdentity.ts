/**
 * Centralized App Identity Configuration
 *
 * All branding, application metadata, support info, and identity labels
 * are defined here so any future changes can be made in this single file.
 */

export interface AppIdentity {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  defaultMemberName: string;
  supportEmail: string;
  version: string;
  logo: {
    symbol: string;
    text: string;
    accentWord?: string;
  };
  storageKeys: {
    settings: string;
    legacySettings?: string[];
    viewingBudget: string;
    legacyViewingBudget?: string[];
  };
  share: {
    defaultText: string;
    buildVideoShareText: (description?: string | null) => string;
  };
  faq: {
    adNotice: string;
  };
}

export const APP_IDENTITY: AppIdentity = {
  name: 'Pulse',
  shortName: 'Pulse',
  tagline: 'Short videos. Ghanaian energy.',
  description: 'A home for short videos, creators, and culture from Ghana and beyond.',
  defaultMemberName: 'Pulse member',
  supportEmail: 'support@pulse.video',
  version: '1.0.0',
  logo: {
    symbol: 'P',
    text: 'Pulse',
  },
  storageKeys: {
    settings: 'pulse:settings',
    legacySettings: ['ghanareels:settings'],
    viewingBudget: 'pulse_anonymous_viewing',
    legacyViewingBudget: ['ghanareels_anonymous_viewing'],
  },
  share: {
    defaultText: 'Check out this video on Pulse',
    buildVideoShareText: (description?: string | null) =>
      description?.trim() ? description.trim() : 'Check out this video on Pulse',
  },
  faq: {
    adNotice: 'Ads keep Pulse free. Guests see one every 5 videos, registered members every 10. Pro members never see ads.',
  },
};
