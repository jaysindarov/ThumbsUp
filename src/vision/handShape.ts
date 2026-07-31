/**
 * Per-hand shape recognition, and the two-handed heart relationship.
 *
 * Thresholds are exported so tests can document *why* a fixture passes or
 * fails, and so tuning happens in one place instead of scattered magic numbers.
 */

import type { HandShape } from '../shared/reactions';
import {
  LM,
  at,
  distance2d,
  fingerDirection,
  handScale,
  isCurled,
  isExtended,
  sub,
  angleBetween,
  type Hand,
  type Landmark,
} from './landmarks';

export const SHAPE_THRESHOLDS = {
  /**
   * Vertical component a thumb must have to count as up/down (unit vector).
   * Kept fairly loose: people rarely hold a thumb perfectly vertical, and the
   * curled-fingers test already rules out most other poses.
   */
  THUMB_VERTICALITY: 0.45,
  /** Minimum angle between index and middle for a victory sign, in degrees. */
  VICTORY_SPREAD_DEG: 14,
  /** Thumb tips this close (× hand scale) count as touching, for hearts. */
  HEART_THUMB_GAP: 0.75,
  /** Index tips this close (× hand scale) count as touching, for hearts. */
  HEART_INDEX_GAP: 0.95,
  /** Index tips must sit at least this far (× hand scale) above thumb tips. */
  HEART_VERTICAL_OFFSET: 0.25,
  /** Wrists must be at least this far apart horizontally (× hand scale). */
  HEART_WRIST_SPREAD: 0.5,
} as const;

/**
 * Classify a single hand into one of the shapes the reaction catalog uses.
 * Returns `'none'` when nothing matches — the common case, by design.
 */
export function classifyHandShape(hand: Hand): HandShape {
  const { world, landmarks } = hand;

  const thumbExtended = isExtended(world, 'thumb');
  const indexExtended = isExtended(world, 'index');
  const middleExtended = isExtended(world, 'middle');
  const ringCurled = isCurled(world, 'ring');
  const pinkyCurled = isCurled(world, 'pinky');
  const middleCurled = isCurled(world, 'middle');
  const indexCurled = isCurled(world, 'index');
  const pinkyExtended = isExtended(world, 'pinky');

  // 👍 / 👎 — thumb out and vertical, all four fingers folded into the palm.
  if (thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled) {
    const dir = fingerDirection(landmarks, 'thumb');
    if (dir.y <= -SHAPE_THRESHOLDS.THUMB_VERTICALITY) return 'thumbUp';
    if (dir.y >= SHAPE_THRESHOLDS.THUMB_VERTICALITY) return 'thumbDown';
    return 'none';
  }

  // ✌️ — index and middle up and spread, ring and pinky folded.
  if (indexExtended && middleExtended && ringCurled && pinkyCurled) {
    const spread = angleBetween(
      sub(at(landmarks, LM.INDEX_TIP), at(landmarks, LM.INDEX_MCP)),
      sub(at(landmarks, LM.MIDDLE_TIP), at(landmarks, LM.MIDDLE_MCP)),
    );
    return spread >= SHAPE_THRESHOLDS.VICTORY_SPREAD_DEG ? 'victory' : 'none';
  }

  // 🤘 — index and pinky up, middle and ring folded.
  if (indexExtended && pinkyExtended && middleCurled && ringCurled) {
    return 'rock';
  }

  return 'none';
}

/**
 * Detect the two-handed heart: thumb tips meeting at the bottom point, index
 * fingertips meeting at the top, wrists apart on either side.
 *
 * This is a relationship between two hands, so it cannot be expressed as a
 * per-hand shape and is checked before the per-hand table.
 */
export function isHeart(a: Hand, b: Hand): boolean {
  const scale = (handScale(a.landmarks) + handScale(b.landmarks)) / 2;
  if (scale < 1e-6) return false;

  const thumbA = at(a.landmarks, LM.THUMB_TIP);
  const thumbB = at(b.landmarks, LM.THUMB_TIP);
  const indexA = at(a.landmarks, LM.INDEX_TIP);
  const indexB = at(b.landmarks, LM.INDEX_TIP);

  const thumbGap = distance2d(thumbA, thumbB) / scale;
  if (thumbGap > SHAPE_THRESHOLDS.HEART_THUMB_GAP) return false;

  const indexGap = distance2d(indexA, indexB) / scale;
  if (indexGap > SHAPE_THRESHOLDS.HEART_INDEX_GAP) return false;

  // Index tips form the top of the heart, thumb tips the bottom point.
  const indexY = (indexA.y + indexB.y) / 2;
  const thumbY = (thumbA.y + thumbB.y) / 2;
  if ((thumbY - indexY) / scale < SHAPE_THRESHOLDS.HEART_VERTICAL_OFFSET) return false;

  // Two hands side by side, not one hand detected twice.
  const wristSpread =
    Math.abs(at(a.landmarks, LM.WRIST).x - at(b.landmarks, LM.WRIST).x) / scale;
  return wristSpread >= SHAPE_THRESHOLDS.HEART_WRIST_SPREAD;
}

/** Small helper used by tests and the HUD. */
export function describeLandmark(p: Landmark): string {
  return `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
}
