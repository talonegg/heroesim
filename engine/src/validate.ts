// The World State validator (data-model §5, §6). It runs on every load (`deserialise`, M1-S8)
// and, in tests, after every `advance` (through `withValid`); it never runs per Turn in play.
// Every check is a named function returning a list, so a refused document names the check it
// failed and the offending id. Nothing is repaired: a document is accepted as it is or refused.
//
// A failure is a document the engine must not play: an id naming no row, one Hero on two
// Rosters, a History index pointing outside its entries. A warning is a content key the content
// in use does not define (rule 5): the key is kept, rules ignore it, and the load goes ahead.
//
// The shape is checked first, so that no later check can throw on a missing field: a hand-made
// or damaged save is refused, never crashes the load. The choices the epic left open are DL-20.

import type { EngineDeps } from './config.js';
import type { ContentSet } from './content-types.js';
import {
  isId,
  maxIdNumber,
  parseId,
  tableNames,
  type Entry,
  type EventType,
  type Guild,
  type Guildmaster,
  type Hero,
  type HeroId,
  type History,
  type Meta,
  type Party,
  type PartyId,
  type Patron,
  type Quest,
  type Stack,
  type TableName,
  type TransferOffer,
  type UniqueItem,
  type World,
  type WorldDocument,
} from './document.js';
import { findJsonUnsafe, formatPath } from './json-safe.js';
import { dispositionOf } from './selectors.js';

// ── Results ──────────────────────────────────────────────────────────────────────────────────

/** The checks that refuse a document, each a function of the same name in camelCase. */
export const refusalChecks = [
  'document-shape',
  'json-safe',
  'id-format',
  'counter-range',
  'dangling-reference',
  'hero-on-two-rosters',
  'roster-guild-mismatch',
  'unattached-mismatch',
  'hero-in-two-parties',
  'party-member-mismatch',
  'guildmaster-guild-mismatch',
  'quest-party-mismatch',
  'too-many-parties',
  'duplicate-stack',
  'offer-hero-not-on-roster',
  'offer-expired',
  'history-position-out-of-range',
  'history-index-mismatch',
  'history-turn-order',
  'removed-hero-in-history',
] as const;

export type RefusalCheck = (typeof refusalChecks)[number];

/** The checks that warn: a content key the content in use does not define (rule 5). */
export const warningChecks = [
  'unknown-stat',
  'unknown-class',
  'unknown-skill',
  'unknown-trait',
  'unknown-background',
  'unknown-sphere',
  'unknown-item',
  'unknown-template',
  'unknown-disposition',
] as const;

export type WarningCheck = (typeof warningChecks)[number];

/** Why a document is refused. */
export interface ValidationFailure {
  check: RefusalCheck;
  /**
   * The offending row or entity's id; where no row is at fault, the path of the offending value:
   * `$.world.counters.heroes`, `$.history.byType["quest.resolved"]`.
   */
  id: string;
  /** Prose for a front end to print. Tests assert on `check` and `id`, never on this. */
  detail: string;
}

/** A content key the content in use does not define: kept, ignored by rules, and reported. */
export interface ValidationWarning {
  check: WarningCheck;
  /** The row holding the key. */
  id: string;
  /** The unknown key. */
  key: string;
  detail: string;
}

export type ValidationResult =
  | { ok: true; warnings: ValidationWarning[] }
  | { ok: false; failures: ValidationFailure[] };

/**
 * The History entries that may outlive the Hero they name (data-model rule 8): every pool Hero
 * has these two, and their labels narrate without the row. A Hero named by any other entry keeps
 * their row for good.
 */
export const passiveEntryTypes = ['hero.generated', 'hero.left-pool'] as const satisfies readonly EventType[];

/**
 * The most Parties one Quest may have in the first build: a limit of the build's rules, not a
 * balance number (DL-20). A later build allows one per Guild, which changes the check.
 */
export const maxPartiesPerQuest = 1;

// ── The validator ────────────────────────────────────────────────────────────────────────────

type Check = (document: WorldDocument) => ValidationFailure[];
type ContentCheck = (document: WorldDocument, content: ContentSet) => ValidationWarning[];

/** The checks that run once the shape is known to be right, in the order they report. */
const checksOfAWellShapedDocument: readonly Check[] = [
  idFormat,
  counterRange,
  danglingReference,
  heroOnTwoRosters,
  rosterGuildMismatch,
  unattachedMismatch,
  heroInTwoParties,
  partyMemberMismatch,
  guildmasterGuildMismatch,
  questPartyMismatch,
  tooManyParties,
  duplicateStack,
  offerHeroNotOnRoster,
  offerExpired,
  historyPositionOutOfRange,
  historyIndexMismatch,
  historyTurnOrder,
  removedHeroInHistory,
];

const contentChecks: readonly ContentCheck[] = [
  unknownStat,
  unknownClass,
  unknownSkill,
  unknownTrait,
  unknownBackground,
  unknownSphere,
  unknownItem,
  unknownTemplate,
  unknownDisposition,
];

/**
 * Accepts `document`, with a warning per content key `deps.content` does not define, or refuses
 * it with every failure found. Never throws, whatever it is given: a load hands it parsed text.
 *
 * Takes `deps` rather than a bare `ContentSet` (DL-23), matching every other engine entry point
 * (epics README §4): M8's modules will need `deps.modules` to validate their own state slices.
 */
export function validate(document: unknown, deps: EngineDeps): ValidationResult {
  const { content } = deps;
  const shape = documentShape(document);
  const failures = [...jsonSafe(document), ...shape];
  if (shape.length > 0) return { ok: false, failures };

  const wellShaped = document as WorldDocument;
  for (const check of checksOfAWellShapedDocument) failures.push(...check(wellShaped));
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, warnings: contentChecks.flatMap((check) => check(wellShaped, content)) };
}

// ── Shape and JSON safety ────────────────────────────────────────────────────────────────────

/** Rule 6, over the whole document, the History included (DL-18 item 4). */
function jsonSafe(document: unknown): ValidationFailure[] {
  const unsafe = findJsonUnsafe(document);
  if (unsafe === null) return [];
  return [{ check: 'json-safe', id: unsafe.path, detail: `${unsafe.path} is not JSON-safe: ${unsafe.kind}` }];
}

type FieldKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'list'
  | 'map'
  | 'string-or-null'
  | 'integer-or-null'
  | 'map-or-null'
  | 'any';

/** Every field of `Row` and its kind: the compiler refuses a list that drifts from the interface. */
type Shape<Row> = Record<keyof Row, FieldKind>;

/** A plain object: what JSON reads an object as. */
function isMap(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const isInteger = (value: unknown): boolean => Number.isSafeInteger(value);

const kindTests: Record<FieldKind, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string',
  // Finiteness is json-safe's to report.
  number: (value) => typeof value === 'number',
  integer: isInteger,
  boolean: (value) => typeof value === 'boolean',
  list: (value) => Array.isArray(value),
  map: isMap,
  'string-or-null': (value) => value === null || typeof value === 'string',
  'integer-or-null': (value) => value === null || isInteger(value),
  'map-or-null': (value) => value === null || isMap(value),
  any: () => true,
};

const documentFields: Shape<WorldDocument> = { meta: 'map', world: 'map', history: 'map' };

const metaFields: Shape<Meta> = {
  version: 'integer',
  seed: 'string',
  content: 'map',
  config: 'map',
  createdAt: 'string',
};

const worldFields: Shape<World> = {
  turn: 'integer',
  rng: 'map',
  counters: 'map',
  ended: 'map-or-null',
  guilds: 'map',
  guildmasters: 'map',
  heroes: 'map',
  patrons: 'map',
  quests: 'map',
  parties: 'map',
  items: 'map',
  stacks: 'map',
  board: 'list',
  offers: 'map',
  modules: 'map',
};

const historyFields: Shape<History> = { entries: 'list', byEntity: 'map', byType: 'map', milestones: 'list' };

const entryFields: Shape<Entry> = {
  turn: 'integer',
  type: 'string',
  participants: 'list',
  labels: 'map',
  milestone: 'boolean',
  payload: 'any',
};

const guildFields: Shape<Guild> = {
  id: 'string',
  name: 'string',
  backgroundKey: 'string',
  foundedTurn: 'integer',
  guildmasterId: 'string',
  rosterIds: 'list',
  wealth: 'number',
  fame: 'number',
  belowFloorSince: 'integer-or-null',
  foldedOnTurn: 'integer-or-null',
  hall: 'map',
  controller: 'map',
  regard: 'map',
};

const guildmasterFields: Shape<Guildmaster> = {
  id: 'string',
  name: 'string',
  sex: 'string',
  guildId: 'string',
  enteredTurn: 'integer',
  ageAtEntry: 'number',
  stats: 'map',
  traits: 'list',
  regard: 'map',
};

const heroFields: Shape<Hero> = {
  id: 'string',
  name: 'string',
  sex: 'string',
  backgroundKey: 'string',
  classKey: 'string',
  enteredTurn: 'integer',
  ageAtEntry: 'number',
  guildId: 'string-or-null',
  unattachedSince: 'integer-or-null',
  leftPoolOnTurn: 'integer-or-null',
  partyId: 'string-or-null',
  stats: 'map',
  potential: 'map',
  skills: 'map',
  traits: 'list',
  xp: 'number',
  level: 'integer',
  injury: 'map-or-null',
  morale: 'number',
  diedOnTurn: 'integer-or-null',
  retiredOnTurn: 'integer-or-null',
  regard: 'map',
};

const patronFields: Shape<Patron> = { id: 'string', name: 'string', sphereKey: 'string', regard: 'map' };

const questFields: Shape<Quest> = {
  id: 'string',
  templateKey: 'string',
  patronId: 'string',
  difficulty: 'number',
  tags: 'list',
  reward: 'number',
  fameEffect: 'number',
  durationTurns: 'integer',
  demands: 'list',
  skillKeys: 'list',
  encounterKeys: 'list',
  requirements: 'map',
  lootTableKey: 'string-or-null',
  status: 'string',
  offeredOnTurn: 'integer',
  expiresOnTurn: 'integer',
  partyIds: 'list',
};

const partyFields: Shape<Party> = {
  id: 'string',
  questId: 'string',
  guildId: 'string',
  heroIds: 'list',
  departedOnTurn: 'integer',
  returnsOnTurn: 'integer',
};

const offerFields: Shape<TransferOffer> = {
  id: 'string',
  kind: 'string',
  fromGuildId: 'string',
  toGuildId: 'string',
  heroId: 'string',
  fee: 'number',
  offeredOnTurn: 'integer',
  expiresOnTurn: 'integer',
};

const itemFields: Shape<UniqueItem> = { id: 'string', definitionKey: 'string', holder: 'map' };

const stackFields: Shape<Stack> = { id: 'string', definitionKey: 'string', quantity: 'integer', holder: 'map' };

const rowFields: Record<TableName, Record<string, FieldKind>> = {
  guilds: guildFields,
  guildmasters: guildmasterFields,
  heroes: heroFields,
  patrons: patronFields,
  quests: questFields,
  parties: partyFields,
  offers: offerFields,
  items: itemFields,
  stacks: stackFields,
};

/** Which holders each table's rows may have (data-model §3.3), and the fields each kind carries. */
const holderKinds = {
  items: ['hero', 'guild', 'party'],
  stacks: ['hero', 'guild', 'party', 'market'],
} as const;

const holderFields: Record<string, Record<string, FieldKind>> = {
  hero: { id: 'string', slot: 'string' },
  guild: { id: 'string' },
  party: { id: 'string' },
  market: {},
};

type Path = (string | number)[];

/**
 * Every section, table, row and History entry is a plain object with each field of its
 * interface, of the right kind; every list and map a later check walks is one. A field no
 * interface names is kept and ignored (rule 5). Enumerated values and ranges are not checked.
 */
function documentShape(document: unknown): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const fail = (path: Path, detail: string): void => {
    failures.push({ check: 'document-shape', id: formatPath(path), detail });
  };

  /** True when `value` is a map with every field of `shape`; reports each field that is not. */
  const fields = (value: unknown, shape: Record<string, FieldKind>, path: Path): value is Record<string, unknown> => {
    if (!isMap(value)) {
      fail(path, `${formatPath(path)} is not an object`);
      return false;
    }
    const before = failures.length;
    for (const [field, kind] of Object.entries(shape)) {
      const at = [...path, field];
      if (!Object.hasOwn(value, field)) fail(at, `${formatPath(path)} has no ${field}`);
      else if (!kindTests[kind](value[field])) fail(at, `${formatPath(at)} is not ${kind}`);
    }
    return failures.length === before;
  };

  /** The parts of a row a later check walks below its fields: a holder, a Quest's demands. */
  const rowParts = (table: TableName, id: string, row: Record<string, unknown>): void => {
    if (table === 'items' || table === 'stacks') {
      const path = ['world', table, id, 'holder'];
      const holder = row.holder as Record<string, unknown>;
      const kinds: readonly unknown[] = holderKinds[table];
      if (typeof holder.kind === 'string' && kinds.includes(holder.kind)) {
        fields(holder, holderFields[holder.kind] ?? {}, path);
      } else {
        fail([...path, 'kind'], `A holder in ${table} is one of ${kinds.join(', ')}, not ${q(holder.kind)}`);
      }
    }
    if (table === 'quests') {
      (row.demands as unknown[]).forEach((demand, index) => {
        const path = ['world', table, id, 'demands', index];
        if (!Array.isArray(demand)) fail(path, `${formatPath(path)} is not a [Stat key, weight] pair`);
      });
    }
  };

  /** Reports each value of the index at `path` that is not a list. */
  const lists = (index: unknown, path: Path): void => {
    for (const [key, value] of Object.entries(index as Record<string, unknown>)) {
      if (!Array.isArray(value)) fail([...path, key], `${formatPath([...path, key])} is not a list`);
    }
  };

  if (!fields(document, documentFields, [])) return failures;
  const { meta, world, history } = document;
  fields(meta, metaFields, ['meta']);
  if (fields(world, worldFields, ['world'])) {
    for (const table of tableNames) {
      for (const [id, row] of Object.entries(world[table] as Record<string, unknown>)) {
        if (fields(row, rowFields[table], ['world', table, id])) rowParts(table, id, row);
      }
    }
  }
  if (fields(history, historyFields, ['history'])) {
    (history.entries as unknown[]).forEach((entry, index) => fields(entry, entryFields, ['history', 'entries', index]));
    lists(history.byEntity, ['history', 'byEntity']);
    lists(history.byType, ['history', 'byType']);
  }
  return failures;
}

// ── Ids and counters ─────────────────────────────────────────────────────────────────────────

/** Whether `map` has `key` as its own property, so `constructor` or `__proto__` never match. */
function has(map: object, key: unknown): boolean {
  return typeof key === 'string' && Object.hasOwn(map, key);
}

/** The row under `id`, read as an own property; `undefined` when the table has none. */
function rowOf<Row>(table: Record<string, Row>, id: unknown): Row | undefined {
  return has(table, id) ? table[id as string] : undefined;
}

const q = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The tables whose rows hold a Regard map. */
const regardTables = ['guilds', 'guildmasters', 'heroes', 'patrons'] as const;

/**
 * Every id is `<table>-<six digits>` (data-model §3.1): each table's keys with its own prefix,
 * each row's `id` equal to its key, each Regard key, each History participant and `byEntity` key.
 */
function idFormat({ world, history }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const fail = (id: string, detail: string): void => {
    failures.push({ check: 'id-format', id, detail });
  };

  for (const table of tableNames) {
    for (const [key, row] of Object.entries(world[table])) {
      if (!isId(table, key)) fail(key, `${q(key)} in ${table} is not an id of that table, <prefix>-<six digits>`);
      else if (row.id !== key) fail(key, `The row under ${key} has id ${q(row.id)}`);
    }
  }
  for (const table of regardTables) {
    for (const [key, row] of Object.entries(world[table])) {
      for (const entityId of Object.keys(row.regard)) {
        if (parseId(entityId) === null) fail(key, `${key} holds Regard for ${q(entityId)}, which is not an id`);
      }
    }
  }
  history.entries.forEach((entry, index) => {
    entry.participants.forEach((participant: unknown, at) => {
      if (typeof participant !== 'string' || parseId(participant) === null) {
        const path = formatPath(['history', 'entries', index, 'participants', at]);
        fail(path, `${path} is ${q(participant)}, not an id`);
      }
    });
  });
  for (const key of Object.keys(history.byEntity)) {
    const path = formatPath(['history', 'byEntity', key]);
    if (parseId(key) === null) fail(path, `The History indexes ${q(key)}, which is not an id`);
  }
  return failures;
}

/**
 * Each table's counter, the next id number, is a whole number no greater than 999,999 and above
 * every id of its table in use, in the tables or in the History, so no id is ever reused.
 */
function counterRange({ world, history }: WorldDocument): ValidationFailure[] {
  const highest = new Map<TableName, { n: number; id: string }>();
  const note = (id: string): void => {
    const parsed = parseId(id);
    if (parsed === null || parsed.n <= (highest.get(parsed.table)?.n ?? -1)) return;
    highest.set(parsed.table, { n: parsed.n, id });
  };
  // A key filed under another table is id-format's to report, not a use of that table's ids.
  for (const table of tableNames) for (const id of Object.keys(world[table])) if (isId(table, id)) note(id);
  for (const id of Object.keys(history.byEntity)) note(id);

  const failures: ValidationFailure[] = [];
  for (const table of tableNames) {
    const path = formatPath(['world', 'counters', table]);
    const counter: unknown = world.counters[table];
    const top = highest.get(table);
    let detail: string | null = null;
    if (!has(world.counters, table) || !Number.isSafeInteger(counter) || (counter as number) < 0) {
      detail = `The ${table} counter is ${q(counter)}, not a whole number`;
    } else if ((counter as number) > maxIdNumber) {
      detail = `The ${table} counter is ${counter as number}, past ${maxIdNumber}`;
    } else if (top !== undefined && (counter as number) <= top.n) {
      detail = `The ${table} counter is ${counter as number}, but ${top.id} is in use: the next id would repeat one`;
    }
    if (detail !== null) failures.push({ check: 'counter-range', id: path, detail });
  }
  return failures;
}

// ── References between rows ──────────────────────────────────────────────────────────────────

/** Each table a holder kind names. */
const holderTables = { hero: 'heroes', guild: 'guilds', party: 'parties' } as const satisfies Record<string, TableName>;

/** Every id a row holds names a row of the right table; so does every Quest on the Board. */
function danglingReference({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const expect = (holderId: string, field: string, table: TableName, id: unknown): void => {
    if (!has(world[table], id)) {
      failures.push({
        check: 'dangling-reference',
        id: holderId,
        detail: `${holderId}'s ${field} names ${q(id)}, which is not in ${table}`,
      });
    }
  };
  const all = (holderId: string, field: string, table: TableName, ids: readonly unknown[]): void => {
    for (const id of ids) expect(holderId, field, table, id);
  };

  for (const [key, guild] of Object.entries(world.guilds)) {
    expect(key, 'guildmasterId', 'guildmasters', guild.guildmasterId);
    all(key, 'rosterIds', 'heroes', guild.rosterIds);
  }
  for (const [key, guildmaster] of Object.entries(world.guildmasters)) {
    expect(key, 'guildId', 'guilds', guildmaster.guildId);
  }
  for (const [key, hero] of Object.entries(world.heroes)) {
    if (hero.guildId !== null) expect(key, 'guildId', 'guilds', hero.guildId);
    if (hero.partyId !== null) expect(key, 'partyId', 'parties', hero.partyId);
  }
  for (const [key, quest] of Object.entries(world.quests)) {
    expect(key, 'patronId', 'patrons', quest.patronId);
    all(key, 'partyIds', 'parties', quest.partyIds);
  }
  for (const [key, party] of Object.entries(world.parties)) {
    expect(key, 'questId', 'quests', party.questId);
    expect(key, 'guildId', 'guilds', party.guildId);
    all(key, 'heroIds', 'heroes', party.heroIds);
  }
  for (const [key, offer] of Object.entries(world.offers)) {
    expect(key, 'fromGuildId', 'guilds', offer.fromGuildId);
    expect(key, 'toGuildId', 'guilds', offer.toGuildId);
    expect(key, 'heroId', 'heroes', offer.heroId);
  }
  for (const [key, { holder }] of heldRows(world)) {
    if (holder.kind !== 'market') expect(key, 'holder', holderTables[holder.kind], holder.id);
  }
  for (const table of regardTables) {
    for (const [key, row] of Object.entries(world[table])) {
      for (const entityId of Object.keys(row.regard)) {
        // An id of no table is id-format's to report.
        const parsed = parseId(entityId);
        if (parsed !== null) expect(key, 'regard', parsed.table, entityId);
      }
    }
  }
  all(formatPath(['world', 'board']), 'Board', 'quests', world.board);
  return failures;
}

/** The unique Items and the stacks, each under its key. */
function heldRows(world: World): [key: string, row: UniqueItem | Stack][] {
  return [...Object.entries(world.items), ...Object.entries(world.stacks)];
}

/** The ids listed more than once across `lists`, each with the owners of the lists naming it. */
function listedTwice(lists: Iterable<[owner: string, ids: readonly string[]]>): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const [owner, ids] of lists) {
    for (const id of ids) {
      const found = owners.get(id);
      if (found === undefined) owners.set(id, [owner]);
      else found.push(owner);
    }
  }
  return new Map([...owners].filter(([, found]) => found.length > 1));
}

/** No Hero is on two Rosters, nor twice on one. */
function heroOnTwoRosters({ world }: WorldDocument): ValidationFailure[] {
  const twice = listedTwice(Object.entries(world.guilds).map(([key, guild]) => [key, guild.rosterIds]));
  return [...twice].map(([heroId, guildIds]) => ({
    check: 'hero-on-two-rosters',
    id: heroId,
    detail: `${heroId} is on the Rosters of ${guildIds.join(', ')}`,
  }));
}

/**
 * A Hero on a Roster has that Guild as `guildId`; and a living, unretired Hero with a `guildId`
 * is on that Guild's Roster (a dead or retired Hero leaves the Roster and keeps it).
 */
function rosterGuildMismatch({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [guildId, guild] of Object.entries(world.guilds)) {
    for (const heroId of guild.rosterIds) {
      const hero = rowOf(world.heroes, heroId);
      if (hero !== undefined && hero.guildId !== guildId) {
        failures.push({
          check: 'roster-guild-mismatch',
          id: heroId,
          detail: `${heroId} is on ${guildId}'s Roster but has guildId ${q(hero.guildId)}`,
        });
      }
    }
  }
  for (const [heroId, hero] of Object.entries(world.heroes)) {
    if (hero.guildId === null || hero.diedOnTurn !== null || hero.retiredOnTurn !== null) continue;
    const guild = rowOf(world.guilds, hero.guildId);
    if (guild !== undefined && !guild.rosterIds.includes(heroId as HeroId)) {
      failures.push({
        check: 'roster-guild-mismatch',
        id: heroId,
        detail: `${heroId} has guildId ${hero.guildId} but is not on its Roster`,
      });
    }
  }
  return failures;
}

/**
 * A Hero's pool fields agree with their Guild (DL-27): a Hero with a Guild has neither
 * `unattachedSince` nor `leftPoolOnTurn`; a Hero with none is in the pool (`unattachedSince`) or
 * gone from play (`leftPoolOnTurn`, `diedOnTurn` or `retiredOnTurn`), never both, never neither.
 */
function unattachedMismatch({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [heroId, hero] of Object.entries(world.heroes)) {
    const inPool = hero.unattachedSince !== null;
    const gone = hero.leftPoolOnTurn !== null || hero.diedOnTurn !== null || hero.retiredOnTurn !== null;
    let detail: string | undefined;
    if (hero.guildId !== null && (inPool || hero.leftPoolOnTurn !== null)) {
      const fields = `unattachedSince ${q(hero.unattachedSince)}, leftPoolOnTurn ${q(hero.leftPoolOnTurn)}`;
      detail = `${heroId} has guildId ${hero.guildId}, so neither pool field, but ${fields}`;
    } else if (hero.guildId === null && inPool === gone) {
      detail = inPool
        ? `${heroId} is in the Unattached pool but has left play`
        : `${heroId} has no Guild, is not in the Unattached pool and has not left play`;
    }
    if (detail !== undefined) failures.push({ check: 'unattached-mismatch', id: heroId, detail });
  }
  return failures;
}

/** No Hero is in two Parties, nor twice in one. */
function heroInTwoParties({ world }: WorldDocument): ValidationFailure[] {
  const twice = listedTwice(Object.entries(world.parties).map(([key, party]) => [key, party.heroIds]));
  return [...twice].map(([heroId, partyIds]) => ({
    check: 'hero-in-two-parties',
    id: heroId,
    detail: `${heroId} is in the Parties ${partyIds.join(', ')}`,
  }));
}

/** `hero.partyId` and `party.heroIds` agree, as `quest.partyIds` and `party.questId` must. */
function partyMemberMismatch({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [partyId, party] of Object.entries(world.parties)) {
    for (const heroId of party.heroIds) {
      const hero = rowOf(world.heroes, heroId);
      if (hero !== undefined && hero.partyId !== partyId) {
        failures.push({
          check: 'party-member-mismatch',
          id: heroId,
          detail: `${partyId} lists ${heroId}, whose partyId is ${q(hero.partyId)}`,
        });
      }
    }
  }
  for (const [heroId, hero] of Object.entries(world.heroes)) {
    const party = rowOf(world.parties, hero.partyId);
    if (party !== undefined && !party.heroIds.includes(heroId as HeroId)) {
      failures.push({
        check: 'party-member-mismatch',
        id: heroId,
        detail: `${heroId} has partyId ${party.id}, which does not list them`,
      });
    }
  }
  return failures;
}

/** The Guildmaster a Guild names has that Guild as `guildId`. */
function guildmasterGuildMismatch({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [guildId, guild] of Object.entries(world.guilds)) {
    const guildmaster = rowOf(world.guildmasters, guild.guildmasterId);
    if (guildmaster !== undefined && guildmaster.guildId !== guildId) {
      failures.push({
        check: 'guildmaster-guild-mismatch',
        id: guild.guildmasterId,
        detail: `${guildId} names ${guild.guildmasterId} as Guildmaster, whose guildId is ${q(guildmaster.guildId)}`,
      });
    }
  }
  return failures;
}

/** `quest.partyIds` and `party.questId` agree (data-model §3.2). */
function questPartyMismatch({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [questId, quest] of Object.entries(world.quests)) {
    for (const partyId of quest.partyIds) {
      const party = rowOf(world.parties, partyId);
      if (party !== undefined && party.questId !== questId) {
        failures.push({
          check: 'quest-party-mismatch',
          id: questId,
          detail: `${questId} lists ${partyId}, whose questId is ${q(party.questId)}`,
        });
      }
    }
  }
  for (const [partyId, party] of Object.entries(world.parties)) {
    const quest = rowOf(world.quests, party.questId);
    if (quest !== undefined && !quest.partyIds.includes(partyId as PartyId)) {
      failures.push({
        check: 'quest-party-mismatch',
        id: partyId,
        detail: `${partyId} has questId ${party.questId}, which does not list it`,
      });
    }
  }
  return failures;
}

/** No Quest has more Parties than the build allows: one, in the first build. */
function tooManyParties({ world }: WorldDocument): ValidationFailure[] {
  return Object.entries(world.quests)
    .filter(([, quest]) => quest.partyIds.length > maxPartiesPerQuest)
    .map(([questId, quest]) => ({
      check: 'too-many-parties',
      id: questId,
      detail: `${questId} has ${quest.partyIds.length} Parties; the build allows ${maxPartiesPerQuest}`,
    }));
}

/** One stack per definition, holder and slot (data-model §3.3). */
function duplicateStack({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const first = new Map<string, string>();
  for (const [stackId, { definitionKey, holder }] of Object.entries(world.stacks)) {
    const where: string[] = [holder.kind];
    if (holder.kind !== 'market') where.push(holder.id);
    if (holder.kind === 'hero') where.push(holder.slot);
    const signature = JSON.stringify([definitionKey, ...where]);
    const earlier = first.get(signature);
    if (earlier === undefined) first.set(signature, stackId);
    else {
      failures.push({
        check: 'duplicate-stack',
        id: stackId,
        detail: `${stackId} and ${earlier} are both ${definitionKey} held by ${where.join(' ')}`,
      });
    }
  }
  return failures;
}

/** An offer's Hero is on the Roster of the Guild it would take them from. */
function offerHeroNotOnRoster({ world }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const [offerId, offer] of Object.entries(world.offers)) {
    const from = rowOf(world.guilds, offer.fromGuildId);
    if (from !== undefined && !from.rosterIds.includes(offer.heroId)) {
      failures.push({
        check: 'offer-hero-not-on-roster',
        id: offerId,
        detail: `${offerId} is for ${offer.heroId}, who is not on ${offer.fromGuildId}'s Roster`,
      });
    }
  }
  return failures;
}

/** No offer is past its expiry: it is live through `expiresOnTurn` and removed that night. */
function offerExpired({ world }: WorldDocument): ValidationFailure[] {
  return Object.entries(world.offers)
    .filter(([, offer]) => offer.expiresOnTurn < world.turn)
    .map(([offerId, offer]) => ({
      check: 'offer-expired',
      id: offerId,
      detail: `${offerId} expired on Turn ${offer.expiresOnTurn}; the world is at Turn ${world.turn}`,
    }));
}

// ── The History ──────────────────────────────────────────────────────────────────────────────

/** One index list: a `byEntity` or `byType` list under its key, or the Milestones. */
interface IndexList {
  index: 'byEntity' | 'byType' | 'milestones';
  key: string;
  path: string;
  positions: readonly unknown[];
}

function indexLists(history: History): IndexList[] {
  const lists = (index: 'byEntity' | 'byType', map: Record<string, number[]>): IndexList[] =>
    Object.entries(map).map(([key, positions]) => {
      const path = formatPath(['history', index, key]);
      return { index, key, path, positions };
    });
  return [
    ...lists('byEntity', history.byEntity),
    ...lists('byType', history.byType),
    { index: 'milestones', key: '', path: formatPath(['history', 'milestones']), positions: history.milestones },
  ];
}

function isPosition(history: History, position: unknown): position is number {
  return Number.isSafeInteger(position) && (position as number) >= 0 && (position as number) < history.entries.length;
}

/** Every position in an index is a position in `entries` (data-model §6). */
function historyPositionOutOfRange({ history }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const { path, positions } of indexLists(history)) {
    positions.forEach((position, index) => {
      if (!isPosition(history, position)) {
        failures.push({
          check: 'history-position-out-of-range',
          id: `${path}[${index}]`,
          detail: `${path}[${index}] is ${q(position)}; the History has ${history.entries.length} entries`,
        });
      }
    });
  }
  return failures;
}

/**
 * The indexes agree with the entries, cheaply: each list ascends strictly and points at entries
 * of its entity, type or Milestone flag, and the lists' lengths account for every entry, so no
 * entry is missing from an index. Positions outside `entries` are the previous check's.
 */
function historyIndexMismatch({ history }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const fail = (id: string, detail: string): void => {
    failures.push({ check: 'history-index-mismatch', id, detail });
  };
  const { entries, byEntity, byType, milestones } = history;
  const belongs = ({ index, key }: IndexList, entry: Entry): boolean => {
    if (index === 'byEntity') return (entry.participants as readonly string[]).includes(key);
    if (index === 'byType') return entry.type === key;
    return entry.milestone;
  };

  for (const list of indexLists(history)) {
    const { path } = list;
    let previous = -1;
    for (const position of list.positions) {
      if (!isPosition(history, position)) continue;
      const entry = entries[position] as Entry;
      if (position <= previous) {
        fail(path, `${path} does not ascend strictly: ${position} follows ${previous}`);
        break;
      }
      if (!belongs(list, entry)) {
        fail(path, `${path} holds ${position}, a ${entry.type} entry that does not belong there`);
        break;
      }
      previous = position;
    }
  }

  const sum = (lists: Record<string, readonly unknown[]>): number =>
    Object.values(lists).reduce((total, positions) => total + positions.length, 0);
  const participantsIndexed = entries.reduce(
    (total, entry) => total + entry.participants.filter((id, at) => entry.participants.indexOf(id) === at).length,
    0,
  );
  const milestoneCount = entries.filter((entry) => entry.milestone).length;
  if (sum(byType) !== entries.length) {
    fail('$.history.byType', `byType holds ${sum(byType)} positions for ${entries.length} entries`);
  }
  if (sum(byEntity) !== participantsIndexed) {
    fail('$.history.byEntity', `byEntity holds ${sum(byEntity)} positions for ${participantsIndexed} participations`);
  }
  if (milestones.length !== milestoneCount) {
    fail('$.history.milestones', `milestones holds ${milestones.length} positions for ${milestoneCount} Milestones`);
  }
  return failures;
}

/** Entries arrive in Turn order, which `entriesBetween` relies on, and none is after `world.turn`. */
function historyTurnOrder({ world, history }: WorldDocument): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  let previous = 0;
  history.entries.forEach(({ turn }, index) => {
    const id = formatPath(['history', 'entries', index]);
    let detail: string | null = null;
    if (turn < 0) detail = `${id} is at Turn ${turn}, before Turn 0`;
    else if (turn < previous) detail = `${id} is at Turn ${turn}, after an entry at Turn ${previous}`;
    else if (turn > world.turn) detail = `${id} is at Turn ${turn}; the world is at Turn ${world.turn}`;
    if (detail !== null) failures.push({ check: 'history-turn-order', id, detail });
    previous = Math.max(previous, turn);
  });
  return failures;
}

/**
 * Rule 8: a Hero's row is removed only when nothing but the passive entries names them. Quests,
 * Parties, offers and stacks are removed while the History keeps their ids; that is not refused.
 */
function removedHeroInHistory({ world, history }: WorldDocument): ValidationFailure[] {
  const passive = new Set<string>(passiveEntryTypes);
  const failures: ValidationFailure[] = [];
  for (const [id, positions] of Object.entries(history.byEntity)) {
    if (!isId('heroes', id) || has(world.heroes, id)) continue;
    const named = positions
      .map((position) => (isPosition(history, position) ? history.entries[position] : undefined))
      .find((entry) => entry !== undefined && !passive.has(entry.type));
    if (named !== undefined) {
      failures.push({
        check: 'removed-hero-in-history',
        id,
        detail: `${id} has no row, but a ${named.type} entry at Turn ${named.turn} names them`,
      });
    }
  }
  return failures;
}

// ── Content keys (rule 5): warnings ──────────────────────────────────────────────────────────

/**
 * One warning check's list, and `known`, which adds a warning unless `table` has a row keyed
 * `key` (owned by `owner`, for a table whose rows have owners). `field` says where `id` holds it.
 */
function keyWarnings(check: WarningCheck, what: string) {
  const warnings: ValidationWarning[] = [];
  const known = (id: string, field: string, table: object, key: unknown, owner?: string): void => {
    const row: unknown = has(table, key) ? (table as Record<string, unknown>)[key as string] : undefined;
    if (row !== undefined && (owner === undefined || (row as { owner?: unknown }).owner === owner)) return;
    const detail = `${id}'s ${field} names ${q(key)}, which the content does not define as ${what}`;
    warnings.push({ check, id, key: String(key), detail });
  };
  return { warnings, known };
}

/** Hero Stats on Heroes and in Quest demands; Guildmaster Stats on Guildmasters. */
function unknownStat({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-stat', 'a Stat of its owner');
  for (const [id, hero] of Object.entries(world.heroes)) {
    for (const key of Object.keys(hero.stats)) known(id, 'stats', content.stats, key, 'hero');
    for (const key of Object.keys(hero.potential)) known(id, 'potential', content.stats, key, 'hero');
  }
  for (const [id, guildmaster] of Object.entries(world.guildmasters)) {
    for (const key of Object.keys(guildmaster.stats)) known(id, 'stats', content.stats, key, 'guildmaster');
  }
  for (const [id, quest] of Object.entries(world.quests)) {
    for (const [key] of quest.demands) known(id, 'demands', content.stats, key, 'hero');
  }
  return warnings;
}

function unknownClass({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-class', 'a Class');
  for (const [id, hero] of Object.entries(world.heroes)) known(id, 'classKey', content.classes, hero.classKey);
  for (const [id, { requirements }] of Object.entries(world.quests)) {
    if (requirements.classKey !== undefined) known(id, 'requirements', content.classes, requirements.classKey);
  }
  return warnings;
}

function unknownSkill({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-skill', 'a Skill');
  for (const [id, hero] of Object.entries(world.heroes)) {
    for (const key of Object.keys(hero.skills)) known(id, 'skills', content.skills, key);
  }
  for (const [id, quest] of Object.entries(world.quests)) {
    for (const key of quest.skillKeys) known(id, 'skillKeys', content.skills, key);
    const { skillKey } = quest.requirements;
    if (skillKey !== undefined) known(id, 'requirements', content.skills, skillKey);
  }
  return warnings;
}

function unknownTrait({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-trait', 'a Trait of its owner');
  for (const [id, hero] of Object.entries(world.heroes)) {
    for (const key of hero.traits) known(id, 'traits', content.traits, key, 'hero');
  }
  for (const [id, guildmaster] of Object.entries(world.guildmasters)) {
    for (const key of guildmaster.traits) known(id, 'traits', content.traits, key, 'guildmaster');
  }
  return warnings;
}

function unknownBackground({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-background', 'a Background of its owner');
  for (const [id, hero] of Object.entries(world.heroes)) {
    known(id, 'backgroundKey', content.backgrounds, hero.backgroundKey, 'hero');
  }
  for (const [id, guild] of Object.entries(world.guilds)) {
    known(id, 'backgroundKey', content.backgrounds, guild.backgroundKey, 'guild');
  }
  return warnings;
}

function unknownSphere({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-sphere', 'a Sphere');
  for (const [id, patron] of Object.entries(world.patrons)) known(id, 'sphereKey', content.spheres, patron.sphereKey);
  return warnings;
}

/**
 * A content table a later milestone adds to `ContentSet`: Quest templates (M2-S3), Dispositions
 * (M2-S9) and Item definitions (M5-S1). Until content carries one under this name it defines no
 * such key, and every one warns, as §6 says (DL-20).
 */
function laterTable(content: ContentSet, name: 'questTemplates' | 'dispositions' | 'items'): object {
  const table: unknown = Reflect.get(content, name);
  return isMap(table) ? table : {};
}

/** A Rival's Disposition (M2-S9). The player's Guild names none. */
function unknownDisposition({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-disposition', 'a Disposition');
  const dispositions = laterTable(content, 'dispositions');
  for (const [id, guild] of Object.entries(world.guilds)) {
    const disposition = dispositionOf(guild);
    if (disposition !== null) known(id, 'controller', dispositions, disposition);
  }
  return warnings;
}

function unknownItem({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-item', 'an Item');
  const items = laterTable(content, 'items');
  for (const [id, row] of heldRows(world)) known(id, 'definitionKey', items, row.definitionKey);
  return warnings;
}

function unknownTemplate({ world }: WorldDocument, content: ContentSet): ValidationWarning[] {
  const { warnings, known } = keyWarnings('unknown-template', 'a Quest template');
  const templates = laterTable(content, 'questTemplates');
  for (const [id, quest] of Object.entries(world.quests)) known(id, 'templateKey', templates, quest.templateKey);
  return warnings;
}
