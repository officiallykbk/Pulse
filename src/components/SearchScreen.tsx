import { useState, useCallback, useEffect } from 'react';
import { Search, X, ArrowLeft, Eye, Heart } from 'lucide-react';
import { supabase } from '@/services/supabase';
import type { Video } from '@/types';

interface SearchScreenProps {
  onBack: () => void;
  onPlayVideo: (video: Video) => void;
}

export function SearchScreen({ onBack, onPlayVideo }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = useCallback(async (q: string, signal: AbortSignal) => {
    const trimmed = q.trim().replace(/[%_(),]/g, ' ').trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);

    const escaped = trimmed.replace(/'/g, "''");
    const { data, error } = await supabase
      .from('videos')
      .select(
        'id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, view_count, like_count, comment_count, share_count, created_at'
      )
      .eq('is_active', true)
      .or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order('created_at', { ascending: false })
      .limit(30)
      .abortSignal(signal);

    if (signal.aborted) return;
    if (!error && data) {
      setResults(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (query.trim()) {
        performSearch(query, controller.signal);
      } else {
        setResults([]);
        setSearched(false);
      }
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, performSearch]);

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="min-h-full bg-black px-4 pt-6 pb-24">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Search</h1>
        </div>

        <div className="mb-4 flex items-center rounded-lg bg-surface-raised px-3 ring-1 ring-white/10 focus-within:ring-accent">
          <Search className="h-4 w-4 text-white/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent px-3 py-3 text-white placeholder-white/30 outline-none"
            placeholder="Search videos..."
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
                setSearched(false);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"
            >
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-white/50">No videos found for "{query}"</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            <p className="mb-2 text-xs text-white/40">{results.length} result{results.length !== 1 ? 's' : ''}</p>
            {results.map((video) => (
              <button
                key={video.id}
                onClick={() => onPlayVideo(video)}
                className="flex w-full items-center gap-3 rounded-lg bg-surface-raised p-2 text-left transition-colors active:bg-surface-elevated"
              >
                <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-md bg-surface-elevated">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Eye className="h-5 w-5 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-white">{video.title}</h3>
                  {video.description && (
                    <p className="truncate text-xs text-white/50">{video.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {formatCount(video.view_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatCount(video.like_count)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && !searched && (
          <div className="py-12 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-white/15" />
            <p className="text-sm text-white/30">Search for videos by title or description</p>
          </div>
        )}
      </div>
    </div>
  );
}
