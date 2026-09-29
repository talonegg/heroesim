// The Parties chosen on the Board and not sent (DL-109 item 2, Q16; the M9-S5 merge's note, DL-108
// item 12.21): who is ticked in a Quest's Party builder and how many of each consumable, kept by
// Quest in the shell, so that leaving the Board, by the navigation or by a name in a Hero's
// History, loses nothing. A choice holds until the Party is sent, its Quest leaves the Board, or
// another game is started or loaded (the shell forgets them all then).
//
// Presentation only: nothing here is a rule. Whether a Hero can go and how many of a consumable the
// Guild holds are the builder's selectors' (`partyRows`, `consumableChoices`), read afresh each time.

import type { HeroId, ItemDefinitionKey, QuestId, WorldDocument } from '@heroesim/engine';

/** One Quest's Party as chosen: the Heroes ticked, in the order ticked, and how many of each consumable. */
export interface PartyChoice {
  heroIds: readonly HeroId[];
  carry: Readonly<Record<ItemDefinitionKey, number>>;
}

/** Every Quest's Party chosen and not sent, by Quest. */
export type PartyChoices = Readonly<Record<QuestId, PartyChoice>>;

/** None chosen: a new game's, or a loaded one's. */
export const noPartyChoices: PartyChoices = Object.freeze({});

const nothingChosen: PartyChoice = Object.freeze({ heroIds: Object.freeze([]), carry: Object.freeze({}) });

/** The Party chosen for `questId`, or none chosen. */
export function choiceFor(choices: PartyChoices, questId: QuestId): PartyChoice {
  return Object.hasOwn(choices, questId) ? (choices[questId] ?? nothingChosen) : nothingChosen;
}

/** `choices` with `questId`'s Party as `choice`, the others as they were. */
export function withChoice(choices: PartyChoices, questId: QuestId, choice: PartyChoice): PartyChoices {
  return { ...choices, [questId]: choice };
}

/**
 * The choices whose Quests are still on `document`'s Board: a Party sent takes its Quest off the
 * Board, and so does its last Day passing or a Rival taking it, and the choice goes with it. The same
 * object when every choice still stands, so a caller that keeps it sees nothing change.
 */
export function standingChoices(choices: PartyChoices, document: WorldDocument): PartyChoices {
  const onBoard = new Set<string>(document.world.board);
  const questIds = Object.keys(choices);
  if (questIds.every((questId) => onBoard.has(questId))) return choices;
  return Object.fromEntries(Object.entries(choices).filter(([questId]) => onBoard.has(questId))) as PartyChoices;
}
