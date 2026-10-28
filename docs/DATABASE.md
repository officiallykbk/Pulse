# Database

All changes ship through `mcp__supabase__apply_migration` (never the CLI or
raw SQL). Migration files in `supabase/migrations/` mirror what's applied.

## Tables

### `videos`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| title | text | required |
| description | text | nullable |
| video_url | text | CDN/direct URL |
| thumbnail_url | text | nullable poster |
| duration_seconds | int | display |
| uploader_id | uuid FK auth.users | owner |
| is_active | bool | moderation gate; feed shows only active |
| view_count / like_count / comment_count / share_count | int | counters via RPCs |
| created_at | timestamptz | |

Policies: public SELECT (active only), owner INSERT/UPDATE/DELETE. Anon has no
write grants. RPCs: `increment_view_count`, `increment_share_count`,
`increment_comment_count`, `decrement_comment_count` (SECURITY DEFINER).

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK FK auth.users | = auth.uid() |
| tier | text | legacy field; tier is now computed from subscriptions |
| display_name | text | nullable, uniqueness-checked in UI |
| bio | text | nullable |
| avatar_url | text | nullable, points at avatars bucket |
| created_at | timestamptz | |

Auto-created by trigger on signup. Policies: owner-only SELECT/INSERT/UPDATE.

### `subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK auth.users | |
| tier | text | 'pro' |
| status | text | 'active' |
| paystack_reference | text | idempotency key for verification |
| started_at / expires_at | timestamptz | 30-day term |
| created_at | timestamptz | |

**Security-critical:** there is deliberately NO client INSERT policy. Rows are
written only by the `verifypayment` edge function (service role, which bypasses
RLS). Users can SELECT their own rows. This prevents self-granting Pro.

### `likes`
(user_id, video_id, created_at). Owner INSERT/DELETE, public SELECT.
`useLikes` toggles and prevents duplicates.

### `comments`
(id, video_id, user_id, text, created_at). Owner INSERT/DELETE, public SELECT.
Inserts/deletes adjust `videos.comment_count` via RPCs.

### `reports`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| video_id | uuid FK videos | nullable (SET NULL on delete) |
| reported_user_id | uuid FK auth.users | nullable |
| reporter_id | uuid FK auth.users | DEFAULT auth.uid() |
| reason | text | category: inappropriate/spam/copyright/other |
| details | text | nullable |
| status | text | 'open' → moderation later |
| created_at | timestamptz | |

Policies: authenticated INSERT own, SELECT own. No client UPDATE/DELETE —
moderation is a future server-side flow.

### Discovery and playback continuity (20261028000000)

- `videos.tags` stores hashtags extracted from upload title/description. A generated `search_document` GIN index covers title, description, and tags and powers `search_public_videos`, which returns only public, published videos ordered by relevance. Transcript indexing is deferred until there is a trusted transcript source and review path.
- `saved_videos` stores a private per-user Saved list; RLS restricts reads/writes to the owner.
- `video_watch_progress` stores only an owner's last position and completion state; it does not accumulate watch time. The signed-in `save_video_watch_progress` RPC validates public-video visibility, while a sparse local fallback supports continuity for guests and network failures. Resume does not guarantee data savings because seeking may fetch new media segments.
- `video_viewing_insights` stores one aggregate watch/completion/skip summary per viewing session only for signed-in accounts that opt in. Consent is `profiles.viewing_insights`, defaults to false, and is checked by the write RPC. Rows older than 90 days are purged opportunistically, and these signals are not yet used to rank the feed.
- Export and account cleanup include saved items, progress, and insights.

### Social sharing

Cloudflare Pages Function `/watch/:videoId` fetches only public video metadata using the Supabase anon key and emits per-video Open Graph/Twitter image metadata. No service-role key is used. Crawlers receive the metadata while browsers redirect to `/?v=<id>`; the rendered page keeps a button fallback for disabled JavaScript or edge failures. Native installed-app App Links/Universal Links require a native app and verified domain configuration that this web-only repository does not contain.

### `feedback`
(id, user_id nullable, email nullable, category general/bug/feature, message,
status, created_at). Anyone (anon included) can INSERT; users SELECT their own.

### `follows`
(id, follower_id DEFAULT auth.uid(), following_id, created_at). Unique pair
constraint + no-self-follow check. Owner INSERT/DELETE, public SELECT (needed
for follower counts).

### `video_views` (internal, RLS-locked)
(id, video_id, viewer_id, viewed_at). One row per (video, distinct viewer);
backed by the 24h dedup in `increment_view_count`. No client role can read
or write it — only the SECURITY DEFINER function writes it.

## Storage buckets

### `avatars` (public read)
- Owner-scoped writes: path must start with `<auth.uid()>/`
- Client compresses to ≤512px JPEG before upload, 5MB cap

## Migration history

1. `20261015155526` — videos, profiles, subscriptions + base RLS
2. `20261016005541` — likes table, view/like counts
3. `20261016005951` — view-count RPC + profile-creation trigger
4. `20261017015247` — comments table + comment/share counts
5. `20261018090000` — reports, feedback, follows; subscription INSERT policy
   removed (lockdown); anon write grants revoked on videos
6. `20261018100000` — profiles.bio/avatar_url; avatars bucket policies
7. `performance_indexes_hot_paths` — indexes for feed ordering, text search
   (pg_trgm), comments, likes, follows, reports
8. `secure_engagement_counters` — anon EXECUTE revoked on counter functions;
   views deduplicated per viewer per 24h; comment counts now trigger-driven
   only (removed an app-side double count); `video_views` table added
9. `pin_trigger_function_search_paths` / `revoke_public_execute_engagement_functions`
   / `revoke_explicit_trigger_function_grants` — closed the remaining linter
   warnings: search_path pinned on trigger functions, PUBLIC/default EXECUTE
   revoked everywhere, trigger-only functions made unreachable via RPC.
   Remaining 2 WARNs are by design (authenticated view/share increments need
   SECURITY DEFINER to write the RLS-locked video_views table).

## Conventions for new migrations

- Idempotent: `IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`
- RLS enabled on every table; 4 separate policies (no `FOR ALL`)
- Owner columns default `auth.uid()` so client inserts omit them
- Detailed markdown summary comment at the top of every migration
- Never DROP/DELETE columns or change types (data loss)
