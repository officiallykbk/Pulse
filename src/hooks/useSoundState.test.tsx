import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSoundState, getIsMuted, setIsMuted } from '@/hooks/useSoundState';
import { VideoCard } from '@/components/VideoCard';
import { makeVideo } from '@/test/helpers';

describe('Sound & Mute State System', () => {
  beforeEach(() => {
    // Reset to guaranteed initial load state (muted = true)
    setIsMuted(true);
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
});
