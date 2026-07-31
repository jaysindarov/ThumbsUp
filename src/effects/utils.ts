/** Small maths/drawing helpers shared by the reaction effects. */

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

export function pick<T>(items: readonly T[]): T {
  const value = items[Math.floor(Math.random() * items.length)];
  if (value === undefined) throw new RangeError('pick() called with an empty array');
  return value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Smooth 0→1→0 envelope, used for fade in/out. */
export function pulse(t: number, fadeIn = 0.12, fadeOut = 0.25): number {
  if (t < fadeIn) return clamp01(t / fadeIn);
  if (t > 1 - fadeOut) return clamp01((1 - t) / fadeOut);
  return 1;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

/** Font stack that resolves to the platform colour-emoji font. */
export const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "EmojiOne Color", sans-serif';

export function drawEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  sizePx: number,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.font = `${Math.max(1, Math.round(sizePx))}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

/** Trace a heart centred on (x, y), `size` px tall. Caller fills or strokes. */
export function traceHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.75);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.55, y - s * 1.15, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 1.4, y - s * 0.2, x, y + s * 0.75);
  ctx.closePath();
}
