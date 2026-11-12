import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile(filePath) {
  const values = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

function parseArgs(argv) {
  const args = { requests: 300, concurrency: 20, timeoutMs: 15_000, target: 'https://pulse-ghana.pages.dev' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--requests') args.requests = Number(argv[++index]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++index]);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]);
    else if (arg === '--target') args.target = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

export function evaluateScenario(result, limits = { maxErrorRate: 0.01, maxP95Ms: 1_500 }) {
  return result.errorRate <= limits.maxErrorRate && result.p95 <= limits.maxP95Ms;
}

async function timedRequest(makeRequest, timeoutMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request exceeded ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await makeRequest(controller.signal);
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, duration: performance.now() - started };
  } catch (error) {
    return { ok: false, status: 0, duration: performance.now() - started, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function runScenario(name, requests, concurrency, timeoutMs, makeRequest, limits) {
  for (let index = 0; index < Math.min(8, concurrency); index += 1) await timedRequest(makeRequest, timeoutMs);
  const results = new Array(requests);
  let cursor = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < requests) {
      const current = cursor;
      cursor += 1;
      results[current] = await timedRequest(makeRequest, timeoutMs);
    }
  }));
  const elapsedMs = performance.now() - started;
  const durations = results.map((result) => result.duration);
  const failures = results.filter((result) => !result.ok);
  const summary = {
    name,
    requests,
    concurrency,
    failures: failures.length,
    errorRate: failures.length / requests,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: Math.max(...durations),
    requestsPerSecond: requests / (elapsedMs / 1000),
    statuses: Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length])),
  };
  summary.passed = evaluateScenario(summary, limits);
  return summary;
}

function format(summary) {
  const outcome = summary.passed ? 'PASS' : 'FAIL';
  return `${outcome.padEnd(4)} ${summary.name.padEnd(22)} requests=${String(summary.requests).padStart(4)} ` +
    `errors=${(summary.errorRate * 100).toFixed(2).padStart(5)}% p50=${summary.p50.toFixed(0).padStart(4)}ms ` +
    `p95=${summary.p95.toFixed(0).padStart(4)}ms p99=${summary.p99.toFixed(0).padStart(4)}ms ` +
    `rps=${summary.requestsPerSecond.toFixed(1).padStart(6)} statuses=${JSON.stringify(summary.statuses)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/benchmark-platform.mjs [--target URL] [--requests 300] [--concurrency 20] [--timeout-ms 15000]');
    return;
  }
  if (!Number.isInteger(args.requests) || args.requests < 1 || !Number.isInteger(args.concurrency) || args.concurrency < 1 || !Number.isInteger(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error('Requests, concurrency, and timeout must be valid positive integers.');
  }
  const env = { ...readEnvFile(path.join(ROOT, '.env')), ...process.env };
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  const publicHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const jsonHeaders = { ...publicHeaders, 'Content-Type': 'application/json' };
  const target = args.target.replace(/\/$/, '');
  const feedSelect = 'id,title,description,video_url,thumbnail_url,duration_seconds,uploader_id,view_count,like_count,comment_count,share_count,created_at';
  const feedQuery = `${supabaseUrl}/rest/v1/videos?select=${encodeURIComponent(feedSelect)}&is_active=eq.true&status=in.(published,ready)&visibility=eq.public&order=created_at.desc&limit=10`;
  const deepFeedQuery = `${feedQuery}&offset=4000`;
  const profilesQuery = `${supabaseUrl}/rest/v1/profiles?select=id,display_name,avatar_url&order=created_at.desc&limit=25`;
  const searchUrl = `${supabaseUrl}/rest/v1/rpc/search_public_videos`;
  const mediaOriginUrl = `${supabaseUrl}/storage/v1/object/public/videos/mock/clip-01.mp4`;
  const mediaEdgeUrl = `${target}/media/videos/mock/clip-01.mp4`;
  const scenarios = [
    ['pages-home', (signal) => fetch(`${target}/`, { cache: 'no-store', signal }), { maxErrorRate: 0.005, maxP95Ms: 1_200 }],
    ['edge-session', (signal) => fetch(`${target}/api/auth/session`, { cache: 'no-store', signal }), { maxErrorRate: 0.005, maxP95Ms: 1_500 }],
    ['feed-first-page', (signal) => fetch(feedQuery, { headers: publicHeaders, cache: 'no-store', signal }), { maxErrorRate: 0.005, maxP95Ms: 1_200 }],
    ['feed-deep-offset', (signal) => fetch(deepFeedQuery, { headers: publicHeaders, cache: 'no-store', signal }), { maxErrorRate: 0.01, maxP95Ms: 1_800 }],
    ['profile-enrichment', (signal) => fetch(profilesQuery, { headers: publicHeaders, cache: 'no-store', signal }), { maxErrorRate: 0.005, maxP95Ms: 1_200 }],
    ['full-text-search', (signal) => fetch(searchUrl, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ search_query: 'ghana music accra', result_limit: 30 }), signal }), { maxErrorRate: 0.01, maxP95Ms: 1_800 }],
    ['media-edge-range', (signal) => fetch(mediaEdgeUrl, { headers: { Range: 'bytes=0-65535' }, signal }), { maxErrorRate: 0.01, maxP95Ms: 2_000 }],
    ['media-origin-range', (signal) => fetch(mediaOriginUrl, { headers: { Range: 'bytes=0-65535' }, cache: 'no-store', signal }), { maxErrorRate: 0.01, maxP95Ms: 3_000 }],
  ];
  console.log(`Benchmarking ${target} with ${args.requests} requests/scenario at concurrency ${args.concurrency}.`);
  const summaries = [];
  for (const [name, request, limits] of scenarios) {
    const summary = await runScenario(name, args.requests, args.concurrency, args.timeoutMs, request, limits);
    summaries.push(summary);
    console.log(format(summary));
  }
  const failed = summaries.filter((summary) => !summary.passed);
  if (failed.length) {
    console.error(`${failed.length} scenario(s) exceeded the configured resilience thresholds.`);
    process.exitCode = 1;
  } else {
    console.log('All resilience thresholds passed.');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
