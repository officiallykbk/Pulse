You are absolutely right. My previous assumption about adult ad networks was too broad. You correctly identified that TrafficJunky (Pornhub's ad network) and similar premium adult networks run non-intrusive, in-stream video ads that respect user experience—ads that display in dedicated slots without pop-unders or redirects unless clicked. This is the exact model you want: high-yield adult advertising with strict publisher control over placement and behavior.Let me revise the checklist with:

Cheapest possible infrastructure (cheaper than Cloudflare where viable)

Adult ad networks that match your criteria (TrafficJunky, ExoClick in-stream only, or similar)

Full publisher control (no pop-unders, no redirects, ads only in designated slots)

PRODUCTION BUILD CHECKLIST: Ghana Short-Video PlatformCRITICAL INSTRUCTION: NO DEAD SCREENSEvery button, link, and navigation item MUST lead to a functional screen or trigger a real action. No "Coming Soon," "Under Construction," or placeholder text. If a feature is not implemented, hide the UI element entirely.1. CORE ARCHITECTURE & COST OPTIMIZATIONStack Selection (Lowest Cost Possible)

Frontend Framework: React (Vite) + TypeScript + Tailwind CSS

Why: Free, fastest build time, AI-friendly, PWA capable

Cost: $0

Hosting: Cloudflare Pages (FREE) or GitHub Pages (FREE)

Decision: Use Cloudflare Pages (better PWA support, global CDN, free SSL)

Cost: $0

Database & Auth: Supabase (Free Tier: 50,000 MAU, 500MB DB)

Why: Free tier sufficient for MVP, built-in Auth, easy AI integration

Cost: $0 until 50k users

Video Storage & Delivery: Simplifyd (Ghana-specific) or BunnyCDN fallback

Primary: Simplifyd (zero-data playback on MTN/Vodafone/Airtel) [Critical for Ghana market]

Fallback: BunnyCDN ($0.005/GB, 1TB free tier initially)

Cost: $0 initially (Simplifyd free tier 10GB, BunnyCDN free 1TB)

Video Encoding: FFmpeg (self-hosted on VPS or client-side via FFmpeg.wasm)

Why: Avoid paid encoding services

Cost: $0 (open source)

Domain: Namecheap or Porkbun (.com ~$10/year)

Why: Required for SSL, Trust, Paystack/Ad network verification

Cost: ~$10/year

Payment Processing: Paystack (Mobile Money: MTN, Vodafone, AirtelTigo)

Fees: 1.5% + GHS 2 per transaction (deducted from revenue)

Cost: $0 upfront

Total Initial Cost: ~$10 (domain only)2. AD NETWORK STRATEGY (Adult Content, Non-Intrusive)Selected Ad Networks (Publisher-Controlled, In-Stream Only)Based on research, these networks meet your criteria:

TrafficJunky (Pornhub's ad network) - Premium adult, in-stream video only, strict publisher control Spilnoagency

ExoClick - In-stream video with VAST, skip button mandatory after 5s, no pop-unders if configured correctly Exoclick

D4RKW3B - High-risk ad network with in-stream video, brand-safe filters, CPM $2.10-$22.00 D4rkw3b

AD-SFW - Vetted premium adult advertisers only, "Adult Safe for Work" policy, tailored ad zones Ad-sfw

Ad Integration Rules (MUST FOLLOW)

NO Pop-unders, NO Pop-ups, NO Redirects, NO Auto-redirects

Ads ONLY in designated video player slots (between content videos)

Skip Button: Mandatory after 5 seconds (VAST parameter must be set) Exoclick

Frequency Control:

Anonymous: Ad every 5 videos

Free Registered: Ad every 10 videos

Pro: ZERO ads

Content Control: Block categories (gambling, scams, malware, extreme content) via ad network dashboard

Fallback: If no ad available (fill rate issue), skip ad slot and show next content video

Implementation Plan

Start with ExoClick (easier approval, good fill rates in Africa)

Configure In-Stream Video Only:

Use VAST 4.0 compliant player

Set skip button to appear after 5 seconds Exoclick

Disable all pop-under, pop-up, and redirect formats

Apply for TrafficJunky (requires higher traffic, but better rates)

Mediation: Later, use ExoClick's mediation to add TrafficJunky, D4RKW3B, or AD-SFW as secondary networks

3. USER TIERS & AUTHENTICATION (FUNCTIONAL)Tier System

Anonymous Tier:

Auto-generated JWT token on first visit (no email/phone required)

Restrictions: High ad frequency (every 5 videos), no profile customization, no persistent likes/follows (local storage only), limited to 1 hour of viewing per day

Goal: Drive registration

Registered Free Tier:

Email/Phone verification via Supabase Auth

Benefits: Lower ad frequency (every 10 videos), persistent profile, likes, follows, comments, unlimited viewing

Goal: Build user base, monetize via ads

Pro Tier:

Paid subscription via Paystack (Mobile Money)

Benefits: ZERO ads, priority support, exclusive content (if any), unlimited everything

Pricing: GHS 10/month or GHS 100/year

Goal: Revenue generation

Implementation Requirements

 Create useAuth hook that strictly enforces tier restrictions

 All ad logic MUST reference this hook

 If user tries to access Pro features without subscription, show ProUpgradeModal

 Anonymous users must see a banner: "Register to reduce ads and unlock unlimited viewing"

 Registered users must see: "Upgrade to Pro for ad-free experience"

4. REQUIRED FUNCTIONAL SCREENS (NO DEAD ENDS)A. Onboarding & Auth Flow

 Splash Screen: Logo + "Loading" (checks auth state)

Functional: Auto-generates anonymous JWT if no existing session

Functional: Redirects to Home (Feed) immediately

 Home (Feed): Default screen

Functional: Shows video feed with integrated ads (ExoClick in-stream only)

Functional: Ad frequency enforced by user tier

Functional: Swipe up to next video, swipe down disabled

 Login/Register Modal: Triggered if:

Anonymous user tries to access restricted features (profile, likes, follows)

Anonymous user hits 1-hour viewing limit

Options: "Continue as Guest" (Anonymous), "Sign Up with Phone/Email" (Registered)

Functional: Supabase Auth integration for phone/email verification

Functional: On successful registration, upgrade user tier and remove restrictions

 Pro Upgrade Modal: Triggered if:

User clicks "Upgrade to Pro" button

User tries to access Pro features

Functional: Show pricing (GHS 10/month, GHS 100/year)

Functional: Paystack integration for Mobile Money (MTN, Vodafone, AirtelTigo)

Functional: On successful payment, update user tier in Supabase, immediately remove ads, show "Pro Member" badge

B. User Profile & Social (Registered Users Only)

 Profile Page:

Functional: Display username, avatar (uploadable), bio (editable)

Functional: Show "Followers" and "Following" counts (real data from Supabase)

Functional: If Pro user, display "Pro Member" badge

Functional: Settings button to change password, delete account, or logout

Functional: "Report User" button for inappropriate profiles

 Edit Profile:

Functional: Form to update username, bio, avatar

Functional: Avatar upload to Supabase Storage (max 5MB, auto-compress)

Functional: Username uniqueness check

 Follow System:

Functional: "Follow" / "Unfollow" buttons on other user profiles

Functional: Real-time update of follower counts

Functional: Feed shows content from followed users only (optional "Following" tab)

 Likes & Comments:

Functional: "Like" button on videos (real database record, prevents duplicate likes)

Functional: Comment section on videos (real database records, moderated)

Functional: Report button for inappropriate content (creates report record in Supabase, notifies admin)

Functional: Delete own comments

C. Content Upload (Admin/Verified Users Only)

 Upload Screen:

Functional: Video file selection (MP4, max 100MB, 10 minutes max)

Functional: Client-side video compression using FFmpeg.wasm (reduce to 480p, 500kbps)

Functional: Metadata input (title, description, tags)

Functional: Upload to Supabase Storage (or future Simplifyd API)

Functional: After upload, video enters moderation queue (not visible in feed)

Functional: User notified when video is approved/rejected

 Moderation Queue (Admin Only):

Functional: List of pending videos with preview

Functional: "Approve" or "Reject" buttons

Functional: Rejected videos notify user with reason (via in-app notification)

Functional: Approved videos added to feed

D. Settings & Support

 Settings Page:

Functional: Toggle "Data Saver Mode" (reduces video quality to 240p)

Functional: Toggle "Auto-play Videos" (on/off)

Functional: "About" section with links to Terms of Service, Privacy Policy, and Contact Support

Functional: "Delete Account" button (with confirmation, deletes all user data)

Functional: "Export My Data" button (downloads JSON of user data)

 Support/Feedback:

Functional: Form to send feedback or report bugs (emails to admin or creates Supabase record)

Functional: FAQ section with common issues

5. VIDEO FEED (FUNCTIONAL & OPTIMIZED)Core Requirements

 Component: VideoFeed using @tanstack/react-virtual

 Virtualization: Only render current, previous, and next video (3 DOM elements max)

 Autoplay: Video plays automatically when 50% visible

 Pause/Unload: Video pauses and releases resources immediately when <50% visible

 Preloading: Preload metadata (NOT the full video) of the next video in the queue

 Memory Management: If device has <2GB RAM, reduce buffer to 1 video

Ad Integration (ExoClick In-Stream Only)

 AdController Component:

Requests ad from ExoClick (or configured ad network) VAST endpoint

NO pop-unders, pop-ups, or redirects

Ads play only in dedicated video player slot

Skip button appears after 5 seconds (VAST parameter) Exoclick

If user skips, ad stops and next content video plays

If ad completes, next content video plays

Fallback: If no ad available, skip ad slot and show next content video

 Frequency Enforcement:

Anonymous: Ad every 5 videos

Free Registered: Ad every 10 videos

Pro: NO ads

Implementation: AdController checks user tier before requesting ad

 Ad Network Configuration:

ExoClick account required (publisher registration)

Configure "In-Stream Video" zone only

Disable all other formats (pop-under, pop-up, banner, etc.)

Set brand safety filters (block gambling, scams, malware, extreme content)

Test with ExoClick's test VAST URL before production

6. PERFORMANCE & TESTING (CRITICAL)Performance Constraints

 Lighthouse Score: Must score 90+ on Performance for "Low-end Mobile" in Chrome DevTools

 Device Testing: Must work smoothly on:

Android Go devices (1GB RAM)

3G networks (simulate in Chrome DevTools)

MTN/Vodafone/Airtel networks (zero-data verification if using Simplifyd)

 Memory Usage: Never exceed 3 video players in DOM

 Video Startup Time: <2 seconds on 3G

Testing Checklist

 Test on real low-end Android device

 Test on 3G network simulation

 Test anonymous user flow (ads should appear)

 Test registered user flow (reduced ads)

 Test Pro subscription flow (no ads)

 Test video preloading (should not crash device)

 Test ad skip functionality (must work after 5 seconds)

 Test Paystack integration (use test mode first)

7. DEPLOYMENT & POST-LaunchDeployment Steps

 Domain: Purchase domain (.com or .com.gh)

 Hosting: Deploy to Cloudflare Pages (free)

 Database: Set up Supabase project (free tier)

 Ad Network: Register for ExoClick publisher account

 Payment: Register for Paystack Business account

 Simplifyd: Contact for zero-data partnership (critical for Ghana)

Post-Launch Actions

 Monitor ad fill rates and revenue

 Apply for TrafficJunky (requires higher traffic)

 Add secondary ad networks via mediation if needed

 Implement user analytics (track retention, ad frequency impact)

 Scale infrastructure only after revenue validates costs

8. COST BREAKDOWNItemCostNotesDomain~$10/yearRequired for SSL, Trust, Ad network verificationHosting$0Cloudflare Pages free tierDatabase$0Supabase free tier (50k MAU)Video Storage$0Simplifyd free tier (10GB) or BunnyCDN free 1TBAd Network$0ExoClick pays you (CPM $2-22) [1]Payment Processing1.5% + GHS 2Deducted from revenueTotal Initial Cost~$10Domain onlyWHY THIS WORKS

Lowest Possible Cost: Everything is free except domain ($10/year)

Adult Ad Networks with Control: ExoClick, TrafficJunky, AD-SFW allow strict publisher control over ad placement and behavior D4rkw3b +2

Non-Intrusive Ads: In-stream video only, skip after 5s, no pop-unders/redirects

Ghana-Specific: Simplifyd zero-data playback is the killer feature

Scalable: Start free, scale with revenue

