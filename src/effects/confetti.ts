import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, pick, rand } from './utils';

const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#64d2ff', '#0a84ff', '#bf5af2'];

/** 🎊 Confetti — paper rectangles tumbling down from above the frame. */
export class ConfettiEffect extends TimedEffect {
  private particles: Particle[] = [];
  private spawnAccumulator = 0;

  constructor() {
    super('confetti');
  }

  protected override simulate(dt: number): void {
    if (this.progress < 0.5) {
      this.spawnAccumulator += dt * 95;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.particles.push(this.spawn());
      }
    }
    for (const p of this.particles) integrate(p, dt, 0.5, 0.6);
    this.particles = this.particles.filter((p) => isAlive(p) && p.y < 1.2);
  }

  private spawn(): Particle {
    return {
      x: rand(-0.05, 1.05),
      y: rand(-0.25, -0.02),
      vx: rand(-0.25, 0.25),
      vy: rand(0.1, 0.45),
      size: rand(0.018, 0.036),
      rotation: rand(0, Math.PI * 2),
      spin: rand(-9, 9),
      life: 0,
      maxLife: rand(1.6, 2.8),
      color: pick(COLORS),
      seed: rand(0, Math.PI * 2),
    };
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = clamp01(Math.min(t * 10, (1 - t) * 3));

      // Grow in over the first fifth of a second so pieces do not snap into view.
      const w = p.size * height * (0.5 + 0.5 * Math.min(1, p.life / 0.2));
      const h = w * 0.55;
      // Fake 3D flutter by squashing width on a sine of the spin.
      const flutter = Math.abs(Math.cos(p.seed + p.life * 8));

      ctx.save();
      ctx.translate(p.x * width, p.y * height);
      ctx.rotate(p.rotation);
      ctx.scale(Math.max(0.15, flutter), 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
