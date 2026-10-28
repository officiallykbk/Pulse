# User Flows

Every screen and journey as shipped. No dead ends: every button leads somewhere.

## Tiers at a glance

| | Anonymous (guest) | Free (registered) | Pro (paid) |
|---|---|---|---|
| Watch feed | Yes | Yes | Yes |
| Ads | Every 5 videos | Every 10 videos | None |
| Like / comment / report / upload | Prompted to register | Yes | Yes |
| Persistent profile, likes, follows | No (device only) | Yes | Yes |
| Data Saver / Auto-play settings | Yes (local) | Yes | Yes |

## 1. First visit (guest)

1. App opens directly on the feed — no splash gate
2. Top bar: search, Pro button; bottom nav: Feed / Upload / Profile
3. Swipe up: next video (one per swipe, native momentum); every 5th slot is an ad with a 5-second skip
4. Tap like/comment/report → **register prompt** (AuthScreen)
5. Upload tab → "Sign in to upload" screen with a sign-in button
6. Profile tab → signed-out state with a sign-in call to action

## 2. Registration / Sign in (AuthScreen modal)

1. Opens over any screen when a gated action is attempted or from Profile
2. Email + password, sign up or sign in
3. On success: tier becomes **free** — ads drop to every 10, gated actions unlock
4. Profile auto-creation happens server-side (trigger)

## 3. Watching (home feed)

- Autoplay starts for the active video; others pause and unload
- Right rail: like (double-tap on video also likes, with heart animation), comment, views, share, more options
- Share uses the native share sheet when available, else copies the link; increments the share counter
- More options (⋯): share, copy video link, **report**
  - Report → reason picker (inappropriate / spam / copyright / other) → saved to the database → confirmation toast
- Top bar search icon → SearchScreen (live title/description search, tap a result to watch)

## 4. Comments

1. Comment button (or count) → bottom sheet with the thread
2. Type + send → appears instantly; own comments show a delete button

## Discovery, saves, and continuity

- Search indexes video title, description, and extracted tags; matching public videos are ranked by full-text relevance. Transcripts stay out of scope until a trusted source and review workflow exist.
- Signed-in users can save/unsave videos in one private Saved list available from Profile. Offline downloads are not part of this milestone.
- Signed-in Watch History stores sparse resume positions; guests receive a local-device fallback. Completed videos restart from the beginning. Resume is a continuity feature, not a promise of lower data use, because seeking may fetch media segments.
- Watch-time/completion/skip signals are reduced to one aggregate viewing summary per session, covered by a 90-day cleanup policy, and sent only for signed-in users who opt in. The feed remains chronological and does not use these signals for ranking yet.
- Shared `/watch/<video-id>` links render social metadata at the edge, then open the exact video in the Pulse web app with a rendered button fallback. Native app deep linking is future work.
3. Guests: prompted to register before the sheet opens

## 5. Profile (registered)

- Header: avatar, display name, tier label, Pro badge for Pro
- Stats: videos, **followers**, following (live counts)
- Tabs: My Videos / Liked, each listing thumbnails with view+like counts
- Pencil icon → Edit Profile; gear icon → Settings

## 6. Edit Profile

- Tap avatar → pick image (JPG/PNG/WebP, auto-compressed to ≤512px JPEG)
- Display name: live uniqueness check (checkmark or "taken" warning blocks save)
- Bio: 160 characters with a counter
- Save disabled until something changed; returns to Profile with fresh data

## 7. Settings

- **Data Saver Mode** — stored per-device, honored by playback
- **Auto-play Videos** — same
- **Export My Data** — downloads a JSON of your videos, likes, comments, subscriptions
- **Delete Account** — confirmation dialog; removes owned videos/comments/likes/follows/subscriptions and signs out
- **About** — Terms of Service, Privacy Policy, Contact Support links

## 8. Support

- Category picker (General / Bug / Feature idea) + message + optional email
- Saves to the `feedback` table (works signed-out too)
- FAQ accordion: ads, fewer ads, upload review, payments

## 9. Upgrading to Pro (ProUpgradeModal)

1. Trigger: Pro button (top bar), "Upgrade to Pro" (profile), or Pro-gated actions
2. Shows GHS 10.00/month + benefits; "Subscribe with Mobile Money"
3. Paystack popup: MTN / Vodafone / AirtelTigo / card
4. On payment success, the server verifies with Paystack before Pro unlocks
5. Success: modal closes, tier = pro, ads gone, "Pro Active — Ad-Free" badge
6. Failure states show plain-language errors; nothing unlocks without verification

## 10. Uploading (UploadScreen)

1. Upload tab (registered users only)
2. Form: title, description, video URL, thumbnail URL, duration → saved and queued for review (is_active)
3. File-pick upload with compression + auto-thumbnail is the next milestone (tracked in PRODUCTION_TODO.md)

## 11. Sign out / delete

- Profile → Sign Out: returns to anonymous tier (guest rules apply)
- Settings → Delete Account: removes content and account data, returns to guest
