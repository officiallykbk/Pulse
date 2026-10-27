import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SmartHashtagInput } from '@/components/SmartHashtagInput';
import * as hashtagService from '@/services/hashtagService';

describe('SmartHashtagInput Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(hashtagService, 'fetchTrendingHashtagsFromDb').mockResolvedValue([
      '#pulse',
      '#viral',
      '#ghana',
      '#accra',
      '#afrobeats',
      '#comedy',
      '#dance',
    ]);
  });

  it('renders textarea with initial description, label, and tag count', () => {
    const handleChange = vi.fn();
    render(
      <SmartHashtagInput
        description="Check this out #pulse"
        onChangeDescription={handleChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/What is this video about/i) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Check this out #pulse');
    expect(screen.getByText('1 tags added')).toBeInTheDocument();
  });

  it('allows users to freely type any custom hashtags', () => {
    let currentDesc = '';
    const handleChange = vi.fn((val: string) => {
      currentDesc = val;
    });

    const { rerender } = render(
      <SmartHashtagInput
        description={currentDesc}
        onChangeDescription={handleChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/What is this video about/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Enjoying jollof #ghanaianjollof #customfood' } });

    expect(handleChange).toHaveBeenCalledWith('Enjoying jollof #ghanaianjollof #customfood');

    rerender(
      <SmartHashtagInput
        description="Enjoying jollof #ghanaianjollof #customfood"
        onChangeDescription={handleChange}
      />
    );

    expect(screen.getByText('2 tags added')).toBeInTheDocument();
  });

  it('shows inline autocomplete dropdown when typing # with query and completes selected tag', async () => {
    let currentDesc = 'Vibing ';
    const handleChange = vi.fn((newVal: string) => {
      currentDesc = newVal;
    });

    render(
      <SmartHashtagInput
        description={currentDesc}
        onChangeDescription={handleChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/What is this video about/i) as HTMLTextAreaElement;

    // Simulate typing #af
    fireEvent.change(textarea, { target: { value: 'Vibing #af', selectionStart: 10 } });

    await waitFor(() => {
      expect(screen.getByTestId('hashtag-autocomplete-dropdown')).toBeInTheDocument();
      expect(screen.getByText('Matching Hashtags')).toBeInTheDocument();
    });

    // Click autocomplete suggestion within dropdown
    const dropdown = screen.getByTestId('hashtag-autocomplete-dropdown');
    const suggestionBtn = within(dropdown).getByRole('button', { name: /afrobeats/i });
    fireEvent.click(suggestionBtn);

    expect(handleChange).toHaveBeenCalledWith('Vibing #afrobeats ');
  });
});
