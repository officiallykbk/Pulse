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

  it('correctly extracts impression, quartile, and skip tracking beacons from VAST XML', () => {
    const trackingVast = `
      <VAST version="3.0">
        <Ad id="ad-202">
          <InLine>
            <AdTitle>Tracked Video Ad</AdTitle>
            <Impression>https://tracker.example.com/impression</Impression>
            <Creatives>
              <Creative>
                <Linear>
                  <Duration>00:00:30</Duration>
                  <TrackingEvents>
                    <Tracking event="start">https://tracker.example.com/start</Tracking>
                    <Tracking event="firstQuartile">https://tracker.example.com/q1</Tracking>
                    <Tracking event="midpoint">https://tracker.example.com/mid</Tracking>
                    <Tracking event="thirdQuartile">https://tracker.example.com/q3</Tracking>
                    <Tracking event="complete">https://tracker.example.com/complete</Tracking>
                    <Tracking event="skip">https://tracker.example.com/skip</Tracking>
                  </TrackingEvents>
                  <VideoClicks>
                    <ClickThrough>https://sponsor.example.com/offer</ClickThrough>
                    <ClickTracking>https://tracker.example.com/click</ClickTracking>
                  </VideoClicks>
                  <MediaFiles>
                    <MediaFile type="video/mp4">https://cdn.example.com/video.mp4</MediaFile>
                  </MediaFiles>
                </Linear>
              </Creative>
            </Creatives>
          </InLine>
        </Ad>
      </VAST>
    `;

    const parsed = parseVastXml(trackingVast);
    expect(parsed).not.toBeNull();
    expect(parsed?.trackingUrls?.impressions).toContain('https://tracker.example.com/impression');
    expect(parsed?.trackingUrls?.start).toContain('https://tracker.example.com/start');
    expect(parsed?.trackingUrls?.firstQuartile).toContain('https://tracker.example.com/q1');
    expect(parsed?.trackingUrls?.midpoint).toContain('https://tracker.example.com/mid');
    expect(parsed?.trackingUrls?.thirdQuartile).toContain('https://tracker.example.com/q3');
    expect(parsed?.trackingUrls?.complete).toContain('https://tracker.example.com/complete');
    expect(parsed?.trackingUrls?.skip).toContain('https://tracker.example.com/skip');
    expect(parsed?.trackingUrls?.clickTracking).toContain('https://tracker.example.com/click');
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
