/**
 * Lightweight VAST 2.0 / 3.0 / 4.0 XML Parser
 * Extracts in-stream video media files and click-through URLs from VAST tags.
 * If empty or invalid, fails safely so the player can immediately skip without stalls.
 */

export interface ParsedVastAd {
  videoUrl: string;
  clickThroughUrl?: string;
  title?: string;
  durationSeconds?: number;
}

export function parseVastXml(xmlString: string): ParsedVastAd | null {
  if (!xmlString || typeof xmlString !== 'string') return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parse error
    if (doc.querySelector('parsererror')) {
      return null;
    }

    // Check for MediaFile
    const mediaFiles = Array.from(doc.querySelectorAll('MediaFile'));
    if (mediaFiles.length === 0) {
      return null;
    }

    // Prefer MP4 format
    const mp4File = mediaFiles.find((m) => {
      const type = m.getAttribute('type') || '';
      return type.includes('mp4') || type.includes('video');
    }) || mediaFiles[0];

    const videoUrl = mp4File?.textContent?.trim();
    if (!videoUrl) return null;

    // Extract ClickThrough URL
    const clickThroughEl = doc.querySelector('ClickThrough');
    const clickThroughUrl = clickThroughEl?.textContent?.trim() || undefined;

    // Extract Title
    const titleEl = doc.querySelector('AdTitle');
    const title = titleEl?.textContent?.trim() || undefined;

    // Extract Duration (e.g. 00:00:15)
    const durationEl = doc.querySelector('Duration');
    let durationSeconds: number | undefined;
    if (durationEl?.textContent) {
      const parts = durationEl.textContent.trim().split(':');
      if (parts.length === 3) {
        const [h, m, s] = parts.map((n) => parseFloat(n));
        durationSeconds = Math.round(h * 3600 + m * 60 + s);
      }
    }

    return {
      videoUrl,
      clickThroughUrl,
      title,
      durationSeconds,
    };
  } catch {
    return null;
  }
}

export async function fetchVastAd(vastUrl: string): Promise<ParsedVastAd | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s network cap on 2G/3G

    const response = await fetch(vastUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/xml, text/xml',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const xml = await response.text();
    return parseVastXml(xml);
  } catch {
    return null;
  }
}
