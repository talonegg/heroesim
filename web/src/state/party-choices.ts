// The Parties chosen on the Board and not sent (DL-109 item 2, Q16; the M9-S5 merge's note, DL-108
// item 12.21): who is ticked in a Quest's Party builder and how many of each consumable, kept by
// Quest in the shell, so that leaving the Board, by the navigation or by a name in a Hero's
// History, loses nothing. A choice holds until the Party is sent, its Quest leaves the Board, or
// another game is started or loaded (the shell forgets them all then).
//
// Presentation only: nothing here is a rule. Whether a Hero can go and how many of a consumable the
// Guild holds are the builder's selectors' (`partyRows`, `consumableChoices`), read afresh each time.
// `partyBuilder` puts them and a choice together as the builder lays them out (v1.1.6-S14, DL-186 item 5).

import type { HeroId, ItemDefinitionKey, QuestId, WorldDocument } from '@heroesim/engine';
import { consumableChoices, partyRows, previewView, type ConsumableChoice, type PartyRow, type PreviewView } from './selectors';

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

/** A Hero's row in the builder, and whether the Party chosen holds them. */
export type BuilderRow = PartyRow & { chosen: boolean };

/** A consumable the Guild holds, and how many of it the Party carries. */
export type BuilderStock = ConsumableChoice & { carrying: number };

/** What the Party builder for one Quest shows, from the choice and the world. */
export interface PartyBuilder {
  /** Each Hero on the Roster, those who can go first (`partyRows`), marked when chosen. */
  rows: BuilderRow[];
  /** Each consumable the Guild holds, with how many the Party carries: no more than is held now, so that the stepper shows what a send takes (M9-F6). */
  stocks: BuilderStock[];
  /** The Party: those chosen, in the order ticked, who can still go. */
  party: HeroId[];
  /** What the Party carries: each consumable carried at least one of. */
  consumables: { definitionKey: ItemDefinitionKey; quantity: number }[];
  /** `dispatch`'s verdict on the Party and the consumables; `null` when the Quest is no longer on the Board. */
  preview: PreviewView | null;
}

/**
 * The builder for `questId`: the rows with what is chosen, the stocks with what is carried, the
 * Party and the consumables as a send takes them, and the preview of them (v1.1.6-S14, DL-186 item
 * 5). A Quest not on the Board has no rows and no preview.
 */
export function partyBuilder(document: WorldDocument, questId: QuestId, choice: PartyChoice): PartyBuilder {
  const rows = partyRows(document, questId) ?? [];
  // Only Heroes who can still go, and no more of a consumable than the Guild holds now.
  const party = choice.heroIds.filter((heroId) => rows.some((row) => row.heroId === heroId && row.why === null));
  const stocks = consumableChoices(document).map((stock): BuilderStock => ({
    ...stock,
    carrying: Math.min(Math.max(0, Math.floor(choice.carry[stock.definitionKey] ?? 0)), stock.held),
  }));
  const consumables = stocks.flatMap(({ definitionKey, carrying }) => (carrying > 0 ? [{ definitionKey, quantity: carrying }] : []));
  return {
    rows: rows.map((row) => ({ ...row, chosen: party.includes(row.heroId) })),
    stocks,
    party,
    consumables,
    preview: previewView(document, questId, party, consumables),
  };
}

/** `choice` with `heroId` ticked, last, or unticked. */
export function toggled(choice: PartyChoice, heroId: HeroId, on: boolean): PartyChoice {
  const others = choice.heroIds.filter((id) => id !== heroId);
  return { ...choice, heroIds: on ? [...others, heroId] : others };
}

/** `choice` carrying `quantity` of `definitionKey`; a number that is not finite is none. */
export function carrying(choice: PartyChoice, definitionKey: ItemDefinitionKey, quantity: number): PartyChoice {
  return { ...choice, carry: { ...choice.carry, [definitionKey]: Number.isFinite(quantity) ? quantity : 0 } };
}
