/**
 * Geometry helpers over MediaPipe hand landmarks.
 *
 * Two coordinate spaces are in play and they are NOT interchangeable:
 *
 *  - `landmarks`      normalised image space. x/y in 0..1, y grows downward,
 *                     z is only loosely metric. Use for *orientation in frame*
 *                     (is the thumb pointing up?) and for hand-to-hand
 *                     relationships.
 *  - `worldLandmarks` metric space in metres, origin at the hand centre.
 *                     Use for *shape* (is this finger bent?) because it is
 *                     invariant to how far away the hand is.
 *
 * Everything here is pure and side-effect free so it can be unit tested with
 * hand-authored fixtures.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** A single detected hand, in the form the detector normalises to. */
export interface Hand {
  /** 21 landmarks in normalised image space. */
  landmarks: Landmark[];
  /** 21 landmarks in metric world space. */
  world: Landmark[];
  /** 'Left' | 'Right' as reported by MediaPipe (mirrored camera caveat applies). */
  handedness: string;
  /** Detection confidence, 0..1. */
  score: number;
}

/** Well-known landmark indices (MediaPipe hand model). */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/** Joint chains, base → tip, one per finger. */
export const FINGER_JOINTS: Record<FingerName, readonly [number, number, number, number]> = {
  thumb: [LM.THUMB_CMC, LM.THUMB_MCP, LM.THUMB_IP, LM.THUMB_TIP],
  index: [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  middle: [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  ring: [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  pinky: [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
};

export const FINGERS: readonly FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/* ---------------------------------- vectors --------------------------------- */

export function at(points: readonly Landmark[], index: number): Landmark {
  const p = points[index];
  if (!p) throw new RangeError(`landmark ${index} missing (got ${points.length} points)`);
  return p;
}

export function sub(a: Landmark, b: Landmark): Landmark {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function length(v: Landmark): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function distance(a: Landmark, b: Landmark): number {
  return length(sub(a, b));
}

/** Distance ignoring depth — more reliable in normalised image space. */
export function distance2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dot(a: Landmark, b: Landmark): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Angle between two vectors in degrees, 0..180. */
export function angleBetween(a: Landmark, b: Landmark): number {
  const denom = length(a) * length(b);
  if (denom < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, dot(a, b) / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

/* ----------------------------------- shape ---------------------------------- */

/**
 * Scale proxy for a hand, in the units of whatever space `points` is in.
 * Wrist → middle-finger knuckle is stable under rotation and finger movement.
 */
export function handScale(points: readonly Landmark[]): number {
  return Math.max(1e-6, distance2d(at(points, LM.WRIST), at(points, LM.MIDDLE_MCP)));
}

/**
 * Total bend of a finger in degrees (0 = perfectly straight, ~180 = fully
 * curled). Computed on world landmarks so it does not depend on distance to
 * the camera or on the hand's rotation in frame.
 */
export function fingerBendDeg(world: readonly Landmark[], finger: FingerName): number {
  const [a, b, c, d] = FINGER_JOINTS[finger];
  const v1 = sub(at(world, b), at(world, a));
  const v2 = sub(at(world, c), at(world, b));
  const v3 = sub(at(world, d), at(world, c));
  return angleBetween(v1, v2) + angleBetween(v2, v3);
}

/**
 * Bend thresholds, in summed degrees.
 *
 * The gap between EXTENDED and CURLED is deliberate: a finger in between is
 * reported as neither, and callers must treat that as "unknown" rather than as
 * the opposite state. Removing the gap makes recognition flicker frame to
 * frame, which reads to the user as "it works sometimes".
 */
export const BEND = {
  /** Below this a finger counts as extended. */
  EXTENDED: 55,
  /** Above this a finger counts as curled. */
  CURLED: 95,
  /**
   * The thumb needs its own, looser pair. A real thumbs-up thumb is not
   * straight — the CMC→MCP→IP chain keeps 30–60° of bend even when the user
   * would call it fully extended.
   */
  THUMB_EXTENDED: 60,
  THUMB_CURLED: 95,
} as const;

export function isExtended(world: readonly Landmark[], finger: FingerName): boolean {
  const limit = finger === 'thumb' ? BEND.THUMB_EXTENDED : BEND.EXTENDED;
  return fingerBendDeg(world, finger) < limit;
}

export function isCurled(world: readonly Landmark[], finger: FingerName): boolean {
  const limit = finger === 'thumb' ? BEND.THUMB_CURLED : BEND.CURLED;
  return fingerBendDeg(world, finger) > limit;
}

/** `true` when every listed finger is curled. */
export function allCurled(world: readonly Landmark[], fingers: readonly FingerName[]): boolean {
  return fingers.every((f) => isCurled(world, f));
}

/**
 * Direction a finger points, as a unit vector in normalised image space.
 * y is negative when pointing towards the top of the frame.
 */
export function fingerDirection(landmarks: readonly Landmark[], finger: FingerName): Landmark {
  const [base, , , tip] = FINGER_JOINTS[finger];
  const v = sub(at(landmarks, tip), at(landmarks, base));
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len, z: 0 };
}
