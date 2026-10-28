import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AdController } from './AdController';
import * as vastModule from '@/services/vast';
import * as settingsModule from '@/lib/settings';

describe('AdController (Phase 1: Ad Lock Optimization & Bandwidth Respect)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never locks a no-fill or fallback sponsor card, allowing immediate skip for guests', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    // Mock VAST returning null (no fill)
    vi.spyOn(vastModule, 'fetchVastAd').mockResolvedValue(null);

    render(
      <AdController
        tier="anonymous"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
        vastUrl="https://ads.pulse.gh/nofill"
      />
    );

    // Let VAST resolution effect resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Should NOT lock the user on an empty / fallback card
    expect(onLockChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/Skip in 5s/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Locked during ad/i)).not.toBeInTheDocument();

    // Skip button should be available immediately
    const skipButton = screen.getByRole('button', { name: /Skip Ad/i });
    expect(skipButton).toBeInTheDocument();

    // Clicking Skip Ad advances feed immediately
    fireEvent.click(skipButton);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('enforces a 5-second mandatory lock when an ad video is filled and playing', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    // Mock VAST returning a filled video ad
    vi.spyOn(vastModule, 'fetchVastAd').mockResolvedValue({
      videoUrl: 'https://cdn.example.com/ad-video.mp4',
      title: 'Partner Energy Drink',
    });

    render(
      <AdController
        tier="anonymous"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
        vastUrl="https://ads.pulse.gh/instream"
      />
    );

    // Wait for the async ad load
    await act(async () => {
      await Promise.resolve();
    });

    // Filled ad video should enforce scroll lock and display countdown
    expect(onLockChange).toHaveBeenCalledWith(true);
    expect(screen.getByText(/Skip in 5s/i)).toBeInTheDocument();
    expect(screen.queryByText(/Skip Ad/i)).not.toBeInTheDocument();

    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/Skip in 2s/i)).toBeInTheDocument();
    expect(screen.queryByText(/Skip Ad/i)).not.toBeInTheDocument();

    // Advance remaining 2 seconds (total 5s)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should unlock scroll and reveal Skip Ad button
    expect(onLockChange).toHaveBeenLastCalledWith(false);
    const skipButton = screen.getByRole('button', { name: /Skip Ad/i });
    expect(skipButton).toBeInTheDocument();

    // Clicking Skip Ad advances feed
    fireEvent.click(skipButton);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('skips heavy VAST video auctions and does not lock when Data Saver is active', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    // Set Data Saver mode active in settings
    vi.spyOn(settingsModule, 'loadAppSettings').mockReturnValue({
      dataSaver: true,
      autoplay: true,
      viewingInsights: false,
    });

    const vastSpy = vi.spyOn(vastModule, 'fetchVastAd');

    render(
      <AdController
        tier="anonymous"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
        vastUrl="https://ads.pulse.gh/instream"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // VAST fetch should have been bypassed to conserve bandwidth
    expect(vastSpy).not.toHaveBeenCalled();

    // Should not lock
    expect(onLockChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /Skip Ad/i })).toBeInTheDocument();
  });

  it('immediately releases lock if video playback encounters an error', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    vi.spyOn(vastModule, 'fetchVastAd').mockResolvedValue({
      videoUrl: 'https://cdn.example.com/corrupt-ad.mp4',
      title: 'Broken Ad',
    });

    const { container } = render(
      <AdController
        tier="anonymous"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
        vastUrl="https://ads.pulse.gh/broken"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Video was mounted with lock active
    expect(onLockChange).toHaveBeenCalledWith(true);

    // Trigger video error
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();

    act(() => {
      fireEvent.error(video!);
    });

    // Lock must be released immediately, and Skip Ad button revealed
    expect(onLockChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /Skip Ad/i })).toBeInTheDocument();
  });

  it('allows immediate skip if tier delay is 0', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    render(
      <AdController
        tier="pro"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Pro tier has 0 delay, should not lock
    expect(onLockChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /Skip Ad/i })).toBeInTheDocument();
  });

  it('triggers onUpgrade callback when user clicks the upgrade button', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    render(
      <AdController
        tier="free"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const upgradeBtn = screen.getByRole('button', { name: /Go Pro/i });
    fireEvent.click(upgradeBtn);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders Learn More CTA and handles safe click-through without popunders', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    vi.spyOn(vastModule, 'fetchVastAd').mockResolvedValue({
      videoUrl: 'https://cdn.example.com/ad.mp4',
      clickThroughUrl: 'https://sponsor.example.com/clean-offer',
      title: 'Partner Reel',
    });

    const adMediationModule = await import('@/services/adMediation');
    const safeOpenSpy = vi.spyOn(adMediationModule, 'safeOpenClickThrough').mockReturnValue(true);

    render(
      <AdController
        tier="free"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
        vastUrl="https://custom.vast.com"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const learnMoreBtn = screen.getByRole('button', { name: /Learn More/i });
    expect(learnMoreBtn).toBeInTheDocument();

    fireEvent.click(learnMoreBtn);
    expect(safeOpenSpy).toHaveBeenCalledWith('https://sponsor.example.com/clean-offer');
  });
});
