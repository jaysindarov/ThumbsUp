/**
 * MAIN-world entry point.
 *
 * Injected at `document_start` so the `getUserMedia` patch is in place before
 * any conferencing app can grab the camera. Everything expensive (the detector
 * iframe, the model) is created lazily on the first camera request, so pages
 * that never use a camera pay nothing.
 */

import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import type { FromDetectorMessage, PipelineStatus } from '../shared/protocol';
import type { ReactionId } from '../shared/reactions';
import { DetectorClient } from './detectorClient';
import { EffectRunner } from './effectRunner';
import { onBridgeMessage, sendToBridge } from './pageBridge';
import { VideoPipeline } from './videoPipeline';

/** Keep the detector alive briefly after the last camera stops (call restarts). */
const DETECTOR_LINGER_MS = 15_000;

/**
 * How long `getUserMedia` waits for the real settings before falling back to
 * defaults. The hook installs at `document_start`, a tick or two before the
 * bridge has read `chrome.storage`; without this, a page that grabs the camera
 * immediately could be processed on a site the user had disabled.
 */
const SETTINGS_WAIT_MS = 1500;

class ReactionsController {
  private settings: Settings = DEFAULT_SETTINGS;
  private settingsReady: Promise<void>;
  private markSettingsReady: () => void = () => {};
  private readonly runner = new EffectRunner();
  private readonly pipelines = new Set<VideoPipeline>();
  private detector: DetectorClient | null = null;
  private detectorTeardown: ReturnType<typeof setTimeout> | null = null;
  private status: PipelineStatus = {
    cameraActive: false,
    detectorReady: false,
    hands: 0,
    shape: 'none',
    pending: null,
    pendingProgress: 0,
  };

  constructor() {
    this.settingsReady = new Promise<void>((resolve) => {
      this.markSettingsReady = resolve;
      setTimeout(resolve, SETTINGS_WAIT_MS);
    });
  }

  install(): void {
    onBridgeMessage((message) => {
      if (message.type === 'settings') this.applySettings(message.settings);
      else if (message.type === 'trigger') this.runner.play(message.reaction);
    });
    this.patchGetUserMedia();
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.markSettingsReady();
    this.detector?.send({ type: 'config', settings });
    if (!settings.enabled) this.runner.clear();
  }

  private patchGetUserMedia(): void {
    const devices = navigator.mediaDevices;
    if (!devices || typeof devices.getUserMedia !== 'function') return;

    const original = devices.getUserMedia.bind(devices);

    const patched = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
      const stream = await original(constraints);
      if (!constraints?.video || stream.getVideoTracks().length === 0) return stream;

      await this.settingsReady;
      if (!this.settings.enabled) return stream;

      try {
        return this.wrap(stream);
      } catch (error) {
        // Never break the user's call because our compositor failed.
        sendToBridge({ type: 'error', message: describeError(error) });
        return stream;
      }
    };

    Object.defineProperty(devices, 'getUserMedia', {
      value: patched,
      writable: true,
      configurable: true,
    });
  }

  private wrap(stream: MediaStream): MediaStream {
    this.ensureDetector();

    const pipeline = new VideoPipeline(stream, this.runner, {
      onFrame: (bitmap, timestamp) => {
        if (!this.settings.enabled || !this.detector) {
          bitmap.close();
          return;
        }
        this.detector.send({ type: 'frame', bitmap, timestamp }, [bitmap]);
      },
      onEnded: () => {
        this.pipelines.delete(pipeline);
        if (this.pipelines.size === 0) this.onCameraIdle();
      },
    });

    this.pipelines.add(pipeline);
    this.updateStatus({ cameraActive: true });
    return pipeline.output;
  }

  private ensureDetector(): void {
    if (this.detectorTeardown !== null) {
      clearTimeout(this.detectorTeardown);
      this.detectorTeardown = null;
    }
    if (this.detector) return;

    sendToBridge({ type: 'needDetector' });
    this.detector = new DetectorClient((message) => this.handleDetectorMessage(message));
    this.detector.send({ type: 'config', settings: this.settings });
  }

  private onCameraIdle(): void {
    this.runner.clear();
    this.detector?.send({ type: 'reset' });
    this.updateStatus({
      cameraActive: false,
      hands: 0,
      shape: 'none',
      pending: null,
      pendingProgress: 0,
    });

    this.detectorTeardown = setTimeout(() => {
      this.detector?.dispose();
      this.detector = null;
      this.detectorTeardown = null;
      this.updateStatus({ detectorReady: false });
      sendToBridge({ type: 'releaseDetector' });
    }, DETECTOR_LINGER_MS);
  }

  private handleDetectorMessage(message: FromDetectorMessage): void {
    switch (message.type) {
      case 'ready':
        this.updateStatus({ detectorReady: true });
        break;
      case 'error':
        sendToBridge({ type: 'error', message: message.message });
        break;
      case 'result':
        if (message.fired) this.fire(message.fired);
        this.updateStatus({
          hands: message.hands,
          shape: message.shape,
          pending: message.pending,
          pendingProgress: message.pendingProgress,
        });
        break;
    }
  }

  private fire(reaction: ReactionId): void {
    this.runner.play(reaction);
    sendToBridge({ type: 'reaction', reaction });
  }

  private updateStatus(patch: Partial<PipelineStatus>): void {
    this.status = { ...this.status, ...patch };
    sendToBridge({ type: 'status', status: this.status });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

new ReactionsController().install();
