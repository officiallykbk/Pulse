# Pulse mobile video card: direct visual parity audit

**Date:** 10 November 2026 · **Primary reference:** TikTok · **Secondary reference:** Instagram Reels

**Assessment:** Pulse already has the recognizable full-screen video, creator avatar, right-side actions, and bottom navigation. The main visual gap is the hierarchy: the brand/Pro header attracts attention, the action rail is short and sits low, and the creator/title/description stack feels small and dense. The largest usability gaps are measurable: mobile navigation covers the comment composer, landscape controls overlap, and the phone progress bar is hidden behind navigation.

**Follow-up design direction:** the side rail may expose too few useful actions compared with the references. **Restoring a visible Save button is the recommended proposal. Replace the visible `more_horiz` / `MoreHorizontal` ellipsis with a Share button using the paper-plane treatment seen in the inspected Reels reference.** The fuller rail must work across small and large phones, short landscape screens, and tablets; consistent behavior across screen sizes is an acceptance requirement for the implementation.

Recommended rail to validate: **Creator/Follow → Like → Comments → Save → Share**. Save restores an existing useful capability to the card, and Share becomes recognizable without opening More. This is the proposed design direction; the screenshots below document the current implementation.

These conclusions come from looking at the rendered interfaces. They are a design assessment and browser inspection, not a user-preference study or a claim about conversion rates.

![Direct comparison of TikTok, the current Pulse UI, and Instagram Reels](../output/playwright/video-card-visual-comparison.png)

## Evidence and scope

- **Pulse:** built and rendered the workspace application, including the existing local video-card/navigation edits. Inspected the public mock feed with its own local media, then the same application with a neutral natural-video fixture and synthetic creator/count/comment data. The application layout and styles were not changed for the comparison. HEAD at the final source inspection was `ccf8ea3`; the workspace also contained local edits.
- **TikTok:** directly inspected official published iPhone recipe/pet images and a tablet landscape image. The live mobile website loaded navigation and an app prompt, but did not supply a video card after dismissal. The card comparisons therefore use **published native-app artwork**, whose original capture dates are unknown.
- **Reels:** directly inspected official published phone and tablet/comments images. These show a useful alternative visual treatment; they do not prove that every Instagram client has identical chrome.
- **Shorts:** inspected YouTube's official listing image, but its old-looking device, Library navigation, and promotional copy make it unsuitable as a current styling benchmark. It is documented in the reference research and given little weight here.
- **Browser coverage:** 13 distinct CSS viewport configurations using a coarse-pointer mobile Chromium session. Browser version: `157.0.8103.40`; the session emulated a Pixel 10 user agent. These are viewport checks, not 13 physical-device tests.

The first local Pulse capture showed unavailable media because the deployed mock-media host rejected cross-origin embedding from localhost. That is an **audit-environment limitation**, not evidence of a production playback outage. The normal-state assessment uses successfully loaded local media. The neutral flower fixture is [MDN's CC0 sample](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4), with portrait and square derivatives, and is explicitly labeled as a fixture.

The complete [platform reference note](VIDEO_CARD_PLATFORM_RESEARCH.md), [image source manifest](../output/playwright/platform-reference/visual-source-manifest.json), and [crop manifest](../output/playwright/platform-reference/visual-crop-manifest.json) record provenance. Reference crops remove marketing surrounds; the boards preserve aspect ratios and do not redraw competitor UI. Rounded outer corners in store artwork belong to its presentation and are not evidence that Pulse's phone feed should be rounded. Text/icon proportions are qualitative visual references, not measurements of native CSS pixels, dp, or sp.

## What feels different

| Area | What the inspected reference shows | What Pulse currently shows | Assessment |
|---|---|---|---|
| Video stage on portrait phones | Video fills the available width; controls stay around its edges. | Full-width footage without an outer card frame at phone widths. | **Aligned foundation.** Keep it. |
| Header | TikTok uses light feed-navigation text over the image. Reels also emphasizes content navigation. | A red logo, brand label, circular search background, filled red Pro CTA, and a detached mute circle below. | **Needs refinement.** The upgrade/brand chrome carries more visual emphasis than the reference header. |
| Creator affordance | TikTok's right-side circular avatar has an attached follow plus. | A closely related avatar/follow treatment. | **Visually close.** This is not a reason to redesign the entire card. |
| Action rail | TikTok exposes heart, comments, bookmark, share, and audio identity; Reels exposes a consistent set of outline actions, including a paper-plane Share icon. | Avatar, heart, comments, and an ellipsis. Share and Save require opening More. | **Partial; may expose too few primary actions.** Restore Save as the preferred proposal and replace the ellipsis with a recognizable Share button. |
| Rail proportions | The TikTok reference extends its action group farther up the right edge. | At 390 × 844, the rail spans y=553–772: 219 px, concentrated low in the frame. | **Different visual balance and action coverage.** A visible Save button makes the rail more useful and fuller. Its layout must adapt to available height while keeping primary actions reachable. |
| Text hierarchy | TikTok groups creator, a short caption when present, and audio. Reels groups creator and caption compactly. | Creator + separate bold title + muted two-line description. Phone title is 14 px; description is 12 px. | **Needs refinement.** Three tiers feel more like metadata attached to a player; the smallest text is visually subordinate. |
| Long descriptions | The still images establish compact presentation, not expansion behavior. | Description is clamped to two lines on both the card and options sheet; the card has no explicit expansion control. | **Pulse usability gap.** Offer a clear way to read the complete description. |
| Navigation | TikTok has a quiet black bar with an emphasized creation action; the inspected Reels image has a translucent dock. | Three destinations on a 66 px black bar; Upload is a subdued icon, while Pro is the prominent colored CTA. | **Valid simpler navigation, different emphasis.** Three destinations are appropriate to Pulse's actual features. |
| Comments | Tablet references place comments alongside the portrait video. | On phones, navigation covers the composer. On tablets, comments cover the existing narrow viewer while the right side stays empty. | **Confirmed phone failure; tablet composition gap.** |
| Landscape/tablets | Published tablet layouts preserve a portrait video and arrange surrounding navigation/comments intentionally. | A width-only breakpoint switches to a 440 px column at x=108, even on a short landscape phone. | **Responsive gap.** The wider layout needs an explicit composition. |

The current heart is outlined when unliked and the comment glyph is filled. That can be a purposeful state distinction; it is not automatically a defect. A redesign should choose a consistent visual grammar rather than mix every familiar treatment from the references.

## Confirmed problems, in priority order

### 1. P1 — Bottom navigation covers the comment composer

At **390 × 844**, the navigation occupies y=778–844. The comment textarea occupies y=779–803, and Send occupies y=788–832. Hit-testing the textarea's center selects **Upload**; hit-testing Send selects **Profile**. The same problem occurs at **320 × 568** and the short **390 × 520** viewport.

This blocks the central action of the comments UI before a software keyboard is even involved. The screenshot is not just a cramped-looking panel: its controls are physically covered.

Source explanation: [CommentsSheet.tsx](../src/components/CommentsSheet.tsx) renders a fixed sheet inside the transformed virtual feed item in [VideoFeed.tsx](../src/components/VideoFeed.tsx). [BottomNav.tsx](../src/components/BottomNav.tsx) sits above that item's stacking context. The sheet's local z-index cannot escape the ancestor. By comparison, [VideoOptionsSheet.tsx](../src/components/VideoOptionsSheet.tsx) uses a body portal, and its main actions remained visible at both tested phone widths.

**Recommended change:** give comments the same deliberate overlay ownership as other global sheets; make its composer and Send visible above navigation and the real software keyboard. Verify focus containment and scroll behavior after the change. Raising only the sheet's local z-index is insufficient.

Evidence: [390 px comments](../output/playwright/pulse-audit/comments-390x844.png), [320 px comments](../output/playwright/pulse-audit/comments-320x568.png), [measurements](../output/playwright/pulse-audit/comments-measurements.json).

### 2. P1 — Sound covers Follow in short landscape layouts

At **667 × 375** and **844 × 390**, the sound button occupies the creator avatar area. The center of the Follow target resolves to **Unmute sound**. The independently positioned top mute control and bottom-anchored rail converge as available height decreases.

There is also a second player-level mute button behind the Pro control in the normal phone layout. It is present in the DOM and hit-test results, but is **not a second clearly visible sound button** in the clean portrait screenshot.

**Recommended change:** use one mute control, with one owner, and a layout that accounts for both height and width. Compact or reposition secondary controls before the action rail reaches the header. Preserve a distinct, reachable Follow target.

Sources: [VideoCard.tsx](../src/components/VideoCard.tsx), rail/mute offsets; [VideoPlayer.tsx](../src/components/VideoPlayer.tsx), additional mute control. Evidence: [landscape screenshot](../output/playwright/pulse-audit/natural-landscape-844x390.png), [viewport measurements](../output/playwright/pulse-audit/viewport-measurements.json).

### 3. P2 — The progress bar is underneath phone navigation

At **390 × 844**, the 2 px progress track is at y=786–788. Navigation begins at y=778 and covers it. Hit-testing the track returns Main navigation. The source anchors progress 56 px from the bottom while the rendered navigation is 66 px tall.

**Recommended change:** reserve a single measured navigation/safe-area boundary for progress, metadata, and actions. Place the progress track above navigation. Scrubbing is a separate product enhancement; the existing bar is currently a display-only element.

Sources: [VideoPlayer.tsx](../src/components/VideoPlayer.tsx), [BottomNav.tsx](../src/components/BottomNav.tsx). Evidence: [extra measurements](../output/playwright/pulse-audit/extra-measurements.json).

### 4. P2 — The tablet breakpoint creates an abrupt, unbalanced composition

At **767 × 700**, the video stage is full width. At **768 × 700**, the layout switches to a narrow column and side navigation. At **1024 × 768**, the column is 440 px wide, begins at x=108, and leaves **476 px** to its right. Opening comments puts the panel over that column, leaving the right-side space unused.

The problem is the unassigned space and abrupt composition change, not the use of a bounded portrait viewer. TikTok's and Reels' inspected tablet images also bound their video stages, but give adjacent space a clear role.

**Recommended change:** define separate portrait-phone, short-landscape, and roomy-tablet compositions. Center the stage when no auxiliary panel is open; use adjacent space for comments when it fits. Base the transition on available height and the space needed by the video and panels, not width alone.

Source: [index.css](../src/index.css), especially the 768 px media query, 440 px maximum width, and 24 px rail gap. Evidence: [767 px](../output/playwright/pulse-audit/natural-767x700.png), [768 px](../output/playwright/pulse-audit/natural-768x700.png), [tablet](../output/playwright/pulse-audit/natural-tablet-1024x768.png), [tablet comments](../output/playwright/pulse-audit/comments-tablet-1024x768.png).

### 5. P2 — A single cover rule crops mixed-aspect footage heavily

The player uses `object-cover` for every source. Measured at **390 × 844**:

| Source | Frame | Source width retained in the rendered box |
|---|---|---:|
| Portrait | 360 × 640 | 82.1% |
| Landscape | 960 × 540 | 26.0% |
| Square | 480 × 480 | 46.2% |

These percentages describe geometric cropping, not video quality scores. For a 9:16 source in the 440 × approximately 359 px landscape stage, the cover rule retains only about **45.9% of the source height**. At 667 × 375, it retains about **31.6%**. This can remove faces, hands, embedded text, and context.

**Recommended change:** adopt an explicit aspect-ratio policy. Portrait footage can fill the portrait stage; landscape and square material need an intentional fit treatment or an explicit viewer/creator choice. Preserve the subject instead of enlarging every source to the full box. Competitor artwork supports preserving portrait composition, but does not reveal its exact media-fit algorithm.

Source: [VideoPlayer.tsx](../src/components/VideoPlayer.tsx). Evidence: [source-fit measurements](../output/playwright/pulse-audit/extra-measurements.json), [landscape source on phone](../output/playwright/pulse-audit/source-landscape-390x844.png).

### 6. P2 — Header, sharing, and caption hierarchy need a coherent visual pass

This is the clearest appearance finding, separate from the failures above:

- **Header:** reduce the visual emphasis of the filled Pro CTA and button backgrounds. Use the limited top area to orient the viewer. Pro already has a natural home in account/upgrade flows. Do not introduce a nonfunctional Following tab to imitate a reference.
- **Rail:** use **Creator/Follow → Like → Comments → Save → Share** as the proposed sequence. Recommend restoring a visible bookmark/Save button, with a clear saved state and the existing save behavior. The short current rail may be omitting useful primary actions; the reason to add Save is quick access as well as better visual balance.
- **Share replacement:** replace the visible `more_horiz` / `MoreHorizontal` ellipsis with a recognizable paper-plane Share button, following the inspected Reels treatment. The action should invoke sharing or open a sharing-first sheet with native Share and Copy link choices. Give Report and other secondary options a clearly labeled route in that sheet. The icon, accessible label, and resulting action must all communicate Share.
- **Responsive rail:** validate the fuller rail against the caption, header, sound control, navigation, and safe areas. Keep Save and Share directly reachable in compact layouts by changing spacing or placement and, when necessary, recomposing the controls for short landscape screens. Preserve generous touch targets as the layout changes.
- **Caption:** use a clear creator → compact caption hierarchy, with an explicit expansion affordance. The current 14 px title and 12 px description can feel miniaturized beside the reference captures. Trial a readable 14–16 px caption treatment with representative long text, rather than blindly enlarging every label.
- **Creation:** give Upload a clear creation affordance and deliberate emphasis. Keep Pulse's actual three destinations; matching TikTok's five-item navigation is not a requirement.
- **Audio:** add original-sound identity only if Pulse actually has that data and destination. A decorative record icon would imply a capability the current card does not provide.

Sources: [TopBar.tsx](../src/components/TopBar.tsx), [VideoCard.tsx](../src/components/VideoCard.tsx), [BottomNav.tsx](../src/components/BottomNav.tsx), and [VideoOptionsSheet.tsx](../src/components/VideoOptionsSheet.tsx). The [320 px options capture](../output/playwright/pulse-audit/options-320x568.png) also shows how the thumbnail and statistics make More read as a details panel before it exposes sharing.

![Observed responsive problems and the tablet comparison](../output/playwright/mobile-parity-findings.png)

## Mobile coverage

All dimensions below are CSS viewport dimensions. “Fits” only describes the base feed geometry; the shared composer/progress defects still apply.

| Viewport | Observation |
|---|---|
| 320 × 568 | Base feed fits; caption is small and clamps quickly. Comments composer is covered. |
| 360 × 640 | Base feed fits; 12 px description. Shared phone progress/control ownership issues. |
| 360 × 800 | Base feed fits; short rail sits low on the taller stage. |
| 375 × 667 | Base feed fits; no document-wide horizontal overflow. |
| 390 × 844 | Main comparison; 219 px rail, 66 px navigation; covered composer and progress verified. |
| 430 × 932 | Base feed fits; larger available area does not change the caption's 12 px size. |
| 667 × 375 | Full-width short landscape; mute/follow overlap and severe portrait-source cropping. |
| 844 × 390 | Desktop-style 440 px stage on a landscape phone; mute/follow overlap. |
| 767 × 700 | Full-width composition immediately below the breakpoint. |
| 768 × 700 | Abrupt switch to the narrow stage/side-rail composition. |
| 768 × 1024 | 440 px stage at x=108; tablet width is only partly used. |
| 1024 × 768 | 476 px unused to the right; comments remain over the video column. |
| 390 × 520 | Short available-height stress case; composer still covered. **Not a real keyboard test.** |

The initial 11-case pass found no document-wide horizontal overflow. That is a useful baseline but did not detect overlapping controls; screenshots and hit-testing exposed those failures. Additional inspections covered the 768 × 700 boundary, a short viewport, two options-sheet sizes, five comments layouts, long captions, and portrait/landscape/square media.

## Constraints for the next design pass

1. **Fuller rail, no covered controls:** validate Creator/Follow, Like, Comments, Save, and Share together. Center-hit checks must resolve to the intended button in portrait, both short landscape cases, and open sheets. Comments input and Send must remain reachable. Save and Share remain visible primary actions when controls reflow.
2. **One bottom boundary:** navigation, progress, metadata, and sheet composers must share a deliberate safe-area policy. Verify with real browser chrome and home-indicator insets.
3. **Light visuals, generous targets:** the measured Search target is 36 × 36 px; mute is 40 × 40; More is 48 × 40; Pro is about 63 × 28. Like/comments are already 48 × 50.5, and the avatar is 56 × 56. Aim for roughly 44–48 CSS px interactive areas while keeping glyphs visually light. These are design targets, not TikTok measurements or an assertion that every smaller control violates WCAG AA.
4. **Readable complete content:** test long titles/descriptions and the allowed 30-character display name; provide caption expansion without colliding with the rail. Validate real bright and dark footage. A full contrast audit was not performed here.
5. **Deliberate media fit:** test all supported source ratios with faces, hands, and embedded text, not only a centered flower or calibration video.
6. **Real-device follow-through:** test iOS Safari, Android Chrome, and installed PWA mode with dynamic toolbars, actual keyboard opening/closing, notches, orientation changes, text enlargement, and reduced motion. The current viewport meta disables user scaling, and the manifest declares portrait orientation; revisit both as part of mobile accessibility. Desktop emulation does not establish their real-device behavior.

Relevant standards and primary browser guidance are linked in the [reference note](VIDEO_CARD_PLATFORM_RESEARCH.md): WCAG target size/orientation/reflow, Android touch guidance, WebKit safe areas, and Chrome's visual-versus-layout viewport behavior. Native dp, native sp, and CSS px must not be treated as interchangeable.

## Acceptance requirements for the implementation

**Status: pending implementation and validation.** Matching the references' visual polish includes keeping the card usable as screen dimensions and available viewport space change. A good-looking screenshot at one phone size is insufficient evidence of completion.

| Check | Required outcome | Verification |
|---|---|---|
| Fuller side rail | Creator/Follow, Like, Comments, Save, and Share remain visible, distinct, and reachable; the primary ellipsis is replaced by Share. | Repeat the documented 13-viewport matrix with the new rail. Capture screenshots and hit-test every action; include long captions and populated counts. |
| Save behavior | Bookmark state is clear; saving and removing from Saved use the existing behavior without toggling playback or Like. | Exercise both states with touch input, including the existing guest and signed-in cases. |
| Share behavior | The paper-plane icon, accessible name, and action agree. Native sharing or a clear copy-link fallback works; reporting remains discoverable through the secondary sheet route. | Exercise supported and unsupported Web Share cases, cancellation, Copy link, and access to Report. |
| Short landscape | The fuller rail clears the header, mute control, caption, navigation, and cutouts while retaining generous targets. | Check 667 × 375 and 844 × 390, and rotate an active feed into and out of these layouts. Check more than the initial card. |
| Breakpoints and tablets | The layout uses available width deliberately and preserves the video subject. Comments have a usable panel arrangement. | Compare 767 × 700 with 768 × 700; inspect 768 × 1024 and 1024 × 768 with comments open and closed. |
| Browser chrome and safe areas | Expanding/collapsing browser bars and home-indicator/notch insets do not hide primary controls or progress. | Check Android Chrome, iOS Safari, and installed PWA mode on physical devices. |
| Comments and keyboard | The composer and Send remain visible and tappable when the real keyboard opens, resizes, and closes. | Test on physical iOS and Android devices; a resized desktop viewport does not complete this check. |
| Content and text scaling | Long creator names, captions, enlarged text, and portrait/square/landscape sources fit without action collisions or unintended clipping. | Use representative content, including faces and embedded text, and test text enlargement up to 200%. |
| Feed continuity | Rotation, viewport changes, and opening/closing sheets preserve the intended video and stable playback/progress behavior. | Exercise these transitions while watching, paused, and farther down the feed. Record actual results rather than inferring them from still images. |

For each supported browser/device combination, record the viewport, orientation, relevant UI state, screenshot, interaction result, and pass/fail status. Resolve confirmed control collisions and inaccessible primary actions before considering the implementation complete. These checks establish Pulse's behavior; the reference screenshots supply the visual direction.

## Suggested implementation order

**First:** repair comments layering, consolidate mute ownership, add a short-landscape layout, and place progress above navigation. These have observable failure conditions.

**Second:** replace the primary ellipsis with the Reels-style Share button and prototype a restored Save button in the proposed fuller rail. Refine the header, caption hierarchy, and creation affordance with that rail in place. Retain the full-width portrait stage, existing avatar/follow motif, and compact engagement counts.

**Third:** define the tablet comments arrangement and mixed-aspect media policy, and complete the cross-device acceptance requirements above. A short usability check should ask people to find the creator, save, share, read the complete caption, comment, and rotate the phone; observe completion and mistaps before drawing conclusions about appeal or ease of use.

## Reproduction and artifacts

The browser scripts, fixture media, raw measurements, screenshots, and comparison-board generator are in [output/playwright/pulse-audit](../output/playwright/pulse-audit). They are audit tooling, not application changes or a new product test suite.

- The production build completed successfully into an audit-only output directory. It reported a bundle-size warning; this session did not benchmark playback/network performance or physical low-end hardware.
- Read-only public feed data was used initially. View/share RPCs were intercepted; the controlled pass used local response fixtures, including a synthetic signed-in session, and did not create a real account or publish any actions.
- `viewport-measurements.json` records base-feed bounds and occlusion; `comments-measurements.json` records the covered composer; `extra-measurements.json` records source fit, progress occlusion, and the browser identity.
- Comparison board: [video-card-visual-comparison.png](../output/playwright/video-card-visual-comparison.png). Responsive findings: [mobile-parity-findings.png](../output/playwright/mobile-parity-findings.png).

The evidence supports a focused refinement of the current design. It does not establish exact current native-app parity, regional UI variants, real-device keyboard correctness, production performance, or user preference.
