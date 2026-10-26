# Ghana Short-Video Platform — Implementation Data

> Original build plan and design tokens. For current architecture see
> `ARCHITECTURE.md`. Sections below reflect the plan as written at project start;
> where reality diverged (schema, ad config, payment flow) the live docs win.

---

## 1. Project Overview

| Field | Value |
|-------|-------|
| **Name** | Ghana Short-Video Platform (GVP) |
| **Type** | TikTok-style vertical video feed (PWA) |
| **Target Market** | Ghana — low-end Android phones on 3G networks |
| **Hosting** | Cloudflare Pages (free tier) |
| **Database/Auth** | Supabase (provisioned, env vars pre-populated) |
| **Revenue** | ExoClick ads (tiered frequency) + Paystack Mobile Money (Pro subscriptions) |
| **Key Advantage** | Zero-data video playback via Simplifyd integration |

---

## 2. Tech Stack & Dependencies

### 2.1 Core (Already in project)
- React 18 + Vite + TypeScript
- Tailwind CSS 3
- Supabase (`@supabase/supabase-js`) — env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `lucide-react` (icons)

### 2.2 To Install
| Package | Purpose |
|---------|---------|
| `@tanstack/react-virtual` | Virtualized vertical feed (only 3 DOM elements at once) |
| `hls.js` | HLS `.m3u8` playback for low-end devices |
| `vite-plugin-pwa` | PWA manifest + service worker for "Add to Home Screen" |

### 2.3 Services (External APIs)
| Service | Role | Auth Method |
|---------|------|-------------|
| Supabase | Auth, DB, user tiers, subscriptions | Pre-populated env vars |
| ExoClick | Ad delivery (VAST in-stream video only) | Zone IDs (configure later) |
| Paystack | Pro subscription payments (Mobile Money) | Secret key (configure later) |
| Simplifyd | Zero-data video CDN | API access (negotiate partnership) |

---

## 3. Database Schema (Supabase)

### 3.1 Tables

Current schema is documented in `docs/DATABASE.md`. Summary of divergences from
this original plan:
- Added since start: `reports`, `feedback`, `follows`, `likes`, `comments`
- `profiles` gained `bio` and `avatar_url`
- `subscriptions` INSERT is locked to the server (edge function only)

#### `videos`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| title | text | Video title |
| description | text | Optional |
| video_url | text | CDN URL (Simplifyd or direct) |
| thumbnail_url | text | Optional poster image |
| duration_seconds | int | For display |
| uploader_id | uuid | FK auth.users (admin/creator) |
| is_active | boolean | default true (moderation) |
| created_at | timestamptz | default now() |

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK auth.users |
| tier | text | 'free' | 'pro' (default 'free') |
| display_name | text | Optional |
| created_at | timestamptz | default now() |

#### `subscriptions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK auth.users |
| tier | text | 'pro' |
| status | text | 'active' | 'expired' | 'cancelled' |
| paystack_reference | text | Payment reference |
| started_at | timestamptz | |
| expires_at | timestamptz | |
| created_at | timestamptz | default now() |

### 3.2 RLS Policies
- Current policies: see `docs/DATABASE.md`. Key change from this plan: the
  subscriptions INSERT policy was REMOVED — payments are verified server-side.

---

## 4. User Tier System

| Tier | Ad Frequency | Skip Delay | Source |
|------|-------------|------------|--------|
| anonymous | Every 5 videos | 5s | Local (no Supabase account) |
| free | Every 10 videos | 5s | Supabase registered account |
| pro | No ads | N/A | Active subscription record |

Note: pop-unders were removed entirely during security review — in-stream only.

### Tier Detection Logic
1. No Supabase session → `anonymous` (local state only)
2. Supabase session, no active subscription → `free`
3. Supabase session, active subscription with status='active' → `pro`

---

## 5. Component Architecture

```
src/
├── components/
│   ├── VideoFeed.tsx          # Virtualized vertical feed (@tanstack/react-virtual)
│   ├── VideoCard.tsx          # Single video card with play/pause/overlay
│   ├── VideoPlayer.tsx        # HTML5 video + HLS.js, lazy load/unload
│   ├── AdContainer.tsx        # ExoClick VAST ad slot with skip timer
│   ├── ProUpgradeModal.tsx    # Paystack Mobile Money checkout
│   ├── BottomNav.tsx          # Home / Upload / Profile navigation
│   ├── ProfileScreen.tsx      # User tier display + upgrade button
│   ├── UploadScreen.tsx       # Admin-only video upload form
│   └── SplashScreen.tsx       # Loading state
├── hooks/
│   ├── useAuth.ts             # Supabase auth + tier management
│   ├── useAdFrequency.ts      # Tier-based ad insertion logic
│   ├── useVideoVisibility.ts  # Intersection Observer for play/pause
│   └── useVideos.ts           # Fetch paginated videos from Supabase
├── services/
│   ├── supabase.ts            # Supabase client + helpers
│   ├── exoclick.ts            # ExoClick SDK loader + VAST config
│   ├── paystack.ts            # Paystack checkout + webhook verify
│   └── simplifyd.ts           # Simplifyd zero-data URL wrapper
├── types/
│   └── index.ts               # Shared TypeScript types
├── App.tsx                    # Root: auth gate + view routing
└── main.tsx                   # Entry point
```

### 5.1 Key Component Specs

#### VideoFeed.tsx
- Uses `@tanstack/react-virtual` with vertical orientation
- Renders only current + 1 previous + 1 next (overscan: 1)
- Inserts ad cards at tier-appropriate intervals
- Infinite scroll via `onEndReached` callback
- NO CSS scroll-snap (causes jank on low-end Android)

#### VideoPlayer.tsx
- `preload="none"` — never preload full video
- HLS.js for `.m3u8`, native for `.mp4`
- Play when >50% visible, pause + unload immediately when off-screen
- `playsInline` for iOS/Android webview compatibility
- Only 1 active video element at a time (memory constraint)

#### AdContainer.tsx
- In-stream VAST video player (SDK loaded dynamically)

#### ProUpgradeModal.tsx
- Paystack inline checkout (Mobile Money: MTN, Vodafone, AirtelTigo)
- On success: call Supabase edge function to verify payment + update tier
- Price: display in GHS (Ghana Cedis)

---

## 6. Performance Constraints (Non-Negotiable)

1. **Max 3 video elements in DOM** at any time (virtualization)
2. **Only 1 video playing** — all others paused + unloaded
3. **No heavy animations** — CSS transforms only, no framer-motion for feed
4. **No SSR** — pure client-side rendering
5. **preload="none"** on all video elements
6. **Must work on Slow 3G** in Chrome DevTools
7. **Service worker** caches app shell, NOT videos (videos stream from CDN)
8. **ManualChunks** in vite config: vendor, video (hls.js), virtual (@tanstack/react-virtual)

---

## 7. PWA Configuration

```json
{
  "name": "Ghana Video Platform",
  "short_name": "GVP",
  "theme_color": "#000000",
  "background_color": "#000000",
  "display": "standalone",
  "orientation": "portrait",
  "icons": ["192x192", "512x512"]
}
```

---

## 8. ExoClick Integration Notes

- SDK script: loaded dynamically on first ad render
- VAST URL: configured per zone ID (placeholder until publisher account)
- Zone ID to configure: in-stream video
- No pop-unders, pop-ups, or redirects — ever (rule)
- Minimum payout: $50
- Fallback: if SDK fails, show 5s skip timer and proceed

---

## 9. Paystack Integration Notes

- SDK: Paystack inline JS (`https://js.paystack.co/v1/inline.js`)
- Mobile Money providers: MTN, Vodafone, AirtelTigo
- Currency: GHS (Ghana Cedis)
- Webhook: Supabase edge function verifies payment reference
- Flow: checkout → Paystack popup → success callback → edge function → update subscription table
- Fees: 1.5% + GHS 2 per transaction

---

## 10. Simplifyd Integration Notes

- Zero-data playback for MTN/Vodafone/Airtel subscribers
- Contact Simplifyd for API access + negotiate zero-data deal
- Video URLs replaced with Simplifyd CDN URLs
- Fallback: standard HLS/MP4 from Supabase Storage or Cloudflare R2
- Status: PLACEHOLDER until partnership secured

---

## 11. Build Sequence (Execution Order)

### Phase A: Foundation
1. Install dependencies (`@tanstack/react-virtual`, `hls.js`, `vite-plugin-pwa`)
2. Configure PWA in vite.config.ts
3. Configure manualChunks for performance
4. Create Supabase schema migration (videos, profiles, subscriptions tables + RLS)
5. Create shared types file
6. Create Supabase service client

### Phase B: Core Feed
7. Create `useAuth` hook (Supabase session + tier detection)
8. Create `useAdFrequency` hook (tier-based ad interval)
9. Create `useVideos` hook (paginated fetch)
10. Create `VideoPlayer` component (HLS + visibility play/pause)
11. Create `VideoCard` component (overlay UI: title, actions)
12. Create `VideoFeed` component (virtualized list + ad insertion)
13. Create `AdContainer` component (ExoClick placeholder + skip timer)

### Phase C: Navigation & Auth UI
14. Create `BottomNav` component (Home / Upload / Profile)
15. Create `ProfileScreen` (tier display + upgrade button)
16. Create `ProUpgradeModal` (Paystack placeholder checkout)
17. Create `UploadScreen` (admin-only form)
18. Wire up `App.tsx` (auth gate + view switching)

### Phase D: Polish & Verify
19. Seed test videos in Supabase
20. Dark-mode UI pass (consistent spacing, typography, contrast)
21. PWA manifest icons
22. Build verification (`npm run build`)

---

## 12. File-to-Component Mapping (Quick Reference)

| File | Exports | Depends On |
|------|---------|------------|
| `types/index.ts` | Video, UserTier, AdItem, Subscription types | — |
| `services/supabase.ts` | supabase client, signInAnonymous, checkUserTier | @supabase/supabase-js |
| `services/exoclick.ts` | loadExoClick, initVASTPlayer, triggerPopunder | — |
| `services/paystack.ts` | openPaystackCheckout, verifyPayment | — |
| `hooks/useAuth.ts` | useAuth → { user, tier, signIn, signOut, upgrade } | services/supabase |
| `hooks/useAdFrequency.ts` | useAdFrequency → { shouldShowAd, config } | types |
| `hooks/useVideos.ts` | useVideos → { videos, loading, loadMore } | services/supabase |
| `components/VideoPlayer.tsx` | VideoPlayer | hls.js |
| `components/VideoCard.tsx` | VideoCard | VideoPlayer, lucide-react |
| `components/VideoFeed.tsx` | VideoFeed | @tanstack/react-virtual, VideoCard, AdContainer |
| `components/AdContainer.tsx` | AdContainer | services/exoclick |
| `components/ProUpgradeModal.tsx` | ProUpgradeModal | services/paystack |
| `components/BottomNav.tsx` | BottomNav | lucide-react |
| `components/ProfileScreen.tsx` | ProfileScreen | useAuth, ProUpgradeModal |
| `components/UploadScreen.tsx` | UploadScreen | services/supabase |
| `App.tsx` | App | useAuth, VideoFeed, BottomNav, ProfileScreen, UploadScreen |

---

## 13. Environment Variables

| Variable | Status | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Configured | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Configured | Supabase anon key |
| `VITE_EXOCLICK_ZONE_ID` | TODO | ExoClick in-stream video zone ID |
| `VITE_PAYSTACK_PUBLIC_KEY` | TODO | Paystack public key for checkout |

---

## 14. Design System

| Token | Value |
|-------|-------|
| Background | #000000 (pure black — OLED battery savings) |
| Surface | #111111 |
| Surface Elevated | #1A1A1A |
| Primary Accent | #E50914 (red — TikTok-inspired) |
| Text Primary | #FFFFFF |
| Text Secondary | #A1A1A1 |
| Success | #22C55E |
| Warning | #F59E0B |
| Error | #EF4444 |
| Font | System UI stack (no web font download — performance) |
| Touch target | min 44x44px |
| Border radius | 8px (cards), 9999px (buttons/pills) |
| Spacing | 8px grid |
