# Deployment Runbook

Go-live sequence. Items marked **[YOU]** need an account purchase or
registration from the owner; everything else is configuration/code.

## 0. Prerequisites checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` — all green
- [ ] `npm run build` succeeds
- [ ] Full flow smoke-tested in dev: guest feed → register → like/comment → upgrade modal opens

## 1. Domain **[YOU]**

1. Purchase a domain (Namecheap/Porkbun, `.com` or `.com.gh`, ~$10/year)
2. Required for: SSL, ExoClick publisher approval, Paystack business verification
3. Record the domain in `PRODUCTION_TODO.md`

## 2. Hosting — Cloudflare Pages

1. **[YOU]** Create a Cloudflare account (free)
2. Connect the repo (or direct-upload the `dist/` folder)
3. Build settings: build command `npm run build`, output dir `dist`
4. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (values from the project's `.env` — never commit it)
5. Attach the custom domain from step 1; enable automatic SSL
6. PWA is already configured (`vite-plugin-pwa`): icons live at `/icon-192.png`,
   `/icon-512.png` — verify they load after first deploy

## 3. Payments — Paystack

1. **[YOU]** Register a Paystack Business account (GHS settlement, Mobile Money: MTN, Vodafone, AirtelTigo)
2. **[YOU]** Add the **secret key** to the Supabase Edge Function secrets
   (server-side only; it must never reach the browser)
3. Add the **public key** as `VITE_PAYSTACK_PUBLIC_KEY` in Cloudflare env vars,
   and wire it into `src/services/paystack.ts` checkout init
4. Test mode first: run one full GHS 10.00 test transaction and confirm:
   - The `verifypayment` function returns success
   - A `subscriptions` row appears with the correct reference
   - The user's tier flips to Pro and ads disappear
5. Duplicate-reference test: re-run verification with the same reference → must
   return `alreadyVerified`, not create a second row
6. Switch to live keys only after step 4–5 pass

## 4. Ads — ExoClick

1. **[YOU]** Register an ExoClick (Magsrv) publisher account
2. **[YOU]** Create an **In-Stream Video zone** only; disable pop-under,
   pop-up, banner, and redirect formats in the dashboard
3. **[YOU]** Apply brand-safety filters (block gambling, scams, malware, extreme)
4. **[YOU]** Provide the zone ID; set it as `VITE_EXOCLICK_ZONE_ID` in Cloudflare
5. Verify with ExoClick's test VAST tag before going live
6. Confirm the no-fill fallback: empty ad response → feed skips the slot, no
   empty screen
7. Confirm skip button appears at exactly 5 seconds

## 5. Zero-data playback — Simplifyd **[YOU]**

1. Contact Simplifyd for a partnership (zero-data on MTN/Vodafone/Airtel)
2. Once negotiated, video URLs switch to their CDN; fallback remains current URLs
3. Verify playback on each carrier network

## 6. Post-deploy verification

- [ ] Lighthouse ≥ 90 Performance (low-end mobile profile)
- [ ] Slow-3G throttle: video start < 2s
- [ ] Guest flow: ad every 5 videos, register prompts on gated actions
- [ ] Free flow: ad every 10 videos
- [ ] Pro flow: zero ads
- [ ] Report submission writes a `reports` row
- [ ] Feedback form writes a `feedback` row
- [ ] Avatar upload works from a real device camera roll
- [ ] PWA installs ("Add to Home Screen") and opens standalone

## 7. Post-launch

- Monitor ExoClick fill rates + revenue in their dashboard
- Apply for TrafficJunky once traffic thresholds are met (mediation later)
- Watch Supabase free-tier usage (500MB DB, 50k MAU)
- Moderation queue (pending-videos review) is the next feature milestone
