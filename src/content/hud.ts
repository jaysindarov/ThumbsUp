/**
 * On-page heads-up display.
 *
 * Lives in the isolated world inside a closed shadow root so no host-page CSS
 * can reach it and no host-page script can read it. Purely informational: it
 * tells the user the camera is being processed and shows the gesture hold
 * filling up, which is the difference between "it's broken" and "hold it a
 * moment longer".
 */

import { REACTIONS, type ReactionId } from '../shared/reactions';
import type { PipelineStatus } from '../shared/protocol';

const HOST_ID = 'thumbsup-hud-host';

const STYLE = `
  :host { all: initial; }
  .hud {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px 8px 10px;
    border-radius: 999px;
    background: rgba(20, 20, 22, 0.82);
    color: #fff;
    font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(12px);
    pointer-events: none;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 160ms ease, transform 160ms ease;
  }
  .hud[data-visible="true"] { opacity: 1; transform: translateY(0); }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #8e8e93;
    box-shadow: 0 0 0 3px rgba(142, 142, 147, 0.18);
  }
  .hud[data-state="ready"] .dot { background: #32d74b; box-shadow: 0 0 0 3px rgba(50, 215, 75, 0.2); }
  .hud[data-state="holding"] .dot { background: #ffd60a; box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.22); }
  .label { white-space: nowrap; letter-spacing: 0.01em; }
  .ring { width: 20px; height: 20px; display: none; }
  .hud[data-state="holding"] .ring { display: block; }
  .ring circle { fill: none; stroke-width: 3; }
  .ring .track { stroke: rgba(255, 255, 255, 0.18); }
  .ring .value { stroke: #ffd60a; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; }
  .flash {
    position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%) scale(0.7);
    z-index: 2147483647; font-size: 56px; opacity: 0; pointer-events: none;
    transition: opacity 180ms ease, transform 320ms cubic-bezier(0.2, 1.4, 0.4, 1);
    text-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  }
  .flash[data-visible="true"] { opacity: 1; transform: translateX(-50%) scale(1); }
`;

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export class Hud {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private hud: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private ringValue: SVGCircleElement | null = null;
  private flash: HTMLElement | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.destroy();
  }

  update(status: PipelineStatus): void {
    if (!this.enabled) return;
    if (!status.cameraActive) {
      this.hide();
      return;
    }
    const el = this.ensure();
    const state = status.pending ? 'holding' : status.detectorReady ? 'ready' : 'loading';
    el.dataset.state = state;
    el.dataset.visible = 'true';

    if (this.label) this.label.textContent = describe(status, state);
    if (this.ringValue) {
      const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, status.pendingProgress)));
      this.ringValue.style.strokeDashoffset = String(offset);
    }
  }

  showReaction(reaction: ReactionId): void {
    if (!this.enabled) return;
    this.ensure();
    if (!this.flash) return;
    this.flash.textContent = REACTIONS[reaction].emoji;
    this.flash.dataset.visible = 'true';
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      if (this.flash) this.flash.dataset.visible = 'false';
    }, 900);
  }

  hide(): void {
    if (this.hud) this.hud.dataset.visible = 'false';
  }

  destroy(): void {
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.hud = null;
    this.label = null;
    this.ringValue = null;
    this.flash = null;
  }

  private ensure(): HTMLElement {
    if (this.hud) return this.hud;

    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLE;

    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.dataset.state = 'loading';

    const dot = document.createElement('span');
    dot.className = 'dot';

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('viewBox', '0 0 20 20');
    ring.append(
      makeCircle('track'),
      (() => {
        const value = makeCircle('value');
        value.style.strokeDasharray = String(RING_CIRCUMFERENCE);
        value.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
        return value;
      })(),
    );

    const label = document.createElement('span');
    label.className = 'label';

    const flash = document.createElement('div');
    flash.className = 'flash';

    hud.append(dot, ring, label);
    root.append(style, hud, flash);
    (document.body ?? document.documentElement).append(host);

    this.host = host;
    this.root = root;
    this.hud = hud;
    this.label = label;
    this.ringValue = ring.querySelector('.value');
    this.flash = flash;
    return hud;
  }
}

function makeCircle(className: string): SVGCircleElement {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', className);
  circle.setAttribute('cx', '10');
  circle.setAttribute('cy', '10');
  circle.setAttribute('r', String(RING_RADIUS));
  return circle;
}

function describe(status: PipelineStatus, state: string): string {
  if (state === 'loading') return 'ThumbsUp · starting…';
  if (status.pending) return `Hold for ${REACTIONS[status.pending].label}`;
  if (status.hands === 0) return 'ThumbsUp · show a gesture';
  return `ThumbsUp · ${status.hands} hand${status.hands === 1 ? '' : 's'}`;
}
