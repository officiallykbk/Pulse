import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsScreen } from '@/components/SettingsScreen';
import { SupportScreen } from '@/components/SupportScreen';
import { ProUpgradeModal } from '@/components/ProUpgradeModal';
import { VideoOptionsSheet } from '@/components/VideoOptionsSheet';
import { makeVideo } from '@/test/helpers';
import { APP_IDENTITY } from '@/config/appIdentity';

const state = vi.hoisted(() => ({
  feedbackInserts: [] as Array<Record<string, unknown>>,
  reportInserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        insert: (payload: Record<string, unknown>) => {
          if (table === 'feedback') state.feedbackInserts.push(payload);
          if (table === 'reports') state.reportInserts.push(payload);
          return {
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          };
        },
        delete: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: () => builder,
      };
      return builder;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: { path: 'p' }, error: null })),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://s/${path}` } }),
      }),
    },
  },
}));

// ---------- SettingsScreen ----------

describe('SettingsScreen', () => {
  const baseProps = {
    tier: 'free' as const,
    onBack: vi.fn(),
    onRequireAuth: vi.fn(),
    onSignOut: vi.fn(),
    onDeleted: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders playback toggles with correct defaults', () => {
    render(<SettingsScreen {...baseProps} />);
    expect(screen.getByText('Data Saver Mode')).toBeInTheDocument();
    expect(screen.getByText('Auto-play Videos')).toBeInTheDocument();
    const [dataSaver, autoplay] = screen.getAllByRole('checkbox');
    expect(dataSaver).not.toBeChecked();
    expect(autoplay).toBeChecked();
  });

  it('persists a toggle change to localStorage', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen {...baseProps} />);
    const [dataSaver] = screen.getAllByRole('checkbox');
    await user.click(dataSaver);
    expect(dataSaver).toBeChecked();
    expect(JSON.parse(localStorage.getItem(APP_IDENTITY.storageKeys.settings)!)).toMatchObject({
      dataSaver: true,
    });
  });

  it('shows Delete Account confirmation and can cancel it', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen {...baseProps} />);
    await user.click(screen.getByText('Delete Account'));
    expect(screen.getByText('Delete account?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete account?')).not.toBeInTheDocument();
  });

  it('includes Terms, Privacy, and Contact links (no dead ends)', () => {
    render(<SettingsScreen {...baseProps} />);
    expect(screen.getByText('Terms of Service').closest('a')).toHaveAttribute('href', '/terms');
    expect(screen.getByText('Privacy Policy').closest('a')).toHaveAttribute('href', '/privacy');
    expect(screen.getByText('Contact Support').closest('a')).toHaveAttribute('href', `mailto:${APP_IDENTITY.supportEmail}`);
  });

  it('navigates back', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(baseProps.onBack).toHaveBeenCalled();
  });
});

// ---------- SupportScreen ----------

describe('SupportScreen', () => {
  beforeEach(() => {
    state.feedbackInserts = [];
    vi.clearAllMocks();
  });

  it('renders the feedback form and FAQ', () => {
    render(<SupportScreen onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/tell us what's on your mind/i)).toBeInTheDocument();
    expect(screen.getByText('Frequently Asked')).toBeInTheDocument();
  });

  it('submits feedback to the database with a category', async () => {
    const user = userEvent.setup();
    render(<SupportScreen onBack={vi.fn()} />);
    await user.click(screen.getByText('Bug report'));
    await user.type(screen.getByPlaceholderText(/tell us what's on your mind/i), 'Video will not play');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    await waitFor(() => expect(state.feedbackInserts).toHaveLength(1));
    expect(state.feedbackInserts[0]).toMatchObject({
      category: 'bug',
      message: 'Video will not play',
      user_id: 'user-1',
    });
  });

  it('expands and collapses FAQ answers', async () => {
    const user = userEvent.setup();
    render(<SupportScreen onBack={vi.fn()} />);
    await user.click(screen.getByText('Why do I see ads?'));
    expect(screen.getByText(new RegExp(`Ads keep ${APP_IDENTITY.name} free`))).toBeInTheDocument();
    await user.click(screen.getByText('Why do I see ads?'));
    expect(screen.queryByText(new RegExp(`Ads keep ${APP_IDENTITY.name} free`))).not.toBeInTheDocument();
  });

  it('disables send until a message is entered', () => {
    render(<SupportScreen onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Send Message' })).toBeDisabled();
  });
});

// ---------- ProUpgradeModal ----------

describe('ProUpgradeModal', () => {
  const baseProps = {
    open: true,
    email: 'a@b.c',
    tier: 'free' as const,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the GHS 10 monthly price and benefits', () => {
    render(<ProUpgradeModal {...baseProps} />);
    expect(screen.getByText('GHS 10.00 / month')).toBeInTheDocument();
    expect(screen.getByText('Ad-free viewing experience')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<ProUpgradeModal {...baseProps} open={false} />);
    expect(screen.queryByText('Go Pro')).not.toBeInTheDocument();
  });

  it('closes via the close button', async () => {
    const user = userEvent.setup();
    render(<ProUpgradeModal {...baseProps} />);
    // The close button is the only button rendered before the subscribe CTA
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});

// ---------- VideoOptionsSheet (report flow) ----------

describe('VideoOptionsSheet report flow', () => {
  const baseProps = {
    video: makeVideo(),
    open: true,
    onClose: vi.fn(),
    onShare: vi.fn(),
    onReport: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.reportInserts = [];
  });

  it('lists report reasons after opening the report menu', async () => {
    const user = userEvent.setup();
    render(<VideoOptionsSheet {...baseProps} />);
    await user.click(screen.getByText('Report video'));
    expect(screen.getByText('Why are you reporting this video?')).toBeInTheDocument();
    expect(screen.getByText('Inappropriate content')).toBeInTheDocument();
    expect(screen.getByText('Copyright violation')).toBeInTheDocument();
  });

  it('submits the chosen reason and closes', async () => {
    const user = userEvent.setup();
    render(<VideoOptionsSheet {...baseProps} />);
    await user.click(screen.getByText('Report video'));
    await user.click(screen.getByText('Spam or misleading'));
    expect(baseProps.onReport).toHaveBeenCalledWith('spam');
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('can go back from the reason list without reporting', async () => {
    const user = userEvent.setup();
    render(<VideoOptionsSheet {...baseProps} />);
    await user.click(screen.getByText('Report video'));
    await user.click(screen.getByText('Back'));
    expect(baseProps.onReport).not.toHaveBeenCalled();
    expect(screen.getByText('Report video')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<VideoOptionsSheet {...baseProps} open={false} />);
    expect(screen.queryByText('Report video')).not.toBeInTheDocument();
  });
});
