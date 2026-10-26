import { describe, it, expect } from 'vitest';
import { determineDimensions, getAbrLadder, buildMasterPlaylist } from '../ladder.js';

describe('ABR Ladder & Playlist Generator', () => {
  it('correctly classifies portrait vs landscape orientation', () => {
    const portrait = determineDimensions(720, 1280);
    expect(portrait.isPortrait).toBe(true);
    expect(portrait.aspectRatio).toBe('9:16');

    const landscape = determineDimensions(1920, 1080);
    expect(landscape.isPortrait).toBe(false);
    expect(landscape.aspectRatio).toBe('16:9');
  });

  it('builds a 4-tier portrait ladder for mobile devices', () => {
    const ladder = getAbrLadder(true);
    expect(ladder).toHaveLength(4);

    const names = ladder.map((v) => v.name);
    expect(names).toEqual(['240p', '360p', '480p', '720p']);

    // Check 240p tier optimization for 2G/EDGE networks
    const v240 = ladder[0];
    expect(v240.width).toBe(240);
    expect(v240.height).toBe(426);
    expect(v240.videoBitrate).toBe('250k');
    expect(v240.h264Profile).toBe('baseline');

    // Check 720p tier for high-end / Wi-Fi
    const v720 = ladder[3];
    expect(v720.width).toBe(720);
    expect(v720.height).toBe(1280);
    expect(v720.videoBitrate).toBe('1200k');
  });

  it('generates a valid HLS master playlist with EXT-X-STREAM-INF tags', () => {
    const ladder = getAbrLadder(true);
    const playlist = buildMasterPlaylist(ladder);

    expect(playlist).toContain('#EXTM3U');
    expect(playlist).toContain('#EXT-X-VERSION:4');
    expect(playlist).toContain('#EXT-X-INDEPENDENT-SEGMENTS');

    // Check each stream entry
    for (const v of ladder) {
      expect(playlist).toContain(`RESOLUTION=${v.width}x${v.height}`);
      expect(playlist).toContain(`NAME="${v.name}"`);
      expect(playlist).toContain(`${v.name}/index.m3u8`);
    }
  });
});
