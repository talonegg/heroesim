import { describe, expect, test } from 'vitest';
import type { HeroQuery, NumQuery, PartyCondition, PredQuery, SetQuery, StatArea, ValQuery } from '../content-types.js';
import type { Hero, HeroId, SkillRating, World } from '../document.js';
import { generateHero } from '../generators/heroes.js';
import { effectiveStats } from '../selectors.js';
import { ageOf } from '../time.js';
import type { Class, ContentSet } from '../content-types.js';
import { classSkillRequires, demandsCheck, heroStatKeys, testContent, testDeps, testWorld } from '../world.test-support.js';
import { hurtFactor, moraleFactor } from './form.js';
import { atFatigue, evaluate, heroOf, holds, is, membersOf, queryParty, valueOf, type QueryMember, type QueryParty } from './query.js';

// The Query evaluator (ADR-0010, DL-148 items 4 to 6). Five Heroes are generated, then
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
  return { party: queryParty(all, world, deps, { hurt: ids }), heroes, world };
}

const { party } = partyOf();
const num = (query: NumQuery, over: QueryParty = party): number => evaluate(query, over);
const names = (set: SetQuery, over: QueryParty = party): string[] => membersOf(set, over).map((member) => member.hero.name);
const nameOf = (query: HeroQuery, over: QueryParty = party): string | undefined => heroOf(query, over)?.hero.name;
const member = (name: string, over: QueryParty = party) => over.members.find((it) => it.hero.name === name) ?? expect.fail(name);
const val = (query: ValQuery, name: string): number => valueOf(query, member(name), party.content);
const pred = (query: PredQuery): string[] => party.members.filter((it) => is(query, it, party.content)).map((it) => it.hero.name);
const nobody: SetQuery = ['where', 'party', ['class', 'paladin']];
/** The area content gives the Stat `statKey`, which the form module reads it by (ADR-0006). */
const areaOf = (statKey: string): StatArea => deps.content.stats[statKey]?.area ?? expect.fail(statKey);

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
    const met = (requires: Parameters<typeof classSkillRequires>[0]) => classSkillRequires(requires).every((it) => holds(it, party));

    expect(met({ classes: { warrior: 2, mage: 1 } })).toBe(true);
    expect(met({ classes: { warrior: 3 } })).toBe(false);
    expect(met({ skills: ['herbalism', 'stealth'] })).toBe(true);
    expect(met({ skills: ['herbalism', 'warding'] })).toBe(false);
  });
});

describe('the old form of an Encounter', () => {
  // Every result the same to the last bit: the old Check added `weight × aggregate` for each
  // demand in order, from 0, `best` being Math.max(0, …) of the members' values and `sum` their sum.
  test.each(['best', 'sum'] as const)('with `%s`, its Check scores exactly as the old capability did', (aggregate) => {
    const demands: [string, number][] = [['strength', 0.3], ['wits', 0.1], ['dexterity', 0.2], ['intelligence', 0.4]];
    const encounterCheck = demandsCheck('test', 'Test', aggregate, demands, [], 1);
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
    const taken = queryParty(reversed, world, deps, { hurt });

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

// DL-148 items 9 to 11, DL-154, DL-283, DL-284: a Hero's formed Stats are read only for the Stat
// values they add into a Check's score (`withForm`). Aric is hurt on the Quest at the baseline (so the
// hurt's factor by area), Dara is at Morale 20, below it (Morale's factor there), and the rest are at
// the baseline (1); all are rested. Every read that chooses, filters or counts reads them as they are.
describe('form: what it scales, and what it does not', () => {
  const formed = ((): QueryParty => {
    const { world, heroes, all } = scene();
    for (const hero of all) if (hero.name !== 'dara') hero.morale = deps.config.moraleBaseline;
    return queryParty(all, world, deps, { hurt: new Set([(heroes['aric'] as Hero).id]) });
  })();
  /** Aric's hurt factor on `statKey`, by its area in content. */
  const aric = (statKey: string): number => hurtFactor(areaOf(statKey), { hurt: true, relief: 0 }, deps.config);
  const dara = moraleFactor(20, deps.config);
  const scaled = (query: NumQuery): number => evaluate(query, formed, true);
  const scaledVal = (query: ValQuery, name: string): number => valueOf(query, member(name, formed), formed.content, true);
  const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];

  test("each member carries their formed Stats: Morale's factor on every Stat, the hurt's by area once hurt", () => {
    const [hurt, , , low] = formed.members as [QueryMember, QueryMember, QueryMember, QueryMember];
    for (const statKey of heroStatKeys) {
      expect(hurt.formed[statKey], statKey).toBe((hurt.stats[statKey] ?? 0) * aric(statKey));
      expect(low.formed[statKey], statKey).toBe((low.stats[statKey] ?? 0) * dara);
    }
    for (const it of formed.members.filter((_, at) => at === 1 || at === 2 || at === 4)) expect(it.formed).toEqual(it.stats);
    // The hurt's gap is taken whole from a Physical Stat and half from a Mental one.
    expect(aric('strength')).toBe(deps.config.hurtCheckFactor);
    expect(aric('wits')).toBe(1 - (1 - deps.config.hurtCheckFactor) / 2);
  });

  describe('scaled', () => {
    test('`stat`: the formed Stat', () => {
      expect(scaledVal(['stat', 'strength'], 'aric')).toBe(15 * aric('strength'));
      expect(scaledVal(['stat', 'wits'], 'aric')).toBe(11 * aric('wits'));
      expect(scaledVal(['stat', 'strength'], 'dara')).toBe(8 * dara);
    });

    test('`weighted`: each Stat within it formed, then its weight', () => {
      expect(scaledVal(['weighted', [['strength', 1], ['wits', 0.5]]], 'aric')).toBe(1 * (15 * aric('strength')) + 0.5 * (11 * aric('wits')));
    });

    test('`+`, `-` and `*` of Vals: each Stat within them formed, a number not', () => {
      expect(scaledVal(['+', ['stat', 'strength'], 2], 'aric')).toBe(15 * aric('strength') + 2);
      expect(scaledVal(['-', ['stat', 'strength'], ['stat', 'wits']], 'aric')).toBe(15 * aric('strength') - 11 * aric('wits'));
      // A product of two Stats reads each formed.
      expect(scaledVal(['*', ['stat', 'strength'], ['stat', 'wits']], 'aric')).toBe(15 * aric('strength') * (11 * aric('wits')));
    });

    test("`sum` and `avg`: each Hero's value with their own form", () => {
      const total = 15 * aric('strength') + 15 + 6 + 8 * dara + 9;
      expect(scaled(['sum', 'party', ['stat', 'strength']])).toBe(total);
      expect(scaled(['avg', 'party', ['stat', 'strength']])).toBe(total / 5);
    });

    test('`of`: the Hero chosen adds their value with their form', () => {
      expect(scaled(['of', ['best', warriors, ['stat', 'strength']], ['stat', 'strength']])).toBe(15 * aric('strength'));
    });

    test('`max` and `min`: the Hero `of best` or `of worst` would choose adds their value with their form', () => {
      // Aric and Bryn tie at 15, and Aric, the earlier, is still the strongest Warrior: hurt, he adds less.
      expect(scaled(['max', warriors, ['stat', 'strength']])).toBe(15 * aric('strength'));
      expect(scaled(['min', ['where', 'party', ['class', 'healer', 'warrior']], ['stat', 'strength']])).toBe(8 * dara);
      expect(scaled(['max', nobody, ['stat', 'strength']])).toBe(0);
    });

    test("`ranked`: each weight times the Hero's value with their form", () => {
      expect(scaled(['ranked', 'party', ['stat', 'strength'], [1, 0.5]])).toBe(1 * (15 * aric('strength')) + 0.5 * 15);
    });

    test('`+`, `-`, `*`, `least` and `greatest` of Nums carry it into each Num, a number not', () => {
      const strongest = 15 * aric('strength');
      const wits = 11 * aric('wits') + 14 + 9 + 13 * dara + 15;
      const of = (stat: string): NumQuery => ['of', ['best', warriors, ['stat', 'strength']], ['stat', stat]];
      expect(scaled(['+', of('strength'), 1])).toBe(strongest + 1);
      expect(scaled(['-', ['sum', 'party', ['stat', 'wits']], of('strength')])).toBe(wits - strongest);
      expect(scaled(['*', of('strength'), 2])).toBe(strongest * 2);
      expect(scaled(['least', of('strength'), 14])).toBe(strongest);
      expect(scaled(['greatest', of('strength'), 14])).toBe(14);
    });
  });

  describe('as they are', () => {
    test('a filter: a `where` on a Stat keeps the hurt Warrior at his full Strength', () => {
      expect(names(['where', 'party', ['>=', ['stat', 'strength'], 15]], formed)).toEqual(['aric', 'bryn']);
    });

    test('the choice of the best or worst Hero', () => {
      expect(nameOf(['best', warriors, ['stat', 'strength']], formed)).toBe('aric');
      expect(nameOf(['worst', ['where', 'party', ['class', 'healer', 'warrior']], ['stat', 'strength']], formed)).toBe('dara');
    });

    test("`top` and `bottom`, and `ranked`'s order", () => {
      expect(names(['top', 'party', 1, ['stat', 'strength']], formed)).toEqual(['aric']);
      expect(names(['bottom', ['where', 'party', ['class', 'warrior']], 1, ['stat', 'strength']], formed)).toEqual(['aric']);
      // Ranked by Strength as they are, Aric first, though with his form he adds less than Bryn's 15.
      expect(scaled(['ranked', warriors, ['stat', 'strength'], [1, 0]])).toBe(15 * aric('strength'));
    });

    test('`count`', () => {
      expect(scaled(['count', ['where', 'party', ['>=', ['stat', 'strength'], 15]]])).toBe(2);
    });

    test('a Skill rating, Level, Morale, age and a number', () => {
      const hurt = member('aric', formed);
      for (const query of [['skill', 'swordcraft'], ['level'], ['morale'], ['age'], 7] as ValQuery[]) {
        expect(valueOf(query, hurt, formed.content, true)).toBe(valueOf(query, hurt, formed.content));
      }
      expect(scaled(['sum', 'party', ['level']])).toBe(3 + 2 + 4 + 1 + 2);
      expect(scaled(['max', 'party', ['skill', 'swordcraft']])).toBe(3);
    });

    test("a Synergy's requirements: `holds` reads every Hero as they are", () => {
      expect(holds(['>=', ['max', warriors, ['stat', 'strength']], 15], formed)).toBe(true);
      expect(holds(['>=', ['sum', 'party', ['stat', 'strength']], 53], formed)).toBe(true);
    });

    test('without `withForm`, every read is as before form (DL-154)', () => {
      expect(evaluate(['sum', 'party', ['stat', 'strength']], formed)).toBe(15 + 15 + 6 + 8 + 9);
      expect(evaluate(['max', warriors, ['stat', 'strength']], formed)).toBe(15);
      expect(valueOf(['weighted', [['strength', 1]]], member('aric', formed), formed.content)).toBe(15);
    });

    test('with every formed Stat the raw one, a score with form reads exactly as one without', () => {
      const { party: steady } = partyOf();
      const raw: QueryParty = { ...steady, members: steady.members.map((it) => ({ ...it, formed: { ...it.stats } })) };
      for (const query of [
        ['sum', 'party', ['weighted', [['strength', 0.3], ['wits', 0.7]]]],
        ['max', warriors, ['stat', 'strength']],
        ['ranked', 'party', ['stat', 'wits'], [1, 0.5, 0.25]],
        ['+', ['*', 0.4, ['avg', 'party', ['stat', 'dexterity']]], ['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']]],
      ] as NumQuery[]) {
        expect(evaluate(query, raw, true)).toBe(evaluate(query, raw));
      }
    });
  });
});

// DL-280 items 2 and 4, DL-284: the form module, through the one place a member is built. Fatigue's
// factor and the hurt's are by Stat area, each from its formula; Morale's is on every Stat.
describe("queryParty's formed Stats by area", () => {
  /** The owner's figures: FS 0.4, the hurt 0.6, Fatigue's scale 0 to 100, the baseline 50. */
  const owners = testDeps({ fatigueScaling: 0.4, hurtCheckFactor: 0.6, fatigueMax: 100, moraleBaseline: 50 });
  /** Each of `all` at Fatigue `f` on the Day, `hurt` or not, read as `queryParty` reads them under `over`. */
  const taken = (f: number, hurt: boolean, over = deps) => {
    const { world, all } = scene('formed');
    const ids = all.map((hero) => hero.id);
    return queryParty(all, world, over, { fatigueByHero: Object.fromEntries(ids.map((id) => [id, f])), hurt: new Set(hurt ? ids : []) });
  };
  /** What the formula gives `member`'s Stat `statKey` under `config`: written out, apart from form.ts. */
  const expected = (it: QueryMember, statKey: string, f: number, hurt: boolean, config = deps.config): number => {
    const area = areaOf(statKey);
    const whole = area === 'physical' || area === 'magical';
    const fatigue = 1 - ((whole ? config.fatigueScaling : config.fatigueScaling / 2) * f) / config.fatigueMax;
    const gap = 1 - config.hurtCheckFactor;
    const wound = hurt ? (area === 'physical' ? 1 - gap : 1 - gap / 2) : 1;
    return (it.stats[statKey] ?? 0) * moraleFactor(it.morale, config) * fatigue * wound;
  };

  test.each([
    [0, false],
    [50, false],
    [100, false],
    [0, true],
    [50, true],
    [100, true],
  ])('at Fatigue %d, hurt %s: each Stat times Morale’s factor, Fatigue’s by its area and the hurt’s by its area', (f, hurt) => {
    const party = taken(f, hurt);
    for (const it of party.members) {
      expect(it.fatigue).toBe(f);
      for (const statKey of heroStatKeys) expect(it.formed[statKey], `${it.hero.name} ${statKey}`).toBeCloseTo(expected(it, statKey, f, hurt), 12);
    }
  });

  test("the owner's table at the baseline: a Physical Stat × 0.8 and a Mental × 0.9 at Fatigue 50; hurt at 100, × 0.36 and × 0.64", () => {
    const at = (f: number, hurt: boolean) => {
      const { world, all } = scene('formed-owner');
      const [hero] = all as [Hero];
      hero.morale = 50;
      const [it] = queryParty([hero], world, owners, { fatigueByHero: { [hero.id]: f }, hurt: new Set(hurt ? [hero.id] : []) }).members as [QueryMember];
      return { strength: (it.formed['strength'] ?? 0) / (it.stats['strength'] ?? 1), wits: (it.formed['wits'] ?? 0) / (it.stats['wits'] ?? 1) };
    };
    expect(at(0, false)).toEqual({ strength: 1, wits: 1 });
    expect(at(50, false)).toEqual({ strength: expect.closeTo(0.8, 12), wits: expect.closeTo(0.9, 12) });
    expect(at(100, false)).toEqual({ strength: expect.closeTo(0.6, 12), wits: expect.closeTo(0.8, 12) });
    expect(at(100, true)).toEqual({ strength: expect.closeTo(0.36, 12), wits: expect.closeTo(0.64, 12) });
  });

  test('a Hero the Day names no Fatigue for reads their stored Fatigue, as they set out', () => {
    const { world, all } = scene('formed-stored');
    all.forEach((hero, at) => (hero.fatigue = 20 * at));
    const party = queryParty(all, world, deps);
    expect(party.members.map((it) => it.fatigue)).toEqual([0, 20, 40, 60, 80]);
    for (const it of party.members) for (const statKey of heroStatKeys) expect(it.formed[statKey]).toBeCloseTo(expected(it, statKey, it.fatigue, false), 12);
  });

  test('the raw Stats stay as they are, whatever the Fatigue and the hurt', () => {
    const { world, all } = scene('formed-raw');
    const raw = all.map((hero) => effectiveStats(hero, world, deps.content));
    expect(taken(100, true).members.map((it) => it.stats)).toEqual(raw);
  });

  test('atFatigue reads the member again at another Day’s Fatigue, and is the same member at its own', () => {
    const party = taken(10, true);
    const [first] = party.members as [QueryMember];
    expect(atFatigue(first, 10, deps)).toBe(first);
    const later = atFatigue(first, 70, deps);
    expect(later.fatigue).toBe(70);
    expect(later.stats).toBe(first.stats);
    for (const statKey of heroStatKeys) expect(later.formed[statKey]).toBeCloseTo(expected(first, statKey, 70, true), 12);
  });
});

// DL-280 item 4, Q15 a; DL-285: a member of a Class content marks to relieve the hurt (`relievesHurt`),
// other than the hurt Hero and among the members on the Encounter, relieves `healerHurtRelief` of a
// hurt Hero's gap, however many there are; a heal Item spent on them (`relieved`) relieves
// `healItemHurtRelief`; the two multiply on the gap. The engine names no Class (ADR-0006): the test
// content marks none, and these tests mark the Class they read.
describe("queryParty's relief from the hurt", () => {
  /** The test content with each of `classKeys` marked to relieve the hurt. */
  const marking = (...classKeys: string[]): ContentSet => ({
    ...testContent,
    classes: Object.fromEntries(Object.entries(testContent.classes).map(([key, it]) => [key, classKeys.includes(key) ? { ...it, relievesHurt: true } : it])),
  });
  const config = { hurtCheckFactor: 0.6, healerHurtRelief: 0.5, healItemHurtRelief: 0.5 };
  const healers = testDeps(config, marking('healer'));
  /** `names` of the Party (aric and bryn warriors, cass a mage, dara a healer, edda a rogue) as `over` reads them, `hurt` and `relieved` by name. */
  const taken = (names: string[], { hurt = [] as string[], relieved = [] as string[], over = healers } = {}): Record<string, QueryMember> => {
    const { world, heroes } = scene('relief');
    const ids = (list: string[]) => new Set(list.map((name) => (heroes[name] as Hero).id));
    const party = queryParty(names.map((name) => heroes[name] as Hero), world, over, { hurt: ids(hurt), relieved: ids(relieved) });
    return Object.fromEntries(party.members.map((it) => [it.hero.name, it]));
  };
  /** What a member's Physical Stat keeps of itself at `relief`, and a Mental one: written out, apart from form.ts. */
  const kept = (it: QueryMember) => ({ strength: (it.formed['strength'] ?? 0) / (it.stats['strength'] ?? 1) / moraleFactor(it.morale, healers.config), wits: (it.formed['wits'] ?? 0) / (it.stats['wits'] ?? 1) / moraleFactor(it.morale, healers.config) });

  test('a Healer in the Party relieves half the gap of another member hurt: a Physical Stat keeps 0.8, a Mental 0.9', () => {
    const { aric, dara } = taken(['aric', 'dara'], { hurt: ['aric'] });
    expect(aric?.relief).toBe(0.5);
    expect(kept(aric as QueryMember)).toEqual({ strength: expect.closeTo(0.8, 12), wits: expect.closeTo(0.9, 12) });
    // Dara, unhurt, has no gap to relieve.
    expect(dara?.relief).toBe(0);
    expect(dara?.formed).toEqual(Object.fromEntries(Object.entries(dara?.stats ?? {}).map(([key, value]) => [key, value * moraleFactor(20, healers.config)])));
  });

  test('a Healer does not relieve their own hurt, but another Healer does', () => {
    expect(taken(['aric', 'dara'], { hurt: ['dara'] }).dara?.relief).toBe(0);
    const both = testDeps(config, marking('healer', 'mage'));
    expect(taken(['cass', 'dara'], { hurt: ['dara'], over: both }).dara?.relief).toBe(0.5);
    expect(taken(['cass', 'dara'], { hurt: ['cass', 'dara'], over: both })).toMatchObject({ cass: { relief: 0.5 }, dara: { relief: 0.5 } });
  });

  test('several Healers give one relief, not one each', () => {
    const both = testDeps(config, marking('healer', 'mage'));
    expect(taken(['aric', 'cass', 'dara'], { hurt: ['aric'], over: both }).aric?.relief).toBe(0.5);
  });

  test('a Class marked false relieves nothing, nor a Class content does not define', () => {
    const unmarked: ContentSet = { ...testContent, classes: { ...testContent.classes, healer: { ...(testContent.classes['healer'] as Class), relievesHurt: false } } };
    expect(taken(['aric', 'dara'], { hurt: ['aric'], over: testDeps(config, unmarked) }).aric?.relief).toBe(0);
    const { world, heroes } = scene('relief');
    const aric = heroes['aric'] as Hero;
    for (const classKey of ['ghost', 'constructor', '__proto__']) {
      const stranger = { ...(heroes['dara'] as Hero), classKey };
      expect(queryParty([aric, stranger], world, healers, { hurt: new Set([aric.id]) }).members[0]?.relief, classKey).toBe(0);
    }
  });

  test('a Healer not among the members on the Encounter, fallen or never sent, relieves no one', () => {
    expect(taken(['aric', 'bryn'], { hurt: ['aric'] }).aric?.relief).toBe(0);
    expect(kept(taken(['aric', 'bryn'], { hurt: ['aric'] }).aric as QueryMember)).toEqual({ strength: expect.closeTo(0.6, 12), wits: expect.closeTo(0.8, 12) });
  });

  test("the relief is read from the Class's mark, not its key: unmarked, a Healer relieves nothing; marked, a Warrior does", () => {
    expect(taken(['aric', 'dara'], { hurt: ['aric'], over: testDeps(config) }).aric?.relief).toBe(0);
    expect(taken(['aric', 'bryn', 'dara'], { hurt: ['aric'], over: testDeps(config, marking('warrior')) }).aric?.relief).toBe(0.5);
    expect(taken(['aric', 'bryn'], { hurt: ['aric'], over: testDeps(config, marking('warrior')) }).aric?.relief).toBe(0.5);
    expect(taken(['aric', 'cass'], { hurt: ['aric'], over: testDeps(config, marking('warrior')) }).aric?.relief).toBe(0);
  });

  test('the gap with neither, either and both: a heal Item spent relieves half, and with a Healer the two multiply to three quarters', () => {
    const at = (names: string[], relieved: string[]) => taken(names, { hurt: ['aric'], relieved }).aric as QueryMember;
    expect([at(['aric', 'bryn'], []), at(['aric', 'dara'], []), at(['aric', 'bryn'], ['aric']), at(['aric', 'dara'], ['aric'])].map((it) => it.relief)).toEqual([0, 0.5, 0.5, 0.75]);
    expect(kept(at(['aric', 'dara'], ['aric']))).toEqual({ strength: expect.closeTo(0.9, 12), wits: expect.closeTo(0.95, 12) });
    // Relieved by an Item and not hurt is no Hero the resolver makes; it relieves nothing.
    expect(taken(['aric', 'bryn'], { relieved: ['aric'] }).aric?.relief).toBe(0);
  });

  test('reads the settings: at relief 0 a Healer and an Item change nothing, and other shares multiply as theirs', () => {
    const none = testDeps({ ...config, healerHurtRelief: 0, healItemHurtRelief: 0 }, marking('healer'));
    expect(taken(['aric', 'dara'], { hurt: ['aric'], relieved: ['aric'], over: none }).aric?.relief).toBe(0);
    const other = testDeps({ ...config, healerHurtRelief: 0.2, healItemHurtRelief: 0.4 }, marking('healer'));
    expect(taken(['aric', 'dara'], { hurt: ['aric'], relieved: ['aric'], over: other }).aric?.relief).toBeCloseTo(1 - 0.8 * 0.6, 12);
  });

  test('atFatigue keeps the relief, and reads the formed Stats again with it', () => {
    const { aric } = taken(['aric', 'dara'], { hurt: ['aric'], relieved: ['aric'] });
    const later = atFatigue(aric as QueryMember, 60, healers);
    expect(later.relief).toBe(0.75);
    expect(later.formed['strength']).toBeCloseTo((aric?.stats['strength'] ?? 0) * moraleFactor(60, healers.config) * (1 - (healers.config.fatigueScaling * 60) / healers.config.fatigueMax) * 0.9, 12);
  });
});

describe("queryParty's Morale on the Quest", () => {
  /** Whether each of `party`'s members' formed Stats are their raw ones times Morale's factor at their Morale on the Quest (rested, unhurt). */
  const formedByMorale = (party: QueryParty): void => {
    for (const it of party.members) {
      for (const statKey of heroStatKeys) expect(it.formed[statKey]).toBe((it.stats[statKey] ?? 0) * moraleFactor(it.morale, deps.config));
    }
  };

  test("is the stored Morale plus the Morale consequences so far, held to the scale, and sets Morale's factor in the form", () => {
    const { world, all } = scene('working');
    const at = (delta: number) => queryParty(all, world, deps, { moraleByHero: Object.fromEntries(all.map((hero) => [hero.id, delta])) });

    // aric 60, bryn 40, cass 70, dara 20, edda 50.
    for (const [delta, morales] of [
      [0, [60, 40, 70, 20, 50]],
      [-25, [35, 15, 45, 0, 25]],
      [30, [90, 70, 100, 50, 80]],
    ] as const) {
      const party = at(delta);
      expect(party.members.map((it) => it.morale)).toEqual(morales);
      formedByMorale(party);
    }
    // The stored Morale is untouched: it changes on the return.
    expect(all.map((hero) => hero.morale)).toEqual([60, 40, 70, 20, 50]);
  });

  test("hurt on the Quest multiplies Morale's factor by the hurt's, by area", () => {
    const { world, all } = scene('hurt-form');
    const [aric, bryn] = all as [Hero, Hero];
    const taken = queryParty(all, world, deps, { hurt: new Set([aric.id, bryn.id]), moraleByHero: { [aric.id]: 30, [bryn.id]: 30 } });

    for (const [at, morale] of [[0, 90], [1, 70]] as const) {
      const it = taken.members[at] as QueryMember;
      for (const statKey of heroStatKeys) {
        expect(it.formed[statKey]).toBe((it.stats[statKey] ?? 0) * (moraleFactor(morale, deps.config) * 1 * hurtFactor(areaOf(statKey), { hurt: true, relief: 0 }, deps.config)));
      }
    }
    expect(taken.members.map((it) => it.hurt)).toEqual([true, true, false, false, false]);
  });

  // DL-155: a Morale loss `steadiedBy` some Stats is less for some Heroes, so each Hero's
  // Morale on the Quest is their own.
  test("reads each Hero's own Morale consequences, and 0 for a Hero with none", () => {
    const { world, all } = scene('own-morale');
    const [aric, bryn, cass] = all as [Hero, Hero, Hero];
    const taken = queryParty(all, world, deps, { moraleByHero: { [aric.id]: -50, [bryn.id]: 35, [cass.id]: 0 } });

    expect(taken.members.map((it) => it.morale)).toEqual([10, 75, 70, 20, 50]);
    formedByMorale(taken);
  });
});
