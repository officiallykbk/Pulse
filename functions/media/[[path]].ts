interface Env {
  SUPABASE_URL?: string;
}

const PUBLIC_BUCKETS = new Set(['videos', 'avatars']);
const PUBLIC_EXTENSIONS = new Set(['mp4', 'webm', 'webp', 'jpg', 'jpeg', 'png', 'm3u8', 'ts']);
const CACHE_SECONDS = 31_536_000;

function normalizedSegments(rawPath: string | string[] | undefined): string[] | null {
  const rawSegments = Array.isArray(rawPath) ? rawPath : (rawPath ?? '').split('/');
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (!segment || segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('/')) return null;
    segments.push(segment);
  }
  return segments;
}

export async function onRequest({
  request,
  env,
  params,
}: {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (!env.SUPABASE_URL) return new Response('Media service unavailable', { status: 503 });

  const segments = normalizedSegments(params.path);
  if (!segments || segments.length < 2 || !PUBLIC_BUCKETS.has(segments[0])) {
    return new Response('Not found', { status: 404 });
  }
  const extension = segments[segments.length - 1]?.split('.').pop()?.toLowerCase() ?? '';
  if (!PUBLIC_EXTENSIONS.has(extension)) return new Response('Unsupported media type', { status: 415 });

  const upstreamUrl = new URL(
    `/storage/v1/object/public/${segments.map(encodeURIComponent).join('/')}`,
    env.SUPABASE_URL,
  );
  const upstreamHeaders: Record<string, string> = {};
  for (const name of ['range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders[name] = value;
  }

  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS },
  } as RequestInit & { cf: { cacheEverything: boolean; cacheTtl: number } });

  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS}, immutable`);
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.delete('set-cookie');
  headers.delete('server');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
