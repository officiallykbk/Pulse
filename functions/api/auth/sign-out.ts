import { parseCookies, getCookieNames, isSecureContext, buildClearAuthCookieHeaders } from '../../_lib/cookies';
import { verifyOrigin } from '../../_lib/csrf';
import { jsonResponse, errorResponse } from '../../_lib/http';
import { supabaseRevokeToken } from '../../_lib/supabaseAuth';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (!verifyOrigin(request)) {
    return errorResponse('Invalid origin', 403);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const isSecure = isSecureContext(request);

  if (supabaseUrl && anonKey) {
    const cookies = parseCookies(request);
    const hostNames = getCookieNames(true);
    const plainNames = getCookieNames(false);
    const accessToken = cookies[hostNames.access] || cookies[plainNames.access];
    if (accessToken) {
      await supabaseRevokeToken(supabaseUrl, anonKey, accessToken);
    }
  }

  const clearHeaders = buildClearAuthCookieHeaders(isSecure);

  return jsonResponse(
    { success: true },
    200,
    {},
    clearHeaders
  );
}
