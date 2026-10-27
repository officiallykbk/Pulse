/**
 * Lightweight VAST 2.0 / 3.0 / 4.0 XML Parser & Beacon Dispatcher
 * Extracts in-stream video media files, click-through URLs, and tracking beacons from VAST tags.
 * If empty or invalid, fails safely so the player can immediately skip without stalls.
 */

export interface VastTrackingMap {
  impressions: string[];
  start: string[];
  firstQuartile: string[];
  midpoint: string[];
  thirdQuartile: string[];
  complete: string[];
  skip: string[];
  clickTracking: string[];
}

export interface ParsedVastAd {
  videoUrl: string;
  clickThroughUrl?: string;
  title?: string;
  durationSeconds?: number;
  trackingUrls?: VastTrackingMap;
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

    // Extract Tracking Beacons
    const trackingUrls: VastTrackingMap = {
      impressions: [],
      start: [],
      firstQuartile: [],
      midpoint: [],
      thirdQuartile: [],
      complete: [],
      skip: [],
      clickTracking: [],
    };

    // Impressions
    const impressionEls = Array.from(doc.querySelectorAll('Impression'));
    impressionEls.forEach((el) => {
      const url = el.textContent?.trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        trackingUrls.impressions.push(url);
      }
    });

    // Tracking events
    const trackingEls = Array.from(doc.querySelectorAll('Tracking'));
    trackingEls.forEach((el) => {
      const event = el.getAttribute('event')?.toLowerCase();
      const url = el.textContent?.trim();
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;

      if (event === 'start') trackingUrls.start.push(url);
      else if (event === 'firstquartile') trackingUrls.firstQuartile.push(url);
      else if (event === 'midpoint') trackingUrls.midpoint.push(url);
      else if (event === 'thirdquartile') trackingUrls.thirdQuartile.push(url);
      else if (event === 'complete') trackingUrls.complete.push(url);
      else if (event === 'skip' || event === 'closelinear') trackingUrls.skip.push(url);
    });

    // Click tracking
    const clickTrackingEls = Array.from(doc.querySelectorAll('ClickTracking'));
    clickTrackingEls.forEach((el) => {
      const url = el.textContent?.trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        trackingUrls.clickTracking.push(url);
      }
    });

    return {
      videoUrl,
      clickThroughUrl,
      title,
      durationSeconds,
      trackingUrls,
    };
  } catch {
    return null;
  }
}

export function fireTrackingBeacon(urls?: string | string[]): void {
  if (!urls) return;
  const list = Array.isArray(urls) ? urls : [urls];

  list.forEach((url) => {
    if (!url || typeof url !== 'string') return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const sent = navigator.sendBeacon(url);
        if (sent) return;
      }

      if (typeof fetch !== 'undefined') {
        fetch(url, { method: 'GET', mode: 'no-cors', keepalive: true }).catch(() => {
          // Fallback to Image beacon
          if (typeof Image !== 'undefined') {
            const img = new Image();
            img.src = url;
          }
        });
      } else if (typeof Image !== 'undefined') {
        const img = new Image();
        img.src = url;
      }
    } catch {
      // Fire-and-forget; never stall playback if a tracking beacon fails
    }
  });
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
