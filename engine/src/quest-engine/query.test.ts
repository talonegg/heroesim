import { describe, expect, test } from 'vitest';
import type { HeroQuery, NumQuery, PartyCondition, PredQuery, SetQuery, ValQuery } from '../content-types.js';
import type { Hero, HeroId, SkillRating, World } from '../document.js';
import { generateHero } from '../generators/heroes.js';
import { effectiveStats } from '../selectors.js';
import { ageOf } from '../time.js';
import { heroStatKeys, oldFormCheck, oldFormRequires, testDeps, testWorld } from '../world.test-support.js';
import { evaluate, heroOf, holds, is, membersOf, queryParty, valueOf, type QueryParty } from './query.js';

// v1.1.4-S1: the Query evaluator (ADR-0010, DL-148 items 4 to 6). Five Heroes are generated, then
// given the Stats, Skills, Traits and facts each test reads; every other Hero Stat is 10. The owner's
// three examples come first, each beside its SQL reading.

const deps = testDeps();

interface Written {
  classKey: string;
  sex: 'female' | 'male';
  backgroundKey: string;
  level: number;
  morale: number;
  stats: Record<string, number>;
  skills?: Record<string, SkillRating>;
  traits?: string[];
}

// The Party, in Party order. Aric and Bryn tie on Strength; Cass is the least agile.
const written: Record<string, Written> = {
  aric: { classKey: 'warrior', sex: 'male', backgroundKey: 'farm-born', level: 3, morale: 60, stats: { strength: 15, dexterity: 9, intelligence: 6, wits: 11 }, skills: { swordcraft: 3 }, traits: ['scarred'] },
  bryn: { classKey: 'warrior', sex: 'female', backgroundKey: 'levy-soldier', level: 2, morale: 40, stats: { strength: 15, dexterity: 12, intelligence: 7, wits: 14 }, skills: { shieldwork: 2 } },
  cass: { classKey: 'mage', sex: 'female', backgroundKey: 'temple-ward', level: 4, morale: 70, stats: { strength: 6, dexterity: 8, intelligence: 17, wits: 9 }, skills: { evocation: 4 } },
  dara: { classKey: 'healer', sex: 'male', backgroundKey: 'river-folk', level: 1, morale: 20, stats: { strength: 8, dexterity: 11, intelligence: 12, wits: 13 }, skills: { herbalism: 1 }, traits: ['lame'] },
  edda: { classKey: 'rogue', sex: 'female', backgroundKey: 'farm-born', level: 2, morale: 50, stats: { strength: 9, dexterity: 16, intelligence: 10, wits: 15 }, skills: { stealth: 2 } },
};

/** A world holding the five Heroes written above, by name, in Party order. */
function scene(seed = 'query'): { world: World; heroes: Record<string, Hero>; all: Hero[] } {
  const world = testWorld(seed, deps);
  const heroes: Record<string, Hero> = {};
  for (const [name, it] of Object.entries(written)) {
    const { hero } = generateHero(world, deps, { classKey: it.classKey, level: it.level });
    hero.name = name;
    hero.sex = it.sex;
    hero.backgroundKey = it.backgroundKey;
    hero.morale = it.morale;
    hero.stats = { ...Object.fromEntries(heroStatKeys.map((key) => [key, 10])), ...it.stats };
    hero.skills = { ...it.skills };
    hero.traits = [...(it.traits ?? [])];
    heroes[name] = hero;
  }
  return { world, heroes, all: Object.values(heroes) };
}

/** The whole Party, as the Queries read it, with `hurt` the names hurt on the Quest. */
function partyOf(hurt: string[] = [], seed?: string): { party: QueryParty; heroes: Record<string, Hero>; world: World } {
  const { world, heroes, all } = scene(seed);
  const ids = new Set(hurt.map((name) => (heroes[name] as Hero).id));
  return { party: queryParty(all, world, deps, ids), heroes, world };
}

const { party } = partyOf();
const num = (query: NumQuery, over: QueryParty = party): number => evaluate(query, over);
const names = (set: SetQuery, over: QueryParty = party): string[] => membersOf(set, over).map((member) => member.hero.name);
const nameOf = (query: HeroQuery, over: QueryParty = party): string | undefined => heroOf(query, over)?.hero.name;
const member = (name: string, over: QueryParty = party) => over.members.find((it) => it.hero.name === name) ?? expect.fail(name);
const val = (query: ValQuery, name: string): number => valueOf(query, member(name), party.content);
const pred = (query: PredQuery): string[] => party.members.filter((it) => is(query, it, party.content)).map((it) => it.hero.name);
const nobody: SetQuery = ['where', 'party', ['class', 'paladin']];

describe("the owner's examples (DL-148)", () => {
  test("the strongest Warrior's Strength: SELECT MAX(strength) FROM party WHERE class = 'warrior'", () => {
    const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];

    expect(num(['of', ['best', warriors, ['stat', 'strength']], ['stat', 'strength']])).toBe(15);
    expect(num(['max', warriors, ['stat', 'strength']])).toBe(15);
  });

  test("the total Intelligence of the Mages and Healers: SELECT SUM(intelligence) FROM party WHERE class IN ('mage', 'healer')", () => {
    expect(num(['sum', ['where', 'party', ['class', 'mage', 'healer']], ['stat', 'intelligence']])).toBe(17 + 12);
  });

  test('the Wits of the least agile Hero: SELECT wits FROM party ORDER BY dexterity LIMIT 1', () => {
    // "Agile" is Dexterity, and Wits is a Stat of its own in the core (`wits`).
    expect(num(['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']])).toBe(9);
    expect(nameOf(['worst', 'party', ['stat', 'dexterity']])).toBe('cass');
  });
});

describe('a Set', () => {
  test('"party" is every member, in Party order', () => {
    expect(names('party')).toEqual(['aric', 'bryn', 'cass', 'dara', 'edda']);
  });

  test('`where` keeps the members its Pred holds of, in Party order', () => {
    expect(names(['where', 'party', ['class', 'warrior']])).toEqual(['aric', 'bryn']);
    expect(names(['where', 'party', ['class', 'healer', 'mage']])).toEqual(['cass', 'dara']);
  });

  test('a `where` within a `where` narrows again', () => {
    expect(names(['where', ['where', 'party', ['sex', 'female']], ['>', ['stat', 'wits'], 10]])).toEqual(['bryn', 'edda']);
  });

  test('`top` takes the n highest by its Val and keeps them in Party order', () => {
    expect(names(['top', 'party', 2, ['stat', 'dexterity']])).toEqual(['bryn', 'edda']);
  });

  test('`top` breaks a tie at the cut for the earlier Hero', () => {
    expect(names(['top', 'party', 1, ['stat', 'strength']])).toEqual(['aric']);
    // A Stat content lacks reads 0 for everyone: the first Hero who is not a Warrior.
    expect(names(['top', ['where', 'party', ['not', ['class', 'warrior']]], 1, ['stat', 'luck']])).toEqual(['cass']);
  });

  test('`bottom` takes the n lowest, the earlier on a tie', () => {
    expect(names(['bottom', 'party', 2, ['stat', 'strength']])).toEqual(['cass', 'dara']);
    expect(names(['bottom', 'party', 1, ['level']])).toEqual(['dara']);
    expect(names(['bottom', ['where', 'party', ['class', 'warrior']], 1, ['stat', 'strength']])).toEqual(['aric']);
  });

  test('`top` or `bottom` of more than the Set holds takes all of it', () => {
    expect(names(['top', ['where', 'party', ['class', 'warrior']], 4, ['stat', 'wits']])).toEqual(['aric', 'bryn']);
    expect(names(['bottom', nobody, 2, ['stat', 'wits']])).toEqual([]);
  });
});

describe('a Hero', () => {
  test('`best` is the highest by its Val, the earlier in Party order on a tie', () => {
    expect(nameOf(['best', 'party', ['stat', 'intelligence']])).toBe('cass');
    expect(nameOf(['best', 'party', ['stat', 'strength']])).toBe('aric');
  });

  test('`worst` is the lowest, the earlier on a tie', () => {
    expect(nameOf(['worst', 'party', ['stat', 'intelligence']])).toBe('aric');
    expect(nameOf(['worst', ['where', 'party', ['sex', 'female']], ['level']])).toBe('bryn');
  });

  test('of an empty Set is no Hero, and `of` no Hero is 0', () => {
    expect(heroOf(['best', nobody, ['stat', 'strength']], party)).toBeUndefined();
    expect(num(['of', ['worst', nobody, ['stat', 'strength']], ['stat', 'strength']])).toBe(0);
  });
});

describe('a Val, of the current Hero', () => {
  test('`stat` is the effective Stat, and a Stat content does not define reads 0', () => {
    expect(val(['stat', 'strength'], 'aric')).toBe(15);
    expect(val(['stat', 'luck'], 'aric')).toBe(0);
  });

  test('`skill` is the rating held, 0 for one not held or one content does not define (rule 5)', () => {
    const { party: odd, heroes } = partyOf([], 'odd-skill');
    (heroes['aric'] as Hero).skills['juggling'] = 5;

    expect(val(['skill', 'swordcraft'], 'aric')).toBe(3);
    expect(val(['skill', 'evocation'], 'aric')).toBe(0);
    expect(valueOf(['skill', 'juggling'], member('aric', odd), odd.content)).toBe(0);
  });

  test("`level`, `morale` and `age` read the Hero's Level, Morale and age", () => {
    const { world, heroes } = partyOf();
    const cass = heroes['cass'] as Hero;

    expect(val(['level'], 'cass')).toBe(4);
    expect(val(['morale'], 'cass')).toBe(70);
    expect(valueOf(['age'], member('cass', queryParty([cass], world, deps)), party.content)).toBe(ageOf(cass, world.turn, deps.config));
  });

  test('`weighted` sums each Stat times its weight, in the order listed', () => {
    expect(val(['weighted', [['strength', 0.5], ['dexterity', 0.25], ['luck', 3]]], 'edda')).toBe(9 * 0.5 + 16 * 0.25);
  });

  test('`+`, `-` and `*` combine Vals, and a number is a Val', () => {
    expect(val(['+', ['stat', 'strength'], ['stat', 'wits'], 1], 'bryn')).toBe(15 + 14 + 1);
    expect(val(['-', ['stat', 'wits'], ['stat', 'strength']], 'bryn')).toBe(-1);
    expect(val(['*', ['stat', 'strength'], 2, 0.5], 'bryn')).toBe(15);
    expect(val(7, 'bryn')).toBe(7);
  });
});

describe('a Pred, of the current Hero', () => {
  test('`class` holds of any Class listed; one content does not define matches no one (rule 5)', () => {
    const { party: odd, heroes } = partyOf([], 'odd-class');
    (heroes['edda'] as Hero).classKey = 'paladin';

    expect(pred(['class', 'rogue', 'warrior'])).toEqual(['aric', 'bryn', 'edda']);
    expect(odd.members.filter((it) => is(['class', 'paladin'], it, odd.content))).toEqual([]);
  });

  test('`background` holds of any Background listed; one content does not define matches no one', () => {
    const { party: odd, heroes } = partyOf([], 'odd-background');
    (heroes['bryn'] as Hero).backgroundKey = 'sea-born';

    expect(pred(['background', 'farm-born'])).toEqual(['aric', 'edda']);
    expect(odd.members.filter((it) => is(['background', 'sea-born'], it, odd.content))).toEqual([]);
  });

  test('`sex` holds of the Heroes of that sex', () => {
    expect(pred(['sex', 'female'])).toEqual(['bryn', 'cass', 'edda']);
    expect(pred(['sex', 'male'])).toEqual(['aric', 'dara']);
  });

  test('`has-skill` holds of a rating of 1 or more, or of `min` or more', () => {
    expect(pred(['has-skill', 'evocation'])).toEqual(['cass']);
    expect(pred(['has-skill', 'swordcraft', 3])).toEqual(['aric']);
    expect(pred(['has-skill', 'swordcraft', 4])).toEqual([]);
  });

  test('`has-trait` holds of a Hero carrying the Trait; one content does not define matches no one', () => {
    const { party: odd, heroes } = partyOf([], 'odd-trait');
    (heroes['cass'] as Hero).traits.push('cursed');

    expect(pred(['has-trait', 'lame'])).toEqual(['dara']);
    expect(odd.members.filter((it) => is(['has-trait', 'cursed'], it, odd.content))).toEqual([]);
  });

  test('`hurt` holds of the Heroes hurt earlier on the Quest', () => {
    const { party: hurt } = partyOf(['bryn', 'edda'], 'hurt');

    expect(hurt.members.filter((it) => is(['hurt'], it, hurt.content)).map((it) => it.hero.name)).toEqual(['bryn', 'edda']);
    expect(pred(['hurt'])).toEqual([]);
  });

  test.each<[PredQuery, string[]]>([
    [['>=', ['stat', 'strength'], 9], ['aric', 'bryn', 'edda']],
    [['>', ['stat', 'strength'], 9], ['aric', 'bryn']],
    [['<', ['stat', 'strength'], 9], ['cass', 'dara']],
    [['<=', ['stat', 'strength'], 9], ['cass', 'dara', 'edda']],
    [['=', ['stat', 'strength'], 15], ['aric', 'bryn']],
  ])('%j compares two Vals', (query, expected) => {
    expect(pred(query)).toEqual(expected);
  });

  test('`and`, `or` and `not` combine Preds', () => {
    expect(pred(['and', ['sex', 'female'], ['class', 'warrior', 'rogue']])).toEqual(['bryn', 'edda']);
    expect(pred(['or', ['class', 'mage'], ['has-trait', 'scarred']])).toEqual(['aric', 'cass']);
    expect(pred(['not', ['sex', 'female']])).toEqual(['aric', 'dara']);
  });
});

describe('a Num, of the Party', () => {
  test('`sum` adds in Party order, from 0, so that the same Party reads the same to the last bit', () => {
    const values = party.members.map((it) => (it.stats['wits'] ?? 0) * 0.1);
    const inOrder = values.reduce((total, value) => total + value, 0);

    expect(num(['sum', 'party', ['*', ['stat', 'wits'], 0.1]])).toBe(inOrder);
  });

  test('`avg` is the mean, and 0 for an empty Set', () => {
    expect(num(['avg', ['where', 'party', ['class', 'warrior']], ['stat', 'wits']])).toBe(12.5);
    expect(num(['avg', nobody, ['stat', 'wits']])).toBe(0);
  });

  test('`max` and `min` are the highest and lowest value', () => {
    expect(num(['max', 'party', ['stat', 'intelligence']])).toBe(17);
    expect(num(['min', 'party', ['stat', 'intelligence']])).toBe(6);
  });

  test('`count` is how many the Set holds', () => {
    expect(num(['count', 'party'])).toBe(5);
    expect(num(['count', ['where', 'party', ['has-skill', 'stealth']]])).toBe(1);
  });

  test('`ranked` weighs the highest value by the first weight, the next by the second, and so on', () => {
    // Strength: Aric 15, Bryn 15 (after Aric on the tie), Edda 9, Dara 8, Cass 6.
    expect(num(['ranked', 'party', ['stat', 'strength'], [1, 0.5, 0.25]])).toBe(15 + 15 * 0.5 + 9 * 0.25);
  });

  test('`ranked` with more weights than Heroes uses only as many as there are', () => {
    expect(num(['ranked', ['where', 'party', ['class', 'mage']], ['stat', 'intelligence'], [1, 1, 1]])).toBe(17);
  });

  test('`of` reads a Val of one Hero', () => {
    expect(num(['of', ['best', 'party', ['skill', 'evocation']], ['stat', 'intelligence']])).toBe(17);
  });

  test('`+`, `-`, `*`, `least` and `greatest` combine Nums, and a number is a Num', () => {
    const strongest: NumQuery = ['max', 'party', ['stat', 'strength']];
    const count: NumQuery = ['count', 'party'];

    expect(num(['+', strongest, count, 1])).toBe(21);
    expect(num(['-', strongest, count])).toBe(10);
    expect(num(['*', strongest, count, 0.5])).toBe(37.5);
    expect(num(['least', strongest, count, 7])).toBe(5);
    expect(num(['greatest', strongest, count, 7])).toBe(15);
    expect(num(3.5)).toBe(3.5);
  });

  test.each<[string, NumQuery]>([
    ['sum', ['sum', nobody, ['stat', 'wits']]],
    ['avg', ['avg', nobody, ['stat', 'wits']]],
    ['max', ['max', nobody, ['stat', 'wits']]],
    ['min', ['min', nobody, ['stat', 'wits']]],
    ['count', ['count', nobody]],
    ['ranked', ['ranked', nobody, ['stat', 'wits'], [1, 0.5]]],
    ['of', ['of', ['best', nobody, ['stat', 'wits']], ['stat', 'wits']]],
  ])('an empty Set gives 0 to `%s`', (_, query) => {
    expect(num(query)).toBe(0);
  });

  test('a Party of no one gives 0 to every Num', () => {
    const { world } = scene('no-one');
    const empty = queryParty([], world, deps);

    expect(num(['sum', 'party', ['stat', 'strength']], empty)).toBe(0);
    expect(num(['max', 'party', ['stat', 'strength']], empty)).toBe(0);
    expect(num(['count', 'party'], empty)).toBe(0);
  });
});

describe('a Party-level condition', () => {
  test.each<[PartyCondition, boolean]>([
    [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 2], true],
    [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 3], false],
    [['>', ['max', 'party', ['stat', 'wits']], 14], true],
    [['<', ['min', 'party', ['stat', 'intelligence']], 6], false],
    [['<=', ['min', 'party', ['stat', 'intelligence']], 6], true],
    [['=', ['count', 'party'], 5], true],
  ])('%j holds as its comparison says', (condition, expected) => {
    expect(holds(condition, party)).toBe(expected);
  });

  test("the old form of a Synergy's requirement reads as before: a count of each Class, and each Skill held at any rating", () => {
    const met = (requires: Parameters<typeof oldFormRequires>[0]) => oldFormRequires(requires).every((it) => holds(it, party));

    expect(met({ classes: { warrior: 2, mage: 1 } })).toBe(true);
    expect(met({ classes: { warrior: 3 } })).toBe(false);
    expect(met({ skills: ['herbalism', 'stealth'] })).toBe(true);
    expect(met({ skills: ['herbalism', 'warding'] })).toBe(false);
  });
});

describe('the old form of an Encounter', () => {
  // Every result the same to the last bit (v1.1.4-S1): the old Check added `weight × aggregate` for each
  // demand in order, from 0, `best` being Math.max(0, …) of the members' values and `sum` their sum.
  test.each(['best', 'sum'] as const)('with `%s`, its Check scores exactly as the old capability did', (aggregate) => {
    const demands: [string, number][] = [['strength', 0.3], ['wits', 0.1], ['dexterity', 0.2], ['intelligence', 0.4]];
    const encounterCheck = oldFormCheck('test', 'Test', aggregate, demands, [], 1);
    for (const size of [1, 2, 3, 4, 5]) {
      const some = queryParty(party.members.slice(0, size).map((it) => it.hero), scene().world, deps);
      let old = 0;
      for (const [statKey, weight] of demands) {
        const values = some.members.map((it) => it.stats[statKey] ?? 0);
        old += weight * (aggregate === 'best' ? Math.max(0, ...values) : values.reduce((total, value) => total + value, 0));
      }

      expect(evaluate(encounterCheck.score, some)).toBe(old);
    }
  });
});

describe('queryParty', () => {
  test("reads each Hero's effective Stats once, when the Party is taken", () => {
    const { world, all } = scene('once');
    const taken = queryParty(all, world, deps);
    const [aric] = all as [Hero];

    expect(taken.members.map((it) => it.stats)).toEqual(all.map((hero) => effectiveStats(hero, world, deps.content)));
    aric.stats['strength'] = 3;
    expect(evaluate(['of', ['best', 'party', ['stat', 'strength']], ['stat', 'strength']], taken)).toBe(15);
    expect(evaluate(['max', 'party', ['stat', 'strength']], queryParty(all, world, deps))).toBe(15);
    expect(evaluate(['min', 'party', ['stat', 'strength']], queryParty(all, world, deps))).toBe(3);
  });

  test('keeps Party order, and marks hurt only the Heroes named', () => {
    const { world, all } = scene('order');
    const reversed = [...all].reverse();
    const hurt = new Set<HeroId>([(all[1] as Hero).id]);
    const taken = queryParty(reversed, world, deps, hurt);

    expect(taken.members.map((it) => it.hero.name)).toEqual(['edda', 'dara', 'cass', 'bryn', 'aric']);
    expect(taken.members.map((it) => it.hurt)).toEqual([false, false, false, true, false]);
  });

  test('draws nothing: every stream is as it was', () => {
    const { world, all } = scene('draws');
    const before = structuredClone(world.rng);
    const taken = queryParty(all, world, deps);

    evaluate(['ranked', ['top', 'party', 3, ['stat', 'wits']], ['weighted', [['strength', 1]]], [1, 0.5]], taken);
    holds(['>=', ['avg', ['where', 'party', ['sex', 'female']], ['level']], 1], taken);

    expect(world.rng).toEqual(before);
  });

  test('throws on an operator no type has, which content validation refuses', () => {
    expect(() => evaluate(['median', 'party', ['stat', 'wits']] as unknown as NumQuery, party)).toThrow(/is not a Num Query/);
    expect(() => membersOf(['shuffle', 'party'] as unknown as SetQuery, party)).toThrow(/is not a Set Query/);
  });
});
