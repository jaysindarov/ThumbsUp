/**
 * MAIN-world half of the page ⇄ content-script bridge.
 *
 * Payloads are JSON strings, not objects: structured objects created in one
 * world are not reliably readable from the other, and a string always is.
 * These messages are small and infrequent, so the encode cost is irrelevant.
 */

import { EVENT_FROM_PAGE, EVENT_TO_PAGE, type FromPageMessage, type ToPageMessage } from '../shared/protocol';

export function sendToBridge(message: FromPageMessage): void {
  window.dispatchEvent(new CustomEvent(EVENT_FROM_PAGE, { detail: JSON.stringify(message) }));
}

export function onBridgeMessage(handler: (message: ToPageMessage) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail !== 'string') return;
    try {
      handler(JSON.parse(detail) as ToPageMessage);
    } catch {
      /* malformed payload — ignore rather than break the page */
    }
  };
  window.addEventListener(EVENT_TO_PAGE, listener);
  return () => window.removeEventListener(EVENT_TO_PAGE, listener);
}
