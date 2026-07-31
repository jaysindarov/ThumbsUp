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

Not on the Chrome Web Store yet. To run it from source:

```bash
npm install && npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the
`dist/` folder.

Chrome 111 or newer.

## Privacy

Everything runs locally.

- Hand tracking happens on your machine with a bundled MediaPipe model. No frames, landmarks or
  video ever leave the browser.
- No analytics, no network requests at runtime, no accounts.
- The extension only runs on the video-call sites listed above, and you can disable it per site or
  entirely from the popup.

## Development

```bash
npm run dev        # rebuild on change
npm test           # unit tests for the gesture recognition layer
npm run typecheck
npm run lint
```

Architecture, invariants and how to add a new reaction are documented in
[CLAUDE.md](CLAUDE.md).

## License

MIT
