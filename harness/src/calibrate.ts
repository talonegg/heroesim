// The calibration (v1.1.4-S9, DL-162, the epic's S9): how hard each Check, Encounter and Quest
// template is, for Parties the real generators make, before content is written. A Check's factor
// means nothing on its own (the epic's §4: the aggregates differ in scale), so every rate here is
// read through the chance estimate (`estimateQuest`, v1.1.4-S5), and a sample of them is held to
// the resolver (`resolveQuest`).
//
// - *Heroes.* For each Level (1, 5 and 10), a pool of Heroes drawn by the Heroes Generator into a
//   world of their own, each raised to the Level by the engine's own growth (`growOneLevel`), as
//   the `levelUps` phase raises them: unattached, at the Morale baseline, carrying nothing.
// - *Each Encounter and its Checks.* For each Level and Party size (1 to 5), `parties` Parties
//   drawn at random from the pool, each estimated on a Quest of that one Encounter at each
//   difficulty; each Degree's rate is the mean of their chances, the Encounter's and each Check's.
// - *Each template.* For each Level, Quests drawn by the Quest Generator (`generateQuest`) for the
//   template, their Encounters and difficulty as the game draws them, binned by the third of the
//   template's difficulty range they fall in. For each, the Best Party (`bestParties`) of a Roster of
//   `roster` Heroes of the pool (the Board's "Your best Party", the harness's policy's Party), and
//   Parties of each size the template allows drawn at random, each meeting its requirements; each
//   Quest band's rate, and the positive Earned Traits a Quest draws.
// - *The spot-check.* Some of the Encounters' cells and of the templates' Quests, each resolved for
//   `spotSeeds` seeds, no one falling (`harmless`, estimate.ts), held to the estimate.
// - *The coverage grid.* Each Hero Stat's Checks by kind: the Checks whose score adds the Stat into
//   its value (not those that only choose or filter by it), the gate's "every Hero Stat read by at
//   least three Checks across at least two kinds".
//
// Draft content is calibrated before it is in `content/`: a directory of content files and folders,
// each in place of the core's of its name (`loadDrafts`, content's Node entry; a folder whole, DL-260). `npm run harness -- calibrate`
// (calibrate.harness.test.ts) writes the report and its data under `docs/quests/`.

import { join } from 'node:path';
import { contentDir, loadDrafts } from '@heroesim/content/node';
import {
  bestParties,
  chanceToReach,
  createWorld,
  degrees,
  describeQuery,
  difficultyBand,
  encounterKinds,
  generateHero,
  generateQuest,
  growOneLevel,
  offeredTiers,
  passDegree,
  passOf,
  playerGuild,
  questBands,
  resolveQuest,
  tierFigures,
  type CheckKey,
  type ContentSet,
  type Degree,
  type DegreeChances,
  type Encounter,
  type EncounterKind,
  type EngineDeps,
  type GameConfig,
  type Guild,
  type Hero,
  type Party,
  type Patron,
  type Quest,
  type QuestBand,
  type QuestEstimate,
  type QuestTemplate,
  type QueryAccount,
  type StatKey,
  type ValAccount,
  type World,
} from '@heroesim/engine';
import { harnessSetup } from './creation.js';
import { drawer, harmless, questsStream } from './estimate.js';
import { markdownTable, type Machine } from './report.js';

/** What a calibration reads, and how much. */
export interface CalibrationSettings {
  /** The Levels the Heroes are raised to (the epic's S9: 1, 5 and 10). */
  levels: number[];
  /** The Party sizes (1 to 5). */
  sizes: number[];
  /** The difficulties each Encounter is met at. */
  difficulties: number[];
  /** Heroes drawn for each Level's pool. */
  pool: number;
  /** Random Parties for each Level and size, on the Encounters; for each Quest and size, on the templates (a tenth of it). */
  parties: number;
  /** Quests drawn for each template and Level. */
  questsPerTemplate: number;
  /** The Roster the best Party is chosen from: the harness's policy keeps 8. */
  roster: number;
  /** Encounter cells and template Quests resolved for the spot-check. */
  spotSamples: number;
  /** Seeds each spot-check sample is resolved for. */
  spotSeeds: number;
}

export const defaultCalibration: Readonly<CalibrationSettings> = Object.freeze({
  levels: [1, 5, 10],
  sizes: [1, 2, 3, 4, 5],
  difficulties: [20, 40, 60, 80, 100],
  pool: 300,
  parties: 120,
  questsPerTemplate: 48,
  roster: 8,
  spotSamples: 24,
  spotSeeds: 4000,
});

/** The draft content directory, `docs/quests/drafts/`, from the repository's root. */
export const draftsDir = join(contentDir, '..', 'docs', 'quests', 'drafts');

// Draft content, read as the game reads content: content's Node entry (v1.1.4-S9).
export { loadDrafts };

// --- What a Check reads ---------------------------------------------------------------------------

/**
 * The Stats `account` adds into its value, once each, in order: those its aggregates, rankings and
 * chosen Heroes' values read, and not those it only chooses or filters by (`statsIn` gives both). So
 * "Wits of the least agile Hero" adds Wits, not Dexterity.
 */
export function statsAdded(account: QueryAccount): StatKey[] {
  const found: StatKey[] = [];
  const add = (statKey: StatKey): void => {
    if (!found.includes(statKey)) found.push(statKey);
  };
  const val = (it: ValAccount): void => {
    if (it.kind === 'stat') add(it.statKey);
    else if (it.kind === 'weighted') it.stats.filter(({ weight }) => weight !== 0).forEach(({ statKey }) => add(statKey));
    else if (it.kind === 'arithmetic') it.operands.forEach(val);
  };
  const num = (it: QueryAccount): void => {
    if (it.kind === 'aggregate' || it.kind === 'ranked' || it.kind === 'hero') val(it.value);
    else if (it.kind === 'arithmetic') it.operands.forEach(num);
  };
  num(account);
  return found;
}

/** One cell of the coverage grid: a Hero Stat, and the Checks that add it, by kind. */
export interface Coverage {
  statKey: StatKey;
  name: string;
  /** Each kind's Checks that add the Stat, as `encounter-key/check-key`. */
  byKind: Record<EncounterKind, string[]>;
  checks: number;
  kinds: number;
  /** At least `checksAtLeast` Checks across at least `kindsAtLeast` kinds (the epic's gate: 3 and 2). */
  met: boolean;
}

/** The gate's coverage (DL-148 item 21): every Hero Stat read by at least three Checks across two kinds. */
export const checksAtLeast = 3;
export const kindsAtLeast = 2;

/** Each Hero Stat's Checks by kind (`statsAdded`), over every Encounter of `content`, Finales included. */
export function coverageGrid(content: ContentSet): Coverage[] {
  const heroStats = Object.values(content.stats).filter((stat) => stat.owner === 'hero');
  return heroStats.map((stat) => {
    const byKind = Object.fromEntries(encounterKinds.map((kind) => [kind, [] as string[]])) as Record<EncounterKind, string[]>;
    for (const encounter of Object.values(content.encounters)) {
      for (const it of encounter.checks) {
        if (statsAdded(describeQuery(it.score)).includes(stat.key)) byKind[encounter.kind].push(`${encounter.key}/${it.key}`);
      }
    }
    const checks = encounterKinds.reduce((total, kind) => total + byKind[kind].length, 0);
    const kinds = encounterKinds.filter((kind) => byKind[kind].length > 0).length;
    return { statKey: stat.key, name: stat.name, byKind, checks, kinds, met: checks >= checksAtLeast && kinds >= kindsAtLeast };
  });
}

// --- Heroes and Parties ---------------------------------------------------------------------------

/** A Level's Heroes: `count` of them drawn into a world of their own and raised to `level`. */
export interface Pool {
  level: number;
  world: World;
  guild: Guild;
  heroes: Hero[];
}

/**
 * `count` Heroes drawn by the Heroes Generator into a world created from `seed`, each raised to
 * `level` by the engine's growth, a Level at a time from the `progression` stream, as the `levelUps`
 * phase raises a Hero. Unattached, so at the Morale baseline, steady, and carrying nothing.
 */
export function heroPool(seed: string, level: number, count: number, deps: EngineDeps): Pool {
  const { world } = createWorld(seed, harnessSetup, deps).document;
  const heroes = Array.from({ length: count }, () => {
    const { hero } = generateHero(world, deps, { stream: 'pool' });
    for (let at = 1; at < level; at += 1) growOneLevel(hero, world.rng.progression, deps);
    hero.level = level;
    return hero;
  });
  return { level, world, guild: playerGuild(world) as Guild, heroes };
}

/** `size` distinct Heroes of `heroes`, drawn by `draw`; those `first` names lead, in its order. */
function partyOf(heroes: readonly Hero[], size: number, draw: () => number, first: readonly Hero[] = []): Hero[] {
  const party = [...first];
  while (party.length < size && party.length < heroes.length) {
    const hero = heroes[Math.floor(draw() * heroes.length)] as Hero;
    if (!party.includes(hero)) party.push(hero);
  }
  return party;
}

/** A Quest of `encounterKeys` at `difficulty`, as the estimate and the resolver read one: a day long. */
function questOf(template: Quest, difficulty: number, encounterKeys: string[]): Quest {
  const beatLines = encounterKeys.map(() => 'A Beat of the calibration.');
  return { ...template, difficulty, encounterKeys, beatLines, durationTurns: 3, lootTableKey: null, requirements: { partySizeMin: 1, partySizeMax: 5 } };
}

// --- The rates --------------------------------------------------------------------------------------

/** Each Degree's rate at a Level, a Party size and a difficulty. */
export interface Cell {
  level: number;
  size: number;
  difficulty: number;
  degrees: DegreeChances;
}

export interface CheckCalibration {
  key: CheckKey;
  name: string;
  /** The Stats its score adds (`statsAdded`). */
  adds: StatKey[];
  cells: Cell[];
}

export interface EncounterCalibration {
  key: string;
  name: string;
  kind: EncounterKind;
  /** The templates that name it as their Finale. */
  finaleOf: string[];
  cells: Cell[];
  checks: CheckCalibration[];
}

/** The difficulty thirds of a template's range. */
export const thirds = ['low', 'mid', 'high'] as const;
export type Third = (typeof thirds)[number];

/** A Quest band's rates, and how many Quests they are of. */
export interface BandRates {
  quests: number;
  bands: Record<QuestBand, number>;
}

export interface TemplateRow {
  level: number;
  third: Third;
  /** The difficulties of the Quests drawn in this third, lowest and highest. */
  difficulty: [number, number];
  /** The best Party from a Roster: its rates, its mean size, and the positive Earned Traits a Quest draws. */
  best: BandRates & { size: number; traitsDrawn: number };
  /** Random Parties of each size the template allows, meeting its requirements. */
  bySize: Record<number, BandRates>;
}

export interface TemplateCalibration {
  key: string;
  name: string;
  finale: string | null;
  sizes: [number, number];
  /** Quests whose Roster could not staff them in 50 draws, left out. */
  unstaffed: number;
  rows: TemplateRow[];
}

/** The spot-check: estimate against the resolver. */
export interface SpotCheck {
  samples: number;
  seeds: number;
  /** Chances compared. */
  compared: number;
  /** The widest gap in points, where, and in standard errors of the rate. */
  widest: { gap: number; errors: number; at: string };
  /** The widest gap of a chance from 1% to 99%, in standard errors. */
  widestErrors: number;
}

export interface Calibration {
  settings: CalibrationSettings;
  drafted: string[];
  contentVersion: number;
  encounters: EncounterCalibration[];
  templates: TemplateCalibration[];
  coverage: Coverage[];
  spot: SpotCheck;
}

const zero = (): DegreeChances => ({ failure: 0, setback: 0, success: 0, triumph: 0 });
const noBands = (): Record<QuestBand, number> => ({ fail: 0, success: 0, strong: 0 });

/** Adds `chances` times `weight` into `into`. */
function addInto<K extends string>(into: Record<K, number>, chances: Readonly<Record<K, number>>, weight: number): void {
  for (const key of Object.keys(chances) as K[]) into[key] += chances[key] * weight;
}

/** The finales `content`'s templates name, by Encounter. */
function finalesOf(content: ContentSet): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const template of Object.values(content.questTemplates)) {
    if (template.finale !== undefined) found.set(template.finale, [...(found.get(template.finale) ?? []), template.key]);
  }
  return found;
}

/**
 * Each Encounter's, and each of its Checks', Degree rates by Level, size and difficulty: for each
 * Level and size, `settings.parties` random Parties of `pools`, each estimated alone on a Quest of the
 * one Encounter at each difficulty.
 */
export function calibrateEncounters(pools: readonly Pool[], settings: CalibrationSettings, deps: EngineDeps): EncounterCalibration[] {
  const { content } = deps;
  const finales = finalesOf(content);
  const encounters = Object.values(content.encounters).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const results = encounters.map(
    (encounter): EncounterCalibration => ({
      key: encounter.key,
      name: encounter.name,
      kind: encounter.kind,
      finaleOf: finales.get(encounter.key) ?? [],
      cells: [],
      checks: encounter.checks.map((it) => ({ key: it.key, name: it.name, adds: statsAdded(describeQuery(it.score)), cells: [] })),
    }),
  );
  for (const pool of pools) {
    // One Best Party module a pool, its world unchanged here: each Hero brought home once (DL-237).
    const best = bestParties(pool.world, pool.guild, deps);
    const draw = drawer(`calibrate-parties-${pool.level}`);
    const partiesBySize = settings.sizes.map((size) => ({ size, parties: Array.from({ length: settings.parties }, () => partyOf(pool.heroes, size, draw)) }));
    const template = pool.world.quests[pool.world.board[0] as Quest['id']] as Quest;
    for (const difficulty of settings.difficulties) {
      for (const [index, encounter] of encounters.entries()) {
        const result = results[index] as EncounterCalibration;
        const quest = questOf(template, difficulty, [encounter.key]);
        for (const { size, parties } of partiesBySize) {
          const rates = zero();
          const checks = encounter.checks.map(zero);
          for (const party of parties) {
            const it = (best.chance(quest, party) as QuestEstimate).encounters[0];
            if (it === undefined) continue;
            addInto(rates, it.degrees, 1 / parties.length);
            it.checks.forEach((check, at) => addInto(checks[at] as DegreeChances, check.degrees, 1 / parties.length));
          }
          result.cells.push({ level: pool.level, size, difficulty, degrees: rates });
          result.checks.forEach((check, at) => check.cells.push({ level: pool.level, size, difficulty, degrees: checks[at] as DegreeChances }));
        }
      }
    }
  }
  return results;
}

/** A range of difficulties, from its `difficultyMin` to its `difficultyMax`. */
export interface DifficultyRange {
  difficultyMin: number;
  difficultyMax: number;
}

/**
 * The difficulties `template`'s Quests are drawn at under `config` (DL-262): from the bottom of the
 * band of the lowest Tier it offers to the top of the highest's, its overrides read, held in the scale.
 */
export function difficultyRange(template: QuestTemplate, config: GameConfig): DifficultyRange {
  const bands = offeredTiers(template, config).map((tier) => difficultyBand(tierFigures(template, tier, config), config));
  return { difficultyMin: Math.min(...bands.map(([low]) => low)), difficultyMax: Math.max(...bands.map(([, high]) => high)) };
}

/** Which third of a template's difficulty range (`difficultyRange`) `difficulty` falls in. */
export function thirdOf(range: DifficultyRange, difficulty: number): Third {
  const span = range.difficultyMax - range.difficultyMin;
  const share = span > 0 ? (difficulty - range.difficultyMin) / span : 0;
  return share < 1 / 3 ? 'low' : share < 2 / 3 ? 'mid' : 'high';
}

/** Whether `heroes` meet `quest`'s Class and Skill requirements. */
function meets(quest: Quest, heroes: readonly Hero[]): boolean {
  const { classKey, skillKey } = quest.requirements;
  return (
    (classKey === undefined || heroes.some((hero) => hero.classKey === classKey)) &&
    (skillKey === undefined || heroes.some((hero) => (hero.skills[skillKey] ?? 0) > 0))
  );
}

/** A Hero of `heroes` for each of `quest`'s requirements, drawn by `draw`; none when it has none. */
function requiredOf(quest: Quest, heroes: readonly Hero[], draw: () => number): Hero[] {
  const { classKey, skillKey } = quest.requirements;
  const chosen: Hero[] = [];
  const one = (of: (hero: Hero) => boolean): void => {
    const fit = heroes.filter(of);
    const hero = fit[Math.floor(draw() * fit.length)];
    if (hero !== undefined && !chosen.includes(hero)) chosen.push(hero);
  };
  if (classKey !== undefined) one((hero) => hero.classKey === classKey);
  if (skillKey !== undefined && !chosen.some((hero) => (hero.skills[skillKey] ?? 0) > 0)) one((hero) => (hero.skills[skillKey] ?? 0) > 0);
  return chosen;
}

/** The positive Earned Traits a Quest draws for a Party, by its estimate: each Triumph's `trait` consequences' chances. */
function traitsDrawn(estimate: QuestEstimate, content: ContentSet): number {
  let drawn = 0;
  for (const it of estimate.encounters) {
    const triumph = content.encounters[it.encounterKey]?.consequences.triumph ?? [];
    for (const consequence of triumph) if (consequence.kind === 'trait') drawn += it.degrees.triumph * consequence.chance;
  }
  return drawn;
}

/**
 * Each template's Quest band rates by Level and difficulty third: `settings.questsPerTemplate` Quests
 * drawn by the Quest Generator at each Level, each met by the best Party of a Roster drawn from the
 * pool (redrawn until it can staff the Quest, at most 50 times) and by random Parties of each size the
 * template allows.
 */
export function calibrateTemplates(pools: readonly Pool[], settings: CalibrationSettings, deps: EngineDeps): TemplateCalibration[] {
  const { content } = deps;
  const templates = Object.values(content.questTemplates);
  const results = templates.map(
    (template): TemplateCalibration => ({
      key: template.key,
      name: template.name,
      finale: template.finale ?? null,
      sizes: [template.partySizeMin, template.partySizeMax],
      unstaffed: 0,
      rows: [],
    }),
  );
  const sizeParties = Math.max(4, Math.round(settings.parties / 10));
  for (const pool of pools) {
    const { world, guild } = pool;
    const draw = drawer(`calibrate-templates-${pool.level}`);
    for (const [index, template] of templates.entries()) {
      const result = results[index] as TemplateCalibration;
      const patron = Object.values(world.patrons).find((it: Patron) => template.sphereKeys.includes(it.sphereKey));
      if (patron === undefined) continue;
      const rows = new Map<Third, TemplateRow>();
      for (let n = 0; n < settings.questsPerTemplate; n += 1) {
        const { quest } = generateQuest(world, patron, deps, { templateKey: template.key });
        world.board = world.board.filter((id) => id !== quest.id);
        delete world.quests[quest.id];
        // Opened once the Quest is drawn, which moved the world (DL-237).
        const parties = bestParties(world, guild, deps);
        let roster = partyOf(pool.heroes, settings.roster, draw);
        for (let tries = 0; tries < 50 && !meets(quest, roster); tries += 1) roster = partyOf(pool.heroes, settings.roster, draw);
        const best = meets(quest, roster) ? parties.party(quest, roster) : null;
        if (best === null || best.estimate === null) {
          result.unstaffed += 1;
          continue;
        }
        const third = thirdOf(difficultyRange(template, deps.config), quest.difficulty);
        const row = rows.get(third) ?? {
          level: pool.level,
          third,
          difficulty: [quest.difficulty, quest.difficulty],
          best: { quests: 0, bands: noBands(), size: 0, traitsDrawn: 0 },
          bySize: {},
        };
        rows.set(third, row);
        row.difficulty = [Math.min(row.difficulty[0], quest.difficulty), Math.max(row.difficulty[1], quest.difficulty)];
        row.best.quests += 1;
        addInto(row.best.bands, best.estimate.bands, 1);
        row.best.size += best.heroIds.length;
        row.best.traitsDrawn += traitsDrawn(best.estimate, content);
        for (const size of settings.sizes) {
          if (size < template.partySizeMin || size > template.partySizeMax) continue;
          const rates = (row.bySize[size] ??= { quests: 0, bands: noBands() });
          for (let p = 0; p < sizeParties; p += 1) {
            const party = partyOf(pool.heroes, size, draw, requiredOf(quest, pool.heroes, draw));
            const it = parties.chance(quest, party);
            if (it === null) continue;
            rates.quests += 1;
            addInto(rates.bands, it.bands, 1);
          }
        }
      }
      for (const third of thirds) {
        const row = rows.get(third);
        if (row === undefined) continue;
        const { quests } = row.best;
        for (const band of questBands) row.best.bands[band] /= quests;
        row.best.size /= quests;
        row.best.traitsDrawn /= quests;
        for (const rates of Object.values(row.bySize)) for (const band of questBands) rates.bands[band] /= Math.max(1, rates.quests);
        result.rows.push(row);
      }
    }
  }
  return results;
}

/**
 * The spot-check: `settings.spotSamples` samples, half Encounters met alone by a random Party at a
 * random Level, size and difficulty, half template Quests met by a Roster's best Party, each resolved
 * for `settings.spotSeeds` seeds with no one falling (`harmless`), each Encounter's Degrees and the
 * Quest's bands compared with the estimate's.
 */
export function spotCheck(pools: readonly Pool[], settings: CalibrationSettings, deps: EngineDeps): SpotCheck {
  const safe: EngineDeps = { ...deps, content: harmless(deps.content) };
  const draw = drawer('calibrate-spot');
  const one = <T>(items: readonly T[]): T => items[Math.floor(draw() * items.length)] as T;
  const encounterKeys = Object.keys(safe.content.encounters);
  const templates = Object.values(safe.content.questTemplates);
  let compared = 0;
  let widest = { gap: 0, errors: 0, at: 'nothing compared' };
  let widestErrors = 0;
  for (let n = 0; n < settings.spotSamples; n += 1) {
    const pool = one(pools);
    const { world, guild } = pool;
    let quest: Quest;
    let heroes: Hero[];
    let label: string;
    if (n % 2 === 0) {
      const key = one(encounterKeys);
      const difficulty = one(settings.difficulties);
      quest = questOf(world.quests[world.board[0] as Quest['id']] as Quest, difficulty, [key]);
      heroes = partyOf(pool.heroes, one(settings.sizes), draw);
      label = `${key} at difficulty ${difficulty}, Level ${pool.level}, ${heroes.length} Heroes`;
    } else {
      const template = one(templates);
      const patron = Object.values(world.patrons).find((it: Patron) => template.sphereKeys.includes(it.sphereKey));
      if (patron === undefined) continue;
      quest = generateQuest(world, patron, safe, { templateKey: template.key }).quest;
      world.board = world.board.filter((id) => id !== quest.id);
      delete world.quests[quest.id];
      let roster = partyOf(pool.heroes, settings.roster, draw);
      for (let tries = 0; tries < 50 && !meets(quest, roster); tries += 1) roster = partyOf(pool.heroes, settings.roster, draw);
      const best = bestParties(world, guild, safe).party(quest, roster);
      if (best === null) continue;
      heroes = best.heroIds.map((id) => world.heroes[id] as Hero);
      label = `${template.key} at difficulty ${quest.difficulty}, Level ${pool.level}, ${heroes.length} Heroes`;
    }
    const estimate = bestParties(world, guild, safe).chance(quest, heroes);
    if (estimate === null) continue;
    const returns = world.turn + quest.durationTurns;
    const home: World = { ...world, turn: returns, rng: { ...world.rng } };
    const party: Party = { id: 'party-calibrate' as Party['id'], questId: quest.id, guildId: guild.id, heroIds: heroes.map((hero) => hero.id), departedOnTurn: world.turn, returnsOnTurn: returns };
    const encounterRates = estimate.encounters.map(zero);
    const bandRates = noBands();
    for (let at = 0; at < settings.spotSeeds; at += 1) {
      home.rng.quests = questsStream(`calibrate-spot-${n}/seed-${at}`);
      const { outcome, encounters } = resolveQuest(home, quest, party, safe);
      bandRates[outcome.band] += 1;
      for (const it of encounters) (encounterRates[it.index] as DegreeChances)[it.degree] += 1;
    }
    const pairs: [string, number, number][] = [
      ...estimate.encounters.flatMap((it, index) => degrees.map((degree): [string, number, number] => [`Encounter ${index + 1} ${degree}`, it.degrees[degree], (encounterRates[index] as DegreeChances)[degree] / settings.spotSeeds])),
      ...questBands.map((band): [string, number, number] => [`the Quest ${band}`, estimate.bands[band], bandRates[band] / settings.spotSeeds]),
    ];
    for (const [what, chance, rate] of pairs) {
      compared += 1;
      const gap = Math.abs(chance - rate);
      const errors = chance > 0.01 && chance < 0.99 ? gap / Math.sqrt((chance * (1 - chance)) / settings.spotSeeds) : 0;
      widestErrors = Math.max(widestErrors, errors);
      if (gap > widest.gap) widest = { gap, errors, at: `${label}: ${what}, estimated ${pct(chance)}, resolved ${pct(rate)}` };
    }
  }
  return { samples: settings.spotSamples, seeds: settings.spotSeeds, compared, widest, widestErrors };
}

/** The whole calibration of `deps.content` under `settings`. */
export function calibrate(settings: CalibrationSettings, deps: EngineDeps, drafted: string[] = []): Calibration {
  const pools = settings.levels.map((level) => heroPool(`calibrate-level-${level}`, level, settings.pool, deps));
  return {
    settings,
    drafted,
    contentVersion: deps.content.version,
    encounters: calibrateEncounters(pools, settings, deps),
    templates: calibrateTemplates(pools, settings, deps),
    coverage: coverageGrid(deps.content),
    spot: spotCheck(pools, settings, deps),
  };
}

// --- Tuning the factors -------------------------------------------------------------------------------

/**
 * One Encounter's chance of each Degree, from each Check's capability and target, as the estimate
 * works it out with no reroll: every combination of its Checks' Degrees read through its pass formula.
 */
export function encounterDegrees(encounter: Encounter, capabilities: readonly number[], targets: readonly number[], deps: Pick<EngineDeps, 'config'>): DegreeChances {
  const { checkDegrees, checkVariance } = deps.config;
  const each = encounter.checks.map((it, at): DegreeChances => {
    const capable = capabilities[at] ?? 0;
    const target = targets[at] ?? 0;
    const variance = it.variance ?? checkVariance;
    const reach = (threshold: number): number => chanceToReach(capable, variance, threshold * target);
    const triumph = reach(checkDegrees.triumph);
    const success = reach(checkDegrees.success);
    const setback = reach(checkDegrees.setback);
    return { triumph, success: success - triumph, setback: setback - success, failure: 1 - setback };
  });
  const pass = passOf(encounter);
  const result = zero();
  const walk = (at: number, chance: number, byKey: Record<CheckKey, Degree>): void => {
    if (chance === 0) return;
    if (at === encounter.checks.length) {
      result[passDegree(pass, byKey).degree] += chance;
      return;
    }
    const it = encounter.checks[at] as Encounter['checks'][number];
    for (const degree of degrees) walk(at + 1, chance * (each[at] as DegreeChances)[degree], { ...byKey, [it.key]: degree });
  };
  walk(0, 1, {});
  return result;
}

/**
 * What a tuning aims at: at `difficulty`, random Parties of `size` at `level` succeed at an Encounter
 * with `chance`. With `flatShare` (v1.1.4-S9's verification, DL-162), that share of each Check's
 * target at the aim is its `flat` term, the rest its factor times the difficulty, so that a target
 * grows more slowly than the difficulty: easy Quests harder, the hardest less hopeless.
 */
export interface TuningAim {
  level: number;
  size: number;
  difficulty: number;
  chance: number;
  flatShare?: number;
}

/** A Check as a tuning sets it: its difficulty factor, and its flat term when the aim has a flat share. */
export interface CheckTuning {
  difficultyFactor: number;
  flat?: number;
}

/** Where the drafts were tuned (v1.1.4-S9): random Parties of 3 at Level 5, at difficulty 60. */
export const defaultTuningAim: Readonly<Omit<TuningAim, 'chance'>> = Object.freeze({ level: 5, size: 3, difficulty: 60 });

/**
 * Where `encounter` is tuned: at `aim`, but a Finale (v1.1.4-S9's verification) at the middle of its
 * template's difficulties under `config` (`difficultyRange`), with Parties of the aim's size brought
 * within the template's sizes; the first template's, when it ends more than one.
 */
export function aimOf(encounter: Encounter, aim: TuningAim, content: ContentSet, config: GameConfig): TuningAim {
  const template = Object.values(content.questTemplates).find((it) => it.finale === encounter.key);
  if (template === undefined) return aim;
  const { difficultyMin, difficultyMax } = difficultyRange(template, config);
  return {
    ...aim,
    difficulty: Math.round((difficultyMin + difficultyMax) / 2),
    size: Math.min(Math.max(aim.size, template.partySizeMin), template.partySizeMax),
  };
}

/**
 * Each Encounter's Checks' difficulty factors (and flat terms, with `aim.flatShare`), so that at its
 * aim (`aimOf`) its random Parties succeed with `aim.chance`: first each Check's target alone, so
 * that at the aim's difficulty every Check of the Encounter is as hard on its own (a Success at
 * `aim.chance`); then all of them scaled by one number, so that the Encounter, by its pass formula,
 * succeeds at `aim.chance`. A raw Check, a gate, keeps its own. Returns the tuning by Encounter and
 * Check, a factor rounded to 3 places and a flat term to 2.
 */
export function tunedFactors(pool: Pool, aim: TuningAim, parties: number, deps: EngineDeps): Record<string, Record<CheckKey, CheckTuning>> {
  const { content, config } = deps;
  const share = aim.flatShare ?? 0;
  const partySets = new Map<number, Hero[][]>();
  const partiesOf = (size: number): Hero[][] => {
    const known = partySets.get(size);
    if (known !== undefined) return known;
    const draw = drawer(`calibrate-tune-${aim.level}-${size}`);
    const drawn = Array.from({ length: parties }, () => partyOf(pool.heroes, size, draw));
    partySets.set(size, drawn);
    return drawn;
  };
  const template = pool.world.quests[pool.world.board[0] as Quest['id']] as Quest;
  const best = bestParties(pool.world, pool.guild, deps);
  const tuned: Record<string, Record<CheckKey, CheckTuning>> = {};
  for (const encounter of Object.values(content.encounters)) {
    const { difficulty, size } = aimOf(encounter, aim, content, config);
    const quest = questOf(template, difficulty, [encounter.key]);
    const capabilities = partiesOf(size).map((party) => (best.chance(quest, party) as QuestEstimate).encounters[0]?.checks.map((it) => it.capability) ?? []);
    const tunable = encounter.checks.map((it) => it.raw !== true && it.difficultyFactor > 0);
    // A tunable Check's target at the aim is its factor-at-the-aim times the difficulty, however it is
    // later split between a flat term and a factor; an untunable one keeps its own.
    const targetOf = (at: number, factor: number): number => {
      const it = encounter.checks[at] as Encounter['checks'][number];
      return tunable[at] ? factor * difficulty : (it.flat ?? 0) + it.difficultyFactor * difficulty;
    };
    const targetsAt = (factors: readonly number[]): number[] => encounter.checks.map((_, at) => targetOf(at, factors[at] as number));
    const meanOver = (list: readonly (readonly number[])[], of: (capable: readonly number[]) => number): number =>
      list.reduce((total, capable) => total + of(capable), 0) / Math.max(1, list.length);
    // Each Check alone: the factor at which its Success or better comes at the aim's chance. A Check that
    // reads a Hero of a Class or a Skill scores nothing without one, so where the aim is out of reach it
    // is aimed at the Parties that score.
    const alone = encounter.checks.map((it, at) => {
      if (!tunable[at]) return it.difficultyFactor;
      const scoring = capabilities.filter((capable) => (capable[at] ?? 0) > 0);
      const success = (list: readonly (readonly number[])[]) => (factor: number): number =>
        meanOver(list, (capable) => chanceToReach(capable[at] ?? 0, it.variance ?? config.checkVariance, config.checkDegrees.success * targetOf(at, factor)));
      return bisect(success(success(capabilities)(factorLeast) >= aim.chance ? capabilities : scoring), aim.chance);
    });
    // Then the Encounter: one scale on every tunable factor, over every Party, or those that score on
    // every Check where the aim is out of reach.
    const scaled = (scale: number): number[] => alone.map((factor, at) => (tunable[at] ? factor * scale : factor));
    const succeeds = (list: readonly (readonly number[])[]) => (scale: number): number =>
      meanOver(list, (capable) => {
        const it = encounterDegrees(encounter, capable, targetsAt(scaled(scale)), deps);
        return it.success + it.triumph;
      });
    const scoring = capabilities.filter((capable) => capable.every((value) => value > 0));
    const over = succeeds(capabilities)(scaleLeast) >= aim.chance ? capabilities : scoring;
    const scale = tunable.some(Boolean) ? bisect(succeeds(over), aim.chance, scaleLeast, 20) : 1;
    tuned[encounter.key] = Object.fromEntries(
      encounter.checks.map((it, at): [CheckKey, CheckTuning] => {
        if (!tunable[at]) return [it.key, { difficultyFactor: it.difficultyFactor, ...(it.flat === undefined ? {} : { flat: it.flat }) }];
        const target = (scaled(scale)[at] as number) * difficulty;
        const difficultyFactor = Math.max(0.001, Math.round(((target * (1 - share)) / difficulty) * 1000) / 1000);
        return [it.key, share === 0 ? { difficultyFactor } : { difficultyFactor, flat: Math.round(target * share * 100) / 100 }];
      }),
    );
  }
  return tuned;
}

/** The least factor, and the least scale on an Encounter's factors, a tuning tries. */
const factorLeast = 0.0001;
const scaleLeast = 0.05;

/** The `x` in `low` to `high` at which `falling(x)`, which falls as `x` grows, comes to `aim`. */
function bisect(falling: (x: number) => number, aim: number, low = factorLeast, high = 10): number {
  let lo = low;
  let hi = high;
  for (let step = 0; step < 60; step += 1) {
    const mid = (lo + hi) / 2;
    if (falling(mid) > aim) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// --- The report ---------------------------------------------------------------------------------------

/** A chance as a whole percentage. */
export function pct(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

/** A Degree cell: Triumph · Success · Setback · Failure, in whole percentages. */
function degreeCell(it: DegreeChances): string {
  return [it.triumph, it.success, it.setback, it.failure].map((chance) => Math.round(chance * 100)).join(' · ');
}

/** A table of `cells` with a row for each Level and size and a column for each difficulty. */
function cellTable(cells: readonly Cell[], settings: CalibrationSettings): string {
  const rows = settings.levels.flatMap((level) =>
    settings.sizes.map((size) => [
      `Level ${level}, ${size} ${size === 1 ? 'Hero' : 'Heroes'}`,
      ...settings.difficulties.map((difficulty) => {
        const it = cells.find((cell) => cell.level === level && cell.size === size && cell.difficulty === difficulty);
        return it === undefined ? '—' : degreeCell(it.degrees);
      }),
    ]),
  );
  return markdownTable(['Party', ...settings.difficulties.map((d) => `Difficulty ${d}`)], rows, ['left', ...settings.difficulties.map(() => 'right' as const)]);
}

/** The mean Success or better of `cells` at a Level and difficulty, over `sizes`. */
function successAt(cells: readonly Cell[], level: number, difficulty: number, sizes: readonly number[]): number {
  const found = cells.filter((cell) => cell.level === level && cell.difficulty === difficulty && sizes.includes(cell.size));
  return found.reduce((total, cell) => total + cell.degrees.success + cell.degrees.triumph, 0) / Math.max(1, found.length);
}

/** The headline of the templates: the best Party's rates over every Quest drawn at a Level, by template and in all. */
export function headline(templates: readonly TemplateCalibration[], level: number, onlyHigh = false): { fail: number; strong: number; quests: number } {
  let quests = 0;
  const bands = noBands();
  for (const template of templates) {
    for (const row of template.rows) {
      if (row.level !== level || (onlyHigh && row.third !== 'high')) continue;
      quests += row.best.quests;
      addInto(bands, row.best.bands, row.best.quests);
    }
  }
  return { fail: bands.fail / Math.max(1, quests), strong: bands.strong / Math.max(1, quests), quests };
}

/** The calibration's report, in Markdown. */
export function calibrationReport(
  calibration: Calibration,
  {
    machine,
    startedAt,
    seconds,
    command,
    drafts = 'docs/quests/drafts/',
    tuned,
  }: { machine: Machine; startedAt: Date; seconds: number; command: string; drafts?: string; tuned?: TuningAim },
): string {
  const { settings, encounters, templates, coverage, spot } = calibration;
  const lines: string[] = [];
  lines.push('# Calibration of the Quest content (v1.1.4-S9, DL-162)', '');
  lines.push(
    `Run ${startedAt.toISOString()} on ${machine.cpu} (${machine.cores} cores), Node ${machine.node}, in ${seconds.toFixed(1)} s, by \`${command}\`.`,
    `Content version ${calibration.contentVersion}; ${calibration.drafted.length === 0 ? 'the core content alone' : `the drafts in \`${drafts}\` in place of ${calibration.drafted.map((it) => `\`${it}\``).join(', ')}`}.`,
    `Heroes: ${settings.pool} drawn by the Heroes Generator for each of Levels ${settings.levels.join(', ')}, raised by the engine's growth, unattached, at the Morale baseline (steady, form 1), with no gear and no Regard between them (teamwork 1).`,
    `Every rate is the chance estimate's (v1.1.4-S5): "if no one falls", carrying nothing.`,
    ...(tuned === undefined
      ? []
      : [
          `The difficulty factors were tuned first (\`tunedFactors\`): each Encounter so that random Parties of ${tuned.size} at Level ${tuned.level} succeed at it with a chance of ${tuned.chance} at difficulty ${tuned.difficulty}, each of its Checks as hard on its own; each Finale at the middle of its template's difficulties, with Parties of a size the template allows (\`aimOf\`).${
            (tuned.flatShare ?? 0) === 0 ? '' : ` ${Math.round((tuned.flatShare ?? 0) * 100)}% of each target at the aim is a flat term, the rest the factor times the difficulty.`
          }`,
        ]),
    '',
  );

  lines.push('## The Quest target, as the estimate sees it', '');
  lines.push(
    `For each template and Level, ${settings.questsPerTemplate} Quests drawn by the Quest Generator, each met by the best Party (\`bestParties\`, the Board's "Your best Party" and the harness's policy's Party) of a Roster of ${settings.roster} Heroes drawn from the Level's pool, redrawn until it can staff the Quest. The target (DL-83 item 4): the player's Quests fail 20 to 30%, and are strong successes at most 50%. These rates assume no one falls; in play, Injuries, Deaths and Morale lower the later Encounters' chances, so failures run higher.`,
    '',
  );
  lines.push(
    markdownTable(
      ['Level', 'Quests', 'Fail, all thirds', 'Strong, all thirds', 'Fail, the hardest third', 'Strong, the hardest third'],
      settings.levels.map((level) => {
        const all = headline(templates, level);
        const high = headline(templates, level, true);
        return [`${level}`, `${all.quests}`, pct(all.fail), pct(all.strong), pct(high.fail), pct(high.strong)];
      }),
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
  );

  lines.push('## The coverage grid', '');
  lines.push(
    `Each Hero Stat's Checks by kind: the Checks whose score adds the Stat into its value, not those that only choose or filter by it. The gate: at least ${checksAtLeast} Checks across at least ${kindsAtLeast} kinds. ${coverage.filter((it) => it.met).length} of ${coverage.length} Stats meet it.`,
    '',
  );
  lines.push(
    markdownTable(
      ['Stat', ...encounterKinds.map((kind) => kind), 'Checks', 'Kinds', 'Met'],
      coverage.map((it) => [it.name, ...encounterKinds.map((kind) => `${it.byKind[kind].length || ''}`), `${it.checks}`, `${it.kinds}`, it.met ? 'yes' : '**no**']),
      ['left', ...encounterKinds.map(() => 'right' as const), 'right', 'right', 'left'],
    ),
    '',
  );

  lines.push('## The estimate against the resolver', '');
  lines.push(
    `${spot.samples} samples, half an Encounter met alone by a random Party, half a template's Quest met by its best Party, each resolved for ${spot.seeds} seeds with no one falling; ${spot.compared} chances compared. The widest gap is ${(spot.widest.gap * 100).toFixed(2)} points (${spot.widest.errors.toFixed(2)} standard errors), at ${spot.widest.at}. The widest gap of a chance from 1% to 99% is ${spot.widestErrors.toFixed(2)} standard errors.`,
    '',
  );

  lines.push('## The templates', '');
  lines.push(
    `For each Level and third of the template's difficulty range: the best Party's chance of each Quest band (fail · success · strong), its mean size, and the positive Earned Traits a Quest draws (each Triumph's \`trait\` chance, before the strong success that grants it); then random Parties of each size the template allows, each meeting its requirements, ${Math.max(4, Math.round(settings.parties / 10))} a Quest.`,
    '',
  );
  const bands = (it: BandRates): string => questBands.map((band) => Math.round(it.bands[band] * 100)).join(' · ');
  for (const template of templates) {
    lines.push(`### ${template.name}`, '');
    lines.push(
      `Parties of ${template.sizes[0]} to ${template.sizes[1]}${template.finale === null ? '' : `; its Finale ${encounters.find((it) => it.key === template.finale)?.name ?? template.finale}`}${template.unstaffed > 0 ? `; ${template.unstaffed} Quests no Roster drawn could staff, left out` : ''}.`,
      '',
    );
    const sizes = settings.sizes.filter((size) => size >= template.sizes[0] && size <= template.sizes[1]);
    lines.push(
      markdownTable(
        ['Level', 'Third', 'Difficulty', 'Quests', 'Best Party', 'Its size', 'Traits drawn', ...sizes.map((size) => `${size} at random`)],
        template.rows.map((row) => [
          `${row.level}`,
          row.third,
          `${row.difficulty[0]}–${row.difficulty[1]}`,
          `${row.best.quests}`,
          bands(row.best),
          row.best.size.toFixed(1),
          row.best.traitsDrawn.toFixed(3),
          ...sizes.map((size) => (row.bySize[size] === undefined ? '—' : bands(row.bySize[size] as BandRates))),
        ]),
        ['left', 'left', 'right', 'right', 'right', 'right', 'right', ...sizes.map(() => 'right' as const)],
      ),
      '',
    );
  }

  lines.push('## The Encounters', '');
  lines.push(
    `For each Level and Party size, ${settings.parties} Parties drawn at random from the pool, each estimated alone on a Quest of the one Encounter at each difficulty. Each cell is Triumph · Success · Setback · Failure, in whole percentages. Each Check's table follows its Encounter's.`,
    '',
  );
  for (const encounter of encounters) {
    const finale = encounter.finaleOf.length > 0 ? `, the Finale of ${encounter.finaleOf.map((key) => templates.find((it) => it.key === key)?.name ?? key).join(', ')}` : '';
    lines.push(`### ${encounter.name} (${encounter.kind}${finale})`, '');
    const level = settings.levels[Math.floor(settings.levels.length / 2)] ?? 1;
    lines.push(
      `Success or better at Level ${level}, 2 to 4 Heroes: ${settings.difficulties.map((d) => `${pct(successAt(encounter.cells, level, d, [2, 3, 4]))} at ${d}`).join(', ')}.`,
      '',
    );
    lines.push(cellTable(encounter.cells, settings), '');
    for (const check of encounter.checks) {
      lines.push('<details>', `<summary>Check ${check.name} (adds ${check.adds.join(', ') || 'no Stat'})</summary>`, '', cellTable(check.cells, settings), '', '</details>', '');
    }
  }
  return lines.join('\n');
}

/**
 * `value` as JSON written the way content's files are: an object over `width` characters on one line
 * opened a field to a line, and everything else, a Query among them, on one line.
 */
export function formatJson(value: unknown, width = 110, indent = ''): string {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== 'object' || flat.length + indent.length <= width) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.some((it) => it !== null && typeof it === 'object' && !Array.isArray(it))) return flat;
    return `[\n${value.map((it) => `${inner}${formatJson(it, width, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([key, it]) => `${inner}${JSON.stringify(key)}: ${formatJson(it, width, inner)}`).join(',\n')}\n${indent}}`;
}
