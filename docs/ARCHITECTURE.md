# Pulse Architecture

Current system design and technical architecture as built.

## Stack Overview

- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS 3
- **Virtualization:** `@tanstack/react-virtual` with sliding 3-slot memory prefetch engine
- **Media Playback:** `hls.js` with ABR support + native `<video>` hardware decoding
- **Transcoding Worker:** Node.js + FFmpeg on Oracle Cloud Always-Free ARM VM (Ampere A1)
- **Database & Auth:** Supabase (PostgreSQL, Row-Level Security, Edge Functions)
- **Video Delivery:** Simplifyd (Zero-Data Africa CDN) + BunnyCDN (Global Fallback)
- **Payments:** Unified gateway supporting Moolre (USSD Mobile Money), Stripe (Global Cards), and Paystack
- **PWA:** `vite-plugin-pwa` with service worker app shell precaching
- **Test Suite:** Vitest 3 + Testing Library (175 passing tests)

---

## Screen Map

```
App.tsx (view router, no react-router)
├── VideoFeed          home: virtualized sliding 3-slot feed + TopBar overlay
│   ├── VideoCard          per-video: player, actions, comments, options
│   │   ├── VideoPlayer        ABR HLS player (active/prefetch/paused slot lifecycle)
│   │   ├── CommentsSheet      comment list + composer
│   │   └── VideoOptionsSheet  share / copy link / report (reason picker)
│   └── AdContainer / AdController in-stream sponsored card (5s lock + skip + VAST)
├── SearchScreen       title/description search across active reels
├── UploadScreen       drag & drop file upload + canvas thumbnail + progress
├── ProfileScreen      avatar, bio, counts, videos/likes tabs
│   ├── EditProfileScreen  name (uniqueness-checked), bio, avatar upload
│   ├── SettingsScreen     toggles, export data, delete account, about
│   └── SupportScreen      feedback form + FAQ
├── AuthScreen         sign in / sign up modal
├── ProUpgradeModal    unified checkout (Moolre MoMo / Stripe Cards / Paystack)
└── BottomNav          Feed / Upload / Profile navigation
```

---

## Core Data & Control Flows

### 1. Sliding 3-Slot Virtualized Playback Engine
- Feed uses `@tanstack/react-virtual` to map video records and designated ad slots.
- **Strict 3-Slot Memory Window:**
  - **Slot $i$ (Active):** Video element is mounted, unmuted/muted as per user preference, and actively playing.
  - **Slot $i + 1$ (Next):** Preloads poster image and initializes lowest-bitrate 240p HLS manifest/buffer for instant 0ms swipe transitions.
  - **Slot $i - 1$ (Previous):** Paused on current frame.
  - **Slots $|j - i| > 1$:** Completely unmounted from DOM to preserve RAM on 1GB Android Go devices.

### 2. Ad Management & 5-Second Skip Logic
- Handled by `AdController.tsx` inside designated feed slots (`anonymous`: every 5 videos; `free`: every 10 videos; `pro`: 0 ads).
- **Mandatory 5-Second Lock:** Intercepts feed gestures and keyboard scrolling during the 5s countdown timer.
- **Auto-Unlocking:** At 0 seconds, scroll lock releases and the high-contrast "Skip Ad" CTA button unlocks.
- **Zero Pop-Under Guarantee:** Sponsor links open explicitly in a new tab via `target="_blank" rel="noopener noreferrer"`.
- **Non-Fill Fallback:** If VAST tag is empty or fails to load, feed auto-advances to the next video without a dead screen.

### 3. Video Transcoding Pipeline (Oracle Cloud Always-Free ARM)
1. User drops a video file in `UploadScreen.tsx` ($\le 100\text{MB}$).
2. Browser draws frame 1.0 onto an off-screen `<canvas>` to instantly extract a preview poster.
3. Raw file uploads directly to Supabase Storage (`raw/`); record inserted into `videos` with `status: 'uploaded'`.
4. Dedicated worker service on Oracle Cloud Always-Free ARM VM claims the job (`status: 'processing'`).
5. Transcoder probes metadata with `ffprobe` and builds 4-tier H.264 ABR ladder:
   - `240p` (250 kbps video, 64k AAC, Baseline) — 2G/EDGE networks.
   - `360p` (450 kbps video, 64k AAC, Main) — spotty 3G.
   - `480p` (800 kbps video, 96k AAC, Main) — standard 3G/4G.
   - `720p` (1200 kbps video, 128k AAC, Main) — Wi-Fi/Pro.
6. Worker generates 2-second independent HLS segments and WebP poster, uploads assets with 1-year immutable caching, and updates database to `status: 'ready'`.

### 4. Multi-Gateway Payment Engine
1. `ProUpgradeModal.tsx` provides tabs for:
   - **Mobile Money (Africa):** Moolre direct USSD push prompt for MTN, Telecel, and AirtelTigo.
   - **International Cards (Global):** Stripe card checkout session ($0.99 / GHS 10.00).
   - **Fallback:** Paystack inline checkout.
2. Transactions are verified server-side through `supabase/functions/verifypayment/index.ts`.
3. The browser cannot self-grant Pro; only the edge function running with `service_role` writes the verified subscription record.

---

## Security Model

- **Row-Level Security (RLS):** Enforced across every table (`videos`, `profiles`, `subscriptions`, `reports`, `follows`, `feedback`).
- **Subscription Protection:** Client `INSERT` privilege on `subscriptions` is completely revoked.
- **Function Search Paths:** Locked (`SET search_path = public`) against search-path hijacking attacks.
- **Credential Segregation:** `SERVICE_ROLE` keys and payment gateway secrets (`MOOLRE_API_KEY`, `STRIPE_SECRET_KEY`, `PAYSTACK_SECRET_KEY`) exist exclusively in server-side Edge Functions and the Oracle Cloud worker environment.
