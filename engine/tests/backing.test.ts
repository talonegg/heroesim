/**
 * E2-S5: Backing gains its Regard term. `check.test.ts` holds the unit-level arithmetic;
 * this file pins it through the public API, on fixed Careers whose Guildmasters are named
 * in the assertions, so that the number a Party actually sets out with is the one asserted.
 *
 *   statTerm   = clamp(round((gm.Nerve + gm.Guile) / backingStatDivisor) − backingStatOffset, 0, backingMax)
 *   traitTerm  = Σ gm.traits[].backing
 *   regardTerm = round(mean(member.regardForGuildmaster.value) / backingRegardDivisor)
 *   backing    = clamp(statTerm + traitTerm + regardTerm, backingMin, backingMax)
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty, proposeParty } from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import { deserialiseCareer, serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { allThinking, fixtureContent, offering, thinking } from './fixtures.js';

/** Nobody refuses, so a Party of resentful Heroes can be sent without insisting first. */
const NOBODY_REFUSES: Partial<GameConfig> = { refusalRegardThreshold: -100 };

/** What a Party of these Heroes would set out with, asked and then taken. */
function backingOf(career: Career, heroIds: readonly string[]): number {
  const { career: board, commission } = offering(career, { tags: ['guard'], difficulty: 10 });
  const proposal = proposeParty(board, commission.id, [...heroIds], fixtureContent);
  const step = commitParty(board, commission.id, [...heroIds], fixtureContent);
  const committed = step.events.find((event) => event.type === 'PartyCommitted');
  expect(committed?.backing).toBe(proposal.backing);
  expect(step.career.parties[0]?.backing).toBe(proposal.backing);
  return proposal.backing;
}

describe('a Guildmaster of Nerve 2 and Guile 3, whose Stat term is one', () => {
  const opened = newCareer('backing-1', fixtureContent, NOBODY_REFUSES).career;
  const roster = opened.guild.roster.map((hero) => hero.id);
  const pair = roster.slice(0, 2);

  it('is the Career these numbers are written against', () => {
    expect(opened.guild.guildmaster.stats.Nerve).toBe(2);
    expect(opened.guild.guildmaster.stats.Guile).toBe(3);
    expect(
      opened.guild.guildmaster.traits.reduce(
        (sum, held) => sum + (fixtureContent.traits.find((def) => def.name === held.name)?.backing ?? 0),
        0,
      ),
    ).toBe(0);
    expect(opened.config.backingRegardDivisor).toBe(2);
    expect(opened.config.backingMin).toBe(-2);
    expect(opened.config.backingMax).toBe(3);
  });

  it('gives a Party that is indifferent to them exactly the Stat term', () => {
    expect(backingOf(allThinking(opened, 0), pair)).toBe(1);
  });

  it('goes negative for a Party of resentful Heroes', () => {
    expect(backingOf(allThinking(opened, -5), pair)).toBe(-1);
    expect(backingOf(allThinking(opened, -4), pair)).toBe(-1);
    expect(backingOf(allThinking(opened, -2), pair)).toBe(0);
  });

  it('takes the mean over the Party, so one sour Hero is carried by a content one', () => {
    const mixed = thinking(thinking(opened, pair[0] ?? '', -5), pair[1] ?? '', -2);
    expect(backingOf(mixed, pair)).toBe(-1);

    const nearlyEven = thinking(thinking(opened, pair[0] ?? '', -1), pair[1] ?? '', 0);
    expect(backingOf(nearlyEven, pair)).toBe(1);
  });

  it('is clamped at the ceiling for a Party that thinks the world of them', () => {
    expect(backingOf(allThinking(opened, 5), pair)).toBe(opened.config.backingMax);
  });

  // F5: this Party's Regard term rounds to −0 internally, but `fromStats` here is 1 (not
  // +0), so the −0 is already washed out before `backingFor` returns — the committed
  // Backing is the ordinary number 1, not −0. `Object.is` is still the right comparison
  // for a round-trip test; it just is not, on this fixture, a test of negative zero.
  it('survives a save and load as exactly the same number', () => {
    const nearlyEven = thinking(thinking(opened, pair[0] ?? '', -1), pair[1] ?? '', 0);
    const { career: board, commission } = offering(nearlyEven, { tags: ['guard'], difficulty: 10 });
    const sent = commitParty(board, commission.id, pair, fixtureContent).career;
    const loaded = deserialiseCareer(serialiseCareer(sent));
    expect(loaded).toEqual(sent);
    expect(Object.is(loaded.parties[0]?.backing, sent.parties[0]?.backing)).toBe(true);
  });
});

describe('a Guildmaster of Nerve 1 and Guile 1, who contributes nothing of themselves', () => {
  const opened = newCareer('backing-14', fixtureContent, NOBODY_REFUSES).career;
  const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);

  it('is the Career these numbers are written against', () => {
    expect(opened.guild.guildmaster.stats.Nerve).toBe(1);
    expect(opened.guild.guildmaster.stats.Guile).toBe(1);
  });

  it('bottoms out at the configured floor rather than running away downwards', () => {
    expect(backingOf(allThinking(opened, 0), pair)).toBe(0);
    expect(backingOf(allThinking(opened, -5), pair)).toBe(opened.config.backingMin);
    expect(opened.config.backingMin).toBe(-2);
  });
});

describe('the two new terms are tunables, not literals', () => {
  it('moves with backingRegardDivisor', () => {
    for (const [divisor, expected] of [
      [1, -2],
      [2, -1],
      [5, 0],
      [0, 1],
    ] as const) {
      const opened = newCareer('backing-1', fixtureContent, {
        ...NOBODY_REFUSES,
        backingRegardDivisor: divisor,
      }).career;
      const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);
      expect(backingOf(allThinking(opened, -5), pair), `divisor ${divisor}`).toBe(expected);
    }
  });

  it('moves with backingMin', () => {
    for (const floor of [-5, -2, 0]) {
      const opened = newCareer('backing-14', fixtureContent, {
        ...NOBODY_REFUSES,
        backingMin: floor,
        backingRegardDivisor: 1,
      }).career;
      const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);
      expect(backingOf(allThinking(opened, -5), pair), `floor ${floor}`).toBe(floor);
    }
  });

  // DL-15 (finding F4, invariant 8): `backingFor`'s Stat term carried the divisor and the
  // offset as inline literals since E1. A Party indifferent to the Guildmaster (mean
  // Regard 0) contributes nothing from the Regard term, so these two tests isolate the
  // Stat term alone, on the seed `backing-1` Guildmaster of Nerve 2, Guile 3 the earlier
  // tests in this file already pin.
  it('moves with backingStatDivisor', () => {
    for (const [divisor, expected] of [
      [1, 3],
      [2, 1],
      [5, 0],
    ] as const) {
      const opened = newCareer('backing-1', fixtureContent, {
        ...NOBODY_REFUSES,
        backingStatDivisor: divisor,
      }).career;
      const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);
      expect(backingOf(allThinking(opened, 0), pair), `divisor ${divisor}`).toBe(expected);
    }
  });

  it('moves with backingStatOffset', () => {
    for (const [offset, expected] of [
      [0, 3],
      [2, 1],
      [5, 0],
    ] as const) {
      const opened = newCareer('backing-1', fixtureContent, {
        ...NOBODY_REFUSES,
        backingStatOffset: offset,
      }).career;
      const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);
      expect(backingOf(allThinking(opened, 0), pair), `offset ${offset}`).toBe(expected);
    }
  });

  it('is applied to every Check the Party makes, so a resentful Party totals less', () => {
    const settings: Partial<GameConfig> = {
      ...NOBODY_REFUSES,
      beatsMin: 4,
      beatsMax: 4,
      commissionSpanMin: 8,
      commissionSpanMax: 8,
    };
    const opened = newCareer('backing-1', fixtureContent, settings).career;
    const pair = opened.guild.roster.slice(0, 2).map((hero) => hero.id);

    /** The Beat totals a Party of this opinion rolls, on the same seed and the same dice. */
    function totalsAt(value: number): { backing: number; totals: number[] } {
      const { career, commission } = offering(allThinking(opened, value), {
        tags: ['guard'],
        difficulty: 10,
      });
      const sent = commitParty(career, commission.id, pair, fixtureContent).career;
      const run = advance(sent, commission.spanDays, fixtureContent);
      return {
        backing: sent.parties[0]?.backing ?? 0,
        totals: run.events
          .filter((event) => event.type === 'BeatResolved')
          .map((event) => event.total),
      };
    }

    const sour = totalsAt(-5);
    const sweet = totalsAt(5);
    expect(sour.backing).toBe(-1);
    expect(sweet.backing).toBe(opened.config.backingMax);
    expect(sour.totals).toHaveLength(4);
    expect(sweet.totals).toHaveLength(4);
    expect(sour.totals.map((total, index) => (sweet.totals[index] ?? 0) - total)).toEqual(
      sour.totals.map(() => sweet.backing - sour.backing),
    );
  });
});
