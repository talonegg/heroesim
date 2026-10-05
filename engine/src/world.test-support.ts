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

import { configVersion, defaultConfig, type EngineDeps, type GameConfig } from './config.js';
import type {
  AppearancePhrases,
  Class,
  Consequence,
  ConsumableEffect,
  ContentSet,
  Disposition,
  Encounter,
  EncounterCheck,
  EncounterKind,
  GuildmasterTrait,
  GuildmasterTraitEffect,
  HeroTraitEffect,
  Improvement,
  InjuryType,
  ItemDefinition,
  LootEntry,
  LootTable,
  NumQuery,
  PatronName,
  QuestTemplate,
  QuestTemplateRequires,
  SlotKey,
  SphereKey,
  Stat,
  StatArea,
  StatOwner,
  Synergy,
  SynergyRequires,
} from './content-types.js';
import {
  emptyDocument,
  facilityKeys,
  makeId,
  schemaVersion,
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
  type Sex,
  type SkillRating,
  type StackId,
  type TableName,
  type World,
  type WorldDocument,
} from './document.js';
import { append } from './history.js';
import { capability, check, type CheckResult } from './quest-engine/check.js';
import { queryParty } from './quest-engine/query.js';
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

/** Patrons' names, each of `sex` (v1.1.2-S3). */
function patronNames(sex: Sex, ...names: string[]): PatronName[] {
  return names.map((name) => ({ name, sex }));
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
 * Each test template's Encounter kinds and count range (M4-S1), as the core's: kinds a template of
 * its tags would meet, and counts that rise with its difficulty, 2 to 5 (INPUTS 6.1).
 */
const templateEncounters: Readonly<Record<string, [EncounterKind[], number, number]>> = {
  'clear-the-barrow': [['combat', 'stealth', 'travel'], 2, 4],
  'hold-the-border-fort': [['combat', 'travel'], 3, 5],
  'escort-the-tithe': [['travel', 'combat', 'social'], 2, 3],
  'lay-the-restless-dead': [['combat', 'arcane'], 3, 4],
  'guard-the-caravan': [['travel', 'combat'], 2, 4],
  'recover-the-strongbox': [['travel', 'stealth'], 2, 3],
  'the-beast-of-the-fells': [['travel', 'combat', 'stealth'], 2, 4],
  'the-sickness-at-the-mill': [['social', 'arcane'], 2, 2],
  'survey-the-old-workings': [['travel', 'arcane', 'stealth'], 2, 4],
  'break-the-sealed-vault': [['arcane', 'stealth', 'combat'], 4, 5],
  'a-quiet-word': [['social', 'stealth'], 2, 3],
  'the-counting-house-job': [['stealth', 'social'], 3, 5],
};

/**
 * Each test template's Loot table (M5-S5, DL-52), as the core's were before the M5 close's balance
 * pass (DL-62): the six whose `difficultyMin` is above a `lootDifficultyThreshold` of 25, which the
 * tests that rely on it pin (the default is 35 since DL-62), `lesser-loot` below 45 and
 * `greater-loot` from it; the rest none.
 */
const templateLoot: Readonly<Record<string, string>> = {
  'clear-the-barrow': 'lesser-loot',
  'the-beast-of-the-fells': 'lesser-loot',
  'lay-the-restless-dead': 'lesser-loot',
  'the-counting-house-job': 'greater-loot',
  'hold-the-border-fort': 'greater-loot',
  'break-the-sealed-vault': 'greater-loot',
};

/**
 * A Quest template of `sphere` from its ranges as `[min, max]` and its Skills, a space-separated
 * list. The reward is four Wealth per difficulty
 * and the Fame effect 2, as INPUTS 4.2's defaults put them. Its Encounter kinds and counts are
 * `templateEncounters`', and its Loot table `templateLoot`'s.
 */
function questTemplate(
  key: string,
  sphere: SphereKey,
  [difficultyMin, difficultyMax]: [number, number],
  [durationDaysMin, durationDaysMax]: [number, number],
  [partySizeMin, partySizeMax]: [number, number],
  skills: string,
  requires: QuestTemplateRequires = {},
): [string, QuestTemplate] {
  const [encounterKinds, encountersMin, encountersMax] = templateEncounters[key] ?? [['combat'], 2, 2];
  return [
    key,
    {
      key,
      name: title(key),
      sphereKeys: [sphere],
      tags: ['fight'],
      difficultyMin,
      difficultyMax,
      durationDaysMin,
      durationDaysMax,
      rewardPerDifficulty: 4,
      fameEffect: 2,
      partySizeMin,
      partySizeMax,
      skillKeys: skills.split(' '),
      requires,
      lootTableKey: templateLoot[key] ?? null,
      encounterKinds: [...encounterKinds],
      encountersMin,
      encountersMax,
    },
  ];
}

/** Demands written as `stat:weight` pairs in a space-separated list. */
function demandsOf(demands: string): [string, number][] {
  return demands.split(' ').map((pair) => {
    const [statKey = '', weight = ''] = pair.split(':');
    return [statKey, Number(weight)];
  });
}

/** How a test Check's score reads each demanded Stat over the Party: `best` as `max`, `sum` as `sum`. */
export type CheckAggregate = 'best' | 'sum';

/**
 * A test's Check built from weighted demands, as content's old form of an Encounter loaded into one
 * until it was retired (v1.1.4-S1 to DL-192): keyed and named `key` and `name`, its score the weighted
 * `aggregate` of each demanded Stat over the Party, added up in the order of `demands`, with
 * `skillKeys` its Skills.
 */
export function demandsCheck(
  key: string,
  name: string,
  aggregate: CheckAggregate,
  demands: readonly (readonly [string, number])[],
  skillKeys: readonly string[],
  difficultyFactor: number,
): EncounterCheck {
  const terms = demands.map(([statKey, weight]): NumQuery => ['*', weight, [aggregate === 'best' ? 'max' : 'sum', 'party', ['stat', statKey]]]);
  return { key, name, score: ['+', ...terms], skills: [...skillKeys], difficultyFactor };
}

/**
 * A test's Synergy requirement built from counts of Classes and a list of Skills, as content's old form
 * loaded into conditions until it was retired (v1.1.4-S1 to DL-192): at least `n` of each Class named,
 * then each Skill held at a rating of 1 or more.
 */
export function classSkillRequires(requires: { classes?: Record<string, number>; skills?: readonly string[] }): SynergyRequires {
  return [
    ...Object.entries(requires.classes ?? {}).map(([classKey, count]): SynergyRequires[number] => [
      '>=',
      ['count', ['where', 'party', ['class', classKey]]],
      count,
    ]),
    ...(requires.skills ?? []).map((skillKey): SynergyRequires[number] => ['>=', ['max', 'party', ['skill', skillKey]], 1]),
  ];
}

/**
 * An Encounter (M4-S1) from its kind, aggregate, demands as `stat:weight` pairs, Skills as a
 * space-separated list (or none), difficulty factor and consequences, its one Check built from the
 * demands (`demandsCheck`).
 */
function encounter(
  key: string,
  kind: EncounterKind,
  aggregate: CheckAggregate,
  demands: string,
  skills: string,
  difficultyFactor: number,
  success: Consequence[],
  failure: Consequence[],
): [string, Encounter] {
  return [
    key,
    {
      key,
      name: title(key),
      kind,
      checks: [demandsCheck(key, title(key), aggregate, demandsOf(demands), skills === '' ? [] : skills.split(' '), difficultyFactor)],
      consequences: { success, failure },
    },
  ];
}

/** A Synergy (M4-S3) from the Classes and Skills it requires (`classSkillRequires`), its bonus and, when it has them, its kinds. */
function synergy(
  key: string,
  requires: Parameters<typeof classSkillRequires>[0],
  bonus: Synergy['bonus'],
  kinds?: EncounterKind[],
): [string, Synergy] {
  return [key, { key, name: title(key), requires: classSkillRequires(requires), bonus, ...(kinds === undefined ? {} : { kinds }) }];
}

/**
 * A Guildmaster Trait with its one effect (M4-S5), as its list of effects (v1.1.4-S7), its cost and
 * what it excludes (M9-S2), keyed by `key` and named after it.
 */
function guildmasterTrait(key: string, effect: GuildmasterTraitEffect, cost: number, excludes: string[] = []): Record<string, GuildmasterTrait> {
  return { [key]: { key, name: title(key), cost, excludes, effects: [effect] } };
}

/**
 * A gear definition (M5-S1) from its slot, its Stat modifiers as `stat:delta` pairs in a
 * space-separated list, its price (`null` for Loot only) and its tags; unique when `unique`.
 */
function gear(
  key: string,
  slot: SlotKey,
  modifiers: string,
  buyPrice: number | null,
  tags: string[],
  unique = false,
): [string, ItemDefinition] {
  const statModifiers = Object.fromEntries(demandsOf(modifiers));
  return [key, { key, name: title(key), kind: 'gear', unique, slot, statModifiers, buyPrice, tags }];
}

/** A common consumable definition (M5-S1) from its effect, its price and its tags. */
function consumable(key: string, effect: ConsumableEffect, buyPrice: number, tags: string[]): [string, ItemDefinition] {
  return [key, { key, name: title(key), kind: 'consumable', unique: false, effect, buyPrice, tags }];
}

/** A Loot table (M5-S5) from its entries, each `definition:weight:min-max` in a space-separated list. */
function lootTable(key: string, entries: string): [string, LootTable] {
  const parsed = entries.split(' ').map((written): LootEntry => {
    const [definitionKey = '', weight = '', range = ''] = written.split(':');
    const [quantityMin = '', quantityMax = quantityMin] = range.split('-');
    return { definitionKey, weight: Number(weight), quantityMin: Number(quantityMin), quantityMax: Number(quantityMax) };
  });
  return [key, { key, entries: parsed }];
}

/** An Injury type from its Days to heal as `[min, max]` and the Trait it leaves. */
function injuryType(key: string, [healDaysMin, healDaysMax]: [number, number], leavesTrait: string | null): [string, InjuryType] {
  return [key, { key, name: title(key), healDaysMin, healDaysMax, leavesTrait }];
}

/**
 * The Hall Improvements of the core (INPUTS 7.3): three grades of each facility, at 200, 500 and
 * 1,000 Wealth, keyed `infirmary-1`, `training-yard-2` and so on (M3-S6).
 */
function improvements(): Record<string, Improvement> {
  const costs = [200, 500, 1000];
  return Object.fromEntries(
    facilityKeys.flatMap((facility) =>
      costs.map((cost, index): [string, Improvement] => {
        const grade = index + 1;
        const key = `${facility.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-${grade}`;
        return [key, { key, name: `${title(facility)} ${grade}`, facility, grade, cost }];
      }),
    ),
  );
}

/** A Disposition row by its weights, in the order the content type lists them (M6-S1). */
function disposition(
  key: string,
  questRiskAppetite: number,
  recruitThreshold: number,
  buildThreshold: number,
  gearThreshold: number,
  transferAppetite: number,
  partyMargin: number,
): Record<string, Disposition> {
  return { [key]: { key, name: title(key), questRiskAppetite, recruitThreshold, buildThreshold, gearThreshold, transferAppetite, partyMargin } };
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
 * twelve Skills, every Trait and Sphere, some of the Backgrounds, name lists long enough for
 * `createWorld` under `defaultConfig` (five Guilds, twelve Patrons), the twelve Quest templates,
 * two to a Sphere, with simpler demands (M2-S3), four Injury types (M2-S5), the core's four
 * Dispositions and their weights (M2-S9, M6-S1), the core's nine Hall Improvements (M3-S6), the core's twelve
 * Encounter keys, two or more of each kind (M4-S1), the core's six Synergies (M4-S3), the
 * core's twenty Item definitions (M5-S1), so that fixture Items raise no warning, and the core's two
 * Loot tables, named by the six templates above the default Loot threshold (M5-S5).
 *
 * Frozen, and shared by every test: a test that needs other content spreads a copy and changes
 * that (`{ ...testContent, spheres: {} }`).
 */
export const testContent: ContentSet = deepFreeze({
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
  classOrder: ['warrior', 'rogue', 'mage', 'healer'],
  skills: keyed(
    {},
    ...['swordcraft', 'shieldwork', 'tactics', 'lockpicking', 'stealth', 'trapcraft'],
    ...['evocation', 'warding', 'runecraft', 'field-surgery', 'herbalism', 'benediction'],
  ),
  // The core's six Guildmaster Traits and their effects (M4-S5, DL-43): three buffs, three penalties;
  // with the core's costs and exclusions (M9-S2, DL-100 item 3).
  guildmasterTraits: {
    ...guildmasterTrait('old-soldier', { kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 1 }, 1),
    ...guildmasterTrait('well-liked', { kind: 'guildMoraleShift', delta: 5 }, 2, ['miser']),
    ...guildmasterTrait('thrifty', { kind: 'upkeepFactor', factor: 0.9 }, 2, ['spendthrift']),
    ...guildmasterTrait('miser', { kind: 'guildMoraleShift', delta: -5 }, -2, ['well-liked', 'spendthrift']),
    ...guildmasterTrait('spendthrift', { kind: 'upkeepFactor', factor: 1.1 }, -2, ['thrifty', 'miser']),
    ...guildmasterTrait('mistrusts-magic', { kind: 'classStatBonus', classKey: 'mage', statKey: 'arcana', delta: -1 }, -1),
  },
  // The core's four Hero Traits, each an Injury's, with no effect yet (v1.1.4-S7).
  heroTraits: keyed({ excludes: [] as string[], effects: [] as HeroTraitEffect[] }, 'scarred', 'lame', 'one-eyed', 'short-winded'),
  backgrounds: {
    ...keyed({ owner: 'hero' as const, station: 'common' }, 'farm-born', 'levy-soldier', 'temple-ward', 'river-folk'),
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
    // The core's first fourteen, each with its sex (v1.1.2-S3, DL-125 item 5).
    patron: [
      ...patronNames('male', 'Aldous Fairweather', 'Berengar Holt'),
      ...patronNames('female', 'Cecily Ashdown'),
      ...patronNames('male', 'Denholm Crane'),
      ...patronNames('female', 'Edith Marlow'),
      ...patronNames('male', 'Florian Keld', 'Godwin Harrow'),
      ...patronNames('female', 'Hawise Brennard', 'Isolde Varney', 'Jocelyn Pike'),
      ...patronNames('male', 'Lambert Sowerby'),
      ...patronNames('female', 'Mabel Thorne'),
      ...patronNames('male', 'Nicolas Aske'),
      ...patronNames('female', 'Orabel Quint'),
    ],
  },
  // key, Sphere, difficulty, Days and Party size ranges; then Skills, requirements.
  questTemplates: Object.fromEntries([
    questTemplate('clear-the-barrow', 'crown', [30, 70], [3, 6], [2, 4],
      'swordcraft benediction'),
    questTemplate('hold-the-border-fort', 'crown', [50, 90], [5, 9], [3, 4],
      'tactics shieldwork', { classKey: 'warrior' }),
    questTemplate('escort-the-tithe', 'church', [10, 35], [2, 4], [1, 3],
      'tactics field-surgery'),
    questTemplate('lay-the-restless-dead', 'church', [40, 80], [3, 6], [2, 4],
      'benediction warding', { classKey: 'healer' }),
    questTemplate('guard-the-caravan', 'merchants', [20, 55], [3, 7], [2, 4],
      'tactics trapcraft'),
    questTemplate('recover-the-strongbox', 'merchants', [25, 60], [2, 5], [1, 3],
      'lockpicking trapcraft'),
    questTemplate('the-beast-of-the-fells', 'villages', [35, 75], [3, 7], [2, 4],
      'swordcraft stealth'),
    questTemplate('the-sickness-at-the-mill', 'villages', [10, 30], [2, 3], [1, 2],
      'herbalism field-surgery'),
    questTemplate('survey-the-old-workings', 'scholars', [25, 60], [3, 6], [2, 3],
      'runecraft trapcraft'),
    questTemplate('break-the-sealed-vault', 'scholars', [60, 100], [5, 10], [3, 5],
      'warding runecraft', { classKey: 'mage' }),
    questTemplate('a-quiet-word', 'underworld', [15, 45], [2, 4], [1, 2],
      'stealth lockpicking'),
    questTemplate('the-counting-house-job', 'underworld', [45, 85], [3, 6], [2, 4],
      'lockpicking stealth', { skillKey: 'lockpicking' }),
  ]),
  // key, Days to heal, the Trait it leaves (M2-S5): some leave a Hero Trait, some none.
  injuries: Object.fromEntries([
    injuryType('bruised-ribs', [5, 8], null),
    injuryType('broken-arm', [15, 25], null),
    injuryType('deep-cut', [6, 12], 'scarred'),
    injuryType('shattered-knee', [20, 30], 'lame'),
  ]),
  // The four Dispositions (INPUTS 7.5) with the weights M6-S1 gave the core (DL-56; reckless's
  // gearThreshold retuned by M6-S4, DL-58): questRiskAppetite, recruitThreshold, buildThreshold,
  // gearThreshold, transferAppetite; then v1.1.4-S6's partyMargin, the core's (DL-157). The M6 close
  // retuned the core's rows (DL-69); the engine's tests keep these, on which their margins were
  // measured, as a fixture of the one rule.
  dispositions: {
    ...disposition('ambitious', 0.6, 40, 1.5, 2, 0.75, 0.05),
    ...disposition('miserly', 0.25, 80, 20, 10, 0.1, 0.05),
    ...disposition('reckless', 1, 30, 4, 3, 0.5, 0.1),
    ...disposition('steady', 0, 60, 3, 3, 0.25, 0.05),
  },
  improvements: improvements(),
  // key, kind, aggregate, demands, Skills, difficulty factor; then success and failure (M4-S1):
  // the core's twelve keys, simpler demands, and harm only on a failure.
  encounters: Object.fromEntries([
    encounter('ambush-on-the-road', 'combat', 'sum', 'weaponry:0.5 strength:0.5', 'swordcraft tactics', 0.3,
      [{ kind: 'xp', factor: 1.1 }], [{ kind: 'injury', typeKey: 'deep-cut', chance: 0.25, count: 1 }, { kind: 'death', chance: 0.02 }]),
    encounter('the-restless-dead', 'combat', 'sum', 'spirit:0.5 courage:0.5', 'benediction swordcraft', 0.3,
      [{ kind: 'fame', delta: 1 }], [{ kind: 'injury', typeKey: 'broken-arm', chance: 0.2, count: 1 }, { kind: 'morale', delta: -3 }]),
    encounter('hold-the-line', 'combat', 'sum', 'strength:0.5 constitution:0.5', 'shieldwork tactics', 0.3,
      [{ kind: 'regard', between: 'party', delta: 1 }], [{ kind: 'injury', typeKey: 'bruised-ribs', chance: 0.3, count: 2 }]),
    encounter('the-long-march', 'travel', 'sum', 'endurance:0.5 constitution:0.5', 'field-surgery herbalism', 0.3,
      [], [{ kind: 'injury', typeKey: 'bruised-ribs', chance: 0.15, count: 1 }, { kind: 'morale', delta: -2 }]),
    encounter('the-flooded-ford', 'travel', 'best', 'strength:0.5 perception:0.5', 'tactics', 0.18,
      [], [{ kind: 'wealth', factor: 0.9 }]),
    encounter('lost-in-the-fells', 'travel', 'best', 'perception:0.5 wits:0.5', 'herbalism stealth', 0.18,
      [{ kind: 'xp', factor: 1.1 }], [{ kind: 'injury', typeKey: 'shattered-knee', chance: 0.1, count: 1 }]),
    encounter('a-hostile-reeve', 'social', 'best', 'diplomacy:0.5 charisma:0.5', 'benediction', 0.18,
      [{ kind: 'fame', delta: 1 }], [{ kind: 'fame', delta: -1 }]),
    encounter('the-patrons-steward', 'social', 'best', 'leadership:0.5 diplomacy:0.5', '', 0.18,
      [{ kind: 'wealth', factor: 1.1 }], [{ kind: 'wealth', factor: 0.9 }]),
    encounter('the-sealed-door', 'arcane', 'best', 'arcana:0.5 spelllore:0.5', 'runecraft warding', 0.18,
      [{ kind: 'xp', factor: 1.1 }], [{ kind: 'injury', typeKey: 'deep-cut', chance: 0.15, count: 1 }]),
    encounter('a-restless-power', 'arcane', 'sum', 'power:0.5 resistance:0.5', 'warding evocation', 0.3,
      [{ kind: 'fame', delta: 1 }], [{ kind: 'death', chance: 0.02 }]),
    encounter('past-the-watch', 'stealth', 'best', 'dexterity:0.5 wits:0.5', 'stealth lockpicking', 0.18,
      [], [{ kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 1 }, { kind: 'fame', delta: -1 }]),
    encounter('the-trapped-passage', 'stealth', 'best', 'dexterity:0.5 perception:0.5', 'trapcraft lockpicking', 0.18,
      [{ kind: 'wealth', factor: 1.1 }], [{ kind: 'injury', typeKey: 'broken-arm', chance: 0.2, count: 1 }]),
  ]),
  // The core's six (M4-S3, DL-45): key, requirement, bonus, and the Encounter kinds when it has them.
  synergies: Object.fromEntries([
    synergy('sword-and-salve', { classes: { warrior: 1, healer: 1 } }, { flat: 2 }, ['combat', 'travel']),
    synergy('shadow-and-spell', { classes: { rogue: 1, mage: 1 } }, { factor: 1.1 }, ['stealth', 'arcane']),
    synergy('shield-wall', { classes: { warrior: 3 } }, { factor: 1.15 }, ['combat']),
    synergy('a-full-company', { classes: { warrior: 1, rogue: 1, mage: 1, healer: 1 } }, { flat: 1, factor: 1.05 }),
    synergy('wards-and-blessings', { skills: ['warding', 'benediction'] }, { flat: 3 }, ['arcane', 'combat']),
    synergy('scouting-ahead', { skills: ['tactics', 'stealth'] }, { flat: 2 }, ['travel', 'stealth']),
  ]),
  // The core's twenty (M5-S1, DL-48): nine common gear, three a slot at three grades; six common
  // consumables, two of each effect; five unique gear, Loot only.
  items: Object.fromEntries([
    gear('short-sword', 'weapon', 'weaponry:1', 40, ['plain']),
    gear('arming-sword', 'weapon', 'weaponry:2 strength:1', 120, ['fine']),
    gear('masterwork-blade', 'weapon', 'weaponry:3 strength:2', 300, ['masterwork']),
    gear('padded-jack', 'armour', 'constitution:1', 40, ['plain']),
    gear('mail-shirt', 'armour', 'constitution:2 endurance:1', 120, ['fine']),
    gear('plate-harness', 'armour', 'constitution:3 endurance:2 dexterity:-1', 300, ['masterwork']),
    gear('lucky-charm', 'trinket', 'courage:1', 40, ['plain']),
    gear('silver-amulet', 'trinket', 'willpower:2 spirit:1', 120, ['fine']),
    gear('runed-circlet', 'trinket', 'arcana:3 spelllore:2', 300, ['masterwork']),
    consumable('whetstone', { kind: 'bonus', flat: 3, kinds: ['combat'] }, 25, ['tool']),
    consumable('lockpicks', { kind: 'bonus', flat: 3, kinds: ['stealth'] }, 25, ['tool']),
    consumable('grappling-line', { kind: 'reroll', kinds: ['travel', 'stealth'] }, 45, ['tool']),
    consumable('blessed-candle', { kind: 'reroll', kinds: ['arcane', 'social'] }, 60, ['holy']),
    consumable('healing-draught', { kind: 'heal', days: 5 }, 30, ['potion']),
    consumable('physicians-kit', { kind: 'heal', days: 10 }, 70, ['tool']),
    gear('barrow-kings-blade', 'weapon', 'weaponry:4 strength:2 courage:1', null, ['relic'], true),
    gear('vault-wardens-staff', 'weapon', 'arcana:3 power:3', null, ['relic'], true),
    gear('mantle-of-the-fells', 'armour', 'endurance:3 constitution:2 adaptability:1', null, ['relic'], true),
    gear('lantern-of-stannary', 'trinket', 'perception:3 wits:2', null, ['relic'], true),
    gear('abbots-reliquary', 'trinket', 'spirit:3 willpower:2 resistance:1', null, ['relic', 'holy'], true),
  ]),
  // The core's two (M5-S5, DL-52), by difficulty band: each entry `definition:weight:quantity range`.
  lootTables: Object.fromEntries([
    lootTable(
      'lesser-loot',
      'whetstone:16:1-3 lockpicks:16:1-3 healing-draught:16:1-3 grappling-line:10:1-2 blessed-candle:8:1-2 ' +
        'physicians-kit:8:1 arming-sword:7:1 mail-shirt:7:1 silver-amulet:6:1 ' +
        'barrow-kings-blade:2:1 mantle-of-the-fells:2:1 abbots-reliquary:2:1',
    ),
    lootTable(
      'greater-loot',
      'healing-draught:13:2-4 physicians-kit:12:1-2 grappling-line:9:1-3 blessed-candle:9:1-3 ' +
        'arming-sword:6:1 mail-shirt:6:1 silver-amulet:6:1 masterwork-blade:8:1 plate-harness:8:1 runed-circlet:8:1 ' +
        'barrow-kings-blade:3:1 vault-wardens-staff:3:1 mantle-of-the-fells:3:1 lantern-of-stannary:3:1 abbots-reliquary:3:1',
    ),
  ]),
  // Pictures of the test's own (v1.1.2-S3): two and three for the Guildmaster, so a Portrait is chosen
  // among each sex's, and one Hero's, which is no Guildmaster's.
  portraits: {
    guildmaster: { female: ['gm-female-01', 'gm-female-02'], male: ['gm-male-01', 'gm-male-02', 'gm-male-03'] },
    hero: { female: ['hero-female-01'], male: [] },
    patron: { female: [], male: [] },
  },
  // What a picture shows (v1.1.2-S4, its fields v1.1.3-S1's): every picture has its row (v1.1.3-S5),
  // and a Guildmaster with one takes its narrative for their Appearance (v1.1.2-S5).
  portraitAppearances: {
    features: {
      beard: { maleOnly: true, shows: [] },
      braids: { maleOnly: false, shows: [] },
      scar: { maleOnly: false, shows: ['scarred'] },
    },
    portraits: {
      'gm-male-01': {
        apparentAge: [40, 50],
        station: 'common',
        callings: ['soldier'],
        temper: 'stern',
        features: ['beard'],
        narrative: 'A bearded face in a picture.',
        hooks: [],
      },
      'gm-female-01': {
        apparentAge: [22, 30],
        station: 'gentry',
        callings: ['soldier'],
        temper: 'composed',
        features: ['braids'],
        narrative: 'A braided head in a picture.',
        hooks: [],
      },
      // Rows for the rest (v1.1.3-S5), so that every picture fits someone: each sex has a young and
      // an older picture, and a man's from 28 to 40 reaches both bands.
      'gm-female-02': {
        apparentAge: [38, 50],
        station: 'common',
        callings: ['scholar'],
        temper: 'stern',
        features: [],
        narrative: 'A lined face in a picture.',
        hooks: ['{He} keeps a lamp lit late.'],
      },
      'gm-male-02': {
        apparentAge: [28, 40],
        station: 'gentry',
        callings: ['merchant'],
        temper: 'composed',
        features: ['beard'],
        narrative: 'A trimmed beard in a picture.',
        hooks: ['{He} kept a ledger of every debt.'],
      },
      'gm-male-03': {
        apparentAge: [21, 30],
        station: 'common',
        callings: ['scholar', 'soldier'],
        temper: 'stern',
        features: [],
        narrative: 'A young face in a picture.',
        hooks: [],
      },
      'hero-female-01': {
        apparentAge: [18, 30],
        station: 'common',
        classes: ['warrior'],
        temper: 'stern',
        features: ['braids', 'scar'],
        narrative: 'A scarred young face in a picture.',
        hooks: [],
      },
    },
  },
  // What the descriptive Attributes are written from (v1.1.2-S5): two age bands, a phrase or two a
  // slot, and Biography sentences for two of the three Guild Backgrounds and two of the six Traits.
  descriptions: {
    ageBands: [
      { key: 'young', from: 0 },
      { key: 'older', from: 36 },
    ],
    pronouns: {
      female: { he: 'she', him: 'her', his: 'her', He: 'She', His: 'Her' },
      male: { he: 'he', him: 'him', his: 'his', He: 'He', His: 'His' },
    },
    birthplaces: ['Saltcote', 'Hob\'s Ferry', 'Crane Marsh'],
    // The vocabulary a picture is read in (v1.1.3-S1): no rule reads it; a Portrait is chosen by it (v1.1.3-S5).
    stations: ['common', 'gentry'],
    tempers: ['stern', 'composed'],
    callings: {
      soldier: { suits: ['old-soldier'], clashes: [] },
      scholar: { suits: [], clashes: ['mistrusts-magic'] },
      merchant: { suits: ['thrifty'], clashes: ['spendthrift'] },
    },
    appearance: {
      female: {
        young: descriptionPhrases('young', 'female'),
        older: descriptionPhrases('older', 'female'),
      },
      male: {
        young: { ...descriptionPhrases('young', 'male'), facialHair: ['A young beard.', 'A young moustache.'] },
        older: { ...descriptionPhrases('older', 'male'), facialHair: ['An older beard.'] },
      },
    },
    biography: {
      origins: { young: ['{He} was born in {birthplace}.'], older: ['{He} left {birthplace} long ago.', '{His} people came from {birthplace}.'] },
      careers: { young: ['{He} carried loads.'], older: ['{He} kept an inn for {his} life.'] },
      backgrounds: { 'old-charter': ['{He} took the old charter.'], breakaway: ['{He} broke away.'] },
      traits: { 'old-soldier': ['{He} was a soldier.'], thrifty: ['{He} counts coins.', 'Nothing is wasted by {him}.'] },
      closings: { young: ['{He} is young.'], older: ['{He} is old.'] },
      successors: ['{He} took the chair.'],
      // By a picture's Station, Calling and Temper (v1.1.3-S1): the Biography with a picture (v1.1.3-S5).
      stationOrigins: { common: ['{He} was born common in {birthplace}.'] },
      callingCareers: { soldier: { young: ['{He} carried a pike.'] } },
      temperClosings: { stern: ['{He} is stern.'] },
    },
    // A Hero's (v1.1.3-S1): no rule reads them yet.
    heroBiography: {
      backgrounds: { 'farm-born': ['{He} grew up on a farm.'] },
      classes: { warrior: { young: ['{He} fought young.'], older: ['{He} fought long.'] } },
      traits: { scarred: ['{He} is scarred.'] },
      closings: { young: ['{He} is young.'], older: ['{He} is old.'] },
    },
  },
});

/** A test age band's Appearance phrases but `facialHair`: `Build (young female).`, two of each slot. */
function descriptionPhrases(band: string, sex: Sex): Omit<AppearancePhrases, 'facialHair'> {
  const slot = (name: string): string[] => [`${name} one (${band} ${sex}).`, `${name} two (${band} ${sex}).`];
  return {
    build: slot('Build'),
    face: slot('Face'),
    hair: slot('Hair'),
    eyes: slot('Eyes'),
    mark: slot('Mark'),
    bearing: slot('Bearing'),
  };
}

/** `content` (the test content by default) with no pictures of any role or sex, as the core's until v1.1.2-S4. */
export function withoutPortraits(content: ContentSet = testContent): ContentSet {
  const none = () => ({ female: [], male: [] });
  return deepFreeze({ ...content, portraits: { guildmaster: none(), hero: none(), patron: none() } });
}

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
  'gm-portraits',
  'descriptions',
  'hero-portraits',
  'hero-descriptions',
] as const;

/** `encounter`'s one Check (v1.1.4-S1): an Encounter has one until v1.1.4-S2. */
export function onlyCheck(encounter: Pick<Encounter, 'key' | 'checks'>): EncounterCheck {
  const [only] = encounter.checks;
  if (only === undefined) throw new RangeError(`Encounter ${encounter.key} has no Check`);
  return only;
}

/** `encounter` with `difficultyFactor` on every Check (v1.1.4-S1). */
export function withFactor(encounter: Encounter, difficultyFactor: number): Encounter {
  return { ...encounter, checks: encounter.checks.map((it) => ({ ...it, difficultyFactor })) };
}

/** `heroes`' capability on `encounter`'s one Check, the Party taken as the Quest Engine takes it (`queryParty`). */
export function encounterCapability(heroes: readonly Hero[], encounter: Encounter, world: World, deps: EngineDeps): number {
  return capability(queryParty(heroes, world, deps), encounter, onlyCheck(encounter), world, deps);
}

/** Checks `heroes` on `encounter`'s one Check, the Party taken as the Quest Engine takes it (`queryParty`). */
export function encounterCheck(
  heroes: readonly Hero[],
  encounter: Encounter,
  quest: { difficulty: number },
  world: World,
  deps: EngineDeps,
  bonus = 0,
): CheckResult {
  return check(queryParty(heroes, world, deps), encounter, onlyCheck(encounter), quest, world, deps, bonus);
}

/** The test content, or `content`, with the default config, or with `overrides` on it. */
export function testDeps(overrides: Partial<GameConfig> = {}, content: ContentSet = testContent): EngineDeps {
  return { config: { ...defaultConfig, ...overrides }, content };
}

/**
 * `content` (the test content by default) with `fields` set on every Encounter, frozen: for a test
 * that must say what every Check does or what every outcome costs, whichever Encounters a Quest is
 * drawn with (M4-S2). `difficultyFactor` is set on every Check (v1.1.4-S1). `consequences` replaces
 * both lists; `success` or `failure` replaces one.
 */
export function withEncounters(
  fields: Partial<Pick<EncounterCheck, 'difficultyFactor'>> & {
    success?: Consequence[];
    failure?: Consequence[];
  },
  content: ContentSet = testContent,
): ContentSet {
  const { success, failure, difficultyFactor } = fields;
  const encounters = Object.fromEntries(
    Object.entries(content.encounters).map(([key, row]): [string, Encounter] => [
      key,
      {
        ...structuredClone(row),
        checks: row.checks.map((it) => ({ ...structuredClone(it), ...(difficultyFactor === undefined ? {} : { difficultyFactor }) })),
        consequences: {
          success: structuredClone(success ?? row.consequences.success),
          failure: structuredClone(failure ?? row.consequences.failure),
        },
      },
    ]),
  );
  return deepFreeze({ ...content, encounters });
}

/**
 * `content` (the test content by default) with `weights` set on every Disposition, frozen: for a
 * test that must say what every Rival does whichever Disposition it was dealt (M6-S1, DL-56), as
 * a test once pinned `recruitWealthMultiple` and `buildWealthMultiple` in the config.
 */
export function withDispositions(
  weights: Partial<Omit<Disposition, 'key' | 'name'>>,
  content: ContentSet = testContent,
): ContentSet {
  const dispositions = Object.fromEntries(
    Object.entries(content.dispositions).map(([key, row]): [string, Disposition] => [key, { ...row, ...weights }]),
  );
  return deepFreeze({ ...content, dispositions });
}

/**
 * Rivals who never recruit, build or buy gear, whatever their Wealth, but still equip and take Quests
 * as their Dispositions say: for a test that watches the pool, a Hall, the Market or Wealth and must
 * not meet a Rival's purchase (as `recruitWealthMultiple` and `buildWealthMultiple` of 1,000,000 once
 * did; `gearThreshold` from M6-S4, DL-58).
 */
export const thriftyRivals = { recruitThreshold: 1_000_000, buildThreshold: 1_000_000, gearThreshold: 1_000_000 } as const;

/** No consequence on either outcome: nobody is hurt and nothing but the band moves the outcome. */
export const harmlessContent: ContentSet = withEncounters({ success: [], failure: [] });

/**
 * Every failed Check kills one Hero and then injures one of the living with `broken-arm`, each
 * certainly, so a Party of two or more sent through one failed Encounter loses one Hero and brings
 * one home hurt; a success costs nothing (M4-S2). For tests of harm, which make the Check fail.
 */
export const certainHarmContent: ContentSet = withEncounters({
  success: [],
  failure: [
    { kind: 'death', chance: 1 },
    { kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 },
  ],
});

/**
 * An empty world at Turn 0 with a stream for each of `names`, seeded from `seed`: the core's
 * streams by default. A test that must see other streams stand still names them here.
 */
export function testWorld(seed: string, deps: EngineDeps, names: readonly string[] = streamNames): World {
  const meta: Meta = {
    version: schemaVersion,
    seed,
    content: { id: deps.content.id, version: deps.content.version },
    configVersion,
    config: { ...deps.config },
    createdAt: 'test',
  };
  // Every core stream is among `names` or the world is unusable; a test adds names, never drops one.
  const rng = { ...createStreams(seed, names), ...createStreams(seed, streamNames) };
  return emptyDocument(meta, rng).world;
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────

export const testMeta: Meta = {
  version: schemaVersion,
  seed: 'amber-fox-4821',
  content: { id: testContent.id, version: testContent.version },
  configVersion,
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
      transferredOnTurn: null,
      portraitKey: null,
      appearance: `An Appearance of ${id}.`,
      biography: `A Biography of ${id}.`,
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
      birthplace: '',
      appearance: '',
      biography: '',
      // The player's a picture of his sex (v1.1.2-S3), the Rivals' the Silhouette.
      portraitKey: g === 0 ? 'gm-male-01' : null,
      retiredOnTurn: null,
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
  world.patrons[patron] = { id: patron, name: 'Lady Maud of Stannary', sex: 'female', sphereKey: 'crown', regard: {} };
  world.patrons[secondPatron] = { id: secondPatron, name: 'Abbot Cenric', sex: 'male', sphereKey: 'church', regard: {} };
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
  const stack = (definitionKey: string, quantity: number, holder: Holder): StackId => {
    const id = next('stacks');
    world.stacks[id] = { id, definitionKey, quantity, holder };
    return id;
  };
  const marketStack = stack('healing-draught', 12, { kind: 'market' });
  const guildStack = stack('healing-draught', 3, { kind: 'guild', id: playerGuild });
  const partyStack = stack('healing-draught', 2, { kind: 'party', id: party });
  const heroStack = stack('padded-jack', 1, { kind: 'hero', id: partyHero, slot: 'armour' });

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
