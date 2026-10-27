import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AdController } from './AdController';

describe('AdController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces a 5-second mandatory lock for anonymous viewers', () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    render(
      <AdController
        tier="anonymous"
        onNext={onNext}
        onUpgrade={onUpgrade}
        onLockChange={onLockChange}
      />
    );

    // Should lock scroll immediately
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

  it('allows immediate skip if tier delay is 0', () => {
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

    // Pro tier has 0 delay, should not lock
    expect(onLockChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /Skip Ad/i })).toBeInTheDocument();
  });

  it('triggers onUpgrade callback when user clicks the upgrade button', () => {
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

    const upgradeBtn = screen.getByRole('button', { name: /Go Pro/i });
    fireEvent.click(upgradeBtn);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders Learn More CTA and handles safe click-through without popunders', async () => {
    const onNext = vi.fn();
    const onUpgrade = vi.fn();
    const onLockChange = vi.fn();

    // Mock fetchVastAd returning an ad with clickthrough
    const vastModule = await import('@/services/vast');
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

    // Wait for the async load
    await act(async () => {
      await Promise.resolve();
    });

    const learnMoreBtn = screen.getByRole('button', { name: /Learn More/i });
    expect(learnMoreBtn).toBeInTheDocument();

    fireEvent.click(learnMoreBtn);
    expect(safeOpenSpy).toHaveBeenCalledWith('https://sponsor.example.com/clean-offer');
  });
});
