// A Party's return as the History holds it (DL-242): which entries a return wrote, read where the
// engine knows the order its night runs in (pipeline.ts), so no front end guesses it.
//
// On the night a Party comes home, `questsConclude` appends its Encounters, the consumables it
// used, its outcome (`quest.resolved`), its Loot, Injuries, Deaths and Traits, and the XP, Morale
// and Regard the return moved, each naming the Quest (DL-112 item 2, DL-114). Two parts name no
// Quest, and are the return's by Hero and night:
// - a Level: `levelUps` runs straight after `questsConclude`, Level follows XP on the night it is
//   earned, and a Hero away trains for none (DL-36), so a Level a Party's Hero gains on the night it
//   comes home is the Quest's XP;
// - a dead Hero's gear going back to their Guild (`item.returned`, cause `died`): a Hero dies only
//   on a Quest, and `gearReturn` takes the gear back later the same night (DL-49).
//
// Readers only: nothing here writes the History, and every entry returned is the History's own
// (ADR-0008). Each reads the History's index by participant, never the whole log.

import type { EntityId, Entry, History, PartyId, QuestId, Turn } from './document.js';
import type { EngineEventOf } from './events.js';

/** What a return is read by: its Party and its Quest. */
export interface ReturnKey {
  partyId: PartyId;
  questId: QuestId;
}

/** A return's entries, each the History's own, in the order they were appended. */
export interface ReturnRecord {
  /** The Party's outcome. */
  outcome: EngineEventOf<'quest.resolved'>;
  /** The outcome's place in the History. */
  position: number;
  /** Every entry naming the Quest, from its offer on. */
  ofQuest: Entry[];
  /** The Levels the Party's Heroes gained on the night it came home. */
  levels: EngineEventOf<'hero.levelled'>[];
  /** The gear of the Party's dead, back to their Guild that night. */
  gear: EngineEventOf<'item.returned'>[];
}

type Resolved = EngineEventOf<'quest.resolved'>;

/** `key`'s return, read from `history`; `null` when the History holds no outcome of that Party on that Quest. */
export function returnOf(history: Readonly<History>, key: ReturnKey): ReturnRecord | null {
  const ofQuest = positionsOf(history, key.questId);
  let position = -1;
  for (let at = ofQuest.length - 1; at >= 0 && position < 0; at -= 1) {
    const entry = history.entries[ofQuest[at] ?? -1];
    if (entry?.type === 'quest.resolved' && (entry as Resolved).payload.partyId === key.partyId) position = ofQuest[at] ?? -1;
  }
  if (position < 0) return null;
  const outcome = history.entries[position] as Resolved;
  const { heroIds, deaths } = outcome.payload;
  const levels: EngineEventOf<'hero.levelled'>[] = [];
  const gear: EngineEventOf<'item.returned'>[] = [];
  for (const at of nightAfter(history, heroIds, position, outcome.turn)) {
    const entry = history.entries[at] as Entry;
    if (entry.type === 'hero.levelled' && heroIds.includes((entry as EngineEventOf<'hero.levelled'>).payload.heroId)) {
      levels.push(entry as EngineEventOf<'hero.levelled'>);
    } else if (isDeadsGear(entry) && deaths.includes(entry.payload.heroId)) {
      gear.push(entry);
    }
  }
  return { outcome, position, ofQuest: ofQuest.map((at) => history.entries[at] as Entry), levels, gear };
}

/**
 * The return whose night brought `entry`, one of `history`'s, when it is one of the two parts that
 * name no Quest: a Level of a Hero whose Party came home that night, or a dead Hero's gear going back
 * that night. `null` for any other entry, and for a Level gained at home.
 */
export function nightsReturnOf(history: Readonly<History>, entry: Entry): ReturnKey | null {
  let heroId: EntityId;
  let named: (outcome: Resolved) => boolean;
  if (entry.type === 'hero.levelled') {
    heroId = (entry as EngineEventOf<'hero.levelled'>).payload.heroId;
    named = (outcome) => outcome.payload.heroIds.includes(heroId as never);
  } else if (isDeadsGear(entry)) {
    heroId = entry.payload.heroId;
    named = (outcome) => outcome.payload.deaths.includes(heroId as never);
  } else {
    return null;
  }
  const positions = positionsOf(history, heroId);
  for (let at = firstOnTurn(history, positions, entry.turn); at < positions.length; at += 1) {
    const found = history.entries[positions[at] ?? -1];
    if (found === undefined || found.turn !== entry.turn) return null;
    if (found.type === 'quest.resolved' && named(found as Resolved)) {
      const { partyId, questId } = (found as Resolved).payload;
      return { partyId, questId };
    }
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

function isDeadsGear(entry: Entry): entry is EngineEventOf<'item.returned'> {
  return entry.type === 'item.returned' && (entry as EngineEventOf<'item.returned'>).payload.cause === 'died';
}

/** The index's ascending positions of the entries naming `entityId`, read as an own property only. */
function positionsOf(history: Readonly<History>, entityId: EntityId): readonly number[] {
  return Object.hasOwn(history.byEntity, entityId) ? (history.byEntity[entityId] ?? []) : [];
}

/** The first index into `positions` whose entry's Turn is not below `turn`: their Turns ascend, so by halves. */
function firstOnTurn(history: Readonly<History>, positions: readonly number[], turn: Turn): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((history.entries[positions[middle] ?? -1]?.turn ?? Infinity) < turn) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The positions after `position` on `turn` of the entries naming any of `heroIds`, ascending, each once. */
function nightAfter(history: Readonly<History>, heroIds: readonly EntityId[], position: number, turn: Turn): number[] {
  const found = new Set<number>();
  for (const heroId of heroIds) {
    const positions = positionsOf(history, heroId);
    for (let at = firstOnTurn(history, positions, turn); at < positions.length; at += 1) {
      const each = positions[at] ?? -1;
      if (history.entries[each]?.turn !== turn) break;
      if (each > position) found.add(each);
    }
  }
  return [...found].sort((a, b) => a - b);
}
