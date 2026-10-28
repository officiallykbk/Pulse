import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgeGateModal } from './AgeGateModal';
import { ageVerificationService } from '@/services/ageVerification';

vi.mock('@/services/ageVerification', () => ({
  ageVerificationService: {
    declareAdult: vi.fn(),
    getSnapshot: vi.fn(() => 'unknown'),
    subscribe: vi.fn(() => () => {}),
  },
}));

describe('AgeGateModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <AgeGateModal open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with affirmative button, cancel button, and privacy notice', () => {
    render(
      <AgeGateModal
        open={true}
        onClose={vi.fn()}
        contentTitle="Exclusive Night Life"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('18+ Content Confirmation')).toBeInTheDocument();
    expect(screen.getByText(/Exclusive Night Life/)).toBeInTheDocument();
    expect(screen.getByText('I am 18+')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText(/Pulse does not collect your ID/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button or close X is clicked', () => {
    const onClose = vi.fn();
    render(<AgeGateModal open={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('submits affirmative declaration and triggers onVerified and onClose upon success', async () => {
    vi.mocked(ageVerificationService.declareAdult).mockResolvedValueOnce('verified');
    const onClose = vi.fn();
    const onVerified = vi.fn();

    render(
      <AgeGateModal open={true} onClose={onClose} onVerified={onVerified} />
    );

    fireEvent.click(screen.getByText('I am 18+'));

    await waitFor(() => {
      expect(ageVerificationService.declareAdult).toHaveBeenCalledTimes(1);
      expect(onVerified).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error message when declaration fails', async () => {
    vi.mocked(ageVerificationService.declareAdult).mockRejectedValueOnce(
      new Error('Verification server unreachable')
    );
    const onClose = vi.fn();

    render(<AgeGateModal open={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('I am 18+'));

    await waitFor(() => {
      expect(screen.getByText('Verification server unreachable')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
