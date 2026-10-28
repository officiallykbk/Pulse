import { parseCookies, getCookieNames, isSecureContext, serializeCookie } from '../../_lib/cookies';
import { generateCsrfToken } from '../../_lib/csrf';
import { jsonResponse, errorResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Authentication service unavailable', 503);
  }

  const session = await resolveSession(request, env);
  const cookies = parseCookies(request);
  const hostNames = getCookieNames(true);
  const plainNames = getCookieNames(false);

  let csrfToken = cookies[hostNames.csrf] || cookies[plainNames.csrf] || null;
  const cookieHeaders = [...session.newCookies];

  if (session.user && !csrfToken) {
    csrfToken = generateCsrfToken();
    const isSecure = isSecureContext(request);
    const names = getCookieNames(isSecure);
    cookieHeaders.push(
      serializeCookie(names.csrf, csrfToken, {
        httpOnly: false,
        secure: isSecure,
        sameSite: 'Strict',
        path: '/',
        maxAge: 2592000,
      })
    );
  }

  return jsonResponse(
    {
      user: session.user,
      tier: session.tier,
      csrfToken: session.user ? csrfToken : null,
    },
    200,
    {},
    cookieHeaders
  );
}
