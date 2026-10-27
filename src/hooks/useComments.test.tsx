import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useComments } from '@/hooks/useComments';

const from = vi.hoisted(() => vi.fn());

vi.mock('@/services/supabase', () => ({
  supabase: {
    from,
    auth: { getUser: vi.fn() },
  },
}));

describe('useComments', () => {
  it('does not query the database while the comments sheet is closed', () => {
    renderHook(() => useComments('video-1', false));
    expect(from).not.toHaveBeenCalled();
  });
});
