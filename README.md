<div align="center">

# 👍 ThumbsUp

**Hand-gesture reactions for any video call.**
The macOS Reactions feature — on Windows, Linux, and every Mac.

</div>

---

macOS Sonoma can throw confetti across your video call when you make a peace sign at the camera. It
is delightful, and it only works on Apple silicon Macs. ThumbsUp is a Chrome extension that does the
same thing, everywhere.

The reactions are composited **into your outgoing camera stream**, so everyone in the call sees them
— not just you.

## Reactions

Identical gestures to macOS, so muscle memory carries over.

| Reaction       | Gesture                      |
| -------------- | ---------------------------- |
| ❤️ Hearts      | Heart shape with both hands  |
| 👍 Thumbs Up   | One thumbs up                |
| 👎 Thumbs Down | One thumbs down              |
| 🎆 Fireworks   | Two thumbs up                |
| 🌧️ Rain        | Two thumbs down              |
| 🎈 Balloons    | One victory sign             |
| 🎊 Confetti    | Two victory signs            |
| 🤟 Lasers      | Rock-on sign with both hands |

Hold a gesture for about three quarters of a second and it fires. Hold time, cooldown and
sensitivity are all adjustable, and any reaction can be switched off.

## Works on

Google Meet · Zoom (web) · WhatsApp Web · Microsoft Teams · Webex · Discord · Whereby · Jitsi Meet ·
Slack huddles · Around · Gather

Native desktop apps are out of reach for a browser extension — use the web version.

## Install

Requires Chrome 111 or newer.

### If you just want to use it

Coming to the Chrome Web Store — one click, auto-updates, nothing to build.

Until then you need the developer install below. Be warned that Chrome treats unpacked extensions as
developer tools: it shows a warning banner on every launch and can disable them, so it is not a
setup to hand to someone else.

### Developer install

```bash
npm install
npm run build
```

Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the **`dist`** folder — not the project root, not `src/`

`dist/` is the only folder Chrome can read. The project root has no `manifest.json`, and `src/` holds
TypeScript plus a manifest template with unfilled placeholders.

**This is a one-time compile, not a server.** Once loaded, the extension keeps working after you
close the terminal, quit Chrome, or reboot — Node is not involved at runtime. Only rebuild after
editing `src/`, then press the reload arrow on the extension card.

Do not delete or move `dist/` afterwards: Chrome references that exact path.

## Privacy

Everything runs locally.

- Hand tracking happens on your machine with a bundled MediaPipe model. No frames, landmarks or
  video ever leave the browser.
- No analytics, no network requests at runtime, no accounts.
- The extension only runs on the video-call sites listed above, and you can disable it per site or
  entirely from the popup.

Full policy: [PRIVACY.md](PRIVACY.md).

## Development

```bash
npm run dev        # rebuild on change
npm test           # unit tests for the gesture recognition layer
npm run typecheck
npm run lint
npm run package    # build + release/thumbsup-<version>.zip for the Web Store
```

After a rebuild, reload the call tab for content-script changes, or hit the reload arrow on the
extension card at `chrome://extensions` for manifest and service-worker changes.

Architecture, invariants and how to add a new reaction are documented in [CLAUDE.md](CLAUDE.md).
Publishing — listing copy, assets, and prepared answers for the store review questionnaire — is in
[docs/STORE.md](docs/STORE.md).

## License

MIT
