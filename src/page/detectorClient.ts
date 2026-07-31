/**
 * MAIN-world client for the detector iframe.
 *
 * The detector lives in an extension page because MediaPipe needs WebAssembly
 * and extension-local module loading, both of which the *page's* CSP would
 * block if we tried to run them in the page world. The iframe runs under the
 * extension's own CSP, so it just works — on Meet, Zoom, Teams, anywhere.
 *
 * Transport is plain `postMessage` with a transferred `ImageBitmap`, which
 * costs no copy.
 */

import {
  DETECTOR_FRAME_ID,
  type FromDetectorMessage,
  type ToDetectorMessage,
} from '../shared/protocol';

const FRAME_POLL_MS = 150;
const FRAME_WAIT_TIMEOUT_MS = 20_000;

export class DetectorClient {
  private frame: HTMLIFrameElement | null = null;
  private frameOrigin = '';
  private ready = false;
  private disposed = false;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly pending: ToDetectorMessage[] = [];

  constructor(private readonly onMessage: (message: FromDetectorMessage) => void) {
    window.addEventListener('message', this.handleMessage, true);
    this.waitForFrame();
  }

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * Queue or deliver a message. Non-frame messages sent before the detector is
   * ready are replayed on connect; frames are dropped, since a stale frame is
   * worthless by the time the model loads.
   */
  send(message: ToDetectorMessage, transfer: Transferable[] = []): void {
    if (this.disposed) return;
    if (!this.ready || !this.frame?.contentWindow) {
      if (message.type === 'frame') message.bitmap.close();
      else this.pending.push(message);
      return;
    }
    this.frame.contentWindow.postMessage(message, this.frameOrigin, transfer);
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    window.removeEventListener('message', this.handleMessage, true);
    if (this.pollHandle !== null) clearInterval(this.pollHandle);
    this.frame = null;
  }

  private waitForFrame(): void {
    const deadline = performance.now() + FRAME_WAIT_TIMEOUT_MS;
    this.pollHandle = setInterval(() => {
      if (this.disposed) return;
      const frame = document.getElementById(DETECTOR_FRAME_ID);
      if (frame instanceof HTMLIFrameElement && frame.src) {
        this.attach(frame);
        return;
      }
      if (performance.now() > deadline && this.pollHandle !== null) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    }, FRAME_POLL_MS);
  }

  private attach(frame: HTMLIFrameElement): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.frame = frame;
    this.frameOrigin = new URL(frame.src).origin;

    const greet = () => {
      frame.contentWindow?.postMessage(
        { type: 'hello', origin: window.location.origin } satisfies ToDetectorMessage,
        this.frameOrigin,
      );
    };

    // The iframe may already be loaded by the time we find it; greet either way
    // and let the detector ignore duplicate hellos.
    frame.addEventListener('load', greet);
    greet();
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    if (this.disposed) return;
    if (!this.frameOrigin || event.origin !== this.frameOrigin) return;
    if (this.frame && event.source !== this.frame.contentWindow) return;

    const message = event.data as FromDetectorMessage | undefined;
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'ready' && !this.ready) {
      this.ready = true;
      for (const queued of this.pending.splice(0)) this.send(queued);
    }
    this.onMessage(message);
  };
}
