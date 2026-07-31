import { describe, expect, it } from 'vitest';

import { createEffect } from '../src/effects';
import { REACTIONS, REACTION_IDS } from '../src/shared/reactions';

/**
 * Node has no canvas, so this cannot check that the animations *look* right —
 * that is a manual job. What it does check is that every effect drives a real
 * 2D context API correctly for its whole lifetime and terminates, which is the
 * failure mode that would otherwise only show up mid-call.
 */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(store, property: string) {
      if (property in store) return store[property];
      if (property === 'createRadialGradient' || property === 'createLinearGradient') {
        return () => gradient;
      }
      // Every other member is a drawing call; record nothing, return nothing.
      return () => undefined;
    },
    set(store, property: string, value) {
      store[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const FPS = 60;
const SIZES: ReadonlyArray<[number, number]> = [
  [1280, 720],
  [640, 360],
  [320, 240],
];

describe('effects', () => {
  it('has an effect registered for every reaction', () => {
    for (const id of REACTION_IDS) {
      expect(createEffect(id).id).toBe(id);
    }
  });

  for (const id of REACTION_IDS) {
    it(`${id} runs to completion without touching the canvas API wrongly`, () => {
      const effect = createEffect(id);
      const ctx = fakeContext();
      const frames = Math.ceil((REACTIONS[id].durationMs / 1000) * FPS) + 5;

      for (let i = 0; i < frames; i += 1) {
        effect.update(1 / FPS);
        // Resolution changes mid-call are routine; effects must survive them.
        const [width, height] = SIZES[i % SIZES.length]!;
        effect.draw(ctx, width, height);
      }

      expect(effect.finished).toBe(true);
    });

    it(`${id} survives long stalls between frames`, () => {
      const effect = createEffect(id);
      const ctx = fakeContext();
      effect.update(0.5);
      effect.draw(ctx, 1280, 720);
      effect.update(REACTIONS[id].durationMs / 1000);
      effect.draw(ctx, 1280, 720);
      expect(effect.finished).toBe(true);
    });
  }
});
