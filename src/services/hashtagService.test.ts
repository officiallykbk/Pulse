import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractHashtags,
  normalizeTag,
  getSmartHashtags,
  searchHashtags,
  fetchTrendingHashtagsFromDb,
} from './hashtagService';

const mockVideos = [
  { title: 'Dance challenge', description: 'Fun dance in Accra #afrobeats #dance #accra' },
  { title: 'Kumasi Food', description: 'Best street food #food #streetfood #kumasi #accra' },
];

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: mockVideos,
              error: null,
            }),
          })),
        })),
      })),
    })),
  },
}));

describe('hashtagService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts unique hashtags from text', () => {
    const text = 'Testing #pulse and #Ghana with #PULSE and #viral!';
    const tags = extractHashtags(text);
    expect(tags).toEqual(['pulse', 'ghana', 'viral']);
  });

  it('normalizes tags by removing symbols and hashes', () => {
    expect(normalizeTag('##Afrobeats!')).toBe('afrobeats');
    expect(normalizeTag('#food_market')).toBe('food_market');
  });

  it('generates smart keyword suggestions based on video title', () => {
    const title = 'Kumasi Food Market';
    const suggestions = getSmartHashtags(title, 'Some description without tags');

    expect(suggestions).toContain('food');
    expect(suggestions).toContain('market');
    expect(suggestions).toContain('kumasi');
  });

  it('excludes tags that are already in the description', () => {
    const title = 'Kumasi Food Market';
    const description = 'Visiting the market #food #kumasi';
    const suggestions = getSmartHashtags(title, description);

    expect(suggestions).not.toContain('food');
    expect(suggestions).not.toContain('kumasi');
    expect(suggestions).toContain('market');
  });

  it('searches and autocompletes matching hashtags', () => {
    const pool = ['afrobeats', 'accra', 'dance', 'comedy'];
    const results = searchHashtags('ac', pool);

    expect(results).toContain('accra');
    expect(results).not.toContain('dance');
  });

  it('allows custom typed hashtags not present in pool', () => {
    const pool = ['pulse', 'viral'];
    const results = searchHashtags('myuniquetag', pool);

    expect(results).toContain('myuniquetag');
  });

  it('fetches and sorts trending hashtags from database videos', async () => {
    const trending = await fetchTrendingHashtagsFromDb();
    expect(trending).toContain('accra');
    expect(trending).toContain('food');
    expect(trending).toContain('afrobeats');
  });
});
