# Pulse Manual Go-Live Runbook

This is the single operator guide for taking Pulse from this repository to a working staging deployment and, after the production gates are resolved, a public launch.

Last verified: 7 November 2026.

## 1. Current readiness

The local codebase currently passes:

- `npm run lint`
- `npm run typecheck`
- `npm test` — 308 tests across 42 files
- `npm run build`
- `npm --prefix worker run build`
- `npm --prefix worker test` — 9 tests across 2 files

Deployment is not ready yet because:

- The Supabase hostname currently stored in `.env` no longer resolves. Create or restore a Supabase project and replace both local Supabase values.
- Local `main` is 11 commits ahead of `origin/main`, with additional uncommitted changes. Cloudflare cannot deploy the current local application until the intended work is reviewed, committed, and pushed.
- GitHub CLI authentication for `officiallykbk` is expired.
- No Cloudflare Pages project, production KV bindings, custom domain, worker VM, or live merchant credentials are recorded in this repository.

## 2. Production gates — resolve these before a public launch

You can build a password-protected staging deployment while these are open. Do not enable public signups, untrusted uploads, live payments, private/18+ uploads, or live ads until they are resolved in code and covered by tests.

1. **Users can currently self-promote their profile role.** The profile update policies allow an owner to update the whole row, including `role`. Move role changes behind a privileged server operation or a separately protected role table.
2. **Uploaders can update publishing fields, and the worker auto-publishes.** The video update policy does not protect `status` or `is_active`, while [`worker/src/queue.ts`](../worker/src/queue.ts) sets `status: 'ready'` and `is_active: true`. Make the worker output `pending_review` and `is_active: false`, and prevent non-admin users from changing moderation fields.
3. **Private and age-restricted media are not storage-isolated.** The worker uses the same `videos` bucket for public, private, and restricted assets. A public bucket cannot safely contain restricted objects. Use separate public/private buckets or a private bucket plus signed delivery.
4. **Stripe is not production-complete.** The UI currently sends `1000` cents while displaying `$0.99`, and the success return is not exchanged for/verifying the Stripe Checkout session ID. Decide the intended USD price, implement the return/webhook path, and test it before adding a live Stripe key.
5. **Configured VAST endpoints are blocked by the current CSP.** Add the exact approved ad origins to `connect-src`, or fetch VAST through a controlled same-origin server endpoint. Do not use a wildcard CSP.
6. **“Delete account” does not delete the Supabase Auth user.** It removes application rows and signs out, but the login identity remains. Add a privileged deletion endpoint before claiming complete account erasure in production.
7. **Replace launch placeholders.** Replace the `bolt.new` social image in `index.html`, confirm the real domain/support email, and have the Terms and Privacy text reviewed for the actual business and content model.

## 3. Values and where they belong

Anything beginning with `VITE_` is compiled into browser JavaScript and is public. Never put a secret in a `VITE_` variable.

| Value | Secret? | Destinations |
|---|---:|---|
| Canonical app origin, e.g. `https://example.com` | No | Cloudflare `VITE_PUBLIC_APP_URL`, Supabase Auth Site URL |
| Supabase project URL | No | Local `VITE_SUPABASE_URL`; Cloudflare `VITE_SUPABASE_URL` and `SUPABASE_URL`; worker `SUPABASE_URL` |
| Supabase anon/legacy anon key | No | Local `VITE_SUPABASE_ANON_KEY`; Cloudflare `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` |
| Supabase service-role key | **Yes** | Cloudflare encrypted `SUPABASE_SERVICE_ROLE_KEY`; worker `.env` only |
| Paystack public key | No | Local and Cloudflare `VITE_PAYSTACK_PUBLIC_KEY` |
| Paystack secret key | **Yes** | Supabase Edge Function secret `PAYSTACK_SECRET_KEY` |
| Moolre API key | **Yes** | Supabase Edge Function secret `MOOLRE_API_KEY` |
| Stripe secret key | **Yes** | Supabase Edge Function secret `STRIPE_SECRET_KEY` after the Stripe gate is fixed |
| ExoClick zone ID or VAST URL | Public client configuration | Cloudflare `VITE_EXOCLICK_ZONE_ID` or `VITE_EXOCLICK_VAST_URL` |
| Other VAST URLs | Public client configuration | Corresponding optional `VITE_*_VAST_URL` variables |
| Age token store | Binding | Cloudflare KV binding named exactly `AGE_VERIFICATIONS` |
| Rate-limit store | Binding | Cloudflare KV binding named exactly `RATE_LIMITS` |
| CDN origin hostname | No | Worker `CDN_BASE_URL`; leave unset for initial staging |

The current code does **not** use `VITE_STRIPE_PUBLISHABLE_KEY` or `MOOLRE_ACCOUNT_NUMBER`. Do not add obsolete values just because older documentation mentions them.

## 4. Stage A — settle identity, ownership, and launch mode

Decide and record these before opening provider accounts:

- [ ] Legal/business name used for merchant KYC and platform policies
- [ ] Canonical domain
- [ ] Support mailbox, normally `support@<domain>`
- [ ] No-reply/auth mailbox for Supabase SMTP
- [ ] Initial admin email
- [ ] Exact Pro prices in GHS and USD
- [ ] Whether launch is private staging, invite-only beta, or public production
- [ ] Whether public uploads and 18+ content are in scope at launch
- [ ] Who reviews uploads, reports, feedback, refunds, and takedown requests

If operating from Ghana, confirm your obligations with the Ghana Data Protection Commission and obtain appropriate legal review for user-generated content, age-restricted content, subscriptions, refunds, and advertising. Merchant providers will also require business and identity documents.

## 5. Stage B — publish the intended source to GitHub

Repository: [officiallykbk/Pulse](https://github.com/officiallykbk/Pulse)

1. Reauthenticate GitHub CLI:

   ```powershell
   gh auth login -h github.com
   gh auth status
   ```

2. Review every local change. Do not blindly commit generated files or secrets:

   ```powershell
   git status --short --branch
   git diff
   git log --oneline origin/main..HEAD
   ```

3. Confirm `.env`, worker secrets, private keys, and provider credentials are ignored.
4. Stage only reviewed files, commit them, then push `main`:

   ```powershell
   git add <reviewed-files>
   git commit -m "Prepare Pulse for deployment"
   git push origin main
   ```

5. Verify GitHub shows the same commit as local `HEAD` before connecting Cloudflare.

## 6. Stage C — create the Supabase backend

### C1. Create the project and capture keys

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and create a project.
2. Choose the closest available region that meets your latency and data-residency needs.
3. Generate a strong database password and store it in a password manager.
4. From **Project Settings → API/API Keys**, record:
   - Project URL
   - anon/legacy anon key
   - service-role/legacy service-role key
   - project reference from the project URL
5. Copy [`.env.example`](../.env.example) to `.env` and fill only the browser-safe local values.
6. Never commit `.env` or the service-role key.

### C2. Apply the database migrations

Use the repository migrations rather than pasting individual files out of order:

```powershell
npx.cmd supabase@latest login
npx.cmd supabase@latest link --project-ref <project-ref>
npx.cmd supabase@latest db push
npx.cmd supabase@latest migration list
```

All migrations under `supabase/migrations/` must appear as applied. Fix the production gates with additional migrations in the repository—do not make undocumented production-only policy changes.

### C3. Create storage buckets

The migrations create policies but do not create the buckets themselves.

In **Storage → New bucket**, create:

1. `videos`
   - Public for staging public-video playback
   - Maximum object size: 100 MB
   - Expected types: MP4, WebM, HLS playlists/segments, and WebP posters
2. `avatars`
   - Public
   - Maximum object size: 5 MB
   - Expected types: JPEG, PNG, and WebP

Do not allow private or age-restricted uploads while `videos` is public. The storage-isolation production gate must be fixed first.

### C4. Configure authentication

In **Authentication → URL Configuration**:

- Set **Site URL** to the final HTTPS origin.
- Add the Cloudflare `pages.dev` staging origin and final domain as allowed redirects.

In **Authentication → Providers → Email**:

- Keep new-user signup disabled until the role/publishing gates are fixed.
- For a private test, either create users from the dashboard or temporarily allow signup.
- For production email confirmation, configure custom SMTP and test delivery, confirmation, password reset, and spam placement.

### C5. Create the first admin

After migrations are applied, create/sign up the admin user. Then run this once in **SQL Editor**, replacing the email:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('owner@example.com');

select u.email, p.role
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('owner@example.com');
```

Do not open public registration until the role self-escalation policy is fixed and tested.

## 7. Stage D — create merchant accounts and deploy payment verification

Start with test/sandbox credentials. Switch to live credentials only after the end-to-end tests pass.

### D1. Paystack — recommended first path for Ghana

1. Complete business verification in [Paystack Dashboard](https://dashboard.paystack.com/).
2. Open **Settings → API Keys & Webhooks**.
3. Capture the test public and secret keys.
4. Set the public key locally and later in Cloudflare as `VITE_PAYSTACK_PUBLIC_KEY`.
5. Store the secret in Supabase as `PAYSTACK_SECRET_KEY`.

The current Paystack flow opens the hosted popup and verifies the returned reference server-side. It does not require a browser-held secret.

### D2. Moolre — optional primary MoMo path

1. Complete merchant onboarding with [Moolre](https://moolre.com/).
2. Request production API access for direct MoMo charges and transaction verification.
3. Confirm with Moolre that your account supports the exact operations and network codes used by the application:
   - `POST /v1/charges`
   - `GET /v1/transactions/verify/{reference}`
   - `MTN`, `VODAFONE`, and `AIRTELTIGO`
4. Store the key in Supabase as `MOOLRE_API_KEY`.

Do not assume a merchant dashboard key is sufficient; run a sandbox charge and verification with Moolre support before launch.

### D3. Stripe — optional and blocked until code is fixed

1. Confirm that your legal entity is eligible for a Stripe account in its registered country.
2. Complete verification in [Stripe Dashboard](https://dashboard.stripe.com/).
3. Use test mode first and capture the secret key.
4. Do not install the live key until the price, Checkout success handling, and payment verification production gate is resolved.

The current application creates Checkout Sessions server-side, so it does not use a Stripe publishable key.

### D4. Set secrets and deploy the Edge Function

Prefer **Supabase Dashboard → Edge Functions → Secrets** so secrets do not enter shell history. Add the keys for only the providers you are testing.

Then deploy:

```powershell
npx.cmd supabase@latest functions deploy verifypayment --project-ref <project-ref>
npx.cmd supabase@latest functions list --project-ref <project-ref>
```

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its Edge Functions. Do not create browser variables for provider secrets.

The present implementation performs explicit client-triggered verification and has no payment webhook handlers. Provider webhook URLs should not be invented; add and test webhook code before configuring them.

## 8. Stage E — deploy Cloudflare Pages and Pages Functions

### E1. Create the Pages project

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Go to **Workers & Pages → Create → Pages → Import an existing Git repository**.
3. Select `officiallykbk/Pulse` and configure:
   - Production branch: `main`
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: repository root
   - Build variable `NODE_VERSION`: `20`
4. Deploy once to obtain the `pages.dev` staging URL.

The root `functions/` directory deploys automatically as Cloudflare Pages Functions.

### E2. Add browser/build variables

Under **Pages project → Settings → Environment variables**, set these for Production. Use a separate Supabase project for untrusted preview branches, or do not expose production secrets to previews.

Required:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_PUBLIC_APP_URL=https://<final-domain>
```

Add when enabled:

```text
VITE_PAYSTACK_PUBLIC_KEY=<pk_test_or_live>
VITE_EXOCLICK_ZONE_ID=<zone-id>
VITE_EXOCLICK_VAST_URL=<optional-direct-vast-url>
VITE_TRAFFICJUNKY_VAST_URL=<optional>
VITE_AD_SFW_VAST_URL=<optional>
VITE_TRAFFICSTARS_VAST_URL=<optional>
VITE_CUSTOM_VAST_URL=<optional>
```

### E3. Add Pages Function runtime values

Add these without the `VITE_` prefix:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # encrypted secret
```

`SUPABASE_SERVICE_ROLE_KEY` must be an encrypted secret and must never appear in a build log, public variable, client bundle, issue, or screenshot.

### E4. Create and bind KV namespaces

Create two production namespaces in **Workers & Pages → KV**:

- `pulse-age-verifications-prod`
- `pulse-rate-limits-prod`

In **Pages project → Settings → Functions → KV namespace bindings**, bind them with these exact names:

- `AGE_VERIFICATIONS` → `pulse-age-verifications-prod`
- `RATE_LIMITS` → `pulse-rate-limits-prod`

Use separate `-preview` namespaces for preview deployments. Without these bindings, age tokens and rate limits fall back to isolate-local memory and are not reliable in production.

### E5. Redeploy and verify the edge API

Environment and binding changes require a new deployment. After redeploying, verify:

```text
GET  /api/auth/session     → JSON, not 404
GET  /api/age/status      → {"verified":false} on a fresh browser
GET  /watch/<invalid-id>  → branded 404/fallback page, not a static-host 404
```

Use Cloudflare Functions logs for any 5xx response. A `503` from auth/upload/payment routes normally means a missing runtime value.

## 9. Stage F — attach the domain and set up email

1. Purchase or transfer the chosen domain.
2. In **Pages project → Custom domains**, attach the apex domain and preferred `www` behavior.
3. Wait for Cloudflare SSL to become active.
4. Update `VITE_PUBLIC_APP_URL` to the canonical HTTPS origin and redeploy.
5. Update Supabase Auth Site URL and allowed redirects.
6. Create `support@<domain>` and the SMTP sender mailbox.
7. Configure SPF, DKIM, and DMARC; send test messages to Gmail, Outlook, and a Ghanaian mobile-network mailbox if available.
8. Update [`src/config/appIdentity.ts`](../src/config/appIdentity.ts), legal copy, social images, and any `pulse.video` fallback before the final source-control push.

## 10. Stage G — provision the transcoder worker

Do not start the production worker until the moderation and storage-isolation gates are fixed.

1. Create an Ubuntu 22.04/24.04 VM in [Oracle Cloud](https://cloud.oracle.com/) or another provider.
   - ARM64 or x86_64 with FFmpeg support
   - Start with 2–4 vCPU, adequate RAM, and at least 100 GB disk
   - Assign a stable public IP
   - Permit inbound SSH only from trusted administrator IPs; the worker needs no public application port
2. Add an SSH key and store the private key securely.
3. Clone the exact production commit and run:

   ```bash
   cd Pulse/worker
   chmod +x setup-oracle-vm.sh
   sudo ./setup-oracle-vm.sh
   ```

4. The setup script does not copy dotfiles through its `*` glob. Create the environment file manually:

   ```bash
   sudo install -m 600 /dev/null /opt/pulse-worker/.env
   sudo nano /opt/pulse-worker/.env
   ```

5. Set:

   ```ini
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   STORAGE_BUCKET_NAME=videos
   WORKER_ID=oracle-arm-01
   POLL_INTERVAL_MS=5000
   CONCURRENCY=1
   FFMPEG_PATH=/usr/bin/ffmpeg
   FFPROBE_PATH=/usr/bin/ffprobe
   TEMP_DIR=/tmp/pulse_worker
   # CDN_BASE_URL=https://stream.<domain>  # leave unset initially
   ```

6. Lock permissions and start the service:

   ```bash
   sudo chown pulse:pulse /opt/pulse-worker/.env
   sudo chmod 600 /opt/pulse-worker/.env
   sudo systemctl enable --now pulse-transcoder
   sudo systemctl status pulse-transcoder
   sudo journalctl -u pulse-transcoder -f
   ```

7. Upload one short test MP4 and confirm the full state transition, HLS output, poster, cleanup, and moderation state.

## 11. Stage H — ads and video delivery

### H1. Ads

1. Register the chosen publisher account and submit the final domain for review.
2. Create only an in-stream VAST video placement. Disable pop-under, redirect, interstitial, and unrelated formats.
3. Apply brand-safety and category controls suitable for the platform.
4. Fix and test the CSP production gate before setting any VAST variable.
5. Add one network at a time, redeploy, and verify fill, no-fill, skip timing, tracking, Data Saver behavior, and navigation lockout.

ExoClick can use either `VITE_EXOCLICK_ZONE_ID` or a direct `VITE_EXOCLICK_VAST_URL`. Other networks require the exact VAST tag URL issued by that network.

### H2. CDN — optional for initial staging

The worker can use direct Supabase Storage URLs, so CDN setup does not block a staging launch.

For Bunny CDN:

1. Create a Standard Pull Zone in [Bunny.net](https://bunny.net/).
2. Set origin to `https://<project-ref>.supabase.co/storage/v1/object/public/videos`.
3. Attach `stream.<domain>` and enable SSL.
4. Cache `.ts` segments for a long period; keep `.m3u8` playlists short-lived.
5. Set `CDN_BASE_URL=https://stream.<domain>` on the worker and restart it.
6. Test a newly transcoded upload; changing the worker value does not rewrite old database URLs.

Keep restricted/private media off public pull zones. Simplifyd zero-rating is a commercial partnership and should be treated as a later optimization, not a technical launch dependency.

## 12. Stage I — end-to-end acceptance test

Use test credentials and a clean browser profile.

### Platform

- [ ] Final HTTPS domain loads with no console errors
- [ ] Security headers are present on the document and API responses
- [ ] PWA installs and updates correctly
- [ ] `/watch/<video-id>` produces correct Open Graph metadata and opens the exact video
- [ ] Mobile Lighthouse result is recorded; investigate the existing large video chunk warning

### Authentication and privacy

- [ ] Signup, confirmation if enabled, signin, refresh, and signout work
- [ ] Auth tokens do not appear in Local Storage or Session Storage
- [ ] `__Host-pulse_*` cookies are Secure/HttpOnly as intended
- [ ] Age declaration remains valid across separate requests and edge locations
- [ ] Rate limits persist across requests, proving the KV binding works
- [ ] Data export is complete
- [ ] Auth-user deletion works after the deletion production gate is fixed

### Uploads and moderation

- [ ] Signed upload accepts valid MP4/WebM and rejects invalid/oversize files
- [ ] Worker claims, transcodes, and uploads HLS successfully
- [ ] Output lands in `pending_review` and remains inactive after the moderation fix
- [ ] Admin can approve/reject; ordinary users cannot alter moderation state or role
- [ ] Private/restricted media cannot be fetched through a public object URL

### Payments

- [ ] Paystack test payment charges exactly GHS 10.00 and grants one 30-day subscription
- [ ] Re-verifying the same reference is idempotent
- [ ] Moolre sandbox prompt and verification work on every enabled network
- [ ] Stripe charges the chosen price and grants Pro only after verified completion
- [ ] Failed, cancelled, refunded, or disputed payments do not leave an active entitlement

### Ads

- [ ] VAST request is permitted by CSP and provider CORS
- [ ] No-fill returns immediately without locking the feed
- [ ] Filled ads lock interaction for exactly five seconds and then allow skip
- [ ] No pop-under, redirect, or unwanted new window occurs

Do not switch provider accounts to live mode until every applicable test above passes.

## 13. Ongoing manual operations

### Daily

- Review pending videos before publication.
- Review open `reports` and new `feedback` rows in Supabase; the current admin UI does not cover both queues.
- Check Cloudflare Function errors and worker service health.
- Reconcile failed payment attempts and support messages.

### Weekly

- Review Supabase Storage growth and delete raw sources only after successful transcoding and according to a documented retention policy.
- Verify database backups/exports can be restored.
- Review banned users, rejected content, and moderation audit data.
- Test one real-device upload/playback path on a low-end Android device and slow network.

### Monthly or quarterly

- Reconcile provider payouts, refunds, disputes, and subscription entitlements.
- Rotate operational credentials according to policy and immediately after staff/device compromise.
- Review domain renewal, TLS, SPF/DKIM/DMARC, provider KYC status, and VM security updates.
- Review Cloudflare, Supabase, VM, CDN, and ad-network usage/cost limits.
- Re-run lint, typecheck, tests, production build, and the full acceptance checklist before major releases.

## 14. Launch decision

Public launch is approved only when:

- [ ] All seven production gates are fixed in source and tested
- [ ] Intended source is committed and pushed
- [ ] Supabase, Cloudflare, KV, domain, email, and worker are verified
- [ ] Live merchant and ad credentials are installed only for integrations that passed sandbox tests
- [ ] Admin/moderation/support ownership is assigned
- [ ] Backup, incident, refund, privacy, and takedown procedures have named owners

For a guided setup, run `scripts/go-live-wizard.sh` from Git Bash, WSL, Linux, or macOS.
