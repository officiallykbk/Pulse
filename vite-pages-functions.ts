import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { matchPagesRoute } from './vite-pages-routes';

interface MemoryKvEntry {
  value: string;
  expiresAt?: number;
}

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface PagesFunctionContext {
  request: Request;
  env: Record<string, unknown>;
  params: Record<string, string | string[]>;
}

type PagesHandlerFn = (context: PagesFunctionContext) => Promise<Response> | Response;

interface PagesModule {
  onRequest?: PagesHandlerFn;
  onRequestGet?: PagesHandlerFn;
  onRequestPost?: PagesHandlerFn;
  onRequestPut?: PagesHandlerFn;
  onRequestPatch?: PagesHandlerFn;
  onRequestDelete?: PagesHandlerFn;
  onRequestHead?: PagesHandlerFn;
}

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function createMemoryKv(): KVNamespaceLike {
  const store = new Map<string, MemoryKvEntry>();
  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      const expiresAt =
        options?.expirationTtl !== undefined ? Date.now() + options.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function loadDevVarsFile(rootDir: string): Record<string, string> {
  const varsPath = path.join(rootDir, '.dev.vars');
  if (!existsSync(varsPath)) return {};

  const parsed: Record<string, string> = {};
  const lines = readFileSync(varsPath, 'utf-8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Request payload exceeds dev server limit');
    }
    chunks.push(buf);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function toWebRequest(req: IncomingMessage, body?: Buffer): Request {
  const host = req.headers.host || 'localhost:5173';
  const rawUrl = (req as IncomingMessage & { originalUrl?: string }).originalUrl || req.url || '/';
  const fullUrl = new URL(rawUrl, `http://${host}`);

  const headers = new Headers();
  for (const [key, rawVal] of Object.entries(req.headers)) {
    if (rawVal === undefined) continue;
    if (Array.isArray(rawVal)) {
      for (const item of rawVal) headers.append(key, item);
    } else {
      headers.set(key, rawVal);
    }
  }

  const method = (req.method || 'GET').toUpperCase();
  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = new Uint8Array(body);
  }

  return new Request(fullUrl.toString(), init);
}

function pickMethodHandler(mod: PagesModule, method: string): PagesHandlerFn | null {
  switch (method.toUpperCase()) {
    case 'GET':
      return mod.onRequestGet ?? mod.onRequest ?? null;
    case 'POST':
      return mod.onRequestPost ?? mod.onRequest ?? null;
    case 'PUT':
      return mod.onRequestPut ?? mod.onRequest ?? null;
    case 'PATCH':
      return mod.onRequestPatch ?? mod.onRequest ?? null;
    case 'DELETE':
      return mod.onRequestDelete ?? mod.onRequest ?? null;
    case 'HEAD':
      return mod.onRequestHead ?? mod.onRequestGet ?? mod.onRequest ?? null;
    default:
      return mod.onRequest ?? null;
  }
}

async function writeWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  nodeRes.statusCode = webRes.status;

  const setCookies =
    typeof webRes.headers.getSetCookie === 'function' ? webRes.headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    nodeRes.setHeader('Set-Cookie', setCookies);
  }

  const hasContentEncoding = webRes.headers.has('content-encoding');
  webRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || lower === 'transfer-encoding') return;
    if (hasContentEncoding && (lower === 'content-encoding' || lower === 'content-length')) return;
    nodeRes.setHeader(key, value);
  });

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const buf = Buffer.from(await webRes.arrayBuffer());
  nodeRes.end(buf);
}

/**
 * Vite dev plugin that executes local Cloudflare Pages Functions under `/functions`
 * directly inside `npm run dev` so auth cookies, same-origin Supabase proxy, telemetry,
 * upload signing, age gate endpoints, and `/media/*` streaming work locally.
 */
export function pagesFunctionsDevPlugin(): Plugin {
  return {
    name: 'pulse-pages-functions-dev',
    configureServer(server: ViteDevServer) {
      const rootDir = server.config.root || process.cwd();
      const loaded = {
        ...loadEnv(server.config.mode, rootDir, ''),
        ...loadDevVarsFile(rootDir),
      };

      const runtimeEnv: Record<string, unknown> = {
        ...loaded,
        SUPABASE_URL: loaded.SUPABASE_URL || loaded.VITE_SUPABASE_URL,
        SUPABASE_ANON_KEY: loaded.SUPABASE_ANON_KEY || loaded.VITE_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: loaded.SUPABASE_SERVICE_ROLE_KEY || loaded.supabase_secretKey,
        AGE_VERIFICATIONS: createMemoryKv(),
        RATE_LIMITS: createMemoryKv(),
      };

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = (req as IncomingMessage & { originalUrl?: string }).originalUrl || req.url || '/';
        let pathname: string;
        try {
          pathname = new URL(rawUrl, 'http://localhost').pathname;
        } catch {
          return next();
        }

        if (!pathname.startsWith('/api/') && !pathname.startsWith('/media/')) {
          return next();
        }

        const matched = matchPagesRoute(pathname);
        if (!matched) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `No Pages Function mapped for ${pathname}` }));
          return;
        }

        try {
          const body = await readRequestBody(req);
          const webRequest = toWebRequest(req, body);

          const [handlerModule, middlewareModule] = await Promise.all([
            server.ssrLoadModule(matched.modulePath) as Promise<PagesModule>,
            server.ssrLoadModule('./functions/_middleware.ts') as Promise<{
              onRequest?: (ctx: { next: () => Promise<Response> }) => Promise<Response>;
            }>,
          ]);

          const handler = pickMethodHandler(handlerModule, webRequest.method);
          if (!handler) {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          const executeHandler = () =>
            Promise.resolve(
              handler({
                request: webRequest,
                env: runtimeEnv,
                params: matched.params,
              })
            );

          const webResponse = middlewareModule.onRequest
            ? await middlewareModule.onRequest({ next: executeHandler })
            : await executeHandler();

          await writeWebResponse(webResponse, res);
        } catch (err) {
          console.error('[vite-pages-functions] Handler error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Local Pages Function execution failed' }));
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}
