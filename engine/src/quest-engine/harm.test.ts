import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import type { DeathConsequence, Degree, InjuryConsequence, MoraleConsequence, SetQuery, TraitConsequence, TraitKey } from '../content-types.js';
import type { HeroId } from '../document.js';
import type { Stream } from '../generators/draw.js';
import { createStreams, next, pick, weightedPick } from '../rng.js';
import { testContent } from '../world.test-support.js';
import { chooseEarner, exposure, guard, meanShare, moraleOf, narrowed, strike, type Candidates } from './harm.js';
import type { QueryMember, QueryParty } from './query.js';

// v1.1.4-S4 (DL-148 item 14, DL-155): harm that reads the Stats. A share is of a Stat's content
// range, 1 to 20 in the test content, so 1 is a share of 0, 20 of 1, and 10.5 of a half.

const config = defaultConfig;
const content = testContent;

/** A member with these effective Stats, the rest at 10. */
function withStats(stats: Record<string, number>): Pick<QueryMember, 'stats'> {
  return { stats: { constitution: 10, endurance: 10, courage: 10, ...stats } };
}

describe('meanShare', () => {
  test("is the mean of each Stat's share of its content range", () => {
    expect(meanShare(withStats({ constitution: 1 }), ['constitution'], content)).toBe(0);
    expect(meanShare(withStats({ constitution: 20 }), ['constitution'], content)).toBe(1);
    expect(meanShare(withStats({ constitution: 10.5 }), ['constitution'], content)).toBe(0.5);
    expect(meanShare(withStats({ constitution: 20, endurance: 1 }), ['constitution', 'endurance'], content)).toBe(0.5);
  });

  test('a Stat content does not define counts for nothing, and none at all is no share (data-model rule 5)', () => {
    expect(meanShare(withStats({ constitution: 20 }), ['constitution', 'luck'], content)).toBe(1);
    expect(meanShare(withStats({}), ['luck'], content)).toBeUndefined();
    expect(meanShare(withStats({}), [], content)).toBeUndefined();
  });

  test("a Stat the Hero lacks reads its default, and a value outside the range is held to it", () => {
    expect(meanShare({ stats: {} }, ['constitution'], content)).toBeCloseTo(9 / 19, 12);
    expect(meanShare(withStats({ constitution: 25 }), ['constitution'], content)).toBe(1);
  });
});

describe('exposure and guard', () => {
  test('the weakest are exposureRange + 1 times as likely to be hit as the strongest, and none is 1', () => {
    expect(exposure(withStats({ constitution: 1 }), ['constitution'], content, config)).toBe(3);
    expect(exposure(withStats({ constitution: 20 }), ['constitution'], content, config)).toBe(1);
    expect(exposure(withStats({ constitution: 10.5 }), ['constitution'], content, config)).toBe(2);
    expect(exposure(withStats({ constitution: 1 }), undefined, content, config)).toBe(1);
    expect(exposure(withStats({ constitution: 1 }), ['luck'], content, config)).toBe(1);
    expect(exposure(withStats({ constitution: 1 }), ['constitution'], content, { ...config, exposureRange: 0 })).toBe(1);
  });

  test('the strongest keep 1 − guardRange of a chance or a loss, the weakest all of it, and none is 1', () => {
    expect(guard(withStats({ courage: 20 }), ['courage'], content, config)).toBe(0.5);
    expect(guard(withStats({ courage: 1 }), ['courage'], content, config)).toBe(1);
    expect(guard(withStats({ courage: 10.5 }), ['courage'], content, config)).toBe(0.75);
    expect(guard(withStats({ courage: 20 }), undefined, content, config)).toBe(1);
    expect(guard(withStats({ courage: 20 }), ['courage'], content, { ...config, guardRange: 1 })).toBe(0);
  });
});

describe('narrowed', () => {
  const ids = ['hero-000001', 'hero-000002', 'hero-000003'] as HeroId[];
  const heroes = ids.map((id) => ({ id }));
  /** A Party of the three, the first two Warriors. */
  const party = {
    members: ids.map((id, index) => ({ hero: { id, classKey: index < 2 ? 'warrior' : 'mage' }, stats: {} })),
    content,
  } as unknown as QueryParty;
  const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];

  test('is the pool when there is no among', () => {
    expect(narrowed(heroes, undefined, party)).toBe(heroes);
  });

  test('is those of the pool among names, in Party order', () => {
    expect(narrowed(heroes, warriors, party)).toEqual([{ id: ids[0] }, { id: ids[1] }]);
    expect(narrowed(heroes.slice(1), warriors, party)).toEqual([{ id: ids[1] }]);
  });

  test('falls back to the whole pool when among names none of it: none of the Party, or only those it cannot fall on', () => {
    expect(narrowed(heroes, ['where', 'party', ['class', 'rogue']], party)).toBe(heroes);
    expect(narrowed(heroes.slice(2), warriors, party)).toEqual(heroes.slice(2));
  });

  // v1.1.5-S4 (DL-168 item 6, E3, DL-178): among is read over the pool's own Heroes, not the whole Party.
  test('reads among over the pool, so a `bottom` or a `top` passes over a Hero it cannot fall on to the next', () => {
    const five = ['hero-000001', 'hero-000002', 'hero-000003', 'hero-000004', 'hero-000005'] as HeroId[];
    const strengths = [20, 16, 12, 8, 4];
    const ranked = {
      members: five.map((id, index) => ({ hero: { id, classKey: 'mage' }, stats: { strength: strengths[index] } })),
      content,
    } as unknown as QueryParty;
    const all = five.map((id) => ({ id }));
    const unhurt = all.filter((_, index) => index !== 1 && index !== 4);

    expect(narrowed(unhurt, ['bottom', 'party', 1, ['stat', 'strength']], ranked)).toEqual([{ id: five[3] }]);
    expect(narrowed(unhurt, ['top', 'party', 3, ['stat', 'strength']], ranked)).toEqual(unhurt);
    // A pool of four without the second strongest: the three strongest of it, the weakest passed over (the S4 verification).
    const withoutSecond = all.filter((_, index) => index !== 1);
    expect(narrowed(withoutSecond, ['top', 'party', 3, ['stat', 'strength']], ranked)).toEqual([all[0], all[2], all[3]]);
    expect(narrowed(all.slice(0, 4), ['top', 'party', 3, ['stat', 'strength']], ranked)).toEqual(all.slice(0, 3));
    expect(narrowed(all, ['bottom', 'party', 1, ['stat', 'strength']], ranked)).toEqual([{ id: five[4] }]);
  });

  // The S4 verification (DL-178): read over the pool, a tie still goes to the earlier in Party order, as before.
  test('reads among over the pool with a tie to the earlier Hero in Party order', () => {
    const five = ['hero-000001', 'hero-000002', 'hero-000003', 'hero-000004', 'hero-000005'] as HeroId[];
    const strengths = [12, 4, 8, 8, 12];
    const ranked = {
      members: five.map((id, index) => ({ hero: { id, classKey: 'mage' }, stats: { strength: strengths[index] } })),
      content,
    } as unknown as QueryParty;
    const withoutSecond = five.map((id) => ({ id })).filter((_, index) => index !== 1);

    expect(narrowed(withoutSecond, ['bottom', 'party', 1, ['stat', 'strength']], ranked)).toEqual([{ id: five[2] }]);
    expect(narrowed(withoutSecond, ['top', 'party', 1, ['stat', 'strength']], ranked)).toEqual([{ id: five[0] }]);
  });
});

// v1.1.6-S9 (DL-186 item 4, DL-195): harm.ts owns who a harm or an earned Trait falls on and the
// draws each takes; resolve.ts asks and applies. Five Heroes in Party order, Strength 20, 4, 12, 8
// and 16, the second and fourth Warriors; a twin of the stream counts the draws.
describe('who harm falls on, and its draws (v1.1.6-S9)', () => {
  const ids = ['hero-000001', 'hero-000002', 'hero-000003', 'hero-000004', 'hero-000005'] as HeroId[];
  const strengths = [20, 4, 12, 8, 16];
  const heroTraits = {
    ...content.heroTraits,
    'battle-hardened': { key: 'battle-hardened', name: 'battle-hardened', excludes: ['shaken'], effects: [] },
    shaken: { key: 'shaken', name: 'shaken', excludes: ['battle-hardened'], effects: [] },
  };
  const deps = { config, content: { ...content, heroTraits } };
  type Hero = { id: HeroId; traits: TraitKey[] };
  const heroes = (): Hero[] => ids.map((id) => ({ id, traits: [] }));
  /** The Party of `living` as the Queries read it, those in `hurt` hurt; `reads` counts the times it is read. */
  function partyOf(living: readonly Hero[], hurt: ReadonlySet<HeroId> = new Set(), stats: (index: number) => Record<string, number> = () => ({})) {
    const reads = { count: 0 };
    const party = (): QueryParty => {
      reads.count += 1;
      return {
        members: living.map((hero) => {
          const index = ids.indexOf(hero.id);
          return {
            hero: { id: hero.id, classKey: index === 1 || index === 3 ? 'warrior' : 'mage', traits: hero.traits },
            stats: { strength: strengths[index], ...stats(index) },
            hurt: hurt.has(hero.id),
          };
        }),
        content: deps.content,
      } as unknown as QueryParty;
    };
    return { party, reads };
  }
  /** `living`, those at the indexes `hurt` hurt on the Quest, those at `injuredHere` injured by this Encounter. */
  function candidates(living: readonly Hero[], hurt: readonly number[] = [], injuredHere: readonly number[] = []): Candidates<Hero> {
    return { living, hurt: new Set(hurt.map((index) => ids[index] as HeroId)), injuredHere: injuredHere.map((index) => ids[index] as HeroId) };
  }
  const stream = (seed: string): Stream => createStreams(seed, ['quests']).quests;
  /** How many draws took a stream from `from` to `to`; -1 for none up to ten. */
  function drawsBetween(from: Stream, to: Stream): number {
    const twin: Stream = [...from];
    for (let draws = 0; draws <= 10; draws += 1) {
      if (twin.every((word, at) => word === to[at])) return draws;
      next(twin);
    }
    return -1;
  }
  const weakest: SetQuery = ['bottom', 'party', 1, ['stat', 'strength']];
  const warriors: SetQuery = ['where', 'party', ['class', 'warrior']];
  const rogues: SetQuery = ['where', 'party', ['class', 'rogue']];
  const injury = (fields: Partial<InjuryConsequence> = {}): InjuryConsequence => ({ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1, ...fields });
  const death = (fields: Partial<DeathConsequence> = {}): DeathConsequence => ({ kind: 'death', chance: 1, ...fields });
  const trait = (traitKey: string, fields: Partial<TraitConsequence> = {}): TraitConsequence => ({ kind: 'trait', traitKey, chance: 1, ...fields });

  describe('strike', () => {
    /** Whom `consequence` strikes over 40 seeds, by place in the Party, -1 for no one, and the draws each took. */
    function struck(consequence: InjuryConsequence | DeathConsequence, from: Candidates<Hero>) {
      const { party } = partyOf(from.living, from.hurt);
      const hit = new Set<number>();
      const draws = new Set<number>();
      for (let seed = 0; seed < 40; seed += 1) {
        const state = stream(`strike-${seed}`);
        const before: Stream = [...state];
        const hero = strike(consequence, from, party, state, deps);
        hit.add(hero === undefined ? -1 : ids.indexOf(hero.id));
        draws.add(drawsBetween(before, state));
      }
      return { hit, draws: [...draws] };
    }

    test("an Injury's pool is the unhurt living: never a Hero already hurt, and any of the rest", () => {
      expect(struck(injury(), candidates(heroes().slice(0, 4), [0, 2]))).toEqual({ hit: new Set([1, 3]), draws: [2] });
    });

    test("a Death's pool is the living Party, the hurt in it", () => {
      expect(struck(death(), candidates(heroes().slice(0, 4), [0, 2]))).toEqual({ hit: new Set([0, 1, 2, 3]), draws: [2] });
    });

    test('an Injury with every living Hero hurt falls on no one, its two draws still taken', () => {
      expect(struck(injury(), candidates(heroes().slice(0, 2), [0, 1]))).toEqual({ hit: new Set([-1]), draws: [2] });
    });

    test("an Injury's among is read over the unhurt: with the weakest hurt, a `bottom` 1 falls on the next weakest", () => {
      expect(struck(injury({ among: weakest }), candidates(heroes(), [1])).hit).toEqual(new Set([3]));
    });

    test("a Death's among is read over the living Party: the weakest, hurt, is the one it names", () => {
      expect(struck(death({ among: weakest }), candidates(heroes(), [1])).hit).toEqual(new Set([1]));
    });

    test('among falls back to the whole pool when it names none of it: no one of the Party, or only a Hero it cannot fall on', () => {
      expect(struck(injury({ among: rogues }), candidates(heroes().slice(0, 3))).hit).toEqual(new Set([0, 1, 2]));
      // The only Warrior living is hurt: the Injury falls on any of the unhurt.
      expect(struck(injury({ among: warriors }), candidates(heroes().slice(0, 3), [1])).hit).toEqual(new Set([0, 2]));
      expect(struck(death({ among: rogues }), candidates(heroes().slice(0, 3), [1])).hit).toEqual(new Set([0, 1, 2]));
    });

    test('takes two draws, whether it lands then on whom, whether or not it lands, with any field or none', () => {
      const from = candidates(heroes(), [1]);
      for (const consequence of [injury({ chance: 0 }), death({ chance: 0 }), injury({ among: rogues, exposedBy: ['constitution'], guardedBy: ['endurance'] })]) {
        expect(struck(consequence, from).draws).toEqual([2]);
      }
      expect(struck(injury({ chance: 0 }), from).hit).toEqual(new Set([-1]));
    });

    test("it lands when its first draw is below the chance times the Hero's guard, on whom weightedPick draws by exposure", () => {
      const stats = (index: number) => ({ constitution: 1 + 4 * index, endurance: 20 - 4 * index });
      const living = heroes();
      for (const consequence of [
        injury({ chance: 0.8, exposedBy: ['constitution'], guardedBy: ['endurance'] }),
        death({ chance: 0.8, exposedBy: ['constitution'], guardedBy: ['endurance'] }),
      ]) {
        const { party } = partyOf(living, new Set([ids[0] as HeroId]), stats);
        const members = party().members;
        const member = (hero: Hero): QueryMember => members[ids.indexOf(hero.id)] as QueryMember;
        const pool = consequence.kind === 'injury' ? living.slice(1) : living;
        const outcomes = new Set<string>();
        const whom = new Set<HeroId>();
        for (let seed = 0; seed < 200; seed += 1) {
          const state = stream(`weighted-${seed}`);
          const twin: Stream = [...state];
          const hero = strike(consequence, candidates(living, [0]), party, state, deps);
          const u = next(twin);
          const drawn = weightedPick(twin, pool, pool.map((it) => exposure(member(it), ['constitution'], content, config)));
          expect(hero).toBe(u < consequence.chance * guard(member(drawn), ['endurance'], content, config) ? drawn : undefined);
          outcomes.add(`${u < consequence.chance} ${hero !== undefined}`);
          whom.add(drawn.id);
        }
        // The guard turned some draws below the chance into misses, and the draw reached every Hero of the pool.
        expect(outcomes).toEqual(new Set(['true true', 'true false', 'false false']));
        expect(whom.size).toBe(pool.length);
      }
    });

    test('with none of the fields it reads no Party, and draws as chance and pick', () => {
      const living = heroes();
      for (let seed = 0; seed < 20; seed += 1) {
        const { party, reads } = partyOf(living);
        const state = stream(`plain-${seed}`);
        const twin: Stream = [...state];
        const hero = strike(injury({ chance: 0.5 }), candidates(living, [2]), party, state, deps);
        const lands = next(twin) < 0.5;
        const who = pick(twin, living.filter((it) => it.id !== ids[2]));
        expect(hero).toBe(lands ? who : undefined);
        expect(reads.count).toBe(0);
      }
    });
  });

  describe('chooseEarner', () => {
    /** Who earns `consequence` at `degree` over 40 seeds, by place in the Party, -1 for no one, the draws each took and whether each was positive. */
    function chosen(consequence: TraitConsequence, degree: Degree, from: Candidates<Hero>, earned: { heroId: HeroId; positive: boolean }[] = []) {
      const { party } = partyOf(from.living, from.hurt);
      const hit = new Set<number>();
      const draws = new Set<number>();
      const positive = new Set<boolean>();
      for (let seed = 0; seed < 40; seed += 1) {
        const state = stream(`earn-${seed}`);
        const before: Stream = [...state];
        const earner = chooseEarner(consequence, degree, from, earned, party, state, deps);
        hit.add(earner === undefined ? -1 : ids.indexOf(earner.hero.id));
        if (earner !== undefined) positive.add(earner.positive);
        draws.add(drawsBetween(before, state));
      }
      return { hit, draws: [...draws], positive: [...positive] };
    }

    test("a positive Trait's pool is the living Party, the hurt in it", () => {
      for (const degree of ['triumph', 'success'] as const) {
        expect(chosen(trait('scarred'), degree, candidates(heroes().slice(0, 3), [0], [0]))).toEqual({ hit: new Set([0, 1, 2]), draws: [2], positive: [true] });
      }
    });

    test("a negative Trait's pool at a Failure is those this Encounter injured who still live", () => {
      // The third was hurt by an Encounter before; the fifth, injured here, has died.
      const living = heroes().slice(0, 4);
      expect(chosen(trait('scarred'), 'failure', candidates(living, [0, 2, 3], [0, 3, 4]))).toEqual({ hit: new Set([0, 3]), draws: [2], positive: [false] });
      expect(chosen(trait('scarred'), 'failure', candidates(living, [2]))).toEqual({ hit: new Set([-1]), draws: [2], positive: [] });
    });

    test('a negative Trait at a Setback falls on no one, its two draws still taken', () => {
      expect(chosen(trait('scarred'), 'setback', candidates(heroes(), [0], [0]))).toEqual({ hit: new Set([-1]), draws: [2], positive: [] });
    });

    test('its among is read over its own pool, and when it names none of it the Trait falls on no one: no fallback', () => {
      // Of the two injured here, Strength 20 and 12, a `bottom` 1 names the second; the weakest living, unhurt here, is passed over.
      expect(chosen(trait('scarred', { among: weakest }), 'failure', candidates(heroes(), [0, 2], [0, 2])).hit).toEqual(new Set([2]));
      expect(chosen(trait('scarred', { among: weakest }), 'triumph', candidates(heroes())).hit).toEqual(new Set([1]));
      expect(chosen(trait('scarred', { among: warriors }), 'failure', candidates(heroes(), [0, 2], [0, 2]))).toEqual({ hit: new Set([-1]), draws: [2], positive: [] });
      expect(chosen(trait('scarred', { among: rogues }), 'triumph', candidates(heroes()))).toEqual({ hit: new Set([-1]), draws: [2], positive: [] });
    });

    test('falls only on a Hero who may take it and has drawn none on this Quest, a held positive one no bar to a negative', () => {
      const living = heroes().slice(0, 4);
      (living[0] as Hero).traits.push('scarred');
      (living[1] as Hero).traits.push('shaken');
      const earned = [
        { heroId: ids[2] as HeroId, positive: true },
        { heroId: ids[3] as HeroId, positive: false },
      ];
      // Of four: the first holds it, the third drew a positive one, the fourth a negative one.
      expect(chosen(trait('scarred'), 'triumph', candidates(living), earned).hit).toEqual(new Set([1]));
      // The second holds one it conflicts with.
      expect(chosen(trait('battle-hardened'), 'triumph', candidates(living), earned).hit).toEqual(new Set([0]));
      // A negative one may fall on the third, who drew a positive one, but not on the fourth.
      expect(chosen(trait('one-eyed'), 'failure', candidates(living, [0, 1, 2, 3], [0, 1, 2, 3]), earned).hit).toEqual(new Set([0, 1, 2]));
      expect(chosen(trait('scarred'), 'triumph', candidates(living), [...earned, { heroId: ids[1] as HeroId, positive: true }])).toEqual({
        hit: new Set([-1]),
        draws: [2],
        positive: [],
      });
    });

    test('it lands when its first draw is below the chance, on whom pick draws among those who may take it', () => {
      const living = heroes();
      const { party } = partyOf(living);
      const whom = new Set<HeroId>();
      for (let seed = 0; seed < 40; seed += 1) {
        const state = stream(`whom-${seed}`);
        const twin: Stream = [...state];
        const earner = chooseEarner(trait('scarred', { chance: 0.5 }), 'triumph', candidates(living), [{ heroId: ids[0] as HeroId, positive: true }], party, state, deps);
        const lands = next(twin) < 0.5;
        const who = pick(twin, living.slice(1));
        expect(earner).toEqual(lands ? { hero: who, positive: true } : undefined);
        whom.add(who.id);
      }
      expect(whom.size).toBe(4);
    });

    test('with no among it reads no Party', () => {
      const { party, reads } = partyOf(heroes());
      chooseEarner(trait('scarred'), 'triumph', candidates(heroes()), [], party, stream('reads'), deps);
      expect(reads.count).toBe(0);
    });
  });

  describe('moraleOf', () => {
    /** Courage 1, 5.75 and 10.5: a share of 0, a quarter and a half. */
    const stats = (index: number) => ({ courage: 1 + 4.75 * index });

    test("a loss steadiedBy some Stats is each living Hero's own, times their guard", () => {
      const living = heroes().slice(0, 3);
      const { party } = partyOf(living, new Set(), stats);
      const steadied: MoraleConsequence = { kind: 'morale', delta: -8, steadiedBy: ['courage'] };
      expect([...moraleOf(steadied, living, party, deps)]).toEqual([
        [ids[0], -8],
        [ids[1], -8 * (1 - 0.5 * 0.25)],
        [ids[2], -8 * (1 - 0.5 * 0.5)],
      ]);
    });

    test('a gain, or a loss steadied by nothing, is as written for each, and reads no Party', () => {
      const living = heroes().slice(0, 3);
      const written: MoraleConsequence[] = [
        { kind: 'morale', delta: 5, steadiedBy: ['courage'] },
        { kind: 'morale', delta: -5 },
      ];
      for (const consequence of written) {
        const { party, reads } = partyOf(living, new Set(), stats);
        expect([...moraleOf(consequence, living, party, deps)]).toEqual(living.map((hero) => [hero.id, consequence.delta]));
        expect(reads.count).toBe(0);
      }
    });
  });
});
