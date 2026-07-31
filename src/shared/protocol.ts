/**
 * Wire protocol between the three execution contexts.
 *
 *   popup / service worker  ──chrome.runtime──▶  content bridge (ISOLATED world)
 *   content bridge          ──CustomEvent───▶   camera hook   (MAIN world)
 *   camera hook             ──MessagePort──▶    detector      (extension iframe)
 *
 * Every message is a plain, structured-cloneable object with a `type` tag.
 * Keep this file dependency-free so all three bundles can import it cheaply.
 */

import type { HandShape, ReactionId } from './reactions';
import type { Settings } from './settings';

/** Namespaced so we never collide with page or other-extension events. */
export const EVENT_TO_PAGE = 'thumbsup:to-page';
export const EVENT_FROM_PAGE = 'thumbsup:from-page';
/** DOM id of the hidden detector iframe the bridge mounts into the page. */
export const DETECTOR_FRAME_ID = 'thumbsup-detector-frame';

/* ------------------------------------------------------------------ */
/* bridge (ISOLATED) → camera hook (MAIN)                              */
/* ------------------------------------------------------------------ */

export type ToPageMessage =
  | { type: 'settings'; settings: Settings }
  /** Fire a reaction without a gesture (popup "test" buttons, keyboard shortcut). */
  | { type: 'trigger'; reaction: ReactionId };

/* ------------------------------------------------------------------ */
/* camera hook (MAIN) → bridge (ISOLATED)                              */
/* ------------------------------------------------------------------ */

export interface PipelineStatus {
  /** A camera stream is currently being processed. */
  cameraActive: boolean;
  /** The detector has loaded its model and is consuming frames. */
  detectorReady: boolean;
  /** Number of hands seen in the last processed frame. */
  hands: number;
  /** Shape recognised in the last processed frame. */
  shape: HandShape;
  /** Reaction currently being held, and how far along the hold is (0..1). */
  pending: ReactionId | null;
  pendingProgress: number;
}

export type FromPageMessage =
  | { type: 'status'; status: PipelineStatus }
  | { type: 'reaction'; reaction: ReactionId }
  /** A camera stream started: ask the bridge to mount the detector iframe. */
  | { type: 'needDetector' }
  /** No camera streams left: the bridge may unmount the detector and free the model. */
  | { type: 'releaseDetector' }
  | { type: 'error'; message: string };

/* ------------------------------------------------------------------ */
/* camera hook (MAIN) ↔ detector (extension iframe)                    */
/* ------------------------------------------------------------------ */

export type ToDetectorMessage =
  /** First message: tells the detector which origin to reply to. */
  | { type: 'hello'; origin: string }
  | { type: 'config'; settings: Settings }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  /** Camera went away — forget any in-progress gesture hold. */
  | { type: 'reset' };

export type FromDetectorMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'result';
      hands: number;
      shape: HandShape;
      pending: ReactionId | null;
      pendingProgress: number;
      /** Set on the frame the gesture actually fires. */
      fired: ReactionId | null;
    };

/* ------------------------------------------------------------------ */
/* popup / service worker ↔ bridge                                     */
/* ------------------------------------------------------------------ */

export type RuntimeMessage =
  | { type: 'popup:getStatus' }
  | { type: 'popup:trigger'; reaction: ReactionId };

export type RuntimeResponse = { ok: true; status: PipelineStatus | null } | { ok: false; error: string };
