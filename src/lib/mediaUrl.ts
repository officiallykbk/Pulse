/**
 * Normalizes first-party /media/* URLs that were seeded or stored with a deployment
 * `.pages.dev` origin (e.g. `https://pulse-ghana.pages.dev/media/...`) so they load
 * via the current origin's `/media/*` proxy.
 *
 * Prevents `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` when running locally or on
 * custom/private infrastructure domains, while keeping external CDN/storage URLs untouched.
 */
export function resolveMediaUrl(url: string): string;
export function resolveMediaUrl(url: string | null | undefined): string | null;
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  if (typeof window === 'undefined' || !window.location?.origin) {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    const isDeploymentMediaPath =
      parsed.pathname.startsWith('/media/') &&
      (parsed.hostname === 'pulse-ghana.pages.dev' || parsed.hostname.endsWith('.pages.dev'));

    if (isDeploymentMediaPath && parsed.origin !== window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Preserve relative or non-standard URIs (blob:, data:, etc.) unchanged
  }

  return url;
}
