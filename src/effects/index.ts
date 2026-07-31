/**
 * Effect registry. Adding a reaction means: add it to `REACTIONS`, write the
 * effect, register it here. Nothing else in the pipeline needs to change.
 */

import type { ReactionId } from '../shared/reactions';
import { BalloonsEffect } from './balloons';
import { ConfettiEffect } from './confetti';
import { FireworksEffect } from './fireworks';
import { HeartsEffect } from './hearts';
import { LasersEffect } from './lasers';
import { RainEffect } from './rain';
import { ThumbsEffect } from './thumbs';
import type { Effect, EffectFactory } from './types';

const REGISTRY: Record<ReactionId, EffectFactory> = {
  hearts: () => new HeartsEffect(),
  thumbsUp: () => new ThumbsEffect('thumbsUp'),
  thumbsDown: () => new ThumbsEffect('thumbsDown'),
  fireworks: () => new FireworksEffect(),
  rain: () => new RainEffect(),
  balloons: () => new BalloonsEffect(),
  confetti: () => new ConfettiEffect(),
  lasers: () => new LasersEffect(),
};

export function createEffect(id: ReactionId): Effect {
  return REGISTRY[id]();
}

export type { Effect } from './types';
