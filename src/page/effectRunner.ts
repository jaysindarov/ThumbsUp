import { createEffect, type Effect } from '../effects';
import type { ReactionId } from '../shared/reactions';

/** Hard cap on simultaneous effects — protects CPU on weak machines. */
const MAX_CONCURRENT = 3;

/**
 * Owns the list of running effects and composites them onto the output canvas.
 * Knows nothing about video, cameras or detection.
 */
export class EffectRunner {
  private active: Effect[] = [];
  private lastFrameMs: number | null = null;

  play(id: ReactionId): void {
    if (this.active.length >= MAX_CONCURRENT) this.active.shift();
    this.active.push(createEffect(id));
  }

  /** True when there is nothing to draw — lets the pipeline skip work. */
  get idle(): boolean {
    return this.active.length === 0;
  }

  clear(): void {
    this.active = [];
    this.lastFrameMs = null;
  }

  /**
   * Advance and paint. `nowMs` should be a monotonic clock; the runner derives
   * its own delta so it stays correct if the pipeline drops frames.
   */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, nowMs: number): void {
    if (this.active.length === 0) {
      this.lastFrameMs = nowMs;
      return;
    }

    // Clamp dt so a stalled tab does not fast-forward every effect to the end.
    const dt = this.lastFrameMs === null ? 1 / 60 : Math.min(0.1, (nowMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = nowMs;

    for (const effect of this.active) {
      effect.update(dt);
      effect.draw(ctx, width, height);
    }
    this.active = this.active.filter((effect) => !effect.finished);
  }
}
