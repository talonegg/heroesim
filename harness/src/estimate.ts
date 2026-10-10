// The estimate probe (v1.1.4-S5, DL-156): the chance estimate (`estimateQuest`) held to the resolver
// (`resolveQuest`) where no one falls. Each sample is a Party and a Quest drawn from its own seed:
//
// - a world created from the core content and `defaultConfig`, and of the player's Roster, one to four
//   Heroes drawn, each set to a Morale drawn from 0 to 100, so that every band's form comes up;
// - a Quest of difficulty 10 to 100 and one to five Encounters, each the core's or one written for the
//   sample: one to four Checks, each scored by a Query of every shape the core's and S10's content
//   writes (sums, the best of a Class, weightings, rankings, arithmetic, a raw count against a flat),
//   at a target from 0.6 to 1.5 times the Party's capability on it, with the default variance or its
//   own (0 among them), combined by a pass formula of `and`, `or` and `at-least`, nested;
// - and, for half the samples, Whetstones, lockpicks, grappling lines and blessed candles carried.
//
// The Party is estimated as it is about to be sent, then sent by `dispatch` (the Quest's requirements
// set to any Party of one to four) and the world advanced, every phase played, to the afternoon
// before the night it comes home: the Quest lasts its template's two to ten Days, so each Hero's
// Morale has drifted toward their baseline, their Regard decayed, before the resolver meets them, as
// `questsConclude` would meet them that night (v1.1.4-S5's verification). The Rivals play their own
// Guilds meanwhile, and the player's Guild, which no policy plays here, does nothing.
//
// No one falls: every Encounter's consequences are stripped of Injuries, Deaths and Morale, the three
// that change who meets the next Encounter or in what form (resolve.ts), and keep the rest, which
// change neither. Each sample is resolved once for each of `runs` seeds, the `quests` stream set from
// the seed's name, and each Encounter's rate of each Degree and of Success or better, and the Quest's
// rate of each band and of success, compared with the estimate's chances. Each sample has seeds of its
// own, so that a fluke of one set of 20,000 seeds (a 3σ one, about a point at a chance of a half, was
// found in the first set tried) is not every sample's. The probe proper is 200 samples × 20,000 seeds
// (`HEROESIM_PROBE=estimate npm run harness`, estimate.harness.test.ts), held within 2 points;
// estimate.test.ts runs a few.
//
// Morale in (v1.1.5-S7, DL-173, DL-168 item 7): the same samples, the same estimate and the same seeds
// are measured a second time with only Injuries and Deaths taken out (`unhurt`), Morale's consequences
// left in, so that a Setback or a Failure may move a Hero's form in the Encounters after it, which the
// estimate, "if no one falls", does not follow. The core's Encounters carry their Morale as shipped; each
// Encounter written for a sample carries that of a core Encounter of its kind, chosen by its key's hash
// and drawing nothing (`moraleIn`), so that it meets Morale about as often as the content's do. Every
// chance of that measure was to be held within 3 points of the resolver's rate; on the shipped content an
// Encounter's Degrees stood 23.65 points off, and the owner's answer (2026-10-04, DL-173) holds only the
// whole Quest's chances, its bands and success, within 3 points (`moraleHeld`), and reports each
// Encounter's gaps, its Degrees and Success or better, without holding them. The no-one-falls check
// stays on every chance.

import { createHash } from 'node:crypto';
import {
  addStack,
  advance,
  applyAction,
  capability,
  createWorld,
  degrees,
  encounterKinds,
  estimateQuest,
  moraleBand,
  playerGuild,
  queryParty,
  questBands,
  resolveQuest,
  type Consequence,
  type ContentSet,
  type Degree,
  type Encounter,
  type EncounterCheck,
  type EngineDeps,
  type Guild,
  type Hero,
  type NumQuery,
  type Party,
  type PassFormula,
  type Quest,
  type QuestEstimate,
  type World,
} from '@heroesim/engine';
import { harnessSetup } from './creation.js';
import { readGateSpec } from './gate.js';
import { fixed, markdownTable, whole, type Machine } from './report.js';

/** Samples the probe draws when `HEROESIM_SAMPLES` is unset (the epic's S5: 200 Parties and Quests). */
export const defaultEstimateSamples = 200;
/** Seeds each sample is resolved for when `HEROESIM_SEEDS` is unset (the epic's S5: 20,000). */
export const defaultEstimateRuns = 20_000;
/**
 * How far, in chance, the estimate may stand from the resolver's rate (the epic's S5: 2 points), as the
 * Gate's spec holds it (`harness/gate.json`, v1.1.6-S2).
 */
export const estimateTolerance = readGateSpec().estimate.noOneFalls.within;
/**
 * How far, in chance, the estimate of the whole Quest may stand from the resolver's rate with Morale's
 * consequences left in (v1.1.5-S7, DL-168 item 7: 3 points, the owner's example; DL-173: held on the
 * Quest's chances only, each Encounter's reported), as the Gate's spec holds it.
 */
export const estimateMoraleTolerance = readGateSpec().estimate.moraleInQuest.within;

/** The probe's two measures: no one falling (`compared`), and with Morale's consequences left in (`moraleIn`). */
export type Measure = 'compared' | 'moraleIn';

/** The consumables a sample's Party may carry: the core's bonuses and rerolls. */
const carriable = ['whetstone', 'lockpicks', 'grappling-line', 'blessed-candle'] as const;

/** One comparison: what was estimated, of what, and the resolver's rate. */
export interface Compared {
  /** `quest` for the Quest's, else the Encounter's place in the sequence. */
  of: 'quest' | number;
  /** A Degree, a Quest band, or `succeeded`: an Encounter's Success or better, or the Quest's success or strong success. */
  what: string;
  estimate: number;
  rate: number;
}

/** One sample, estimated and resolved. */
export interface Sample {
  seed: string;
  heroes: number;
  encounters: number;
  checks: number;
  /** Its Encounters of more than one Check. */
  several: number;
  carried: number;
  /** Its Heroes whose Morale band moved between setting out and the night home. */
  bandsMoved: number;
  /** Its Encounters carrying a Morale consequence in the second measure. */
  moraleEncounters: number;
  /** Each chance against the resolver's rate with no one falling: Injuries, Deaths and Morale taken out. */
  compared: Compared[];
  /** The same chances against the resolver's rate with Injuries and Deaths taken out and Morale left in. */
  moraleIn: Compared[];
}

/** A small deterministic stream for drawing the samples (mulberry32), apart from the game's. */
export function drawer(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The `quests` stream's state for the seed `name`: four words of its SHA-256, never all zero. */
export function questsStream(name: string): [number, number, number, number] {
  const digest = createHash('sha256').update(`${name}:quests`).digest();
  const words: [number, number, number, number] = [digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12)];
  return words.every((word) => word === 0) ? [1, 2, 3, 4] : words;
}

/** `content` with every Encounter's Injuries, Deaths and Morale taken out, so that no one falls. */
export function harmless(content: ContentSet): ContentSet {
  return without(content, ['injury', 'death', 'morale']);
}

/** `content` with every Encounter's Injuries and Deaths taken out, and its Morale left in (v1.1.5-S7). */
export function unhurt(content: ContentSet): ContentSet {
  return without(content, ['injury', 'death']);
}

/** `content` with every Encounter's consequences of the `kinds` taken out, and the rest kept. */
function without(content: ContentSet, kinds: readonly Consequence['kind'][]): ContentSet {
  const strip = (list: readonly Consequence[]): Consequence[] => list.filter((it) => !kinds.includes(it.kind));
  const encounters = Object.fromEntries(
    Object.entries(content.encounters).map(([key, encounter]) => {
      const { success, failure, triumph, setback } = encounter.consequences;
      const consequences = {
        success: strip(success),
        failure: strip(failure),
        ...(triumph === undefined ? {} : { triumph: strip(triumph) }),
        ...(setback === undefined ? {} : { setback: strip(setback) }),
      };
      return [key, { ...encounter, consequences }];
    }),
  );
  return { ...content, encounters };
}

/**
 * A sample's Party and Quest: the estimate made as the Party was about to be sent; the world as the
 * resolver meets it on the night the Party comes home, its Turn that night's; the Quest and the Party
 * sent, carrying `carried`; the content they meet; and how many of the Heroes' Morale bands moved
 * between setting out and that night.
 */
export interface Drawn {
  estimate: QuestEstimate;
  world: World;
  heroes: number;
  quest: Quest;
  party: Party;
  carried: { definitionKey: string; quantity: number }[];
  deps: EngineDeps;
  bandsMoved: number;
}

/** Draws the sample `seed` (see the file's head) under `deps`, whose content is already `harmless`. */
export function drawSample(seed: string, deps: EngineDeps): Drawn {
  const draw = drawer(seed);
  const below = (n: number): number => Math.floor(draw() * n);
  const one = <T>(items: readonly T[]): T => items[below(items.length)] as T;
  const created = createWorld(seed, harnessSetup, deps).document;
  const { world } = created;
  const { content } = deps;

  const guild = playerGuild(world) as Guild;
  const roster = guild.rosterIds.map((id) => world.heroes[id] as Hero);
  const heroes: Hero[] = [];
  for (let size = 1 + below(4); heroes.length < size && heroes.length < roster.length; ) {
    const hero = one(roster);
    if (!heroes.includes(hero)) heroes.push(hero);
  }
  for (const hero of heroes) hero.morale = below(101);

  const difficulty = 10 + below(91);
  const statKeys = Object.keys(content.stats).filter((key) => content.stats[key]?.owner === 'hero');
  const classKeys = Object.keys(content.classes);
  const skillKeys = Object.keys(content.skills);
  const setOut = queryParty(heroes, world, deps);
  const core = Object.values(content.encounters);
  const written: Encounter[] = [];
  const sequence: string[] = [];
  for (let at = 0, count = 1 + below(5); at < count; at += 1) {
    if (draw() < 0.25) {
      sequence.push(one(core).key);
      continue;
    }
    const key = `probe-${at}`;
    const kind = one(encounterKinds);
    const checks = Array.from({ length: 1 + below(4) }, (_, n): EncounterCheck => {
      const checkKey = `c${n}`;
      const stat = (): string => one(statKeys);
      if (draw() < 0.12) {
        // A raw count against a flat: a gate, at no variance or the default.
        const score: NumQuery = ['count', ['where', 'party', ['>=', ['stat', stat()], 6 + below(8)]]];
        return { key: checkKey, name: checkKey, score, skills: [], difficultyFactor: 0, flat: 1 + below(3), raw: true, ...(draw() < 0.5 ? { variance: 0 } : {}) };
      }
      const s = stat();
      const scores: NumQuery[] = [
        ['sum', 'party', ['stat', s]],
        ['max', 'party', ['stat', s]],
        ['avg', 'party', ['weighted', [[s, 0.6], [stat(), 0.4]]]],
        ['of', ['best', ['where', 'party', ['class', one(classKeys)]], ['stat', s]], ['stat', s]],
        ['ranked', 'party', ['stat', s], [1, 0.5, 0.25]],
        ['sum', ['where', 'party', ['not', ['hurt']]], ['+', ['stat', s], ['skill', one(skillKeys)]]],
        ['+', ['max', 'party', ['stat', s]], ['*', 0.5, ['min', 'party', ['stat', stat()]]]],
        ['greatest', ['sum', ['top', 'party', 2, ['stat', s]], ['stat', s]], 10],
      ];
      const score = one(scores);
      const skills = draw() < 0.5 ? [one(skillKeys)] : [];
      const roll = draw();
      const variance = roll < 0.6 ? {} : roll < 0.9 ? { variance: 0.05 + draw() * 0.55 } : { variance: 0 };
      const capable = capability(setOut, { kind }, { key: checkKey, name: checkKey, score, skills, difficultyFactor: 1 }, world, deps);
      const multiple = 0.6 + draw() * 0.9;
      return { key: checkKey, name: checkKey, score, skills, difficultyFactor: Math.max(0.01, capable * multiple) / difficulty, ...variance };
    });
    const keyed = `${key}-${seed}`;
    written.push({ key: keyed, name: keyed, kind, checks, ...(checks.length > 1 ? { pass: formula(checks.map((it) => it.key), draw) } : {}), consequences: { success: [{ kind: 'xp', factor: 1.1 }], failure: [{ kind: 'fame', delta: -1 }] } });
    sequence.push(keyed);
  }

  const sampled: EngineDeps = { ...deps, content: { ...content, encounters: { ...content.encounters, ...Object.fromEntries(written.map((it) => [it.key, it])) } } };
  const questId = world.board[0] as Quest['id'];
  const beatLines = sequence.map(() => 'A Beat of the probe.');
  Object.assign(world.quests[questId] as Quest, { difficulty, encounterKeys: sequence, beatLines, lootTableKey: null, requirements: { partySizeMin: 1, partySizeMax: 4 } });
  const carried = draw() < 0.5 ? [] : carriable.filter(() => draw() < 0.5).map((definitionKey) => ({ definitionKey, quantity: 1 + below(3) }));
  for (const { definitionKey, quantity } of carried) addStack(world, definitionKey, quantity, { kind: 'guild', id: guild.id });
  const estimate = estimateQuest(world, world.quests[questId] as Quest, heroes, sampled, carried);
  if (estimate === null) throw new Error(`${seed}: the Quest has no estimate`);
  const bandsAtFirst = heroes.map((hero) => moraleBand(hero.morale, deps.config));

  // Sent, and played to the afternoon before the night it comes home.
  const sent = applyAction(created, { kind: 'dispatch', guildId: guild.id, questId, heroIds: heroes.map((hero) => hero.id), consumables: carried }, sampled);
  if (!sent.ok) throw new Error(`${seed}: dispatch refused the Party, ${sent.rejection.reason}`);
  let document = sent.document;
  const party = Object.values(document.world.parties).find((it) => it.questId === questId) as Party;
  while (document.world.turn < party.returnsOnTurn - 1) document = advance(document, sampled).document;
  const home = structuredClone(document.world);
  home.turn = party.returnsOnTurn;
  const bandsMoved = heroes.filter((hero, at) => moraleBand((home.heroes[hero.id] as Hero).morale, deps.config) !== bandsAtFirst[at]).length;
  return { estimate, world: home, heroes: heroes.length, quest: home.quests[questId] as Quest, party, carried, deps: sampled, bandsMoved };
}

/**
 * `drawn`'s deps with Morale's consequences put back (v1.1.5-S7): the core's Encounters as `content`
 * ships them, Injuries and Deaths taken out (`unhurt`); and each Encounter written for the sample with
 * the Morale consequences of a core Encounter of its kind added to each Degree's list, the one chosen
 * by its key's SHA-256, so that nothing is drawn and the sample stays the same.
 */
export function moraleIn(drawn: Drawn, content: ContentSet): EngineDeps {
  const shipped = unhurt(content);
  const core = Object.values(shipped.encounters);
  const encounters: Record<string, Encounter> = { ...drawn.deps.content.encounters, ...shipped.encounters };
  for (const [key, encounter] of Object.entries(drawn.deps.content.encounters)) {
    if (Object.hasOwn(shipped.encounters, key)) continue;
    const kin = core.filter((it) => it.kind === encounter.kind);
    const lent = kin[createHash('sha256').update(key).digest().readUInt32LE(0) % Math.max(1, kin.length)];
    if (lent !== undefined) encounters[key] = withMoraleOf(encounter, lent);
  }
  return { ...drawn.deps, content: { ...drawn.deps.content, encounters } };
}

/** `encounter` with `lent`'s Morale consequences added to each Degree's list, as the resolver reads them. */
function withMoraleOf(encounter: Encounter, lent: Encounter): Encounter {
  const morale = (list: readonly Consequence[]): Consequence[] => list.filter((it) => it.kind === 'morale');
  const own = encounter.consequences;
  const theirs = lent.consequences;
  return {
    ...encounter,
    consequences: {
      success: [...own.success, ...morale(theirs.success)],
      failure: [...own.failure, ...morale(theirs.failure)],
      triumph: [...(own.triumph ?? own.success), ...morale(theirs.triumph ?? theirs.success)],
      setback: [...(own.setback ?? own.failure), ...morale(theirs.setback ?? theirs.failure)],
    },
  };
}

/** A pass formula naming each of `keys` once: `and`, `or` or `at-least` over them, some of them nested in a part of their own. */
function formula(keys: readonly string[], draw: () => number): PassFormula {
  if (keys.length === 1) return keys[0] as string;
  const nest = keys.length >= 3 && draw() < 0.5 ? 2 : 0;
  const parts: PassFormula[] = nest === 0 ? [...keys] : [formula(keys.slice(0, nest), draw), ...keys.slice(nest)];
  const operator = Math.floor(draw() * 3);
  if (operator === 0) return ['and', ...parts];
  if (operator === 1) return ['or', ...parts];
  return ['at-least', 1 + Math.floor(draw() * parts.length), ...parts];
}

/**
 * Resolves `drawn` once for each of `seeds` under its own deps, no one falling, and again under
 * `withMorale` (`moraleIn`), and compares each chance its estimate gives with both rates.
 */
export function compareSample(seed: string, drawn: Drawn, seeds: readonly (readonly [number, number, number, number])[], withMorale: EngineDeps): Sample {
  const { estimate, heroes, quest, carried, deps, bandsMoved } = drawn;
  const counts = quest.encounterKeys.map((key) => deps.content.encounters[key]?.checks.length ?? 0);
  const checks = counts.reduce((total, count) => total + count, 0);
  const moraleEncounters = quest.encounterKeys.filter((key) => {
    const encounter = withMorale.content.encounters[key];
    return encounter !== undefined && Object.values(encounter.consequences).some((list) => list?.some((it) => it.kind === 'morale'));
  }).length;
  return {
    seed,
    heroes,
    encounters: estimate.encounters.length,
    checks,
    several: counts.filter((count) => count > 1).length,
    carried: carried.length,
    bandsMoved,
    moraleEncounters,
    compared: measure(seed, drawn, seeds, deps),
    moraleIn: measure(seed, drawn, seeds, withMorale),
  };
}

/** Resolves `drawn` once for each of `seeds` under `deps`, and compares each chance its estimate gives with its rate. */
function measure(seed: string, drawn: Drawn, seeds: readonly (readonly [number, number, number, number])[], deps: EngineDeps): Compared[] {
  const { estimate, world, quest, party } = drawn;
  const encounterRates = estimate.encounters.map((): Record<Degree, number> => ({ failure: 0, setback: 0, success: 0, triumph: 0 }));
  const bandRates = { fail: 0, success: 0, strong: 0 };
  for (const state of seeds) {
    world.rng.quests = [state[0], state[1], state[2], state[3]];
    const { outcome, encounters } = resolveQuest(world, quest, party, deps);
    if (encounters.length !== estimate.encounters.length || outcome.deaths.length > 0 || outcome.injuries.length > 0) {
      throw new Error(`${seed}: someone fell`);
    }
    bandRates[outcome.band] += 1;
    for (const it of encounters) (encounterRates[it.index] as Record<Degree, number>)[it.degree] += 1;
  }
  const runs = seeds.length;
  const compared: Compared[] = [];
  for (const [index, it] of estimate.encounters.entries()) {
    const rates = encounterRates[index] as Record<Degree, number>;
    for (const degree of degrees) compared.push({ of: index, what: degree, estimate: it.degrees[degree], rate: rates[degree] / runs });
    compared.push({ of: index, what: 'succeeded', estimate: it.success, rate: (rates.success + rates.triumph) / runs });
  }
  for (const band of questBands) compared.push({ of: 'quest', what: band, estimate: estimate.bands[band], rate: bandRates[band] / runs });
  compared.push({ of: 'quest', what: 'succeeded', estimate: estimate.success, rate: (bandRates.success + bandRates.strong) / runs });
  return compared;
}

/**
 * The probe: `samples` samples from `estimate-0001` on, under `deps`, each resolved for `runs` seeds of
 * its own, `<sample>/seed-0001` on, so that no fluke of one set of seeds is shared by every sample;
 * each sample measured with no one falling and again, on the same seeds, with Morale in (`moraleIn`).
 */
export function estimateProbe(samples: number, runs: number, deps: EngineDeps): Sample[] {
  const base: EngineDeps = { ...deps, content: harmless(deps.content) };
  return Array.from({ length: samples }, (_, n) => {
    const seed = `estimate-${String(n + 1).padStart(4, '0')}`;
    const seeds = Array.from({ length: runs }, (_, at) => questsStream(`${seed}/seed-${String(at + 1).padStart(4, '0')}`));
    const drawn = drawSample(seed, base);
    return compareSample(seed, drawn, seeds, moraleIn(drawn, deps.content));
  });
}

/**
 * The furthest any estimate stands from its rate across `samples` in the measure `of`, and that
 * comparison: of every chance, or with `only` of `quest`, of the Quest's, or of `encounters`, the Encounters'.
 */
export function widest(samples: readonly Sample[], of: Measure = 'compared', only: 'all' | 'quest' | 'encounters' = 'all'): { gap: number; sample: string; compared: Compared } | null {
  let found: { gap: number; sample: string; compared: Compared } | null = null;
  for (const sample of samples) {
    for (const compared of sample[of]) {
      if (only === 'quest' && compared.of !== 'quest') continue;
      if (only === 'encounters' && compared.of === 'quest') continue;
      const gap = Math.abs(compared.estimate - compared.rate);
      if (found === null || gap > found.gap) found = { gap, sample: sample.seed, compared };
    }
  }
  return found;
}

/**
 * The gap the Morale check holds below `estimateMoraleTolerance` (DL-173, the owner's answer): the widest of
 * the Quest's bands and success in the Morale measure, 0 where there are none. Each Encounter's are not held.
 */
export function moraleHeld(samples: readonly Sample[]): number {
  return widest(samples, 'moraleIn', 'quest')?.gap ?? 0;
}

/** One of the probe's checks: the gap it holds, its limit, and whether the gap lies strictly below it. */
export interface EstimateCheck {
  gap: number;
  limit: number;
  within: boolean;
}

/**
 * The probe's two checks, as the harness test asserts them: with no one falling, every chance within
 * `estimateTolerance`; with Morale in, the Quest's bands and success within `estimateMoraleTolerance`
 * (`moraleHeld`; DL-173, the owner's answer). A gap of exactly the limit is beyond it.
 */
export function estimateChecks(samples: readonly Sample[]): { noOneFalls: EstimateCheck; moraleIn: EstimateCheck } {
  const check = (gap: number, limit: number): EstimateCheck => ({ gap, limit, within: gap < limit });
  return {
    noOneFalls: check(widest(samples, 'compared', 'all')?.gap ?? 0, estimateTolerance),
    moraleIn: check(moraleHeld(samples), estimateMoraleTolerance),
  };
}

/** The probe's report, in Markdown: each measure's gaps, widest and mean, in points and in standard errors, against its limit. */
export function estimateReport(
  samples: readonly Sample[],
  { runs, machine, startedAt, seconds }: { runs: number; machine: Machine; startedAt: Date; seconds: number },
): string {
  // A gap in standard errors of the rate over `runs` seeds, for a chance strictly between 0 and 1.
  const errors = (it: Compared): number => Math.abs(it.estimate - it.rate) / Math.sqrt((it.estimate * (1 - it.estimate)) / runs);
  const open = (it: Compared): boolean => it.estimate > 0.01 && it.estimate < 0.99;
  const count = (of: (sample: Sample) => number) => samples.reduce((total, sample) => total + of(sample), 0);
  const section = (measured: Measure, title: string, note: string, limit: number, held: 'all' | 'quest'): string[] => {
    const all = samples.flatMap((sample) => sample[measured]);
    const row = (label: string, of: (it: Compared) => boolean): string[] => {
      const list = all.filter(of);
      const gaps = list.map((it) => Math.abs(it.estimate - it.rate));
      const between = list.filter(open);
      return [
        label,
        whole(list.length),
        whole(between.length),
        fixed(100 * Math.max(0, ...gaps), 2),
        fixed((100 * gaps.reduce((a, b) => a + b, 0)) / Math.max(1, gaps.length), 3),
        fixed(Math.max(0, ...between.map(errors)), 2),
        whole(gaps.filter((gap) => gap >= limit).length),
      ];
    };
    const line = (most: ReturnType<typeof widest>, verdict: (gap: number) => string): string =>
      most === null
        ? 'Nothing was compared.'
        : `${most.sample}, ${most.compared.of === 'quest' ? 'the Quest' : `Encounter ${most.compared.of + 1}`}, ${most.compared.what}: estimated ${fixed(100 * most.compared.estimate, 2)}%, resolved ${fixed(100 * most.compared.rate, 2)}%, ${fixed(100 * most.gap, 2)} points, ${verdict(most.gap)}`;
    const note2 = held === 'all' ? '' : ', reported, not held';
    return [
      `## ${title}`,
      '',
      note,
      '',
      markdownTable(
        ['Compared', 'Chances', 'From 1% to 99%', 'Widest gap (points)', 'Mean gap (points)', 'Widest gap (standard errors)', 'Beyond the limit'],
        [
          row(`Each Encounter's Degrees${note2}`, (it) => it.of !== 'quest' && it.what !== 'succeeded'),
          row(`Each Encounter's Success or better${note2}`, (it) => it.of !== 'quest' && it.what === 'succeeded'),
          row("The Quest's bands", (it) => it.of === 'quest' && it.what !== 'succeeded'),
          row("The Quest's success", (it) => it.of === 'quest' && it.what === 'succeeded'),
        ],
        ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
      ...(held === 'all'
        ? [`The widest gap: ${line(widest(samples, measured), (gap) => `${gap < limit ? 'within' : 'beyond'} the limit of ${fixed(100 * limit, 0)} points.`)}`]
        : [
            `The widest gap held: ${line(widest(samples, measured, 'quest'), (gap) => `${gap < limit ? 'within' : 'beyond'} the limit of ${fixed(100 * limit, 0)} points.`)}`,
            '',
            `The widest Encounter gap, reported, not held (DL-173, the owner's answer): ${line(widest(samples, measured, 'encounters'), (gap) => `${gap < limit ? 'within' : 'beyond'} ${fixed(100 * limit, 0)} points.`)}`,
          ]),
    ];
  };
  return [
    `# The chance estimate against the resolver (v1.1.4-S5, DL-156; v1.1.5-S7, DL-173)`,
    '',
    `Run ${startedAt.toISOString()} on ${machine.cpu} (${machine.cores} cores), Node ${machine.node}, in ${fixed(seconds, 1)} s.`,
    `${whole(samples.length)} samples × ${whole(runs)} seeds; ${whole(count((it) => it.encounters))} Encounters of ${whole(count((it) => it.checks))} Checks, ${whole(count((it) => it.several))} of them of several; ${whole(samples.filter((it) => it.carried > 0).length)} Parties carrying consumables; ${whole(count((it) => it.bandsMoved))} Heroes in ${whole(samples.filter((it) => it.bandsMoved > 0).length)} Parties whose Morale band moved between setting out and the night home. Each sample is measured twice, on the same seeds and against the same estimate.`,
    '',
    ...section('compared', 'No one falls', 'Injuries, Deaths and Morale are taken out of every Encounter. Every chance is held within the limit.', estimateTolerance, 'all'),
    '',
    ...section(
      'moraleIn',
      'Morale in',
      `Injuries and Deaths are taken out of every Encounter, and Morale's consequences left in: the core's as shipped, and each Encounter written for a sample given those of a core Encounter of its kind. ${whole(count((it) => it.moraleEncounters))} of the ${whole(count((it) => it.encounters))} Encounters carry one. Only the Quest's bands and success are held within the limit (DL-173, the owner's answer of 2026-10-04); each Encounter's gaps are reported, not held, the "Beyond the limit" of their rows counting those beyond 3 points.`,
      estimateMoraleTolerance,
      'quest',
    ),
  ].join('\n');
}
