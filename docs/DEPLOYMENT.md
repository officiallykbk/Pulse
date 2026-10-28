# Pulse — Deployment Runbook & Go-Live Checklist

Go-live sequence. Items marked **[YOU]** need an account purchase or credentials from the owner; everything else is automated configuration/code.

---

## 0. Prerequisites Checklist

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` — all 175 tests green
- [ ] `npm run build` succeeds (PWA bundle + service worker generated)
- [ ] Worker unit tests in `worker/` pass (`npm test` in worker directory)

---

## 1. Custom Domain **[YOU]**

1. Purchase a domain (e.g. via Porkbun / Namecheap / Cloudflare Registrar, ~$10/year).
2. Required for: SSL certificate, VAST in-stream ad approval, Moolre/Stripe/Paystack webhook verification, and PWA installation.
3. Record the domain in `PRODUCTION_TODO.md`.

---

## 2. Frontend Hosting — Cloudflare Pages

1. **[YOU]** Create a Cloudflare account (free tier covers unlimited static bandwidth).
2. Go to **Workers & Pages** → **Create Application** → **Pages** → Connect your GitHub repository.
3. Set build configuration:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Configure Environment Variables in Cloudflare Pages dashboard:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `eyJhbGci...`
   - `VITE_PAYSTACK_PUBLIC_KEY`: `pk_live_...` (or `pk_test_...` for staging)
   - `VITE_STRIPE_PUBLISHABLE_KEY`: `pk_live_...` (or `pk_test_...` for staging)
   - `VITE_EXOCLICK_ZONE_ID`: `<your-zone-id>`
   - `VITE_PUBLIC_APP_URL`: the canonical public origin (for example `https://pulse.video`) used to build share URLs.
5. Attach custom domain (e.g. `pulse.video`) under **Custom Domains** with automatic Cloudflare SSL.
6. Add these server-side Pages Function variables (do not prefix them with `VITE_`) for `/watch/<video-id>` social preview pages:
   - `SUPABASE_URL`: the same project URL used by the browser client.
   - `SUPABASE_ANON_KEY`: the public anon key (never the service-role key).
   The route reads only active, published, public video metadata using the public key. If unset, it returns a branded fallback page without video metadata.

---

## 3. Video Transcoding Worker — Oracle Cloud Always-Free ARM VM

1. **[YOU]** Sign in to [cloud.oracle.com](https://cloud.oracle.com).
2. Provision Always-Free instance:
   - **Shape:** `VM.Standard.A1.Flex` (Ampere ARM64)
   - **OCPUs:** 4
   - **Memory:** 24 GB
   - **Boot Volume:** 100 GB NVMe
   - **OS:** Canonical Ubuntu 22.04 LTS
3. SSH into instance:
   ```bash
   ssh -i ~/.ssh/id_rsa ubuntu@<ORACLE_VM_IP>
   ```
4. Clone and run provisioning:
   ```bash
   git clone https://github.com/your-username/pulse.git
   cd pulse/worker
   chmod +x setup-oracle-vm.sh
   sudo ./setup-oracle-vm.sh
   ```
5. Configure `/opt/pulse-worker/.env` with your Supabase `SERVICE_ROLE_KEY` and start systemd service:
   ```bash
   sudo systemctl start pulse-transcoder
   sudo systemctl enable pulse-transcoder
   sudo journalctl -u pulse-transcoder -f
   ```

---

## 4. Video Delivery — Simplifyd (Primary) & BunnyCDN (Fallback)

### Simplifyd Zero-Data CDN (Africa Primary)
1. **[YOU]** Contact Simplifyd to negotiate a zero-data partnership for mobile subscribers (MTN, Telecel, AirtelTigo).
2. Configure origin: `https://<project-ref>.supabase.co/storage/v1/object/public/videos`.
3. Set custom streaming domain (e.g., `https://zero.pulse.video`).

### BunnyCDN (Global Fallback)
1. Create a Standard Pull Zone in Bunny.net.
2. Origin: `https://<project-ref>.supabase.co/storage/v1/object/public/videos`.
3. Set cache rule: 1 year for `.ts` media segments, 1 minute for `.m3u8` playlists.
4. Set hostname: `https://stream.pulse.video`.

---

## 5. Multi-Gateway Payment Configuration

### Moolre (African Mobile Money — USSD Direct Push)
1. **[YOU]** Register account on Moolre.
2. Add secrets to Supabase Edge Functions:
   ```bash
   supabase secrets set MOOLRE_API_KEY=your_key
   supabase secrets set MOOLRE_ACCOUNT_NUMBER=your_acc
   ```

### Stripe (Global Credit/Debit Cards & Apple Pay)
1. **[YOU]** Register Stripe account and activate test/live keys.
2. Add secret key to Supabase:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   ```
3. Set publishable key `VITE_STRIPE_PUBLISHABLE_KEY` in Cloudflare Pages.

### Paystack (Ghanaian Cards & MoMo)
1. **[YOU]** Register Paystack Business account.
2. Add secret key to Supabase:
   ```bash
   supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
   ```

---

## 6. Ads — ExoClick In-Stream Video Zone

1. **[YOU]** Register ExoClick publisher account.
2. Create **In-Stream Video zone** only (disable pop-under, banner, interstitial, and redirect formats).
3. Apply brand safety filters (block adult/gambling if desired).
4. Supply zone ID as `VITE_EXOCLICK_ZONE_ID`.
5. Test:
   - Ad loads and locks feed scrolling for exactly 5 seconds.
   - At 5s, Skip Ad button activates.
   - If ad fails or is empty, feed auto-advances to the next video without a dead screen.

---

## 7. Post-Deployment Verification Checklist

- [ ] **Lighthouse Mobile Score:** Run mobile audit (Moto G4 profile, 3G throttling) — verify score $\ge 90$.
- [ ] **Slow 3G Video Start:** Verify video begins playback within 2 seconds.
- [ ] **3-Slot Virtualization:** Open browser DevTools Elements panel; confirm only 3 `<video>` tags are mounted during continuous scrolling.
- [ ] **Upload Flow:** Upload an MP4 video; verify thumbnail frame is extracted client-side, upload completes, and status transitions through `uploaded` $\to$ `processing` $\to$ `ready` on Oracle Cloud worker.
- [ ] **Payments Test:** Execute test subscription via Mobile Money and Stripe; confirm `subscriptions` row created server-side and Pro status is granted without ads.
