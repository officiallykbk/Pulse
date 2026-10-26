import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';

export function useFollow(targetId: string | null | undefined) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!targetId) {
      setFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetId)
        .maybeSingle();
      if (!cancelled) setFollowing(!!data);
    })();
    return () => { cancelled = true; };
  }, [targetId]);

  const toggleFollow = useCallback(async (): Promise<{ error: string | null }> => {
    if (!targetId) return { error: 'No creator to follow' };
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return { error: 'Sign in to follow creators' };
    }
    if (following) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetId);
      if (!error) setFollowing(false);
      setBusy(false);
      return { error: error?.message ?? null };
    }
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: targetId });
    if (!error) setFollowing(true);
    setBusy(false);
    return { error: error?.message ?? null };
  }, [targetId, following]);

  return { following, busy, toggleFollow };
}
