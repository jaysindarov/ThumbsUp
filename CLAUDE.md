# CLAUDE.md

Guidance for working in this repository. Read this before changing anything under `src/`.

## What this is

**ThumbsUp** is a Chrome MV3 extension that brings macOS "Reactions" — hand-gesture triggered
animations during video calls — to any browser, on any OS. Apple ships it only on Apple silicon
Macs; this makes it work on Windows, Linux and Intel Macs, in Google Meet, Zoom Web, WhatsApp Web,
Teams and friends.

The gesture-to-reaction mapping is deliberately **identical to macOS Sonoma**. That parity is the
product. Do not change a mapping without an explicit decision to diverge.

| Reaction  | Gesture                        | Hands |
| --------- | ------------------------------ | ----- |
| Hearts    | Heart shape with both hands    | 2     |
| Thumbs Up | One thumbs up                  | 1     |
| Thumbs Down | One thumbs down              | 1     |
| Fireworks | Two thumbs up                  | 2     |
| Rain      | Two thumbs down                | 2     |
| Balloons  | One victory sign               | 1     |
| Confetti  | Two victory signs              | 2     |
| Lasers    | Rock-on sign with both hands   | 2     |

## The one architectural idea

**Reactions are composited into the outgoing camera stream, not overlaid on the page.**

Other participants have to see the reaction — that is the whole point. So we intercept
`navigator.mediaDevices.getUserMedia`, draw the camera frames onto a `<canvas>`, paint effects on
top, and hand the app `canvas.captureStream()` instead of the raw camera. The conferencing app is
none the wiser; whatever it sends over WebRTC already has the confetti in it.

Everything else in the codebase follows from that decision plus one constraint: **MediaPipe needs
WebAssembly, and the host page's CSP would block it.**

## Three execution contexts

```
┌ popup / service worker ─────────── chrome.* APIs, extension origin
│         │ chrome.runtime messages
┌ content/bridge.ts  (ISOLATED world) ─ chrome.* + host DOM. Router.
│         │ CustomEvent, JSON string payloads
┌ page/cameraHook.ts (MAIN world) ───── getUserMedia patch, canvas, effects
│         │ postMessage + transferred ImageBitmap
└ detector/main.ts  (extension iframe) ─ MediaPipe, classifier, gesture machine
```

Why each one exists — this is the part that is expensive to rediscover:

- **MAIN world** is the only place `canvas.captureStream()` produces a track the page can actually
  use, and the only place that can patch the page's `getUserMedia`. It cannot touch `chrome.*`.
- **ISOLATED world** is the only context with both `chrome.*` and the host DOM, so it routes
  settings down, mounts the detector iframe, and renders the HUD.
- **Detector iframe** is an extension page (`chrome-extension://` origin), so MediaPipe's WASM loads
  under *our* CSP (`'wasm-unsafe-eval'`) instead of Google Meet's. Trying to load MediaPipe in the
  MAIN world will fail on every real conferencing site. This is not negotiable, and it is why frames
  are shipped across a `postMessage` boundary.

Cross-world payload rules:

- MAIN ⇄ ISOLATED uses `CustomEvent` with a **JSON string** in `detail`. Objects do not cross world
  boundaries reliably; strings always do.
- MAIN → detector transfers an `ImageBitmap` (zero copy). The receiver **must** call `.close()`, and
  so must every early-return path on the sender, or the tab leaks GPU memory.

## Directory map

```
src/
  shared/       protocol.ts (message types), settings.ts, reactions.ts (catalog + mappings)
  vision/       landmarks.ts, handShape.ts, classifier.ts, gestureMachine.ts — pure, unit tested
  effects/      one file per animation + base.ts, index.ts (registry), utils.ts
  page/         cameraHook.ts (entry), videoPipeline.ts, effectRunner.ts, detectorClient.ts
  content/      bridge.ts (entry), hud.ts
  detector/     index.html + main.ts (MediaPipe host)
  popup/        index.html + main.ts + popup.css
  background/   serviceWorker.ts
  manifest.json (template, "__SITES__" placeholders) + sites.json (the real list)
scripts/        build.mjs, fetch-mediapipe-assets.mjs, gen-icons.mjs
tests/          vitest; fixtures/hands.ts builds synthetic hands from a skeleton
```

## Conventions and invariants

1. **`src/vision/` stays pure.** No DOM, no `chrome.*`, no clock reads — time is passed in. That is
   what makes the gesture logic testable, and it is where nearly all the product's subtlety lives.
   New detection logic goes here with tests, not into `detector/main.ts`.
2. **Effects work in normalised coordinates** (x, y in 0..1, sizes as a fraction of height). Cameras
   renegotiate resolution mid-call; effects that hardcode pixels break when they do.
3. **Never break the call.** Every failure path in `cameraHook.ts` falls back to returning the raw
   stream. A broken compositor must degrade to "no reactions", never to "no camera".
4. **Lazy everything.** The detector iframe and the 7 MB model load on the first camera request, not
   on page load, and unload 15 s after the last camera stops.
5. **Two coordinate spaces, not interchangeable.** `worldLandmarks` (metric, camera-distance
   invariant) for *finger shape*; `landmarks` (normalised image space, y down) for *orientation in
   frame* and hand-to-hand relationships. Mixing them up is the classic bug here.
6. **Timing is settings-driven.** `holdMs`, `cooldownMs`, `minConfidence` come from user settings and
   are live-updated through `GestureMachine.configure()`. Do not hardcode them at call sites.
7. **Match patterns live in `src/sites.json` only.** `manifest.json` is a template; the build expands
   every `"__SITES__"` placeholder. Adding a platform is a one-line change.

## Adding a reaction

1. Add the id to `REACTION_IDS` and a descriptor to `REACTIONS` in `src/shared/reactions.ts`.
2. If it needs a new hand shape, add it to `HAND_SHAPES`, detect it in `classifyHandShape()`, and add
   a row to `COMBINATIONS`. Two-hand *relationships* (like the heart) are special-cased in
   `classifyFrame()` instead.
3. Write the effect in `src/effects/<name>.ts` extending `TimedEffect`, and register it in
   `src/effects/index.ts`.
4. Add fixtures in `tests/fixtures/hands.ts` and cases in `tests/handShape.test.ts` /
   `tests/classifier.test.ts`.

Nothing in the pipeline, popup or manifest needs touching — the popup renders from the catalog.

## Commands

```bash
npm install         # once
npm run build       # stage assets, build dist/  (load dist/ as an unpacked extension)
npm run dev         # same, with watch
npm run package     # build + release/thumbsup-<version>.zip for the Web Store
npm test            # vitest — the vision layer
npm run typecheck   # tsc --noEmit
npm run lint
```

`npm run assets` copies the MediaPipe WASM runtime out of `node_modules` and downloads the hand
landmark model into `public/`. Both are gitignored build inputs — MV3 forbids fetching code at
runtime, so everything ships in the package.

The build runs Vite three times on purpose: once for ES-module extension pages, then once per content
script, because MV3 content scripts must be single classic (IIFE) files and Rollup emits one format
per build.

## Testing what cannot be unit tested

The vision layer has real coverage. The pipeline does not — it needs a camera. Manual pass:

1. `npm run build`, load `dist/` unpacked at `chrome://extensions`.
2. Join a call at <https://meet.google.com>. The HUD pill appears bottom-left once the camera starts.
3. Watch for `[ThumbsUp]` warnings in both the page console and the detector iframe's console
   (selectable in DevTools' context dropdown).
4. Hold each gesture for ~0.7 s; confirm the effect appears **in the self-view the other participants
   see**, not just locally — the easiest check is a second browser profile in the same meeting.

## Known limits

- Not usable in native desktop apps (Zoom/Teams clients), only their web versions. That would need a
  virtual camera, which an extension cannot provide.
- MediaPipe reports no per-hand detection score, so `minConfidence` gates on handedness confidence.
  It correlates well but is not the same thing.
- Chrome 111+ only (`"world": "MAIN"` content scripts).
