export interface LadderVariant {
  name: string;             // e.g. '240p'
  width: number;            // 240 or 426 depending on orientation
  height: number;           // 426 or 240 depending on orientation
  videoBitrate: string;     // e.g. '250k'
  maxRate: string;          // e.g. '300k'
  bufSize: string;          // e.g. '500k'
  audioBitrate: string;     // e.g. '64k'
  h264Profile: string;      // 'baseline' | 'main'
  bandwidth: number;        // in bps for EXT-X-STREAM-INF
}

export interface VideoDimensions {
  width: number;
  height: number;
  isPortrait: boolean;
  aspectRatio: string;
}

export function determineDimensions(sourceWidth: number, sourceHeight: number): VideoDimensions {
  const isPortrait = sourceHeight >= sourceWidth;
  const ratio = (sourceWidth / sourceHeight).toFixed(2);
  const aspectRatio = isPortrait ? '9:16' : '16:9';

  return {
    width: sourceWidth,
    height: sourceHeight,
    isPortrait,
    aspectRatio,
  };
}

export function getAbrLadder(isPortrait: boolean): LadderVariant[] {
  if (isPortrait) {
    // 9:16 portrait video for mobile short-videos
    return [
      {
        name: '240p',
        width: 240,
        height: 426,
        videoBitrate: '250k',
        maxRate: '300k',
        bufSize: '500k',
        audioBitrate: '64k',
        h264Profile: 'baseline',
        bandwidth: 320000,
      },
      {
        name: '360p',
        width: 360,
        height: 640,
        videoBitrate: '450k',
        maxRate: '550k',
        bufSize: '900k',
        audioBitrate: '64k',
        h264Profile: 'main',
        bandwidth: 550000,
      },
      {
        name: '480p',
        width: 480,
        height: 854,
        videoBitrate: '800k',
        maxRate: '950k',
        bufSize: '1600k',
        audioBitrate: '96k',
        h264Profile: 'main',
        bandwidth: 950000,
      },
      {
        name: '720p',
        width: 720,
        height: 1280,
        videoBitrate: '1200k',
        maxRate: '1400k',
        bufSize: '2400k',
        audioBitrate: '128k',
        h264Profile: 'main',
        bandwidth: 1400000,
      },
    ];
  }

  // 16:9 landscape fallback
  return [
    {
      name: '240p',
      width: 426,
      height: 240,
      videoBitrate: '250k',
      maxRate: '300k',
      bufSize: '500k',
      audioBitrate: '64k',
      h264Profile: 'baseline',
      bandwidth: 320000,
    },
    {
      name: '360p',
      width: 640,
      height: 360,
      videoBitrate: '450k',
      maxRate: '550k',
      bufSize: '900k',
      audioBitrate: '64k',
      h264Profile: 'main',
      bandwidth: 550000,
    },
    {
      name: '480p',
      width: 854,
      height: 480,
      videoBitrate: '800k',
      maxRate: '950k',
      bufSize: '1600k',
      audioBitrate: '96k',
      h264Profile: 'main',
      bandwidth: 950000,
    },
    {
      name: '720p',
      width: 1280,
      height: 720,
      videoBitrate: '1200k',
      maxRate: '1400k',
      bufSize: '2400k',
      audioBitrate: '128k',
      h264Profile: 'main',
      bandwidth: 1400000,
    },
  ];
}

/**
 * Builds standard HLS VOD Master Playlist (#EXT-X-STREAM-INF)
 */
export function buildMasterPlaylist(variants: LadderVariant[]): string {
  const lines: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:4',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '',
  ];

  for (const variant of variants) {
    const codecs = variant.h264Profile === 'baseline'
      ? 'avc1.42c01e,mp4a.40.2'
      : 'avc1.4d401f,mp4a.40.2';

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height},CODECS="${codecs}",NAME="${variant.name}"`
    );
    lines.push(`${variant.name}/index.m3u8`);
    lines.push('');
  }

  return lines.join('\n');
}
