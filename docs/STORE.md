# Shipping ThumbsUp to the Chrome Web Store

The only distribution path that works for non-technical users. Everything else (loading an unpacked
folder, self-hosted `.crx`) either requires Developer mode or is blocked outright by Chrome on
macOS and Windows.

## One-time setup

1. Register at <https://chrome.google.com/webstore/devconsole> with a Google account. **$5 one-time**
   developer fee.
2. Verify a contact email and, for a public listing, complete the publisher profile.

## Every release

```bash
npm version patch      # or minor / major — the manifest version comes from package.json
npm run package        # → release/thumbsup-<version>.zip
```

`npm run package` refuses to produce a zip if anything the store rejects is present: a version
mismatch between `package.json` and the built manifest, an over-length name or description, a
missing 128px icon, shipped source maps, `<all_urls>`, a leftover `key` field, a manifest entry
pointing at a file that is not in the build, or a missing model/WASM asset.

Upload the zip in the developer console. The store rejects a zip whose root is a folder — the script
zips the *contents* of `dist/`, which is correct.

Version numbers must increase on every upload; the store will not accept a repeat.

## Listing copy

**Name** — ThumbsUp — Gesture Reactions

**Summary (132 chars max)**
> Hand-gesture reactions for any video call. Throw confetti with a peace sign — the macOS Reactions feature, on every computer.

**Category** — Social & Communication

**Description** — reuse the top of `README.md`, then the reaction table, then the privacy paragraph.
Lead with the problem ("Apple ships this only on Apple silicon Macs") — it is the hook.

## Assets to produce

| Asset | Size | Notes |
| --- | --- | --- |
| Store icon | 128×128 PNG | `dist/icons/icon-128.png` works as-is |
| Screenshots | 1280×800 or 640×400, up to 5 | Real call showing a reaction mid-flight; at least one of the popup |
| Small promo tile | 440×280 | Optional but improves placement |
| Marquee promo tile | 1400×560 | Optional, needed for featuring |

Best screenshot: a two-person call where the *remote* participant's view shows the confetti. That is
the claim people will not believe until they see it.

## Privacy practices tab — paste these verbatim

Every field below is required before the item can be published. A vague answer here is the usual
cause of rejection, so each one names the specific feature that needs the permission.

### Single purpose

> ThumbsUp recognises hand gestures in the user's existing video-call camera feed and composites the
> matching reaction animation into that feed, so the other participants in the call can see it. It
> does one thing: turn a hand gesture into an on-camera reaction during a video call.

### Justification — `activeTab`

> Used only when the user opens the extension's popup. The popup reads the active tab's URL to show
> whether ThumbsUp is running on that site and to offer a per-site "Disable on this site" toggle,
> and it sends a message to that tab when the user presses a "Test" button to preview a reaction.
> No other tab is accessed, and nothing happens without the user opening the popup and clicking.

### Justification — host permissions

> The extension's whole function is to draw reactions into the outgoing camera stream of a video
> call, which is only possible from inside the calling page itself. The content script wraps the
> camera stream the site has already been granted, composites an animation onto it with a canvas,
> and returns it to the site.
>
> Access is limited to a fixed list of video-call services (Google Meet, Zoom, WhatsApp Web,
> Microsoft Teams, Webex, Discord, Whereby, Jitsi Meet, Slack, Around, Gather). No broad
> `<all_urls>` access is requested, and the extension does nothing on any other site. Users can
> additionally disable it per site from the popup.

### Justification — `storage`

> Stores the user's own settings only: whether the extension is enabled, which of the eight
> reactions are switched on, gesture hold time, cooldown, detection sensitivity, whether to show the
> on-screen indicator, and any sites the user has disabled it on. `chrome.storage.sync` is used so
> these preferences follow the user between their own Chrome profiles. No personal data, browsing
> history, or call content is stored.

### Remote code

Select **"No, I am not using remote code."** The MediaPipe WebAssembly runtime and the hand-landmark
model are bundled in the package (`wasm/`, `models/`), and the extension makes no network requests
at runtime. If a free-text box appears anyway:

> The extension executes no remote code. The hand-tracking runtime (WebAssembly) and the model file
> are included in the package and loaded from extension-local URLs. There are no runtime network
> requests, no CDN, no eval of fetched content.

### Data usage

Declare that **no** user data is collected — leave every category in the table unticked — then tick
all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: a public link to `PRIVACY.md` (GitHub Pages, or the rendered file on GitHub).

## Settings page — before publishing

- Enter the publisher contact email.
- Click through the verification email Google sends; the item cannot be published until the address
  shows as verified.

## Console warnings are not defects

Two warnings appear under the extension's **Errors** button in `chrome://extensions`:

```
gl_context.cc:1072] OpenGL error checking is disabled
landmark_projection_calculator.cc:189] Using NORM_RECT without IMAGE_DIMENSIONS is only
supported for the square ROI. Provide IMAGE_DIMENSIONS or use PROJECTION_MATRIX.
```

Both come from MediaPipe's own WebAssembly runtime writing to stderr, which Chrome collects and
attributes to the extension. The first is informational from the GPU delegate. The second fires
because detection frames are 16:9 rather than square; if it were genuinely breaking the landmark
projection, no gesture would ever be recognised.

Neither affects the listing — reviewers do not read `chrome://extensions`. Removing the second one
means letterboxing the detection frame to a square and un-padding the landmark coordinates before
classification, which is a real change to `videoPipeline.ts` and `detector/main.ts` and should not be
attempted just to quiet a log line.

## Expect extra scrutiny

Anything touching a camera stream draws a closer look, and patching `getUserMedia` looks alarming
without context. Say plainly in the reviewer notes:

> The extension does not request camera access. It wraps the stream the user's video-call site has
> already been granted, composites an animation onto it with a canvas, and returns it. All frame
> analysis is local; nothing is transmitted.

First review typically takes a few days; updates are usually faster.

## Submission form — values to paste

| Field | Value |
| --- | --- |
| Package | `release/thumbsup-1.0.0.zip` |
| Visibility | **Unlisted** for the first release |
| Distribution | All regions |
| Category | Social & Communication |
| Language | English |
| Privacy policy URL | hosted copy of `PRIVACY.md` (GitHub Pages, or the file's GitHub URL) |
| Contains ads | No |
| Uses remote code | **No** |
| Collects user data | **No** — tick nothing in the data-usage table |
| Certifications | Not selling data · not using it for unrelated purposes · not using it for creditworthiness |

The privacy policy must be a working public URL before the listing can be published. Enable GitHub
Pages on the repository, or link the rendered `PRIVACY.md` on GitHub.

## Suggested rollout

1. Publish **unlisted** first. Same one-click install for testers, no public search presence.
2. Collect feedback on gesture reliability across cameras and lighting — that is where the risk is,
   not in the code.
3. Flip to public once the false-positive rate feels right.
