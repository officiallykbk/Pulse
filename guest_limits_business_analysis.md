# Guest Limits: Product, Business, and Implementation Analysis

Date: 2026-10-28  
Scope: Current guest restrictions, advertising load, viewing cap, conversion flow, privacy posture, and delivery implications.  
Method: Read-only code analysis. No production funnel or revenue data was available.

## Executive verdict

**The tiering idea is good; the present implementation is poor.**

The app has a sensible commercial ladder:

- guests can discover content without registering;
- free members receive fewer ads and social/account features;
- Pro members remove ads.

However, the guest experience currently combines too many restrictions before enough value or trust is established:

1. an ad card after every five videos;
2. a five-second mandatory lock on each ad card;
3. immediate signup prompts for the first save, like, follow, comment, report, or reply;
4. a hard 60-minute daily viewing wall.

The 60-minute control is also technically inaccurate and easy to bypass. It counts elapsed app time—not verified playback—and continues while the guest is in search, profile, settings, comments, or a backgrounded tab. It writes to `localStorage` every second. This makes it a poor cost-control mechanism and a potentially frustrating conversion mechanism.

Recommended business decision:

- **Keep** authentication requirements for uploads and public-account actions.
- **Allow** local guest saves and watch history with a 24-hour TTL.
- **Remove or convert** the one-hour wall into a soft, experimental prompt.
- **Never lock a no-fill ad card.**
- **Measure the funnel before enforcing a hard viewing limit.**

## Current guest experience

| Capability | Guest behavior | Assessment |
|---|---|---|
| Watch public feed | Allowed for 60 elapsed minutes per day | Poor implementation; questionable restriction |
| Search public videos | Allowed | Good |
| Read comments | Allowed | Good |
| Share videos | Allowed | Good; supports acquisition |
| Resume playback | Stored locally without TTL | Useful, but privacy implementation is poor |
| Save video | Signup required on first attempt | Poor; should be local-first |
| View watch history | Account required | Poor; can be local-first |
| Like | Account required | Reasonable for metric integrity |
| Comment/reply | Account required | Reasonable for abuse control |
| Follow creator | Account required | Reasonable because it requires durable identity |
| Report content/comment | Account required | Poor safety choice; reporting should be possible with anonymous rate limits |
| Upload | Account required | Correct |
| Data export/delete | Account required | Correct |
| Ads | One after every five videos, five-second lock | Aggressive; harmful when fill/revenue is absent |

## Evidence from the implementation

### Hard viewing wall

- `src/lib/viewingBudget.ts:4` sets a one-hour daily limit.
- `src/lib/viewingBudget.ts:65-69` increments elapsed time and writes to `localStorage` every second.
- `src/App.tsx:48-58` starts the tracker whenever the tier is anonymous, regardless of active view or actual playback.
- `src/App.tsx:129-153` replaces the feed with a registration wall when the counter reaches zero.

### Guest advertising load

- `src/services/exoclick.ts:3-16` inserts an ad after every five guest videos, every ten free-member videos, and none for Pro.
- `src/components/AdController.tsx:75-100` applies the five-second lock before it knows whether a revenue-producing ad was filled.
- `src/components/AdController.tsx:203-247` displays a fallback sponsor card when no video ad is available, while the lock remains active.
- `PRODUCTION_TODO.md:35` and `PRODUCTION_TODO.md:144` indicate production ad credentials/accounts are still pending in the repository checklist.

### Immediate engagement gates

- `src/components/VideoCard.tsx:55-59` requires signup on the first save.
- `src/components/VideoCard.tsx:102-137` gates double-tap and explicit likes.
- `src/components/VideoCard.tsx:170-203` gates reports, comments, and follows.
- `src/hooks/useComments.ts:131-132` gates comment creation.
- `src/components/CommentsSheet.tsx:221-224` gates replies.
- `src/components/CommentsSheet.tsx:251-254` gates helpful reactions.
- `src/components/CommentsSheet.tsx:272-277` gates comment reports.
- `src/hooks/useSavedVideos.ts:11-15` and `src/hooks/useWatchHistory.ts:18-22` return no local guest collections.

### Conversion message

- `src/components/AuthScreen.tsx:44-49` offers the generic value proposition `fewer ads and upload videos`.
- The modal does not explain permanent saves, watch continuity, other-device access, or what happens to existing guest activity.
- No code records prompt reason, prompt impressions, dismissals, signup starts, or completed signup conversions.

## What is good about the strategy

### 1. The commercial ladder is understandable

Guests, free members, and Pro members have visibly different value. Reducing ad frequency after free signup can be a valid account-conversion incentive, while an ad-free Pro plan provides a straightforward subscription benefit.

### 2. Upload authentication is necessary

Uploads create moderation, storage, transcoding, abuse, and creator-ownership obligations. Requiring a durable account here protects the platform and creators.

### 3. Public social mutations generally need identity

Likes, comments, and follows affect public metrics and other users. Requiring authentication reduces trivial spam, makes moderation actionable, and protects creator analytics.

### 4. Search, viewing, reading, and sharing remain open

These open capabilities support discovery and link-driven acquisition. The shared-link route also remains public for public content.

### 5. The 60-minute threshold is not extremely early

Many casual guests may never reach it. Therefore, the limit probably affects high-intent or highly engaged users rather than every visitor. That makes those users valuable conversion candidates—but also makes them costly users to abruptly reject.

## What is poor about the implementation

### 1. The viewing limit does not measure viewing

The tracker begins at the App level and increments once per second. It is not connected to:

- whether the home feed is open;
- whether a video is playing;
- whether the document is visible;
- whether the player is buffering, paused, or showing an ad.

A guest can lose viewing allowance while reading comments, browsing settings, searching, leaving the tab open, or encountering network buffering.

Business effect: the product can tell users they consumed an hour when they did not. This creates distrust at the exact moment the app requests registration.

### 2. The control is not enforceable

The counter is client-side `localStorage` using a client-controlled clock. It can be bypassed by:

- clearing site data;
- private browsing;
- switching browsers/devices;
- editing storage;
- blocking storage.

The implementation itself comments that the limit will not persist if storage is unavailable.

Business effect: legitimate users experience the restriction, while motivated users and automated traffic can bypass it. It is not dependable infrastructure-cost protection.

### 3. Every-second storage writes are wasteful

Synchronous `localStorage` writes every second are unnecessary on low-end devices. Multiple tabs can also race and produce inaccurate totals.

Business effect: the feature intended to protect delivery cost adds client CPU/storage work and may degrade the low-end-device experience.

### 4. No-fill ads still consume user patience

The five-second lock starts from tier configuration, not from confirmed ad playback. If all VAST providers return no fill, the user still receives a locked native sponsor card.

Business effect: the platform pays a retention cost without earning ad revenue. Until production fill is reliable, this is the most damaging part of the monetization implementation.

### 5. Guest ad density is high

An ad after every five videos means roughly one of every six feed cards is an ad: about **16.7%** of feed items. Free members see roughly **9.1%**.

At the minimum five-second lock, ads consume approximately:

| Average watched video length | Minimum session time spent locked in ads |
|---|---:|
| 15 seconds | 6.25% |
| 20 seconds | 4.76% |
| 30 seconds | 3.23% |

Actual ad time may be higher if viewers do not skip immediately.

### 6. Third-party ads weaken the low-bandwidth promise

Public Pulse media may be delivered through a zero-rated or optimized CDN, but VAST requests and ad video assets come from external ad-network domains. Those assets may consume ordinary user data and incur extra DNS/TLS/connection overhead.

Business effect: guests—the users most likely to be evaluating cost and value—receive the highest volume of potentially non-zero-rated video traffic.

### 7. Local-value actions are incorrectly gated

Saving a video and retaining short watch history do not require a public identity or server storage. They can be private, device-local, cheap, and temporary.

Business effect: the app asks for an account before allowing the guest to build personal investment. A user with five useful saved videos has a stronger reason to create an account than a user blocked on their first save.

### 8. Reporting is unnecessarily gated

Reports affect platform safety, not personal identity value. Anonymous reports can be protected with IP/session rate limits, duplicate suppression, and moderation confidence scoring.

Business effect: harmful content may remain visible because the person willing to report it is unwilling to register.

### 9. The conversion pitch is weak and context-free

Every gated action opens the same modal. It does not say:

- what action was blocked;
- what data will become permanent;
- whether the action resumes after signup;
- that content becomes available on other devices.

Business effect: the prompt emphasizes platform benefits (`fewer ads`, `upload`) rather than the user's immediate intent.

### 10. There is no evidence loop

No privacy-preserving funnel events were found for:

- guests reaching the limit;
- auth prompts by reason;
- dismissals;
- signup starts/completions;
- successful return to the blocked action;
- ad fill versus fallback;
- revenue earned before the wall;
- users abandoning at the wall.

Business effect: the team cannot distinguish a productive limit from a growth-killing limit.

## Business-delivery impact

### User acquisition

Positive:

- public watching/search/sharing allow users to understand the product before registering.

Negative:

- heavy ads and blocked interactions reduce the amount of value experienced before the account request;
- email/password-only signup adds friction at a high-emotion interruption point;
- shared-link visitors may leave rather than register after hitting a generic gate.

Expected net effect: acceptable casual discovery, weak conversion from intent-driven interactions.

### Retention

The hardest-hit guests are the most engaged users because they are the ones who reach 60 minutes. Abruptly removing the feed risks converting a high-intent session into a negative memory.

Expected net effect: the wall may produce some signup, but it likely reduces guest return rate and content habit formation unless signup completion is exceptionally strong.

### Creator growth

Requiring accounts for comments/follows protects quality, but gating likes and follows before users build commitment reduces early engagement volume. For a new creator marketplace, sparse feedback makes the platform feel empty and can discourage supply.

Expected net effect: higher signal integrity but slower visible community growth.

### Advertising revenue

The guest tier creates more ad opportunities, which is commercially rational. The hard wall then removes the most engaged guests from further ad inventory.

If ad fill is low, the current fallback lock produces no revenue. If fill is high, the third-party bandwidth burden may still reduce session length.

Expected net effect: uncertain; impossible to validate without fill, eCPM, abandonment, and signup metrics.

### Infrastructure cost

A real viewing quota can cap CDN/egress costs. This implementation cannot reliably do so because it is local, tamperable, and not tied to media delivery.

Expected net effect: small deterrence for ordinary users, little protection against abuse or determined high-volume consumption.

### Trust and privacy positioning

Forcing accounts for local-only features conflicts directly with the Trust-First promise. Continuous elapsed-time counting also creates more behavioral state than is needed.

Expected net effect: current guest limits weaken the proposed privacy differentiation.

## Recommended guest policy

### Keep authentication required for

- uploads and creator profile management;
- comments and replies;
- follows;
- public likes/reactions if metric integrity is important;
- subscriptions and payments;
- durable cross-device history and saves;
- administrative/moderation actions.

### Allow without authentication

- unlimited public feed viewing during the initial growth phase;
- search and sharing;
- reading comments;
- up to five device-local saves with a 24-hour TTL;
- device-local watch history/resume state with a 24-hour TTL;
- content/comment reporting with aggressive anonymous rate limits;
- data-saver and playback preferences with session or TTL storage.

### Change advertising behavior

1. Insert an ad card only after a VAST provider confirms fill.
2. Never show a mandatory lock for a fallback/no-fill sponsor card.
3. Consider starting guests at one filled ad per 8–10 videos until retention and bandwidth effects are measured.
4. Do not fetch/preload ad video on constrained connections unless needed.
5. Track ad bytes, fill, start, five-second completion, skip, and abandonment in aggregate.

### Replace the hard wall

Preferred approach:

- remove the hard 60-minute block;
- show a non-blocking conversion message after demonstrated value, such as five saves, a follow attempt, or repeated return sessions;
- preserve the user's pending action after signup.

If the business must retain a viewing cap for cost reasons:

- count only foreground, actively playing public video seconds;
- pause on buffer, pause, modal, search, hidden document, and ad playback;
- make it a remotely configurable experiment;
- enforce genuine cost controls at the CDN/server, not only in `localStorage`;
- provide a grace window rather than replacing the entire feed immediately.

## Measurement plan

Use aggregate, purpose-limited events. Guest events can use a random tab/session identifier stored in `sessionStorage`, not a durable fingerprint.

Required funnel events:

- `guest_session_started`
- `filled_ad_impression`
- `no_fill_ad_opportunity`
- `guest_auth_prompt_shown` with reason
- `guest_auth_prompt_dismissed` with reason
- `signup_started`
- `signup_completed`
- `pending_action_resumed`
- `guest_save_limit_reached`
- `guest_viewing_soft_prompt_shown`
- `guest_viewing_hard_limit_reached` while the experiment exists

Decision metrics:

- guest-to-signup conversion by prompt reason;
- prompt dismissal and immediate session-exit rate;
- signup completion rate;
- D1/D7 retention for guests and converted members;
- videos watched per session;
- filled-ad impressions and revenue per guest session;
- no-fill rate;
- bytes delivered per session, separating Pulse video from third-party ads;
- creator likes/comments/follows per 1,000 views;
- report submission and moderation-confirmation rate;
- CDN/egress cost per retained or converted user.

## Experiment recommendation

Run at least these variants:

### Control

Current limits, but do not lock no-fill ads.

### Trust-First variant

- no hard watch wall;
- five 24-hour local saves;
- local 24-hour history;
- signup prompts only at durable/public actions or save limit;
- ad frequency no greater than free-member frequency initially.

Compare signup conversion, retained watch time, ad revenue, egress cost, and D1/D7 retention. A higher raw signup rate is not a win if total retained users, creator engagement, or revenue per acquired visitor falls.

## Final assessment

| Area | Verdict |
|---|---|
| Three-tier business model | Good |
| Upload/account ownership gate | Good |
| Public social-mutation gates | Mostly good |
| First-save and local-history gates | Poor |
| Guest ad frequency | Too aggressive without evidence |
| Mandatory no-fill ad lock | Poor |
| 60-minute hard wall as conversion tool | Poor |
| 60-minute wall as cost control | Ineffective |
| Low-bandwidth alignment | Poor when third-party ad video is frequent |
| Funnel measurement | Missing |
| Overall | Good commercial instinct, poor current execution |

The most defensible move is to keep identity gates where identity protects the community, remove them where local storage is sufficient, monetize only confirmed ad fill, and treat any viewing cap as a measured server-side cost experiment rather than the foundation of conversion.
