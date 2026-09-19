import { describe, expect, it } from 'vitest';
import { backingFor, beatDc, resolveCheck, traitIndex, traitModifiers } from '../src/check.js';
import { defaultConfig, type GameConfig } from '../src/config.js';
import type { Commission, Guildmaster, Hero } from '../src/types.js';
import { fixtureContent, scriptedRng } from './fixtures.js';

const config: GameConfig = defaultConfig;

function hero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'h1',
    name: 'Brenna',
    pronouns: 'she',
    stats: { Might: 3, Craft: 2, Nerve: 2, Guile: 3 },
    background: 'Ferry family',
    traits: [],
    regardForGuildmaster: { value: 0, reason: 'came with the Guild', nature: 'neutral' },
    regardFor: {},
    joinedOn: 1,
    ...overrides,
  };
}

function commission(difficulty: number): Commission {
  return {
    id: 'c1.1',
    patronId: 'pa1',
    title: 'The ford at Lowford',
    fee: 100,
    difficulty,
    spanDays: 6,
    beatCount: 3,
    tags: ['water', 'escort'],
    postedOn: 1,
    expiresOn: 10,
  };
}

function guildmaster(overrides: Partial<Guildmaster> = {}): Guildmaster {
  const stats = { Might: 2, Craft: 3, Nerve: 4, Guile: 3 };
  return {
    name: 'Garrick',
    pronouns: 'he',
    stats,
    background: 'Levy years',
    traits: [],
    regardFor: {},
    startingStats: { ...stats },
    ...overrides,
  };
}

describe('the DC a Beat is resolved against', () => {
  it('shifts with the Commission, pivoting on an average one', () => {
    expect(beatDc(11, commission(11), config)).toBe(11);
    expect(beatDc(11, commission(15), config)).toBe(15);
    expect(beatDc(11, commission(8), config)).toBe(8);
  });

  it('is clamped at both ends', () => {
    const loose: GameConfig = { ...config, dcMin: 9, dcMax: 12 };
    expect(beatDc(5, commission(8), loose)).toBe(9);
    expect(beatDc(20, commission(15), loose)).toBe(12);
  });
});

describe('Trait modifiers', () => {
  it('apply when the Stat matches and do nothing otherwise', () => {
    const steady = hero({ traits: [{ name: 'Steady', since: 1 }] });
    expect(traitModifiers(steady, 'Nerve', [], fixtureContent)).toBe(1);
    expect(traitModifiers(steady, 'Might', [], fixtureContent)).toBe(0);
  });

  it('apply only when a tag matches, where tags are named', () => {
    const footed = hero({ traits: [{ name: 'Sure-footed', since: 1 }] });
    expect(traitModifiers(footed, 'Might', ['water'], fixtureContent)).toBe(2);
    expect(traitModifiers(footed, 'Might', ['delve'], fixtureContent)).toBe(0);
    expect(traitModifiers(footed, 'Craft', ['water'], fixtureContent)).toBe(0);
  });

  it('sum across every Trait a person holds', () => {
    const both = hero({
      traits: [
        { name: 'Steady', since: 1 },
        { name: 'Craven', since: 1 },
      ],
    });
    expect(traitModifiers(both, 'Nerve', [], fixtureContent)).toBe(-1);
  });

  it('ignore a Trait the content does not define', () => {
    const odd = hero({ traits: [{ name: 'Not a Trait', since: 1 }] });
    expect(traitModifiers(odd, 'Nerve', ['water'], fixtureContent)).toBe(0);
  });
});

describe('Backing', () => {
  it('comes from the Guildmaster’s Nerve and Guile, and is never negative', () => {
    expect(backingFor(guildmaster(), fixtureContent, config)).toBe(2);
    const timid = guildmaster({ stats: { Might: 1, Craft: 1, Nerve: 1, Guile: 1 } });
    expect(backingFor(timid, fixtureContent, config)).toBe(0);
  });

  it('is capped, and then Traits that carry Backing are added on top', () => {
    const formidable = guildmaster({ stats: { Might: 5, Craft: 5, Nerve: 5, Guile: 5 } });
    expect(backingFor(formidable, fixtureContent, config)).toBe(config.backingMax);
    const connected = guildmaster({
      stats: { Might: 5, Craft: 5, Nerve: 5, Guile: 5 },
      traits: [{ name: 'Old campaigner', since: 1 }],
    });
    expect(backingFor(connected, fixtureContent, config)).toBe(config.backingMax + 1);
  });

  it('does not yet move with the Guildmaster’s Regard for the Party (that is E2)', () => {
    const indifferent = guildmaster({ regardFor: {} });
    const devoted = guildmaster({
      regardFor: {
        h1: { value: 5, reason: 'carried them out of the weir', nature: 'bond' },
        h2: { value: 5, reason: 'ten years of it', nature: 'bond' },
      },
    });
    const despised = guildmaster({
      regardFor: {
        h1: { value: -5, reason: 'the business at Thurrow', nature: 'rivalry' },
        h2: { value: -5, reason: 'the business at Thurrow', nature: 'rivalry' },
      },
    });
    const baseline = backingFor(indifferent, fixtureContent, config);
    expect(backingFor(devoted, fixtureContent, config)).toBe(baseline);
    expect(backingFor(despised, fixtureContent, config)).toBe(baseline);
  });

  it('is added to the Check', () => {
    const index = traitIndex(fixtureContent);
    const withoutBacking = resolveCheck(
      hero(),
      'Might',
      [],
      0,
      12,
      fixtureContent,
      config,
      scriptedRng({ ints: [8] }),
      index,
    );
    const withBacking = resolveCheck(
      hero(),
      'Might',
      [],
      3,
      12,
      fixtureContent,
      config,
      scriptedRng({ ints: [8] }),
      index,
    );
    expect(withoutBacking.total).toBe(9 + 3);
    expect(withBacking.total).toBe(9 + 3 + 3);
  });
});

describe('a Check', () => {
  const index = traitIndex(fixtureContent);
  const check = (roll: number, backing = 0, traits: Hero['traits'] = []) =>
    resolveCheck(
      hero({ traits }),
      'Might',
      ['water'],
      backing,
      12,
      fixtureContent,
      config,
      scriptedRng({ ints: [roll - 1] }),
      index,
    );

  it('fails below the DC and succeeds on it', () => {
    expect(check(8).result).toBe('failure');
    expect(check(8).total).toBe(11);
    expect(check(9).result).toBe('success');
    expect(check(9).total).toBe(12);
  });

  it('is critical only at the DC plus the configured margin', () => {
    expect(check(13).result).toBe('success');
    expect(check(14).result).toBe('critical');
    expect(check(14).total).toBe(12 + config.criticalMargin);
  });

  it('reports the die separately from the total', () => {
    const outcome = check(11, 2, [{ name: 'Sure-footed', since: 1 }]);
    expect(outcome.roll).toBe(11);
    expect(outcome.total).toBe(11 + 3 + 2 + 2);
    expect(outcome.dc).toBe(12);
    expect(outcome.result).toBe('critical');
  });

  it('carries a Trait over the boundary it was written to cross', () => {
    expect(check(9, 0, [{ name: 'Bruised', since: 1 }]).result).toBe('failure');
    expect(check(9, 0, []).result).toBe('success');
  });
});
