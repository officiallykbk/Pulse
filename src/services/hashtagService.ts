import { supabase } from '@/services/supabase';

// High-frequency curated defaults popular across short-video platforms and African creators
export const DEFAULT_POPULAR_HASHTAGS = [
  'pulse',
  'viral',
  'ghana',
  'afrobeats',
  'comedy',
  'trending',
  'music',
  'dance',
  'food',
  'streetfood',
  'accra',
  'kumasi',
  'lifestyle',
  'entertainment',
  'funny',
  'shorts',
];

// Keyword to hashtag associations for smart context-aware suggestions
const KEYWORD_MAP: Record<string, string[]> = {
  food: ['food', 'streetfood', 'ghanafood', 'jollof', 'cooking', 'delicious'],
  market: ['market', 'streetfood', 'local', 'kumasi', 'accra'],
  dance: ['dance', 'afrobeats', 'dancer', 'choreography', 'challenge'],
  music: ['music', 'afrobeats', 'sound', 'newsong', 'beats', 'viraltrack'],
  song: ['music', 'afrobeats', 'newsong', 'trendingmusic'],
  comedy: ['comedy', 'funny', 'ghcomedy', 'laugh', 'humor', 'skit'],
  funny: ['funny', 'comedy', 'lol', 'laugh', 'hilarious'],
  skit: ['skit', 'comedy', 'actor', 'ghcomedy'],
  sunset: ['sunset', 'nature', 'travel', 'scenery', 'ghana'],
  bridge: ['scenery', 'travel', 'ghana', 'architecture'],
  accra: ['accra', 'ghana', 'visitghana', 'citylife'],
  kumasi: ['kumasi', 'ashanti', 'ghana', 'culture'],
  volta: ['volta', 'travel', 'ghana', 'nature'],
  fashion: ['fashion', 'style', 'outfit', 'drip', 'beauty'],
  beauty: ['beauty', 'skincare', 'makeup', 'glam'],
  football: ['football', 'soccer', 'sports', 'blackstars'],
  sports: ['sports', 'football', 'fitness', 'workout'],
  gym: ['fitness', 'workout', 'gym', 'health'],
  church: ['gospel', 'praise', 'worship', 'faith'],
  tech: ['tech', 'gadgets', 'technology', 'innovation'],
};

/**
 * Extracts unique hashtag strings (without '#') from text
 */
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/#([a-zA-Z0-9_]+)/g);
  if (!matches) return [];
  const tags = matches.map((t) => t.slice(1).toLowerCase());
  return Array.from(new Set(tags));
}

/**
 * Normalizes a hashtag: removes leading '#', spaces, and special characters
 */
export function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

/**
 * Fetches recent popular hashtags dynamically from active videos in Supabase
 */
let cachedDbHashtags: string[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export async function fetchTrendingHashtagsFromDb(): Promise<string[]> {
  const now = Date.now();
  if (cachedDbHashtags && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedDbHashtags;
  }

  try {
    const { data, error } = await supabase
      .from('videos')
      .select('description, title')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      cachedDbHashtags = DEFAULT_POPULAR_HASHTAGS;
      lastCacheTime = now;
      return DEFAULT_POPULAR_HASHTAGS;
    }

    const counts = new Map<string, number>();

    // Count hashtag frequencies across video descriptions and titles
    for (const row of data) {
      const text = `${row.title || ''} ${row.description || ''}`;
      const tags = extractHashtags(text);
      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }

    // Sort by frequency
    const sortedDbTags = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    // Merge with defaults so we always have a strong, relevant set
    const merged = Array.from(new Set([...sortedDbTags, ...DEFAULT_POPULAR_HASHTAGS]));
    cachedDbHashtags = merged.slice(0, 30);
    lastCacheTime = now;
    return cachedDbHashtags;
  } catch {
    return DEFAULT_POPULAR_HASHTAGS;
  }
}

/**
 * Generates smart hashtag recommendations based on title keywords and DB trending list
 */
export function getSmartHashtags(
  title: string,
  currentDescription: string,
  availableDbTags: string[] = DEFAULT_POPULAR_HASHTAGS
): string[] {
  const currentTags = new Set(extractHashtags(currentDescription));
  const suggested = new Set<string>();

  // 1. Prioritize direct title words first
  const words = title.toLowerCase().split(/[\s,._-]+/);
  for (const word of words) {
    const cleanWord = normalizeTag(word);
    if (cleanWord.length >= 3 && !currentTags.has(cleanWord)) {
      suggested.add(cleanWord);
    }
  }

  // 2. Expand with keyword synonyms
  for (const word of words) {
    if (KEYWORD_MAP[word]) {
      for (const tag of KEYWORD_MAP[word]) {
        if (!currentTags.has(tag)) {
          suggested.add(tag);
        }
      }
    }
  }

  // 3. Add trending DB hashtags that aren't already included
  for (const tag of availableDbTags) {
    if (!currentTags.has(tag.toLowerCase())) {
      suggested.add(tag.toLowerCase());
      if (suggested.size >= 15) break;
    }
  }

  return Array.from(suggested).slice(0, 15);
}

/**
 * Matches hashtag autocomplete query (e.g. typing '#afro' -> ['afrobeats', ...])
 */
export function searchHashtags(
  query: string,
  pool: string[] = DEFAULT_POPULAR_HASHTAGS
): string[] {
  const clean = normalizeTag(query);
  if (!clean) return pool.slice(0, 8);

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const tag of pool) {
    const t = tag.toLowerCase();
    if (t === clean) continue;
    if (t.startsWith(clean)) {
      startsWith.push(t);
    } else if (t.includes(clean)) {
      contains.push(t);
    }
  }

  // Include the exact typed query as first option if valid
  const result: string[] = [];
  if (clean.length >= 2) {
    result.push(clean);
  }

  return Array.from(new Set([...result, ...startsWith, ...contains])).slice(0, 6);
}
