import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_DIR = path.join(ROOT, '.mock-data');
const ASSET_DIR = path.join(MOCK_DIR, 'assets');
const CREDENTIALS_PATH = path.join(MOCK_DIR, 'credentials.json');

export const SCALE_PRESETS = Object.freeze({
  smoke: Object.freeze({
    users: 25,
    videos: 200,
    comments: 800,
    likes: 1_500,
    commentLikes: 1_000,
    follows: 250,
    saves: 500,
    progress: 500,
    insights: 300,
    views: 1_000,
    reports: 40,
    feedback: 20,
    subscriptions: 5,
  }),
  medium: Object.freeze({
    users: 250,
    videos: 5_000,
    comments: 50_000,
    likes: 100_000,
    commentLikes: 50_000,
    follows: 8_000,
    saves: 20_000,
    progress: 20_000,
    insights: 15_000,
    views: 50_000,
    reports: 1_000,
    feedback: 500,
    subscriptions: 50,
  }),
  large: Object.freeze({
    users: 1_000,
    videos: 25_000,
    comments: 250_000,
    likes: 500_000,
    commentLikes: 250_000,
    follows: 50_000,
    saves: 100_000,
    progress: 100_000,
    insights: 75_000,
    views: 250_000,
    reports: 5_000,
    feedback: 2_500,
    subscriptions: 200,
  }),
});

const MEDIA = Object.freeze({ clips: 12, avatars: 16, seconds: 5 });
const MOCK_EMAIL_PATTERN = 'mock.user.%@example.test';

function parseArgs(argv) {
  const args = {
    scale: 'medium',
    apply: false,
    cleanup: false,
    mediaOnly: false,
    yes: false,
    skipMedia: false,
    purgeMedia: false,
    projectRef: '',
    appUrl: 'https://pulse-ghana.pages.dev',
    concurrency: 6,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--scale') args.scale = argv[++index] ?? '';
    else if (arg === '--project-ref') args.projectRef = argv[++index] ?? '';
    else if (arg === '--app-url') args.appUrl = argv[++index] ?? '';
    else if (arg === '--concurrency') args.concurrency = Number(argv[++index] ?? 6);
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--cleanup') args.cleanup = true;
    else if (arg === '--media-only') args.mediaOnly = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--skip-media') args.skipMedia = true;
    else if (arg === '--purge-media') args.purgeMedia = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `
Seed deterministic synthetic data into the configured Supabase project.

Usage:
  node scripts/seed-mock-data.mjs --scale medium --project-ref <ref> --apply --yes
  node scripts/seed-mock-data.mjs --cleanup --project-ref <ref> --apply --yes

Options:
  --scale smoke|medium|large  Dataset profile (default: medium)
  --project-ref <ref>        Must exactly match VITE_SUPABASE_URL
  --app-url <url>            Same-origin media proxy base (default: deployed Pages URL)
  --apply                    Required before any remote write
  --yes                      Confirms replacement/removal of existing mock rows
  --cleanup                  Remove mock rows and mock Auth users
  --media-only               Generate and upload media without reseeding rows
  --purge-media              Also remove uploaded mock media during cleanup
  --skip-media               Reuse already-uploaded mock media
  --concurrency <n>          Auth API concurrency (default: 6)
`;
}

function readEnvFile(filePath) {
  const values = {};
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function requireConfiguration(args) {
  const env = { ...readEnvFile(path.join(ROOT, '.env')), ...process.env };
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const secretKey = env.supabase_secretKey || env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = env.supabase_accessKey || env.SUPABASE_ACCESS_TOKEN;
  if (!supabaseUrl || !anonKey || !secretKey || !accessToken) {
    throw new Error('Missing Supabase URL, anon key, secret key, or access token.');
  }
  const parsedUrl = new URL(supabaseUrl);
  if (!parsedUrl.hostname.endsWith('.supabase.co')) throw new Error('Refusing a non-Supabase target URL.');
  const projectRef = parsedUrl.hostname.split('.')[0];
  if (!args.projectRef || args.projectRef !== projectRef) {
    throw new Error(`Safety check failed. Pass --project-ref ${projectRef} to confirm the exact target.`);
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), anonKey, secretKey, accessToken, projectRef };
}

function loadOrCreateCredentials() {
  mkdirSync(MOCK_DIR, { recursive: true });
  if (existsSync(CREDENTIALS_PATH)) return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const credentials = {
    password: `PulseMock!${randomBytes(18).toString('base64url')}`,
    exampleEmail: 'mock.user.0001@example.test',
    createdAt: new Date().toISOString(),
  };
  writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  return credentials;
}

function adminHeaders(secretKey, json = false) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function requestWithRetry(url, options = {}, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      const body = await response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 300 * 2 ** attempt)));
        continue;
      }
      throw new Error(`${options.method ?? 'GET'} ${url} failed (${response.status}): ${body.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 300 * 2 ** attempt)));
    }
  }
  throw lastError;
}

async function listMockUsers(config) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await requestWithRetry(`${config.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: adminHeaders(config.secretKey),
    });
    const body = await response.json();
    const pageUsers = body.users ?? [];
    users.push(...pageUsers.filter((user) => user.email?.startsWith('mock.user.') && user.email.endsWith('@example.test')));
    if (pageUsers.length < 1000) break;
  }
  return users;
}

async function parallelMap(items, concurrency, work) {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      await work(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function ensureMockUsers(config, count, password, concurrency) {
  const existing = await listMockUsers(config);
  const byEmail = new Map(existing.map((user) => [user.email, user]));
  const missing = [];
  for (let index = 1; index <= count; index += 1) {
    const email = `mock.user.${String(index).padStart(4, '0')}@example.test`;
    if (!byEmail.has(email)) missing.push({ email, index });
  }
  console.log(`Auth users: ${existing.length} existing, ${missing.length} to create.`);
  let created = 0;
  await parallelMap(missing, concurrency, async ({ email, index }) => {
    await requestWithRetry(`${config.supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders(config.secretKey, true),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { mock_seed: true, seed_index: index },
        app_metadata: { provider: 'email', providers: ['email'], mock_seed: true },
      }),
    });
    created += 1;
    if (created % 25 === 0 || created === missing.length) console.log(`Created ${created}/${missing.length} Auth users.`);
  });
}

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr || result.stdout}`);
}

function ensureMediaFiles() {
  mkdirSync(ASSET_DIR, { recursive: true });
  const colors = ['203864', '7F1D1D', '14532D', '581C87', '78350F', '164E63', '831843', '1E3A8A'];
  for (let index = 1; index <= MEDIA.clips; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const clipPath = path.join(ASSET_DIR, `clip-${suffix}.mp4`);
    const posterPath = path.join(ASSET_DIR, `poster-${suffix}.webp`);
    if (!existsSync(clipPath)) {
      runFfmpeg([
        '-f', 'lavfi', '-i', `testsrc2=size=360x640:rate=24:duration=${MEDIA.seconds}`,
        '-f', 'lavfi', '-i', `sine=frequency=${220 + index * 37}:sample_rate=44100:duration=${MEDIA.seconds}`,
        '-vf', `hue=h=${index * 29}:s=1.15,drawbox=x=18:y=18:w=324:h=604:color=white@0.12:t=4`,
        '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', clipPath,
      ]);
    }
    if (!existsSync(posterPath)) {
      runFfmpeg(['-ss', '1', '-i', clipPath, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '70', posterPath]);
    }
  }
  for (let index = 1; index <= MEDIA.avatars; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const avatarPath = path.join(ASSET_DIR, `avatar-${suffix}.webp`);
    if (!existsSync(avatarPath)) {
      const color = colors[(index - 1) % colors.length];
      runFfmpeg([
        '-f', 'lavfi', '-i', `color=c=0x${color}:s=256x256:d=1`,
        '-vf', `drawbox=x=${24 + (index % 4) * 12}:y=${24 + (index % 3) * 16}:w=160:h=160:color=white@0.22:t=fill`,
        '-frames:v', '1', '-c:v', 'libwebp', '-quality', '75', avatarPath,
      ]);
    }
  }
}

async function uploadObject(config, bucket, objectPath, filePath, contentType) {
  const response = await requestWithRetry(`${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      ...adminHeaders(config.secretKey),
      'Content-Type': contentType,
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'true',
    },
    body: readFileSync(filePath),
  });
  await response.arrayBuffer();
}

async function ensureMedia(config) {
  ensureMediaFiles();
  const uploads = [];
  for (let index = 1; index <= MEDIA.clips; index += 1) {
    const suffix = String(index).padStart(2, '0');
    uploads.push(['videos', `mock/clip-${suffix}.mp4`, path.join(ASSET_DIR, `clip-${suffix}.mp4`), 'video/mp4']);
    uploads.push(['videos', `mock/poster-${suffix}.webp`, path.join(ASSET_DIR, `poster-${suffix}.webp`), 'image/webp']);
  }
  for (let index = 1; index <= MEDIA.avatars; index += 1) {
    const suffix = String(index).padStart(2, '0');
    uploads.push(['avatars', `mock/avatar-${suffix}.webp`, path.join(ASSET_DIR, `avatar-${suffix}.webp`), 'image/webp']);
  }
  let uploaded = 0;
  await parallelMap(uploads, 4, async ([bucket, objectPath, filePath, contentType]) => {
    await uploadObject(config, bucket, objectPath, filePath, contentType);
    uploaded += 1;
    if (uploaded % 10 === 0 || uploaded === uploads.length) console.log(`Uploaded ${uploaded}/${uploads.length} media assets.`);
  });
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function usersTempTable() {
  return `
create temporary table seed_mock_users on commit drop as
select id, row_number() over (order by email)::integer as idx
from auth.users
where email like '${MOCK_EMAIL_PATTERN}';
create unique index on seed_mock_users (idx);
create unique index on seed_mock_users (id);
`;
}

function transaction(sql) {
  return `begin;\n${sql}\ncommit;`;
}

export function buildSeedPhases(scale, supabaseUrl, appUrl = '') {
  const c = scale;
  const normalizedAppUrl = appUrl.replace(/\/$/, '');
  const publicVideos = normalizedAppUrl
    ? `${normalizedAppUrl}/media/videos/mock`
    : `${supabaseUrl}/storage/v1/object/public/videos/mock`;
  const publicAvatars = normalizedAppUrl
    ? `${normalizedAppUrl}/media/avatars/mock`
    : `${supabaseUrl}/storage/v1/object/public/avatars/mock`;
  const setup = transaction(`
create schema if not exists seed_support;
create table if not exists seed_support.runs (
  id uuid primary key default gen_random_uuid(),
  scale text not null,
  counts jsonb not null,
  created_at timestamptz not null default now()
);
create or replace function seed_support.uuid_for(namespace text, item bigint)
returns uuid language sql immutable strict set search_path = '' as $$
  select (
    substr(md5(namespace || ':' || item::text), 1, 8) || '-' ||
    substr(md5(namespace || ':' || item::text), 9, 4) || '-' ||
    substr(md5(namespace || ':' || item::text), 13, 4) || '-' ||
    substr(md5(namespace || ':' || item::text), 17, 4) || '-' ||
    substr(md5(namespace || ':' || item::text), 21, 12)
  )::uuid;
$$;
${usersTempTable()}
do $$ begin
  if (select count(*) from seed_mock_users) < ${c.users} then
    raise exception 'Expected ${c.users} mock users before relational seeding';
  end if;
end $$;
delete from public.feedback where user_id in (select id from seed_mock_users) or email like '${MOCK_EMAIL_PATTERN}';
delete from public.reports where reporter_id in (select id from seed_mock_users) or details like '[MOCK]%';
delete from public.subscriptions where user_id in (select id from seed_mock_users) or payment_reference like 'mock-%';
delete from public.follows where follower_id in (select id from seed_mock_users) or following_id in (select id from seed_mock_users);
delete from public.comment_likes where user_id in (select id from seed_mock_users);
delete from public.comments where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.likes where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.saved_videos where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_watch_progress where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_viewing_insights where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_views where viewer_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.videos where title like '[MOCK]%';
insert into public.profiles (id, tier, display_name, bio, avatar_url, role, is_banned, banned_at, ban_reason, viewing_insights)
select u.id,
  case when u.idx % 20 = 0 then 'pro' else 'free' end,
  'Mock Creator ' || lpad(u.idx::text, 4, '0'),
  '[MOCK] Synthetic Ghana creator profile ' || u.idx,
  ${sqlString(publicAvatars)} || '/avatar-' || lpad((1 + ((u.idx - 1) % ${MEDIA.avatars}))::text, 2, '0') || '.webp',
  case when u.idx = 1 then 'admin' when u.idx in (2, 3) then 'moderator' else 'user' end,
  (u.idx > 3 and u.idx % 50 = 0),
  case when u.idx > 3 and u.idx % 50 = 0 then now() - interval '2 days' else null end,
  case when u.idx > 3 and u.idx % 50 = 0 then '[MOCK] moderation scenario' else null end,
  (u.idx % 3 <> 0)
from seed_mock_users u
where u.idx <= ${c.users}
on conflict (id) do update set
  tier=excluded.tier, display_name=excluded.display_name, bio=excluded.bio, avatar_url=excluded.avatar_url,
  role=excluded.role, is_banned=excluded.is_banned, banned_at=excluded.banned_at,
  ban_reason=excluded.ban_reason, viewing_insights=excluded.viewing_insights;
with generated as (
  select g,
    seed_support.uuid_for('pulse-mock-video', g) as id,
    1 + ((g - 1) % ${c.users}) as user_idx,
    (array['music','comedy','food','football','fashion','dance','tech','travel','culture','fitness'])[1 + ((g - 1) % 10)] as category
  from generate_series(1, ${c.videos}) g
)
insert into public.videos (
  id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active,
  created_at, status, hls_master_url, raw_video_url, resolutions, aspect_ratio, attempt_count,
  visibility, rejection_reason, reviewed_by, reviewed_at, tags
)
select g.id,
  '[MOCK] ' || initcap(g.category) || ' Ghana Story ' || lpad(g.g::text, 5, '0'),
  '[MOCK] Synthetic resilience-test clip about ' || g.category || ', Accra, Kumasi and Ghana creator culture. Dataset item ' || g.g || '.',
  ${sqlString(publicVideos)} || '/clip-' || lpad((1 + ((g.g - 1) % ${MEDIA.clips}))::text, 2, '0') || '.mp4',
  ${sqlString(publicVideos)} || '/poster-' || lpad((1 + ((g.g - 1) % ${MEDIA.clips}))::text, 2, '0') || '.webp',
  ${MEDIA.seconds}, u.id,
  (g.g % 100 < 90 or g.g % 100 >= 96),
  now() - ((g.g % 180) * interval '1 day') - ((g.g % 24) * interval '1 hour'),
  case when g.g % 100 < 85 then 'published'
       when g.g % 100 < 90 then 'ready'
       when g.g % 100 < 94 then 'pending_review'
       when g.g % 100 < 96 then 'rejected'
       else 'published' end,
  null,
  ${sqlString(publicVideos)} || '/clip-' || lpad((1 + ((g.g - 1) % ${MEDIA.clips}))::text, 2, '0') || '.mp4',
  array['360p','720p'], '9:16', 0,
  case when g.g % 100 < 96 then 'public' when g.g % 100 < 98 then 'age_restricted' else 'private' end,
  case when g.g % 100 between 94 and 95 then '[MOCK] rejected moderation example' else null end,
  case when g.g % 100 between 90 and 93 then null else reviewer.id end,
  case when g.g % 100 between 90 and 93 then null else now() - interval '1 day' end,
  array[g.category, 'ghana', case when g.g % 2 = 0 then 'accra' else 'kumasi' end, 'mock']
from generated g
join seed_mock_users u on u.idx = g.user_idx
join seed_mock_users reviewer on reviewer.idx = 1;
`);

  const engagement = transaction(`
${usersTempTable()}
alter table public.comments disable trigger user;
insert into public.comments (id, video_id, user_id, text, created_at)
select seed_support.uuid_for('pulse-mock-comment', g),
  seed_support.uuid_for('pulse-mock-video', 1 + ((g - 1) % ${c.videos})),
  u.id,
  '[MOCK] Synthetic comment ' || g || ' — testing conversation depth, pagination and moderation.',
  now() - ((g % 120) * interval '1 day') - ((g % 3600) * interval '1 second')
from generate_series(1, ${c.comments}) g
join seed_mock_users u on u.idx = 1 + ((g - 1) % ${c.users});
alter table public.comments enable trigger user;
insert into public.likes (id, video_id, user_id, created_at)
select seed_support.uuid_for('pulse-mock-like', g),
  seed_support.uuid_for('pulse-mock-video', 1 + (((g - 1) / ${c.users}) % ${c.videos})),
  u.id,
  now() - ((g % 90) * interval '1 day')
from generate_series(1, ${c.likes}) g
join seed_mock_users u on u.idx = 1 + ((g - 1) % ${c.users})
on conflict (video_id, user_id) do nothing;
insert into public.comment_likes (comment_id, user_id, created_at)
select seed_support.uuid_for('pulse-mock-comment', 1 + (((g - 1) / ${c.users}) % ${c.comments})),
  u.id,
  now() - ((g % 60) * interval '1 day')
from generate_series(1, ${c.commentLikes}) g
join seed_mock_users u on u.idx = 1 + ((g - 1) % ${c.users})
on conflict (comment_id, user_id) do nothing;
with pairs as (
  select g,
    1 + ((g - 1) % ${c.users}) as follower_idx,
    1 + ((((g - 1) % ${c.users}) + 1 + (((g - 1) / ${c.users}) % (${c.users} - 1))) % ${c.users}) as following_idx
  from generate_series(1, ${c.follows}) g
)
insert into public.follows (id, follower_id, following_id, created_at)
select seed_support.uuid_for('pulse-mock-follow', p.g), follower.id, following.id,
  now() - ((p.g % 150) * interval '1 day')
from pairs p
join seed_mock_users follower on follower.idx=p.follower_idx
join seed_mock_users following on following.idx=p.following_idx
on conflict (follower_id, following_id) do nothing;
`);

  const state = transaction(`
${usersTempTable()}
insert into public.saved_videos (user_id, video_id, created_at)
select u.id, seed_support.uuid_for('pulse-mock-video', 1 + (((g - 1) / ${c.users}) % ${c.videos})),
  now() - ((g % 90) * interval '1 day')
from generate_series(1, ${c.saves}) g
join seed_mock_users u on u.idx=1 + ((g - 1) % ${c.users})
on conflict (user_id, video_id) do nothing;
insert into public.video_watch_progress (user_id, video_id, last_position_seconds, completed, updated_at)
select u.id, seed_support.uuid_for('pulse-mock-video', 1 + (((g - 1) / ${c.users}) % ${c.videos})),
  (g % ${MEDIA.seconds + 1})::integer, (g % 5 = 0), now() - ((g % 30) * interval '1 day')
from generate_series(1, ${c.progress}) g
join seed_mock_users u on u.idx=1 + ((g - 1) % ${c.users})
on conflict (user_id, video_id) do update set
  last_position_seconds=excluded.last_position_seconds, completed=excluded.completed, updated_at=excluded.updated_at;
insert into public.video_viewing_insights (user_id, video_id, watched_seconds, completed, skipped, updated_at)
select u.id, seed_support.uuid_for('pulse-mock-video', 1 + (((g - 1) / ${c.users}) % ${c.videos})),
  1 + (g % 60), (g % 7 = 0), (g % 11 = 0), now() - ((g % 89) * interval '1 day')
from generate_series(1, ${c.insights}) g
join seed_mock_users u on u.idx=1 + ((g - 1) % ${c.users})
on conflict (user_id, video_id) do update set
  watched_seconds=excluded.watched_seconds, completed=excluded.completed, skipped=excluded.skipped, updated_at=excluded.updated_at;
insert into public.video_views (id, video_id, viewer_id, viewed_at)
select seed_support.uuid_for('pulse-mock-view', g),
  seed_support.uuid_for('pulse-mock-video', 1 + (((g - 1) / ${c.users}) % ${c.videos})),
  u.id, now() - ((g % 89) * interval '1 day')
from generate_series(1, ${c.views}) g
join seed_mock_users u on u.idx=1 + ((g - 1) % ${c.users})
on conflict (video_id, viewer_id) do nothing;
`);

  const operations = transaction(`
${usersTempTable()}
insert into public.reports (id, video_id, reported_user_id, reporter_id, reason, details, status, created_at, is_anonymous)
select seed_support.uuid_for('pulse-mock-report', g),
  seed_support.uuid_for('pulse-mock-video', 1 + ((g - 1) % ${c.videos})),
  reported.id,
  case when g % 5 = 0 then null else reporter.id end,
  (array['spam','harassment','misinformation','copyright','unsafe'])[1 + ((g - 1) % 5)],
  '[MOCK] Synthetic moderation report ' || g,
  (array['open','reviewed','dismissed'])[1 + ((g - 1) % 3)],
  now() - ((g % 60) * interval '1 day'),
  (g % 5 = 0)
from generate_series(1, ${c.reports}) g
join seed_mock_users reported on reported.idx=1 + (((g * 7) - 1) % ${c.users})
join seed_mock_users reporter on reporter.idx=1 + ((g - 1) % ${c.users});
insert into public.feedback (id, user_id, email, category, message, status, created_at)
select seed_support.uuid_for('pulse-mock-feedback', g),
  case when g % 4 = 0 then null else u.id end,
  case when g % 4 = 0 then 'mock.user.' || lpad((1 + ((g - 1) % ${c.users}))::text, 4, '0') || '@example.test' else null end,
  (array['general','bug','feature'])[1 + ((g - 1) % 3)],
  '[MOCK] Synthetic support message ' || g || ' for queue and filtering tests.',
  (array['open','reviewed','closed'])[1 + ((g - 1) % 3)],
  now() - ((g % 90) * interval '1 day')
from generate_series(1, ${c.feedback}) g
join seed_mock_users u on u.idx=1 + ((g - 1) % ${c.users});
insert into public.subscriptions (id, user_id, tier, status, paystack_reference, started_at, expires_at, created_at, payment_provider, payment_reference)
select seed_support.uuid_for('pulse-mock-subscription', g), u.id, 'pro',
  case when g % 10 = 0 then 'expired' else 'active' end,
  'mock-paystack-' || lpad(g::text, 5, '0'),
  now() - interval '15 days',
  case when g % 10 = 0 then now() - interval '1 day' else now() + interval '15 days' end,
  now() - interval '15 days',
  (array['paystack','moolre','stripe'])[1 + ((g - 1) % 3)],
  'mock-' || lpad(g::text, 5, '0')
from generate_series(1, ${c.subscriptions}) g
join seed_mock_users u on u.idx=g;
update public.videos v set like_count=s.count
from (select video_id, count(*)::integer count from public.likes group by video_id) s
where v.id=s.video_id and v.title like '[MOCK]%';
update public.videos v set comment_count=s.count
from (select video_id, count(*)::integer count from public.comments group by video_id) s
where v.id=s.video_id and v.title like '[MOCK]%';
update public.videos v set view_count=s.count
from (select video_id, count(*)::integer count from public.video_views group by video_id) s
where v.id=s.video_id and v.title like '[MOCK]%';
update public.videos set share_count=(get_byte(decode(substr(md5(id::text),1,2),'hex'),0) % 80)
where title like '[MOCK]%';
insert into seed_support.runs (scale, counts)
values (${sqlString(c.name ?? 'custom')}, ${sqlString(JSON.stringify(c))}::jsonb);
analyze public.videos;
analyze public.profiles;
analyze public.comments;
analyze public.likes;
analyze public.comment_likes;
analyze public.follows;
analyze public.saved_videos;
analyze public.video_watch_progress;
analyze public.video_views;
`);

  return [
    { name: 'profiles and videos', sql: setup },
    { name: 'comments and social engagement', sql: engagement },
    { name: 'viewer state and analytics', sql: state },
    { name: 'moderation, subscriptions, counters, and analyze', sql: operations },
  ];
}

export function buildCleanupSql() {
  return transaction(`
${usersTempTable()}
delete from public.feedback where user_id in (select id from seed_mock_users) or email like '${MOCK_EMAIL_PATTERN}';
delete from public.reports where reporter_id in (select id from seed_mock_users) or details like '[MOCK]%';
delete from public.subscriptions where user_id in (select id from seed_mock_users) or payment_reference like 'mock-%';
delete from public.follows where follower_id in (select id from seed_mock_users) or following_id in (select id from seed_mock_users);
delete from public.comment_likes where user_id in (select id from seed_mock_users);
delete from public.comments where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.likes where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.saved_videos where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_watch_progress where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_viewing_insights where user_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.video_views where viewer_id in (select id from seed_mock_users) or video_id in (select id from public.videos where title like '[MOCK]%');
delete from public.videos where title like '[MOCK]%';
`);
}

async function executeSql(config, sql) {
  const response = await requestWithRetry(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  }, 4);
  return response.json();
}

async function deleteMockUsers(config, concurrency) {
  const users = await listMockUsers(config);
  let deleted = 0;
  await parallelMap(users, concurrency, async (user) => {
    await requestWithRetry(`${config.supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE', headers: adminHeaders(config.secretKey),
    });
    deleted += 1;
    if (deleted % 25 === 0 || deleted === users.length) console.log(`Deleted ${deleted}/${users.length} Auth users.`);
  });
}

async function purgeMedia(config) {
  const objects = [];
  for (let index = 1; index <= MEDIA.clips; index += 1) {
    const suffix = String(index).padStart(2, '0');
    objects.push(['videos', `mock/clip-${suffix}.mp4`], ['videos', `mock/poster-${suffix}.webp`]);
  }
  for (let index = 1; index <= MEDIA.avatars; index += 1) {
    objects.push(['avatars', `mock/avatar-${String(index).padStart(2, '0')}.webp`]);
  }
  await parallelMap(objects, 4, async ([bucket, objectPath]) => {
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'DELETE', headers: adminHeaders(config.secretKey),
    });
    if (!response.ok && response.status !== 404) throw new Error(`Failed to remove ${bucket}/${objectPath}: ${response.status}`);
  });
}

async function queryCounts(config) {
  const rows = await executeSql(config, `
select 'auth.users' table_name, count(*)::bigint row_count from auth.users where email like '${MOCK_EMAIL_PATTERN}'
union all select 'profiles', count(*) from public.profiles where display_name like 'Mock Creator %'
union all select 'videos', count(*) from public.videos where title like '[MOCK]%'
union all select 'comments', count(*) from public.comments where text like '[MOCK]%'
union all select 'likes', count(*) from public.likes where video_id in (select id from public.videos where title like '[MOCK]%')
union all select 'comment_likes', count(*) from public.comment_likes where comment_id in (select id from public.comments where text like '[MOCK]%')
union all select 'follows', count(*) from public.follows where follower_id in (select id from auth.users where email like '${MOCK_EMAIL_PATTERN}')
union all select 'saved_videos', count(*) from public.saved_videos where user_id in (select id from auth.users where email like '${MOCK_EMAIL_PATTERN}')
union all select 'video_watch_progress', count(*) from public.video_watch_progress where user_id in (select id from auth.users where email like '${MOCK_EMAIL_PATTERN}')
union all select 'video_views', count(*) from public.video_views where viewer_id in (select id from auth.users where email like '${MOCK_EMAIL_PATTERN}')
union all select 'reports', count(*) from public.reports where details like '[MOCK]%'
union all select 'feedback', count(*) from public.feedback where message like '[MOCK]%'
union all select 'subscriptions', count(*) from public.subscriptions where payment_reference like 'mock-%'
order by table_name;
  `);
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!SCALE_PRESETS[args.scale]) throw new Error(`Unknown scale: ${args.scale}`);
  const selected = { name: args.scale, ...SCALE_PRESETS[args.scale] };
  const estimatedRows = Object.entries(selected).filter(([, value]) => Number.isFinite(value)).reduce((sum, [, value]) => sum + value, 0);
  const plan = args.cleanup
    ? `remove ${args.scale} mock dataset`
    : args.mediaOnly
      ? `refresh ${MEDIA.clips * 2 + MEDIA.avatars} mock media assets`
      : `seed ${args.scale} mock dataset (${estimatedRows.toLocaleString()} planned rows)`;
  console.log(`Plan: ${plan}.`);
  if (!args.apply) {
    console.log('Dry plan only. Add --apply --yes and the exact --project-ref to write remotely.');
    return;
  }
  if (!args.yes) throw new Error('Remote writes require --yes.');
  const config = requireConfiguration(args);
  if (args.mediaOnly) {
    await ensureMedia(config);
    console.log('Mock media refresh complete.');
    return;
  }
  if (args.cleanup) {
    console.log(`Cleaning mock data from ${config.projectRef}...`);
    await executeSql(config, buildCleanupSql());
    await deleteMockUsers(config, args.concurrency);
    if (args.purgeMedia) await purgeMedia(config);
    console.log('Mock cleanup complete.');
    return;
  }
  const credentials = loadOrCreateCredentials();
  console.log(`Target: ${config.projectRef}. Credentials stored at ${path.relative(ROOT, CREDENTIALS_PATH)}.`);
  await ensureMockUsers(config, selected.users, credentials.password, args.concurrency);
  if (!args.skipMedia) await ensureMedia(config);
  for (const phase of buildSeedPhases(selected, config.supabaseUrl, args.appUrl)) {
    const started = performance.now();
    console.log(`Running phase: ${phase.name}...`);
    await executeSql(config, phase.sql);
    console.log(`Completed ${phase.name} in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
  }
  const counts = await queryCounts(config);
  console.log('Seeded row counts:');
  for (const row of counts) console.log(`  ${row.table_name}: ${Number(row.row_count).toLocaleString()}`);
  console.log(`Example login: ${credentials.exampleEmail} (password is in ${path.relative(ROOT, CREDENTIALS_PATH)}).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
