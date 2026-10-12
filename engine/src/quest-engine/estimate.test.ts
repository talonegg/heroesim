import { describe, expect, test } from 'vitest';
import { chanceBandNames, defaultConfig, questBands, type EngineDeps, type GameConfig, type QuestBand } from '../config.js';
import { degrees, type ContentSet, type Degree, type Encounter, type EncounterCheck, type EncounterKind, type HeroTraitEffect, type NumQuery, type PassFormula } from '../content-types.js';
import { advance } from '../advance.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World } from '../document.js';
import type { QuestEncounter } from '../events.js';
import { addStack } from '../items.js';
import { moraleBaselineFor } from '../morale.js';
import { heroState } from '../phases/hero-state.js';
import { phaseContext } from '../phases/phase.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { setup, testContent, testDeps, withCaptaincy, withFacilityEffect } from '../world.test-support.js';
import { capability } from './check.js';
import { passDegree, passOf, succeeded } from './degree.js';
import { chanceBand, chanceToReach, estimateQuest, partyEstimator, type CheckEstimate, type QuestEstimate } from './estimate.js';
import { queryParty } from './query.js';
import { questBand, resolveQuest } from './resolve.js';
import { applyAction } from '../actions/action.js';

// DL-156: the chance estimate. Its parts are held to their formulas, and the whole to
// the resolver: a created world's player Guild, its Roster of one Hero a Class, set out on Quests of
// several Checks a test writes into content, each Check's target set near the Party's capability so
// that every Degree comes up, with consequences that hurt no one and move no Morale ("if no one
// falls"). The Party is away four Days: the resolver meets it on the night it comes home, after the
// Hero State Engine's nights away (`homeNight`), as `questsConclude` does. The resolver's rate over a few thousand seeds of the `quests` stream is held within 3
// points of the estimate here; the 200 Parties and Quests over 20,000 seeds each are the harness's
// estimate probe (`HEROESIM_PROBE=estimate npm run harness`, harness/src/estimate.ts).

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
  const ids: Party = { id: makeId('parties', 99), questId: quest.id, guildId: guild.id, heroIds: heroes.map((hero) => hero.id), departedOnTurn: world.turn, returnsOnTurn, fatigueAtDispatch: Object.fromEntries(heroes.map((hero) => [hero.id, hero.fatigue])) };
  for (const [definitionKey, quantity] of carried) addStack(world, definitionKey, quantity, { kind: 'party', id: ids.id });
  return { world, heroes, quest, party: ids, deps, carried: carried.map(([definitionKey, quantity]) => ({ definitionKey, quantity })) };
}

/**
 * `s`'s world on the night its Party comes home, as `questsConclude` meets it: the Hero State Engine's
 * phase run on each night away, the Party's Heroes in their Party, and the Turn the return night's.
 */
function homeNight({ world, quest, party, deps }: Scene): World {
  const home = structuredClone(world);
  // The Party and its Quest as rows: a night away reads the Quest's Tier for Fatigue (DL-282).
  home.parties[party.id] = structuredClone(party);
  home.quests[quest.id] = structuredClone(quest);
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

/**
 * An Encounter's chance of each Degree from its Checks' (`checks`), `pass` read afresh for every
 * combination of their Degrees with a chance above 0, met in the Checks' order and then the Degrees':
 * `plain`, the first rolls standing; and `rerolled`, the chance it first falls short of Success and
 * then, each Check that did rolled again, ends at each Degree. What the estimator folds, with no Degree
 * kept from one combination to the next (DL-237).
 */
function foldedAfresh(pass: PassFormula, checks: readonly CheckEstimate[]): { plain: Record<Degree, number>; rerolled: Record<Degree, number> } {
  const combinations = (of: readonly CheckEstimate[]): { byKey: Record<string, Degree>; chance: number }[] => {
    let combined: { byKey: Record<string, Degree>; chance: number }[] = [{ byKey: {}, chance: 1 }];
    for (const { key, degrees: chances } of of) {
      combined = combined.flatMap(({ byKey, chance }) => degrees.filter((degree) => chances[degree] > 0).map((degree) => ({ byKey: { ...byKey, [key]: degree }, chance: chance * chances[degree] })));
    }
    return combined;
  };
  const plain = { failure: 0, setback: 0, success: 0, triumph: 0 };
  const rerolled = { failure: 0, setback: 0, success: 0, triumph: 0 };
  for (const first of combinations(checks)) {
    const { degree } = passDegree(pass, first.byKey);
    plain[degree] += first.chance;
    if (succeeded(degree)) continue;
    for (const again of combinations(checks.filter((it) => !succeeded(first.byKey[it.key] as Degree)))) {
      rerolled[passDegree(pass, { ...first.byKey, ...again.byKey }).degree] += first.chance * again.chance;
    }
  }
  return { plain, rerolled };
}

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
    // At their Guild's baseline, the Morale the estimate brings them home with is the Morale they set
    // out with, and so is Morale's factor on their form (DL-283).
    for (const hero of s.heroes) hero.morale = moraleBaselineFor(hero, s.world, s.deps.config, s.deps.content);
    const [one, gate] = estimated(s).encounters;
    const check = one?.checks[0];
    if (check === undefined || gate === undefined) throw new Error('No Check');
    const capable = capability(queryParty(s.heroes, s.world, s.deps), { kind: 'combat' }, s.deps.content.encounters.one?.checks[0] as EncounterCheck, s.world, s.deps);
    // The Whetstone's +3 is on the first Encounter's Check, and the raw gate's capability is its count.
    expect(check.capability).toBe(capable + 3);
    const reach = (threshold: number): number => chanceToReach(capable + 3, s.deps.config.checkVariance, threshold * check.target);
    // Each threshold as configured (the Triumph's 1.25 became 1.35 in DL-166).
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
});

describe('the estimate', () => {
  test('draws nothing, says it assumes no one falls, and is null for a Quest whose Encounters are drawn on the way', () => {
    const s = scene('estimate-null', [{ key: 'one', kind: 'combat', checks: [draft('one', strength, 1)] }]);
    const streams = structuredClone(s.world.rng);
    expect(estimated(s).ifNoOneFalls).toBe(true);
    expect(s.world.rng).toEqual(streams);
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

  // The Best Party module estimates many Parties of one world, each Hero brought home once a return night (DL-237).
  test('partyEstimator gives every Party, on Quests of any length, in any order and carrying anything, exactly the estimate estimateQuest gives', () => {
    const s = scene('estimate-pool', [
      { key: 'first', kind: 'travel', checks: [draft('first', strength, 1), draft('second', wits, 1.1)], pass: ['or', 'first', 'second'] },
      { key: 'third', kind: 'combat', checks: [draft('third', courage, 0.9)] },
    ], { morale: [19, 38, 76, 91], carried: [['grappling-line', 1]] });
    const estimate = partyEstimator(s.world, s.deps);
    const [a, b, c, d] = s.heroes as [Hero, Hero, Hero, Hero];
    // Each at a Fatigue of their own, and a Quest of the same return night at another Tier, so the
    // members kept by return night are read again at each Day's Fatigue (DL-284).
    [a, b, c, d].forEach((hero, at) => (hero.fatigue = [5, 40, 75, 100][at] as number));
    const longer = { ...s.quest, durationTurns: s.quest.durationTurns + 2 * turnsPerDay };
    const steeper = { ...s.quest, tier: s.quest.tier === 5 ? 1 : 5 };
    for (const quest of [s.quest, longer, steeper]) {
      for (const party of [[], [a], [d, b], [b, d], [a, b, c, d], [c, a, d]]) {
        for (const carried of [[], s.carried]) {
          expect(estimate(quest, party, { carried, pool: [a, b] }), party.map((hero) => hero.id).join()).toEqual(estimateQuest(s.world, quest, party, s.deps, carried));
        }
      }
    }
    // A Hero outside the pool is brought home on the call.
    expect(partyEstimator(s.world, s.deps)(s.quest, [a, b], { pool: [a] })).toEqual(estimateQuest(s.world, s.quest, [a, b], s.deps));
    expect(() => estimate(s.quest, [a, a])).toThrow(`A Party names ${a.id} twice`);
    expect(estimate({ ...s.quest, encounterKeys: ['no-such-encounter'] }, [a])).toBeNull();
    expect(() => estimate({ ...s.quest, difficulty: 0 }, [a])).toThrow(RangeError);
  });

  // DL-287: the Captain's factor is the proposed Party's own, whoever else the pool brought home with it.
  test("partyEstimator gives a Party its Captain's factor, and a Party without the Captain none, though the Captain was brought home with the pool", () => {
    const s = scene('estimate-captain', [
      { key: 'first', kind: 'travel', checks: [draft('first', strength, 1), draft('second', wits, 1.1)], pass: ['or', 'first', 'second'] },
      { key: 'third', kind: 'combat', checks: [draft('third', courage, 1)] },
    ]);
    const captained = { ...s.deps, config: { ...s.deps.config, captainFormFactor: 1.05 }, content: withCaptaincy(s.deps.content) };
    const flat = { ...captained, config: { ...captained.config, captainFormFactor: 1 } };
    const [a, b, c, d] = s.heroes as [Hero, Hero, Hero, Hero];
    a.stats['leadership'] = 20;
    (s.world.guilds[a.guildId as Guild['id']] as Guild).captainId = a.id;
    const estimate = partyEstimator(s.world, captained);
    for (const party of [[a, b], [b, c], [a, b, c, d], [d, c, b, a], [b, c, d]]) {
      const named = party.map((hero) => hero.id).join();
      const got = estimate(s.quest, party, { pool: [a, b, c, d] });
      expect(got, named).toEqual(estimateQuest(s.world, s.quest, party, captained));
      if (!party.includes(a)) expect(got, named).toEqual(estimateQuest(s.world, s.quest, party, flat));
    }
    // The whole Roster, its Checks' targets set at its capability, is likelier with its Captain's factor.
    expect(estimate(s.quest, [a, b, c, d])?.success).toBeGreaterThan(estimateQuest(s.world, s.quest, [a, b, c, d], flat)?.success ?? 1);
  });

  // DL-237: the estimator keeps the Degree each pass formula gives each combination of Degrees it
  // has met, so every Party and Quest asked of it after shares them; each must be the formula's own.
  test("gives each Encounter's Degrees, over many pass formulas, Parties and Quests asked of one estimator, to the last bit as the formula read afresh for every combination gives them", () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const formula = (keys: readonly string[]): PassFormula => {
      if (keys.length === 1) return keys[0] as string;
      const cut = 1 + Math.floor(random() * (keys.length - 1));
      const parts: PassFormula[] = keys.length > 2 && random() < 0.5 ? [formula(keys.slice(0, cut)), ...keys.slice(cut)] : [...keys];
      const operator = random();
      if (operator < 1 / 3) return ['and', ...parts] as PassFormula;
      if (operator < 2 / 3) return ['or', ...parts] as PassFormula;
      return ['at-least', 1 + Math.floor(random() * parts.length), ...parts] as PassFormula;
    };
    const scores = [strength, courage, wits, warriorsWeaponry];
    // Up to four Checks an Encounter; a Check of no variance has a Degree of no chance, met by no combination.
    const drafts: Drafting[] = Array.from({ length: 16 }, (_, n) => {
      const keys = Array.from({ length: 1 + (n % 4) }, (_, k) => `e${n}c${k}`);
      return {
        key: `e${n}`,
        kind: n % 2 === 0 ? 'travel' : 'combat',
        checks: keys.map((key, k) => draft(key, scores[(n + k) % scores.length] as NumQuery, 0.6 + random() * 0.8, k === 1 && n % 3 === 0 ? { variance: 0 } : {})),
        ...(keys.length === 1 ? {} : { pass: formula(keys) }),
      };
    });
    const s = scene('estimate-passes', drafts, { morale: [19, 38, 76, 91] });
    const estimate = partyEstimator(s.world, s.deps);
    const [a, b, c, d] = s.heroes as [Hero, Hero, Hero, Hero];
    const line = [{ definitionKey: 'grappling-line', quantity: 1 }];
    let compared = 0;
    for (const difficulty of [25, 50, 90]) {
      for (const drafted of drafts) {
        const quest = { ...s.quest, difficulty, encounterKeys: [drafted.key] };
        const pass = passOf(s.deps.content.encounters[drafted.key] as Encounter);
        for (const party of [[a], [b], [c, d], [d, c], [a, b, c], [b, d, a], [a, b, c, d], [d, c, b, a]]) {
          for (const carried of [[], line]) {
            const [met] = (estimate(quest, party, { carried }) as QuestEstimate).encounters;
            if (met === undefined) throw new Error('no Encounter');
            const { plain, rerolled } = foldedAfresh(pass, met.checks);
            // The first Encounter's walk: the first rolls, or with a reroll a Success kept and the rest rolled again.
            const rerolls = carried.length > 0 && drafted.kind === 'travel';
            const expected = Object.fromEntries(
              degrees.map((degree) => {
                let reached = 0;
                for (const chance of rerolls ? [succeeded(degree) ? plain[degree] : 0, rerolled[degree]] : [plain[degree]]) {
                  if (chance !== 0) reached += chance;
                }
                return [degree, reached];
              }),
            );
            expect(met.degrees, `${drafted.key} at ${difficulty}, ${party.map((hero) => hero.id).join()}, carrying ${carried.length}`).toEqual(expected);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(3 * 16 * 8 * 2);
  });

  test("reads the Party as the resolver meets it on the night it comes home: a Hero far below the baseline has drifted up toward it", () => {
    // No Fatigue on form, so the Morale drift is all that moves the Check between setting out and the night home (DL-284).
    const deps = testDeps({ rivalCount: 0, moraleBaseline: 50, fatigueScaling: 0 }, { ...testContent, encounters: { ...testContent.encounters, march: { key: 'march', name: 'March', kind: 'travel', checks: [{ key: 'march', name: 'March', score: strength, skills: [], difficultyFactor: 0.3 }], consequences: { success: [], failure: [] } } } });
    const created = createWorld('estimate-home', setup, deps).document;
    const { world } = created;
    const guild = playerGuild(world) as Guild;
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    hero.morale = 19;
    const questId = world.board[0] as Quest['id'];
    const quest = world.quests[questId] as Quest;
    Object.assign(quest, { durationTurns: 5 * turnsPerDay, encounterKeys: ['march'], lootTableKey: null, requirements: { partySizeMin: 1 } });
    const estimate = estimateQuest(world, quest, [hero], deps);
    const asTheySetOut = capability(queryParty([hero], world, deps), { kind: 'travel' }, deps.content.encounters.march?.checks[0] as EncounterCheck, world, deps);

    const sent = applyAction(created, { kind: 'dispatch', guildId: guild.id, questId, heroIds: [hero.id] }, deps);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    let document = sent.document;
    let met: QuestEncounter['payload'] | undefined;
    while (met === undefined) {
      const turned = advance(document, deps);
      document = turned.document;
      met = turned.events.find((event): event is QuestEncounter => event.type === 'quest.encounter')?.payload;
    }
    // Sent at Morale 19, below the baseline 50; by the night home drifted up a point a night, and Morale's
    // factor on their form up the line with it (DL-283).
    expect(met.checks?.[0]?.capability).toBe(estimate?.encounters[0]?.checks[0]?.capability);
    expect(met.checks?.[0]?.capability).toBeGreaterThan(asTheySetOut);
  });

  // DL-287: the Captain lifts the Roster's baseline while at home, so a Party sent without its Captain
  // drifts up toward the higher baseline on the nights away, and one sent with the Captain does not,
  // while bringing the Captain's factor; the estimate meets each as the resolver does.
  test.each([
    ['with its Captain, who lifts no baseline while away and brings their factor', true],
    ['without its Captain, the baseline lifted by the Captain at home', false],
  ])('reads a Party sent %s as the resolver meets it', (_name, withCaptain) => {
    const content = withCaptaincy({ ...testContent, encounters: { ...testContent.encounters, march: { key: 'march', name: 'March', kind: 'travel', checks: [{ key: 'march', name: 'March', score: strength, skills: [], difficultyFactor: 0.3 }], consequences: { success: [], failure: [] } } } });
    const deps = testDeps({ rivalCount: 0, moraleBaseline: 50, inspirationMoraleShift: 0, fatigueScaling: 0, captainHomeBaselineBonus: 5, captainFormFactor: 1.05 }, withFacilityEffect('quarters', 'moraleBaseline', [0], content));
    const created = createWorld(withCaptain ? 'estimate-captain-away' : 'estimate-captain-home', setup, deps).document;
    const { world } = created;
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const guild = playerGuild(world) as Guild;
    const [captain, other] = guild.rosterIds.map((id) => world.heroes[id] as Hero) as [Hero, Hero];
    for (const hero of [captain, other]) Object.assign(hero, { morale: 50, traits: [] });
    captain.stats['leadership'] = 20;
    guild.captainId = captain.id;
    const sent = withCaptain ? captain : other;
    const questId = world.board[0] as Quest['id'];
    const quest = world.quests[questId] as Quest;
    Object.assign(quest, { durationTurns: 5 * turnsPerDay, encounterKeys: ['march'], lootTableKey: null, requirements: { partySizeMin: 1 } });
    const estimate = estimateQuest(world, quest, [sent], deps);
    const asTheySetOut = capability(queryParty([sent], world, deps), { kind: 'travel' }, deps.content.encounters.march?.checks[0] as EncounterCheck, world, deps);

    const dispatched = applyAction(created, { kind: 'dispatch', guildId: guild.id, questId, heroIds: [sent.id] }, deps);
    if (!dispatched.ok) throw new Error(dispatched.rejection.reason);
    let document = dispatched.document;
    let met: QuestEncounter['payload'] | undefined;
    while (met === undefined) {
      const turned = advance(document, deps);
      document = turned.document;
      met = turned.events.find((event): event is QuestEncounter => event.type === 'quest.encounter')?.payload;
    }
    expect(met.checks?.[0]?.capability).toBe(estimate?.encounters[0]?.checks[0]?.capability);
    // With the Captain: Morale held at 50 away, the factor 1.05 on; without: Morale drifted up toward 55.
    if (withCaptain) expect(met.checks?.[0]?.capability).toBeCloseTo(asTheySetOut, 9);
    else expect(met.checks?.[0]?.capability).toBeGreaterThan(asTheySetOut);
  });

  // DL-287: the Captain's lift on the nights away is the Captain's as the Party sets out, so a Captain
  // the pool brought home, whose own nights away would change them, moves no estimate of a Party
  // without them: each equals `estimateQuest`'s whatever the pool.
  test("partyEstimator holds a Captain at home as they stand at setting out, whatever its pool's copy of them becomes on the nights away", () => {
    // Scarred, which Deep cut leaves, takes Leadership from its least to its most.
    const scarred = { key: 'scarred', name: 'Scarred', excludes: [], effects: [{ kind: 'statModifiers' as const, modifiers: { leadership: 19 } }] };
    const content = withCaptaincy({ ...testContent, heroTraits: { ...testContent.heroTraits, scarred }, encounters: { ...testContent.encounters, march: { key: 'march', name: 'March', kind: 'travel', checks: [{ key: 'march', name: 'March', score: strength, skills: [], difficultyFactor: 0.3 }], consequences: { success: [], failure: [] } } } });
    const deps = testDeps({ rivalCount: 0, moraleBaseline: 50, moraleDrift: 1, inspirationMoraleShift: 0, fatigueScaling: 0, captainHomeBaselineBonus: 5 }, withFacilityEffect('quarters', 'moraleBaseline', [0], content));
    const { world } = createWorld('estimate-captain-pool', setup, deps).document;
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const guild = playerGuild(world) as Guild;
    const [captain, other] = guild.rosterIds.map((id) => world.heroes[id] as Hero) as [Hero, Hero];
    for (const hero of [captain, other]) Object.assign(hero, { morale: 50, traits: [] });
    captain.stats['leadership'] = 1;
    captain.injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(dayOf(world.turn)) };
    guild.captainId = captain.id;
    const quest = { ...structuredClone(world.quests[world.board[0] as Quest['id']] as Quest), durationTurns: 5 * turnsPerDay, encounterKeys: ['march'], lootTableKey: null, requirements: { partySizeMin: 1 } };

    const alone = estimateQuest(world, quest, [other], deps);
    expect(partyEstimator(world, deps)(quest, [other], { pool: [captain, other] })).toEqual(alone);
    expect(partyEstimator(world, deps)(quest, [other], { pool: [other, captain] })).toEqual(alone);
  });

  // DL-284, candidate 8 not adopted: the estimate and the resolver work a Check out twice, so a parity
  // test over fixed Encounters, no one falling, holds them together: every Check's capability on every
  // Encounter, each on its own Day at its own Fatigue, to the last bit, and at no variance its Degree.
  test('meets each Encounter on its Day as the resolver does: every capability to the last bit, Heroes setting out at any Fatigue, none read at the Fatigue they come home with', () => {
    const march = (key: string, score: NumQuery, factor: number): Encounter => ({
      key,
      name: key,
      kind: 'travel',
      checks: [{ key, name: key, score, skills: [], difficultyFactor: factor, variance: 0 }],
      consequences: { success: [], failure: [] },
    });
    const keys = ['first', 'second', 'third', 'fourth', 'fifth'];
    const scores: NumQuery[] = [strength, wits, courage, ['sum', 'party', ['weighted', [['strength', 0.5], ['arcana', 0.5]]]], strength];
    const encounters = Object.fromEntries(keys.map((key, at) => [key, march(key, scores[at] as NumQuery, [0.3, 0.5, 0.2, 0.25, 0.32][at] as number)]));
    const deps = testDeps({ rivalCount: 0 }, { ...testContent, encounters: { ...testContent.encounters, ...encounters } });
    const created = createWorld('estimate-days', setup, deps).document;
    const { world } = created;
    const guild = playerGuild(world) as Guild;
    const heroes = guild.rosterIds.map((id) => world.heroes[id] as Hero);
    heroes.forEach((hero, at) => {
      hero.morale = [25, 50, 70, 95][at % 4] as number;
      hero.fatigue = [0, 30, 65, 97][at % 4] as number;
    });
    const questId = world.board[0] as Quest['id'];
    const quest = world.quests[questId] as Quest;
    Object.assign(quest, { durationTurns: 10 * turnsPerDay, encounterKeys: keys, lootTableKey: null, requirements: { partySizeMin: 1 } });
    const estimate = estimateQuest(world, quest, heroes, deps);
    if (estimate === null) throw new Error('No estimate');

    const sent = applyAction(created, { kind: 'dispatch', guildId: guild.id, questId, heroIds: heroes.map((hero) => hero.id) }, deps);
    if (!sent.ok) throw new Error(sent.rejection.reason);
    let document = sent.document;
    const met: QuestEncounter['payload'][] = [];
    while (met.length === 0) {
      const turned = advance(document, deps);
      document = turned.document;
      met.push(...turned.events.filter((event): event is QuestEncounter => event.type === 'quest.encounter').map((event) => event.payload));
    }

    expect(met.map((it) => it.encounterKey)).toEqual(keys);
    for (const [index, it] of met.entries()) {
      const estimated = estimate.encounters[index];
      expect(it.checks?.map((one) => one.capability), it.encounterKey).toEqual(estimated?.checks.map((one) => one.capability));
      expect(estimated?.degrees[it.degree as Degree], it.encounterKey).toBe(1);
    }
    // Fatigue moved them: the same Check on the first Day and the last reads the Party lower on the last.
    const strengthOn = (index: number) => met[index]?.checks?.[0]?.capability ?? Number.NaN;
    expect(strengthOn(4)).toBeLessThan(strengthOn(0));
  });

  // A Hero Trait's Stat change and Encounter bonus are read as a Check reads them, and a
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
      // No Fatigue on form, so the two Encounters' Checks roll alike on their two Days (DL-284).
    ], { carried: [['grappling-line', 1]], overrides: { fatigueScaling: 0 } });
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
