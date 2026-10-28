import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  sessionService,
  type SessionModule,
  type SessionSnapshot,
  type SessionUser,
  type AuthResult,
} from '@/services/session';
import type { UserTier } from '@/types';

export interface SessionContextValue {
  user: SessionUser | null;
  tier: UserTier;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<SessionSnapshot>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: React.ReactNode;
  service?: SessionModule;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({
  children,
  service = sessionService,
}) => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => service.getSnapshot());

  useEffect(() => {
    // 1. Subscribe to reactive session state updates
    const unsubscribe = service.subscribe(() => {
      setSnapshot(service.getSnapshot());
    });

    // 2. Trigger initial session resolution & legacy adoption
    service.bootstrap().catch((err) => {
      console.error('Session bootstrap error:', err);
    });

    return unsubscribe;
  }, [service]);

  const signIn = useCallback(
    (email: string, password: string) => service.signIn(email, password),
    [service]
  );

  const signUp = useCallback(
    (email: string, password: string) => service.signUp(email, password),
    [service]
  );

  const signOut = useCallback(() => service.signOut(), [service]);

  const refreshSession = useCallback(() => service.bootstrap(), [service]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user: snapshot.user,
      tier: snapshot.tier,
      loading: snapshot.loading,
      error: snapshot.error,
      signIn,
      signUp,
      signOut,
      refreshSession,
    }),
    [snapshot, signIn, signUp, signOut, refreshSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    // Fallback if rendered outside provider: read synchronously from service
    const snap = sessionService.getSnapshot();
    return {
      user: snap.user,
      tier: snap.tier,
      loading: snap.loading,
      error: snap.error,
      signIn: (email, pass) => sessionService.signIn(email, pass),
      signUp: (email, pass) => sessionService.signUp(email, pass),
      signOut: () => sessionService.signOut(),
      refreshSession: () => sessionService.bootstrap(),
    };
  }
  return context;
}
