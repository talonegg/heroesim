// The one set of fixtures the engine's tests share (DL-22): a small content set, the deps and
// empty worlds the generator tests draw into, a builder of valid World State documents with every
// table in use, and `withValid`, which every engine test wraps a document in to assert that the
// validator accepts it (M1-S7).
//
// Vitest runs only `*.test.ts`, so this file is not a test, and ESLint holds it to the engine's
// source rules (DL-16): no Node, no clock, no platform randomness. The real content cannot be
// loaded here, since the engine's tests import nothing from @heroesim/content (ADR-0007); this
// content set mirrors its keys. It is not exported from the package (DL-20). The harness checks
// the engine against the real content (M1-S10).

import { defaultConfig, type EngineDeps, type GameConfig } from './config.js';
import type { Class, ContentSet, Stat, StatArea, StatOwner } from './content-types.js';
import {
  emptyDocument,
  makeId,
  type EntityId,
  type Entry,
  type EventType,
  type Guild,
  type GuildId,
  type Guildmaster,
  type GuildmasterId,
  type Hero,
  type HeroId,
  type Holder,
  type ItemId,
  type Meta,
  type OfferId,
  type PartyId,
  type Patron,
  type PatronId,
  type QuestId,
  type RegardEntry,
  type SkillRating,
  type StackHolder,
  type StackId,
  type TableName,
  type World,
  type WorldDocument,
} from './document.js';
import { append } from './history.js';
import { createStreams, streamNames } from './rng.js';
import { validate } from './validate.js';

// ── Content ──────────────────────────────────────────────────────────────────────────────────

const heroStats: Record<StatArea, string[]> = {
  physical: ['strength', 'dexterity', 'weaponry', 'constitution', 'endurance'],
  mental: ['intelligence', 'knowledge', 'perception', 'wits', 'courage', 'willpower'],
  magical: ['arcana', 'power', 'spelllore', 'spirit', 'resistance'],
  social: ['leadership', 'charisma', 'diplomacy', 'adaptability'],
};

const guildmasterStats: Record<string, StatArea> = {
  inspiration: 'social',
  influence: 'social',
  negotiation: 'social',
  coaching: 'mental',
  judgement: 'mental',
};

/** The twenty Hero Stats, in content order. */
export const heroStatKeys: readonly string[] = Object.values(heroStats).flat();

const title = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1).replaceAll('-', ' ');

function stat(key: string, area: StatArea, owner: StatOwner): [string, Stat] {
  return [key, { key, name: title(key), area, min: 1, max: 20, default: 10, owner }];
}

/**
 * A Class from its leading Stats and gated Skills, each a space-separated list of keys. Its four
 * leading Stats share two thirds of growth and the sixteen others one third, as in the core
 * (DL-17 item 5).
 */
function heroClass(key: string, leading: string, gated: string): [string, Class] {
  const leadingStats = leading.split(' ');
  const leadingWeight = 2 / 3 / leadingStats.length;
  const otherWeight = 1 / 3 / (heroStatKeys.length - leadingStats.length);
  const growth = Object.fromEntries(
    heroStatKeys.map((statKey) => [statKey, leadingStats.includes(statKey) ? leadingWeight : otherWeight]),
  );
  return [key, { key, name: title(key), leadingStats, gatedSkills: gated.split(' '), growth }];
}

/** Rows keyed by `keys`, each named after its key and carrying `fields`. */
function keyed<Fields extends object>(fields: Fields, ...keys: string[]): Record<string, Fields & Named> {
  return Object.fromEntries(keys.map((key) => [key, { key, name: title(key), ...fields }]));
}

interface Named {
  key: string;
  name: string;
}

/**
 * Freezes `value` and everything it holds, so no test can change what another test reads (or, for
 * `history.test.ts`, what `append` stored). Frozen before recursing, and skipped once frozen, so a
 * structure that shares an object between two places is not walked twice.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/**
 * A content set with the real content's keys, cut down: every Stat, the four Classes and their
 * twelve Skills, every Trait and Sphere, some of the Backgrounds, and name lists long enough for
 * `createWorld` under `defaultConfig` (five Guilds, twelve Patrons). It also carries the Quest
 * template and Item tables that M2-S3 and M5-S1 add, so that fixture Quests and Items raise no
 * warning.
 *
 * Frozen, and shared by every test: a test that needs other content spreads a copy and changes
 * that (`{ ...testContent, spheres: {} }`).
 */
export const testContent: ContentSet = deepFreeze(
  Object.assign(
    {
      id: 'test',
      version: 1,
      stats: Object.fromEntries([
        ...Object.entries(heroStats).flatMap(([area, keys]) => keys.map((key) => stat(key, area as StatArea, 'hero'))),
        ...Object.entries(guildmasterStats).map(([key, area]) => stat(key, area, 'guildmaster')),
      ]),
      classes: Object.fromEntries([
        heroClass('warrior', 'strength weaponry constitution courage', 'swordcraft shieldwork tactics'),
        heroClass('rogue', 'dexterity perception wits adaptability', 'lockpicking stealth trapcraft'),
        heroClass('mage', 'intelligence arcana power spelllore', 'evocation warding runecraft'),
        heroClass('healer', 'knowledge willpower spirit charisma', 'field-surgery herbalism benediction'),
      ]),
      skills: keyed(
        {},
        ...['swordcraft', 'shieldwork', 'tactics', 'lockpicking', 'stealth', 'trapcraft'],
        ...['evocation', 'warding', 'runecraft', 'field-surgery', 'herbalism', 'benediction'],
      ),
      traits: {
        ...keyed(
          { owner: 'guildmaster' as const, effect: null },
          ...['old-soldier', 'well-liked', 'thrifty', 'miser', 'spendthrift', 'mistrusts-magic'],
        ),
        ...keyed({ owner: 'hero' as const, effect: null }, 'scarred', 'lame', 'one-eyed', 'short-winded'),
      },
      backgrounds: {
        ...keyed({ owner: 'hero' as const }, 'farm-born', 'levy-soldier', 'temple-ward', 'river-folk'),
        ...keyed({ owner: 'guild' as const }, 'old-charter', 'breakaway', 'newly-founded'),
      },
      spheres: keyed({}, 'crown', 'church', 'merchants', 'villages', 'scholars', 'underworld'),
      names: {
        given: {
          female: ['Aldith', 'Brynja', 'Cwen', 'Dagny', 'Edda', 'Frida', 'Gyda', 'Hild'],
          male: ['Aldred', 'Bram', 'Cenric', 'Dag', 'Egil', 'Finn', 'Grim', 'Hakon'],
        },
        family: ['Ashcombe', 'Barrowby', 'Carrick', 'Dalby', 'Fenwick', 'Garside', 'Hallam', 'Ingleby'],
        guild: [
          ...['The Ashford Guild', 'The Coldbeck Guild', 'The Greywater Guild', 'The Lantern Guild'],
          ...['The Kestrel Guild', 'The Hollin Guild', 'The Blackfen Guild', 'The Northmoor Guild'],
        ],
        patron: [
          ...['Aldous Fairweather', 'Berengar Holt', 'Cecily Ashdown', 'Denholm Crane', 'Edith Marlow'],
          ...['Florian Keld', 'Godwin Harrow', 'Hawise Brennard', 'Isolde Varney', 'Jocelyn Pike'],
          ...['Lambert Sowerby', 'Mabel Thorne', 'Nicolas Aske', 'Orabel Quint'],
        ],
      },
    },
    {
      questTemplates: keyed({}, 'clear-the-barrow', 'escort-the-tithe'),
      items: keyed({}, 'healing-draught', 'lantern-of-stannary'),
    },
  ),
);

const classKeys = Object.keys(testContent.classes);
const ratings: readonly SkillRating[] = [1, 2, 3];

// ── Deps and empty worlds, for the generators ────────────────────────────────────────────────

/**
 * Every stream ADR-0009 (as amended) plans, each added in the milestone that draws from it; M1
 * defines `generation` alone (`streamNames`), so a test world or a stream sweep carries the rest
 * beside it, to watch them stand still until their milestone lands.
 */
export const plannedStreams = [
  'generation',
  'board',
  'quests',
  'encounters',
  'pool',
  'heroes',
  'progression',
  'rivals',
  'market',
] as const;

/** The test content with the default config, or with `overrides` on it. */
export function testDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return { config: { ...defaultConfig, ...overrides }, content: testContent };
}

/**
 * An empty world at Turn 0 with a stream for each of `names`, seeded from `seed`: the core's
 * streams by default. A test that must see other streams stand still names them here.
 */
export function testWorld(seed: string, deps: EngineDeps, names: readonly string[] = streamNames): World {
  const meta: Meta = {
    version: deps.config.schemaVersion,
    seed,
    content: { id: deps.content.id, version: deps.content.version },
    config: { ...deps.config },
    createdAt: 'test',
  };
  // Every core stream is among `names` or the world is unusable; a test adds names, never drops one.
  const rng = { ...createStreams(seed, names), ...createStreams(seed, streamNames) };
  return emptyDocument(meta, rng).world;
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────

export const testMeta: Meta = {
  version: defaultConfig.schemaVersion,
  seed: 'amber-fox-4821',
  content: { id: testContent.id, version: testContent.version },
  config: { ...defaultConfig },
  createdAt: 'harness',
};

/** How big a document `buildDocument` makes. */
export interface DocumentSize {
  /** Rival Guilds beside the player's; at least 1, which makes the Transfer offer. */
  rivals?: number;
  /** Heroes on each Guild's Roster; at least 1. */
  rosterSize?: number;
  /** Unattached Heroes in the pool. */
  unattached?: number;
}

/** The ids tests reach for in a built document. */
export interface FixtureIds {
  playerGuild: GuildId;
  rivalGuild: GuildId;
  playerGuildmaster: GuildmasterId;
  /** On the player's Roster, in the Party, holding the unique Item. */
  partyHero: HeroId;
  /** On the player's Roster, in no Party. */
  idleHero: HeroId | null;
  /** On the Rival's Roster; the Transfer offer is for them. */
  rivalHero: HeroId;
  unattachedHero: HeroId | null;
  /** Died on a Quest: off the Roster, `guildId` kept. */
  deadHero: HeroId;
  /** Left the pool unrecruited: no row, only passive History entries. */
  departedHero: HeroId;
  patron: PatronId;
  /** Taken by `party`. */
  takenQuest: QuestId;
  /** Offered, on the Board. */
  offeredQuest: QuestId;
  /** Resolved and removed: only the History names it. */
  resolvedQuest: QuestId;
  party: PartyId;
  offer: OfferId;
  item: ItemId;
  /** Held by the Market, the player's Guild, the Party, and the Party's Hero in a slot. */
  marketStack: StackId;
  guildStack: StackId;
  partyStack: StackId;
  heroStack: StackId;
}

/** The Turn a built document stands at: the afternoon of Day 13. */
export const fixtureTurn = 40;

/**
 * A valid document with every table in use and every lifecycle the validator distinguishes: a
 * Party on a taken Quest, an offered Quest on the Board, a resolved Quest only the History names,
 * a Transfer offer, an Item and a stack for each kind of holder, a dead Hero, and a pool Hero
 * whose row is gone. Deterministic: the same size gives the same document.
 */
export function buildDocument(size: DocumentSize = {}): { document: WorldDocument; ids: FixtureIds } {
  const { rivals = 1, rosterSize = 3, unattached = 2 } = size;
  if (rivals < 1 || rosterSize < 1) throw new RangeError('A built document has a Rival and a Hero on each Roster');

  const document = emptyDocument(testMeta, createStreams(testMeta.seed, streamNames));
  const { world, history } = document;
  world.turn = fixtureTurn;
  const next = <Table extends TableName>(table: Table) => makeId(table, world.counters[table]++);
  const entries: Entry[] = [];
  const log = (turn: number, type: EventType, participants: EntityId[], milestone = false): void => {
    const labels = Object.fromEntries(participants.map((id) => [id, `Name of ${id}`]));
    entries.push({ turn, type, participants, labels, milestone, payload: {} });
  };
  log(0, 'world.created', []);

  // Guilds, their Guildmasters and Rosters.
  const guildIds: GuildId[] = [];
  let heroNumber = 0;
  const hero = (guildId: GuildId | null): Hero => {
    const id = next('heroes');
    const n = heroNumber++;
    const classKey = classKeys[n % classKeys.length] ?? 'warrior';
    const sex = n % 2 === 0 ? 'female' : 'male';
    const stats = Object.fromEntries(heroStatKeys.map((key, i) => [key, 1 + ((n * 7 + i * 3) % 18)]));
    const row: Hero = {
      id,
      name: `${testContent.names.given[sex][n % 4] ?? 'Hild'} ${testContent.names.family[n % 3] ?? 'Hale'}`,
      sex,
      backgroundKey: 'farm-born',
      classKey,
      enteredTurn: 0,
      ageAtEntry: 18 + (n % 15),
      guildId,
      unattachedSince: guildId === null ? 0 : null,
      leftPoolOnTurn: null,
      partyId: null,
      stats,
      potential: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, value + 2])),
      skills: { [testContent.classes[classKey]?.gatedSkills[0] ?? 'tactics']: ratings[n % ratings.length] ?? 1 },
      traits: [],
      xp: 0,
      level: 1,
      injury: null,
      morale: 50,
      diedOnTurn: null,
      retiredOnTurn: null,
      regard: {},
    };
    world.heroes[id] = row;
    log(0, 'hero.generated', [id]);
    return row;
  };

  for (let g = 0; g <= rivals; g += 1) {
    const id = next('guilds');
    const guildmasterId = next('guildmasters');
    guildIds.push(id);
    const guild: Guild = {
      id,
      name: `Guild ${g + 1}`,
      backgroundKey: g === 0 ? 'old-charter' : 'breakaway',
      foundedTurn: 0,
      guildmasterId,
      rosterIds: [],
      wealth: 500 + 100 * g,
      fame: g,
      belowFloorSince: null,
      foldedOnTurn: null,
      hall: { infirmary: 0, trainingYard: 0, quarters: 0 },
      controller: g === 0 ? { kind: 'player' } : { kind: 'rival', disposition: 'steady' },
      regard: {},
    };
    world.guilds[id] = guild;
    world.guildmasters[guildmasterId] = {
      id: guildmasterId,
      name: `Guildmaster ${g + 1}`,
      sex: g % 2 === 0 ? 'male' : 'female',
      guildId: id,
      enteredTurn: 0,
      ageAtEntry: 40 + g,
      stats: Object.fromEntries(Object.keys(guildmasterStats).map((key, i) => [key, 8 + ((g + i) % 8)])),
      traits: g === 0 ? ['old-soldier'] : [],
      regard: {},
    };
    log(0, 'guild.founded', [id, guildmasterId], true);
    log(0, 'guildmaster.generated', [guildmasterId, id]);
    for (let r = 0; r < rosterSize; r += 1) guild.rosterIds.push(hero(id).id);
  }
  const [playerGuild, rivalGuild] = guildIds as [GuildId, GuildId];
  const player = world.guilds[playerGuild] as Guild;
  const rival = world.guilds[rivalGuild] as Guild;
  const partyHero = player.rosterIds[0] as HeroId;

  const unattachedIds = Array.from({ length: unattached }, () => hero(null).id);
  const deadHero = hero(playerGuild);
  const departedHero = hero(null).id;
  delete world.heroes[departedHero];

  // Patrons, and a Quest resolved and removed before the fixture's Turn.
  const patron = next('patrons');
  const secondPatron = next('patrons');
  world.patrons[patron] = { id: patron, name: 'Lady Maud of Stannary', sphereKey: 'crown', regard: {} };
  world.patrons[secondPatron] = { id: secondPatron, name: 'Abbot Cenric', sphereKey: 'church', regard: {} };
  log(0, 'patron.generated', [patron]);
  log(0, 'patron.generated', [secondPatron]);

  const resolvedQuest = next('quests');
  log(9, 'quest.resolved', [resolvedQuest, patron, playerGuild], false);
  log(12, 'hero.left-pool', [departedHero]);
  deadHero.diedOnTurn = 30;
  log(30, 'hero.died', [deadHero.id, playerGuild], true);

  // A Quest taken by a Party, and one on the Board.
  const takenQuest = next('quests');
  const offeredQuest = next('quests');
  const party = next('parties');
  // A function, so that no two Quests share an array: rows never share objects.
  const quest = () => ({
    templateKey: 'clear-the-barrow',
    patronId: patron,
    difficulty: 30,
    tags: ['undead'],
    reward: 120,
    fameEffect: 2,
    durationTurns: 9,
    demands: [['strength', 0.6], ['courage', 0.4]] as [string, number][],
    skillKeys: ['swordcraft'],
    encounterKeys: [],
    requirements: { partySizeMin: 1, partySizeMax: 3, classKey: 'warrior', skillKey: 'swordcraft' },
    lootTableKey: null,
  });
  world.quests[takenQuest] = {
    ...quest(),
    id: takenQuest,
    status: 'taken',
    offeredOnTurn: 33,
    expiresOnTurn: 42,
    partyIds: [party],
  };
  world.quests[offeredQuest] = {
    ...quest(),
    id: offeredQuest,
    templateKey: 'escort-the-tithe',
    patronId: secondPatron,
    requirements: { partySizeMin: 2, partySizeMax: 4 },
    status: 'offered',
    offeredOnTurn: 39,
    expiresOnTurn: 48,
    partyIds: [],
  };
  world.board.push(offeredQuest);
  world.parties[party] = {
    id: party,
    questId: takenQuest,
    guildId: playerGuild,
    heroIds: [partyHero],
    departedOnTurn: 36,
    returnsOnTurn: 44,
  };
  (world.heroes[partyHero] as Hero).partyId = party;
  log(33, 'quest.offered', [takenQuest, patron]);
  log(36, 'quest.taken', [takenQuest, party, partyHero, playerGuild]);
  log(39, 'quest.offered', [offeredQuest, secondPatron]);

  // A Transfer offer for a Rival's Hero.
  const offer = next('offers');
  const rivalHero = rival.rosterIds[0] as HeroId;
  world.offers[offer] = {
    id: offer,
    kind: 'transfer',
    fromGuildId: rivalGuild,
    toGuildId: playerGuild,
    heroId: rivalHero,
    fee: 300,
    offeredOnTurn: 39,
    expiresOnTurn: 45,
  };
  log(39, 'guild.transfer-offered', [offer, rivalHero, rivalGuild, playerGuild]);

  // Items and stacks, one per kind of holder.
  const item = next('items');
  const trinket: Holder = { kind: 'hero', id: partyHero, slot: 'trinket' };
  world.items[item] = { id: item, definitionKey: 'lantern-of-stannary', holder: trinket };
  const stack = (definitionKey: string, quantity: number, holder: StackHolder): StackId => {
    const id = next('stacks');
    world.stacks[id] = { id, definitionKey, quantity, holder };
    return id;
  };
  const marketStack = stack('healing-draught', 12, { kind: 'market' });
  const guildStack = stack('healing-draught', 3, { kind: 'guild', id: playerGuild });
  const partyStack = stack('healing-draught', 2, { kind: 'party', id: party });
  const heroStack = stack('healing-draught', 1, { kind: 'hero', id: partyHero, slot: 'belt' });

  // Regard in each kind of row that holds it.
  const regard = (): RegardEntry => ({ value: 12, since: 30, reason: 'quest.resolved' });
  player.regard[patron] = regard();
  (world.guildmasters[player.guildmasterId] as Guildmaster).regard[partyHero] = regard();
  (world.heroes[partyHero] as Hero).regard[player.guildmasterId] = regard();
  (world.patrons[patron] as Patron).regard[playerGuild] = regard();

  // The History in Turn order, through the one writer.
  entries.sort((a, b) => a.turn - b.turn);
  for (const entry of entries) append(history, entry);

  return {
    document,
    ids: {
      playerGuild,
      rivalGuild,
      playerGuildmaster: player.guildmasterId,
      partyHero,
      idleHero: (player.rosterIds[1] as HeroId | undefined) ?? null,
      rivalHero,
      unattachedHero: unattachedIds[0] ?? null,
      deadHero: deadHero.id,
      departedHero,
      patron,
      takenQuest,
      offeredQuest,
      resolvedQuest,
      party,
      offer,
      item,
      marketStack,
      guildStack,
      partyStack,
      heroStack,
    },
  };
}

// ── withValid ────────────────────────────────────────────────────────────────────────────────

/**
 * Returns `document` when the validator accepts it under `deps.content`, and throws, listing
 * every failure, when it refuses. A warning throws too unless `allowWarnings` is set: a document
 * the engine makes from content should hold only that content's keys. Wrap every document an
 * engine test makes or changes: `const document = withValid(advance(...).document, deps)`.
 *
 * Takes `deps` rather than a bare `ContentSet` (DL-23), so that a test already holding the deps
 * it built a document with can pass them straight on.
 */
export function withValid<Document extends WorldDocument>(
  document: Document,
  deps: EngineDeps,
  { allowWarnings = false }: { allowWarnings?: boolean } = {},
): Document {
  const result = validate(document, deps);
  if (!result.ok) {
    const lines = result.failures.map(({ check, id, detail }) => `  ${check} ${id}: ${detail}`);
    throw new Error(`The validator refuses the document:\n${lines.join('\n')}`);
  }
  if (!allowWarnings && result.warnings.length > 0) {
    const lines = result.warnings.map(({ check, id, detail }) => `  ${check} ${id}: ${detail}`);
    throw new Error(`The validator warns about the document:\n${lines.join('\n')}`);
  }
  return document;
}
