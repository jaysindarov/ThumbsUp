/**
 * Frame-level classification: hands in, candidate reaction out.
 *
 * Stateless. All temporal behaviour (hold, cooldown, dropout tolerance) lives
 * in `GestureMachine`, so this stays trivially testable.
 */

import { reactionForShapes, type HandShape, type ReactionId } from '../shared/reactions';
import { classifyHandShape, isHeart } from './handShape';
import type { Hand } from './landmarks';

export interface FrameClassification {
  /** Reaction the current frame suggests, or null. */
  reaction: ReactionId | null;
  /** Dominant per-hand shape, for the HUD. */
  shape: HandShape;
  /** Hands considered (after the confidence filter). */
  hands: number;
}

export const EMPTY_CLASSIFICATION: FrameClassification = {
  reaction: null,
  shape: 'none',
  hands: 0,
};

/**
 * @param hands       hands detected this frame (MediaPipe returns at most 2)
 * @param minScore    confidence floor; low-confidence hands are dropped
 */
export function classifyFrame(hands: readonly Hand[], minScore: number): FrameClassification {
  const confident = hands.filter((h) => h.score >= minScore).slice(0, 2);
  if (confident.length === 0) return EMPTY_CLASSIFICATION;

  const [first, second] = confident;

  // The heart is a two-hand relationship and outranks per-hand shapes: while
  // forming it, individual hands can momentarily read as `victory`.
  if (first && second && isHeart(first, second)) {
    return { reaction: 'hearts', shape: 'none', hands: 2 };
  }

  const shapes = confident.map(classifyHandShape);
  const recognised = shapes.filter((s): s is Exclude<HandShape, 'none'> => s !== 'none');

  if (recognised.length === 0) {
    return { reaction: null, shape: 'none', hands: confident.length };
  }

  // Two hands only combine into a two-hand reaction when they agree. A
  // mismatched pair (say 👍 + ✌️) is ambiguous, so we emit nothing rather than
  // guessing — the user is most likely mid-transition.
  if (recognised.length === 2 && recognised[0] !== recognised[1]) {
    return { reaction: null, shape: 'none', hands: confident.length };
  }

  const shape = recognised[0]!;
  return {
    reaction: reactionForShapes(shape, recognised.length),
    shape,
    hands: confident.length,
  };
}
