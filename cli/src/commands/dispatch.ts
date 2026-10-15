// `dispatch --quest <id> --heroes <id,id> [--consumables <key:n,...>]` (M2-S4; M5-S3's consumables):
// the player's Guild sends a Party on a Quest from the Board, within the current Turn (pre-M0 review
// D2). What the command does to an open save and what it prints; `main.ts` opens the save, and
// writes it back only when this succeeds.
//
// The CLI holds no rule: the engine's `dispatch` decides, and a refusal is its typed rejection in
// the refusals' words (ADR-0003, DL-240).

import {
  applyAction,
  durationDaysOf,
  playerGuild,
  type ConsumableRequest,
  type ContentSet,
  type EngineDeps,
  type Hero,
  type WorldDocument,
} from '@heroesim/engine';
import { coinLetters, nameIn, nightOfTurn, rowOf } from '@heroesim/words';
import type { Command } from '../args.js';
import { refusalLine } from '../namer.js';
import type { CommandOutcome } from './outcome.js';

/** Printed after every dispatch: Rivals act on what the player leaves (pre-M0 review D2, M2-S9). */
export const rivalsReminder =
  'Rivals take Quests from the Board each afternoon: a Quest left on it may be gone by then.';

/** A Hero as the CLI names one: `Brenna Ashcombe (hero-000003)`. */
function heroName(document: WorldDocument, heroId: string): string {
  const hero: Hero | undefined = rowOf(document.world.heroes, heroId);
  return hero === undefined ? heroId : `${hero.name} (${heroId})`;
}

function templateName(content: ContentSet, key: string): string {
  return rowOf(content.questTemplates, key)?.name ?? key;
}

/** Consumables as the CLI lists them (M5-S3): `Whetstone ×2, Healing draught ×1`. */
export function consumableWords(consumables: readonly ConsumableRequest[], content: ContentSet): string {
  return consumables.map(({ definitionKey, quantity }) => `${nameIn(content.items, definitionKey)} ×${quantity}`).join(', ');
}

/**
 * Dispatches the named Heroes of the player's Guild on the named Quest under the save's own deps,
 * carrying the consumables named (M5-S3), and says what happened: the Party, what it carries, the
 * Quest, the reward agreed (the Guildmaster's Negotiation applied, M4-S5), the night it returns, and
 * the reminder that Rivals act in the afternoon.
 */
export function dispatchParty(
  command: Extract<Command, { name: 'dispatch' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'dispatch', reason: 'no-player-guild' }, setting) };

  const offered = rowOf(document.world.quests, command.quest)?.reward;
  const consumables = command.consumables ?? [];
  const request = { guildId: guild.id, questId: command.quest, heroIds: command.heroes, consumables };
  const result = applyAction(document, { kind: 'dispatch', ...request }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };

  const { world } = result.document;
  const quest = rowOf(world.quests, command.quest);
  const partyId = quest?.partyIds.at(-1);
  const party = partyId === undefined ? undefined : rowOf(world.parties, partyId);
  if (quest === undefined || party === undefined) throw new Error('dispatch succeeded but left no Party');
  const days = durationDaysOf(quest);
  return {
    ok: true,
    document: result.document,
    lines: [
      `Dispatched ${party.id} from ${guild.name} on ${quest.id}, ${templateName(deps.content, quest.templateKey)}.`,
      `Party: ${party.heroIds.map((heroId) => heroName(result.document, heroId)).join(', ')}.`,
      ...(consumables.length === 0 ? [] : [`Carrying: ${consumableWords(consumables, deps.content)}.`]),
      `Reward agreed: ${coinLetters(quest.reward)} on a success, ${offered === undefined ? '?' : coinLetters(offered)} offered.`,
      `${days === 1 ? 'One Day' : `${days} Days`} away: it returns on ${nightOfTurn(party.returnsOnTurn, deps.config)} ` +
        `(Turn ${party.returnsOnTurn}).`,
      rivalsReminder,
    ],
  };
}
