import type { ReactionId } from '../shared/reactions';
import { TimedEffect } from './base';
import { clamp01, drawEmoji, rand } from './utils';

interface Badge {
  /** Position in normalised space. */
  x: number;
  y: number;
  /** Diameter as a fraction of frame height. */
  size: number;
  /** Seconds before this badge appears. */
  delay: number;
  /** Rise speed, in frame-heights per second. */
  speed: number;
  /** Sway phase. */
  seed: number;
  tilt: number;
}

const PALETTE = {
  thumbsUp: {
    emoji: '👍',
    highlight: 'rgba(255, 245, 210, 0.95)',
    mid: '#ffc93c',
    edge: '#f08a24',
    glow: 'rgba(255, 176, 46, 0.55)',
  },
  thumbsDown: {
    emoji: '👎',
    highlight: 'rgba(226, 238, 255, 0.95)',
    mid: '#7aa6ff',
    edge: '#3f63c9',
    glow: 'rgba(90, 130, 235, 0.5)',
  },
} as const;

/**
 * 👍 / 👎 Thumbs.
 *
 * Not a bare emoji sliding past: each thumb rides in a glossy balloon-like
 * badge that swells into place, drifts, and fades — the same read as the macOS
 * reaction. One hero badge leads, smaller companions follow behind it.
 */
export class ThumbsEffect extends TimedEffect {
  private readonly palette: (typeof PALETTE)[keyof typeof PALETTE];
  /** -1 rises, +1 sinks. */
  private readonly direction: -1 | 1;
  private readonly badges: Badge[];

  constructor(id: Extract<ReactionId, 'thumbsUp' | 'thumbsDown'>) {
    super(id);
    this.palette = PALETTE[id];
    this.direction = id === 'thumbsUp' ? -1 : 1;
    // Badges sit inside the frame from the start, so the whole effect can use
    // the shared grow-in entrance.
    this.entrance = 'grow';

    const hero: Badge = {
      x: 0.5,
      y: id === 'thumbsUp' ? 0.62 : 0.4,
      size: 0.3,
      delay: 0,
      speed: 0.075,
      seed: rand(0, Math.PI * 2),
      tilt: rand(-0.06, 0.06),
    };

    const companions = Array.from({ length: 5 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return {
        x: 0.5 + side * rand(0.16, 0.33),
        y: hero.y + rand(0.04, 0.2) * -this.direction,
        size: rand(0.11, 0.18),
        delay: 0.22 + i * 0.14 + rand(0, 0.06),
        speed: rand(0.09, 0.16),
        seed: rand(0, Math.PI * 2),
        tilt: rand(-0.22, 0.22),
      } satisfies Badge;
    });

    this.badges = [hero, ...companions];
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const badge of this.badges) {
      const age = this.elapsed - badge.delay;
      if (age <= 0) continue;

      const life = clamp01(age / (this.durationSec - badge.delay));
      // Swell in over the first third of a second, hold, then shrink away.
      const swell = this.swell(age, life);
      if (swell <= 0.01) continue;

      const sway = Math.sin(badge.seed + age * 1.6) * 0.014;
      const x = (badge.x + sway) * width;
      const y = (badge.y + this.direction * badge.speed * age) * height;
      const radius = (badge.size * height * swell) / 2;
      const alpha = clamp01(Math.min(age * 5, (1 - life) * 3.2));

      this.drawBadge(ctx, x, y, radius, alpha, badge.tilt + sway * 1.5);
    }
    ctx.globalAlpha = 1;
  }

  /** Scale envelope: overshoot on entry, settle, then collapse at the end. */
  private swell(age: number, life: number): number {
    const rise = clamp01(age / 0.34);
    const pop = 1 - Math.pow(1 - rise, 3);
    const overshoot = Math.sin(rise * Math.PI) * 0.14;
    const exit = life > 0.82 ? clamp01((1 - life) / 0.18) : 1;
    return (pop + overshoot) * exit;
  }

  private drawBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    alpha: number,
    tilt: number,
  ): void {
    const { highlight, mid, edge, glow, emoji } = this.palette;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(tilt);

    ctx.shadowColor = glow;
    ctx.shadowBlur = radius * 0.9;
    ctx.shadowOffsetY = radius * 0.12;

    // Light comes from the upper left, so the gradient origin does too.
    const body = ctx.createRadialGradient(
      -radius * 0.35,
      -radius * 0.45,
      radius * 0.1,
      0,
      0,
      radius,
    );
    body.addColorStop(0, highlight);
    body.addColorStop(0.45, mid);
    body.addColorStop(1, edge);

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // Rim and specular highlight sell the balloon rather than a flat disc.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = radius * 0.07;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      -radius * 0.3,
      -radius * 0.42,
      radius * 0.38,
      radius * 0.24,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    drawEmoji(ctx, emoji, 0, radius * 0.04, radius * 1.05);
    ctx.restore();
  }
}
