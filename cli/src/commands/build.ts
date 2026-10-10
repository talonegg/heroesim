// `build --facility <facility>` (M3-S6, DL-38): the player's Guild buys a Hall Improvement, raising
// one facility by a grade for the next grade's cost in content. What the command does to an open
// save and what it prints; `main.ts` opens the save, and writes it back only when this succeeds.
//
// The CLI holds no rule: the engine's `build` decides, and a refusal is its typed rejection in the
// refusals' words (ADR-0003, DL-240).

import {
  applyAction,
  nextImprovement,
  playerGuild,
  upkeep,
  type EngineDeps,
  type GuildImproved,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { facilityIs, facilityNames, nameIn } from '@heroesim/words';
import { refusalLine } from '../namer.js';
import type { CommandOutcome } from './outcome.js';

/**
 * Builds the next grade of the named facility for the player's Guild under the save's own deps,
 * and says what was built, for how much, the Wealth and Upkeep after it, and what the next grade
 * would cost.
 */
export function buildImprovement(
  command: Extract<Command, { name: 'build' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'build', reason: 'no-player-guild' }, setting) };

  const result = applyAction(document, { kind: 'build', guildId: guild.id, facility: command.facility }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };

  const { world } = result.document;
  const built = world.guilds[guild.id];
  const improved = result.events.find((event): event is GuildImproved => event.type === 'guild.improved');
  if (built === undefined || improved === undefined) throw new Error('build succeeded but left no Improvement');
  const { facility, grade, improvementKey, cost } = improved.payload;
  const name = facilityNames[facility];
  const is = facilityIs[facility];
  const next = nextImprovement(built, facility, deps.content);
  return {
    ok: true,
    document: result.document,
    lines: [
      `Built ${nameIn(deps.content.improvements, improvementKey)} for ${cost} Wealth: ${guild.name}'s ${name} ${is} now grade ${grade}.`,
      `Wealth ${built.wealth}; Upkeep ${upkeep(built, world, deps.config, deps.content)} every ${deps.config.upkeepEveryDays} Days.`,
      next === null
        ? `The ${name} ${is} now at the highest grade.`
        : `The next grade, ${next.name}, costs ${next.cost} Wealth.`,
    ],
  };
}
