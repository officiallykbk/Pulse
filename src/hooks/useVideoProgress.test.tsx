import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVideoProgress } from '@/hooks/useVideoProgress';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (..._args: unknown[]) => ({ data: null, error: null })),
  getUser: vi.fn(),
  user: null as { id: string } | null,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      return chain;
    },
    rpc: mocks.rpc,
  },
}));

describe('useVideoProgress', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.rpc.mockClear();
    mocks.getUser.mockReset().mockImplementation(async () => ({ data: { user: mocks.user }, error: null }));
  });

  afterEach(() => localStorage.clear());

  it('restores a locally cached resume position without a signed-in account', async () => {
    localStorage.setItem('pulse:resume-position:video-1', '32');
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
    const videoRef = { current: video };

    renderHook(() => useVideoProgress('video-1', videoRef, true));

    await waitFor(() => expect(video.currentTime).toBe(32));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('drops nearly-finished local positions instead of resuming at the end', async () => {
    localStorage.setItem('pulse:resume-position:video-2', '4');
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
    const videoRef = { current: video };

    renderHook(() => useVideoProgress('video-2', videoRef, true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(video.currentTime).toBe(0);
  });

  it('emits one opted-in viewing summary when the active session ends', async () => {
    mocks.user = { id: 'viewer-1' };
    localStorage.setItem('pulse:settings', JSON.stringify({ viewingInsights: true }));
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
    const videoRef = { current: video };
    const { unmount } = renderHook(() => useVideoProgress('video-3', videoRef, true));

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    for (const second of [1, 2, 3, 4]) {
      video.currentTime = second;
      video.dispatchEvent(new Event('timeupdate'));
    }
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === 'record_video_viewing_insight')).toHaveLength(0);

    unmount();
    await waitFor(() => expect(
      mocks.rpc.mock.calls.filter((call) => call[0] === 'record_video_viewing_insight')
    ).toHaveLength(1));
  });
});
