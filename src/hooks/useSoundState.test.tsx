import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSoundState, getIsMuted, setIsMuted } from '@/hooks/useSoundState';
import { VideoCard } from '@/components/VideoCard';
import { makeVideo } from '@/test/helpers';

const supabaseState = vi.hoisted(() => ({ saved: false }));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'viewer-1' } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({
        data: table === 'saved_videos' && supabaseState.saved ? { video_id: 'video-1' } : null,
        error: null,
      });
      chain.insert = async () => {
        if (table === 'saved_videos') supabaseState.saved = true;
        return { error: null };
      };
      chain.delete = () => {
        if (table === 'saved_videos') supabaseState.saved = false;
        return chain;
      };
      chain.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

describe('Sound & Mute State System', () => {
  beforeEach(() => {
    // Reset to guaranteed initial load state (muted = true)
    setIsMuted(true);
    supabaseState.saved = false;
  });

  it('guarantees sound is muted by default on initial page load / refresh', () => {
    expect(getIsMuted()).toBe(true);

    const { result } = renderHook(() => useSoundState());
    expect(result.current.isMuted).toBe(true);
  });

  it('toggles mute state across the session and updates subscribers', () => {
    const { result } = renderHook(() => useSoundState());
    expect(result.current.isMuted).toBe(true);

    // Unmute
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
    expect(getIsMuted()).toBe(false);

    // Mute again
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(true);
    expect(getIsMuted()).toBe(true);
  });

  it('renders a Mute button in VideoCard action rail and toggles sound on click', async () => {
    const user = userEvent.setup();
    const video = makeVideo();

    render(
      <VideoCard
        video={video}
        isActive={true}
        tier="free"
        onRequireAuth={() => {}}
      />
    );

    // Initial state: Muted button is present with 'Muted' label (replacing the old eye views counter)
    const muteBtn = screen.getByTestId('mute-toggle-btn');
    expect(muteBtn).toBeInTheDocument();
    expect(muteBtn).toHaveAttribute('aria-label', 'Unmute sound');
    expect(screen.getByText('Muted')).toBeInTheDocument();

    // Click to unmute
    await user.click(muteBtn);
    expect(muteBtn).toHaveAttribute('aria-label', 'Mute sound');
    expect(screen.getByText('Sound')).toBeInTheDocument();
  });

  it('lets signed-in viewers save and unsave a video', async () => {
    const user = userEvent.setup();
    render(<VideoCard video={makeVideo()} isActive tier="free" onRequireAuth={() => {}} />);

    const saveButton = await screen.findByRole('button', { name: 'Save video' });
    await user.click(saveButton);
    expect(await screen.findByRole('button', { name: 'Remove from Saved' })).toBeInTheDocument();
  });

  it('requires authentication before a guest can save a video', async () => {
    const user = userEvent.setup();
    const onRequireAuth = vi.fn();
    render(<VideoCard video={makeVideo()} isActive tier="anonymous" onRequireAuth={onRequireAuth} />);

    await user.click(await screen.findByRole('button', { name: 'Save video' }));
    expect(onRequireAuth).toHaveBeenCalledOnce();
  });
});
