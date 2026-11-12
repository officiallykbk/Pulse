import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { matchPagesRoute } from '../vite-pages-routes';
import { VideoCard } from '@/components/VideoCard';
import { makeVideo } from '@/test/helpers';
import { supabase, publicSupabase, accountSupabase } from '@/services/supabase';

describe('Auth, Media Cross-Origin & Local Pages Functions Routing Fixes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveMediaUrl()', () => {
    it('rewrites cross-origin .pages.dev /media/* URLs to same-origin /media/* paths', () => {
      expect(
        resolveMediaUrl('https://pulse-ghana.pages.dev/media/videos/mock/clip-12.mp4')
      ).toBe('/media/videos/mock/clip-12.mp4');

      expect(
        resolveMediaUrl('https://preview-abc.pulse-ghana.pages.dev/media/videos/mock/poster-12.webp?v=1')
      ).toBe('/media/videos/mock/poster-12.webp?v=1');
    });

    it('preserves external CDNs, Supabase storage URLs, relative URLs, and blob URIs unchanged', () => {
      expect(resolveMediaUrl('https://cdn.example.com/video.mp4')).toBe(
        'https://cdn.example.com/video.mp4'
      );
      expect(resolveMediaUrl('/media/videos/mock/clip-01.mp4')).toBe(
        '/media/videos/mock/clip-01.mp4'
      );
      expect(resolveMediaUrl('blob:http://localhost:5173/1234')).toBe(
        'blob:http://localhost:5173/1234'
      );
      expect(resolveMediaUrl(null)).toBeNull();
    });
  });

  describe('supabase client table & RPC routing', () => {
    it('routes engagement counter RPCs (increment_view_count, increment_share_count) through accountSupabase', () => {
      const accountRpcSpy = vi
        .spyOn(accountSupabase, 'rpc')
        .mockResolvedValue({ data: null, error: null, count: null, status: 200, statusText: 'OK' } as never);
      const publicRpcSpy = vi.spyOn(publicSupabase, 'rpc');

      supabase.rpc('increment_view_count', { video_id: 'vid-1' });
      supabase.rpc('increment_share_count', { video_id: 'vid-1' });

      expect(accountRpcSpy).toHaveBeenCalledWith('increment_view_count', { video_id: 'vid-1' });
      expect(accountRpcSpy).toHaveBeenCalledWith('increment_share_count', { video_id: 'vid-1' });
      expect(publicRpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('VideoCard anonymous view-count guard', () => {
    it('does not call increment_view_count for anonymous viewers (prevents 401 Unauthorized noise)', () => {
      const rpcSpy = vi
        .spyOn(supabase, 'rpc')
        .mockResolvedValue({ data: null, error: null, count: null, status: 200, statusText: 'OK' } as never);

      render(
        <VideoCard
          video={makeVideo({ id: 'v-anon-1' })}
          isActive={true}
          tier="anonymous"
          onRequireAuth={vi.fn()}
        />
      );

      expect(screen.getByText('Test video')).toBeInTheDocument();
      expect(rpcSpy).not.toHaveBeenCalledWith('increment_view_count', expect.anything());
    });

    it('calls increment_view_count when a signed-in viewer watches an active video', () => {
      const rpcSpy = vi
        .spyOn(supabase, 'rpc')
        .mockResolvedValue({ data: null, error: null, count: null, status: 200, statusText: 'OK' } as never);

      render(
        <VideoCard
          video={makeVideo({ id: 'v-signed-1' })}
          isActive={true}
          tier="free"
          onRequireAuth={vi.fn()}
        />
      );

      expect(rpcSpy).toHaveBeenCalledWith('increment_view_count', { video_id: 'v-signed-1' });
    });
  });

  describe('Vite dev Pages Functions route matcher', () => {
    it('maps static auth, age, upload, telemetry, and dynamic proxy/media routes accurately', () => {
      expect(matchPagesRoute('/api/auth/sign-up')).toEqual({
        modulePath: './functions/api/auth/sign-up.ts',
        params: {},
      });
      expect(matchPagesRoute('/api/auth/sign-in')).toEqual({
        modulePath: './functions/api/auth/sign-in.ts',
        params: {},
      });
      expect(matchPagesRoute('/api/telemetry/event')).toEqual({
        modulePath: './functions/api/telemetry/event.ts',
        params: {},
      });
      expect(matchPagesRoute('/api/supabase/rest/v1/likes')).toEqual({
        modulePath: './functions/api/supabase/[[path]].ts',
        params: { path: ['rest', 'v1', 'likes'] },
      });
      expect(matchPagesRoute('/media/videos/mock/clip-12.mp4')).toEqual({
        modulePath: './functions/media/[[path]].ts',
        params: { path: ['videos', 'mock', 'clip-12.mp4'] },
      });
      expect(matchPagesRoute('/api/media/stream/vid-99')).toEqual({
        modulePath: './functions/api/media/stream/[id].ts',
        params: { id: 'vid-99' },
      });
      expect(matchPagesRoute('/api/unknown/endpoint')).toBeNull();
    });
  });
});
