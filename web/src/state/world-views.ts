// The views of the wider world (M7-S3 part 2, DL-73): every Guild, the Rankings, another Guild's
// page (its Roster with the Transfer fee the player's Guild would pay, its Hall, its Guildmaster),
// a Hall, a Guildmaster, the Patrons, and the whole History or anyone's in it, found by name (DL-74).
// The CLI's `show guilds`, `show rankings`, `show roster <guildId>`, `show hall`, `show guildmaster`,
// `show patrons` and `show history`, in its words (`cli/src/render.ts`), less the ids a command line
// takes.
//
// Nothing here computes a rule (ADR-0007, principle 12): every number is a document field or an
// engine selector's answer (`rankingPlaces`, `upkeep`, `nextImprovement`, `transferFee`, `ageOf`,
// `baseStat`, `regardBand` over `regardValue`, `patronRegardFor` and `guildmasterRegardForGuild`,
// `entriesFor`). Regard is shown as its band, never its number (M4-S5); Potential not at all.

import {
  ageOf,
  baseStat,
  compareByCodeUnit,
  dayOf,
  descriptiveAttributes,
  entriesFor,
  facilityKeys,
  guildmasterOf,
  guildmasterRegardForGuild,
  nextImprovement,
  patronRegardFor,
  playerGuild,
  rankingPlaces,
  regardBand,
  regardValue,
  transferFee,
  upkeep,
  type EntityId,
  type FacilityKey,
  type GameConfig,
  type Guild,
  type GuildId,
  type HeroId,
  type RankingMeasure,
  type RegardBand,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { attributeLabels, capitalised, controllerWords, nameIn, placeWords, rowOf, traitEffectWords } from './names';
import { narrationFor } from './narrate';
import { playDeps } from './reducer';
import { facilityNames } from './rejections';
import { historyPageSize, linesOf, type LogLine } from './selectors';

/** The Guild named, or the player's when none is. */
function guildOf(document: WorldDocument, guildId: GuildId | undefined): Guild | undefined {
  return guildId === undefined ? playerGuild(document.world) : rowOf(document.world.guilds, guildId);
}

// ── Every Guild, and the Rankings ───────────────────────────────────────────────────────────

/**
 * A column the Guilds' table can be sorted by (M9-S6, the review's B4). By Fame or by Wealth, it is
 * the Rankings (R10) in the engine's order, each Guild at its place; by any other, an order for
 * display only, ties in the Rankings' order by Fame.
 */
export type GuildSort = RankingMeasure | 'name' | 'disposition' | 'heroes' | 'upkeep';

/** One Guild as a row of the Guilds' table. */
export interface GuildRow {
  guildId: GuildId;
  name: string;
  /** The player's own Guild. */
  mine: boolean;
  /**
   * `1st`, or `joint 2nd` for a place Guilds share: the engine's `rankingPlaces` in words (DL-95),
   * by the table's measure; `null` for a folded Guild, which is out of the Rankings (DL-28).
   */
  place: string | null;
  /** `Yours`, or the name of the Disposition that makes a Rival's choices. */
  disposition: string;
  fame: number;
  wealth: number;
  /** How many Heroes are on its Roster. */
  heroes: number;
  /** Its Upkeep, the engine's `upkeep`. */
  upkeep: number;
  /** `folded on Day 12`, or `null` for a Guild in play (DL-28, DL-33). */
  folded: string | null;
}

export interface GuildsTable {
  /** What Place reads by: Wealth when the table is sorted by Wealth, and Fame otherwise. */
  measure: RankingMeasure;
  /** The Guilds in play, in the order asked for. */
  rows: GuildRow[];
  /** The Guilds that have folded, in the world's order, each with its Day. */
  folded: GuildRow[];
}

/** How each column other than Fame and Wealth orders the Guilds: highest first for a number, A to Z for words. */
const guildOrders: Readonly<Record<Exclude<GuildSort, RankingMeasure>, (a: GuildRow, b: GuildRow) => number>> = {
  name: (a, b) => compareByCodeUnit(a.name, b.name),
  // The player's own first, then the Rivals by their Disposition's name.
  disposition: (a, b) => Number(b.mine) - Number(a.mine) || compareByCodeUnit(a.disposition, b.disposition),
  heroes: (a, b) => b.heroes - a.heroes,
  upkeep: (a, b) => b.upkeep - a.upkeep,
};

/**
 * `show guilds` and `show rankings` as one table (M9-S6, the review's B4): every Guild in play with
 * its place, Disposition, Fame, Wealth, Heroes and Upkeep, sorted by `sort`; then the folded ones.
 * Place is the engine's `rankingPlaces` (DL-95) by Wealth when sorted by Wealth, and by Fame
 * otherwise, so Guilds level on the measure share a place (DL-91). Sorting changes nothing in the
 * world.
 */
export function guildsTable(document: WorldDocument, sort: GuildSort): GuildsTable {
  const { world } = document;
  const { config } = playDeps(document);
  const measure: RankingMeasure = sort === 'wealth' ? 'wealth' : 'fame';
  const places = new Map(rankingPlaces(world, measure).map((ranking) => [ranking.guildId, placeWords(ranking)]));
  const rowFor = (guild: Guild): GuildRow => ({
    guildId: guild.id,
    name: guild.name,
    mine: guild.controller.kind === 'player',
    place: places.get(guild.id) ?? null,
    disposition: guild.controller.kind === 'player' ? 'Yours' : nameIn(content.dispositions, guild.controller.disposition),
    fame: guild.fame,
    wealth: guild.wealth,
    heroes: guild.rosterIds.length,
    upkeep: upkeep(guild, world, config, content),
    folded: guild.foldedOnTurn === null ? null : `folded on Day ${dayOf(guild.foldedOnTurn)}`,
  });
  // The Rankings' order by the measure; by another column, a stable sort keeps it for ties.
  const rows = rankingPlaces(world, sort === 'wealth' ? 'wealth' : 'fame').flatMap((ranking) => {
    const guild = rowOf(world.guilds, ranking.guildId);
    return guild === undefined ? [] : [rowFor(guild)];
  });
  if (sort !== 'fame' && sort !== 'wealth') rows.sort(guildOrders[sort]);
  const folded = Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn !== null)
    .map(rowFor);
  return { measure, rows, folded };
}

// ── A Hall ───────────────────────────────────────────────────────────────────────────────────

/** What each facility does, in the CLI's words (`show hall`), after its name. */
const facilityDoes: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'shortens the Days an Injury takes to heal',
  trainingYard: 'gives every Hero on the Roster who is home and unhurt XP each night',
  quarters: 'raise the Morale the Roster settles toward',
});

export interface HallRow {
  facility: FacilityKey;
  /** `Training yard`. */
  name: string;
  grade: number;
  /** The top grade, the highest content defines (`improvements.json`): the pips' count (M9-S6, the review's B9). */
  top: number;
  /** The Improvement built at its grade, or `none`. */
  built: string;
  /** `The training yard gives …`. */
  does: string;
  /** The next grade's Improvement and cost (`nextImprovement`), or `null` at the top grade. */
  next: { name: string; cost: number } | null;
}

export interface HallView {
  guildId: GuildId;
  guildName: string;
  /** The player's own Hall, where `build` can raise a grade. */
  mine: boolean;
  facilities: HallRow[];
  /** `120 Wealth every 10 Days`: the Guild's Upkeep (`upkeep`), which each grade adds to. */
  upkeep: string;
}

/** `show hall [guildId]`: the Hall of the Guild named, or of the player's; `null` for a Guild the world lacks. */
export function hallView(document: WorldDocument, guildId?: GuildId): HallView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const { world } = document;
  const { config } = playDeps(document);
  const builtAt = (facility: FacilityKey, grade: number): string =>
    Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade)?.name ?? 'none';
  const topOf = (facility: FacilityKey): number =>
    Math.max(0, ...Object.values(content.improvements).flatMap((row) => (row.facility === facility ? [row.grade] : [])));
  return {
    guildId: guild.id,
    guildName: guild.name,
    mine: guild.controller.kind === 'player',
    facilities: facilityKeys.map((facility) => {
      const grade = guild.hall[facility];
      const next = nextImprovement(guild, facility, content);
      return {
        facility,
        name: capitalised(facilityNames[facility]),
        grade,
        top: topOf(facility),
        built: grade === 0 ? 'none' : builtAt(facility, grade),
        does: `The ${facilityNames[facility]} ${facilityDoes[facility]}.`,
        next: next === null ? null : { name: next.name, cost: next.cost },
      };
    }),
    upkeep: `${upkeep(guild, world, config, content)} Wealth every ${config.upkeepEveryDays} Days`,
  };
}

// ── A Guildmaster ────────────────────────────────────────────────────────────────────────────

/** What each Guildmaster Stat's rule bears on (R8, M4-S5), by the Stat's content key: the CLI's words. */
const bearsOn: Readonly<Record<string, string>> = Object.freeze({
  negotiation: 'the reward agreed and the fees paid',
  inspiration: 'the Morale baseline of the Heroes',
  coaching: 'the XP of the training yard',
  influence: "the Regard a Patron's Quest earns",
  judgement: 'how sharp the Potential hints read',
});

/** One entity a Guildmaster holds a Regard for: its name, a detail (a Sphere, a Class, a Guildmaster) and the band. */
export interface RegardRow {
  name: string;
  detail: string;
  regard: RegardBand;
  /** The band is neutral: the page folds such rows under a count (M9-S6, the review's C8). */
  neutral: boolean;
}

/** A Regard row for `name`, its `detail` and the Regard `value` in `config`'s bands. */
function regardRow(name: string, detail: string, value: number, config: Pick<GameConfig, 'regardBands'>): RegardRow {
  const regard = regardBand(value, config);
  return { name, detail, regard, neutral: regard === 'neutral' };
}

export interface GuildmasterView {
  name: string;
  guildName: string;
  attributes: [label: string, value: string][];
  stats: { name: string; value: number; bearsOn: string }[];
  traits: { name: string; effect: string }[];
  patrons: RegardRow[];
  /** Each Hero on the Guild's Roster. */
  heroes: RegardRow[];
  /** Each other Guild in play, through its Guildmaster (`guildmasterRegardForGuild`). */
  guilds: RegardRow[];
}

/**
 * `show guildmaster [guildId]` (M4-S5, R8, R9): the Guildmaster of the Guild named, or of the
 * player's; `null` for a Guild the world lacks or one with no Guildmaster.
 */
export function guildmasterView(document: WorldDocument, guildId?: GuildId): GuildmasterView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const { world } = document;
  const { config } = playDeps(document);
  const guildmaster = guildmasterOf(guild, world);
  if (guildmaster === undefined) return null;

  return {
    name: guildmaster.name,
    guildName: guild.name,
    attributes: [
      ['Sex', guildmaster.sex],
      ['Age', String(ageOf(guildmaster, world.turn, config))],
      // The descriptive Attributes written (M9-S2, DL-100 item 3); none is shown when empty.
      ...descriptiveAttributes.flatMap((attribute): [string, string][] =>
        guildmaster[attribute] === '' ? [] : [[attributeLabels[attribute], guildmaster[attribute]]],
      ),
    ],
    stats: Object.values(content.stats)
      .filter((stat) => stat.owner === 'guildmaster')
      .map((stat) => ({ name: stat.name, value: baseStat(guildmaster.stats, stat), bearsOn: bearsOn[stat.key] ?? '' })),
    traits: guildmaster.traits.map((key) => ({
      name: nameIn(content.traits, key),
      effect: traitEffectWords(rowOf(content.traits, key)?.effect ?? null, content),
    })),
    patrons: Object.values(world.patrons).map((patron) =>
      regardRow(patron.name, nameIn(content.spheres, patron.sphereKey), regardValue(guildmaster.regard, patron.id), config),
    ),
    heroes: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [regardRow(hero.name, nameIn(content.classes, hero.classKey), regardValue(guildmaster.regard, hero.id), config)];
    }),
    guilds: Object.values(world.guilds)
      .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
      .map((other) =>
        regardRow(other.name, guildmasterOf(other, world)?.name ?? 'no Guildmaster', guildmasterRegardForGuild(guildmaster, other.id, world), config),
      ),
  };
}

// ── The Patrons ──────────────────────────────────────────────────────────────────────────────

export interface PatronRow {
  patronId: string;
  name: string;
  sphere: string;
  /** Their Regard for the player's Guild, as a band; `null` in a save with no player's Guild. */
  regard: RegardBand | null;
  /** The player's Guildmaster's Regard for them, as a band (M9-S6); `null` with no player's Guildmaster. */
  guildmasterRegard: RegardBand | null;
  /** How many of their Quests are on the Board now. */
  quests: number;
  /** Both Regards are neutral, or unknown: the page folds such rows under a count (M9-S6, the review's B5). */
  neutral: boolean;
}

/**
 * `show patrons` with the Guildmaster's side (M4-S5; M9-S6, the review's B5): each Patron, their
 * Sphere, their Regard for the player's Guild, the player's Guildmaster's Regard for them, and how
 * many of their Quests are on the Board now.
 */
export function patronsView(document: WorldDocument): PatronRow[] {
  const { world } = document;
  const { config } = playDeps(document);
  const guild = playerGuild(world);
  const guildmaster = guild === undefined ? undefined : guildmasterOf(guild, world);
  const posters = world.board.map((questId) => rowOf(world.quests, questId)?.patronId);
  return Object.values(world.patrons).map((patron) => {
    const regard = guild === undefined ? null : regardBand(patronRegardFor(patron, guild.id), config);
    const guildmasterRegard = guildmaster === undefined ? null : regardBand(regardValue(guildmaster.regard, patron.id), config);
    return {
      patronId: patron.id,
      name: patron.name,
      sphere: nameIn(content.spheres, patron.sphereKey),
      regard,
      guildmasterRegard,
      quests: posters.filter((patronId) => patronId === patron.id).length,
      neutral: (regard ?? 'neutral') === 'neutral' && (guildmasterRegard ?? 'neutral') === 'neutral',
    };
  });
}

// ── Another Guild ────────────────────────────────────────────────────────────────────────────

export interface OtherRosterRow {
  heroId: HeroId;
  name: string;
  className: string;
  level: number;
  age: number;
  morale: number;
  background: string;
  /** What the player's Guild would pay to take them in (`transferFee`); `null` with no player's Guild. */
  fee: number | null;
}

export interface GuildPageView {
  guildId: GuildId;
  name: string;
  /** The player's own Guild, which its name in the History or the Guilds' table also opens (M9-S6). */
  mine: boolean;
  controller: string;
  background: string;
  fame: number;
  wealth: number;
  folded: string | null;
  roster: OtherRosterRow[];
  hall: HallView;
  guildmaster: GuildmasterView | null;
}

/**
 * Another Guild's page: `show roster <guildId>` with each Hero's Transfer fee at the player's
 * Guildmaster's Negotiation (M6-S2), shown before it is paid, and its Hall and Guildmaster.
 */
export function guildPage(document: WorldDocument, guildId: GuildId): GuildPageView | null {
  const { world } = document;
  const guild = rowOf(world.guilds, guildId);
  const hall = hallView(document, guildId);
  if (guild === undefined || hall === null) return null;
  const deps = playDeps(document);
  const player = playerGuild(world);
  const buyer = player === undefined ? undefined : guildmasterOf(player, world);
  return {
    guildId: guild.id,
    name: guild.name,
    mine: guild.controller.kind === 'player',
    controller: controllerWords(guild),
    background: nameIn(content.backgrounds, guild.backgroundKey),
    fame: guild.fame,
    wealth: guild.wealth,
    folded: guild.foldedOnTurn === null ? null : `folded on Day ${dayOf(guild.foldedOnTurn)}`,
    roster: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [
        {
          heroId,
          name: hero.name,
          className: nameIn(content.classes, hero.classKey),
          level: hero.level,
          age: ageOf(hero, world.turn, deps.config),
          morale: hero.morale,
          background: nameIn(content.backgrounds, hero.backgroundKey),
          fee: player === undefined || player.id === guild.id ? null : transferFee(hero, buyer, deps),
        },
      ];
    }),
    hall,
    guildmaster: guildmasterView(document, guildId),
  };
}

// ── The History ──────────────────────────────────────────────────────────────────────────────

/** The kinds of entity the History can be read for by name: those the world names (DL-74). */
const namedTables = { guild: 'Guild', hero: 'Hero', guildmaster: 'Guildmaster', patron: 'Patron' } as const;

type NamedPrefix = keyof typeof namedTables;

function namedPrefixOf(entityId: string): NamedPrefix | null {
  const prefix = entityId.slice(0, entityId.indexOf('-'));
  return Object.hasOwn(namedTables, prefix) ? (prefix as NamedPrefix) : null;
}

/**
 * What `entityId` is called: its row's name while the world holds it, else the label its newest
 * History entry gave it (a Hero who left the pool keeps theirs there); `null` for an entity the
 * History does not name.
 */
function entityName(document: WorldDocument, entityId: EntityId): string | null {
  const { world, history } = document;
  const row =
    rowOf<{ name: string }>(world.guilds, entityId) ??
    rowOf<{ name: string }>(world.heroes, entityId) ??
    rowOf<{ name: string }>(world.guildmasters, entityId) ??
    rowOf<{ name: string }>(world.patrons, entityId);
  if (row !== undefined) return row.name;
  const [newest] = entriesFor(history, entityId, { limit: 1 });
  return newest?.labels[entityId] ?? null;
}

export interface HistoryView {
  /** `The whole History`, or `The History of The Lantern`. */
  title: string;
  /** Whose History it is, by name; `null` for the whole History. */
  name: string | null;
  /** One page, newest first. */
  lines: LogLine[];
  page: number;
  pages: number;
  entries: number;
  /**
   * A Hero the world still holds, dead or retired among them, whose page the History opens in
   * place of their entries: the CLI's `show hero` for any Hero (DL-74). `null` otherwise.
   */
  hero: HeroId | null;
}

/**
 * `show history [entityId]`: the whole History, or an entity's, newest first, page `page` (from 0)
 * of `historyPageSize` entries; a page past the last reads as the last. `whose` is a Guild, a Hero,
 * a Guildmaster or a Patron, the world holding them or not; an id the History does not name reads
 * as the whole History.
 */
export function historyView(document: WorldDocument, whose: EntityId | null, page: number): HistoryView {
  const { history, world } = document;
  const name = whose === null ? null : entityName(document, whose);
  const entity = name === null ? null : whose;
  const total = entity === null ? history.entries.length : entriesFor(history, entity).length;
  const pages = Math.max(1, Math.ceil(total / historyPageSize));
  const shown = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const from = shown * historyPageSize;
  const entries =
    entity === null
      ? history.entries.slice(Math.max(0, total - from - historyPageSize), total - from).reverse()
      : entriesFor(history, entity, { from, limit: historyPageSize });
  return {
    title: entity === null ? 'The whole History' : `The History of ${name}`,
    name: entity === null ? null : name,
    lines: linesOf(entries, narrationFor(document, content)),
    page: shown,
    pages,
    entries: total,
    hero: entity !== null && rowOf(world.heroes, entity) !== undefined ? (entity as HeroId) : null,
  };
}

/** The Guilds whose History can be read, folded ones included: the History keeps them (principle 11). */
export function historyChoices(document: WorldDocument): { guildId: GuildId; name: string }[] {
  return Object.values(document.world.guilds).map((guild) => ({ guildId: guild.id, name: guild.name }));
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
