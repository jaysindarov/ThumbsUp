/**
 * Popup UI. Thin layer over `settings.ts` — no product logic lives here.
 */

import type { RuntimeMessage, RuntimeResponse } from '../shared/protocol';
import { REACTIONS, REACTION_IDS, type ReactionId } from '../shared/reactions';
import { loadSettings, saveSettings, type Settings } from '../shared/settings';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

const master = el<HTMLInputElement>('master');
const reactionList = el<HTMLUListElement>('reactions');
const hold = el<HTMLInputElement>('hold');
const holdValue = el<HTMLOutputElement>('hold-value');
const cooldown = el<HTMLInputElement>('cooldown');
const cooldownValue = el<HTMLOutputElement>('cooldown-value');
const sensitivity = el<HTMLInputElement>('sensitivity');
const sensitivityValue = el<HTMLOutputElement>('sensitivity-value');
const hudToggle = el<HTMLInputElement>('hud');
const blockButton = el<HTMLButtonElement>('block-site');
const statusBox = el<HTMLElement>('status');
const statusText = el<HTMLElement>('status-text');

let settings: Settings;
let activeHost = '';

async function init(): Promise<void> {
  settings = await loadSettings();
  activeHost = await currentHost();

  el<HTMLElement>('version').textContent = `v${chrome.runtime.getManifest().version}`;
  renderReactions();
  render();
  wireEvents();
  void refreshStatus();
}

function renderReactions(): void {
  reactionList.replaceChildren(
    ...REACTION_IDS.map((id) => {
      const meta = REACTIONS[id];
      const item = document.createElement('li');
      item.className = 'reaction';

      const emoji = document.createElement('span');
      emoji.className = 'reaction-emoji';
      emoji.textContent = meta.emoji;

      const text = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'reaction-name';
      name.textContent = meta.label;
      const gesture = document.createElement('small');
      gesture.className = 'reaction-gesture';
      gesture.textContent = meta.gesture;
      text.append(name, gesture);

      const test = document.createElement('button');
      test.type = 'button';
      test.textContent = 'Test';
      test.title = `Play ${meta.label} in the current tab`;
      test.addEventListener('click', () => void trigger(id));

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.id = `reaction-${id}`;
      toggle.title = `Enable ${meta.label}`;
      toggle.dataset.reaction = id;
      toggle.addEventListener('change', () => {
        void update({ reactions: { ...settings.reactions, [id]: toggle.checked } });
      });

      item.append(emoji, text, test, toggle);
      return item;
    }),
  );
}

function render(): void {
  document.body.dataset.enabled = String(settings.enabled);
  master.checked = settings.enabled;
  hold.value = String(settings.holdMs);
  holdValue.value = `${(settings.holdMs / 1000).toFixed(2)}s`;
  cooldown.value = String(settings.cooldownMs);
  cooldownValue.value = `${(settings.cooldownMs / 1000).toFixed(2)}s`;
  sensitivity.value = String(Math.round(settings.minConfidence * 100));
  sensitivityValue.value = `${Math.round(settings.minConfidence * 100)}%`;
  hudToggle.checked = settings.showHud;

  for (const id of REACTION_IDS) {
    const input = document.getElementById(`reaction-${id}`);
    if (input instanceof HTMLInputElement) input.checked = settings.reactions[id];
  }

  const blocked = activeHost !== '' && settings.blockedHosts.includes(activeHost);
  blockButton.dataset.blocked = String(blocked);
  blockButton.textContent = blocked
    ? `Enable on ${activeHost}`
    : activeHost
      ? `Disable on ${activeHost}`
      : 'Disable on this site';
  blockButton.disabled = activeHost === '';
}

function wireEvents(): void {
  master.addEventListener('change', () => void update({ enabled: master.checked }));
  hudToggle.addEventListener('change', () => void update({ showHud: hudToggle.checked }));
  hold.addEventListener('input', () => {
    holdValue.value = `${(Number(hold.value) / 1000).toFixed(2)}s`;
  });
  hold.addEventListener('change', () => void update({ holdMs: Number(hold.value) }));
  cooldown.addEventListener('input', () => {
    cooldownValue.value = `${(Number(cooldown.value) / 1000).toFixed(2)}s`;
  });
  cooldown.addEventListener('change', () => void update({ cooldownMs: Number(cooldown.value) }));
  sensitivity.addEventListener('input', () => {
    sensitivityValue.value = `${sensitivity.value}%`;
  });
  sensitivity.addEventListener('change', () => {
    void update({ minConfidence: Number(sensitivity.value) / 100 });
  });
  blockButton.addEventListener('click', () => {
    if (!activeHost) return;
    const blocked = settings.blockedHosts.includes(activeHost);
    void update({
      blockedHosts: blocked
        ? settings.blockedHosts.filter((h) => h !== activeHost)
        : [...settings.blockedHosts, activeHost],
    });
  });
}

async function update(patch: Partial<Settings>): Promise<void> {
  settings = await saveSettings(patch);
  render();
}

async function currentHost(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return '';
  try {
    return new URL(tab.url).hostname;
  } catch {
    return '';
  }
}

async function sendToActiveTab(message: RuntimeMessage): Promise<RuntimeResponse | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    return await chrome.tabs.sendMessage<RuntimeMessage, RuntimeResponse>(tab.id, message);
  } catch {
    // No content script on this tab (chrome:// pages, the web store, …).
    return null;
  }
}

async function trigger(reaction: ReactionId): Promise<void> {
  await sendToActiveTab({ type: 'popup:trigger', reaction });
}

async function refreshStatus(): Promise<void> {
  const response = await sendToActiveTab({ type: 'popup:getStatus' });
  if (!response || !response.ok || !response.status) {
    statusBox.dataset.state = 'idle';
    statusText.textContent = 'ThumbsUp is not running on this tab.';
    return;
  }
  const status = response.status;
  if (status.cameraActive && status.detectorReady) {
    statusBox.dataset.state = 'active';
    statusText.textContent = 'Watching your camera for gestures.';
  } else if (status.cameraActive) {
    statusBox.dataset.state = 'waiting';
    statusText.textContent = 'Camera on — loading the hand model…';
  } else {
    statusBox.dataset.state = 'idle';
    statusText.textContent = 'Waiting for a call to start your camera.';
  }
}

void init();
