import { REACTIONS, type ReactionId } from '../shared/reactions';
import type { Effect } from './types';

/**
 * Base for effects with a fixed lifetime. Subclasses implement `render`; the
 * base tracks elapsed time and exposes `progress` (0..1).
 */
export abstract class TimedEffect implements Effect {
  readonly id: ReactionId;
  protected readonly durationSec: number;
  protected elapsed = 0;

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
