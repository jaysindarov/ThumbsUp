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

Upload the zip in the developer console. The store rejects a zip whose root is a folder — the
packaging script zips the *contents* of `dist/`, which is correct.

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

## Review questionnaire — prepared answers

Reviewers ask these, and a weak answer here is the usual cause of a rejection.

**Single purpose**
> Recognise hand gestures from the user's existing video-call camera feed and draw the matching
> reaction animation into that feed, so other call participants can see it.

**Why `storage`** — persist user settings (enabled reactions, hold time, sensitivity, per-site
opt-outs).

**Why `activeTab`** — the popup reports whether the extension is active on the current tab and can
play a test reaction there. Used only in response to the user opening the popup.

**Why host permissions on those sites** — the extension must run in the page to modify the outgoing
camera stream. The list is limited to video-call services; no broad `<all_urls>` access is
requested.

**Remote code** — none. The MediaPipe WebAssembly runtime and the hand-landmark model ship inside
the package. The extension makes no network requests at runtime.

**Data usage disclosures** — tick nothing. Certify that you do not collect or transmit user data,
and that data is not sold or used for unrelated purposes. Link `PRIVACY.md` (host it, e.g. on
GitHub Pages) as the privacy policy URL.

## Expect extra scrutiny

Anything touching a camera stream draws a closer look, and patching `getUserMedia` looks alarming
without context. Say plainly in the reviewer notes:

> The extension does not request camera access. It wraps the stream the user's video-call site has
> already been granted, composites an animation onto it with a canvas, and returns it. All frame
> analysis is local; nothing is transmitted.

First review typically takes a few days; updates are usually faster.

## Suggested rollout

1. Publish **unlisted** first. Same one-click install for testers, no public search presence.
2. Collect feedback on gesture reliability across cameras and lighting — that is where the risk is,
   not in the code.
3. Flip to public once the false-positive rate feels right.
