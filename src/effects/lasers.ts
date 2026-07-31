import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, pick, rand } from './utils';

const COLORS = ['#ff2d55', '#0a84ff', '#32d74b', '#ffd60a', '#bf5af2'];

interface Beam {
  /** Vertical origin on the left/right edge, 0..1. */
  y: number;
  /** Sweep speed in radians/s. */
  sweep: number;
  angle: number;
  from: 'left' | 'right';
  color: string;
  delay: number;
}

/** 🔦 Lasers — sweeping beams from both edges with additive glow and sparks. */
export class LasersEffect extends TimedEffect {
  private readonly beams: Beam[];
  private sparks: Particle[] = [];
  private sparkAccumulator = 0;

  constructor() {
    super('lasers');
    this.beams = Array.from({ length: 6 }, (_, i) => ({
      y: rand(0.15, 0.8),
      sweep: rand(-0.7, 0.7),
      angle: rand(-0.5, 0.5),
      from: i % 2 === 0 ? 'left' : 'right',
      color: pick(COLORS),
      delay: i * 0.06,
    }));
  }

  protected override simulate(dt: number): void {
    for (const beam of this.beams) beam.angle += beam.sweep * dt;

    this.sparkAccumulator += dt * 90 * (this.progress < 0.8 ? 1 : 0);
    while (this.sparkAccumulator >= 1) {
      this.sparkAccumulator -= 1;
      const beam = pick(this.beams);
      const distance = rand(0.2, 0.9);
      this.sparks.push({
        x: beam.from === 'left' ? distance : 1 - distance,
        y: beam.y + Math.tan(beam.angle) * distance * (beam.from === 'left' ? 1 : -1),
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
        size: rand(0.003, 0.007),
        rotation: 0,
        spin: 0,
        life: 0,
        maxLife: rand(0.25, 0.6),
        color: beam.color,
        seed: 0,
      });
    }
    for (const p of this.sparks) integrate(p, dt, 0.2, 1.5);
    this.sparks = this.sparks.filter(isAlive);
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (const beam of this.beams) {
      const t = clamp01((this.elapsed - beam.delay) / (this.durationSec - beam.delay));
      if (t <= 0) continue;
      const alpha = clamp01(Math.min(t * 8, (1 - t) * 3)) * 0.85;
      const originX = beam.from === 'left' ? 0 : width;
      const originY = beam.y * height;
      const dirX = beam.from === 'left' ? 1 : -1;
      const endX = originX + dirX * width * 1.2;
      const endY = originY + Math.tan(beam.angle) * width * 1.2 * dirX;

      // Wide soft glow, then a hot thin core.
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = height * 0.035;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = height * 0.006;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    for (const p of this.sparks) {
      ctx.globalAlpha = clamp01(1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.size * height, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
