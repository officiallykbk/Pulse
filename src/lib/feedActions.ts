type Handler = () => void;

const listeners = new Map<string, Set<Handler>>();

function emit(action: string): void {
  const set = listeners.get(action);
  if (set) {
    set.forEach((handler) => handler());
  }
}

function on(action: string, handler: Handler): () => void {
  if (!listeners.has(action)) listeners.set(action, new Set());
  listeners.get(action)!.add(handler);
  return () => {
    listeners.get(action)?.delete(handler);
  };
}

export const feedActions = { emit, on };

export type FeedAction =
  | 'next'
  | 'prev'
  | 'play-pause'
  | 'mute'
  | 'like'
  | 'comments'
  | 'share';
