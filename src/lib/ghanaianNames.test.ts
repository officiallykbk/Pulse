import { describe, expect, it } from 'vitest';
import { createUsernameSuggestions } from './ghanaianNames';

describe('createUsernameSuggestions', () => {
  it('does not suggest an Akan day name before the user selects a birth weekday', () => {
    expect(createUsernameSuggestions({ style: 'traditional' })).toEqual([]);
  });

  it('suggests only names belonging to the explicitly selected Akan weekday', () => {
    const suggestions = createUsernameSuggestions({ style: 'traditional', birthWeekday: 'Friday' });

    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((name) => /^(Swift|Digital|Bright|Golden|Chill|Bold)(Kofi|Afia)$/.test(name))).toBe(true);
  });

  it('generates three distinct modern and global suggestions', () => {
    const modern = createUsernameSuggestions({ style: 'ghanaian' });
    const global = createUsernameSuggestions({ style: 'global' });

    expect(modern).toHaveLength(3);
    expect(global).toHaveLength(3);
    expect(new Set(modern).size).toBe(3);
    expect(new Set(global).size).toBe(3);
    expect(modern.every((name) => /^(Chill|Sharp|Bold|Fresh|Wavy|Easy|Groovy|Bright|Jolly)(Cocoa|Coast|Highlife|Market|Drummer|Baobab|Dancer|Wave|Ɔsono|Ananse|Gyata|Adanko|Opuro|Bonsu|Akokɔ|Kwae|Kurow|Beaeɛ|Baabi|Asubɔnten)$/.test(name))).toBe(true);
    expect(global.every((name) => /^(Pixel|Neon|Cloud|Nova|Turbo|Cosmic|Byte|Echo)(Creator|Maker|Studio|Loop|Spark|Frame|Motion|Signal)$/.test(name))).toBe(true);
  });

  it('uses the researched Twi animal and place vocabulary in Modern suggestions', () => {
    const suggestions = createUsernameSuggestions({ style: 'ghanaian', count: 1000 });

    for (const word of ['Ɔsono', 'Ananse', 'Gyata', 'Adanko', 'Opuro', 'Bonsu', 'Akokɔ']) {
      expect(suggestions.some((suggestion) => suggestion.endsWith(word))).toBe(true);
    }
    for (const word of ['Kwae', 'Kurow', 'Beaeɛ', 'Baabi', 'Asubɔnten']) {
      expect(suggestions.some((suggestion) => suggestion.endsWith(word))).toBe(true);
    }
  });
});