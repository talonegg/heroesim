// Afternoon, first: the Rival controllers act, on what the player left on the Board and in the
// pool during the morning (approach §2, pre-M0 review D2). M2-S9, DL-30.

import { applyGuildAction } from '../actions/action.js';
import type { EngineDeps } from '../config.js';
import { rivalChoices } from '../controllers/rival.js';
import { compareByCodeUnit } from '../document.js';
import type { EngineEvent } from '../events.js';
import type { PhaseRun } from './phase.js';

/**
 * Each Guild in id order takes the actions its controller chooses (`rivalChoices`: none for the
 * player's Guild or a folded one), each applied to the Turn's world through the rule the player's
 * action runs (`applyGuildAction`), so a later Rival chooses from what an earlier one left. Returns
 * the actions' events in the order they happened.
 *
 * A refused action is dropped, leaving the world as it was, and the Guild's next action is
 * applied: a controller chooses only what the rules accept on the world it reads, so a refusal
 * is a bug, which the tests look for, rather than a move in the game (DL-30).
 */
export const rivalControllers: PhaseRun = (world, ctx) => {
  const deps: EngineDeps = { config: ctx.config, content: ctx.content };
  const guilds = Object.values(world.guilds).sort((a, b) => compareByCodeUnit(a.id, b.id));
  const events: EngineEvent[] = [];
  for (const guild of guilds) {
    for (const action of rivalChoices(world, guild, deps)) {
      const result = applyGuildAction(world, action, deps);
      if (result.ok) events.push(...result.events);
    }
  }
  return events;
};
