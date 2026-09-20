/**
 * E2-S1: who will not go, and the pure question that asks. Everything here goes through
 * the engine's public entry points — `proposeParty`, `commitParty`, `validateContent` —
 * and asserts on typed results and events, never on prose.
 */

import { describe, expect, it } from 'vitest';
import { commitParty, proposeParty } from '../src/career.js';
import { defaultConfig } from '../src/config.js';
import { validateContent } from '../src/content.js';
import { ContentError, EngineError } from '../src/errors.js';
import { advance } from '../src/career.js';
import { serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { deepFreeze, fixtureContent, holding, offering, thinking } from './fixtures.js';

const opened = newCareer('refusals-e2', fixtureContent).career;
const roster = opened.guild.roster.map((hero) => hero.id);

/** The raw content the fixture world is built from, so one Trait can be made malformed. */
function rawContent(refusal: unknown): unknown {
  return {
    traits: [
      { name: 'Steady', kind: 'disposition', summary: 'Nothing much moves them.', modifiers: [] },
      { name: 'Worn', kind: 'scar', summary: 'Has given the work everything.', modifiers: [], refusal },
    ],
    backgrounds: [{ name: 'Levy years', summary: 'Taken by the levy.', traits: ['Steady'] }],
    spheres: [
      {
        id: 'river',
        name: 'the river towns',
        patronNames: ['The Wending Ferrymen'],
        commissionTitles: [{ title: 'The ford at Lowford', difficulty: 10, tags: ['water'] }],
      },
    ],
    names: {
      heroFirst: ['Brenna'],
      heroEpithets: ['of Ashfall'],
      guildNames: ['The Lowford Guild'],
      rivalNames: ['The Kestrel Guild'],
    },
    vignettes: [
      {
        id: 'the-find',
        name: 'The find',
        stat: 'Craft',
        difficulty: 11,
        weight: 1,
        tags: [],
        conditions: {},
        slots: { hero: 'any' },
        outcomes: {
          failure: { narrative: '{hero} does nothing.', consequences: [] },
          success: { narrative: '{hero} does nothing.', consequences: [] },
          critical: { narrative: '{hero} does nothing.', consequences: [] },
        },
      },
    ],
  };
}

function rejection(run: () => unknown): EngineError {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof EngineError) return thrown;
    throw thrown;
  }
  throw new Error('the call was expected to be rejected and was not');
}

describe('a refusal is content plus state', () => {
  it('parses `refusal` from a TraitDef in all three of the shapes the rule allows', () => {
    const byName = new Map(fixtureContent.traits.map((trait) => [trait.name, trait]));
    expect(byName.get('Worn')?.refusal).toEqual({});
    expect(byName.get('Never the water')?.refusal).toEqual({ tags: ['water'] });
    expect(byName.get('Nothing desperate')?.refusal).toEqual({ minDifficulty: 13 });
    expect(byName.get('Steady')?.refusal).toBeUndefined();
    expect('refusal' in (byName.get('Steady') ?? {})).toBe(false);
  });

  it('refuses a malformed `refusal`, naming the field', () => {
    const cases: [unknown, RegExp][] = [
      [{ tags: 'water' }, /trait "Worn"\.refusal\.tags/],
      [{ tags: ['water', 7] }, /trait "Worn"\.refusal\.tags\[1\]/],
      [{ tags: [] }, /trait "Worn"\.refusal\.tags/],
      [{ minDifficulty: 'hard' }, /trait "Worn"\.refusal\.minDifficulty/],
      [{ minDifficulty: 12.5 }, /trait "Worn"\.refusal\.minDifficulty/],
      [{ onlyOn: ['water'] }, /trait "Worn"\.refusal\.onlyOn/],
      ['everything', /trait "Worn"\.refusal/],
    ];
    for (const [refusal, pattern] of cases) {
      expect(() => validateContent(rawContent(refusal))).toThrow(ContentError);
      expect(() => validateContent(rawContent(refusal))).toThrow(pattern);
    }
    expect(validateContent(rawContent({ tags: ['water'] })).traits[1]?.refusal).toEqual({
      tags: ['water'],
    });
  });
});

describe('who would refuse', () => {
  it('says nobody when the Roster is content, and agrees with the Backing commitParty computes', () => {
    const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });
    const proposal = proposeParty(career, commission.id, roster.slice(0, 2), fixtureContent);
    expect(proposal.refusals).toEqual([]);
    expect(proposal.commissionId).toBe(commission.id);
    expect(proposal.heroIds).toEqual(roster.slice(0, 2));

    const step = commitParty(career, commission.id, roster.slice(0, 2), fixtureContent);
    const committed = step.events.find((event) => event.type === 'PartyCommitted');
    expect(committed?.backing).toBe(proposal.backing);
    expect(step.career.parties[0]?.backing).toBe(proposal.backing);
  });

  it('names a Hero whose Regard has reached the threshold, and not one a point above it', () => {
    const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });
    const threshold = career.config.refusalRegardThreshold;

    const at = thinking(career, roster[0] ?? '', threshold);
    expect(proposeParty(at, commission.id, [roster[0] ?? ''], fixtureContent).refusals).toEqual([
      { heroId: roster[0], reason: 'regard', regardValue: threshold },
    ]);

    const below = thinking(career, roster[0] ?? '', threshold - 1);
    expect(
      proposeParty(below, commission.id, [roster[0] ?? ''], fixtureContent).refusals[0]?.regardValue,
    ).toBe(threshold - 1);

    const above = thinking(career, roster[0] ?? '', threshold + 1);
    expect(proposeParty(above, commission.id, [roster[0] ?? ''], fixtureContent).refusals).toEqual([]);
  });

  it('names a Hero whose Trait refuses this Commission, and quotes the Trait', () => {
    const water = offering(opened, { tags: ['water', 'escort'], difficulty: 10 });
    const dry = offering(opened, { tags: ['guard'], difficulty: 10 });
    const hard = offering(opened, { tags: ['guard'], difficulty: 13 });

    const wary = holding(water.career, roster[0] ?? '', 'Never the water');
    expect(proposeParty(wary, water.commission.id, [roster[0] ?? ''], fixtureContent).refusals).toEqual([
      { heroId: roster[0], reason: 'trait', trait: 'Never the water', regardValue: wary.guild.roster[0]?.regardForGuildmaster.value },
    ]);
    expect(
      proposeParty(
        holding(dry.career, roster[0] ?? '', 'Never the water'),
        dry.commission.id,
        [roster[0] ?? ''],
        fixtureContent,
      ).refusals,
    ).toEqual([]);

    const careful = holding(hard.career, roster[0] ?? '', 'Nothing desperate');
    expect(
      proposeParty(careful, hard.commission.id, [roster[0] ?? ''], fixtureContent).refusals[0]?.trait,
    ).toBe('Nothing desperate');
    expect(
      proposeParty(
        holding(dry.career, roster[0] ?? '', 'Nothing desperate'),
        dry.commission.id,
        [roster[0] ?? ''],
        fixtureContent,
      ).refusals,
    ).toEqual([]);

    const spent = holding(dry.career, roster[0] ?? '', 'Worn');
    expect(proposeParty(spent, dry.commission.id, [roster[0] ?? ''], fixtureContent).refusals[0]?.trait).toBe(
      'Worn',
    );
    const spentAtSea = holding(water.career, roster[0] ?? '', 'Worn');
    expect(
      proposeParty(spentAtSea, water.commission.id, [roster[0] ?? ''], fixtureContent).refusals[0]?.trait,
    ).toBe('Worn');
  });

  it('blames the relationship, not the Trait, when a Hero would refuse on both counts', () => {
    const { career, commission } = offering(opened, { tags: ['water'], difficulty: 14 });
    const both = holding(
      thinking(career, roster[0] ?? '', career.config.refusalRegardThreshold),
      roster[0] ?? '',
      'Never the water',
    );
    const refusals = proposeParty(both, commission.id, [roster[0] ?? ''], fixtureContent).refusals;
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe('regard');
    expect(refusals[0]?.trait).toBeUndefined();
    expect('trait' in (refusals[0] ?? {})).toBe(false);
  });

  it('answers in the order the Heroes were named, one entry each', () => {
    const { career, commission } = offering(opened, { tags: ['water'], difficulty: 10 });
    const soured = holding(
      thinking(career, roster[2] ?? '', -5),
      roster[0] ?? '',
      'Never the water',
    );
    const named = [roster[2] ?? '', roster[1] ?? '', roster[0] ?? ''];
    const refusals = proposeParty(soured, commission.id, named, fixtureContent).refusals;
    expect(refusals.map((refusal) => refusal.heroId)).toEqual([roster[2], roster[0]]);
    expect(refusals.map((refusal) => refusal.reason)).toEqual(['regard', 'trait']);
  });

  it('changes nothing at all, over a deep-frozen Career', () => {
    const { career, commission } = offering(opened, { tags: ['water'], difficulty: 14 });
    const soured: Career = holding(thinking(career, roster[0] ?? '', -5), roster[1] ?? '', 'Worn');
    const before = serialiseCareer(soured);
    const frozen = deepFreeze(soured);
    for (let round = 0; round < 3; round += 1) {
      proposeParty(frozen, commission.id, roster, fixtureContent);
    }
    expect(serialiseCareer(frozen)).toBe(before);
  });
});

describe('asking is refused for the same reasons deciding is', () => {
  const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });

  const cases: [string, (run: Career, id: string, heroIds: string[]) => unknown][] = [
    ['proposeParty', (run, id, heroIds) => proposeParty(run, id, heroIds, fixtureContent)],
    ['commitParty', (run, id, heroIds) => commitParty(run, id, heroIds, fixtureContent)],
  ];

  it('throws the same code for an empty Party', () => {
    for (const [, call] of cases) {
      expect(rejection(() => call(career, commission.id, [])).code).toBe('EmptyParty');
    }
  });

  it('throws the same code for a Commission that is not on the Board', () => {
    for (const [, call] of cases) {
      expect(rejection(() => call(career, 'not-a-commission', roster)).code).toBe(
        'CommissionNotOnBoard',
      );
    }
  });

  it('throws the same code for a Hero who cannot go', () => {
    const away = commitParty(career, commission.id, roster.slice(0, 2), fixtureContent).career;
    const second = away.board[0];
    if (second === undefined) throw new Error('the test expected a second Commission');
    for (const [, call] of cases) {
      expect(rejection(() => call(career, commission.id, ['nobody'])).code).toBe('HeroNotAvailable');
      expect(rejection(() => call(career, commission.id, [roster[0] ?? '', roster[0] ?? ''])).code).toBe(
        'HeroNotAvailable',
      );
      expect(rejection(() => call(away, second.id, roster.slice(0, 2))).code).toBe('HeroNotAvailable');
    }
  });

  it('throws the same code once the Career has ended', () => {
    const ended = advance(
      newCareer('refusals-ended', fixtureContent, { careerYears: 1, daysPerYear: 10 }).career,
      40,
      fixtureContent,
    ).career;
    expect(ended.ended).toBeDefined();
    for (const [, call] of cases) {
      expect(rejection(() => call(ended, ended.board[0]?.id ?? 'c1.1', roster)).code).toBe('CareerEnded');
    }
  });
});

describe('the thresholds refusal turns on', () => {
  it('are named, defaulted GameConfig fields', () => {
    expect(defaultConfig.refusalRegardThreshold).toBe(-3);
    expect(defaultConfig.insistenceRegardCost).toBe(2);
    expect(defaultConfig.departureRegardThreshold).toBe(-5);
    expect(defaultConfig.departureDc).toBe(12);
    expect(defaultConfig.regardDecayEveryDays).toBe(30);
    expect(defaultConfig.regardDecayAmount).toBe(1);
    expect(defaultConfig.backingMin).toBe(-2);
    expect(defaultConfig.backingRegardDivisor).toBe(2);
  });

  it('move the rule when they are overridden, so no literal is buried in the engine', () => {
    const lenient = newCareer('refusals-lenient', fixtureContent, {
      refusalRegardThreshold: -5,
    }).career;
    const { career, commission } = offering(lenient, { tags: ['guard'], difficulty: 10 });
    const soured = thinking(career, career.guild.roster[0]?.id ?? '', -4);
    expect(proposeParty(soured, commission.id, [soured.guild.roster[0]?.id ?? ''], fixtureContent).refusals).toEqual(
      [],
    );
  });
});
