import { useState, useEffect, useRef, useMemo } from 'react';
import { Hash } from 'lucide-react';
import {
  fetchTrendingHashtagsFromDb,
  searchHashtags,
  extractHashtags,
  normalizeTag,
  DEFAULT_POPULAR_HASHTAGS,
} from '@/services/hashtagService';

interface SmartHashtagInputProps {
  description: string;
  onChangeDescription: (value: string) => void;
  title?: string;
  disabled?: boolean;
}

export function SmartHashtagInput({
  description,
  onChangeDescription,
  disabled = false,
}: SmartHashtagInputProps) {
  const [dbHashtags, setDbHashtags] = useState<string[]>(DEFAULT_POPULAR_HASHTAGS);
  const [autocompleteMatches, setAutocompleteMatches] = useState<string[]>([]);
  const [hashQuery, setHashQuery] = useState<{ query: string; startIndex: number } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch trending hashtags from Supabase on mount
  useEffect(() => {
    let mounted = true;
    fetchTrendingHashtagsFromDb().then((tags) => {
      if (mounted && tags.length > 0) {
        setDbHashtags(tags);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // List of tags already present in the description
  const activeTags = useMemo(() => {
    return new Set(extractHashtags(description));
  }, [description]);

  // Detect # typing for inline autocomplete
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChangeDescription(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastWordMatch = textBeforeCursor.match(/#([a-zA-Z0-9_]*)$/);

    if (lastWordMatch) {
      const query = lastWordMatch[1];
      const startIndex = cursorPos - lastWordMatch[0].length;
      setHashQuery({ query, startIndex });
      const matches = searchHashtags(query, dbHashtags);
      setAutocompleteMatches(matches);
    } else {
      setHashQuery(null);
      setAutocompleteMatches([]);
    }
  };

  // Select autocomplete match
  const selectAutocompleteTag = (rawTag: string) => {
    const tag = normalizeTag(rawTag);
    if (!tag || !hashQuery) return;

    const before = description.slice(0, hashQuery.startIndex);
    const after = description.slice(hashQuery.startIndex + hashQuery.query.length + 1);
    const updated = `${before}#${tag} ${after.trimStart()}`;

    onChangeDescription(updated);
    setHashQuery(null);
    setAutocompleteMatches([]);

    // Refocus textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="video-description-input" className="block text-sm font-medium text-white/90">
          Description & Tags
        </label>
        <span className="text-xs text-white/60">
          {activeTags.size > 0 ? `${activeTags.size} tags added` : 'Type # to add tags'}
        </span>
      </div>

      <div className="relative">
        <textarea
          id="video-description-input"
          ref={textareaRef}
          value={description}
          onChange={handleDescriptionChange}
          rows={3}
          disabled={disabled}
          className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-accent"
          placeholder="What is this video about? Type # to add tags..."
        />

        {/* Inline Autocomplete Dropdown */}
        {hashQuery && autocompleteMatches.length > 0 && (
          <div
            data-testid="hashtag-autocomplete-dropdown"
            className="absolute left-2 bottom-full mb-1 z-30 w-56 overflow-hidden rounded-xl border border-white/15 bg-[#181818] shadow-2xl backdrop-blur-md"
          >
            <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Matching Hashtags
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {autocompleteMatches.map((match) => (
                <button
                  key={match}
                  type="button"
                  onClick={() => selectAutocompleteTag(match)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                >
                  <Hash className="h-3 w-3 text-accent" />
                  <span>{match}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
