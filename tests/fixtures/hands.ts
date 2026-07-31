/**
 * Synthetic hand fixtures.
 *
 * Real webcam captures would be more faithful but they are opaque: when a test
 * fails you cannot tell *why* the fixture is a thumbs-up. These hands are built
 * from an explicit skeleton — finger base positions, directions and per-joint
 * curl — so a failing assertion points straight at the threshold that moved.
 */

import { FINGER_JOINTS, type FingerName, type Hand, type Landmark } from '../../src/vision/landmarks';

export type FingerState = 'extended' | 'curled';

interface Vec2 {
  x: number;
  y: number;
}

/** Skeleton in a right-handed, y-up space with the wrist at the origin. */
const FINGER_BASE: Record<FingerName, { base: Vec2; angleDeg: number; lengths: [number, number, number] }> = {
  thumb: { base: { x: -0.3, y: 0.12 }, angleDeg: 125, lengths: [0.24, 0.2, 0.17] },
  index: { base: { x: -0.16, y: 0.6 }, angleDeg: 96, lengths: [0.3, 0.22, 0.17] },
  middle: { base: { x: 0.0, y: 0.65 }, angleDeg: 90, lengths: [0.32, 0.24, 0.18] },
  ring: { base: { x: 0.16, y: 0.61 }, angleDeg: 84, lengths: [0.29, 0.22, 0.17] },
  pinky: { base: { x: 0.31, y: 0.52 }, angleDeg: 78, lengths: [0.24, 0.18, 0.14] },
};

/** Degrees each joint bends when a finger is curled (sums past the threshold). */
const CURL_PER_JOINT = 72;

export interface HandSpec {
  fingers: Partial<Record<FingerName, FingerState>>;
  /** Override a finger's pointing direction, in degrees (0 = +x, 90 = up). */
  angles?: Partial<Record<FingerName, number>>;
  /** Wrist position in normalised image space. */
  origin?: Vec2;
  /** Hand size in normalised image space (wrist → middle knuckle ≈ 0.65 × this). */
  scale?: number;
  /** Mirror horizontally, for the other hand. */
  mirror?: boolean;
  handedness?: 'Left' | 'Right';
  score?: number;
}

function rotate(v: Vec2, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function chain(finger: FingerName, state: FingerState, angleDeg: number): Vec2[] {
  const { base, lengths } = FINGER_BASE[finger];
  const points: Vec2[] = [base];
  let direction = rotate({ x: 1, y: 0 }, angleDeg);
  let cursor = base;

  for (let i = 0; i < lengths.length; i += 1) {
    if (state === 'curled' && i > 0) direction = rotate(direction, -CURL_PER_JOINT);
    const len = lengths[i]!;
    cursor = { x: cursor.x + direction.x * len, y: cursor.y + direction.y * len };
    points.push(cursor);
  }
  return points;
}

/** Build a hand from a skeleton spec. */
export function makeHand(spec: HandSpec): Hand {
  const origin = spec.origin ?? { x: 0.5, y: 0.7 };
  const scale = spec.scale ?? 0.22;
  const mirror = spec.mirror ?? false;

  const world: Landmark[] = new Array(21);
  const landmarks: Landmark[] = new Array(21);

  const place = (index: number, point: Vec2) => {
    const x = mirror ? -point.x : point.x;
    world[index] = { x, y: point.y, z: 0 };
    // Image space: y grows downward, hand scaled and translated into frame.
    landmarks[index] = { x: origin.x + x * scale, y: origin.y - point.y * scale, z: 0 };
  };

  place(0, { x: 0, y: 0 });

  for (const finger of Object.keys(FINGER_BASE) as FingerName[]) {
    const state = spec.fingers[finger] ?? 'curled';
    const angle = spec.angles?.[finger] ?? FINGER_BASE[finger].angleDeg;
    const points = chain(finger, state, mirror ? 180 - angle : angle);
    const joints = FINGER_JOINTS[finger];
    for (let i = 0; i < joints.length; i += 1) place(joints[i]!, points[i]!);
  }

  return {
    landmarks,
    world,
    handedness: spec.handedness ?? (mirror ? 'Left' : 'Right'),
    score: spec.score ?? 0.95,
  };
}

/* --------------------------- named gestures --------------------------- */

export const thumbUpHand = (overrides: Partial<HandSpec> = {}): Hand =>
  makeHand({
    fingers: { thumb: 'extended', index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' },
    angles: { thumb: 90 },
    ...overrides,
  });

export const thumbDownHand = (overrides: Partial<HandSpec> = {}): Hand =>
  makeHand({
    fingers: { thumb: 'extended', index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' },
    angles: { thumb: -90 },
    ...overrides,
  });

export const victoryHand = (overrides: Partial<HandSpec> = {}): Hand =>
  makeHand({
    fingers: { thumb: 'curled', index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled' },
    angles: { index: 104, middle: 76 },
    ...overrides,
  });

export const rockHand = (overrides: Partial<HandSpec> = {}): Hand =>
  makeHand({
    fingers: { thumb: 'curled', index: 'extended', middle: 'curled', ring: 'curled', pinky: 'extended' },
    ...overrides,
  });

export const openPalmHand = (overrides: Partial<HandSpec> = {}): Hand =>
  makeHand({
    fingers: {
      thumb: 'extended',
      index: 'extended',
      middle: 'extended',
      ring: 'extended',
      pinky: 'extended',
    },
    ...overrides,
  });

/**
 * Two hands forming a heart. The finger skeleton alone cannot express the
 * curved, interlocking pose, so the four tips that define the shape are placed
 * directly — which is exactly what `isHeart` looks at.
 */
export function heartPair(): [Hand, Hand] {
  const left = makeHand({
    fingers: { thumb: 'extended', index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' },
    origin: { x: 0.35, y: 0.78 },
    scale: 0.22,
  });
  const right = makeHand({
    fingers: { thumb: 'extended', index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' },
    origin: { x: 0.65, y: 0.78 },
    scale: 0.22,
    mirror: true,
  });

  // Thumb tips meet at the bottom point, index tips at the top of the heart.
  left.landmarks[4] = { x: 0.492, y: 0.62, z: 0 };
  right.landmarks[4] = { x: 0.508, y: 0.62, z: 0 };
  left.landmarks[8] = { x: 0.487, y: 0.45, z: 0 };
  right.landmarks[8] = { x: 0.513, y: 0.45, z: 0 };

  return [left, right];
}
