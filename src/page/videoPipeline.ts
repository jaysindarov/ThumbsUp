/**
 * Wraps a raw camera `MediaStream` in a canvas compositor and hands back a
 * replacement stream with reactions burned in.
 *
 * Why burn into the stream instead of overlaying in the page? Because the whole
 * point is that *other participants* see the reaction. An overlay would only
 * decorate our own local UI.
 *
 * Runs in the MAIN world so `canvas.captureStream()` produces a track the page
 * itself can hand to WebRTC.
 */

import type { EffectRunner } from './effectRunner';

export interface PipelineOptions {
  /** Output frame rate for the composited stream. */
  fps?: number;
  /** How often frames are handed to the detector, in frames per second. */
  detectFps?: number;
  /** Longest edge of the downscaled frame sent to the detector. */
  detectSize?: number;
  /** Called with a downscaled frame. Ownership of the bitmap transfers to the callee. */
  onFrame?: (bitmap: ImageBitmap, timestampMs: number) => void;
  /** Called once the source stream ends. */
  onEnded?: () => void;
}

const DEFAULTS = {
  fps: 30,
  detectFps: 12,
  detectSize: 320,
} as const;

export class VideoPipeline {
  readonly output: MediaStream;

  private readonly source: MediaStream;
  private readonly options: Required<Omit<PipelineOptions, 'onFrame' | 'onEnded'>> &
    Pick<PipelineOptions, 'onFrame' | 'onEnded'>;
  private readonly runner: EffectRunner;
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly outputTrack: MediaStreamTrack;

  private stopped = false;
  private frameHandle: number | null = null;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private lastDetectAt = 0;
  private detectInFlight = false;

  constructor(source: MediaStream, runner: EffectRunner, options: PipelineOptions = {}) {
    this.source = source;
    this.runner = runner;
    this.options = { ...DEFAULTS, ...options };

    const [track] = source.getVideoTracks();
    if (!track) throw new Error('VideoPipeline requires a stream with a video track');

    const settings = track.getSettings();
    this.canvas = document.createElement('canvas');
    this.canvas.width = settings.width ?? 1280;
    this.canvas.height = settings.height ?? 720;

    const ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.video = document.createElement('video');
    this.video.srcObject = source;
    this.video.muted = true;
    this.video.playsInline = true;
    // Keep it out of the page's layout and accessibility tree entirely.
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.display = 'none';
    void this.video.play().catch(() => {
      /* autoplay of a muted, script-created element rarely fails; ignore */
    });

    const captured = this.canvas.captureStream(this.options.fps);
    const [outputTrack] = captured.getVideoTracks();
    if (!outputTrack) throw new Error('captureStream() produced no video track');
    this.outputTrack = outputTrack;

    this.output = new MediaStream([outputTrack, ...source.getAudioTracks()]);
    this.bridgeTrackLifecycle(track);
    this.startLoop();
  }

  /** Tear down the compositor and stop the underlying camera. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.timerHandle !== null) clearTimeout(this.timerHandle);
    if (this.frameHandle !== null && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }

    this.outputTrack.stop();
    for (const track of this.source.getTracks()) track.stop();
    this.video.srcObject = null;
    this.options.onEnded?.();
  }

  /**
   * Make the returned track behave like the real camera track:
   *  - stopping it stops the camera (otherwise the capture LED stays on);
   *  - the camera ending (unplugged, revoked permission) ends our track too.
   */
  private bridgeTrackLifecycle(sourceTrack: MediaStreamTrack): void {
    const nativeStop = this.outputTrack.stop.bind(this.outputTrack);
    this.outputTrack.stop = () => {
      nativeStop();
      this.stop();
    };

    // Pages read getSettings() to show resolution; report the camera's.
    const nativeGetSettings = this.outputTrack.getSettings.bind(this.outputTrack);
    this.outputTrack.getSettings = () => ({ ...sourceTrack.getSettings(), ...nativeGetSettings() });

    sourceTrack.addEventListener('ended', () => this.stop());
  }

  private startLoop(): void {
    // requestVideoFrameCallback is preferred: it is driven by the camera rather
    // than by the compositor, so it keeps running in a backgrounded tab where
    // requestAnimationFrame is throttled to ~1 Hz.
    if ('requestVideoFrameCallback' in this.video) {
      const step = (nowMs: number) => {
        if (this.stopped) return;
        this.renderFrame(nowMs);
        this.frameHandle = this.video.requestVideoFrameCallback(step);
      };
      this.frameHandle = this.video.requestVideoFrameCallback(step);
      return;
    }

    const interval = 1000 / this.options.fps;
    const tick = () => {
      if (this.stopped) return;
      this.renderFrame(performance.now());
      this.timerHandle = setTimeout(tick, interval);
    };
    tick();
  }

  private renderFrame(nowMs: number): void {
    const { videoWidth, videoHeight } = this.video;
    if (videoWidth === 0 || videoHeight === 0) return;

    // Cameras renegotiate resolution mid-call; follow it.
    if (this.canvas.width !== videoWidth || this.canvas.height !== videoHeight) {
      this.canvas.width = videoWidth;
      this.canvas.height = videoHeight;
    }

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.runner.render(this.ctx, this.canvas.width, this.canvas.height, nowMs);
    this.maybeSendDetectionFrame(nowMs);
  }

  private maybeSendDetectionFrame(nowMs: number): void {
    const onFrame = this.options.onFrame;
    if (!onFrame || this.detectInFlight) return;
    if (nowMs - this.lastDetectAt < 1000 / this.options.detectFps) return;
    this.lastDetectAt = nowMs;
    this.detectInFlight = true;

    const scale = this.options.detectSize / Math.max(this.canvas.width, this.canvas.height);
    const width = Math.max(1, Math.round(this.canvas.width * Math.min(1, scale)));
    const height = Math.max(1, Math.round(this.canvas.height * Math.min(1, scale)));

    // Downscale on the way out: hand tracking does not need 720p, and a small
    // bitmap keeps the cross-context transfer cheap.
    createImageBitmap(this.video, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'low',
    })
      .then((bitmap) => {
        if (this.stopped) {
          bitmap.close();
          return;
        }
        onFrame(bitmap, nowMs);
      })
      .catch(() => {
        /* transient decode failures are expected while the camera warms up */
      })
      .finally(() => {
        this.detectInFlight = false;
      });
  }
}
