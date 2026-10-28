# Trust-First, Privacy-First Security & Privacy Audit

Date: 2026-10-28  
Scope: React/Vite client, Supabase client and migrations, Supabase Edge Functions, and Cloudflare Pages Functions.  
Status: Audit only. No application code or database schema was changed.

## Executive summary

The current codebase does not yet meet the requested Trust-First storage and identity boundaries.

- **High:** Supabase sessions are explicitly persisted in browser-accessible storage, and payment clients read bearer access tokens in JavaScript.
- **High:** There is no privacy-preserving age-verification gate, no `age_verified` cookie issuer/validator, and no middleware path for age-restricted content. Product policy is also inconsistent: uploads label content as `18+`, while Terms permit users aged 13+.
- **Medium:** Guest resume/watch-position data is stored in `localStorage` indefinitely without timestamps or TTL enforcement, including local duplicates for signed-in users.
- **Medium:** Anonymous users cannot save videos or view local history, and there is no anonymous-to-account migration after sign-in/sign-up.
- **Medium:** The anonymous engagement meter runs every second and writes to `localStorage` every second, even when the feed is not the active view; no daily-active streak model exists.
- **Low:** Playback/privacy preferences persist indefinitely in `localStorage` rather than using the requested session or TTL boundary.

No exact birthdate, government ID, passport, or identity-document collection was found for age verification. The optional birth-weekday selector used for Akan username suggestions is held only in React state and is not written to Supabase or browser storage.

## Audit matrix

| Required audit area | Result | Evidence summary |
|---|---|---|
| Auth/session material in Web Storage | **Fail** | `persistSession: true` with the default Supabase browser storage; access tokens are read by client payment functions. |
| Age-verification PII | **Pass for current code** | No age-verification form exists and no exact DOB/ID collection was found. Birth weekday is transient and not persisted. |
| Anonymous data retention | **Fail** | Guest resume positions use `localStorage` without timestamps, TTL, or account-deletion cleanup. |
| Age gate | **Fail** | No age modal, age cookie, issuer, validator, middleware, or restricted-content grant exists. |
| Anonymous utility and account sync | **Fail** | Save/history require authentication and signup performs no local-data merge. |
| Daily-active engagement model | **Fail** | No streak implementation; the existing guest meter increments and persists continuous seconds. |

## High-risk findings

### TF-01 — Supabase auth sessions are persisted in JavaScript-accessible browser storage

- **Risk level:** High
- **Rules:** REACT-AUTH-001, JS-STORAGE-001
- **Locations:**
  - `src/services/supabase.ts:6-10` — Supabase browser client configuration
  - `src/hooks/useAuth.ts:37-80` — `useAuth`, `getSession`, auth-state listener, sign-in and sign-up
  - `src/services/moolre.ts:30-55` — `initiateMoolreCharge`
  - `src/services/payments.ts:29-48` — `verifyPayment`
  - `src/services/paystack.ts:63-79` — `verifyPayment`
  - `src/services/stripe.ts:24-48` — `createStripeSession`
  - `supabase/functions/verifypayment/index.ts:38-64` — bearer-only Edge Function authentication

**Evidence**

```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

With no custom storage adapter, the Supabase browser client persists the session in Web Storage. Multiple payment services then obtain the session and copy `session.access_token` into an `Authorization` header.

**Impact**

Any successful same-origin XSS, compromised third-party script, or malicious extension with page access can read and exfiltrate access/refresh session material. A stolen refresh token can extend compromise beyond the lifetime of one access token.

**Fix plan**

1. Add a first-party server/BFF authentication boundary on the application origin. Browser JavaScript cannot create an `HttpOnly` cookie.
2. Exchange Supabase auth results server-side and issue a signed, opaque session cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, a narrow `Path`, rotation, and server-side expiry.
3. Configure the browser Supabase client with `persistSession: false` and `autoRefreshToken: false`, or remove authenticated direct-to-Supabase calls in favor of the BFF.
4. Stop returning or reading bearer tokens in browser code. Update payment calls to use the first-party cookie with `credentials: 'include'`.
5. Add CSRF protection to cookie-authenticated state changes: CSRF token and server-side Origin/Referer validation. `SameSite` is defense-in-depth, not the only control.
6. Restrict Edge Function CORS from `*` to the production application origin when it becomes cookie-aware or BFF-only.

**Mitigation until refactor**

Deploy a strict CSP, minimize third-party script execution, shorten token lifetime, and ensure sign-out revokes/rotates refresh tokens.

**False-positive notes**

No custom Supabase auth storage adapter or first-party session proxy was found. If one exists only in external infrastructure, verify it at runtime; it is not represented in this repository.

### TF-02 — No age-verification gate or server-enforced age cookie exists

- **Risk level:** High
- **Locations:**
  - `src/components/UploadScreen.tsx:468-479` — creators can label uploads `18+ Only`
  - `src/components/TermsScreen.tsx:37-41` — Terms allow users aged 13+
  - `supabase/migrations/20261027210000_mvp_publishing_and_admin_moderation.sql:26-36` — `age_restricted` visibility exists
  - `supabase/migrations/20261027210000_mvp_publishing_and_admin_moderation.sql:53-69` — normal anon/auth reads allow only `public`, with no verified-adult path
  - `supabase/config.toml:1-4` — only `verifypayment` is configured
  - `functions/` and `supabase/functions/` — no age cookie issuer or validator found

**Evidence**

The product exposes an `age_restricted` content classification and labels it `18+ Only`, but there is no declaration modal, cookie, opaque token, validation endpoint, or middleware. The current RLS policy avoids an immediate content leak by denying age-restricted rows to ordinary anonymous and authenticated users; only owners/admins can see them. This is deny-all behavior, not age verification.

**Impact**

The platform cannot safely deliver restricted content to eligible viewers. If access is enabled only in the client later, the control will be bypassable. The 13+/18+ policy mismatch also creates a compliance and user-expectation problem.

**Fix plan**

1. Add an `I am 18+` self-declaration modal that collects no name, birthdate, ID, or document.
2. Submit the declaration to a first-party server/Edge endpoint over HTTPS.
3. Generate a high-entropy opaque token, store only its hash/expiry server-side if revocation is needed, and set `age_verified` with `HttpOnly; Secure; SameSite=Strict; Max-Age=2592000; Path=/`.
4. Validate the cookie before returning age-restricted metadata, manifests, or signed asset URLs. Do not rely on React state or a JavaScript-readable cookie.
5. Keep the default database policy deny-by-default. Expose restricted rows only through a server path that has validated the token, or through a narrowly scoped server-issued claim.
6. Align Terms and in-product copy on the intended minimum platform age versus the separate 18+ content gate.

**False-positive notes**

Cloudflare/Supabase edge configuration outside this repository might set such a cookie, but no client integration or server validation contract for it exists here.

## Medium-risk findings

### TF-03 — Guest and signed-in watch positions persist locally without TTL or complete deletion

- **Risk level:** Medium
- **Locations:**
  - `src/hooks/useVideoProgress.ts:6-17` — local key design
  - `src/hooks/useVideoProgress.ts:60-66` — un-timestamped writes to `localStorage`
  - `src/hooks/useVideoProgress.ts:158-189` — unbounded read fallback
  - `src/components/SettingsScreen.tsx:140-170` — account deletion clears server tables but not local resume keys

**Evidence**

```ts
const key = localKey(videoId, userIdRef.current);
localStorage.setItem(key, String(Math.floor(position)));
```

The guest namespace is `pulse:resume-position:guest:<videoId>`. Values contain only a position, not `createdAt` or `expiresAt`, so they remain until the video is completed, storage is manually cleared, or the browser evicts them. Signed-in users also receive local duplicates.

**Impact**

Behavioral data remains on shared devices indefinitely and can reveal what was watched. Account deletion does not remove the local copy, so deletion is incomplete from the device user's perspective.

**Fix plan**

1. Replace direct storage access with a versioned TTL wrapper.
2. Store guest progress with `expiresAt = now + 24 hours`; prune expired entries on every read/write and app startup.
3. Limit item count and serialized size to protect low-end devices.
4. For signed-in users, prefer Supabase as the authoritative store and keep only short-lived session/memory checkpoints when possible.
5. Clear guest entries only after successful account migration; clear user-scoped local entries on sign-out and account deletion.
6. Treat all parsed storage values as untrusted and validate their schema and numeric bounds.

### TF-04 — Anonymous save and history utility is not implemented

- **Risk level:** Medium
- **Locations:**
  - `src/components/VideoCard.tsx:55-59` — the first save attempt immediately requires authentication
  - `src/hooks/useSavedVideos.ts:11-15` — anonymous users receive an empty saved list
  - `src/hooks/useWatchHistory.ts:18-22` — anonymous users receive an empty history

**Impact**

Anonymous users do not receive the promised utility and are coerced into account creation at the first save. This undermines the Trust-First model and prevents a privacy-preserving local-first path.

**Fix plan**

1. Add an anonymous saved-items store using the same 24-hour TTL wrapper, capped at five items.
2. Derive guest history from TTL-limited local progress rather than returning an empty list.
3. Keep these records minimal: video ID, position if needed, and expiry. Do not copy descriptions, profile data, or unnecessary metadata.
4. Preserve existing Supabase tables for signed-in users; no schema change is required for basic save/progress sync.

### TF-05 — No anonymous-to-authenticated migration or seamless merge exists

- **Risk level:** Medium
- **Locations:**
  - `src/hooks/useAuth.ts:53-65` — auth-state transition only updates React state
  - `src/hooks/useAuth.ts:78-80` — signup only calls `supabase.auth.signUp`
  - `src/hooks/useVideoProgress.ts:11-13` — guest and user progress use separate key namespaces
  - `src/App.tsx:251-256` — signup is wired directly with no post-auth sync callback

**Impact**

Existing guest progress becomes orphaned under the `guest` key after authentication. Future local saves would also be lost unless an explicit migration is added. Users do not get the promised seamless continuity.

**Fix plan**

1. Run an idempotent `syncAnonymousState(userId)` after a confirmed `SIGNED_IN` event, not merely after form submission.
2. Upsert saved video IDs and watch progress through existing RLS-safe tables/RPCs.
3. Resolve collisions predictably: preserve the newest progress position or completed state and de-duplicate saves.
4. Clear each local item only after the server confirms that item was stored.
5. Make the migration retryable after network loss and safe to run more than once.

### TF-06 — Conversion triggers are missing or occur at the wrong boundary

- **Risk level:** Medium
- **Locations:**
  - `src/components/VideoCard.tsx:55-59` — prompts on the first save, not after the anonymous limit
  - `src/components/AuthScreen.tsx:44-49` — generic signup copy does not explain permanent saves/device sync
  - `src/App.tsx:129-153` — a 60-minute viewing wall is the primary anonymous conversion trigger

**Impact**

The current flow blocks utility before trust is established and does not explain the value or data effect of signup. There is no trigger for `>5` local saves, impending TTL expiry, or successful post-signup merge.

**Fix plan**

1. Allow up to five TTL-limited anonymous saves.
2. On the sixth save, show the requested contextual message: `Sign up to save your content permanently and continue on other devices.`
3. Optionally notify shortly before TTL expiry without extending retention silently.
4. Carry an explicit conversion reason into the auth modal and resume the intended action after signup and sync.

### TF-07 — Continuous background-style engagement tracking conflicts with daily-active usage

- **Risk level:** Medium
- **Locations:**
  - `src/lib/viewingBudget.ts:56-69` — one-second timer and one-second `localStorage` writes
  - `src/App.tsx:42-58` — starts for every anonymous session regardless of active view and adds a five-second refresh timer
  - `src/App.tsx:129-153` — blocks viewing based on accumulated minutes

**Evidence**

```ts
this.tick = setInterval(() => {
  this.state = load();
  this.state.viewedMs += 1000;
  save(this.state);
}, 1000);
```

No `streak`, `last_login`, `last_active`, or daily-active implementation was found. The current timer does not check `document.visibilityState` and is not tied to `view === 'home'` or actual video playback.

**Impact**

The app can count time while the user is in settings/profile or while a background tab timer is merely throttled. Per-second synchronous storage writes add avoidable CPU/storage churn on low-end devices and produce inaccurate engagement data.

**Fix plan**

1. Remove continuous-minute engagement tracking and per-second persistence.
2. Record one foreground daily-active event when the user explicitly starts playback or meaningfully interacts with the feed.
3. For a streak, compare calendar dates: same day = no change, previous day = increment, otherwise reset to one.
4. Do not use background intervals. Pause all optional tracking when the document is hidden.
5. Keep anonymous daily-active state session-only or TTL-limited; sync only after account creation and clear it after successful migration.

## Low-risk findings

### TF-08 — Anonymous preferences persist indefinitely in `localStorage`

- **Risk level:** Low
- **Locations:**
  - `src/lib/settings.ts:13-24` — reads settings and legacy keys from `localStorage`
  - `src/lib/settings.ts:30-36` — writes settings without TTL
  - `src/components/SettingsScreen.tsx:38-62` — loads and saves the persistent local record

**Impact**

Data saver, autoplay, and the cached viewing-insights preference remain across browser sessions on shared devices. The data is not an auth secret, but it does not follow the requested `sessionStorage`/TTL boundary.

**Fix plan**

1. Put ephemeral UI state such as active tab, filters, modal context, and scroll restoration in `sessionStorage`.
2. Keep signed-in durable preferences in Supabase.
3. If anonymous playback preferences should survive a restart, store them through the 24-hour TTL wrapper; otherwise use `sessionStorage`.
4. Keep viewing-insights opt-in default-off and server-authoritative for signed-in users.

## Compliant or protective behavior observed

- `src/components/EditProfileScreen.tsx:248-274` collects only an optional birth weekday for local username suggestions.
- `src/components/EditProfileScreen.tsx:138-148` does not include `birthWeekday` in profile updates.
- `src/lib/ghanaianNames.ts:23-38` uses the weekday locally and documents that no birth date is collected.
- `supabase/migrations/20261027210000_mvp_publishing_and_admin_moderation.sql:53-69` currently prevents normal users from reading age-restricted rows, avoiding an immediate restricted-content disclosure.
- `supabase/migrations/20261028000000_global_discovery_saves_and_view_progress.sql:123-185` makes optional viewing insights opt-in for signed-in users and applies a 90-day opportunistic retention cleanup.
- No `age_verified`, auth token, or session ID was found in explicit application `localStorage`/`sessionStorage` calls; the auth problem comes from Supabase's persisted browser session configuration.
- No application `sessionStorage` usage was found. Existing view/modal state is mostly React memory and therefore already tab-lifetime or shorter.

## Recommended implementation order after approval

1. **TF-01:** Establish first-party cookie/BFF auth and CSRF protection before changing client consumers.
2. **TF-02:** Add the opaque 18+ cookie issuer and middleware while preserving deny-by-default RLS.
3. **TF-03/TF-04:** Add the versioned 24-hour TTL wrapper and local anonymous save/history adapters.
4. **TF-05/TF-06:** Add idempotent account sync and contextual conversion triggers.
5. **TF-07:** Replace the continuous timer with a daily-active event model.
6. **TF-08:** Move ephemeral UI state to `sessionStorage` and durable signed-in preferences to Supabase.

## Approval gate

No refactor has been applied. After audit approval, implementation should proceed one finding group at a time with tests around auth transitions, TTL expiry, age-cookie validation, CSRF rejection, offline sync retry, and non-regression of feed/playback/upload behavior.
