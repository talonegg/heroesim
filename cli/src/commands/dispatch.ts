// `dispatch --quest <id> --heroes <id,id>` (M2-S4): the player's Guild sends a Party on a Quest
// from the Board, within the current Turn (pre-M0 review D2). What the command does to an open
// save and what it prints; `main.ts` opens the save, and writes it back only when this succeeds.
//
// The CLI holds no rule: the engine's `dispatch` decides, and a refusal is its typed rejection
// put into words here (ADR-0003).

import {
  dayOf,
  dispatch,
  durationDaysOf,
  playerGuild,
  type ContentSet,
  type DispatchRejection,
  type EngineDeps,
  type Hero,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { renderTime, rowIn } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** Printed after every dispatch: Rivals act on what the player leaves (pre-M0 review D2, M2-S9). */
export const rivalsReminder =
  'Rivals take Quests from the Board each afternoon: a Quest left on it may be gone by then.';

/** A Hero as the CLI names one: `Brenna Ashcombe (hero-000003)`. */
function heroName(document: WorldDocument, heroId: string): string {
  const hero: Hero | undefined = rowIn(document.world.heroes, heroId);
  return hero === undefined ? heroId : `${hero.name} (${heroId})`;
}

function guildName(document: WorldDocument, guildId: string): string {
  return rowIn(document.world.guilds, guildId)?.name ?? guildId;
}

function templateName(content: ContentSet, key: string): string {
  return rowIn(content.questTemplates, key)?.name ?? key;
}

/** The engine's rejection in words. */
function explain(rejection: DispatchRejection, document: WorldDocument, content: ContentSet): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildName(document, rejection.guildId)} has folded and sends no one.`;
    case 'quest-not-offered':
      return `${rejection.questId} is not on the Board: it has been taken or has expired, or was never offered.`;
    case 'hero-not-on-roster':
      return `${heroName(document, rejection.heroId)} is not on the Roster of ${guildName(document, rejection.guildId)}.`;
    case 'hero-unavailable': {
      const why = {
        injured: 'is injured',
        dead: 'is dead',
        retired: 'has retired',
        'in-party': 'is away with a Party',
      }[rejection.because];
      return `${heroName(document, rejection.heroId)} ${why} and cannot go.`;
    }
    case 'party-size':
      return (
        `${rejection.questId} takes a Party of ${rejection.partySizeMin} to ${rejection.partySizeMax} Heroes; ` +
        `${rejection.size} ${rejection.size === 1 ? 'was' : 'were'} named.`
      );
    case 'requirement-unmet': {
      const { classKey, skillKey } = rejection.unmet;
      const needs = [
        ...(classKey === undefined ? [] : [`a ${rowIn(content.classes, classKey)?.name ?? classKey}`]),
        ...(skillKey === undefined ? [] : [`a Hero with ${rowIn(content.skills, skillKey)?.name ?? skillKey}`]),
      ];
      return `${rejection.questId} needs ${needs.join(' and ')} in the Party.`;
    }
  }
}

/**
 * Dispatches the named Heroes of the player's Guild on the named Quest under the save's own deps,
 * and says what happened: the Party, the Quest, the night it returns, and the reminder that Rivals
 * act in the afternoon.
 */
export function dispatchParty(
  command: Extract<Command, { name: 'dispatch' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };

  const result = dispatch(document, { guildId: guild.id, questId: command.quest, heroIds: command.heroes }, deps);
  if (!result.ok) return { ok: false, problem: explain(result.rejection, document, deps.content) };

  const { world } = result.document;
  const quest = rowIn(world.quests, command.quest);
  const partyId = quest?.partyIds.at(-1);
  const party = partyId === undefined ? undefined : rowIn(world.parties, partyId);
  if (quest === undefined || party === undefined) throw new Error('dispatch succeeded but left no Party');
  const days = durationDaysOf(quest);
  return {
    ok: true,
    document: result.document,
    lines: [
      `Dispatched ${party.id} from ${guild.name} on ${quest.id}, ${templateName(deps.content, quest.templateKey)}.`,
      `Party: ${party.heroIds.map((heroId) => heroName(result.document, heroId)).join(', ')}.`,
      `A ${days}-Day Quest: it returns on the night of Day ${dayOf(party.returnsOnTurn)}, ` +
        `${renderTime(party.returnsOnTurn, deps.config)}.`,
      rivalsReminder,
    ],
  };
}
