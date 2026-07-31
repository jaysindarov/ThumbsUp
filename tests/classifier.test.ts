import { describe, expect, it } from 'vitest';

import { classifyFrame } from '../src/vision/classifier';
import {
  heartPair,
  openPalmHand,
  rockHand,
  thumbDownHand,
  thumbUpHand,
  victoryHand,
} from './fixtures/hands';

const MIN_SCORE = 0.55;

describe('classifyFrame — macOS Reactions parity', () => {
  it('one thumbs up → Thumbs Up', () => {
    expect(classifyFrame([thumbUpHand()], MIN_SCORE).reaction).toBe('thumbsUp');
  });

  it('two thumbs up → Fireworks', () => {
    const hands = [thumbUpHand({ origin: { x: 0.35, y: 0.7 } }), thumbUpHand({ origin: { x: 0.65, y: 0.7 } })];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBe('fireworks');
  });

  it('one thumbs down → Thumbs Down', () => {
    expect(classifyFrame([thumbDownHand()], MIN_SCORE).reaction).toBe('thumbsDown');
  });

  it('two thumbs down → Rain', () => {
    const hands = [
      thumbDownHand({ origin: { x: 0.35, y: 0.7 } }),
      thumbDownHand({ origin: { x: 0.65, y: 0.7 } }),
    ];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBe('rain');
  });

  it('one victory sign → Balloons', () => {
    expect(classifyFrame([victoryHand()], MIN_SCORE).reaction).toBe('balloons');
  });

  it('two victory signs → Confetti', () => {
    const hands = [victoryHand({ origin: { x: 0.35, y: 0.7 } }), victoryHand({ origin: { x: 0.65, y: 0.7 } })];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBe('confetti');
  });

  it('two rock-on signs → Lasers', () => {
    const hands = [rockHand({ origin: { x: 0.35, y: 0.7 } }), rockHand({ origin: { x: 0.65, y: 0.7 } })];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBe('lasers');
  });

  it('two hands forming a heart → Hearts', () => {
    expect(classifyFrame(heartPair(), MIN_SCORE).reaction).toBe('hearts');
  });

  it('one rock-on sign fires nothing — Lasers needs both hands', () => {
    expect(classifyFrame([rockHand()], MIN_SCORE).reaction).toBeNull();
  });
});

describe('classifyFrame — rejection', () => {
  it('returns nothing when no hands are visible', () => {
    expect(classifyFrame([], MIN_SCORE)).toEqual({ reaction: null, shape: 'none', hands: 0 });
  });

  it('returns nothing for an unrecognised pose', () => {
    expect(classifyFrame([openPalmHand()], MIN_SCORE).reaction).toBeNull();
  });

  it('drops hands below the confidence floor', () => {
    const result = classifyFrame([thumbUpHand({ score: 0.2 })], MIN_SCORE);
    expect(result).toEqual({ reaction: null, shape: 'none', hands: 0 });
  });

  it('stays silent while the hands disagree — the user is mid-transition', () => {
    const hands = [thumbUpHand({ origin: { x: 0.35, y: 0.7 } }), victoryHand({ origin: { x: 0.65, y: 0.7 } })];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBeNull();
  });

  it('falls back to the one-handed reaction when the second hand is idle', () => {
    const hands = [thumbUpHand({ origin: { x: 0.35, y: 0.7 } }), openPalmHand({ origin: { x: 0.65, y: 0.7 } })];
    expect(classifyFrame(hands, MIN_SCORE).reaction).toBe('thumbsUp');
  });
});
