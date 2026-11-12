# Video card visual reference research

Research date: **2026-11-10**. Main reference: **TikTok**. Secondary reference: **Instagram Reels**. YouTube Shorts is retained as a low-confidence historical-looking reference only.

This note supports the Pulse mobile appearance audit. It follows the request to **look directly at the interfaces**, rather than infer their appearance from help documentation. Application source files were not changed.

## What was actually inspected

I downloaded and visually inspected official App Store listing images, including individual higher-resolution phone and tablet images, and opened TikTok's public mobile website in Chromium with mobile emulation. The live website loaded its navigation and an app-promotion prompt, but no video card, even after dismissing the prompt. Consequently, **the TikTok card observations below come from inspected publisher-provided screenshots, not a successful live feed session**.

The App Store lookup results were retrieved on the research date. Their app version release dates do **not** date the screenshots. The publishers supply marketing compositions that can outlive the UI they depict. They are useful evidence of visual structure, but cannot establish the exact 2026 native-app layout, region variants, tap behavior, CSS dimensions, or breakpoints.

| Reference | Inspected artifact | Evidence type and useful scope |
|---|---|---|
| TikTok phone, recipe video | [Full published image](../output/playwright/platform-reference/tiktok-feed-published.png), [UI crop](../output/playwright/platform-reference/tiktok-feed-crop.png) | Official iPhone listing artwork. Main reference for card anatomy and visual hierarchy. |
| TikTok phone, pet video | [Full published image](../output/playwright/platform-reference/tiktok-feed-pet-published.png) | Second content example; checks that observations are not peculiar to the recipe image. |
| TikTok tablet landscape | [Published image](../output/playwright/platform-reference/tiktok-ipad-landscape-published.jpg), [UI crop](../output/playwright/platform-reference/tiktok-tablet-crop.png) | Official tablet artwork explicitly labeled “Landscape mode is here.” Shows a portrait video, left navigation, right actions, and comments pane. |
| Instagram Reels phone | [Full published image](../output/playwright/platform-reference/instagram-reels-published.jpg), [UI crop](../output/playwright/platform-reference/instagram-reels-crop.png) | Official iPhone listing artwork. Useful contemporary-looking alternative for typography, action rail, and navigation treatment. |
| Instagram Reels tablet comments | [Published image](../output/playwright/platform-reference/instagram-ipad-comments-published.jpg), [UI crop](../output/playwright/platform-reference/instagram-tablet-crop.png) | Official tablet artwork. Shows a bounded portrait viewer and a separate comments column. |
| YouTube Shorts phone | [Published image](../output/playwright/platform-reference/youtube-shorts-published.jpg) | Official listing artwork, but visibly historical-looking: home-button phone, “Library” navigation, and “less than a minute” promotional copy. **Do not use as proof of current Shorts styling or duration limits.** |
| TikTok mobile website | [Prompt](../output/playwright/platform-reference/tiktok-mobile-web-live.png), [After dismissal](../output/playwright/platform-reference/tiktok-mobile-web-dismissed.png) | Actual 360 × 720 viewport capture. Only navigation and the app prompt were observable; no live card was available for comparison. |

The [catalog contact sheet](../output/playwright/platform-reference/official-app-store-contact-sheet.jpg) includes the broader set of publisher images inspected. The [source manifest](../output/playwright/platform-reference/visual-source-manifest.json) records image URLs, source pages, sizes, and the date limitation. The [crop manifest](../output/playwright/platform-reference/visual-crop-manifest.json) records every crop. Crops remove the marketing surround; they do not redraw or restyle the product UI.

## TikTok: what makes the captured cards look coherent

These are direct observations of the recipe and pet images, not guesses about undocumented implementation. Both are published in [TikTok's official App Store listing](https://apps.apple.com/us/app/tiktok-videos-shop-live/id835599320).

| Area | Visible treatment | Design implication for Pulse |
|---|---|---|
| Main stage | The footage occupies the full inner width. There is no separate enclosing card border, drop shadow, or large inset around the phone video. | The main visual should be the video itself. Extra containers and chrome should justify the area and attention they consume. |
| Top row | Small LIVE affordance at the left, light “Following / For You” text across the upper area, search at the right. The footage continues underneath. | The header reads as navigation over content. A prominent logo plus a filled upgrade CTA creates a different emphasis even if the feed underneath is technically full-screen. |
| Active navigation | The active feed label is brighter/bolder than its neighbor. The treatment is typographic, with little background material. | A clear text hierarchy can communicate location without large capsules or a heavy toolbar. Do not add nonfunctional tabs just to imitate the screenshot. |
| Creator identity | A circular creator image sits at the top of the right rail, with a small colored follow “+” attached to its lower edge. The creator handle is repeated in the lower-left text area. | A compact creator cluster leaves most of the image clear. The avatar and its follow affordance should feel like one element. |
| Action rail | Filled white heart, comment, bookmark, and share glyphs; compact white counts underneath; consistent vertical alignment close to the right edge. | The controls feel like a single rail, rather than several unrelated buttons. The visible icon can be light even when its invisible touch target is generous. |
| Backgrounds under actions | The inspected heart/comment/bookmark/share glyphs are not each enclosed in a large dark circular button. The creator avatar and music disc are deliberately different shapes. | Large circles around every control would add visual mass absent from this reference. Distinguish action icons, creator identity, and media artwork by purpose. |
| Lower-left text | Creator handle and short metadata sit close to the bottom of the video, aligned to a common left edge. In the recipe image the creator and original-sound line are especially compact. The pet image adds a short caption. | A creator → caption → optional audio hierarchy is visually lighter than a creator → prominent title → separate multi-line description stack on every video. |
| Audio | A small music line at lower left and an image-bearing record/disc at lower right are part of the visual language. | Audio metadata has a defined place. A mute button elsewhere is playback control, not a substitute for this metadata. Add audio identity only if the product actually supports it. |
| Bottom navigation | A black strip contains five compact items. The central creation action carries the brand accent; inactive icons are subdued. | Primary navigation is stable and visually quiet. Pulse can keep its own number of destinations while controlling the strip's height and contrast. |
| Color | Most persistent controls are white or gray. Strong pink/cyan appears in small functional accents. | A persistent filled brand-color CTA high in the frame can attract more attention than the content. This is a hierarchy decision, not simply a color-palette issue. |

The attraction is not a lack of controls: TikTok's captured rail contains more than Pulse's initial observed rail. It is the **grouping, edge alignment, restrained backgrounds, and compact metadata** that keep the central subject visible.

The screenshots do not prove double-tap behavior, exact gesture tolerances, touch-target sizes, animation durations, caption expansion rules, or safe-area offsets. Those require interaction testing or separately verified documentation.

## Reels: an alternative, not another TikTok skin

The inspected [Instagram listing](https://apps.apple.com/us/app/instagram/id389801252) phone image shows a similar allocation of space: broad uninterrupted video, top navigation, lower-left creator/caption, and a right action rail. Its style differs substantially:

- The action glyphs are mostly outlines: heart, comment, repost, and send. Their stroke style is consistent. Counts sit directly underneath the corresponding symbols.
- The lower-left creator row includes a small avatar, handle, and verified mark; a short caption follows beneath it.
- The lower-right media image is a small rounded square, contrasting with TikTok's circular record treatment.
- The top shows “Reels” and “Friends,” with a creation affordance and settings/filter-style control at the outer edges.
- The inspected image has a translucent rounded bottom navigation dock floating over the content. It does **not** have TikTok's flat black strip. This is publisher artwork for one platform/device presentation, not evidence that every Reels client has that dock.

The shared useful pattern is **clear zones and consistent hierarchy**. There is no need for Pulse to mix TikTok's filled icons, Reels' dock, a separate premium-app header, and a third platform's caption stack. A coherent choice will feel more considered than accumulating familiar individual elements.

## Tablet and landscape: the strongest responsive reference

The inspected tablet images are particularly useful because they visibly change composition rather than merely stretch a phone layout.

**TikTok's landscape artwork** puts app navigation in a narrow far-left column, keeps the main footage vertically composed, places the action rail beside it, and uses a separate dark pane for comments on the right. The creator/caption/audio cluster remains associated with the video. The promotional frame is not an exact device screenshot and must not be used to infer breakpoint widths.

**Instagram's tablet comments artwork** likewise shows a bounded tall video, nearby action rail, left navigation, and a full-height comments pane. The wider screen contains intentionally used negative space. The portrait subject is not enlarged to fill the entire landscape width.

For Pulse, the practical reference is therefore: preserve a deliberate video stage, and decide what wider space is for. A side panel, navigation, or calm surrounding space can all be valid. Enlarging a portrait video until it loses most of its top and bottom would not resemble these inspected references.

For short landscape phone viewports, a width breakpoint alone is insufficient: height determines whether the avatar, action stack, caption, and bottom navigation can fit. The competitor artwork establishes the value of adaptive composition, but does not establish a specific height breakpoint for Pulse.

## Initial comparison hypotheses for the Pulse audit

I directly inspected the initial [Pulse 390 × 844 capture](../output/playwright/pulse-audit/current-feed-390x844.png). It was in a **“Video unavailable”** state with mock metadata. That state must not be compared with attractive publisher footage as if it were a fair visual-quality comparison. The parent audit should verify the following with successfully displayed media and representative short/long metadata:

1. **Header emphasis:** the Pulse logo and filled red Pro button are much more prominent than the light TikTok feed-navigation row in the reference. This can make the screen read as an application shell before it reads as a video.
2. **Text hierarchy:** Pulse's creator, prominent title, and multi-line description create a taller text block than the compact captured TikTok examples. Long content can amplify this difference, particularly on narrow phones.
3. **Control grouping:** Pulse's avatar-plus-follow treatment already resembles the TikTok reference. The detached mute control in the upper-right area and the action rail should still be evaluated as one complete visual composition.
4. **Media is essential to the assessment:** brightness, subject placement, real poster quality, and cropping can change how heavy the exact same white controls and gradients feel. A black failed-video stage is evidence of a recovery state, not evidence that the normal visual theme is unattractive.

These are appearance findings and testable hypotheses, not conversion or retention predictions. No user study or preference test was performed.

## Pulse direction added after the visual review

The user's follow-up highlights that Pulse's short side rail may expose too few useful actions. The recommended proposal is to restore a visible **Save** button and use **Creator/Follow → Like → Comments → Save → Share** as the rail to validate. Replace the visible `more_horiz` / `MoreHorizontal` ellipsis with the **paper-plane Share** treatment visible in the inspected Reels image, with a sharing action or sharing-first sheet and a clear secondary route to Report.

This is a product recommendation informed by the inspected references, not a claim that the competing platforms have identical action sets. The fuller rail must remain usable across phone widths, short landscape screens, tablets, browser chrome changes, safe areas, and real software keyboards. The [main audit](MOBILE_VIDEO_CARD_VISUAL_AUDIT.md) records the implementation acceptance requirements and the existing failures they must address.

## Mobile verification criteria derived from the visual review

The following are recommendations for evaluating Pulse; they are not undocumented claims about competitor implementations.

| Condition | What to inspect directly |
|---|---|
| Narrow phone, around 320–360 CSS px | Can the creator/caption remain readable without colliding with the action rail? Are labels and lower controls still visible? Does the brand/upgrade header consume disproportionate space? |
| Common phone, around 390–430 CSS px | Does the video feel dominant? Are icon strokes, counts, text edges, and gaps visually consistent? Is the lower block compact with typical real content? |
| Short landscape phone | Does the app recompose or collapse secondary controls before the vertical rail collides with the header/caption? Is the subject preserved? |
| Tablet portrait and landscape | Is there a deliberate portrait stage? Are navigation and comments positioned to use the available width coherently? |
| Browser toolbar expanded/collapsed | Do the bottom navigation, captions, and rail remain visible while the visual viewport height changes? Desktop resizing cannot fully reproduce mobile browser chrome. |
| Comments open with software keyboard | Does the input stay visible? Does the sheet or panel leave a coherent video context? A viewport-sized screenshot without an actual keyboard is not sufficient evidence. |
| Long creator name, long caption, bright video, dark video | Does the hierarchy remain stable? Are overlays legible and expand/collapse states usable without obscuring the main subject unnecessarily? |
| Loading, unavailable media, muted autoplay | Is the state understandable and visually intentional? Recovery UI should be evaluated separately from the loaded card. |

## Standards that should constrain visual refinements

These are platform/web standards, **not TikTok measurements**:

- **Touch targets:** WCAG 2.2 SC 2.5.8 specifies a minimum of **24 × 24 CSS pixels**, with stated exceptions including spacing. SC 2.5.5's enhanced target is **44 × 44 CSS pixels**. Android recommends an interactive area of **48 × 48 dp**. Native dp and CSS pixels are different units. Small-looking icons can live inside larger transparent targets; visual lightness need not mean difficult tapping. [W1][W2][A1]
- **Orientation:** WCAG SC 1.3.4 says content should not restrict view and operation to one orientation unless it is essential. A feed should be inspected in both phone orientations. [W3]
- **Text reflow:** WCAG SC 1.4.10 calls for reflow at a width equivalent to **320 CSS pixels**, with exceptions for content whose meaning requires two-dimensional layout. Video is a listed example; the surrounding text and controls still need careful assessment. [W4]
- **Safe areas:** WebKit documents `viewport-fit=cover` and `env(safe-area-inset-*)` for protecting controls around display cutouts and the home indicator. Inspect portrait and landscape insets; do not derive them from a cropped App Store mockup. [A2]
- **Keyboard/viewport behavior:** Chrome documents the distinction between layout and visual viewports when a software keyboard appears. A fixed bottom composer or navigation can be obscured without suitable treatment. [A3]
- **Captions:** WCAG SC 1.2.2 addresses prerecorded synchronized-media captions. TikTok also has an official accessibility page describing captions. Attractive metadata text is not a substitute for speech captions. [W5][T2]

## Source register

All sources below were accessed on **2026-11-10**. The visual findings are based on the downloaded images, not only these pages' prose.

| ID | First-party source | Verification and supporting evidence |
|---|---|---|
| T1 | [TikTok App Store listing](https://apps.apple.com/us/app/tiktok-videos-shop-live/id835599320), [Apple lookup response](https://itunes.apple.com/lookup?id=835599320&country=us) | Official publisher image URLs retrieved; phone and tablet images inspected. The tablet image visibly states “Landscape mode is here.” |
| I1 | [Instagram App Store listing](https://apps.apple.com/us/app/instagram/id389801252), [Apple lookup response](https://itunes.apple.com/lookup?id=389801252&country=us) | Official phone Reels and tablet comments images inspected. Phone artwork states “Discover entertaining videos with Reels.” |
| Y1 | [YouTube App Store listing](https://apps.apple.com/us/app/youtube/id544007664), [Apple lookup response](https://itunes.apple.com/lookup?id=544007664&country=us) | Official published Shorts image inspected. Its older-looking navigation, device, and “less than a minute” copy limit present-day relevance. |
| T-Live | [TikTok public For You mobile web](https://www.tiktok.com/foryou) | Opened with mobile Chromium emulation. Prompt said “Try out more features on TikTok Lite.” Dismissal exposed an empty feed stage; live card inspection remained unavailable. |
| T2 | [TikTok accessibility](https://www.tiktok.com/accessibility/en) | First-party accessibility content retrieved, including caption tools. Supporting background, not visual layout evidence. |
| W1 | [W3C: Target Size (Minimum), SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | “At least 24 by 24 CSS pixels,” subject to its stated exceptions. |
| W2 | [W3C: Target Size (Enhanced), SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) | “At least 44 by 44 CSS pixels,” subject to its stated exceptions. |
| W3 | [W3C: Orientation, SC 1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html) | “Content does not restrict its view and operation to a single display orientation,” unless essential. |
| W4 | [W3C: Reflow, SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Vertical scrolling content at a width equivalent to 320 CSS pixels; exceptions described on the source page. |
| W5 | [W3C: Captions (Prerecorded), SC 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html) | “Captions are provided for all prerecorded audio content in synchronized media,” with the stated exception. |
| A1 | [Android Developers: Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps) | Recommends a focusable area/touch target of at least 48 × 48 dp. |
| A2 | [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) | Primary browser-engine documentation of `viewport-fit` and safe-area environment variables. Historical origin documentation; not a modern-device screenshot. |
| A3 | [Chrome: Viewport resize behavior](https://developer.chrome.com/blog/viewport-resize-behavior) | Primary browser documentation explaining the visual/layout viewport distinction for the on-screen keyboard. |

The older Instagram Reels announcement and several other help pages were fetched during initial research, but they are not used to establish current appearance. TikTok help URLs for liking/sharing/accessibility redirected to a JavaScript shell; that shell was not treated as substantive supporting text. No native app session, native tap-target measurement, production-network performance test, or controlled usability study was performed.
