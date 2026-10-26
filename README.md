# GhanaReels

A TikTok-style short-video platform built for Ghana — vertical feed, mobile-first PWA, tiered ads, and Mobile Money subscriptions.

## Quick Start

```bash
npm install
npm run dev        # start the dev server
npm test           # run the test suite once
npm run test:watch # continuous testing
npm run typecheck  # TypeScript check
npm run build      # production build (also verifies the app compiles)
```

Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are pre-configured.

## What the app does

- **Vertical video feed** — virtualized swipe navigation with native scroll snapping (one video per swipe), autoplay, and memory-safe unloading
- **User tiers** — anonymous (guest, ad every 5 videos), free (registered, ad every 10), Pro (paid via Paystack Mobile Money, zero ads)
- **Social** — likes, comments, follows, share, report content
- **Profiles** — display name, bio, avatar upload (auto-compressed), follower/following counts
- **Search** — title/description search across active videos
- **Support** — feedback/bug reports saved to the database, FAQ
- **Payments** — GHS 10/month Pro via Paystack (MTN, Vodafone, AirtelTigo), verified server-side

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, components, data flow, tier/ad/payment flows |
| [docs/DATABASE.md](docs/DATABASE.md) | Every table, column, RLS policy, and migration history |
| [docs/TESTING.md](docs/TESTING.md) | How to run tests, what each suite covers, how to add tests |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Go-live runbook: Cloudflare, domain, Paystack, ExoClick, Simplifyd |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | Screen-by-screen walkthroughs for every user journey |
| [docs/IMPLEMENTATION_DATA.md](docs/IMPLEMENTATION_DATA.md) | Original build plan and design tokens |
| [PRODUCTION_TODO.md](PRODUCTION_TODO.md) | Launch checklist tracker with owner actions |

## Project status

Core app is built and tested. Launch blockers tracked in `PRODUCTION_TODO.md`:
ExoClick publisher account (real ads), Paystack secret key (payment verification
is live but needs the key), domain purchase, and the Simplifyd zero-data partnership.
