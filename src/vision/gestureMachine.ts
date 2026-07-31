/**
 * Turns a noisy per-frame reaction guess into deliberate, once-per-gesture
 * triggers.
 *
 * Rules, in the order they apply:
 *  1. A candidate must be held continuously for `holdMs` before it fires.
 *     This is what stops a hand wave from spraying reactions.
 *  2. Brief dropouts (a frame or two where the model loses the hand) do not
 *     reset the hold — see `graceMs`.
 *  3. After firing, the hand must leave the gesture before the same gesture
 *     can fire again, and `cooldownMs` must elapse regardless.
 *
 * Time is injected rather than read from the clock so tests are deterministic.
 */

import type { ReactionId } from '../shared/reactions';

export interface GestureMachineOptions {
  holdMs: number;
  cooldownMs: number;
  /** How long a candidate may disappear before the hold resets. */
  graceMs?: number;
  /** Per-reaction opt-out check. */
  isEnabled?: (reaction: ReactionId) => boolean;
}

export interface GestureUpdate {
  /** Reaction currently being held, if any. */
  pending: ReactionId | null;
  /** Hold completion, 0..1 — drives the HUD ring. */
  progress: number;
  /** Non-null exactly on the frame the gesture fires. */
  fired: ReactionId | null;
}

const IDLE: GestureUpdate = { pending: null, progress: 0, fired: null };

export class GestureMachine {
  private holdMs: number;
  private cooldownMs: number;
  private readonly graceMs: number;
  private isEnabled: (reaction: ReactionId) => boolean;

  private candidate: ReactionId | null = null;
  private candidateSince = 0;
  private lastSeenAt = 0;
  private lastFiredAt = Number.NEGATIVE_INFINITY;
  /** False between firing and the user releasing the gesture. */
  private armed = true;

  constructor(options: GestureMachineOptions) {
    this.holdMs = options.holdMs;
    this.cooldownMs = options.cooldownMs;
    // ~4 dropped frames at the 12 fps detection rate.
    this.graceMs = options.graceMs ?? 350;
    this.isEnabled = options.isEnabled ?? (() => true);
  }

  /** Live-update tuning without dropping an in-progress hold. */
  configure(options: Partial<GestureMachineOptions>): void {
    if (typeof options.holdMs === 'number') this.holdMs = options.holdMs;
    if (typeof options.cooldownMs === 'number') this.cooldownMs = options.cooldownMs;
    if (options.isEnabled) this.isEnabled = options.isEnabled;
  }

  /** Forget all state — call when the camera stops or the tab is hidden. */
  reset(): void {
    this.candidate = null;
    this.candidateSince = 0;
    this.lastSeenAt = 0;
    this.armed = true;
  }

  /**
   * @param now        monotonic timestamp in ms (`performance.now()`)
   * @param candidate  what this frame looks like, or null for "nothing"
   */
  update(now: number, candidate: ReactionId | null): GestureUpdate {
    const accepted = candidate && this.isEnabled(candidate) ? candidate : null;

    if (accepted === null) {
      // Tolerate short dropouts: keep the hold alive inside the grace window.
      const withinGrace = this.candidate !== null && now - this.lastSeenAt <= this.graceMs;
      if (!withinGrace) {
        this.candidate = null;
        this.armed = true;
        return IDLE;
      }
    } else {
      if (accepted !== this.candidate) {
        // Changing to a different gesture is itself a release of the old one.
        this.candidate = accepted;
        this.candidateSince = now;
        this.armed = true;
      }
      this.lastSeenAt = now;
    }

    const pending = this.candidate;
    if (pending === null) return IDLE;

    const progress = Math.min(1, (now - this.candidateSince) / Math.max(1, this.holdMs));
    const canFire = this.armed && progress >= 1 && now - this.lastFiredAt >= this.cooldownMs;

    if (!canFire) return { pending, progress, fired: null };

    this.lastFiredAt = now;
    this.armed = false;
    return { pending, progress: 1, fired: pending };
  }
}
