import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/media/[[path]]';

afterEach(() => vi.restoreAllMocks());

describe('public media proxy', () => {
  it('caches an allowed public media object and forwards range requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('video-bytes', {
        status: 206,
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-10/100' },
      }),
    );
    const request = {
      method: 'GET',
      headers: { get: (name: string) => name === 'range' ? 'bytes=0-10' : null },
    } as Request;
    const response = await onRequest({
      request,
      env: { SUPABASE_URL: 'https://project.supabase.co' },
      params: { path: ['videos', 'mock', 'clip-01.mp4'] },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [upstreamUrl, upstreamOptions] = fetchMock.mock.calls[0];
    expect(String(upstreamUrl)).toBe('https://project.supabase.co/storage/v1/object/public/videos/mock/clip-01.mp4');
    expect(upstreamOptions).toMatchObject({
      method: 'GET',
      headers: { range: 'bytes=0-10' },
      cf: { cacheEverything: true, cacheTtl: 31_536_000 },
    });
    const forwarded = upstreamOptions?.headers as Record<string, string>;
    expect(forwarded.range).toBe('bytes=0-10');
  });

  it.each([
    { path: ['private', 'secret.mp4'], status: 404 },
    { path: ['videos', '..', 'secret.mp4'], status: 404 },
    { path: ['videos', 'mock', 'payload.html'], status: 415 },
  ])('rejects unsafe path %#', async ({ path, status }) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await onRequest({
      request: new Request(`https://pulse.test/media/${path.join('/')}`),
      env: { SUPABASE_URL: 'https://project.supabase.co' },
      params: { path },
    });
    expect(response.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
