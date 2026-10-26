import { describe, it, expect } from 'vitest';
import { parseVastXml } from './vast';

describe('VAST XML Parser', () => {
  it('correctly parses video media file and click-through from valid VAST 3.0 XML', () => {
    const sampleVast = `
      <VAST version="3.0">
        <Ad id="ad-101">
          <InLine>
            <AdTitle>Pulse Sponsor Reel</AdTitle>
            <Creatives>
              <Creative>
                <Linear>
                  <Duration>00:00:15</Duration>
                  <VideoClicks>
                    <ClickThrough>https://sponsor.example.com/landing</ClickThrough>
                  </VideoClicks>
                  <MediaFiles>
                    <MediaFile delivery="progressive" type="video/mp4" width="720" height="1280">
                      https://cdn.example.com/ads/video_720p.mp4
                    </MediaFile>
                  </MediaFiles>
                </Linear>
              </Creative>
            </Creatives>
          </InLine>
        </Ad>
      </VAST>
    `;

    const parsed = parseVastXml(sampleVast);
    expect(parsed).not.toBeNull();
    expect(parsed?.videoUrl).toBe('https://cdn.example.com/ads/video_720p.mp4');
    expect(parsed?.clickThroughUrl).toBe('https://sponsor.example.com/landing');
    expect(parsed?.title).toBe('Pulse Sponsor Reel');
    expect(parsed?.durationSeconds).toBe(15);
  });

  it('returns null for empty or non-fill VAST response', () => {
    const emptyVast = '<VAST version="3.0"></VAST>';
    const parsed = parseVastXml(emptyVast);
    expect(parsed).toBeNull();
  });

  it('returns null for malformed XML without throwing errors', () => {
    const badXml = '<VAST version="3.0"><Ad><unclosed></VAST>';
    const parsed = parseVastXml(badXml);
    expect(parsed).toBeNull();
  });
});
