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
 *  4. Two hands never come up at exactly the same moment. A gesture that has a
 *     two-handed sibling (👍 → 🎆) keeps its hold timer when the second hand
 *     arrives, and waits `upgradeGraceMs` past the hold before firing — without
 *     this you get Thumbs Up every time you meant Fireworks.
 *
 * Time is injected rather than read from the clock so tests are deterministic.
 */

import { familyOf, twoHandSibling, type ReactionId } from '../shared/reactions';

export interface GestureMachineOptions {
  holdMs: number;
  cooldownMs: number;
  /** How long a candidate may disappear before the hold resets. */
  graceMs?: number;
  /** Extra wait before firing a gesture that has a two-handed sibling. */
  upgradeGraceMs?: number;
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
  private readonly upgradeGraceMs: number;
  /** When each reaction was last seen, used to resolve one-vs-two-hand flicker. */
  private readonly seenAt = new Map<ReactionId, number>();
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
    // Long enough to catch a second hand on its way up, short enough that a
    // genuine one-handed reaction still feels responsive.
    this.upgradeGraceMs = options.upgradeGraceMs ?? 400;
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
    this.seenAt.clear();
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
        // Switching within a family (👍 → 🎆, one hand becoming two) is the same
        // gesture being refined, so the hold carries over. Anything else is a
        // new gesture and starts from zero.
        const sameFamily =
          this.candidate !== null && familyOf(accepted) === familyOf(this.candidate);
        if (!sameFamily) this.candidateSince = now;
        this.candidate = accepted;
        // Either way it is a different reaction, so the previous one is released.
        this.armed = true;
      }
      this.lastSeenAt = now;
      this.seenAt.set(accepted, now);
    }

    const pending = this.candidate;
    if (pending === null) return IDLE;

    const required = Math.max(1, this.holdMs + (twoHandSibling(pending) ? this.upgradeGraceMs : 0));
    const progress = Math.min(1, (now - this.candidateSince) / required);
    const canFire = this.armed && progress >= 1 && now - this.lastFiredAt >= this.cooldownMs;

    if (!canFire) return { pending, progress, fired: null };

    this.lastFiredAt = now;
    this.armed = false;
    return { pending, progress: 1, fired: this.resolveHandCount(pending, now) };
  }

  /**
   * Decide the one-hand vs two-hand variant at fire time.
   *
   * The frame classifier only reports a two-handed reaction when *both* hands
   * read cleanly in the same frame. A hand that turns, or drifts to the edge of
   * frame, drops out for a few frames and the reading collapses back to the
   * one-handed variant — so 👍👍 fires Thumbs Up.
   *
   * The rule: if two hands were seen at any point during *this* hold, two hands
   * is what the user meant. Losing a hand for a few frames is routine; putting
   * a second hand up by accident is not. Scoping it to the current hold rather
   * than a fixed time window makes it self-limiting — releasing the gesture
   * starts a new hold, and older sightings stop counting automatically.
   */
  private resolveHandCount(pending: ReactionId, _now: number): ReactionId {
    const sibling = twoHandSibling(pending);
    if (!sibling) return pending;
    const seen = this.seenAt.get(sibling);
    return seen !== undefined && seen >= this.candidateSince ? sibling : pending;
  }
}
