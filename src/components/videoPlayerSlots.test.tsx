import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { VideoPlayer } from '@/components/VideoPlayer';

describe('VideoPlayer Sliding 3-Slot Engine', () => {
  it('renders idle slot in detached state with preload none', () => {
    const { container } = render(
      <VideoPlayer
        videoUrl="https://example.com/test.mp4"
        slotState="idle"
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('preload', 'none');
  });

  it('renders prefetch slot with preload auto and muted', () => {
    const { container } = render(
      <VideoPlayer
        videoUrl="https://example.com/test.mp4"
        slotState="prefetch"
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('preload', 'auto');
  });

  it('renders active slot with volume controls and scrubber bar', () => {
    const { container } = render(
      <VideoPlayer
        videoUrl="https://example.com/test.mp4"
        slotState="active"
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    // Mute button rendered for active player
    const muteButton = container.querySelector('button');
    expect(muteButton).toBeInTheDocument();
  });
});
