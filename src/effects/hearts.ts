import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, pick, rand, traceHeart } from './utils';

const COLORS = ['#ff2d55', '#ff375f', '#ff6482', '#ff8fa3', '#e0245e'];

/** ❤️ Hearts — floating hearts drifting up with a gentle sway. */
export class HeartsEffect extends TimedEffect {
  private particles: Particle[] = [];
  private spawnAccumulator = 0;

  constructor() {
    super('hearts');
  }

  protected override simulate(dt: number): void {
    // Emit for the first 60% of the effect, then let the stragglers rise out.
    if (this.progress < 0.6) {
      this.spawnAccumulator += dt * 18;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.particles.push(this.spawn());
      }
    }
    for (const p of this.particles) integrate(p, dt, 0, 0.15);
    this.particles = this.particles.filter(isAlive);
  }

  private spawn(): Particle {
    return {
      x: rand(0.15, 0.85),
      y: rand(1.0, 1.12),
      vx: rand(-0.02, 0.02),
      vy: rand(-0.38, -0.2),
      size: rand(0.05, 0.13),
      rotation: rand(-0.25, 0.25),
      spin: rand(-0.5, 0.5),
      life: 0,
      maxLife: rand(1.8, 3.0),
      color: pick(COLORS),
      seed: rand(0, Math.PI * 2),
    };
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = clamp01(Math.min(t * 6, (1 - t) * 2.2));
      // Sway: horizontal wobble that grows as the heart rises.
      const sway = Math.sin(p.seed + p.life * 2.4) * 0.03;
      const x = (p.x + sway) * width;
      const y = p.y * height;
      const size = p.size * height;

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rotation + sway);
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(255, 45, 85, 0.45)';
      ctx.shadowBlur = size * 0.35;
      traceHeart(ctx, 0, 0, size);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
