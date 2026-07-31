import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, rand } from './utils';

interface Splash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

/** 🌧️ Rain — slanted drops, a grey wash over the frame, splashes at the bottom. */
export class RainEffect extends TimedEffect {
  private drops: Particle[] = [];
  private splashes: Splash[] = [];
  private spawnAccumulator = 0;
  /** Where drops land, as a fraction of frame height. */
  private readonly groundY = 0.93;

  constructor() {
    super('rain');
  }

  protected override simulate(dt: number): void {
    const intensity = this.progress < 0.75 ? 1 : Math.max(0, (1 - this.progress) / 0.25);

    this.spawnAccumulator += dt * 240 * intensity;
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      this.drops.push({
        x: rand(-0.15, 1.1),
        y: rand(-0.3, -0.02),
        vx: 0.16,
        vy: rand(1.5, 2.3),
        size: rand(0.02, 0.055),
        rotation: 0,
        spin: 0,
        life: 0,
        maxLife: 3,
        color: 'rgba(190, 215, 240, 0.75)',
        seed: 0,
      });
    }

    for (const p of this.drops) integrate(p, dt, 0.6, 0);
    this.drops = this.drops.filter((p) => {
      if (p.y >= this.groundY) {
        if (Math.random() < 0.35) {
          this.splashes.push({ x: p.x, y: this.groundY, life: 0, maxLife: 0.35 });
        }
        return false;
      }
      return isAlive(p);
    });

    for (const s of this.splashes) s.life += dt;
    this.splashes = this.splashes.filter((s) => s.life < s.maxLife);
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const wash = clamp01(Math.min(this.progress * 5, (1 - this.progress) * 4)) * 0.18;
    ctx.fillStyle = `rgba(40, 60, 90, ${wash})`;
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = 'round';
    for (const p of this.drops) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, height * 0.0025);
      const len = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x * width, p.y * height);
      ctx.lineTo((p.x - len * 0.16) * width, (p.y - len) * height);
      ctx.stroke();
    }

    for (const s of this.splashes) {
      const t = s.life / s.maxLife;
      ctx.globalAlpha = clamp01(1 - t) * 0.5;
      ctx.strokeStyle = 'rgba(200, 225, 245, 0.9)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      const r = t * height * 0.02;
      ctx.beginPath();
      ctx.ellipse(s.x * width, s.y * height, r * 1.6, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
