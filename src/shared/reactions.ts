/**
 * Canonical reaction catalog.
 *
 * Gesture mapping mirrors macOS Sonoma "Reactions" exactly, so muscle memory
 * carries over from a MacBook to any browser. Do not change these mappings
 * without a very good reason — parity is the whole point of the product.
 */

export const REACTION_IDS = [
  'hearts',
  'thumbsUp',
  'thumbsDown',
  'fireworks',
  'rain',
  'balloons',
  'confetti',
  'lasers',
] as const;

export type ReactionId = (typeof REACTION_IDS)[number];

/** Shape a single hand can be in. `none` means "no recognised shape". */
export const HAND_SHAPES = ['none', 'thumbUp', 'thumbDown', 'victory', 'rock'] as const;
export type HandShape = (typeof HAND_SHAPES)[number];

export interface ReactionDescriptor {
  id: ReactionId;
  /** Human label used in the popup. */
  label: string;
  /** Emoji used as the popup affordance. */
  emoji: string;
  /** Short gesture description, matching Apple's wording. */
  gesture: string;
  /** How many hands the gesture needs. */
  hands: 1 | 2;
  /** Effect duration in ms. */
  durationMs: number;
}

export const REACTIONS: Record<ReactionId, ReactionDescriptor> = {
  hearts: {
    id: 'hearts',
    label: 'Hearts',
    emoji: '❤️',
    gesture: 'Heart shape with both hands',
    hands: 2,
    durationMs: 3400,
  },
  thumbsUp: {
    id: 'thumbsUp',
    label: 'Thumbs Up',
    emoji: '👍',
    gesture: 'One thumbs up',
    hands: 1,
    durationMs: 2400,
  },
  thumbsDown: {
    id: 'thumbsDown',
    label: 'Thumbs Down',
    emoji: '👎',
    gesture: 'One thumbs down',
    hands: 1,
    durationMs: 2400,
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks',
    emoji: '🎆',
    gesture: 'Two thumbs up',
    hands: 2,
    durationMs: 3600,
  },
  rain: {
    id: 'rain',
    label: 'Rain',
    emoji: '🌧️',
    gesture: 'Two thumbs down',
    hands: 2,
    durationMs: 3600,
  },
  balloons: {
    id: 'balloons',
    label: 'Balloons',
    emoji: '🎈',
    gesture: 'One victory sign',
    hands: 1,
    durationMs: 3600,
  },
  confetti: {
    id: 'confetti',
    label: 'Confetti',
    emoji: '🎊',
    gesture: 'Two victory signs',
    hands: 2,
    durationMs: 3400,
  },
  lasers: {
    id: 'lasers',
    label: 'Lasers',
    emoji: '🤟',
    gesture: 'Rock-on sign with both hands',
    hands: 2,
    durationMs: 3000,
  },
};

/**
 * Shape combination table.
 *
 * Key is `<shape>` for a single detected hand, or `<shape>+<shape>` (sorted)
 * when two hands show the same shape. The two-handed heart is special-cased in
 * the classifier because it is a relationship between hands, not a per-hand
 * shape.
 */
const COMBINATIONS: ReadonlyArray<{ shape: HandShape; hands: 1 | 2; reaction: ReactionId }> = [
  { shape: 'thumbUp', hands: 1, reaction: 'thumbsUp' },
  { shape: 'thumbUp', hands: 2, reaction: 'fireworks' },
  { shape: 'thumbDown', hands: 1, reaction: 'thumbsDown' },
  { shape: 'thumbDown', hands: 2, reaction: 'rain' },
  { shape: 'victory', hands: 1, reaction: 'balloons' },
  { shape: 'victory', hands: 2, reaction: 'confetti' },
  { shape: 'rock', hands: 2, reaction: 'lasers' },
];

/** Resolve `n` hands all showing `shape` to a reaction, if one exists. */
export function reactionForShapes(shape: HandShape, hands: number): ReactionId | null {
  if (shape === 'none' || hands < 1) return null;
  const wanted = hands >= 2 ? 2 : 1;
  return COMBINATIONS.find((c) => c.shape === shape && c.hands === wanted)?.reaction ?? null;
}
