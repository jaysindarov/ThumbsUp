/**
 * ISOLATED-world content script.
 *
 * The only context with access to both `chrome.*` and the host page's DOM, so
 * it plays router:
 *   - pushes settings down to the page world;
 *   - mounts/unmounts the detector iframe on demand;
 *   - renders the HUD;
 *   - answers popup queries about what the page is doing.
 */

import { Hud } from './hud';
import {
  DETECTOR_FRAME_ID,
  EVENT_FROM_PAGE,
  EVENT_TO_PAGE,
  type FromPageMessage,
  type PipelineStatus,
  type RuntimeMessage,
  type RuntimeResponse,
  type ToPageMessage,
} from '../shared/protocol';
import { isHostBlocked, loadSettings, onSettingsChanged, type Settings } from '../shared/settings';

const isTopFrame = window.top === window;

class ContentBridge {
  private readonly hud = new Hud();
  private settings: Settings | null = null;
  private status: PipelineStatus | null = null;
  private frame: HTMLIFrameElement | null = null;

  async start(): Promise<void> {
    window.addEventListener(EVENT_FROM_PAGE, this.handlePageMessage as EventListener);
    chrome.runtime.onMessage.addListener(this.handleRuntimeMessage);

    this.applySettings(await loadSettings());
    onSettingsChanged((settings) => this.applySettings(settings));
  }

  private applySettings(settings: Settings): void {
    const blocked = isHostBlocked(settings, location.hostname);
    this.settings = blocked ? { ...settings, enabled: false } : settings;
    this.hud.setEnabled(!blocked && settings.enabled && settings.showHud && isTopFrame);
    this.sendToPage({ type: 'settings', settings: this.settings });
    if (!this.settings.enabled) this.unmountDetector();
  }

  private sendToPage(message: ToPageMessage): void {
    window.dispatchEvent(new CustomEvent(EVENT_TO_PAGE, { detail: JSON.stringify(message) }));
  }

  private readonly handlePageMessage = (event: CustomEvent<string>): void => {
    let message: FromPageMessage;
    try {
      message = JSON.parse(event.detail) as FromPageMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'needDetector':
        this.mountDetector();
        break;
      case 'releaseDetector':
        this.unmountDetector();
        break;
      case 'status':
        this.status = message.status;
        this.hud.update(message.status);
        break;
      case 'reaction':
        this.hud.showReaction(message.reaction);
        break;
      case 'error':
        console.warn('[ThumbsUp]', message.message);
        break;
    }
  };

  private readonly handleRuntimeMessage = (
    message: RuntimeMessage,
    _sender: chrome.runtime.MessageSender,
    respond: (response: RuntimeResponse) => void,
  ): boolean | undefined => {
    if (!isTopFrame) return undefined;

    switch (message?.type) {
      case 'popup:getStatus':
        respond({ ok: true, status: this.status });
        return undefined;
      case 'popup:trigger':
        this.sendToPage({ type: 'trigger', reaction: message.reaction });
        respond({ ok: true, status: this.status });
        return undefined;
      default:
        return undefined;
    }
  };

  private mountDetector(): void {
    if (this.frame?.isConnected) return;
    const frame = document.createElement('iframe');
    frame.id = DETECTOR_FRAME_ID;
    frame.src = chrome.runtime.getURL('detector/index.html');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText =
      'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
    (document.body ?? document.documentElement).append(frame);
    this.frame = frame;
  }

  private unmountDetector(): void {
    this.frame?.remove();
    this.frame = null;
  }
}

void new ContentBridge().start();
