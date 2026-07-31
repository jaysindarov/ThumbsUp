import { REACTIONS, type ReactionId } from '../shared/reactions';
import type { Effect, EntranceStyle } from './types';

/** Entrance ramp length in seconds. Matches the unhurried macOS feel. */
const ENTRANCE_SEC = 0.65;

/** Ease-out with a small overshoot, so the growth settles rather than stops. */
function easeOutBack(t: number): number {
  const c = 1.4;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

/**
 * Base for effects with a fixed lifetime. Subclasses implement `render`; the
 * base tracks elapsed time and exposes `progress` (0..1).
 */
export abstract class TimedEffect implements Effect {
  readonly id: ReactionId;
  protected readonly durationSec: number;
  protected elapsed = 0;
  /**
   * Whether the whole effect grows into frame. Opt in only for effects whose
   * particles live *inside* the frame. Effects that spawn off-screen and travel
   * in (confetti, fireworks) or that fill the frame (rain, lasers) must stay
   * `'none'`: scaling about the centre would drag their off-screen spawn points
   * into view. Those grow their particles individually instead.
   */
  protected entrance: EntranceStyle = 'none';

  constructor(id: ReactionId, durationMs = REACTIONS[id].durationMs) {
    this.id = id;
    this.durationSec = durationMs / 1000;
  }

  get progress(): number {
    return Math.min(1, this.elapsed / this.durationSec);
  }

  get finished(): boolean {
    return this.elapsed >= this.durationSec;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.simulate(dt);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();

    // Grow in from small, anchored at the centre of frame. Subclasses set their
    // own per-particle alpha, so the entrance is geometry only — mixing in a
    // global alpha here would be overwritten by the first `globalAlpha` write
    // inside `render`.
    const t = this.elapsed / ENTRANCE_SEC;
    if (this.entrance === 'grow' && t < 1) {
      const scale = 0.5 + 0.5 * easeOutBack(Math.max(0, t));
      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-width / 2, -height / 2);
    }

    this.render(ctx, width, height);
    ctx.restore();
  }

  /** Advance any particle state. Default: nothing. */
  protected simulate(_dt: number): void {}

  protected abstract render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void;
}

/** Generic particle in normalised space. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  life: number;
  maxLife: number;
  color: string;
  seed: number;
}

/** Integrate a particle: gravity in normalised units/s², drag as a factor/s. */
export function integrate(p: Particle, dt: number, gravity = 0, drag = 0): void {
  if (drag > 0) {
    const k = Math.max(0, 1 - drag * dt);
    p.vx *= k;
    p.vy *= k;
  }
  p.vy += gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rotation += p.spin * dt;
  p.life += dt;
}

export function isAlive(p: Particle): boolean {
  return p.life < p.maxLife;
}
