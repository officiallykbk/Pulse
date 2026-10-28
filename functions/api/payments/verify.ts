import { verifyCsrf } from '../../_lib/csrf';
import { errorResponse, jsonResponse } from '../../_lib/http';
import { resolveSession } from '../../_lib/session';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Payment gateway unavailable', 503);
  }

  // 1. Authenticate session from HttpOnly cookies FIRST
  const session = await resolveSession(request, env);
  if (!session.user || !session.accessToken) {
    return errorResponse('Sign in first to complete your subscription', 401);
  }

  // 2. Verify CSRF & Origin
  const csrfCheck = verifyCsrf(request);
  if (!csrfCheck.valid) {
    return errorResponse(csrfCheck.reason || 'Invalid CSRF token', 403);
  }

  // 3. Parse payment payload
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return errorResponse('Invalid JSON payload', 400);
  }

  // 4. Forward to the existing verifypayment Supabase Edge Function
  try {
    const edgeEndpoint = new URL('/functions/v1/verifypayment', supabaseUrl);
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('apikey', anonKey);
    headers.set('Authorization', `Bearer ${session.accessToken}`);

    const upstreamRes = await fetch(edgeEndpoint.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const body = await upstreamRes.json().catch(() => ({})) as Record<string, unknown>;

    if (!upstreamRes.ok) {
      const errorMsg = typeof body.error === 'string'
        ? body.error
        : `Payment verification failed (${upstreamRes.status})`;
      return errorResponse(errorMsg, upstreamRes.status, {}, session.newCookies);
    }

    // 5. Return sanitized response (only payment status / checkout fields, NO tokens)
    return jsonResponse(
      {
        ok: body.success === true || body.ok === true || !!body.url,
        success: body.success === true || !!body.url,
        alreadyVerified: body.alreadyVerified === true,
        expiresAt: body.expiresAt || null,
        url: body.url || null,
        sessionId: body.sessionId || null,
      },
      200,
      {},
      session.newCookies
    );
  } catch (err) {
    return errorResponse('Payment processing failed. Please try again.', 502);
  }
}
