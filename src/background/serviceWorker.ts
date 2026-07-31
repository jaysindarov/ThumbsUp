/**
 * Service worker.
 *
 * Deliberately minimal: the extension does its work in content scripts, so the
 * worker only seeds defaults and handles the toggle keyboard shortcut.
 */

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../shared/settings';

chrome.runtime.onInstalled.addListener(async (details) => {
  // Write defaults on first install so the popup and content scripts always
  // read a complete, versioned object rather than `undefined`.
  const settings = await loadSettings();
  await saveSettings(details.reason === 'install' ? DEFAULT_SETTINGS : settings);
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-enabled') return;
  const settings = await loadSettings();
  const next = await saveSettings({ enabled: !settings.enabled });
  await chrome.action.setBadgeText({ text: next.enabled ? '' : 'off' });
  await chrome.action.setBadgeBackgroundColor({ color: '#8e8e93' });
});
