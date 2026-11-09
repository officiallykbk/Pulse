import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MandatoryAgeGate } from './components/MandatoryAgeGate';
import {
  isAgeConfirmedLocally,
  setAgeConfirmedLocally,
  resetAgeConfirmedLocallyForTesting,
  AGE_CONFIRMATION_STORAGE_KEY,
} from './lib/ageConfirmation';
import { ageVerificationService } from './services/ageVerification';

describe('Phase 1: Mandatory Full-Screen Age Verification Gate & Persistence', () => {
  beforeEach(() => {
    resetAgeConfirmedLocallyForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(ageVerificationService, 'declareAdult').mockResolvedValue('verified');
  });

  it('renders the mandatory full-screen age gate on first visit', () => {
    expect(isAgeConfirmedLocally()).toBe(false);

    render(<MandatoryAgeGate />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you 18 or older\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I am 18 or older — Enter Pulse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I am under 18 — Exit/i })).toBeInTheDocument();
  });

  it('confirms 18+, records locally, synchronizes with server, and unblocks viewer', async () => {
    const onConfirmed = vi.fn();
    const serverSyncSpy = vi.spyOn(ageVerificationService, 'declareAdult').mockResolvedValue('verified');

    render(<MandatoryAgeGate onConfirmed={onConfirmed} />);

    const enterButton = screen.getByRole('button', { name: /I am 18 or older — Enter Pulse/i });

    await act(async () => {
      fireEvent.click(enterButton);
    });

    // Check local storage persistence
    expect(localStorage.getItem(AGE_CONFIRMATION_STORAGE_KEY)).toBe('true');
    expect(isAgeConfirmedLocally()).toBe(true);

    // Check callback and server sync
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(serverSyncSpy).toHaveBeenCalled();

    // Modal should disappear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT popup on subsequent renders or after page refresh when confirmed', () => {
    // Set confirmed in localStorage as if from previous session
    localStorage.setItem(AGE_CONFIRMATION_STORAGE_KEY, 'true');

    expect(isAgeConfirmedLocally()).toBe(true);

    const { container } = render(<MandatoryAgeGate />);

    // Must be completely empty (null rendered)
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays the access-restricted barrier when viewer selects under-18', () => {
    render(<MandatoryAgeGate />);

    const under18Button = screen.getByRole('button', { name: /I am under 18 — Exit/i });
    fireEvent.click(under18Button);

    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    expect(screen.getByText(/18\+ Required/i)).toBeInTheDocument();
    expect(screen.getByText(/You must be 18 years of age or older/i)).toBeInTheDocument();

    // Allows returning if clicked by mistake
    const retryButton = screen.getByRole('button', { name: /I made a mistake — Verify Again/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(screen.getByText(/Are you 18 or older\?/i)).toBeInTheDocument();
  });

  it('survives restricted browser storage environments (e.g. Safari Private SecurityError)', () => {
    // Mock localStorage throwing SecurityError
    const originalGetItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    // isAgeConfirmedLocally should safely return false without throwing
    expect(isAgeConfirmedLocally()).toBe(false);

    // Calling setAgeConfirmedLocally should succeed in-memory
    expect(() => setAgeConfirmedLocally()).not.toThrow();
    expect(isAgeConfirmedLocally()).toBe(true);
  });
});
