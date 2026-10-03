import { describe, expect, test } from 'vitest';
import { chanceBandNames, configProblems, defaultConfig, questBands, type EngineDeps, type GameConfig, type QuestBand } from '../config.js';
import { degrees, type ContentSet, type Degree, type Encounter, type EncounterCheck, type EncounterKind, type HeroTraitEffect, type NumQuery, type PassFormula } from '../content-types.js';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import type { QuestEncounter } from '../events.js';
import { addStack } from '../items.js';
import { heroState } from '../phases/hero-state.js';
import { phaseContext } from '../phases/phase.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { testContent, testDeps } from '../world.test-support.js';
import { capability } from './check.js';
import { chanceBand, chanceToReach, estimateQuest, questEstimator, type QuestEstimate } from './estimate.js';
import { queryParty } from './query.js';
import { questBand, resolveQuest } from './resolve.js';

// v1.1.4-S5 (DL-156): the chance estimate. Its parts are held to their formulas, and the whole to
// the resolver: a created world's player Guild, its Roster of one Hero a Class, set out on Quests of
// several Checks a test writes into content, each Check's target set near the Party's capability so
// that every Degree comes up, with consequences that hurt no one and move no Morale ("if no one
// falls"). The Party is away four Days: the resolver meets it on the night it comes home, after the
// Hero State Engine's nights away (`homeNight`), as `questsConclude` does. The resolver's rate over a few thousand seeds of the `quests` stream is held within 3
// points of the estimate here; the 200 Parties and Quests over 20,000 seeds each are the harness's
// estimate probe (`HEROESIM_PROBE=estimate npm run harness`, harness/src/estimate.ts).

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** A Check keyed `key` reading `score`, its target `multiple` × the Party's capability on it (set by `scene`). */
interface Drafted {
  check: Omit<EncounterCheck, 'difficultyFactor'>;
  multiple: number;
}

const draft = (key: string, score: EncounterCheck['score'], multiple: number, more: Partial<EncounterCheck> = {}): Drafted => ({
  check: { key, name: key, score, skills: [], ...more },
  multiple,
});

/** An Encounter keyed `key` of `kind`, its Checks drafted, combined by `pass`, harming no one. */
interface Drafting {
  key: string;
  kind: EncounterKind;
  checks: Drafted[];
  pass?: PassFormula;
}

interface Scene {
  world: World;
  heroes: Hero[];
  quest: Quest;
  party: Party;
  deps: EngineDeps;
  carried: { definitionKey: string; quantity: number }[];
}

/**
 * The player's Roster (one Hero a Class, Stats as drawn), its Morale set to `morale` in turn, sent on
 * a Quest of difficulty 50 and four Days through `drafts`, carrying `carried`. Each Check's `difficultyFactor` is set
 * so that its target is its multiple of the Party's capability on it, as it sets out; a raw Check's
 * multiple is taken as its `flat`.
 */
function scene(
  seed: string,
  drafts: Drafting[],
  { morale = [60], carried = [], overrides = {} }: { morale?: number[]; carried?: [string, number][]; overrides?: Partial<GameConfig> } = {},
): Scene {
  const created = testDeps({ rivalCount: 0, ...overrides });
  const { world } = createWorld(seed, setup, created).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.map((id) => world.heroes[id] as Hero);
  heroes.forEach((hero, at) => (hero.morale = morale[at % morale.length] as number));
  const difficulty = 50;
  const party = queryParty(heroes, world, created);
  const encounters = drafts.map(({ key, kind, checks, pass }): Encounter => {
    const written = checks.map(({ check, multiple }): EncounterCheck => {
      if (check.raw === true) return { ...check, difficultyFactor: 0, flat: multiple };
      const capable = capability(party, { kind }, { ...check, difficultyFactor: 1 }, world, created);
      return { ...check, difficultyFactor: (capable * multiple) / difficulty };
    });
    return { key, name: key, kind, checks: written, ...(pass === undefined ? {} : { pass }), consequences: { success: [{ kind: 'xp', factor: 1.1 }], failure: [{ kind: 'fame', delta: -1 }] } };
  });
  const content: ContentSet = { ...testContent, encounters: { ...testContent.encounters, ...Object.fromEntries(encounters.map((it) => [it.key, it])) } };
  const deps = { ...created, content };
  const offered = world.quests[world.board[0] as Quest['id']] as Quest;
  const quest: Quest = { ...structuredClone(offered), difficulty, durationTurns: 4 * turnsPerDay, encounterKeys: encounters.map((it) => it.key), lootTableKey: null };
  const returnsOnTurn = nightOf(dayOf(world.turn) + 4);
  const ids: Party = { id: makeId('parties', 99), questId: quest.id, guildId: guild.id, heroIds: heroes.map((hero) => hero.id), departedOnTurn: world.turn, returnsOnTurn };
  for (const [definitionKey, quantity] of carried) addStack(world, definitionKey, quantity, { kind: 'party', id: ids.id });
  return { world, heroes, quest, party: ids, deps, carried: carried.map(([definitionKey, quantity]) => ({ definitionKey, quantity })) };
}

/**
 * `s`'s world on the night its Party comes home, as `questsConclude` meets it: the Hero State Engine's
 * phase run on each night away, the Party's Heroes in their Party, and the Turn the return night's.
 */
function homeNight({ world, party, deps }: Scene): World {
  const home = structuredClone(world);
  for (const heroId of party.heroIds) (home.heroes[heroId] as Hero).partyId = party.id;
  for (let night = nightOf(dayOf(home.turn)); night < party.returnsOnTurn; night += turnsPerDay) {
    if (night <= world.turn) continue;
    home.turn = night;
    heroState(home, phaseContext(home, deps));
  }
  home.turn = party.returnsOnTurn;
  return home;
}

/** The resolver's rates over `runs` seeds of the `quests` stream, on the night the Party comes home: each Encounter's Degrees, and the bands. */
function resolved(s: Scene, runs: number): { encounters: Record<Degree, number>[]; bands: Record<QuestBand, number> } {
  const { quest, party, deps } = s;
  const world = homeNight(s);
  const encounters = quest.encounterKeys.map(() => ({ failure: 0, setback: 0, success: 0, triumph: 0 }));
  const bands = { fail: 0, success: 0, strong: 0 };
  for (let run = 0; run < runs; run += 1) {
    world.rng.quests = createStreams(`run-${run}`, ['quests']).quests;
    const { outcome, encounters: met } = resolveQuest(world, quest, party, deps);
    bands[outcome.band] += 1 / runs;
    for (const it of met) (encounters[it.index] as Record<Degree, number>)[it.degree] += 1 / runs;
  }
  return { encounters, bands };
}

function estimated({ world, quest, heroes, deps, carried }: Scene): QuestEstimate {
  const estimate = estimateQuest(world, quest, heroes, deps, carried);
  if (estimate === null) throw new Error('No estimate');
  return estimate;
}

/** Holds `scene`'s estimate within `points` of the resolver's rates over `runs` seeds, Degree by Degree and band by band. */
function holdsToTheResolver(s: Scene, runs: number, points: number): void {
  const estimate = estimated(s);
  const rates = resolved(s, runs);
  for (const [index, it] of estimate.encounters.entries()) {
    for (const degree of degrees) expect(Math.abs(it.degrees[degree] - (rates.encounters[index] as Record<Degree, number>)[degree]), `${it.encounterKey} ${degree}`).toBeLessThan(points);
  }
  for (const band of questBands) expect(Math.abs(estimate.bands[band] - rates.bands[band]), band).toBeLessThan(points);
}

const strength: NumQuery = ['sum', 'party', ['stat', 'strength']];
const warriorsWeaponry: NumQuery = ['of', ['best', ['where', 'party', ['class', 'warrior']], ['stat', 'weaponry']], ['stat', 'weaponry']];
const courage: NumQuery = ['avg', 'party', ['stat', 'courage']];
const wits: NumQuery = ['max', 'party', ['weighted', [['wits', 0.6], ['perception', 0.4]]]];
const strongCount: NumQuery = ['count', ['where', 'party', ['>=', ['stat', 'strength'], 6]]];

describe('one Check', () => {
  test('reaches x with chance 1 − clamp((x ÷ C − 1 + v) ÷ 2v, 0, 1)', () => {
    expect(chanceToReach(100, 0.2, 100)).toBeCloseTo(0.5, 12);
    expect(chanceToReach(100, 0.2, 110)).toBeCloseTo(0.25, 12);
    expect(chanceToReach(100, 0.2, 80)).toBeCloseTo(1, 12);
    expect(chanceToReach(100, 0.2, 120)).toBeCloseTo(0, 12);
    expect(chanceToReach(100, 0.2, 125)).toBe(0);
    expect(chanceToReach(50, 0.5, 30)).toBeCloseTo(0.9, 12);
  });

  test('is a step at a variance of 0, and a roll of 0 with no capability', () => {
    expect(chanceToReach(10, 0, 10)).toBe(1);
    expect(chanceToReach(10, 0, 10.0001)).toBe(0);
    expect(chanceToReach(0, 0.2, 5)).toBe(0);
    expect(chanceToReach(-3, 0.2, 5)).toBe(0);
  });

  test("gives each Degree its threshold's chance, and a raw gate takes no bonus", () => {
    const s = scene('estimate-one', [
      { key: 'one', kind: 'combat', checks: [draft('one', strength, 1)] },
      { key: 'gate', kind: 'combat', checks: [draft('gate', strongCount, 1, { raw: true, variance: 0 })] },
    ], { carried: [['whetstone', 2]] });
    const [one, gate] = estimated(s).encounters;
    const check = one?.checks[0];
    if (check === undefined || gate === undefined) throw new Error('No Check');
    const capable = capability(queryParty(s.heroes, s.world, s.deps), { kind: 'combat' }, s.deps.content.encounters.one?.checks[0] as EncounterCheck, s.world, s.deps);
    // The Whetstone's +3 is on the first Encounter's Check, and the raw gate's capability is its count.
    expect(check.capability).toBe(capable + 3);
    const reach = (threshold: number): number => chanceToReach(capable + 3, s.deps.config.checkVariance, threshold * check.target);
    // Each threshold as configured (the Triumph's 1.25 became 1.35 in v1.1.4-S10, DL-166).
    const { triumph, success, setback } = s.deps.config.checkDegrees;
    expect(check.degrees).toEqual({
      failure: 1 - reach(setback),
      setback: reach(setback) - reach(success),
      success: reach(success) - reach(triumph),
      triumph: reach(triumph),
    });
    expect(gate.checks[0]?.capability).toBe(queryParty(s.heroes, s.world, s.deps).members.filter((member) => (member.stats.strength ?? 0) >= 6).length);
    expect(gate.success === 0 || gate.success === 1).toBe(true);
  });
});

describe('chance bands', () => {
  test('are hopeless below 0.10, unlikely to 0.35, even to 0.65, likely to 0.90 and near-certain from 0.90', () => {
    const at = (chance: number) => chanceBand(chance, defaultConfig);
    expect([0, 0.0999, 0.1, 0.3499, 0.35, 0.6499, 0.65, 0.8999, 0.9, 1].map(at)).toEqual([
      'hopeless',
      'hopeless',
      'unlikely',
      'unlikely',
      'even',
      'even',
      'likely',
      'likely',
      'near-certain',
      'near-certain',
    ]);
    expect(chanceBandNames).toEqual(['hopeless', 'unlikely', 'even', 'likely', 'near-certain']);
  });

  test("are a configuration field, strictly increasing within 0 and 1, and checkVariance a share from 0 to 1 that the formula holds for", () => {
    expect(configProblems({ ...defaultConfig, checkVariance: 0 })).toEqual([]);
    expect(configProblems({ ...defaultConfig, checkVariance: 1 })).toEqual([]);
    for (const checkVariance of [-0.1, 1.5, Number.NaN]) {
      expect(configProblems({ ...defaultConfig, checkVariance })).toEqual([`checkVariance is ${checkVariance}; it is a share from 0 to 1`]);
    }

    const problem = (chanceBands: unknown) => configProblems({ ...defaultConfig, chanceBands: chanceBands as GameConfig['chanceBands'] });
    expect(problem(defaultConfig.chanceBands)).toEqual([]);
    expect(problem({ unlikely: 0.01, even: 0.02, likely: 0.98, 'near-certain': 0.99 })).toEqual([]);
    const words = (bands: unknown) => [`chanceBands is ${JSON.stringify(bands)}; unlikely < even < likely < near-certain, each above 0 and below 1`];
    for (const bands of [
      { unlikely: 0, even: 0.35, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.35, likely: 0.65, 'near-certain': 1 },
      { unlikely: 0.35, even: 0.35, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.65, likely: 0.35, 'near-certain': 0.9 },
      { unlikely: 0.1, even: Number.NaN, likely: 0.65, 'near-certain': 0.9 },
      { unlikely: 0.1, even: 0.35, likely: 0.65 },
      undefined,
    ]) {
      expect(problem(bands)).toEqual(words(bands));
    }
    expect(() => estimateQuest({} as World, { difficulty: 10, encounterKeys: [], durationTurns: 3 }, [], testDeps({ chanceBands: { unlikely: 0.5, even: 0.4, likely: 0.65, 'near-certain': 0.9 } }))).toThrow(
      /chanceBands/,
    );
  });

  // v1.1.4-S6 (DL-157): the margin of the player's best Party, as a Disposition's `partyMargin` is held.
  test('playerPartyMargin is 0.05 by default, a share from 0 to 1', () => {
    expect(defaultConfig.playerPartyMargin).toBe(0.05);
    for (const playerPartyMargin of [0, 0.5, 1]) expect(configProblems({ ...defaultConfig, playerPartyMargin })).toEqual([]);
    for (const playerPartyMargin of [-0.05, 1.5, Number.NaN]) {
      expect(configProblems({ ...defaultConfig, playerPartyMargin })).toEqual([`playerPartyMargin is ${playerPartyMargin}; it is a share from 0 to 1`]);
    }
  });
});

describe('the estimate', () => {
  test('draws nothing, says it assumes no one falls, and is null for a Quest whose Encounters are drawn on the way', () => {
    const s = scene('estimate-null', [{ key: 'one', kind: 'combat', checks: [draft('one', strength, 1)] }]);
    const streams = structuredClone(s.world.rng);
    expect(estimated(s).ifNoOneFalls).toBe(true);
    expect(s.world.rng).toEqual(streams);
    expect(estimateQuest(s.world, { ...s.quest, encounterKeys: [] }, s.heroes, s.deps)).toBeNull();
    expect(estimateQuest(s.world, { ...s.quest, encounterKeys: ['no-such-encounter'] }, s.heroes, s.deps)).toBeNull();
    // A key content lacks is left out, as the resolver leaves it out.
    expect(estimateQuest(s.world, { ...s.quest, encounterKeys: ['no-such-encounter', 'one'] }, s.heroes, s.deps)?.encounters.map((it) => it.encounterKey)).toEqual(['one']);
  });

  test('gives a Party of no one no chance, as the resolver meets none of its Encounters, a score with a floor among them', () => {
    const floored: NumQuery = ['greatest', ['sum', 'party', ['stat', 'strength']], 10];
    const s = scene('estimate-nobody', [{ key: 'one', kind: 'combat', checks: [draft('one', floored, 0.5)] }]);
    const nothing = { failure: 0, setback: 0, success: 0, triumph: 0 };
    const estimate = estimateQuest(s.world, s.quest, [], s.deps);
    expect(estimate?.encounters.map((it) => [it.degrees, it.success, it.chance])).toEqual([[nothing, 0, 'hopeless']]);
    expect(estimate?.bands).toEqual({ fail: 1, success: 0, strong: 0 });
    expect(estimate?.success).toBe(0);
    const { outcome, encounters } = resolveQuest(s.world, s.quest, { ...s.party, heroIds: [] }, s.deps);
    expect([outcome.band, encounters]).toEqual(['fail', []]);
  });

  test('refuses a Hero named twice, a consumable named twice, or a quantity that is not a whole number from 1, as dispatch does', () => {
    const s = scene('estimate-twice', [{ key: 'one', kind: 'combat', checks: [draft('one', strength, 1)] }]);
    const [hero] = s.heroes as [Hero];
    expect(() => estimateQuest(s.world, s.quest, [hero, hero], s.deps)).toThrow(`A Party names ${hero.id} twice`);
    const twice = [{ definitionKey: 'whetstone', quantity: 1 }, { definitionKey: 'whetstone', quantity: 2 }];
    expect(() => estimateQuest(s.world, s.quest, s.heroes, s.deps, twice)).toThrow("A Party's consumables name whetstone twice");
    expect(() => estimateQuest(s.world, s.quest, s.heroes, s.deps, [{ definitionKey: 'whetstone', quantity: 0 }])).toThrow(RangeError);
    expect(() => estimateQuest(s.world, s.quest, s.heroes, s.deps, [{ definitionKey: 'whetstone', quantity: 1.5 }])).toThrow(RangeError);
  });

  // v1.1.4-S6: the Rivals' `partyFor` estimates many Parties of one pool, each Hero brought home once.
  test('questEstimator gives every Party of its pool, in any order and carrying anything, exactly the estimate estimateQuest gives', () => {
    const s = scene('estimate-pool', [
      { key: 'first', kind: 'travel', checks: [draft('first', strength, 1), draft('second', wits, 1.1)], pass: ['or', 'first', 'second'] },
      { key: 'third', kind: 'combat', checks: [draft('third', courage, 0.9)] },
    ], { morale: [19, 38, 76, 91], carried: [['grappling-line', 1]] });
    const estimate = questEstimator(s.world, s.quest, s.heroes, s.deps);
    const [a, b, c, d] = s.heroes as [Hero, Hero, Hero, Hero];
    for (const party of [[], [a], [d, b], [b, d], [a, b, c, d], [c, a, d]]) {
      for (const carried of [[], s.carried]) {
        expect(estimate(party, carried), party.map((hero) => hero.id).join()).toEqual(estimateQuest(s.world, s.quest, party, s.deps, carried));
      }
    }
    // A Hero outside the pool is brought home on the call.
    expect(questEstimator(s.world, s.quest, [a], s.deps)([a, b])).toEqual(estimateQuest(s.world, s.quest, [a, b], s.deps));
    expect(() => estimate([a, a])).toThrow(`A Party names ${a.id} twice`);
    expect(questEstimator(s.world, { ...s.quest, encounterKeys: [] }, s.heroes, s.deps)([a])).toBeNull();
    expect(() => questEstimator(s.world, { ...s.quest, difficulty: 0 }, s.heroes, s.deps)).toThrow(RangeError);
  });

  test("reads the Party as the resolver meets it on the night it comes home: a wretched Hero's Morale has drifted a band up", () => {
    const deps = testDeps({ rivalCount: 0, moraleBaseline: 50 }, { ...testContent, encounters: { ...testContent.encounters, march: { key: 'march', name: 'March', kind: 'travel', checks: [{ key: 'march', name: 'March', score: strength, skills: [], difficultyFactor: 0.3 }], consequences: { success: [], failure: [] } } } });
    const created = createWorld('estimate-home', setup, deps).document;
    const { world } = created;
    const guild = playerGuild(world) as Guild;
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    hero.morale = 19;
    const questId = world.board[0] as Quest['id'];
    const quest = world.quests[questId] as Quest;
    Object.assign(quest, { durationTurns: 5 * turnsPerDay, encounterKeys: ['march'], lootTableKey: null, requirements: { partySizeMin: 1, partySizeMax: 4 } });
    const estimate = estimateQuest(world, quest, [hero], deps);
    const asTheySetOut = capability(queryParty([hero], world, deps), { kind: 'travel' }, deps.content.encounters.march?.checks[0] as EncounterCheck, world, deps);

    const sent = dispatch(created, { guildId: guild.id, questId, heroIds: [hero.id] }, deps);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    let document = sent.document;
    let met: QuestEncounter['payload'] | undefined;
    while (met === undefined) {
      const turned = advance(document, deps);
      document = turned.document;
      met = turned.events.find((event): event is QuestEncounter => event.type === 'quest.encounter')?.payload;
    }
    // Wretched (0.85) when sent; low (0.93) by the night home, the Morale 19 drifted up a point a night.
    expect(met.checks?.[0]?.capability).toBe(estimate?.encounters[0]?.checks[0]?.capability);
    expect(met.checks?.[0]?.capability).toBeGreaterThan(asTheySetOut);
  });

  // v1.1.4-S7: a Hero Trait's Stat change and Encounter bonus are read as a Check reads them, and a
  // Trait an Injury leaves on a night away replaces one it conflicts with before the Party is met.
  test("reads a Trait an Injury leaves on a night away, which replaces one it conflicts with: its Stat change in, the other's bonus out", () => {
    const trait = (key: string, excludes: string[], effects: HeroTraitEffect[]) => ({ key, name: key, excludes, effects });
    const s = scene('estimate-traits', [{ key: 'march', kind: 'travel', checks: [draft('march', strength, 1)] }]);
    const heroTraits = {
      ...s.deps.content.heroTraits,
      scarred: trait('scarred', ['veteran'], [{ kind: 'statModifiers', modifiers: { strength: -3 } }]),
      veteran: trait('veteran', ['scarred'], [{ kind: 'encounterBonus', flat: 4, kinds: ['travel'] }]),
    };
    const traited: Scene = { ...s, deps: { ...s.deps, content: { ...s.deps.content, heroTraits } } };
    const [hero] = s.heroes as [Hero];
    hero.traits = ['veteran'];
    hero.injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(dayOf(s.world.turn) + 2) };
    const march = traited.deps.content.encounters.march?.checks[0] as EncounterCheck;
    const asTheySetOut = capability(queryParty(s.heroes, s.world, traited.deps), { kind: 'travel' }, march, s.world, traited.deps);

    const estimate = estimated(traited);
    const home = homeNight(traited);
    const met = resolveQuest(home, s.quest, s.party, traited.deps).encounters[0]?.checks[0]?.capability;

    expect((home.heroes[hero.id] as Hero).traits).toEqual(['scarred']);
    expect(estimate.encounters[0]?.checks[0]?.capability).toBe(met);
    // As they set out the bonus is there and the Strength whole: 4 more, and 3 Strength, times form and teamwork.
    expect(asTheySetOut - (met ?? 0)).toBeGreaterThan(4);
  });

  test("folds a reroll in exactly: a second Encounter has it only if the first did not use it", () => {
    const s = scene('estimate-reroll', [
      { key: 'first', kind: 'travel', checks: [draft('first', strength, 1)] },
      { key: 'second', kind: 'travel', checks: [draft('second', strength, 1)] },
    ], { carried: [['grappling-line', 1]] });
    const [first, second] = estimated(s).encounters;
    const p = (first?.checks[0]?.degrees.success ?? 0) + (first?.checks[0]?.degrees.triumph ?? 0);
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.8);
    expect(first?.success).toBeCloseTo(p + (1 - p) * p, 12);
    expect(second?.success).toBeCloseTo(p + (1 - p) * p * p, 12);
  });

  test('gives the bands of every path through the Encounters, by questBand', () => {
    const s = scene('estimate-bands', [
      { key: 'a', kind: 'combat', checks: [draft('a', strength, 0.95)] },
      { key: 'b', kind: 'social', checks: [draft('b', courage, 1.1)] },
      { key: 'c', kind: 'arcane', checks: [draft('c', wits, 0.85)] },
    ]);
    const estimate = estimated(s);
    const bands = { fail: 0, success: 0, strong: 0 };
    const walk = (index: number, successes: number, triumphs: number, chance: number): void => {
      const it = estimate.encounters[index];
      if (it === undefined) {
        bands[questBand(successes, triumphs, estimate.encounters.length, s.deps.config)] += chance;
        return;
      }
      for (const degree of degrees) {
        const won = degree === 'success' || degree === 'triumph';
        walk(index + 1, successes + (won ? 1 : 0), triumphs + (degree === 'triumph' ? 1 : 0), chance * it.degrees[degree]);
      }
    };
    walk(0, 0, 0, 1);
    for (const band of questBands) expect(estimate.bands[band]).toBeCloseTo(bands[band], 12);
    expect(estimate.success).toBeCloseTo(bands.success + bands.strong, 12);
    expect(estimate.chance).toBe(chanceBand(estimate.success, s.deps.config));
  });
});

// Each estimate held to 3,000 resolutions: a second or more a test alone, past the default 5 s under
// the whole suite's load (DL-164).
describe('the estimate against the resolver, no one falling', { timeout: 30_000 }, () => {
  const runs = 3000;
  const points = 0.03;

  test('several Checks under and, or and at-least, form, Synergies and teamwork', () => {
    const s = scene('estimate-formulas', [
      { key: 'a', kind: 'combat', checks: [draft('a', strength, 0.75), draft('b', warriorsWeaponry, 0.8), draft('c', courage, 1.3)], pass: ['or', ['and', 'a', 'b'], 'c'] },
      { key: 'b', kind: 'travel', checks: [draft('d', wits, 0.75), draft('e', strength, 0.9, { variance: 0.4 }), draft('f', courage, 1.3)], pass: ['at-least', 2, 'd', 'e', 'f'] },
      {
        key: 'c',
        kind: 'stealth',
        checks: [draft('g', wits, 0.75), draft('h', courage, 1.25), draft('i', strength, 0.8, { variance: 0.1 }), draft('j', strongCount, 2, { raw: true, variance: 0 })],
        pass: ['and', ['or', 'g', 'h'], ['at-least', 1, 'i', 'j']],
      },
    ], { morale: [19, 38, 76, 91] });
    holdsToTheResolver(s, runs, points);
  });

  test('a bonus and rerolls the Party carries, spent across the Encounters', () => {
    const s = scene('estimate-kit', [
      { key: 'a', kind: 'stealth', checks: [draft('a', wits, 0.75), draft('b', strength, 0.8)], pass: ['and', 'a', 'b'] },
      { key: 'b', kind: 'combat', checks: [draft('c', strength, 0.75)] },
      { key: 'c', kind: 'travel', checks: [draft('d', courage, 1.3), draft('e', wits, 0.8)], pass: ['or', 'd', 'e'] },
      { key: 'd', kind: 'stealth', checks: [draft('f', strength, 0.75), draft('g', courage, 1.3), draft('h', wits, 0.8)], pass: ['at-least', 2, 'f', 'g', 'h'] },
      { key: 'e', kind: 'social', checks: [draft('i', courage, 0.75)] },
    ], { carried: [['grappling-line', 2], ['blessed-candle', 1], ['whetstone', 1], ['lockpicks', 1]] });
    holdsToTheResolver(s, runs, points);
  });
});
