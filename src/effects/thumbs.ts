import type { ReactionId } from '../shared/reactions';
import { TimedEffect } from './base';
import { clamp01, drawEmoji, easeOutCubic, rand } from './utils';

interface Glyph {
  x: number;
  delay: number;
  size: number;
  tilt: number;
}

/**
 * 👍 / 👎 Thumbs — a burst of thumbs that pop in and travel off the top
 * (up) or bottom (down) of the frame.
 */
export class ThumbsEffect extends TimedEffect {
  private readonly emoji: string;
  private readonly direction: -1 | 1;
  private readonly glyphs: Glyph[];

  constructor(id: Extract<ReactionId, 'thumbsUp' | 'thumbsDown'>) {
    super(id);
    this.emoji = id === 'thumbsUp' ? '👍' : '👎';
    this.direction = id === 'thumbsUp' ? -1 : 1;
    this.glyphs = Array.from({ length: 7 }, (_, i) => ({
      x: 0.12 + (i / 6) * 0.76 + rand(-0.04, 0.04),
      delay: i * 0.055 + rand(0, 0.05),
      size: rand(0.14, 0.22),
      tilt: rand(-0.3, 0.3),
    }));
  }

  protected render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const start = this.direction === -1 ? 1.15 : -0.15;

    for (const g of this.glyphs) {
      const t = clamp01((this.elapsed - g.delay) / (this.durationSec - g.delay));
      if (t <= 0) continue;

      const travel = easeOutCubic(t) * 1.35 * this.direction;
      const y = (start + travel) * height;
      const wobble = Math.sin(t * 7 + g.x * 10) * 0.02;
      const alpha = clamp01(Math.min(t * 8, (1 - t) * 3));
      const scale = 0.6 + easeOutCubic(Math.min(1, t * 3)) * 0.4;

      ctx.globalAlpha = alpha;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = height * 0.02;
      drawEmoji(
        ctx,
        this.emoji,
        (g.x + wobble) * width,
        y,
        g.size * height * scale,
        g.tilt * (1 - t),
      );
    }
    ctx.globalAlpha = 1;
  }
}
