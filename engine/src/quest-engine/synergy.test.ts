import { describe, expect, test } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Encounter, EncounterKind, Synergy } from '../content-types.js';
import { encounterKinds } from '../content-types.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type Party, type Quest, type World, type WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { playerGuild } from '../selectors.js';
import { harmlessContent, heroStatKeys, testContent, testDeps, testWorld, withValid } from '../world.test-support.js';
import { capability, check } from './check.js';
import { resolveQuest } from './resolve.js';
import { appliesOn, meetsRequirement, synergiesFor, synergiesOn, synergyBonus } from './synergy.js';

// M4-S3: Synergies (R26, INPUTS 6.4, DL-45), matched on the Party's Classes and Skills and added to
// the Check on the Encounter kinds each names. The test content carries the core's six; a test that
// needs others writes them. The config values a Check relies on are pinned, and every document the
// engine makes here is asserted valid.

const pinned = { rivalCount: 0, checkVariance: 0, skillBonusPerRating: 2, bandBySuccessShare: { successAbove: 0.5, strongAtLeast: 1 } };
const deps = testDeps(pinned);
/** The same, with no Synergies: what the Check would be without this story. */
const bare = testDeps(pinned, { ...testContent, synergies: {} });

/** A world holding a Party of Heroes of `classKeys`, every Hero Stat at 8 and no Skill, for a test to change. */
function partyOf(seed: string, ...classKeys: string[]): { world: World; heroes: Hero[] } {
  const world = testWorld(seed, deps);
  const heroes = classKeys.map((classKey) => {
    const { hero } = generateHero(world, deps, { classKey });
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
    hero.skills = {};
    return hero;
  });
  return { world, heroes };
}

/** An Encounter of `kind` on Strength alone, summed, with no Skill: a Party of 8s has a base of 8 a member. */
function encounterOf(kind: EncounterKind, fields: Partial<Encounter> = {}): Encounter {
  return {
    key: `test-${kind}`,
    name: `Test ${kind}`,
    kind,
    demands: [['strength', 1]],
    aggregate: 'sum',
    skillKeys: [],
    difficultyFactor: 1,
    consequences: { success: [], failure: [] },
    ...fields,
  };
}

const keysOf = (synergies: readonly Synergy[]): string[] => synergies.map((synergy) => synergy.key);

describe('synergiesFor', () => {
  test("a Party matching a Synergy's Classes has it, and one member short has none of it", () => {
    const { heroes } = partyOf('classes', 'warrior', 'warrior', 'warrior', 'warrior', 'healer', 'rogue');
    const [w1, w2, w3, w4, healer, rogue] = heroes as [Hero, Hero, Hero, Hero, Hero, Hero];

    expect(keysOf(synergiesFor([w1, healer], testContent))).toEqual(['sword-and-salve']);
    expect(keysOf(synergiesFor([w1, rogue], testContent))).toEqual([]);
    expect(keysOf(synergiesFor([w1, w2, w3], testContent))).toEqual(['shield-wall']);
    expect(keysOf(synergiesFor([w1, w2], testContent))).toEqual([]);
    // At least the count: a fourth Warrior keeps it.
    expect(keysOf(synergiesFor([w1, w2, w3, w4], testContent))).toEqual(['shield-wall']);
  });

  test("a Party holding a Synergy's Skills has it, held by any members at any rating, and missing one has none of it", () => {
    const { heroes } = partyOf('skills', 'mage', 'healer', 'warrior');
    const [mage, healer, warrior] = heroes as [Hero, Hero, Hero];
    mage.skills = { warding: 1 };
    healer.skills = { benediction: 4 };

    expect(keysOf(synergiesFor([mage, healer], testContent))).toEqual(['wards-and-blessings']);
    expect(keysOf(synergiesFor([mage, warrior], testContent))).toEqual([]);
    expect(meetsRequirement([mage], { skills: ['warding', 'benediction'] })).toBe(false);
    mage.skills['benediction'] = 2;
    expect(meetsRequirement([mage], { skills: ['warding', 'benediction'] })).toBe(true);
  });

  test('lists every Synergy a Party meets in key order, whatever Encounter it meets', () => {
    const { heroes } = partyOf('many', 'warrior', 'warrior', 'warrior', 'rogue', 'mage', 'healer');

    expect(keysOf(synergiesFor(heroes, testContent))).toEqual(['a-full-company', 'shadow-and-spell', 'shield-wall', 'sword-and-salve']);
    expect(synergiesFor(heroes, { synergies: {} })).toEqual([]);
  });
});

describe('the Synergy term of the capability', () => {
  // M4-S3's first box.
  test("a Party matching a Synergy's requirement scores the bonus; one member short scores none", () => {
    const { world, heroes } = partyOf('scores', 'warrior', 'warrior', 'warrior', 'healer', 'rogue');
    const [w1, w2, w3, healer, rogue] = heroes as [Hero, Hero, Hero, Hero, Hero];
    const combat = encounterOf('combat');

    // Shield wall, three Warriors: × 1.15 on the base of 24. Two Warriors: the base alone.
    expect(capability([w1, w2, w3], combat, world, deps)).toBeCloseTo(24 * 1.15, 10);
    expect(capability([w1, w2], combat, world, deps)).toBe(16);
    // Sword and salve, a Warrior and a Healer: + 2. A Warrior and a Rogue: the base alone.
    expect(capability([w1, healer], combat, world, deps)).toBe(16 + 2);
    expect(capability([w1, rogue], combat, world, deps)).toBe(16);

    // At the edge, the bonus turns the Check: 24 misses a target of 26, 27.6 reaches it.
    const quest = { difficulty: 26 };
    expect(check([w1, w2, w3], combat, quest, world, bare)).toMatchObject({ roll: 24, outcome: 'failure' });
    expect(check([w1, w2, w3], combat, quest, world, deps)).toMatchObject({ outcome: 'success' });
    expect(check([w1, w2], combat, { difficulty: 16 }, world, deps)).toMatchObject({ roll: 16, margin: 0, outcome: 'success' });
    expect(check([w1, w2], combat, { difficulty: 17 }, world, deps)).toMatchObject({ roll: 16, outcome: 'failure' });
  });

  // M4-S3's second box.
  test('a Synergy restricted to kinds applies only to those Encounters, and one naming none to every kind', () => {
    const { world, heroes } = partyOf('kinds', 'warrior', 'warrior', 'warrior', 'healer', 'rogue', 'mage');
    const [w1, w2, w3, healer, rogue, mage] = heroes as [Hero, Hero, Hero, Hero, Hero, Hero];
    const on = (party: Hero[]) => encounterKinds.map((kind) => capability(party, encounterOf(kind), world, deps));

    // Shield wall: combat only.
    expect(on([w1, w2, w3])).toEqual([24 * 1.15, 24, 24, 24, 24].map((value) => expect.closeTo(value, 10)));
    // Sword and salve: combat and travel.
    expect(on([w1, healer])).toEqual([18, 18, 16, 16, 16]);
    // A full company, on every kind (× 1.05 + 1), beside Sword and salve on combat and travel and
    // Shadow and spell (× 1.1) on arcane and stealth.
    expect(on([w1, rogue, mage, healer])).toEqual(
      [32 * 1.05 + 1 + 2, 32 * 1.05 + 1 + 2, 32 * 1.05 + 1, 32 * 1.05 * 1.1 + 1, 32 * 1.05 * 1.1 + 1].map((value) => expect.closeTo(value, 10)),
    );
    expect(encounterKinds.map((kind) => keysOf(synergiesOn([w1, w2, w3], { kind }, testContent)))).toEqual([['shield-wall'], [], [], [], []]);
    expect(appliesOn({}, 'social')).toBe(true);
  });

  test("several Synergies: their factors multiply and scale the Stats and Skills alone, their flats add unscaled, in any order", () => {
    const { world, heroes } = partyOf('several', 'warrior');
    const [warrior] = heroes as [Hero];
    warrior.skills = { tactics: 3 };
    const onWarrior = (key: string, bonus: Synergy['bonus']): [string, Synergy] => [key, { key, name: key, requires: { classes: { warrior: 1 } }, bonus }];
    const rows = [onWarrior('a', { factor: 1.2 }), onWarrior('b', { flat: 2 }), onWarrior('c', { factor: 1.5 }), onWarrior('d', { flat: 3, factor: 1.1 })];
    const listed = (order: [string, Synergy][]): EngineDeps => testDeps(pinned, { ...testContent, synergies: Object.fromEntries(order) });
    // Strength 8 and Tactics 3 × 2: a base of 14.
    const encounter = encounterOf('combat', { skillKeys: ['tactics'] });

    expect(capability([warrior], encounter, world, bare)).toBe(14);
    const expected = 14 * 1.2 * 1.5 * 1.1 + 2 + 3;
    expect(capability([warrior], encounter, world, listed(rows))).toBeCloseTo(expected, 10);
    expect(capability([warrior], encounter, world, listed([...rows].reverse()))).toBeCloseTo(expected, 10);
    expect(synergyBonus([warrior], encounter, 14, listed(rows))).toBeCloseTo(expected - 14, 10);
    expect(synergyBonus([warrior], encounter, 14, bare)).toBe(0);
  });
});

/** A created world whose player sends Heroes of `classKeys`, Stats all 8 and no Skill, through `keys`. */
function scene(seed: string, content: ContentSet, keys: string[], classKeys: string[], difficulty = 30) {
  const sceneDeps = testDeps(pinned, content);
  const { world } = createWorld(seed, { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, sceneDeps).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.slice(0, classKeys.length).map((id, index) => {
    const hero = world.heroes[id] as Hero;
    hero.classKey = classKeys[index] ?? 'warrior';
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
    hero.skills = {};
    return hero;
  });
  const offered = world.quests[world.board[0] as Quest['id']] as Quest;
  const quest: Quest = { ...structuredClone(offered), difficulty, encounterKeys: keys };
  const party: Party = {
    id: makeId('parties', 99),
    questId: quest.id,
    guildId: guild.id,
    heroIds: heroes.map((hero) => hero.id),
    departedOnTurn: 0,
    returnsOnTurn: 5,
  };
  return { world, quest, party, deps: sceneDeps };
}

describe("the Quest's outcome lists the Synergies that applied", () => {
  test('once each, however many Encounters it added to, and not one the Party met on no Encounter of its kinds', () => {
    const combatOnly = scene('met-not-applied', harmlessContent, ['ambush-on-the-road', 'hold-the-line'], ['rogue', 'mage']);
    const withStealth = scene('applied', harmlessContent, ['ambush-on-the-road', 'past-the-watch', 'the-trapped-passage'], ['rogue', 'mage']);

    const party = (it: typeof combatOnly) => it.party.heroIds.map((id) => it.world.heroes[id] as Hero);
    expect(keysOf(synergiesFor(party(combatOnly), testContent))).toEqual(['shadow-and-spell']);
    expect(resolveQuest(combatOnly.world, combatOnly.quest, combatOnly.party, combatOnly.deps).outcome.synergyKeys).toEqual([]);
    expect(resolveQuest(withStealth.world, withStealth.quest, withStealth.party, withStealth.deps).outcome.synergyKeys).toEqual([
      'shadow-and-spell',
    ]);
  });

  test('a Synergy lost with a member who died applies to no later Encounter', () => {
    const reeve = harmlessContent.encounters['a-hostile-reeve'] as Encounter;
    const deadly: ContentSet = {
      ...harmlessContent,
      encounters: {
        ...harmlessContent.encounters,
        'a-hostile-reeve': { ...reeve, consequences: { success: [], failure: [{ kind: 'death', chance: 1 }] } },
      },
    };
    const keys = ['a-hostile-reeve', 'ambush-on-the-road'];
    // A social Encounter, where Sword and salve does not apply, fails and kills one of the two; the combat after it has one.
    const lost = scene('lost', deadly, keys, ['warrior', 'healer'], 5000);
    const kept = scene('kept', harmlessContent, keys, ['warrior', 'healer'], 5000);

    const lostResolution = resolveQuest(lost.world, lost.quest, lost.party, lost.deps);
    expect(lostResolution.outcome.deaths).toHaveLength(1);
    expect(lostResolution.encounters).toHaveLength(2);
    expect(lostResolution.outcome.synergyKeys).toEqual([]);
    expect(resolveQuest(kept.world, kept.quest, kept.party, kept.deps).outcome.synergyKeys).toEqual(['sword-and-salve']);
  });

  test("quest.resolved's payload carries them when the Party comes home, and no quest.encounter names one", () => {
    const content = harmlessContent;
    const gameDeps = testDeps(pinned, content);
    const start = createWorld('payload', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, gameDeps).document;
    const guild = playerGuild(start.world) as Guild;
    const heroIds = guild.rosterIds.slice(0, 2);
    heroIds.forEach((id, index) => {
      const hero = start.world.heroes[id] as Hero;
      hero.classKey = index === 0 ? 'warrior' : 'healer';
      hero.skills = {};
    });
    const open = start.world.board
      .map((id) => start.world.quests[id] as Quest)
      .find(({ requirements: { classKey, skillKey, partySizeMin, partySizeMax } }) =>
        classKey === undefined && skillKey === undefined && partySizeMin <= 2 && 2 <= partySizeMax,
      );
    if (open === undefined) throw new Error('No open Quest for two on the first Board');
    const sent = dispatch(withValid(start, gameDeps), { guildId: guild.id, questId: open.id, heroIds }, gameDeps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const quest = sent.document.world.quests[open.id] as Quest;
    quest.encounterKeys = ['the-long-march', 'a-hostile-reeve'];
    const party = sent.document.world.parties[quest.partyIds[0] as Party['id']] as Party;

    let document: WorldDocument = withValid(sent.document, gameDeps);
    const events: EngineEvent[] = [];
    while (document.world.turn < party.returnsOnTurn) {
      const result = advance(document, gameDeps);
      document = withValid(result.document, gameDeps);
      events.push(...result.events);
    }

    const ofType = <Type extends EngineEvent['type']>(type: Type) =>
      events.filter((event): event is EngineEventOf<Type> => event.type === type && JSON.stringify(event.payload).includes(quest.id));
    const [resolved] = ofType('quest.resolved');
    expect(resolved?.payload.synergyKeys).toEqual(['sword-and-salve']);
    const stored = (document.history.byType['quest.resolved'] ?? []).map((position) => document.history.entries[position]);
    expect(stored).toContainEqual(resolved);
    const encounters = ofType('quest.encounter');
    expect(encounters).toHaveLength(2);
    for (const encounter of encounters) expect(Object.keys(encounter.payload)).not.toContain('synergyKeys');
  });
});
