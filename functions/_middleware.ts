import { SECURITY_HEADERS } from './_lib/http';

export async function onRequest(context: { next: () => Promise<Response> }): Promise<Response> {
  const response = await context.next();
  const headers = new Headers(response.headers);

  for (const [key, val] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, val);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
