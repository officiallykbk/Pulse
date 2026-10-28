import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchScreen } from '@/components/SearchScreen';
import { makeVideo } from '@/test/helpers';

const state = vi.hoisted(() => ({
  matches: [] as Array<{ id: string; relevance: number }>,
  videos: [] as ReturnType<typeof makeVideo>[],
  rpc: vi.fn(),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => ({ abortSignal: () => state.rpc(...args) }),
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        in: () => builder,
        eq: () => builder,
        abortSignal: () => builder,
        then: (resolve: (value: unknown) => void) => resolve({ data: state.videos, error: null }),
      };
      return builder;
    },
  },
}));

describe('SearchScreen', () => {
  beforeEach(() => {
    state.matches = [];
    state.videos = [];
    state.rpc.mockReset().mockImplementation(async () => ({ data: state.matches, error: null }));
  });

  it('uses the public full-text search RPC, then renders results in relevance order', async () => {
    const user = userEvent.setup();
    const first = makeVideo({ id: 'first', title: 'First match' });
    const second = makeVideo({ id: 'second', title: 'Second match' });
    state.matches = [{ id: 'second', relevance: 0.9 }, { id: 'first', relevance: 0.5 }];
    state.videos = [first, second];
    const onPlayVideo = vi.fn();
    render(<SearchScreen onBack={vi.fn()} onPlayVideo={onPlayVideo} />);

    await user.type(screen.getByPlaceholderText('Search videos...'), 'comedy tutorial');
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('search_public_videos', {
      search_query: 'comedy tutorial',
      result_limit: 30,
    }));
    expect(screen.getAllByRole('button').map((button) => button.textContent).join(' ')).toContain('Second match');
    await user.click(screen.getByRole('button', { name: /First match/ }));
    expect(onPlayVideo).toHaveBeenCalledWith(first);
  });

  it('shows a no-results message for a successful empty search', async () => {
    const user = userEvent.setup();
    render(<SearchScreen onBack={vi.fn()} onPlayVideo={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Search videos...'), 'unmatched phrase');
    expect(await screen.findByText('No videos found for "unmatched phrase"')).toBeInTheDocument();
  });
});
