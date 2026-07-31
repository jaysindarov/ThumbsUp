import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, isHostBlocked, normalizeSettings } from '../src/shared/settings';
import { REACTION_IDS } from '../src/shared/reactions';

describe('normalizeSettings', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps every known reaction key, even when storage holds a partial map', () => {
    const settings = normalizeSettings({ reactions: { rain: false } });
    expect(Object.keys(settings.reactions).sort()).toEqual([...REACTION_IDS].sort());
    expect(settings.reactions.rain).toBe(false);
    expect(settings.reactions.hearts).toBe(true);
  });

  it('clamps out-of-range tuning values instead of trusting storage', () => {
    const settings = normalizeSettings({ holdMs: 5, cooldownMs: 999_999, minConfidence: 4 });
    expect(settings.holdMs).toBe(200);
    expect(settings.cooldownMs).toBe(15_000);
    expect(settings.minConfidence).toBe(0.95);
  });

  it('drops unknown reactions and non-string blocked hosts', () => {
    const settings = normalizeSettings({
      reactions: { notARealReaction: false },
      blockedHosts: ['example.com', 42, null],
    });
    expect('notARealReaction' in settings.reactions).toBe(false);
    expect(settings.blockedHosts).toEqual(['example.com']);
  });
});

describe('isHostBlocked', () => {
  const settings = { ...DEFAULT_SETTINGS, blockedHosts: ['example.com'] };

  it('matches the host exactly', () => {
    expect(isHostBlocked(settings, 'example.com')).toBe(true);
  });

  it('matches subdomains', () => {
    expect(isHostBlocked(settings, 'calls.example.com')).toBe(true);
  });

  it('does not match a host that merely ends with the same text', () => {
    expect(isHostBlocked(settings, 'notexample.com')).toBe(false);
  });

  it('ignores empty entries', () => {
    expect(isHostBlocked({ ...settings, blockedHosts: ['  '] }, 'example.com')).toBe(false);
  });
});
