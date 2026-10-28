import { describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../functions/watch/[videoId]';

const VIDEO_ID = '123e4567-e89b-42d3-a456-426614174000';

function context(env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string } = {}) {
  return {
    request: new Request('https://pulse.example/watch/' + VIDEO_ID),
    env,
    params: { videoId: VIDEO_ID },
  };
}

describe('video share route', () => {
  it('renders crawler metadata and redirects browsers to the exact video', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{
      id: VIDEO_ID,
      title: 'Accra <night>',
      description: 'A city reel',
      thumbnail_url: '/posters/accra.jpg',
    }]), { status: 200 }));

    const response = await onRequestGet(context({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    }));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('property="og:title" content="Accra &lt;night&gt;');
    expect(html).toContain('property="og:image" content="https://pulse.example/posters/accra.jpg"');
    expect(html).toContain('window.location.replace("https://pulse.example/?v=' + VIDEO_ID + '")');
  });

  it('keeps the exact-video web fallback when edge variables are unavailable', async () => {
    const response = await onRequestGet(context());
    const html = await response.text();

    expect(response.status).toBe(503);
    expect(html).toContain('href="/?v=' + VIDEO_ID + '"');
  });

  it('rejects malformed video identifiers before querying Supabase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await onRequestGet({
      ...context(),
      params: { videoId: 'not-a-video-id' },
    });

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
