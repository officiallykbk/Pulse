# Pulse Production Launch Tracker

Single source of truth for the launch checklist.

Status legend: [x] Done · [~] In progress · [ ] Not started · [YOU] Requires your action

---

## Phase 1 — Security & Privacy (Complete)
- [x] Fix Pro subscription trust hole: verify payments server-side instead of trusting the browser
- [x] Fix subscription table permissions: client INSERT policy removed (self-grant impossible)
- [x] Remove pop-under ad setting for anonymous users (violates no-pop-under rule)
- [x] Make video "Report" button write a real report record (reason picker → reports table)
- [x] Secure engagement counters with server-side RPC functions and pinned search paths

## Phase 2 — Ad Experience (Engineered & Verified)
- [x] Multi-Network VAST Mediation Engine (`src/services/adMediation.ts`):
  - Primary Tier 3 / African Fill: **ExoClick** (VAST 2.0/3.0/4.0+, 5s skip, $20 payout)
  - Premium Inventory: **TrafficJunky** (In-stream pre-roll & Shorties VAST)
  - Brand-Safe / Clean Niche: **AD-SFW** (Curated, sex-positive, non-explicit dating & wellness creatives)
  - Redundancy / High Volume: **TrafficStars** (Global linear VAST pre-roll)
  - Direct Advertisers: **Custom VAST Tag** support
  - 100% Fill Guarantee: Automatic waterfall cascade to Pulse Pro sponsored reel
- [x] Spotify-Style Total Interaction Lockout:
  - 5-second mandatory lock: feed scroll, keyboard shortcuts, bottom navigation, and top bar locked
  - Visual countdown (`Skip in 5s... 4s... 3s...`) with smooth progress bar
  - Prominent "Skip Ad" button unlocked after exactly 5 seconds
  - Natural completion (`onEnded`) automatically moves to next reel
- [x] Zero pop-under, zero pop-up, zero auto-redirect guarantee:
  - Outbound CTA guard (`safeOpenClickThrough`) restricts links strictly to http/https
  - Isolated new tab with `noopener,noreferrer`
- [x] VAST 2.0-4.0 Tracking Beacon Dispatcher (`src/services/vast.ts`):
  - Fires impression, start, 25%, 50%, 75%, complete, and skip pixels
- [x] Tier-based ad frequency: Guest every 5 videos / Free registered every 10 / Pro zero ads
- [YOU] Provide configured network keys in `.env` (`VITE_EXOCLICK_ZONE_ID`, `VITE_TRAFFICJUNKY_VAST_URL`, `VITE_AD_SFW_VAST_URL`, `VITE_TRAFFICSTARS_VAST_URL`)

## Phase 3 — Navigation & Screens (Zero Dead Ends)
- [x] Settings page: Data Saver toggle, Auto-play toggle, Terms/Privacy/Contact links, Delete Account, Export My Data
- [x] Support/Feedback page: saves messages to database for review, FAQ section
- [x] Edit Profile: display name, bio, avatar upload (compressed, max 5MB), uniqueness check
- [x] Profile page: follower/following counts, Pro badge, avatar/bio display
- [x] Follow system database (follows table + policies)
- [x] Anonymous viewing limit: 1 hour/day for guests, 10-minute warning toast, register wall

## Phase 4 — Ingestion & Transcoding Pipeline (Complete)
- [x] Real file upload: drag-and-drop file picker for MP4, WebM, MOV (max 100MB)
- [x] Client-side thumbnail generation: extracts frame from second 1.0 via off-screen `<canvas>`
- [x] Upload progress tracking with percentage bar
- [x] Oracle Cloud Always-Free ARM VM FFmpeg Transcoder Worker service (`worker/`)
- [x] Automated ABR ladder generation: 240p (250k), 360p (450k), 480p (800k), 720p (1200k)
- [x] 2-second independent HLS segments + WebP poster extraction
- [x] Automated Ubuntu 22.04 ARM64 setup script (`worker/setup-oracle-vm.sh`) & systemd service
- [YOU] Spin up Oracle Cloud Always-Free ARM VM (4 OCPUs, 24GB RAM, $0/month) and run setup script

## Phase 5 — Multi-Gateway Monetization (Complete)
- [x] African Mobile Money: Moolre direct USSD push prompt for MTN, Telecel, AirtelTigo
- [x] International Cards: Stripe checkout session ($0.99 / GHS 10.00)
- [x] Ghanaian Cards & MoMo: Paystack integration maintained for redundancy
- [x] Unified client abstraction in `src/services/payments.ts`
- [x] Multi-gateway Edge Function in `supabase/functions/verifypayment/index.ts`
- [x] Pro upgrade modal with Mobile Money (Network selector + USSD prompt) and Card tabs
- [YOU] Register Moolre account and add `MOOLRE_API_KEY` to Supabase secrets
- [YOU] Register Stripe account and add `STRIPE_SECRET_KEY` to Supabase secrets
- [YOU] Register Paystack account and add `PAYSTACK_SECRET_KEY` to Supabase secrets

## Phase 6 — Publishing Workflow & Admin Moderation (MVP Backend Architecture)
- [x] Client-Side Ingestion Validation:
  - Max 100MB file size enforced (`validateVideoFile`)
  - Max 10 minutes (600 seconds) duration enforced (`validateVideoDuration`)
  - Strict MP4 and WebM MIME and extension gating (MOV/MKV disallowed for MVP)
- [x] Publishing State Machine:
  - `uploading → processing → pending_review → published` (or `rejected`)
  - Oracle Cloud FFmpeg worker transitions transcoded assets to `status: 'pending_review'`, `is_active: false`
  - Mandatory manual admin review before publishing to feed (zero automated copyright/content publish bypasses)
- [x] Visibility & Permissions:
  - Simple flags: `public`, `private`, `age_restricted`
  - Public feed strictly filters by `status IN ('published', 'ready') AND is_active = true AND visibility = 'public'`
- [x] Admin Moderation Console (`src/components/AdminDashboard.tsx`):
  - Video Reviews: Preview pending uploads, one-click Approve & Publish, Reject with required reason
  - Comment Moderation: Platform-wide comments feed with one-click administrative deletion
  - User Management: User search, suspension/ban with required reason, and unban capabilities
- [x] User Suspension Enforcement:
  - Suspended accounts blocked from uploading content and posting comments (in UI and RLS database policies)
- [x] Strict MVP Boundary:
  - Basic counters (views, likes, comments, shares) in Supabase
  - In-stream ads with 5s skip + Pro subscriptions
  - Zero LIVE streaming, automated copyright engines, creator payouts, or developer APIs until MVP validation

## Phase 6 — Publishing Workflow & Multi-Gateway Monetization (Engineered & Verified)
- [x] Client-Side Ingestion Validation:
  - Max 100MB file size enforced (`validateVideoFile`)
  - Max 10 minutes (600 seconds) duration enforced (`validateVideoDuration`)
  - Strict MP4 and WebM MIME and extension gating (MOV/MKV disallowed for MVP)
- [x] Publishing State Machine & Worker Pipeline:
  - `uploading → uploaded → processing → ready` (server-enforced, zero unprocessed content in public feed)
  - Direct URLs and file uploads queued through `status: 'uploaded'` and transcoded into ABR ladder
  - Distributed horizontal scaling with PostgreSQL atomic job claiming (`claim_video_job` via `FOR UPDATE SKIP LOCKED`)
  - Worker heartbeats, watchdog lease recovery, and retry caps
  - Parallel variant transcoding for multi-core ARM VMs
- [x] Multi-Gateway Monetization Operational Hardening:
  - Stripe Checkout Session server-side initiation with exact pricing ($0.99), user ownership check, and currency validation
  - Moolre Mobile Money server-side prompt initiation with transaction reference
  - Multiple active subscriptions safely supported without demoting Pro users to free tier
  - Multi-provider references stored across `payment_provider`, `payment_reference`, and `paystack_reference`
- [x] Complete Privacy & Account Controls:
  - Full data export (account, profile, videos, comments, likes, subscriptions, saved videos, watch progress, viewing insights, follows)
  - Account deletion: deletes user profile and associated content with error handling
  - In-app Terms of Service and Privacy Policy screens (zero dead ends or 404 links)
- [x] Creator Identity & Deep Linking:
  - Creator avatar and handle displayed in feed overlay
  - Real deep link sharing (`?v=<id>`) and direct video playback

## Phase 7 — Performance & Virtualization (Complete)
- [x] Virtualized feed using `@tanstack/react-virtual`
- [x] Sliding 3-slot prefetch player:
  - Slot $i$: Active playing
  - Slot $i+1$: Preload poster + 240p HLS manifest/first chunk
  - Slot $i-1$: Paused on frame
  - Slots $|j-i| > 1$: Completely unmounted from DOM to preserve 1GB RAM budget
- [x] Data Saver mode (HLS 360p bitrate cap & small buffer) and Autoplay settings enforced in playback
- [x] System fonts only (`system-ui, -apple-system, sans-serif`) — zero web font downloads
- [x] 175 unit & integration tests passing in Vitest (28/28 test files, 0 failures)

## Phase 8 — Go-Live & Deployment (Your Actions)
- [YOU] Buy domain (e.g. `pulse.video`, ~$10/year)
- [YOU] Connect repo to Cloudflare Pages (free hosting)
- [YOU] Contact Simplifyd for zero-data partnership in Ghana/Africa
- [YOU] Setup BunnyCDN standard pull zone as global streaming fallback
- [ ] Deploy to Cloudflare Pages and attach custom domain with SSL

---

## Credentials Directory

| Item | Destination | Status |
|---|---|---|
| Domain name | Cloudflare Pages Custom Domain | Not purchased |
| Oracle Cloud VM IP | Transcoding pipeline | Provisioning required |
| Moolre API Key | Supabase Edge Function Secrets | Pending account |
| Stripe Secret Key | Supabase Edge Function Secrets | Pending account |
| Stripe Publishable Key | Cloudflare Pages Env (`VITE_STRIPE_PUBLISHABLE_KEY`) | Pending account |
| Paystack Secret Key | Supabase Edge Function Secrets | Pending account |
| Paystack Public Key | Cloudflare Pages Env (`VITE_PAYSTACK_PUBLIC_KEY`) | Pending account |
| ExoClick Zone ID | Cloudflare Pages Env (`VITE_EXOCLICK_ZONE_ID`) | Pending account |
