# Architecture

Current system design as built. For the original plan see `IMPLEMENTATION_DATA.md`.

## Stack

- React 18 + Vite 5 + TypeScript + Tailwind CSS 3
- Supabase: Postgres, Auth (email/password), Storage, Edge Functions
- `@tanstack/react-virtual` — feed virtualization
- `hls.js` — HLS playback; native `<video>` for MP4
- `vite-plugin-pwa` — offline shell + installability
- Vitest 3 + Testing Library — test suite

## Screen map

```
App.tsx (view router, no react-router)
├── VideoFeed      home: virtualized feed + TopBar overlay
│   ├── VideoCard      per-video: player, actions, comments, options
│   │   ├── VideoPlayer        MP4/HLS with visibility-driven play/pause
│   │   ├── CommentsSheet      comment list + composer
│   │   └── VideoOptionsSheet  share / copy link / report (reason picker)
│   └── AdContainer        ad slot (placeholder until ExoClick zone ID)
├── SearchScreen   title/description search
├── UploadScreen   video metadata form (file upload pending)
├── ProfileScreen  avatar, bio, counts, videos/likes tabs
│   ├── EditProfileScreen  name (uniqueness-checked), bio, avatar upload
│   ├── SettingsScreen     toggles, export data, delete account, about
│   └── SupportScreen      feedback form + FAQ
├── AuthScreen         sign in / sign up modal
├── ProUpgradeModal    Paystack checkout → server verification
└── BottomNav          Feed / Upload / Profile
```

## Data flow

### Feed
`useVideos` pages the `videos` table (10 at a time, `is_active = true`, newest
first). `VideoFeed` maps rows + tier-based ad slots into `FeedItem[]` and
virtualizes with `useVirtualizer` (estimateSize = viewport height, overscan 2).
Snap behavior is CSS-native (`snap-y snap-mandatory` + `scroll-snap-stop:
always`) — no JS scroll fighting, which keeps swiping smooth.

Ad slots come from `useAdFrequency` → `shouldShowAd(tier, videoIndex)`:
anonymous every 5, free every 10, pro never. Slot index 0 never has an ad.

### Tiers
`useAuth` resolves the tier: no session → `anonymous`; session → `free` unless
an active, unexpired `subscriptions` row exists (then `pro`). The subscription
row can only be created by the `verifypayment` edge function using the service
role — the client physically cannot grant Pro.

### Payments
1. `ProUpgradeModal` opens Paystack inline checkout (GHS 10.00)
2. On success callback, the client calls the `verifypayment` edge function with the reference
3. The function re-checks the payment against the Paystack API (amount ≥ 1000 pesewas, currency GHS, status success), is idempotent per reference, and writes the subscription row server-side

### Reports & feedback
`VideoOptionsSheet` → reason picker → `reports` table (authenticated only).
`SupportScreen` → `feedback` table (anon allowed, so signed-out visitors can
report bugs).

### Profiles
`profiles` (id = auth user id, auto-created by a DB trigger) holds display
name, bio, avatar_url. Avatars upload to the private-by-owner `avatars`
storage bucket under `<user-id>/`, are client-compressed to ≤512px JPEG, and
served via public URL. Follow counts are live counts on the `follows` table.

## Security model (non-negotiables)

- RLS on every table; no `FOR ALL` policies; owner checks via `auth.uid()`
- Subscription writes: service-role only (no client INSERT policy exists)
- Storage: avatar writes restricted to the owner's folder
- Edge function CORS: mandatory header set on every response, JWT verified
- Videos: anon can read active rows only; writes are authenticated-owner only

## Performance constraints

- Max 3 video elements in DOM (virtualizer overscan)
- `preload="none"`; pause + release when off-screen
- Service worker caches the app shell, never videos
- Manual chunks: vendor (react), video (hls.js), virtual (react-virtual)
