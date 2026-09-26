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
  type Unavailability,
  type UnmetRequirement,
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

/** Why a Hero cannot go, in words, after their name. */
export const unavailableWords: Readonly<Record<Unavailability, string>> = Object.freeze({
  injured: 'is injured',
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away with a Party',
});

/** The engine's rejection in words. */
export function explain(rejection: DispatchRejection, document: WorldDocument, content: ContentSet): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildName(document, rejection.guildId)} has folded and sends no one.`;
    case 'quest-not-offered':
      return `${rejection.questId} is not on the Board: it has been taken or has expired, or was never offered.`;
    case 'hero-not-on-roster':
      return `${heroName(document, rejection.heroId)} is not on the Roster of ${guildName(document, rejection.guildId)}.`;
    case 'hero-unavailable':
      return `${heroName(document, rejection.heroId)} ${unavailableWords[rejection.because]} and cannot go.`;
    case 'requirement-unmet':
      return `${rejection.questId} needs ${rejection.unmet.map((unmet) => requirementWords(unmet, content)).join(' and ')}.`;
  }
}

/**
 * A requirement a Party misses, in words: `a Party of 2 to 4 Heroes (1 named)`, `a Healer in the
 * Party`, `a Hero with Lockpicking in the Party`. `preview` says the same of a proposed Party.
 */
export function requirementWords(unmet: UnmetRequirement, content: ContentSet): string {
  switch (unmet.requirement) {
    case 'party-size':
      return `a Party of ${unmet.partySizeMin} to ${unmet.partySizeMax} Heroes (${unmet.size} named)`;
    case 'class':
      return `a ${rowIn(content.classes, unmet.classKey)?.name ?? unmet.classKey} in the Party`;
    case 'skill':
      return `a Hero with ${rowIn(content.skills, unmet.skillKey)?.name ?? unmet.skillKey} in the Party`;
  }
}

/**
 * Dispatches the named Heroes of the player's Guild on the named Quest under the save's own deps,
 * and says what happened: the Party, the Quest, the reward agreed (the Guildmaster's Negotiation
 * applied, M4-S5), the night it returns, and the reminder that Rivals act in the afternoon.
 */
export function dispatchParty(
  command: Extract<Command, { name: 'dispatch' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };

  const offered = rowIn(document.world.quests, command.quest)?.reward;
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
      `Reward agreed: ${quest.reward} Wealth on a success, ${offered} offered.`,
      `${days === 1 ? 'One Day' : `${days} Days`} away: it returns on the night of Day ${dayOf(party.returnsOnTurn)}, ` +
        `${renderTime(party.returnsOnTurn, deps.config)}.`,
      rivalsReminder,
    ],
  };
}
