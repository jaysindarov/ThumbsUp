import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, pick, rand } from './utils';

const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#bf5af2', '#ff2d55'];

/** 🎈 Balloons — inflated balloons with strings, rising and swaying. */
export class BalloonsEffect extends TimedEffect {
  private particles: Particle[] = [];
  private spawnAccumulator = 0;

  constructor() {
    super('balloons');
  }

  protected override simulate(dt: number): void {
    if (this.progress < 0.55) {
      this.spawnAccumulator += dt * 9;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.particles.push(this.spawn());
      }
    }
    for (const p of this.particles) integrate(p, dt, 0, 0.1);
    this.particles = this.particles.filter(isAlive);
  }

  private spawn(): Particle {
    return {
      x: rand(0.08, 0.92),
      y: rand(1.1, 1.35),
      vx: rand(-0.015, 0.015),
      vy: rand(-0.34, -0.2),
      size: rand(0.1, 0.18),
      rotation: 0,
      spin: 0,
      life: 0,
      maxLife: rand(2.4, 3.6),
      color: pick(COLORS),
      seed: rand(0, Math.PI * 2),
    };
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = clamp01(Math.min(t * 5, (1 - t) * 2.5));
      const sway = Math.sin(p.seed + p.life * 1.5) * 0.025;
      const x = (p.x + sway) * width;
      const y = p.y * height;
      const rx = (p.size * height) / 2;
      const ry = rx * 1.22;
      const tilt = Math.sin(p.seed + p.life * 1.5) * 0.18;

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);

      // String
      ctx.beginPath();
      ctx.moveTo(0, ry);
      ctx.quadraticCurveTo(rx * 0.4, ry * 1.9, 0, ry * 2.8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1, rx * 0.06);
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, rx * 0.1, 0, 0, ry);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      gradient.addColorStop(0.35, p.color);
      gradient.addColorStop(1, shade(p.color, -0.3));
      ctx.fillStyle = gradient;
      ctx.fill();

      // Knot
      ctx.beginPath();
      ctx.moveTo(-rx * 0.14, ry);
      ctx.lineTo(rx * 0.14, ry);
      ctx.lineTo(0, ry * 1.16);
      ctx.closePath();
      ctx.fillStyle = shade(p.color, -0.2);
      ctx.fill();

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) =>
    Math.round(Math.min(255, Math.max(0, channel + 255 * amount)));
  const r = mix((value >> 16) & 0xff);
  const g = mix((value >> 8) & 0xff);
  const b = mix(value & 0xff);
  return `rgb(${r}, ${g}, ${b})`;
}
