import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { EncounterAggregate, EncounterCheck } from '../content-types.js';
import type { Guild, GuildId, Guildmaster, Hero, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { generateHero } from '../generators/heroes.js';
import { next } from '../rng.js';
import { buildDocument, heroStatKeys, oldFormCheck, testDeps, testWorld } from '../world.test-support.js';
import { capability as capabilityOf, check as checkOf } from './check.js';
import { queryParty } from './query.js';

// M4-S2: the Check (INPUTS 6.2, DL-42). Heroes are generated, then given the Stats and Skills a test
// needs; the config values a test relies on are pinned. Since v1.1.4-S1 an Encounter's Check scores
// by a Query; these tests write it in the old form, as `encounters.json` still does, so that they
// hold the old reading.

const deps = testDeps({ checkVariance: 0, skillBonusPerRating: 2 });

/** The kind of Encounter the tests' Checks are of. */
const combat = { kind: 'combat' } as const;

/** A Check in the old form: `hold-the-line`'s from the test content, with `fields` changed. */
function encounterWith(
  fields: { demands?: [string, number][]; aggregate?: EncounterAggregate; skillKeys?: string[]; difficultyFactor?: number } = {},
): EncounterCheck {
  const { demands = [['strength', 0.5], ['constitution', 0.5]], aggregate = 'sum', skillKeys = ['shieldwork', 'tactics'], difficultyFactor = 0.3 } = fields;
  return oldFormCheck('hold-the-line', 'Hold the line', aggregate, demands, skillKeys, difficultyFactor);
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
  const twoStats = (aggregate: EncounterAggregate, skillKeys: string[] = []) =>
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
  // M4-S2's first box.
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

// DL-44 (M4-S2 and M4-S5 merged): the Check reads a Hero's Stats through the one `effectiveStats`
// selector, so a Guildmaster's `classStatBonus` Trait reaches the Check, and so Quest outcomes, for
// that Guild's Heroes of that Class and no other, every Guild alike (ADR-0002).
describe('the Check reads effective Stats, Guildmaster Traits included (DL-43, DL-44)', () => {
  /** The fixture world, every Guildmaster without a Trait, and a Warrior and a Mage on each Roster, every Stat 8. */
  function traitScene() {
    const { world } = buildDocument({ rivals: 1, rosterSize: 2 }).document;
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const sides = Object.values(world.guilds).map((guild) => {
      const [warrior, mage] = guild.rosterIds.map((id) => world.heroes[id] as Hero) as [Hero, Hero];
      for (const [hero, classKey] of [[warrior, 'warrior'], [mage, 'mage']] as const) {
        hero.classKey = classKey;
        hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, 8]));
        hero.skills = {};
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
// evaluates (v1.1.4-S1, DL-148 item 5).
describe.each(['check.ts', 'query.ts'])('%s', (file) => {
  const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8');

  test('never mentions the Guildmaster', () => {
    expect(source.toLowerCase()).not.toContain('guildmaster');
  });

  test("reads nothing of the Guild's dealings: no Wealth, Fame, Treasury, Upkeep, Patron or Rival", () => {
    expect(source.toLowerCase()).not.toMatch(/wealth|fame|treasury|upkeep|patron|rival/);
  });
});

describe('query.ts', () => {
  test("imports as values only effectiveStats and ageOf, and otherwise only types: content's, the document's and the config's", () => {
    const source = readFileSync(fileURLToPath(new URL('./query.ts', import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/^import (type )?\{([^}]*)\} from '([^']+)';\r?$/gm)].map(([, type, names = '', from]) => ({
      from,
      names: names.split(',').map((name) => name.trim()).filter((name) => name !== ''),
      typeOnly: type !== undefined,
    }));

    expect(imports.filter((it) => !it.typeOnly)).toEqual([
      { from: '../selectors.js', names: ['effectiveStats'], typeOnly: false },
      { from: '../time.js', names: ['ageOf'], typeOnly: false },
    ]);
    expect(imports.filter((it) => it.typeOnly).map((it) => it.from)).toEqual(['../config.js', '../content-types.js', '../document.js']);
  });
});
