// The World State document (data-model.md §1–§4 and the §8 type sketch): one JSON document in
// three sections with different lifecycles. `meta` is written at creation; `world` is copied
// once per Turn and mutated; `history` is append-only and shared by reference (ADR-0008).
//
// These types are the truth now that they exist (data-model.md, preamble). document.test.ts
// reads data-model.md and holds every row type to its field list, so a change to one side
// that is not made to the other fails the tests.
//
// Every value in the document is JSON-safe (data-model rule 6; see json-safe.ts). Rows
// reference other rows by id only and never embed one.

import type { GameConfig } from './config.js';
import type {
  BackgroundKey,
  ClassKey,
  ContentRef,
  DispositionKey,
  EncounterKey,
  InjuryTypeKey,
  ItemDefinitionKey,
  LootTableKey,
  PortraitKey,
  QuestTagKey,
  QuestTemplateKey,
  SkillKey,
  SlotKey,
  SphereKey,
  StatKey,
  TraitKey,
} from './content-types.js';
import type { RngState, StreamName } from './rng.js';

// ── Ids (data-model §3.1) ────────────────────────────────────────────────────────────────────

/** The tables of `world`, each a plain object of rows keyed by id (data-model §3.2, §3.3). */
export const tableNames = [
  'guilds',
  'guildmasters',
  'heroes',
  'patrons',
  'quests',
  'parties',
  'offers',
  'items',
  'stacks',
] as const;

export type TableName = (typeof tableNames)[number];

/** The prefix of each table's ids: `hero-000042`. */
export const idPrefixes = {
  guilds: 'guild',
  guildmasters: 'guildmaster',
  heroes: 'hero',
  patrons: 'patron',
  quests: 'quest',
  parties: 'party',
  offers: 'offer',
  items: 'item',
  stacks: 'stack',
} as const satisfies Record<TableName, string>;

/** Digits in every id's number, zero-padded, so that string order is numeric order. */
export const idDigits = 6;

/** The largest number an id can carry; the validator refuses a counter past it. */
export const maxIdNumber = 999_999;

/**
 * A string the compiler tells apart from other strings and from other tables' ids, at no
 * runtime cost: a `GuildId` is refused where a `HeroId` is expected.
 */
type Brand<Name extends string> = string & { readonly __brand: Name };

export type GuildId = Brand<'GuildId'>;
export type GuildmasterId = Brand<'GuildmasterId'>;
export type HeroId = Brand<'HeroId'>;
export type PatronId = Brand<'PatronId'>;
export type QuestId = Brand<'QuestId'>;
export type PartyId = Brand<'PartyId'>;
export type OfferId = Brand<'OfferId'>;
export type ItemId = Brand<'ItemId'>;
export type StackId = Brand<'StackId'>;

/** Each table's id type. */
export interface IdTypes {
  guilds: GuildId;
  guildmasters: GuildmasterId;
  heroes: HeroId;
  patrons: PatronId;
  quests: QuestId;
  parties: PartyId;
  offers: OfferId;
  items: ItemId;
  stacks: StackId;
}

export type IdOf<Table extends TableName> = IdTypes[Table];

/** Any row's id: what History participants and Regard maps are keyed by. */
export type EntityId = IdTypes[TableName];

/**
 * The id numbered `n` in `table`: `makeId('heroes', 42)` is `hero-000042`. Throws on a number
 * that is negative, not an integer or past 999,999: a programming error, not a rule violation.
 */
export function makeId<Table extends TableName>(table: Table, n: number): IdOf<Table> {
  const prefix: string | undefined = idPrefixes[table];
  if (prefix === undefined) throw new RangeError(`No table is named ${JSON.stringify(table)}`);
  if (!Number.isInteger(n) || n < 0 || n > maxIdNumber) {
    throw new RangeError(`An id number is an integer from 0 to ${maxIdNumber}; ${table} was given ${n}`);
  }
  return `${prefix}-${String(n).padStart(idDigits, '0')}` as IdOf<Table>;
}

/**
 * The next id of `table`, numbered by `world.counters`, advancing the counter so that no id is
 * ever issued twice (data-model §3.1). Throws past 999,999, as `makeId` does, before the counter
 * moves.
 */
export function takeId<Table extends TableName>(world: Pick<World, 'counters'>, table: Table): IdOf<Table> {
  const n = world.counters[table];
  const id = makeId(table, n);
  world.counters[table] = n + 1;
  return id;
}

const tableByPrefix = new Map<string, TableName>(tableNames.map((table) => [idPrefixes[table], table]));
const idPattern = /^([a-z]+)-(\d{6})$/;

/** The table and number of an id of the form `<prefix>-<six digits>`; `null` for anything else. */
export function parseId(value: string): { table: TableName; n: number } | null {
  const match = idPattern.exec(value);
  const table = match?.[1] === undefined ? undefined : tableByPrefix.get(match[1]);
  if (match?.[2] === undefined || table === undefined) return null;
  return { table, n: Number(match[2]) };
}

/** True when `value` is an id of `table`. */
export function isId<Table extends TableName>(table: Table, value: unknown): value is IdOf<Table> {
  return typeof value === 'string' && parseId(value)?.table === table;
}

/**
 * `Array.prototype.sort`'s default order for strings, UTF-16 code units, spelled out as a
 * comparator: what `unattachedHeroes` (`selectors.ts`) sorts ids by and the generators
 * (`generators/draw.ts`) sort content keys by, so that neither an id's issue order nor a
 * content file's row order changes what a draw picks or a selector returns.
 */
export function compareByCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── Row lookup ───────────────────────────────────────────────────────────────────────────────

/**
 * The row `rows` holds under `id`, read as an own property, so that a key of `Object.prototype`
 * (`constructor`, `__proto__`) reads as absent in a table built here or parsed from JSON; `undefined`
 * when the table has none (v1.1.6-S8, DL-186 item 26).
 */
export function rowOf<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/**
 * The row `rows` holds under `id`, which must be there: a programming error throws a `RangeError`,
 * "<id> is not in world.<table>" when `table` is given and "<id> is not in the world" when not.
 */
export function requireRow<Row>(rows: Readonly<Record<string, Row>>, id: string, table?: string): Row {
  const found = rowOf(rows, id);
  if (found === undefined) throw new RangeError(table === undefined ? `${id} is not in the world` : `${id} is not in world.${table}`);
  return found;
}

// ── Values shared by rows ────────────────────────────────────────────────────────────────────

/** An absolute Turn index from 0. Day and time of day are derived from it (data-model §3.1). */
export type Turn = number;

export type Sex = 'female' | 'male';

/** A module's id, chosen by the module; the key of its slice in `world.modules` (§3.4). */
export type ModuleId = string;

/** An event type, `<entity>.<what-happened>`: `hero.recruited`, `quest.resolved`. */
export type EventType = `${string}.${string}`;

/** The opinion one entity holds of another (data-model §3.2). Absence means neutral. */
export interface RegardEntry {
  value: number;
  since: Turn;
  /** A content key or an event type. */
  reason: string;
}

/** Wherever a `regard` map appears: the Regard this row holds for each entity it has one for. */
export type RegardMap = Record<EntityId, RegardEntry>;

/** Base Stat values by Stat key, as content defines the Stats (ADR-0006). */
export type StatValues = Record<StatKey, number>;

/** A Skill's rating; a Hero without the Skill has no entry for it. */
export type SkillRating = 1 | 2 | 3 | 4 | 5;
/** The Skill scale's ends, `SkillRating`'s least and greatest: the Hero generator's and `checkConfig`'s. */
export const lowestSkillRating = 1;
export const highestSkillRating = 5;

/** The Hall's facilities, each at a grade raised by Improvements (M3-S6). */
export const facilityKeys = ['infirmary', 'trainingYard', 'quarters'] as const;

export type FacilityKey = (typeof facilityKeys)[number];

/** A grade per facility. */
export type Hall = Record<FacilityKey, number>;

/** What makes a Guild's choices: the player, or a Rival's Disposition (ADR-0002). */
export type Controller = { kind: 'player' } | { kind: 'rival'; disposition: DispositionKey };

/** An Injury a Hero carries until `healsOnTurn`. */
export interface Injury {
  typeKey: InjuryTypeKey;
  healsOnTurn: Turn;
}

/**
 * What a Party must be to take a Quest: at least `partySizeMin` Heroes, with no greatest (DL-257
 * item 6, DL-266), and any Class and Skill it needs.
 */
export interface QuestRequirements {
  partySizeMin: number;
  classKey?: ClassKey;
  skillKey?: SkillKey;
}

export type QuestStatus = 'offered' | 'taken' | 'resolved';

/**
 * Who holds a unique Item or a common stack (data-model §3.3): a Hero in a gear slot, a Guild, a
 * Party, or the Market. The Market holds unique Items too, since a folded Guild's are listed there
 * (pre-M0 review D6, M5-S4, DL-48). `items.ts` compares and moves holders.
 */
export type Holder =
  | { kind: 'hero'; id: HeroId; slot: SlotKey }
  | { kind: 'guild'; id: GuildId }
  | { kind: 'party'; id: PartyId }
  | { kind: 'market' };

/** The kinds of holder. */
export type HolderKind = Holder['kind'];

/** Why the player-controlled Guild's game ended (M2-S10). */
export type EndingReason = 'retirement' | 'bankruptcy' | 'roster-wiped';

export interface Ending {
  turn: Turn;
  reason: EndingReason;
}

// ── Rows (data-model §3.2, §3.3) ─────────────────────────────────────────────────────────────

/** Upkeep is computed from the Roster and the Hall, not stored. */
export interface Guild {
  id: GuildId;
  name: string;
  backgroundKey: BackgroundKey;
  foundedTurn: Turn;
  guildmasterId: GuildmasterId;
  /** The Roster, ordered. */
  rosterIds: HeroId[];
  wealth: number;
  fame: number;
  /** Set while Wealth is below the Bankruptcy floor. */
  belowFloorSince: Turn | null;
  /** Set when the Guild reached an ending; it is then out of the Rankings. */
  foldedOnTurn: Turn | null;
  hall: Hall;
  controller: Controller;
  regard: RegardMap;
}

export interface Guildmaster {
  id: GuildmasterId;
  name: string;
  sex: Sex;
  /** Their Guild; a retired Guildmaster keeps it, as a dead or retired Hero keeps theirs. */
  guildId: GuildId;
  enteredTurn: Turn;
  ageAtEntry: number;
  stats: StatValues;
  traits: TraitKey[];
  /**
   * The descriptive Attributes (R8, DL-100 item 3, DL-102): texts no rule reads, which the player
   * may write for their Guildmaster at setup, stored trimmed; each left blank, for every Guildmaster,
   * is written from content as they enter play (`describeBlanks`, DL-125 item 6, DL-132). At most
   * `descriptiveAttributeMaxLength` characters each.
   */
  birthplace: string;
  appearance: string;
  biography: string;
  /**
   * The picture the Guildmaster's Portrait shows (DL-125 item 3): a Guildmaster picture of their sex
   * in content, the player's choice at setup, else chosen to fit them on `gm-portraits` as they enter
   * play, as every Rival's Guildmaster's is (`givePortrait`; DL-134 item 5, DL-144); `null` for the
   * Silhouette of their sex, where none fits or every one that fits is in use.
   */
  portraitKey: PortraitKey | null;
  /**
   * The Turn the Guildmaster retired and was succeeded (DL-100 item 3); `null` while in office. A
   * retired Guildmaster keeps their row and History, and no Guild in play names them (M9-S2).
   */
  retiredOnTurn: Turn | null;
  regard: RegardMap;
}

/** A Guildmaster's descriptive Attributes, in the order a front end shows them (R8, DL-100 item 3). */
export const descriptiveAttributes = ['birthplace', 'appearance', 'biography'] as const;

export type DescriptiveAttribute = (typeof descriptiveAttributes)[number];

/**
 * The most characters (Unicode code points) each descriptive Attribute holds once trimmed (M9-S2,
 * DL-102): a place's name, a few sentences, a short paragraph. A limit of the stored row, not a
 * balance number, so a constant and not a `GameConfig` field; the setup check refuses a longer text.
 */
export const descriptiveAttributeMaxLength: Readonly<Record<DescriptiveAttribute, number>> = Object.freeze({
  birthplace: 60,
  appearance: 280,
  biography: 1000,
});

/**
 * Each descriptive Attribute's name, as `CONTEXT.md` gives it and both front ends show it beside the
 * text: a name of the engine's own field, not a sentence, which no rule reads (the M9 review).
 */
export const descriptiveAttributeLabels: Readonly<Record<DescriptiveAttribute, string>> = Object.freeze({
  birthplace: 'Birthplace',
  appearance: 'Appearance',
  biography: 'Biography',
});

/** A Hero's gear is not on the Hero: it is the Items, unique or a stack of one, whose holder is this Hero in a slot. */
export interface Hero {
  id: HeroId;
  name: string;
  sex: Sex;
  backgroundKey: BackgroundKey;
  classKey: ClassKey;
  /** With `ageAtEntry`: age now = ageAtEntry + (turn − enteredTurn) / turnsPerYear. */
  enteredTurn: Turn;
  ageAtEntry: number;
  /** `null` means on no Roster: in the Unattached pool, or gone from it (`leftPoolOnTurn`). */
  guildId: GuildId | null;
  /**
   * The Turn the Hero last entered the Unattached pool; `null` on a Roster and once they have
   * left the pool. The pool is the Heroes for whom it is set (DL-27).
   */
  unattachedSince: Turn | null;
  /**
   * Set when the Hero left the pool unrecruited and a History entry kept their row (rule 8):
   * then on no Roster and in no pool, out of play (DL-27).
   */
  leftPoolOnTurn: Turn | null;
  partyId: PartyId | null;
  /** Base values only; effective Stats are a selector (data-model rule 1). */
  stats: StatValues;
  /** The hidden ceiling per Stat, stored plainly; the front end does not show it (rule 9). */
  potential: StatValues;
  skills: Record<SkillKey, SkillRating>;
  traits: TraitKey[];
  xp: number;
  level: number;
  injury: Injury | null;
  morale: number;
  /** From 0, rested, to `fatigueMax`; 0 for a Hero generated, moved only by the Hero State Engine's night (DL-282). */
  fatigue: number;
  diedOnTurn: Turn | null;
  retiredOnTurn: Turn | null;
  /**
   * The Turn of the Hero's last Transfer between two Guilds' Rosters; `null` for a Hero never
   * transferred. Within `transferLockDays` of it no Transfer moves them again (DL-60).
   */
  transferredOnTurn: Turn | null;
  /**
   * The picture the Hero's Portrait shows (v1.1.3-S6, DL-135 items 3 and 4): a Hero picture of their
   * sex and Class in content, chosen to fit them as they are generated, on `hero-portraits`; `null` for
   * the Silhouette of their sex, as every Hero has while content lists no Hero picture.
   */
  portraitKey: PortraitKey | null;
  /**
   * A Hero's two descriptive Attributes (v1.1.3-S6, DL-135 item 6): texts no rule reads, written as they
   * are generated, on `hero-descriptions`, and never edited, since the player sets up no Hero. The
   * Appearance is their picture's narrative, or drawn from the phrases by sex and age band; the
   * Biography is written from their Background, their Class at their band and their Traits, and their
   * picture's Temper and hooks where they have one. At most `descriptiveAttributeMaxLength` characters each.
   * A Hero has no Birthplace: their Background says where they are from.
   */
  appearance: string;
  biography: string;
  regard: RegardMap;
}

/**
 * A Patron's Quest templates are looked up by `sphereKey` in content at draw time, never
 * stored (pre-M0 review D3).
 */
export interface Patron {
  id: PatronId;
  name: string;
  /**
   * The sex that came with the Patron's name (v1.1.2-S3, DL-125 item 5); `null` is kept for a Patron
   * that is a body, which shows an emblem of its Sphere, and none is drawn yet.
   */
  sex: Sex | null;
  sphereKey: SphereKey;
  regard: RegardMap;
}

/**
 * The fields copied from the template at generation make a Quest self-contained: a template
 * may change under a live save without altering Quests already offered, but for its overrides of the
 * Tier's XP factor, Death scale and Fame minimum, read live (`tierFigures`; DL-262, DL-264, DL-265).
 * A Quest row is removed when it expires or resolves; the History keeps its record.
 */
export interface Quest {
  id: QuestId;
  templateKey: QuestTemplateKey;
  patronId: PatronId;
  /** The Tier of the ladder it was drawn at, from 1 (DL-257 item 1, DL-262). */
  tier: number;
  /** Drawn inside its Tier's difficulty band. */
  difficulty: number;
  tags: QuestTagKey[];
  reward: number;
  fameEffect: number;
  /** Its Days away × 3, at the place in its Tier's days its difficulty has in its band (DL-262). */
  durationTurns: number;
  /** The template's Skills, kept with the row; the Checks read their Encounters' Skills (DL-42, DL-248). */
  skillKeys: SkillKey[];
  /** Drawn at generation, in the order met: one or more, which the validator holds (DL-248). */
  encounterKeys: EncounterKey[];
  /** Each Encounter's Beat's line, or its Finale's, beside it: as many as `encounterKeys` (DL-262). */
  beatLines: string[];
  requirements: QuestRequirements;
  lootTableKey: LootTableKey | null;
  status: QuestStatus;
  offeredOnTurn: Turn;
  expiresOnTurn: Turn;
  /** At most one in the first build; later, at most one per Guild. */
  partyIds: PartyId[];
}

/** A Party's consumables are the stacks whose holder is this Party. */
export interface Party {
  id: PartyId;
  questId: QuestId;
  guildId: GuildId;
  heroIds: HeroId[];
  departedOnTurn: Turn;
  /** Always a night Turn: the night of dayOf(departedOnTurn) + durationDays (pre-M0 review C4). */
  returnsOnTurn: Turn;
  /**
   * Each of `heroIds`' Fatigue as the Party set out, by Hero: what the Quest clock reads each
   * Encounter's Fatigue from, since the Party comes home after every night away has moved it (DL-282).
   */
  fatigueAtDispatch: Record<HeroId, number>;
}

/** A pending Transfer offer (M6); other offer kinds may join a union later. */
export interface TransferOffer {
  id: OfferId;
  kind: 'transfer';
  fromGuildId: GuildId;
  toGuildId: GuildId;
  /** On `fromGuildId`'s Roster. */
  heroId: HeroId;
  fee: number;
  offeredOnTurn: Turn;
  expiresOnTurn: Turn;
}

/** An Item that is an individual, with exactly one holder. */
export interface UniqueItem {
  id: ItemId;
  definitionKey: ItemDefinitionKey;
  holder: Holder;
}

/** Common Items of one definition held in one place; one stack per definition, holder and slot. */
export interface Stack {
  id: StackId;
  definitionKey: ItemDefinitionKey;
  /** A whole number from 1: an emptied stack is removed. */
  quantity: number;
  holder: Holder;
}

// ── Sections (data-model §1–§4) ──────────────────────────────────────────────────────────────

/**
 * The World State schema this engine writes as `meta.version`; a load compares the two and
 * migrates an older save (M1-S8). Schema 2 gave Heroes the pool's two fields (DL-27); 3, Heroes'
 * `transferredOnTurn` (DL-60); 4, Guildmasters' descriptive Attributes and `retiredOnTurn`
 * (DL-102); 5, Guildmasters' `portraitKey` and Patrons' `sex`, refusing every older save rather
 * than migrating it (DL-125 item 10.2, DL-130); 6, Heroes' `portraitKey`, `appearance` and
 * `biography`, refusing every older save likewise (DL-135 item 7, DL-142); 7, `meta`'s
 * `configVersion`, taking `schemaVersion`, `configVersion` and `gearSlots` from the config and
 * `demands` from Quests, refusing every older save likewise (DL-193); 8, Quests' `tier` and
 * `beatLines`, refusing every older save likewise (DL-257, DL-262); 9, `partySizeMax` taken from
 * Quests' requirements, refusing every older save likewise (DL-257 item 6, DL-266); 10, Heroes'
 * `fatigue` and Parties' `fatigueAtDispatch`, refusing every older save likewise (DL-280, DL-282).
 */
export const schemaVersion = 10;

export interface Meta {
  /** Schema version of this document: `schemaVersion` when it was written. */
  version: number;
  /** The master seed the world was created from. */
  seed: string;
  /** The content set the world was created under. */
  content: ContentRef;
  /**
   * The version of the defaults `config` was taken from (`configVersion`, config.ts): set at
   * creation, and only `rebase` rewrites it (v1.1.6-S7, DL-193).
   */
  configVersion: number;
  /** Every tunable as it was at creation; only `rebase` rewrites it. Rules read `deps.config`. */
  config: GameConfig;
  /** Supplied by the caller and never read by rules: a front end's clock, or `"harness"`. */
  createdAt: string;
}

export interface World {
  turn: Turn;
  /** One seeded generator per subsystem that draws (ADR-0009). */
  rng: Record<StreamName, RngState>;
  /** The next id number per table; ids are never reused. */
  counters: Record<TableName, number>;
  /** Set once, when the player-controlled Guild's ending is reached. */
  ended: Ending | null;
  guilds: Record<GuildId, Guild>;
  guildmasters: Record<GuildmasterId, Guildmaster>;
  heroes: Record<HeroId, Hero>;
  patrons: Record<PatronId, Patron>;
  quests: Record<QuestId, Quest>;
  parties: Record<PartyId, Party>;
  items: Record<ItemId, UniqueItem>;
  stacks: Record<StackId, Stack>;
  /** The offered Quests, ordered. */
  board: QuestId[];
  offers: Record<OfferId, TransferOffer>;
  /** Each module's slice; the core clones it with `world` and never reads inside it. */
  modules: Record<ModuleId, unknown>;
}

/**
 * An engine event where it sits in time. Events and entries are the same shape. `payload` is
 * typed per event type, carrying ids only, never copies of entities.
 */
export interface Entry<Type extends EventType = EventType, Payload = unknown> {
  turn: Turn;
  type: Type;
  /** Every entity the event touches, including the Guild of any Hero involved. */
  participants: EntityId[];
  /** Each participant's display name at emission, so the entry narrates without a lookup. */
  labels: Record<EntityId, string>;
  milestone: boolean;
  payload: Payload;
}

/** Append-only, and only the engine's append function touches it (ADR-0008). */
export interface History {
  /** Position is the sequence number. */
  entries: Entry[];
  /** Ascending positions per entity. */
  byEntity: Record<EntityId, number[]>;
  /** Ascending positions per event type. */
  byType: Record<EventType, number[]>;
  /** Ascending positions of the Milestones. */
  milestones: number[];
}

export interface WorldDocument {
  meta: Meta;
  world: World;
  history: History;
}

// ── An empty world ───────────────────────────────────────────────────────────────────────────

/** Ids are numbered from 1 in every table. */
const firstIdNumber = 1;

/**
 * A document with no rows, an empty Board and an empty History at Turn 0: where world creation
 * starts, and a valid document for tests. The stream states come from the caller, since
 * seeding them is the generator's business (M1-S2).
 */
export function emptyDocument(meta: Meta, rng: Record<StreamName, RngState>): WorldDocument {
  const counters = Object.fromEntries(tableNames.map((table) => [table, firstIdNumber])) as Record<
    TableName,
    number
  >;
  return {
    meta,
    world: {
      turn: 0,
      rng,
      counters,
      ended: null,
      guilds: {},
      guildmasters: {},
      heroes: {},
      patrons: {},
      quests: {},
      parties: {},
      items: {},
      stacks: {},
      board: [],
      offers: {},
      modules: {},
    },
    history: { entries: [], byEntity: {}, byType: {}, milestones: [] },
  };
}
