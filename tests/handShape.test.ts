import { describe, expect, it } from 'vitest';

import { classifyHandShape, isHeart } from '../src/vision/handShape';
import {
  heartPair,
  openPalmHand,
  rockHand,
  thumbDownHand,
  thumbUpHand,
  victoryHand,
} from './fixtures/hands';

describe('classifyHandShape', () => {
  it('recognises a thumbs up', () => {
    expect(classifyHandShape(thumbUpHand())).toBe('thumbUp');
  });

  it('recognises a thumbs down', () => {
    expect(classifyHandShape(thumbDownHand())).toBe('thumbDown');
  });

  it('recognises a victory sign', () => {
    expect(classifyHandShape(victoryHand())).toBe('victory');
  });

  it('recognises a rock-on sign', () => {
    expect(classifyHandShape(rockHand())).toBe('rock');
  });

  it('rejects an open palm', () => {
    expect(classifyHandShape(openPalmHand())).toBe('none');
  });

  it('rejects a sideways thumb, which is neither up nor down', () => {
    const sideways = thumbUpHand({ angles: { thumb: 10 } });
    expect(classifyHandShape(sideways)).toBe('none');
  });

  it('rejects index and middle held together — that is a point, not a victory', () => {
    const together = victoryHand({ angles: { index: 92, middle: 88 } });
    expect(classifyHandShape(together)).toBe('none');
  });

  it('is invariant to where the hand sits in frame', () => {
    const corner = thumbUpHand({ origin: { x: 0.12, y: 0.3 }, scale: 0.1 });
    expect(classifyHandShape(corner)).toBe('thumbUp');
  });
});

describe('isHeart', () => {
  it('accepts two hands forming a heart', () => {
    const [left, right] = heartPair();
    expect(isHeart(left, right)).toBe(true);
    expect(isHeart(right, left)).toBe(true);
  });

  it('rejects hands that are simply near each other', () => {
    const left = victoryHand({ origin: { x: 0.4, y: 0.7 } });
    const right = victoryHand({ origin: { x: 0.6, y: 0.7 }, mirror: true });
    expect(isHeart(left, right)).toBe(false);
  });

  it('rejects an upside-down heart (thumbs above the index tips)', () => {
    const [left, right] = heartPair();
    for (const hand of [left, right]) {
      const thumb = hand.landmarks[4]!;
      const index = hand.landmarks[8]!;
      hand.landmarks[4] = { ...index };
      hand.landmarks[8] = { ...thumb };
    }
    expect(isHeart(left, right)).toBe(false);
  });
});
