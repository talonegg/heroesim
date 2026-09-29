// The History as the one place to read what happened (M9-S5, DL-105; DL-99 item 2): whose it is,
// and a page of it grouped by Day and time of day, newest first, each group in the order it
// happened. In a group, a Party's steps on its Quest fold under its outcome, and each Rival's
// routine under one line for the Guild; every line says whose it is, whether the last play
// appended it, and on an outcome how the Quest went.
//
// Nothing here computes a rule (ADR-0007, principle 12): every line is a History entry as the engine
// appended it, put in words by `narrate.ts`, and read through the History's own index of entries by
// participant (`byEntity`, as `entriesFor` reads it). What is new is the last play's events, which
// are the History's entries themselves (`append`, ADR-0008). Grouping, folding and marking are
// presentation.

import {
  compareByCodeUnit,
  isId,
  playerGuild,
  timeOfDay,
  type EngineEventType,
  type EntityId,
  type Entry,
  type GuildId,
  type HeroId,
  type QuestBand,
  type TimeOfDay,
  type TurnEvent,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { rowOf } from './names';
import { listed, narrateSegments, narrationFor, textOf, type Narration, type Segment } from './narrate';
import { historyPageSize, whenOf } from './selectors';

/**
 * Whose History: `null` for the player's Guild's, where it opens (DL-99 item 2); `all` for the
 * whole History; or a Guild, a Hero, a Guildmaster or a Patron.
 */
export type HistoryWhose = EntityId | 'all' | null;

/** Whose an entry is: the player's Guild's, a Rival's, or neither (a Patron's offer, the pool, the world). */
export type HistorySide = 'mine' | 'rival' | 'world';

/** A Quest band in words, as the home view says it. */
const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'Failure', success: 'Success', strong: 'Strong success' };

/** One entry of the History as the page shows it. */
export interface HistoryLine {
  /** The entry's place in the History: unique, and the same on every page. */
  key: string;
  /** Its sentence as words and names, each name opening whom it names. */
  segments: Segment[];
  /** The sentence the segments read. */
  sentence: string;
  milestone: boolean;
  /** The last play appended it. */
  fresh: boolean;
  /** It names the player's Guild; else a Rival; else neither. */
  side: HistorySide;
  /** How a Quest went, on a Party's outcome: its band and its word; `null` on any other entry. */
  outcome: { band: QuestBand; words: string } | null;
  /** On a Party's outcome, `outcome-party-000004`: an id the page can be taken to; `null` otherwise. */
  anchor: string | null;
}

/**
 * A line, or several folded under one.
 * - An entry, and for a Party's outcome its steps on the Quest folded under it: its Encounters and
 *   the consumables it used, in the order they happened, with how many of each (`3 Encounters and
 *   1 consumable used`; empty when it has none).
 * - A Rival's routine in the group, in one line for the Guild, with its entries in the order they
 *   happened.
 */
export type HistoryRow =
  | { kind: 'entry'; key: string; line: HistoryLine; steps: HistoryLine[]; stepsWords: string }
  | {
      kind: 'routine';
      key: string;
      /** The Rival whose routine it is. */
      guildId: GuildId;
      side: 'rival';
      /** `Harrow Cross: 5 routine entries (XP, Morale and purchases).`, the Guild's name a name. */
      segments: Segment[];
      sentence: string;
      /** Some of its entries are new. */
      fresh: boolean;
      lines: HistoryLine[];
    };

/** The entries of one Turn on the page. */
export interface HistoryGroup {
  key: string;
  /** `Day 5, night`. */
  when: string;
  timeOfDay: TimeOfDay;
  /** In the order they happened. */
  rows: HistoryRow[];
}

export interface HistoryView {
  /** `The whole History`, or `The History of The Lantern`. */
  title: string;
  /** Whose History it is, by name; `null` for the whole History. */
  name: string | null;
  /** Whose History it is; `null` for the whole History. */
  entityId: EntityId | null;
  /** It is the player's Guild's. */
  mine: boolean;
  /** A Hero the world still holds, whose page the History opens in their place (DL-74); `null` otherwise. */
  hero: HeroId | null;
  /** Which page, from 0, of how many, and how many entries in all. */
  page: number;
  pages: number;
  entries: number;
  /** How many of its entries the last play appended. */
  fresh: number;
  /** The page's groups, newest first. */
  groups: HistoryGroup[];
}

/**
 * The routine a Rival's entries fold into, one line a Guild in a group (M9-S5, DL-105), and the
 * word each kind is summed up by; `null` for an entry that never folds. Keyed by every event type,
 * so that `tsc -b` refuses a type the engine adds until it is decided.
 *
 * Routine is what a Guild's ordinary running leaves behind every Day and at every return, changing
 * nothing on the Board, in the Rankings or on a Roster: its Heroes' XP, Morale, Injuries, healing
 * and Decline; Regard crossing a band; its Upkeep; and its Items, bought, sold, put on, taken off,
 * gone back, used on a Quest, and common Loot. Never routine: what changes the player's world (a
 * Quest taken or resolved, a Hero recruited, leaving or moving, an offer), a Guild's standing (the
 * Bankruptcy floor, a fold), and every Milestone, whatever its type.
 */
export const routineKinds: Readonly<Record<EngineEventType, string | null>> = Object.freeze({
  'world.created': null,
  'guild.founded': null,
  'guildmaster.generated': null,
  'hero.generated': null,
  'patron.generated': null,
  'world.rules-adopted': null,
  'guild.upkeep-paid': 'Upkeep',
  'guild.below-floor': null,
  'guild.floor-recovered': null,
  'hero.recruited': null,
  'hero.left-pool': null,
  'quest.offered': null,
  'quest.expired': null,
  'quest.taken': null,
  'quest.encounter': null,
  'quest.resolved': null,
  'quest.loot': 'Loot',
  'hero.injured': 'Injuries',
  'hero.died': null,
  'hero.xp-gained': 'XP',
  'hero.morale-changed': 'Morale',
  'hero.healed': 'healing',
  'hero.retired': null,
  'hero.declined': 'Decline',
  'game.ended': null,
  'guild.folded': null,
  'hero.left-guild': null,
  'guild.improved': null,
  'hero.levelled': null,
  'patron.regard-changed': 'Regard',
  'guildmaster.regard-changed': 'Regard',
  'hero.regard-changed': 'Regard',
  'item.expended': 'consumables',
  'item.equipped': 'gear',
  'item.unequipped': 'gear',
  'item.returned': 'gear',
  'item.bought': 'purchases',
  'item.sold': 'sales',
  'hero.transferred': null,
  'guild.transfer-offered': null,
  'guild.transfer-offer-declined': null,
  'guild.transfer-offer-expired': null,
  'guild.wealth-changed': null,
} satisfies Record<EngineEventType, string | null>);

/**
 * What `entityId` is called: its row's name while the world holds it, else the label its newest
 * History entry gave it (a Hero who left the pool keeps theirs there); `null` for an entity the
 * History does not name.
 */
export function entityName(document: WorldDocument, entityId: EntityId): string | null {
  const { world, history } = document;
  const row =
    rowOf<{ name: string }>(world.guilds, entityId) ??
    rowOf<{ name: string }>(world.heroes, entityId) ??
    rowOf<{ name: string }>(world.guildmasters, entityId) ??
    rowOf<{ name: string }>(world.patrons, entityId);
  if (row !== undefined) return row.name;
  const positions = Object.hasOwn(history.byEntity, entityId) ? history.byEntity[entityId] : undefined;
  const newest = positions === undefined ? undefined : history.entries[positions.at(-1) ?? -1];
  return newest?.labels[entityId] ?? null;
}

/** A scope's entries by their place in the History: the whole History's, or an entity's index. */
interface Scope {
  count: number;
  /** The place in the History of the `index`-th newest entry, from 0. */
  at: (index: number) => number;
}

function scopeOf(document: WorldDocument, entityId: EntityId | null): Scope {
  const { history } = document;
  if (entityId === null) {
    const count = history.entries.length;
    return { count, at: (index) => count - 1 - index };
  }
  const positions = Object.hasOwn(history.byEntity, entityId) ? (history.byEntity[entityId] ?? []) : [];
  return { count: positions.length, at: (index) => positions[positions.length - 1 - index] ?? -1 };
}

/** Whose History `whose` is, and their name: the whole History's, `null` and `null`, for an entity the History does not name. */
function resolved(document: WorldDocument, whose: HistoryWhose): { entityId: EntityId | null; name: string | null } {
  const wanted = whose === null ? (playerGuild(document.world)?.id ?? null) : whose === 'all' ? null : whose;
  const name = wanted === null ? null : entityName(document, wanted);
  return name === null ? { entityId: null, name: null } : { entityId: wanted, name };
}

function titleOf(name: string | null): string {
  return name === null ? 'The whole History' : `The History of ${name}`;
}

/** The title of `whose` History, `The History of The Lantern`, as its page gives it: what leads back to it. */
export function historyTitle(document: WorldDocument, whose: HistoryWhose): string {
  return titleOf(resolved(document, whose).name);
}

/**
 * A page of the History of `whose` (from 0): `historyPageSize` entries counted from the newest, a
 * Party's steps kept with its outcome, grouped by Day and time of day, newest first, each group in
 * the order it happened. A page past the last reads as the last; an entity the History does not
 * name, as the whole History. `log` is the last play's events, which the engine appended to the
 * History as they are: those entries are new.
 */
export function historyView(document: WorldDocument, log: readonly TurnEvent[], whose: HistoryWhose, page: number): HistoryView {
  const { world, history } = document;
  const player = playerGuild(world);
  const { entityId, name } = resolved(document, whose);

  const scope = scopeOf(document, entityId);
  const pages = Math.max(1, Math.ceil(scope.count / historyPageSize));
  const shown = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const positions = pagePositions(scope, history.entries, shown * historyPageSize);
  const reading: Reading = {
    entries: history.entries,
    narration: narrationFor(document, content),
    world,
    player: player?.id ?? null,
    fresh: new Set<object>(log),
  };
  return {
    title: titleOf(name),
    name,
    entityId,
    mine: entityId !== null && entityId === player?.id,
    hero: entityId !== null && rowOf(world.heroes, entityId) !== undefined ? (entityId as HeroId) : null,
    page: shown,
    pages,
    entries: scope.count,
    fresh: entityId === null ? log.length : log.filter((event) => event.participants.includes(entityId)).length,
    groups: groupsOf(positions, reading),
  };
}

// ── A page ───────────────────────────────────────────────────────────────────────────────────

/** A Party's steps on a Quest, which fold under its outcome: its Encounters and the consumables it used. */
function isStep(entry: Entry | undefined): boolean {
  return entry?.type === 'quest.encounter' || entry?.type === 'item.expended';
}

function partyOf(entry: Entry): unknown {
  return (entry.payload as { partyId?: unknown } | null)?.partyId;
}

/**
 * Where, counted from the newest, the outcome is that the step at `index` folds under: the Quest
 * Engine appends a Party's steps, then its outcome (`quests-conclude.ts`), so from the step, newer,
 * past the Party's other steps of the Turn, comes its `quest.resolved`. `-1` when it is not there.
 */
function outcomeIndex(scope: Scope, entries: readonly Entry[], index: number): number {
  const step = entries[scope.at(index)] as Entry;
  for (let newer = index - 1; newer >= 0; newer -= 1) {
    const entry = entries[scope.at(newer)];
    if (entry === undefined || entry.turn !== step.turn || partyOf(entry) !== partyOf(step)) return -1;
    if (entry.type === 'quest.resolved') return newer;
    if (!isStep(entry)) return -1;
  }
  return -1;
}

/**
 * The page's entries, newest first: `historyPageSize` counted from `from`, save that a Party's steps
 * stay with its outcome. A page whose last entries are an outcome and some of its steps takes the
 * rest of them too, and the next page starts after them.
 */
function pagePositions(scope: Scope, entries: readonly Entry[], from: number): number[] {
  const natural = Math.min(scope.count, from + historyPageSize);
  let start = from;
  while (start < natural && isStep(entries[scope.at(start)])) {
    const outcome = outcomeIndex(scope, entries, start);
    if (outcome < 0 || outcome >= from) break;
    start += 1;
  }
  let end = natural;
  while (end < scope.count && end > start && isStep(entries[scope.at(end)])) {
    if (outcomeIndex(scope, entries, end) < start) break;
    end += 1;
  }
  const positions: number[] = [];
  for (let index = start; index < end; index += 1) positions.push(scope.at(index));
  return positions;
}

/** What reading a page needs: the History, its words, the world, the player's Guild, and what is new. */
interface Reading {
  entries: readonly Entry[];
  narration: Narration;
  world: World;
  player: GuildId | null;
  /** The last play's events, which are the History's entries themselves. */
  fresh: ReadonlySet<object>;
}

/** The positions, newest first, as groups by Turn, newest first, each in the order it happened. */
function groupsOf(positions: readonly number[], reading: Reading): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  let turn = -1;
  let current: number[] = [];
  const close = (): void => {
    if (current.length === 0) return;
    groups.push({ key: String(turn), when: whenOf(turn), timeOfDay: timeOfDay(turn), rows: rowsOf([...current].reverse(), reading) });
  };
  for (const position of positions) {
    const entry = reading.entries[position];
    if (entry === undefined) continue;
    if (entry.turn !== turn) {
      close();
      turn = entry.turn;
      current = [];
    }
    current.push(position);
  }
  close();
  return groups;
}

// ── Folds ────────────────────────────────────────────────────────────────────────────────────

/** The Guild whose routine `entry` is: the Guild its payload names, else the one Guild among whom it concerns. */
function ownerOf(entry: Entry): GuildId | null {
  const { guildId } = (entry.payload ?? {}) as { guildId?: unknown };
  if (isId('guilds', guildId)) return guildId;
  const guilds = entry.participants.filter((id): id is GuildId => isId('guilds', id));
  return guilds.length === 1 ? (guilds[0] ?? null) : null;
}

/** The Rival whose routine `entry` is, or `null`: never the player's Guild, and never a Milestone. */
function routineOf(entry: Entry, reading: Reading): GuildId | null {
  if (entry.milestone || (routineKinds[entry.type as EngineEventType] ?? null) === null) return null;
  const owner = ownerOf(entry);
  if (owner === null || owner === reading.player) return null;
  const guild = rowOf(reading.world.guilds, owner);
  return guild === undefined || guild.controller.kind === 'player' ? null : owner;
}

/**
 * A Turn's entries, in the order they happened, as rows: each Party's steps folded under its
 * outcome, and each Rival's routine, two entries or more, in one line for the Guild, where its first
 * one happened. A single routine entry stands as itself: folding it saves nothing.
 */
function rowsOf(positions: readonly number[], reading: Reading): HistoryRow[] {
  const { entries } = reading;
  const outcomes = new Set(positions.flatMap((position) => (entries[position]?.type === 'quest.resolved' ? [partyOf(entries[position] as Entry)] : [])));
  const folded = (entry: Entry): boolean => isStep(entry) && outcomes.has(partyOf(entry));
  const routine = new Map<GuildId, number[]>();
  for (const position of positions) {
    const entry = entries[position] as Entry;
    const owner = folded(entry) ? null : routineOf(entry, reading);
    if (owner !== null) routine.set(owner, [...(routine.get(owner) ?? []), position]);
  }

  const steps = new Map<unknown, number[]>();
  const rows: HistoryRow[] = [];
  for (const position of positions) {
    const entry = entries[position] as Entry;
    const party = partyOf(entry);
    if (folded(entry)) {
      steps.set(party, [...(steps.get(party) ?? []), position]);
      continue;
    }
    const owner = routineOf(entry, reading);
    const fold = owner === null ? undefined : routine.get(owner);
    if (owner !== null && fold !== undefined && fold.length >= 2) {
      if (fold[0] === position) rows.push(routineRow(owner, fold, reading));
      continue;
    }
    const line = lineOf(position, reading);
    const under = entry.type === 'quest.resolved' ? (steps.get(party) ?? []) : [];
    rows.push({ kind: 'entry', key: line.key, line, steps: under.map((each) => lineOf(each, reading)), stepsWords: stepsWords(under, entries) });
  }
  return rows;
}

/** `3 Encounters and 1 consumable used`: what is folded under an outcome; empty for nothing. */
function stepsWords(positions: readonly number[], entries: readonly Entry[]): string {
  const encounters = positions.filter((position) => entries[position]?.type === 'quest.encounter').length;
  const used = positions.length - encounters;
  return listed([
    ...(encounters === 0 ? [] : [`${encounters} ${encounters === 1 ? 'Encounter' : 'Encounters'}`]),
    ...(used === 0 ? [] : [`${used} ${used === 1 ? 'consumable' : 'consumables'} used`]),
  ]);
}

/** A Rival's routine in a group, in one line: `Harrow Cross: 5 routine entries (XP, Morale and purchases).` */
function routineRow(guildId: GuildId, positions: readonly number[], reading: Reading): HistoryRow {
  const lines = positions.map((position) => lineOf(position, reading));
  const kinds = [...new Set(positions.map((position) => routineKinds[reading.entries[position]?.type as EngineEventType] ?? ''))];
  const name = rowOf(reading.world.guilds, guildId)?.name ?? reading.entries[positions[0] ?? -1]?.labels[guildId] ?? 'a Guild';
  const segments: Segment[] = [
    { kind: 'name', text: name, entityId: guildId, table: 'guilds' },
    { kind: 'text', text: `: ${positions.length} routine entries (${listed(kinds)}).` },
  ];
  return {
    kind: 'routine',
    key: `routine-${guildId}-${positions[0] ?? ''}`,
    guildId,
    side: 'rival',
    segments,
    sentence: textOf(segments),
    fresh: lines.some((line) => line.fresh),
    lines,
  };
}

// ── Lines ────────────────────────────────────────────────────────────────────────────────────

/** Whose `entry` is: the player's Guild's when it names it, else a Rival's when it names a Guild, else neither. */
function sideOf(entry: Entry, player: GuildId | null): HistorySide {
  if (player !== null && entry.participants.includes(player)) return 'mine';
  return entry.participants.some((id) => isId('guilds', id)) ? 'rival' : 'world';
}

function lineOf(position: number, reading: Reading): HistoryLine {
  const entry = reading.entries[position] as Entry;
  const segments = narrateSegments(entry as TurnEvent, reading.narration);
  const resolved = entry.type === 'quest.resolved' ? (entry.payload as { band: QuestBand; partyId: string }) : null;
  return {
    key: String(position),
    segments,
    sentence: textOf(segments),
    milestone: entry.milestone,
    fresh: reading.fresh.has(entry),
    side: sideOf(entry, reading.player),
    outcome: resolved === null ? null : { band: resolved.band, words: bandWords[resolved.band] },
    anchor: resolved === null ? null : `outcome-${resolved.partyId}`,
  };
}

// ── The choices, and anyone by name ──────────────────────────────────────────────────────────

/** A History one step away: its `whose`, and what the choice says. */
export interface HistoryChoice {
  whose: HistoryWhose;
  label: string;
  /** It is the player's Guild's, where the History opens. */
  mine: boolean;
}

/**
 * The Histories one step away (DL-99 item 2): the player's Guild's, where it opens, the whole
 * History, and each Rival's in play, in the world's order. A folded Guild's History is still read,
 * found by name (`findInHistory`), as anyone else's is.
 */
export function historyChoices(document: WorldDocument): HistoryChoice[] {
  const guilds = Object.values(document.world.guilds);
  const player = playerGuild(document.world);
  return [
    ...(player === undefined ? [] : [{ whose: null, label: player.name, mine: true }]),
    { whose: 'all', label: 'The whole History', mine: false },
    ...guilds.filter((guild) => guild.id !== player?.id && guild.foldedOnTurn === null).map((guild) => ({ whose: guild.id, label: guild.name, mine: false })),
  ];
}

/** The kinds of entity the History can be read for by name: those the world names (DL-74). */
const namedTables = { guild: 'Guild', hero: 'Hero', guildmaster: 'Guildmaster', patron: 'Patron' } as const;

type NamedPrefix = keyof typeof namedTables;

function namedPrefixOf(entityId: string): NamedPrefix | null {
  const prefix = entityId.slice(0, entityId.indexOf('-'));
  return Object.hasOwn(namedTables, prefix) ? (prefix as NamedPrefix) : null;
}

export interface HistoryName {
  entityId: EntityId;
  name: string;
  /** What they are, and for a Hero where: `Hero, dead`, `Hero of The Lantern`, `Guildmaster of The Lantern`. */
  what: string;
}

/** What a named entity is, in a few words. */
function whatIs(document: WorldDocument, entityId: EntityId, prefix: NamedPrefix): string {
  const { world } = document;
  switch (prefix) {
    case 'hero': {
      const hero = rowOf(world.heroes, entityId);
      if (hero === undefined) return 'Hero, no longer in the world';
      if (hero.diedOnTurn !== null) return 'Hero, dead';
      if (hero.retiredOnTurn !== null) return 'Hero, retired';
      const guild = hero.guildId === null ? undefined : rowOf(world.guilds, hero.guildId);
      if (guild !== undefined && guild.rosterIds.includes(hero.id)) return `Hero of ${guild.name}`;
      return hero.unattachedSince === null ? 'Hero, on no Roster' : 'Hero, in the Unattached pool';
    }
    case 'guild': {
      const guild = rowOf(world.guilds, entityId);
      return guild?.foldedOnTurn === null || guild === undefined ? 'Guild' : 'Guild, folded';
    }
    case 'guildmaster': {
      const guildmaster = rowOf(world.guildmasters, entityId);
      const guild = guildmaster === undefined ? undefined : rowOf(world.guilds, guildmaster.guildId);
      return guild === undefined ? 'Guildmaster' : `Guildmaster of ${guild.name}`;
    }
    case 'patron':
      return 'Patron';
  }
}

/** How many names a search shows at most. */
export const historySearchLimit = 20;

/**
 * Everyone the History names whose name holds `query`, case aside: every Guild, Hero, Guildmaster
 * and Patron it has an entry for, dead, retired, folded or gone from the world included, in the
 * order of their names. At most `historySearchLimit`, with how many matched in all. Quests and
 * Parties are not named here: a Quest is called by its template, which many share, and its entries
 * are in the whole History (DL-73 item 8, DL-74).
 */
export function findInHistory(document: WorldDocument, query: string): { names: HistoryName[]; matched: number } {
  const wanted = query.trim().toLocaleLowerCase('en-GB');
  if (wanted === '') return { names: [], matched: 0 };
  const found: HistoryName[] = [];
  for (const entityId of Object.keys(document.history.byEntity) as EntityId[]) {
    const prefix = namedPrefixOf(entityId);
    if (prefix === null) continue;
    const name = entityName(document, entityId);
    if (name === null || !name.toLocaleLowerCase('en-GB').includes(wanted)) continue;
    found.push({ entityId, name, what: whatIs(document, entityId, prefix) });
  }
  found.sort((a, b) => compareByCodeUnit(a.name, b.name) || compareByCodeUnit(a.entityId, b.entityId));
  return { names: found.slice(0, historySearchLimit), matched: found.length };
}
