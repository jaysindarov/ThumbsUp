/**
 * User settings: schema, defaults, storage access and change notification.
 *
 * Storage lives in `chrome.storage.sync` so settings follow the user across
 * machines. Only the isolated content-script world and extension pages may
 * touch `chrome.*`; the page world receives settings over the bridge.
 */

import { REACTION_IDS, type ReactionId } from './reactions';

export interface Settings {
  /** Master switch. When off, the camera stream is passed through untouched. */
  enabled: boolean;
  /** Per-reaction opt-out. */
  reactions: Record<ReactionId, boolean>;
  /**
   * How long a gesture must be held before it fires, in ms.
   * Lower = twitchier, higher = fewer false positives.
   */
  holdMs: number;
  /** Minimum gap between two triggered reactions, in ms. */
  cooldownMs: number;
  /** Landmark detection confidence floor, 0..1. */
  minConfidence: number;
  /** Show the on-page detection HUD. */
  showHud: boolean;
  /** Play a short chime when a reaction fires. */
  sound: boolean;
  /** Hosts the extension must not touch, e.g. `["example.com"]`. */
  blockedHosts: string[];
  /** Log per-finger bend readings to the detector console, for tuning. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  reactions: Object.fromEntries(REACTION_IDS.map((id) => [id, true])) as Record<ReactionId, boolean>,
  holdMs: 700,
  cooldownMs: 2500,
  // Gates on MediaPipe's handedness confidence, which sags when both hands
  // show the same pose — exactly the two-handed case. Keep it low.
  minConfidence: 0.4,
  showHud: true,
  sound: false,
  blockedHosts: [],
  debug: false,
};

const STORAGE_KEY = 'settings';

/** Merge stored partial settings over defaults, dropping unknown keys. */
export function normalizeSettings(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Settings>;
  const reactions = { ...DEFAULT_SETTINGS.reactions };
  if (input.reactions && typeof input.reactions === 'object') {
    for (const id of REACTION_IDS) {
      const value = (input.reactions as Record<string, unknown>)[id];
      if (typeof value === 'boolean') reactions[id] = value;
    }
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
    reactions,
    holdMs: clamp(input.holdMs, 200, 3000, DEFAULT_SETTINGS.holdMs),
    cooldownMs: clamp(input.cooldownMs, 500, 15000, DEFAULT_SETTINGS.cooldownMs),
    minConfidence: clamp(input.minConfidence, 0.1, 0.95, DEFAULT_SETTINGS.minConfidence),
    showHud: typeof input.showHud === 'boolean' ? input.showHud : DEFAULT_SETTINGS.showHud,
    sound: typeof input.sound === 'boolean' ? input.sound : DEFAULT_SETTINGS.sound,
    blockedHosts: Array.isArray(input.blockedHosts)
      ? input.blockedHosts.filter((h): h is string => typeof h === 'string')
      : [...DEFAULT_SETTINGS.blockedHosts],
    debug: typeof input.debug === 'boolean' ? input.debug : DEFAULT_SETTINGS.debug,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'sync' || !(STORAGE_KEY in changes)) return;
    listener(normalizeSettings(changes[STORAGE_KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** `true` when the extension should stay out of the way on this host. */
export function isHostBlocked(settings: Settings, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return settings.blockedHosts.some((blocked) => {
    const b = blocked.toLowerCase().trim();
    return b.length > 0 && (host === b || host.endsWith(`.${b}`));
  });
}
