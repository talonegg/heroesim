// The History as the one place to read what happened (M9-S5, DL-105; DL-99 item 2): whose it is,
// and a page of it grouped by Day and time of day, newest first, each group in the order it
// happened. In a group, a Party's steps on its Quest fold under its outcome, and each Rival's
// routine under one line for the Guild, save in a Hero's own History, where every line is the
// Hero's (DL-109 item 2, Q14); every line says whose it is, whether the last play appended it, and
// on an outcome how the Quest went.
//
// Each History is a scope (M9-F4, DL-111 item 4, DL-112 item 7): the player's Guild's leaves out its
// Heroes' XP and Morale, Regard, Upkeep, purchases and sales (`leftOutOfYourGuild`); a Rival's its
// Upkeep, purchases and sales (`leftOutOfARival`); a Hero's, a Guildmaster's, a Patron's and a
// Quest's leave out nothing. The World History takes the world's news from every Guild
// (`inTheWorldHistory`), and folds nothing. The whole History, the game menu's debug view, is every
// entry, unfolded, each with its event type. Paging, folds, the count and what is new all read what
// the scope shows (`historyFilter`), and so does the rail (`historyEntries`).
//
// In the player's Guild's History a Party's return is one entry (M9-F5, DL-111 item 2, DL-113 item
// 1): its parts, the Encounters, consumables, the Party's Levels that night and the dead's gear, are
// left out of the scope (`partOfAReturn`), and its line carries the entry's shape (`returnEntry`,
// `state/quest-return.ts`). Its Injuries and Deaths stand out beside it as entries of their own (M9-F7,
// DL-120 item 6). Elsewhere a Party's steps still fold under its outcome.
//
// Nothing here computes a rule (ADR-0007, principle 12): every line is a History entry as the engine
// appended it, put in words by the narration (`namer.ts`), and read through the History's own index of entries by
// participant (`byEntity`, as `entriesFor` reads it). What is new is the last play's events, which
// are the History's entries themselves (`append`, ADR-0008). Grouping, folding and marking are
// presentation.

import {
  compareByCodeUnit,
  isId,
  type EngineEventOf,
  playerGuild,
  timeOfDay,
  type EngineEventType,
  type EntityId,
  type Entry,
  type GuildId,
  type HeroId,
  type QuestBand,
  type Sex,
  type TimeOfDay,
  type TurnEvent,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { listed } from '@heroesim/words';
import { content } from '../content';
import type { PortraitRole } from '../media';
import { bandWords, rowOf } from './names';
import { narrateSegments, narrationFor, textOf, type Narration, type Segment } from './namer';
import { partOfAReturn, returnEntry, type ReturnEntry } from './quest-return';
import { historyPageSize, whenOf } from './selectors';

/**
 * Whose History: `null` for the player's Guild's, where it opens (DL-99 item 2); `world` for the
 * World History (M9-F4); `all` for the whole History, the game menu's debug view; or a Guild, a
 * Hero, a Guildmaster or a Patron.
 */
export type HistoryWhose = EntityId | 'world' | 'all' | null;

/**
 * Which History a page reads (M9-F4): the player's Guild's, a Rival's, the World History, the whole
 * History (the debug view), or anyone else's, a Hero's, a Guildmaster's or a Patron's.
 */
export type HistoryScope = 'mine' | 'rival' | 'world' | 'whole' | 'entity';

/** Whose an entry is: the player's Guild's, a Rival's, or neither (a Patron's offer, the pool, the world). */
export type HistorySide = 'mine' | 'rival' | 'world';

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
  /** The entry's event type, `quest.resolved`, which the debug view shows. */
  type: string;
  /**
   * In the player's Guild's History, a Party's return as its one entry (M9-F5, DL-111 item 2): the
   * band apart, a line per Hero and the way to its report; `null` on any other line and elsewhere.
   */
  questReturn: ReturnEntry | null;
}

/**
 * A line, or several folded under one.
 * - An entry, and for a Party's outcome its steps on the Quest folded under it: its Encounters and
 *   the consumables it used, in the order they happened, with how many of each (`3 Encounters and
 *   1 Consumable used`; empty when it has none).
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
  /** `The History of The Lantern`, `The World History`, or `Debug: Whole History`. */
  title: string;
  /** Whose History it is, by name; `null` for the World History and the whole History. */
  name: string | null;
  /** Whose History it is; `null` for the World History and the whole History. */
  entityId: EntityId | null;
  /** Which History it is, and so what it leaves out and what it folds. */
  scope: HistoryScope;
  /** It is the player's Guild's. */
  mine: boolean;
  /** A Hero the world still holds, whose page the History opens in their place (DL-74); `null` otherwise. */
  hero: HeroId | null;
  /** The Guild whose History it is, whose Banner stands beside its title (DL-125 item 7); `null` for anyone else's. */
  banner: GuildId | null;
  /**
   * The Portrait of the person whose History it is (DL-125 item 2): a Guildmaster's, or a Patron's
   * (v1.1.2-S3). `null` for a Guild's, the World's, a Hero's (one the world holds opens their Hero page,
   * which has theirs, and one gone from it has no sex to show) and a Patron that is a body, which has none.
   */
  portrait: { role: PortraitRole; sex: Sex; portraitKey: string | null } | null;
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
  // v1.1.4-S7: a Trait gained or lost is a Milestone, so never routine.
  'hero.trait-gained': null,
  'hero.trait-lost': null,
  'hero.retired': null,
  'hero.declined': 'Decline',
  'game.ended': null,
  'guild.folded': null,
  // A Rival's Guildmaster succeeded (M9-S2): a Milestone, so never routine.
  'guildmaster.succeeded': null,
  'hero.left-guild': null,
  'guild.improved': null,
  'hero.levelled': null,
  'patron.regard-changed': 'Regard',
  'guildmaster.regard-changed': 'Regard',
  'hero.regard-changed': 'Regard',
  'item.expended': 'Consumables',
  'item.equipped': 'Gear',
  'item.unequipped': 'Gear',
  'item.returned': 'Gear',
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

// ── The scopes: what each History leaves out (M9-F4) ─────────────────────────────────────────

/**
 * What the player's Guild's History leaves out (DL-111 item 4): its Heroes' XP and Morale, Regard
 * moving, its Upkeep, and its purchases and sales. A Hero's own History keeps their XP, Morale and
 * Regard; the Treasury reads the Upkeep and the Market's entries; the debug view keeps everything.
 */
export const leftOutOfYourGuild: ReadonlySet<string> = new Set<EngineEventType>([
  'hero.xp-gained',
  'hero.morale-changed',
  'patron.regard-changed',
  'guildmaster.regard-changed',
  'hero.regard-changed',
  'guild.upkeep-paid',
  'item.bought',
  'item.sold',
]);

/** What a Rival's History leaves out (DL-111 item 4): its Upkeep, and its purchases and sales. */
export const leftOutOfARival: ReadonlySet<string> = new Set<EngineEventType>(['guild.upkeep-paid', 'item.bought', 'item.sold']);

/**
 * What the World History takes (DL-112 item 7, DL-113 item 1), keyed by every event type, so that
 * `tsc -b` refuses a type the engine adds until it is decided: the world made and its rules
 * adopted; Guilds founded and folded (a Bankruptcy is a fold's reason), and a Guildmaster
 * succeeded; the game's end; every Guild's Quests, taken and resolved; and a Patron's Regard for a
 * Guild moving into a new band. A Guild below the floor is left out: a Rival's warning comes and
 * goes, and its fold is the news. A module's events wait for M10 to decide, so none is taken.
 */
export const inTheWorldHistory: Readonly<Record<EngineEventType, boolean>> = Object.freeze({
  'world.created': true,
  'guild.founded': true,
  'guildmaster.generated': false,
  'hero.generated': false,
  'patron.generated': false,
  'world.rules-adopted': true,
  'guild.upkeep-paid': false,
  'guild.below-floor': false,
  'guild.floor-recovered': false,
  'hero.recruited': false,
  'hero.left-pool': false,
  'quest.offered': false,
  'quest.expired': false,
  'quest.taken': true,
  'quest.encounter': false,
  'quest.resolved': true,
  'quest.loot': false,
  'hero.injured': false,
  'hero.died': false,
  'hero.xp-gained': false,
  'hero.morale-changed': false,
  'hero.healed': false,
  'hero.trait-gained': false,
  'hero.trait-lost': false,
  'hero.retired': false,
  'hero.declined': false,
  'game.ended': true,
  'guild.folded': true,
  'guildmaster.succeeded': true,
  'hero.left-guild': false,
  'guild.improved': false,
  'hero.levelled': false,
  'patron.regard-changed': true,
  'guildmaster.regard-changed': false,
  'hero.regard-changed': false,
  'item.expended': false,
  'item.equipped': false,
  'item.unequipped': false,
  'item.returned': false,
  'item.bought': false,
  'item.sold': false,
  'hero.transferred': false,
  'guild.transfer-offered': false,
  'guild.transfer-offer-declined': false,
  'guild.transfer-offer-expired': false,
  'guild.wealth-changed': false,
} satisfies Record<EngineEventType, boolean>);

/** An entry of the World History: one of its types; never a module's (M10 decides those). */
export function isWorldNews(entry: Pick<Entry, 'type'>): boolean {
  return Object.hasOwn(inTheWorldHistory, entry.type) && inTheWorldHistory[entry.type as EngineEventType];
}

/** Which kind of History `target` is: the whole or the world's, a Guild's, the player's or a Rival's, or anyone else's. */
function scopeKind(document: WorldDocument, target: EntityId | 'world' | 'all'): HistoryScope {
  if (target === 'all') return 'whole';
  if (target === 'world') return 'world';
  const guild = rowOf(document.world.guilds, target);
  if (guild === undefined) return 'entity';
  return guild.controller.kind === 'player' ? 'mine' : 'rival';
}

/** What a History of `kind` leaves out: the player's Guild's and a Rival's leave some types out; the rest leave out nothing. */
function leftOutOf(kind: HistoryScope): ReadonlySet<string> | null {
  if (kind === 'mine') return leftOutOfYourGuild;
  return kind === 'rival' ? leftOutOfARival : null;
}

/**
 * Whether an entry is shown in `target`'s History (M9-F4): the World History's filter, a Guild's
 * (`leftOutOfYourGuild`, `leftOutOfARival`), or none. The player's Guild's also leaves out a return's
 * parts, which its one entry gathers (M9-F5, `partOfAReturn`). It does not ask whether the entry
 * names `target`: the History's index by participant does that. `entry` is one of the History's.
 */
export function historyFilter(document: WorldDocument, target: EntityId | 'world' | 'all'): (entry: Entry) => boolean {
  const kind = scopeKind(document, target);
  if (kind === 'world') return isWorldNews;
  const leftOut = leftOutOf(kind);
  if (leftOut === null) return () => true;
  if (kind !== 'mine') return (entry) => !leftOut.has(entry.type);
  return (entry) => !leftOut.has(entry.type) && !partOfAReturn(document.history, entry);
}

/**
 * `entityId`'s newest entries, newest first, as its History shows them (its filter applied), at
 * most `limit`: the rail reads the player's Guild's this way.
 */
export function historyEntries(document: WorldDocument, entityId: EntityId, limit: number): Entry[] {
  const { history } = document;
  const shows = historyFilter(document, entityId);
  const positions = Object.hasOwn(history.byEntity, entityId) ? (history.byEntity[entityId] ?? []) : [];
  const found: Entry[] = [];
  for (let index = positions.length - 1; index >= 0 && found.length < limit; index -= 1) {
    const entry = history.entries[positions[index] ?? -1];
    if (entry !== undefined && shows(entry)) found.push(entry);
  }
  return found;
}

/** A scope's entries by their place in the History, and what it folds. */
interface Scope {
  kind: HistoryScope;
  count: number;
  /** The place in the History of the `index`-th newest entry, from 0. */
  at: (index: number) => number;
  /** A Party's steps fold under its outcome: everywhere but the World History and the whole History. */
  foldsSteps: boolean;
  /** Each Rival's routine folds into one line: in a Guild's History and a Guildmaster's or a Patron's, not a Hero's own (Q14), the world's or the whole. */
  foldsRoutine: boolean;
}

/**
 * The positions `positionsIn` found, by History and target, with the History's length then. The
 * History is appended to, never changed, so the positions hold until it grows: a page turned, a
 * choice made or the count read again does not walk it again (M9-F6, code review).
 */
const positionsFound = new WeakMap<WorldDocument['history'], Map<string, { length: number; positions: number[] }>>();

/** The ascending places in the History of `target`'s entries, as its filter leaves them: an entity's from its index, the world's from the whole. */
function positionsIn(document: WorldDocument, target: EntityId | 'world'): number[] {
  const { history } = document;
  const found = positionsFound.get(history) ?? new Map<string, { length: number; positions: number[] }>();
  positionsFound.set(history, found);
  const known = found.get(target);
  if (known !== undefined && known.length === history.entries.length) return known.positions;
  const positions = walkedPositions(document, target);
  found.set(target, { length: history.entries.length, positions });
  return positions;
}

function walkedPositions(document: WorldDocument, target: EntityId | 'world'): number[] {
  const { history } = document;
  const shows = historyFilter(document, target);
  if (target === 'world') {
    const positions: number[] = [];
    history.entries.forEach((entry, position) => {
      if (shows(entry)) positions.push(position);
    });
    return positions;
  }
  const indexed = Object.hasOwn(history.byEntity, target) ? (history.byEntity[target] ?? []) : [];
  return scopeKind(document, target) === 'entity' ? indexed : indexed.filter((position) => shows(history.entries[position] as Entry));
}

function scopeOf(document: WorldDocument, target: EntityId | 'world' | 'all'): Scope {
  const { history } = document;
  const kind = scopeKind(document, target);
  const folds = { foldsSteps: kind !== 'world' && kind !== 'whole', foldsRoutine: kind !== 'world' && kind !== 'whole' && rowOf(document.world.heroes, target) === undefined };
  if (target === 'all') {
    const count = history.entries.length;
    return { kind, count, at: (index) => count - 1 - index, ...folds };
  }
  const positions = positionsIn(document, target);
  return {
    kind,
    count: positions.length,
    at: (index) => positions[positions.length - 1 - index] ?? -1,
    ...folds,
  };
}

/**
 * Which History `whose` is, and whose by name: the player's Guild's for `null`, and for an entity the
 * History does not name (where the History opens), or the World History where there is no player's
 * Guild; the World History and the whole History, which are no one's.
 */
function resolved(document: WorldDocument, whose: HistoryWhose): { target: EntityId | 'world' | 'all'; entityId: EntityId | null; name: string | null } {
  if (whose === 'all' || whose === 'world') return { target: whose, entityId: null, name: null };
  const player = playerGuild(document.world)?.id ?? null;
  for (const wanted of [whose, player]) {
    const name = wanted === null ? null : entityName(document, wanted);
    if (wanted !== null && name !== null) return { target: wanted, entityId: wanted, name };
  }
  // No player's Guild, as a hand-made save may have: the world's, not the debug view the player did
  // not ask for (M9-F6).
  return { target: 'world', entityId: null, name: null };
}

function titleOf(target: EntityId | 'world' | 'all', name: string | null): string {
  if (target === 'all') return 'Debug: Whole History';
  if (target === 'world') return 'The World History';
  return `The History of ${name ?? 'no one'}`;
}

/** The title of `whose` History, `The History of The Lantern`, as its page gives it: what leads back to it. */
export function historyTitle(document: WorldDocument, whose: HistoryWhose): string {
  const { target, name } = resolved(document, whose);
  return titleOf(target, name);
}

/**
 * A page of the History of `whose` (from 0): `historyPageSize` entries counted from the newest of
 * what its scope shows, a Party's steps kept with its outcome where they fold, grouped by Day and
 * time of day, newest first, each group in the order it happened. Each page starts where the one
 * before ends (`pageStarts`), so none is empty and `pages` is exact. A page past the last reads as
 * the last; an entity the History does not name, as the player's Guild's. `log` is the last play's
 * events, which the engine appended to the History as they are: those the scope shows are new.
 */
export function historyView(document: WorldDocument, log: readonly TurnEvent[], whose: HistoryWhose, page: number): HistoryView {
  const { world, history } = document;
  const player = playerGuild(world);
  const { target, entityId, name } = resolved(document, whose);

  const scope = scopeOf(document, target);
  const starts = pageStarts(scope, history.entries);
  const pages = starts.length;
  const shown = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const positions = pagePositions(scope, history.entries, starts[shown] ?? 0);
  const hero = entityId !== null && rowOf(world.heroes, entityId) !== undefined ? (entityId as HeroId) : null;
  const shows = historyFilter(document, target);
  const reading: Reading = {
    document,
    returns: scope.kind === 'mine',
    entries: history.entries,
    narration: narrationFor(document, content),
    world,
    player: player?.id ?? null,
    fresh: new Set<object>(log),
    foldsSteps: scope.foldsSteps,
    foldsRoutine: scope.foldsRoutine,
  };
  return {
    title: titleOf(target, name),
    name,
    entityId,
    scope: scope.kind,
    mine: scope.kind === 'mine',
    hero,
    banner: entityId !== null && rowOf(world.guilds, entityId) !== undefined ? (entityId as GuildId) : null,
    portrait: portraitOf(world, entityId),
    page: shown,
    pages,
    entries: scope.count,
    fresh: log.filter((event) => (entityId === null || event.participants.includes(entityId)) && shows(event)).length,
    groups: groupsOf(positions, reading),
  };
}

/**
 * Whose Portrait `entityId`'s History shows (DL-125 item 2): a Guildmaster's the world holds, or a
 * Patron's by the sex their name came with (v1.1.2-S3). No Patron has a picture in v1.1.2 (DL-125 item
 * 4), so theirs is the Silhouette of their sex; a Patron that is a body has none. A Hero's History has
 * none of its own: one the world holds opens their Hero page, which has their Portrait (`hero`), and one
 * gone from it has no sex to show (v1.1.2-S2's verification, DL-131).
 */
function portraitOf(world: World, entityId: EntityId | null): HistoryView['portrait'] {
  if (entityId === null) return null;
  const guildmaster = rowOf(world.guildmasters, entityId);
  if (guildmaster !== undefined) return { role: 'guildmaster', sex: guildmaster.sex, portraitKey: guildmaster.portraitKey };
  const patron = rowOf(world.patrons, entityId);
  return patron === undefined || patron.sex === null ? null : { role: 'patron', sex: patron.sex, portraitKey: null };
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
 * Whether `next`, the entry older than `last` in the player's Guild's History, is the return `last` stands
 * beside, or another of its Loot, Injuries and Deaths (M9-F7, DL-120 item 6): they are written after the
 * return, so newer, and a page that ends on one of them takes its return with it.
 */
function besideItsReturn(last: Entry | undefined, next: Entry | undefined): boolean {
  if (last === undefined || next === undefined || !besideAReturn.has(last.type)) return false;
  const questId = (last.payload as { questId?: unknown }).questId;
  if (questId === null || questId === undefined || (next.payload as { questId?: unknown }).questId !== questId) return false;
  return next.type === 'quest.resolved' || besideAReturn.has(next.type);
}

/**
 * The entries that stand beside a return in the player's Guild's History, after it: its Loot, Injuries and Deaths, and
 * from v1.1.4-S7 the Traits its Heroes earned, written next after them.
 */
const besideAReturn: ReadonlySet<string> = new Set(['quest.loot', 'hero.injured', 'hero.died', 'hero.trait-gained']);

/**
 * Where the page that starts at `start` ends, counted from the newest: `historyPageSize` entries on,
 * or the scope's end; past that, in the player's Guild's History, the return whose Loot, Injury or Death
 * ends the page (M9-F7, code review); and every step whose outcome the page holds, so that a Party's
 * steps stay with its outcome however many there are.
 */
function pageEnd(scope: Scope, entries: readonly Entry[], start: number): number {
  let end = Math.min(scope.count, start + historyPageSize);
  while (scope.kind === 'mine' && end < scope.count && besideItsReturn(entries[scope.at(end - 1)], entries[scope.at(end)])) end += 1;
  while (scope.foldsSteps && end < scope.count && isStep(entries[scope.at(end)]) && outcomeIndex(scope, entries, end) >= start) end += 1;
  return end;
}

/**
 * Where each page starts, counted from the newest (the M9 review): the first at the newest entry,
 * and each next where the one before ends (`pageEnd`), up to the page that holds the entry at
 * `through`, or every page. The one set of edges both the count and a page read, so no page is empty,
 * every page but the last holds at least `historyPageSize`, and the count is exact. An empty scope has
 * one page, empty.
 */
function pageStarts(scope: Scope, entries: readonly Entry[], through = scope.count - 1): number[] {
  const starts = [0];
  for (let end = pageEnd(scope, entries, 0); end < scope.count && end <= through; end = pageEnd(scope, entries, end)) starts.push(end);
  return starts;
}

/** The page's entries' places in the History, newest first: from `start` to its end (`pageEnd`). */
function pagePositions(scope: Scope, entries: readonly Entry[], start: number): number[] {
  const positions: number[] = [];
  for (let index = start, end = pageEnd(scope, entries, start); index < end; index += 1) positions.push(scope.at(index));
  return positions;
}

/** What reading a page needs: the History, its words, the world, the player's Guild, what is new, and whether a Rival's routine folds. */
interface Reading {
  document: WorldDocument;
  /** A Party's return is its one entry: in the player's Guild's History (M9-F5). */
  returns: boolean;
  entries: readonly Entry[];
  narration: Narration;
  world: World;
  player: GuildId | null;
  /** The last play's events, which are the History's entries themselves. */
  fresh: ReadonlySet<object>;
  /** A Party's steps fold under its outcome: not in the World History or the whole History (M9-F4). */
  foldsSteps: boolean;
  /** Each Rival's routine folds into one line: in a Guild's History, not a Hero's own (Q14), the world's or the whole. */
  foldsRoutine: boolean;
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

/** The Rival whose routine `entry` is, or `null`: never the player's Guild, never a Milestone, and none where routine does not fold. */
function routineOf(entry: Entry, reading: Reading): GuildId | null {
  if (!reading.foldsRoutine || entry.milestone || (routineKinds[entry.type as EngineEventType] ?? null) === null) return null;
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
  const folded = (entry: Entry): boolean => reading.foldsSteps && isStep(entry) && outcomes.has(partyOf(entry));
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

/** `3 Encounters and 1 Consumable used`: what is folded under an outcome; empty for nothing. */
function stepsWords(positions: readonly number[], entries: readonly Entry[]): string {
  const encounters = positions.filter((position) => entries[position]?.type === 'quest.encounter').length;
  const used = positions.length - encounters;
  return listed([
    ...(encounters === 0 ? [] : [`${encounters} ${encounters === 1 ? 'Encounter' : 'Encounters'}`]),
    ...(used === 0 ? [] : [`${used} ${used === 1 ? 'Consumable' : 'Consumables'} used`]),
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
  const resolved = entry.type === 'quest.resolved' ? (entry as EngineEventOf<'quest.resolved'>).payload : null;
  return {
    key: String(position),
    segments,
    sentence: textOf(segments),
    milestone: entry.milestone,
    fresh: reading.fresh.has(entry),
    side: sideOf(entry, reading.player),
    outcome: resolved === null ? null : { band: resolved.band, words: bandWords[resolved.band] },
    type: entry.type,
    questReturn: resolved === null || !reading.returns ? null : returnEntry(reading.document, { partyId: resolved.partyId, questId: resolved.questId }),
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
 * The Histories one step away (DL-99 item 2): the player's Guild's, where it opens, the World
 * History, and each Rival's in play, in the world's order (M9-F4). The whole History is not among
 * them: it is the game menu's debug view (DL-111 item 4). A folded Guild's History is still read,
 * found by name (`findInHistory`), as anyone else's is.
 */
export function historyChoices(document: WorldDocument): HistoryChoice[] {
  const guilds = Object.values(document.world.guilds);
  const player = playerGuild(document.world);
  return [
    ...(player === undefined ? [] : [{ whose: null, label: player.name, mine: true }]),
    { whose: 'world', label: 'The World History', mine: false },
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
  /**
   * What they are, and for a Hero or Guildmaster where: `Hero, dead`, `Hero of The Lantern`,
   * `Guildmaster of The Lantern`, `Guildmaster of The Kestrel Guild, retired`.
   */
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
      // A retired Guildmaster keeps their Guild's id, and a successor runs it now (Succession, M9-S2).
      const guildmaster = rowOf(world.guildmasters, entityId);
      const guild = guildmaster === undefined ? undefined : rowOf(world.guilds, guildmaster.guildId);
      const what = guild === undefined ? 'Guildmaster' : `Guildmaster of ${guild.name}`;
      return guildmaster !== undefined && guildmaster.retiredOnTurn !== null ? `${what}, retired` : what;
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
