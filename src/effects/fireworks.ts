import { TimedEffect, integrate, isAlive, type Particle } from './base';
import { clamp01, pick, rand } from './utils';

const COLORS = ['#ffd60a', '#ff9f0a', '#ff453a', '#64d2ff', '#bf5af2', '#32d74b', '#ffffff'];

interface Shell {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
  exploded: boolean;
}

/** 🎆 Fireworks — shells rise, burst into gravity-bound sparks with trails. */
export class FireworksEffect extends TimedEffect {
  private shells: Shell[] = [];
  private sparks: Particle[] = [];
  private launchTimer = 0;
  private launched = 0;

  constructor() {
    super('fireworks');
  }

  protected override simulate(dt: number): void {
    this.launchTimer -= dt;
    if (this.progress < 0.55 && this.launchTimer <= 0 && this.launched < 9) {
      this.launchTimer = rand(0.12, 0.32);
      this.launched += 1;
      this.shells.push({
        x: rand(0.12, 0.88),
        y: 1.05,
        vy: rand(-1.5, -1.1),
        targetY: rand(0.15, 0.5),
        color: pick(COLORS),
        exploded: false,
      });
    }

    for (const shell of this.shells) {
      shell.y += shell.vy * dt;
      shell.vy += 0.55 * dt;
      if (!shell.exploded && (shell.y <= shell.targetY || shell.vy >= 0)) {
        shell.exploded = true;
        this.explode(shell);
      }
    }
    this.shells = this.shells.filter((s) => !s.exploded);

    for (const p of this.sparks) integrate(p, dt, 0.42, 0.9);
    this.sparks = this.sparks.filter(isAlive);
  }

  private explode(shell: Shell): void {
    const count = 46;
    const speed = rand(0.32, 0.5);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = speed * rand(0.55, 1);
      this.sparks.push({
        x: shell.x,
        y: shell.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        size: rand(0.004, 0.008),
        rotation: 0,
        spin: 0,
        life: 0,
        maxLife: rand(0.7, 1.35),
        color: Math.random() < 0.2 ? '#ffffff' : shell.color,
        seed: 0,
      });
    }
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.globalCompositeOperation = 'lighter';

    for (const shell of this.shells) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = shell.color;
      ctx.beginPath();
      ctx.arc(shell.x * width, shell.y * height, height * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of this.sparks) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = clamp01(1 - t) * 0.95;
      ctx.strokeStyle = p.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = p.size * height * 2;
      // Streak along the velocity vector — cheap, convincing motion trail.
      const trail = 0.035;
      ctx.beginPath();
      ctx.moveTo(p.x * width, p.y * height);
      ctx.lineTo((p.x - p.vx * trail) * width, (p.y - p.vy * trail) * height);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
