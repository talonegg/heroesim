// `build --facility <facility>` (M3-S6, DL-38): the player's Guild buys a Hall Improvement, raising
// one facility by a grade for the next grade's cost in content. What the command does to an open
// save and what it prints; `main.ts` opens the save, and writes it back only when this succeeds.
//
// The CLI holds no rule: the engine's `build` decides, and a refusal is its typed rejection put
// into words here (ADR-0003).

import {
  applyAction,
  nextImprovement,
  playerGuild,
  upkeep,
  type BuildRejection,
  type EngineDeps,
  type GuildImproved,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { nameIn } from '@heroesim/words';
import { facilityIs, facilityNames } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** The engine's rejection in words. */
function explain(rejection: BuildRejection, guildName: string): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildName} has folded and builds nothing.`;
    case 'max-grade':
      return (
        `${guildName}'s ${facilityNames[rejection.facility]} ${facilityIs[rejection.facility]} at grade ${rejection.grade}, ` +
        'the highest there is.'
      );
    case 'insufficient-wealth':
      return (
        `The next grade of ${guildName}'s ${facilityNames[rejection.facility]} costs ${rejection.cost} Wealth; ` +
        `${guildName} has ${rejection.wealth}.`
      );
  }
}

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
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };

  const result = applyAction(document, { kind: 'build', guildId: guild.id, facility: command.facility }, deps);
  if (!result.ok) return { ok: false, problem: explain(result.rejection, guild.name) };

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
