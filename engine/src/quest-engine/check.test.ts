import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { EncounterCheck } from '../content-types.js';
import type { Guild, GuildId, Guildmaster, Hero, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { generateHero } from '../generators/heroes.js';
import { next } from '../rng.js';
import { buildDocument, type CheckAggregate, demandsCheck, heroStatKeys, testDeps, testWorld } from '../world.test-support.js';
import { capability as capabilityOf, check as checkOf } from './check.js';
import { queryParty } from './query.js';

// The Check (INPUTS 6.2, DL-42). Heroes are generated, then given the Stats and Skills a test
// needs; the config values a test relies on are pinned. An Encounter's Check scores
// by a Query; these tests build it from weighted demands (`demandsCheck`), as the old form of an
// Encounter loaded until DL-192, so that they hold that reading.

const deps = testDeps({ checkVariance: 0, skillBonusPerRating: 2 });

/** The kind of Encounter the tests' Checks are of. */
const combat = { kind: 'combat' } as const;

/** A Check built from demands: `hold-the-line`'s from the test content, with `fields` changed. */
function encounterWith(
  fields: { demands?: [string, number][]; aggregate?: CheckAggregate; skillKeys?: string[]; difficultyFactor?: number } = {},
): EncounterCheck {
  const { demands = [['strength', 0.5], ['constitution', 0.5]], aggregate = 'sum', skillKeys = ['shieldwork', 'tactics'], difficultyFactor = 0.3 } = fields;
  return demandsCheck('hold-the-line', 'Hold the line', aggregate, demands, skillKeys, difficultyFactor);
}

/** `heroes`' capability on `encounterCheck`, the Party taken as the Quest Engine takes it. */
function capability(heroes: readonly Hero[], encounterCheck: EncounterCheck, world: World, using: EngineDeps): number {
  return capabilityOf(queryParty(heroes, world, using), combat, encounterCheck, world, using);
}

/** Checks `heroes` on `encounterCheck`, the Party taken as the Quest Engine takes it. */
function check(heroes: readonly Hero[], encounterCheck: EncounterCheck, quest: { difficulty: number }, world: World, using: EngineDeps) {
  return checkOf(queryParty(heroes, world, using), combat, encounterCheck, quest, world, using);
}

/** A world holding `count` Heroes, every Hero Stat at `value` and no Skill, for a test to change. */
function party(seed: string, count: number, value = 8): { world: World; heroes: Hero[] } {
  const world = testWorld(seed, deps);
  const heroes = Array.from({ length: count }, () => {
    const { hero } = generateHero(world, deps);
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, value]));
    hero.skills = {};
    return hero;
  });
  return { world, heroes };
}

describe('capability', () => {
  const twoStats = (aggregate: CheckAggregate, skillKeys: string[] = []) =>
    encounterWith({ demands: [['strength', 0.5], ['courage', 0.5]], aggregate, skillKeys });

  test("with `best`, weighs the best member's value of each Stat", () => {
    const { world, heroes } = party('best', 3);
    const [a, b, c] = heroes as [Hero, Hero, Hero];
    a.stats['strength'] = 14;
    b.stats['courage'] = 12;
    c.stats['strength'] = 3;

    expect(capability(heroes, twoStats('best'), world, deps)).toBe(0.5 * 14 + 0.5 * 12);
  });

  test("with `sum`, weighs the members' sum of each Stat", () => {
    const { world, heroes } = party('sum', 3);
    const [a, b] = heroes as [Hero, Hero, Hero];
    a.stats['strength'] = 14;
    b.stats['courage'] = 12;

    expect(capability(heroes, twoStats('sum'), world, deps)).toBe(0.5 * (14 + 8 + 8) + 0.5 * (8 + 12 + 8));
  });

  test("adds skillBonusPerRating times the best rating any member holds, for each of the Encounter's Skills", () => {
    const { world, heroes } = party('skills', 2);
    const [a, b] = heroes as [Hero, Hero];
    const skilled = twoStats('best', ['shieldwork', 'tactics', 'stealth']);
    const bare = capability(heroes, skilled, world, deps);
    a.skills = { shieldwork: 2, tactics: 1, lockpicking: 5 };
    b.skills = { shieldwork: 3 };

    expect(capability(heroes, skilled, world, deps) - bare).toBe(2 * (3 + 1));
    expect(capability(heroes, skilled, world, testDeps({ skillBonusPerRating: 5 })) - bare).toBe(5 * (3 + 1));
  });

  test('counts a demand on a Stat, or a Skill, that content no longer defines for nothing (rule 5)', () => {
    const { world, heroes } = party('unknown', 1);
    const [hero] = heroes as [Hero];
    hero.skills = { tactics: 3 };
    const odd = encounterWith({ demands: [['strength', 0.5], ['luck', 0.5]], aggregate: 'best', skillKeys: ['tactics', 'juggling'] });

    expect(capability(heroes, odd, world, deps)).toBe(0.5 * 8 + 2 * 3);
  });

  test('is nothing for no members', () => {
    const { world } = party('none', 0);
    expect(capability([], twoStats('sum'), world, deps)).toBe(0);
    expect(capability([], twoStats('best'), world, deps)).toBe(0);
  });
});

describe('check', () => {
  // The first acceptance box.
  test("a Party lacking the Encounter's Skills is beaten by one holding them at rating 3 on the same Stats, with variance 0", () => {
    const { world, heroes } = party('beaten', 4);
    const [a, b, c, d] = heroes as [Hero, Hero, Hero, Hero];
    c.skills = { shieldwork: 3 };
    d.skills = { tactics: 3 };
    const both = encounterWith({ demands: [['strength', 0.5], ['constitution', 0.5]], aggregate: 'sum', skillKeys: ['shieldwork', 'tactics'], difficultyFactor: 1 });
    const lacking = [a, b];
    const holding = [c, d];
    // Between the two: 16 on the Stats alone, and 16 + 2 × 3 × 2 = 28 with the Skills.
    const quest = { difficulty: 20 };

    const without = check(lacking, both, quest, world, deps);
    const withSkills = check(holding, both, quest, world, deps);

    expect(without).toMatchObject({ capability: 16, roll: 16, target: 20, margin: -4, outcome: 'failure' });
    expect(withSkills).toMatchObject({ capability: 28, roll: 28, target: 20, margin: 8, outcome: 'success' });
  });

  test("succeeds when the roll reaches difficultyFactor × the Quest's difficulty, and not below it", () => {
    const { world, heroes } = party('edge', 1);
    const strength = encounterWith({ demands: [['strength', 1]], aggregate: 'best', skillKeys: [], difficultyFactor: 0.5 });

    expect(check(heroes, strength, { difficulty: 16 }, world, deps)).toMatchObject({ target: 8, margin: 0, outcome: 'success' });
    expect(check(heroes, strength, { difficulty: 17 }, world, deps)).toMatchObject({ target: 8.5, outcome: 'failure' });
  });

  test('rolls the capability by 1 + a draw from −checkVariance to +checkVariance, one draw from quests', () => {
    const { world, heroes } = party('roll', 2);
    const line = encounterWith();
    const varied = testDeps({ checkVariance: 0.2, skillBonusPerRating: 2 });
    const twin = structuredClone(streamOf(world, 'quests'));

    const results = Array.from({ length: 200 }, () => check(heroes, line, { difficulty: 30 }, world, varied));

    const cap = capability(heroes, line, world, varied);
    for (const result of results) {
      const r = (next(twin) * 2 - 1) * 0.2;
      expect(result.roll).toBeCloseTo(cap * (1 + r), 10);
      expect(result.capability).toBe(cap);
    }
    expect(streamOf(world, 'quests')).toEqual(twin);
    expect(Math.min(...results.map((it) => it.roll))).toBeLessThan(cap * 0.85);
    expect(Math.max(...results.map((it) => it.roll))).toBeGreaterThan(cap * 1.15);
  });

  // DL-284's verification: formDecided rolls the raw Stats with the same bonus the formed roll took, so
  // only form, not the bonus, can stand between the two.
  test('sets formDecided from the raw Stats carrying the same bonus as the formed roll', () => {
    const { world, heroes } = party('decided-bonus', 1);
    const [hero] = heroes as [Hero];
    hero.traits = [];
    const tiring = testDeps({ checkVariance: 0, fatigueScaling: 0.5, fatigueMax: 100 });
    hero.morale = tiring.config.moraleBaseline;
    const strength = encounterWith({ demands: [['strength', 1]], aggregate: 'best', skillKeys: [], difficultyFactor: 1 });
    const at = (bonus: number) =>
      checkOf(queryParty(heroes, world, tiring, { fatigueByHero: { [hero.id]: 100 } }), combat, strength, { difficulty: 10 }, world, tiring, bonus);

    // Strength 8, formed to 4 at full Fatigue: with a bonus of 4 the formed roll is 8 and the raw 12,
    // either side of the target, 10.
    expect(at(4)).toMatchObject({ capability: 8, roll: 8, outcome: 'failure', formDecided: 'lowered' });
    // With no bonus both fall short, and form decided nothing.
    expect(at(0)).toMatchObject({ capability: 4, outcome: 'failure' });
    expect(at(0)).not.toHaveProperty('formDecided');
  });

  test('draws from the quests stream alone', () => {
    const { world, heroes } = party('streams', 2);
    const before = structuredClone(world.rng) as Record<string, unknown>;

    check(heroes, encounterWith(), { difficulty: 30 }, world, testDeps({ checkVariance: 0.2 }));

    const after = world.rng as Record<string, unknown>;
    for (const name of Object.keys(before)) {
      if (name === 'quests') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });
});

// DL-44: the Check reads a Hero's Stats through the one `effectiveStats`
// selector, so a Guildmaster's `classStatBonus` Trait reaches the Check, and so Quest outcomes, for
// that Guild's Heroes of that Class and no other, every Guild alike (ADR-0002).
describe('the Check reads effective Stats, Guildmaster Traits included (DL-43, DL-44)', () => {
  /**
   * The fixture world, every Guildmaster without a Trait, and a Warrior and a Mage on each Roster, every
   * Stat 8, at the Morale baseline, where their form is 1 (DL-283).
   */
  function traitScene() {
    const { world } = buildDocument({ rivals: 1, rosterSize: 2 }).document;
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const sides = Object.values(world.guilds).map((guild) => {
      const [warrior, mage] = guild.rosterIds.map((id) => world.heroes[id] as Hero) as [Hero, Hero];
      for (const [hero, classKey] of [[warrior, 'warrior'], [mage, 'mage']] as const) {
        hero.classKey = classKey;
        hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
        hero.skills = {};
        hero.morale = deps.config.moraleBaseline;
      }
      return { guild, warrior, mage };
    });
    return { world, sides };
  }
  const guildmasterOf = (world: World, guild: Guild) => world.guildmasters[guild.guildmasterId] as Guildmaster;
  // Weaponry alone, one Hero's best, no Skill: the capability is the Hero's effective Weaponry.
  const weaponry = encounterWith({ demands: [['weaponry', 1]], aggregate: 'best', skillKeys: [], difficultyFactor: 1 });
  const arcana = encounterWith({ demands: [['arcana', 1]], aggregate: 'best', skillKeys: [], difficultyFactor: 1 });

  test.each([0, 1])("Old soldier on Guild %i lifts that Guild's Warriors' capability by 1 and turns a Check at the edge, and nobody else's", (index) => {
    const { world, sides } = traitScene();
    const own = sides[index] as (typeof sides)[number];
    const other = sides[1 - index] as (typeof sides)[number];
    const capabilities = () =>
      [own.warrior, own.mage, other.warrior, other.mage].map((hero) => capability([hero], weaponry, world, deps));
    const before = capabilities();
    const quest = { difficulty: 9 };

    expect(before).toEqual([8, 8, 8, 8]);
    expect(check([own.warrior], weaponry, quest, world, deps)).toMatchObject({ roll: 8, target: 9, outcome: 'failure' });

    guildmasterOf(world, own.guild).traits = ['old-soldier'];

    expect(capabilities()).toEqual([9, 8, 8, 8]);
    expect(check([own.warrior], weaponry, quest, world, deps)).toMatchObject({ roll: 9, target: 9, outcome: 'success' });
    // The stored base is untouched (data-model rule 1).
    expect(own.warrior.stats['weaponry']).toBe(8);
  });

  test("Mistrusts magic lowers that Guild's Mages' capability on Arcana, and not its Warriors' nor another Guild's Mages'", () => {
    const { world, sides } = traitScene();
    const [own, other] = sides as [(typeof sides)[number], (typeof sides)[number]];
    guildmasterOf(world, own.guild).traits = ['mistrusts-magic'];

    expect([own.mage, own.warrior, other.mage].map((hero) => capability([hero], arcana, world, deps))).toEqual([7, 8, 8]);
  });

  test('a Guild whose Guildmaster row is missing reads base Stats', () => {
    const { world, sides } = traitScene();
    const [own] = sides as [(typeof sides)[number]];
    guildmasterOf(world, own.guild).traits = ['old-soldier'];
    const guildId: GuildId = own.guild.id;
    Reflect.deleteProperty(world.guildmasters, (world.guilds[guildId] as Guild).guildmasterId);

    expect(capability([own.warrior], weaponry, world, deps)).toBe(8);
  });
});

// M4's third risk: the Guildmaster's rules are Guild-side, never in the Check, nor in the Queries it
// evaluates (DL-148 item 5), nor in the form it reads them with, nor in the operators the Queries are
// evaluated by and their checks (DL-186 item 6), nor in the Party's consumables (DL-50 item 3).
describe.each(['check.ts', 'query.ts', 'form.ts', 'query/operators.ts', 'query/problems.ts', 'consumables.ts'])('%s', (file) => {
  const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8');

  test('never mentions the Guildmaster', () => {
    expect(source.toLowerCase()).not.toContain('guildmaster');
  });

  test("reads nothing of the Guild's dealings: no Wealth, Fame, Treasury, Upkeep, Patron or Rival", () => {
    expect(source.toLowerCase()).not.toMatch(/wealth|fame|treasury|upkeep|patron|rival/);
  });
});

describe('query.ts', () => {
  // The Captain's scale (DL-287) is the one value read beyond the member's own: which of the Party its
  // Guild names Captain, and their captaincy Stat's scale.
  test("imports as values only effectiveStats, ageOf, the Captain's scale and the form module's four, and otherwise only types: content's, the document's and the config's", () => {
    const source = readFileSync(fileURLToPath(new URL('./query.ts', import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/^import (type )?\{([^}]*)\} from '([^']+)';\r?$/gm)].map(([, type, names = '', from]) => ({
      from,
      names: names.split(',').map((name) => name.trim()).filter((name) => name !== ''),
      typeOnly: type !== undefined,
    }));

    expect(imports.filter((it) => !it.typeOnly)).toEqual([
      { from: '../captain.js', names: ['captaincyScale'], typeOnly: false },
      { from: '../selectors.js', names: ['effectiveStats'], typeOnly: false },
      { from: '../time.js', names: ['ageOf'], typeOnly: false },
      { from: './form.js', names: ['formedStats', 'hurtRelief', 'relievesHurt', 'workingMorale'], typeOnly: false },
    ]);
    expect(imports.filter((it) => it.typeOnly).map((it) => it.from)).toEqual(['../config.js', '../content-types.js', '../document.js']);
  });
});

// The form module (DL-284) reads the configuration, content's Stat areas and the Stats it is given,
// and nothing else: no value of any module, so the form path reads no rule it is not handed.
describe('form.ts', () => {
  test("imports only types: the config's, content's and the document's", () => {
    const source = readFileSync(fileURLToPath(new URL('./form.ts', import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/^import (type )?\{([^}]*)\} from '([^']+)';\r?$/gm)].map(([, type, names = '', from]) => ({
      from,
      names: names.split(',').map((name) => name.trim()).filter((name) => name !== ''),
      typeOnly: type !== undefined,
    }));

    expect(imports).toEqual([
      { from: '../config.js', names: ['GameConfig'], typeOnly: true },
      { from: '../content-types.js', names: ['ContentSet', 'StatArea'], typeOnly: true },
      { from: '../document.js', names: ['StatValues'], typeOnly: true },
    ]);
    expect(source).not.toMatch(/^import (?!type )/m);
  });
});

describe('query/operators.ts', () => {
  test("imports as a value only the row lookup, and otherwise only types: content's, the document's and the Party's", () => {
    const source = readFileSync(fileURLToPath(new URL('./query/operators.ts', import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/^import (type )?\{([^}]*)\} from '([^']+)';\r?$/gm)].map(([, type, names = '', from]) => ({
      from,
      names: names.split(',').map((name) => name.trim()).filter((name) => name !== ''),
      typeOnly: type !== undefined,
    }));

    expect(imports).toEqual([
      { from: '../../content-types.js', names: ['HeroQuery', 'NumQuery', 'PartyCondition', 'PredQuery', 'QueryComparison', 'SetQuery', 'ValQuery'], typeOnly: true },
      { from: '../../document.js', names: ['rowOf', 'type Hero'], typeOnly: false },
      { from: '../query.js', names: ['QueryContent', 'QueryMember', 'QueryParty'], typeOnly: true },
    ]);
  });
});
