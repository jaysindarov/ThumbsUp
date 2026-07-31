/**
 * Per-hand shape recognition, and the two-handed heart relationship.
 *
 * Thresholds are exported so tests can document *why* a fixture passes or
 * fails, and so tuning happens in one place instead of scattered magic numbers.
 */

import type { HandShape } from '../shared/reactions';
import {
  BEND,
  LM,
  at,
  distance2d,
  fingerBendDeg,
  fingerDirection,
  handScale,
  sub,
  angleBetween,
  type FingerName,
  type Hand,
  type Landmark,
} from './landmarks';

/** A finger is extended, curled, or too ambiguous to call. */
export type FingerState = 'extended' | 'curled' | 'between';

const OTHER_FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

export function fingerState(world: readonly Landmark[], finger: FingerName): FingerState {
  const bend = fingerBendDeg(world, finger);
  const extendedLimit = finger === 'thumb' ? BEND.THUMB_EXTENDED : BEND.EXTENDED;
  const curledLimit = finger === 'thumb' ? BEND.THUMB_CURLED : BEND.CURLED;
  if (bend < extendedLimit) return 'extended';
  if (bend > curledLimit) return 'curled';
  return 'between';
}

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
  /**
   * How many of the four fingers must read as curled for a thumbs up/down.
   * Not all four: one finger sitting in the ambiguous band is enough to drop
   * an otherwise perfect gesture, and that is the difference between "works"
   * and "works sometimes".
   */
  FIST_MIN_CURLED: 3,
} as const;

/**
 * Classify a single hand into one of the shapes the reaction catalog uses.
 * Returns `'none'` when nothing matches — the common case, by design.
 */
export function classifyHandShape(hand: Hand): HandShape {
  const { world, landmarks } = hand;

  const state = {
    thumb: fingerState(world, 'thumb'),
    index: fingerState(world, 'index'),
    middle: fingerState(world, 'middle'),
    ring: fingerState(world, 'ring'),
    pinky: fingerState(world, 'pinky'),
  } as const;

  const curledCount = OTHER_FINGERS.filter((f) => state[f] === 'curled').length;
  const anyExtended = OTHER_FINGERS.some((f) => state[f] === 'extended');

  const indexExtended = state.index === 'extended';
  const middleExtended = state.middle === 'extended';
  const pinkyExtended = state.pinky === 'extended';

  // 👍 / 👎 — thumb out and vertical, fingers folded into the palm.
  // Positive conditions require certainty; negative ones only require the
  // absence of the opposite, so an ambiguous finger cannot veto the gesture.
  if (state.thumb !== 'curled' && curledCount >= SHAPE_THRESHOLDS.FIST_MIN_CURLED && !anyExtended) {
    const dir = fingerDirection(landmarks, 'thumb');
    if (dir.y <= -SHAPE_THRESHOLDS.THUMB_VERTICALITY) return 'thumbUp';
    if (dir.y >= SHAPE_THRESHOLDS.THUMB_VERTICALITY) return 'thumbDown';
    return 'none';
  }

  // ✌️ — index and middle up and spread, ring and pinky not up.
  if (indexExtended && middleExtended && state.ring !== 'extended' && state.pinky !== 'extended') {
    const spread = angleBetween(
      sub(at(landmarks, LM.INDEX_TIP), at(landmarks, LM.INDEX_MCP)),
      sub(at(landmarks, LM.MIDDLE_TIP), at(landmarks, LM.MIDDLE_MCP)),
    );
    return spread >= SHAPE_THRESHOLDS.VICTORY_SPREAD_DEG ? 'victory' : 'none';
  }

  // 🤘 — index and pinky up, middle and ring not up.
  if (indexExtended && pinkyExtended && state.middle !== 'extended' && state.ring !== 'extended') {
    return 'rock';
  }

  return 'none';
}

/**
 * Per-finger bend readings for the debug log. This is what to look at when a
 * gesture "works sometimes": a finger parked in the `between` band, or a thumb
 * whose bend sits right on `THUMB_EXTENDED`, is the usual culprit.
 */
export function handDiagnostics(hand: Hand): Record<string, string> {
  const out: Record<string, string> = {
    shape: classifyHandShape(hand),
    score: hand.score.toFixed(2),
    thumbY: fingerDirection(hand.landmarks, 'thumb').y.toFixed(2),
  };
  for (const finger of ['thumb', ...OTHER_FINGERS] as const) {
    out[finger] = `${fingerBendDeg(hand.world, finger).toFixed(0)}° ${fingerState(hand.world, finger)}`;
  }
  return out;
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
