import { describe, it, expect } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { VideoPlayer } from '@/components/VideoPlayer';

describe('VideoPlayer Sliding 3-Slot Engine', () => {
  it('renders idle slot in detached state with preload none', () => {
    const { container } = render(
      <VideoPlayer
        videoId="video-idle"
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
        videoId="video-prefetch"
        videoUrl="https://example.com/test.mp4"
        slotState="prefetch"
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('preload', 'auto');
  });

  it('renders the scrubber without a second player-owned mute control', () => {
    const { container, getByTestId } = render(
      <VideoPlayer
        videoId="video-active"
        videoUrl="https://example.com/test.mp4"
        slotState="active"
      />
    );
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(getByTestId('video-progress')).toBeInTheDocument();
    expect(container.querySelector('button')).not.toBeInTheDocument();
  });

  it('fills a portrait stage only for portrait media and contains square media', async () => {
    const { container, rerender } = render(
      <VideoPlayer videoId="portrait" videoUrl="https://example.com/portrait.mp4" slotState="active" />
    );
    const stage = container.firstElementChild as HTMLElement;
    const portrait = container.querySelector('video') as HTMLVideoElement;
    stage.getBoundingClientRect = () => ({ width: 390, height: 844, x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 844, toJSON: () => ({}) });
    Object.defineProperties(portrait, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
    });
    fireEvent(window, new Event('resize'));
    fireEvent.loadedMetadata(portrait);
    await waitFor(() => expect(stage).toHaveAttribute('data-media-fit', 'cover'));

    rerender(<VideoPlayer videoId="square" videoUrl="https://example.com/square.mp4" slotState="active" />);
    const square = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperties(square, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1080 },
    });
    fireEvent.loadedMetadata(square);
    await waitFor(() => expect(stage).toHaveAttribute('data-media-fit', 'contain'));
  });
});
