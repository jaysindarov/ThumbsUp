import type { ReactionId } from '../shared/reactions';

/**
 * A reaction animation.
 *
 * Effects work in **normalised coordinates**: x and y in 0..1 with y growing
 * downward, sizes as a fraction of canvas height. The runner scales at draw
 * time, so an effect keeps working when the camera resolution changes
 * mid-call (which browsers do, e.g. on bandwidth drops).
 */
export interface Effect {
  readonly id: ReactionId;
  /** Advance the simulation. `dt` is seconds since the previous frame. */
  update(dt: number): void;
  /** Paint onto the output canvas. `width`/`height` are device pixels. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** True once the effect has nothing left to draw and can be discarded. */
  readonly finished: boolean;
}

export type EffectFactory = () => Effect;
