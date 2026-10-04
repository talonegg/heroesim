import { describe, expect, test } from 'vitest';
import { configProblems, defaultConfig } from '../config.js';
import type { SetQuery } from '../content-types.js';
import type { HeroId } from '../document.js';
import { testContent } from '../world.test-support.js';
import { exposure, guard, meanShare, narrowed } from './harm.js';
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

describe("configProblems' harm fields (DL-155)", () => {
  test('the defaults are sound: exposureRange 2 and guardRange 0.5', () => {
    expect(config).toMatchObject({ exposureRange: 2, guardRange: 0.5 });
    expect(configProblems(config)).toEqual([]);
    expect(configProblems({ ...config, exposureRange: 0, guardRange: 0 })).toEqual([]);
    expect(configProblems({ ...config, guardRange: 1 })).toEqual([]);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY, undefined])('refuses an exposureRange of %s', (exposureRange) => {
    expect(configProblems({ ...config, exposureRange: exposureRange as number })).toEqual([
      `exposureRange is ${exposureRange}; it is a finite number of 0 or more`,
    ]);
  });

  test.each([-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined])('refuses a guardRange of %s', (guardRange) => {
    expect(configProblems({ ...config, guardRange: guardRange as number })).toEqual([`guardRange is ${guardRange}; it is a share from 0 to 1`]);
  });
});
