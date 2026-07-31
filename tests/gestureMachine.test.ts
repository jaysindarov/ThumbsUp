import { describe, expect, it } from 'vitest';

import { GestureMachine } from '../src/vision/gestureMachine';

const HOLD = 700;
const COOLDOWN = 2500;

const machine = (overrides = {}) =>
  new GestureMachine({ holdMs: HOLD, cooldownMs: COOLDOWN, ...overrides });

describe('GestureMachine', () => {
  it('does not fire before the hold completes', () => {
    const m = machine();
    expect(m.update(0, 'thumbsUp').fired).toBeNull();
    expect(m.update(400, 'thumbsUp').fired).toBeNull();
    expect(m.update(699, 'thumbsUp').fired).toBeNull();
  });

  it('fires once the hold completes, and only once', () => {
    const m = machine();
    m.update(0, 'thumbsUp');
    expect(m.update(700, 'thumbsUp').fired).toBe('thumbsUp');
    expect(m.update(800, 'thumbsUp').fired).toBeNull();
    expect(m.update(5000, 'thumbsUp').fired).toBeNull();
  });

  it('reports hold progress for the HUD', () => {
    const m = machine();
    m.update(0, 'balloons');
    expect(m.update(350, 'balloons').progress).toBeCloseTo(0.5, 5);
    expect(m.update(350, 'balloons').pending).toBe('balloons');
  });

  it('restarts the hold when the gesture changes', () => {
    const m = machine();
    m.update(0, 'thumbsUp');
    m.update(600, 'victory' as never);
    expect(m.update(1000, 'thumbsDown').fired).toBeNull();
  });

  it('survives a brief detection dropout', () => {
    const m = machine();
    m.update(0, 'confetti');
    m.update(300, null); // model lost the hands for a frame
    expect(m.update(700, 'confetti').fired).toBe('confetti');
  });

  it('resets the hold when the gesture is gone longer than the grace window', () => {
    const m = machine({ graceMs: 200 });
    m.update(0, 'confetti');
    m.update(500, null);
    m.update(800, null);
    expect(m.update(900, 'confetti').fired).toBeNull();
  });

  it('requires the gesture to be released before firing again', () => {
    const m = machine({ cooldownMs: 0 });
    m.update(0, 'hearts');
    expect(m.update(700, 'hearts').fired).toBe('hearts');
    // Still holding — no repeat, however long it is held.
    expect(m.update(4000, 'hearts').fired).toBeNull();

    m.update(4400, null); // hands down for longer than the grace window
    m.update(4500, 'hearts');
    expect(m.update(5200, 'hearts').fired).toBe('hearts');
  });

  it('enforces the cooldown between different reactions', () => {
    const m = machine();
    m.update(0, 'hearts');
    expect(m.update(700, 'hearts').fired).toBe('hearts');

    m.update(800, null);
    m.update(900, 'rain');
    expect(m.update(1600, 'rain').fired).toBeNull(); // 1600 < 700 + 2500
    expect(m.update(3300, 'rain').fired).toBe('rain');
  });

  it('ignores reactions the user has switched off', () => {
    const m = machine({ isEnabled: (id: string) => id !== 'rain' });
    m.update(0, 'rain');
    expect(m.update(2000, 'rain')).toEqual({ pending: null, progress: 0, fired: null });
  });

  it('forgets everything on reset', () => {
    const m = machine();
    m.update(0, 'lasers');
    m.reset();
    expect(m.update(700, 'lasers').fired).toBeNull();
  });
});
