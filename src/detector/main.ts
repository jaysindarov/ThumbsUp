/**
 * Hand detection host.
 *
 * Runs as an extension page inside a hidden iframe. Owns the MediaPipe model,
 * the frame-level classifier and the gesture state machine; the page world only
 * ever sees `{ shape, pending, fired }` results.
 */

import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

import type { FromDetectorMessage, ToDetectorMessage } from '../shared/protocol';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { classifyFrame } from '../vision/classifier';
import { handDiagnostics } from '../vision/handShape';
import { GestureMachine } from '../vision/gestureMachine';
import type { Hand, Landmark } from '../vision/landmarks';

const WASM_DIR = chrome.runtime.getURL('wasm');
const MODEL_URL = chrome.runtime.getURL('models/hand_landmarker.task');

class Detector {
  private settings: Settings = DEFAULT_SETTINGS;
  private machine = new GestureMachine({
    holdMs: DEFAULT_SETTINGS.holdMs,
    cooldownMs: DEFAULT_SETTINGS.cooldownMs,
    isEnabled: (id) => this.settings.reactions[id] !== false,
  });

  private landmarker: HandLandmarker | null = null;
  private loading: Promise<HandLandmarker> | null = null;
  private parent: { window: Window; origin: string } | null = null;
  private busy = false;
  /** detectForVideo() requires strictly increasing timestamps. */
  private lastTimestamp = 0;
  private lastLogAt = 0;

  start(): void {
    window.addEventListener('message', (event) => void this.handleMessage(event));
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const message = event.data as ToDetectorMessage | undefined;
    if (!message || typeof message.type !== 'string') return;

    switch (message.type) {
      case 'hello': {
        if (!event.source) return;
        // `origin` can be the string "null" for sandboxed/file documents, which
        // is not a valid postMessage target; fall back to the wildcard there.
        this.parent = {
          window: event.source as Window,
          origin: message.origin && message.origin !== 'null' ? message.origin : '*',
        };
        await this.ensureModel();
        this.post({ type: 'ready' });
        break;
      }
      case 'config':
        this.settings = message.settings;
        this.machine.configure({
          holdMs: message.settings.holdMs,
          cooldownMs: message.settings.cooldownMs,
        });
        break;
      case 'reset':
        this.machine.reset();
        break;
      case 'frame':
        this.processFrame(message.bitmap, message.timestamp);
        break;
    }
  }

  private async ensureModel(): Promise<HandLandmarker> {
    if (this.landmarker) return this.landmarker;
    if (!this.loading) {
      this.loading = this.loadModel().catch((error: unknown) => {
        this.loading = null;
        this.post({ type: 'error', message: `model load failed: ${describe(error)}` });
        throw error;
      });
    }
    this.landmarker = await this.loading;
    return this.landmarker;
  }

  private async loadModel(): Promise<HandLandmarker> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  private processFrame(bitmap: ImageBitmap, timestamp: number): void {
    // Drop frames rather than queue them: latency matters more than coverage.
    if (this.busy || !this.landmarker) {
      bitmap.close();
      return;
    }
    this.busy = true;
    try {
      const ts = Math.max(this.lastTimestamp + 1, Math.round(timestamp));
      this.lastTimestamp = ts;
      const result = this.landmarker.detectForVideo(bitmap, ts);
      this.emit(toHands(result), ts);
    } catch (error) {
      this.post({ type: 'error', message: `detection failed: ${describe(error)}` });
    } finally {
      bitmap.close();
      this.busy = false;
    }
  }

  private emit(hands: Hand[], timestamp: number): void {
    const frame = classifyFrame(hands, this.settings.minConfidence);
    const gesture = this.machine.update(timestamp, frame.reaction);
    this.logDiagnostics(hands, frame.reaction, timestamp);
    this.post({
      type: 'result',
      hands: frame.hands,
      shape: frame.shape,
      pending: gesture.pending,
      pendingProgress: gesture.progress,
      fired: gesture.fired,
    });
  }

  /**
   * Throttled per-finger readout, off unless the user turns on debug logging.
   * This is the tool for answering "why did that gesture not register": look
   * for a finger reported as `between`, or a thumb bend hovering at the
   * extended threshold.
   */
  private logDiagnostics(hands: Hand[], reaction: string | null, timestamp: number): void {
    if (!this.settings.debug) return;
    if (timestamp - this.lastLogAt < 500) return;
    this.lastLogAt = timestamp;
    console.log('[ThumbsUp]', {
      reaction,
      hands: hands.map(handDiagnostics),
    });
  }

  private post(message: FromDetectorMessage): void {
    this.parent?.window.postMessage(message, this.parent.origin);
  }
}

/** Normalise MediaPipe's result into our own `Hand` shape. */
function toHands(result: HandLandmarkerResult): Hand[] {
  const hands: Hand[] = [];
  const handedness = result.handednesses ?? [];

  for (let i = 0; i < result.landmarks.length; i += 1) {
    const landmarks = result.landmarks[i];
    const world = result.worldLandmarks[i];
    if (!landmarks || !world) continue;
    const category = handedness[i]?.[0];
    hands.push({
      landmarks: landmarks as Landmark[],
      world: world as Landmark[],
      handedness: category?.categoryName ?? 'Unknown',
      // MediaPipe exposes no per-hand detection score, only handedness
      // confidence. It tracks detection quality closely enough to gate on.
      score: category?.score ?? 1,
    });
  }
  return hands;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

new Detector().start();
