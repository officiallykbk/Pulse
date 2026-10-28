interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { videoId: string };
}

interface PublicVideo {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function pageResponse(status: number, title: string, message: string, href = '/'): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050505"><title>${escapeHtml(title)} · Pulse</title></head><body style="margin:0;background:#050505;color:#f5f5f5;font:16px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:34rem;padding:2rem;text-align:center"><h1>${escapeHtml(title)}</h1><p style="color:#aaa;line-height:1.6">${escapeHtml(message)}</p><a href="${escapeHtml(href)}" style="display:inline-block;margin-top:1rem;padding:.8rem 1.25rem;border-radius:999px;background:#E50914;color:white;text-decoration:none;font-weight:700">Open Pulse</a></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function absoluteImageUrl(value: string | null, origin: string): string {
  try {
    const imageUrl = new URL(value || '/pulse-mark.svg', origin);
    if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') throw new Error('Unsupported image URL');
    return imageUrl.toString();
  } catch {
    return `${origin}/pulse-mark.svg`;
  }
}

export async function onRequestGet({ request, env, params }: PagesContext): Promise<Response> {
  const videoId = params.videoId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId)) {
    return pageResponse(404, 'Video unavailable', 'This video link is not valid.');
  }
  const fallbackAppUrl = `/?v=${encodeURIComponent(videoId)}`;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return pageResponse(503, 'Pulse is warming up', 'Video previews are temporarily unavailable.', fallbackAppUrl);
  }

  const endpoint = new URL('/rest/v1/videos', env.SUPABASE_URL);
  endpoint.searchParams.set('select', 'id,title,description,thumbnail_url');
  endpoint.searchParams.set('id', `eq.${videoId}`);
  endpoint.searchParams.set('is_active', 'eq.true');
  endpoint.searchParams.set('status', 'in.(published,ready)');
  endpoint.searchParams.set('visibility', 'eq.public');
  endpoint.searchParams.set('limit', '1');

  let videos: PublicVideo[];
  try {
    const result = await fetch(endpoint, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
    if (!result.ok) return pageResponse(503, 'Pulse is warming up', 'We could not load this video preview. Try opening Pulse.', fallbackAppUrl);
    videos = await result.json() as PublicVideo[];
  } catch {
    return pageResponse(503, 'Pulse is warming up', 'We could not load this video preview. Try opening Pulse.', fallbackAppUrl);
  }
  const video = videos[0];
  if (!video) return pageResponse(404, 'Video unavailable', 'This video may have been removed or is not public.');

  const origin = new URL(request.url).origin;
  const canonical = `${origin}/watch/${video.id}`;
  const appUrl = `${origin}/?v=${encodeURIComponent(video.id)}`;
  const title = `${video.title} · Pulse`;
  const description = (video.description?.trim() || 'Watch this short video on Pulse.').slice(0, 300);
  const image = absoluteImageUrl(video.thumbnail_url, origin);
  const redirectTarget = JSON.stringify(appUrl).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#050505"><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Pulse">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="Preview for ${escapeHtml(video.title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(image)}">
<title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#050505;color:#f5f5f5;font:16px system-ui}main{max-width:44rem;margin:0 auto;padding:24px}.poster{display:block;width:100%;max-height:70vh;object-fit:contain;background:#111;border-radius:16px}.copy{color:#aaa;line-height:1.6}.button{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:999px;background:#E50914;color:#fff;text-decoration:none;font-weight:700}</style>
</head><body><main><img class="poster" src="${escapeHtml(image)}" alt="Preview for ${escapeHtml(video.title)}"><h1>${escapeHtml(video.title)}</h1><p class="copy">${escapeHtml(description)}</p><a class="button" href="${escapeHtml(appUrl)}">Watch on Pulse</a></main><script>window.location.replace(${redirectTarget})</script></body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
