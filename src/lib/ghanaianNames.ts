import words from './usernameWords.json';

export type UsernameStyle = 'traditional' | 'ghanaian' | 'global';

export const AKAN_NAME_DAYS = words.days;

export interface UsernameSuggestionOptions {
  style: UsernameStyle;
  count?: number;
  exclude?: string[];
  birthWeekday?: string;
}

function shuffled(values: string[]): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Suggest names within the user's chosen style. Akan day names are only included
 * when the user explicitly selects a weekday; no birth date is collected.
 */
export function createUsernameSuggestions({
  style,
  count = 3,
  exclude = [],
  birthWeekday,
}: UsernameSuggestionOptions): string[] {
  const excluded = new Set(exclude.map((name) => name.trim().toLowerCase()));
  let combinations: string[];

  if (style === 'traditional') {
    const day = words.days.find((entry) => entry.day === birthWeekday);
    if (!day) return [];
    combinations = words.adjectives.traditional.flatMap((adjective) => [
      `${adjective}${day.masculine}`,
      `${adjective}${day.feminine}`,
    ]);
  } else {
    const nouns = style === 'ghanaian'
      ? [...words.nouns.ghanaian, ...words.twiNouns.animals, ...words.twiNouns.places]
      : words.nouns.global;
    combinations = words.adjectives[style].flatMap((adjective) =>
      nouns.map((noun) => `${adjective}${noun}`),
    );
  }

  const results: string[] = [];
  for (const suggestion of shuffled(combinations)) {
    if (excluded.has(suggestion.toLowerCase())) continue;
    results.push(suggestion);
    if (results.length >= count) break;
  }
  return results;
}