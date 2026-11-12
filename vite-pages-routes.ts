export interface MatchedPagesRoute {
  modulePath: string;
  params: Record<string, string | string[]>;
}

const STATIC_ROUTES: Record<string, string> = {
  '/api/age/verify': './functions/api/age/verify.ts',
  '/api/age/declare': './functions/api/age/declare.ts',
  '/api/age/status': './functions/api/age/status.ts',
  '/api/auth/sign-in': './functions/api/auth/sign-in.ts',
  '/api/auth/sign-up': './functions/api/auth/sign-up.ts',
  '/api/auth/sign-out': './functions/api/auth/sign-out.ts',
  '/api/auth/session': './functions/api/auth/session.ts',
  '/api/auth/adopt': './functions/api/auth/adopt.ts',
  '/api/telemetry/event': './functions/api/telemetry/event.ts',
  '/api/uploads/sign': './functions/api/uploads/sign.ts',
  '/api/reports/submit': './functions/api/reports/submit.ts',
  '/api/payments/verify': './functions/api/payments/verify.ts',
  '/api/sync/anonymous': './functions/api/sync/anonymous.ts',
};

export function matchPagesRoute(pathname: string): MatchedPagesRoute | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (STATIC_ROUTES[normalized]) {
    return { modulePath: STATIC_ROUTES[normalized], params: {} };
  }

  const streamMatch = normalized.match(/^\/api\/media\/stream\/([^/]+)$/);
  if (streamMatch) {
    return {
      modulePath: './functions/api/media/stream/[id].ts',
      params: { id: decodeURIComponent(streamMatch[1]) },
    };
  }

  const restrictedMatch = normalized.match(/^\/api\/media\/restricted\/([^/]+)$/);
  if (restrictedMatch) {
    return {
      modulePath: './functions/api/media/restricted/[id].ts',
      params: { id: decodeURIComponent(restrictedMatch[1]) },
    };
  }

  if (normalized.startsWith('/api/supabase/')) {
    const suffix = normalized.slice('/api/supabase/'.length);
    const segments = suffix ? suffix.split('/') : [];
    return {
      modulePath: './functions/api/supabase/[[path]].ts',
      params: { path: segments },
    };
  }

  if (normalized.startsWith('/media/')) {
    const suffix = normalized.slice('/media/'.length);
    const segments = suffix ? suffix.split('/') : [];
    return {
      modulePath: './functions/media/[[path]].ts',
      params: { path: segments },
    };
  }

  return null;
}
