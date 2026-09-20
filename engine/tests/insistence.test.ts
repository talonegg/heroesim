/**
 * E2-S2: sending somebody who said no, and what it costs. The price is charged before the
 * Party's Backing is worked out, so insisting visibly weakens the Party it creates — that
 * is the whole of the mechanism, and it is asserted here on the typed events.
 *
 * Refusals in these tests come from a Trait rather than from Regard wherever the Regard
 * itself is the thing being measured, so that `refusalRegardThreshold` can be put out of
 * reach and the Departure machinery kept out of the arithmetic.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty, proposeParty } from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import { EngineError } from '../src/errors.js';
import type { GameEvent } from '../src/events.js';
import { REASON_INSISTED } from '../src/regard.js';
import { serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { fixtureContent, holding, offering, thinking } from './fixtures.js';

/** Regard moves only where a test moves it: no drift, no Departure check, no talking round. */
const QUIET: Partial<GameConfig> = {
  refusalRegardThreshold: -100,
  departureRegardThreshold: -100,
  regardDecayEveryDays: 0,
  commissionSpanMin: 5,
  commissionSpanMax: 5,
};

function heroRegard(events: readonly GameEvent[]): Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }>[] {
  return events.filter((event) => event.type === 'HeroRegardForGuildmasterChanged');
}

function insistences(events: readonly GameEvent[]): Extract<GameEvent, { type: 'InsistenceApplied' }>[] {
  return events.filter((event) => event.type === 'InsistenceApplied');
}

describe('commitParty will not insist by accident', () => {
  const opened = newCareer('insistence-guard', fixtureContent, QUIET).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('throws HeroRefused and leaves the Career byte-identical to its input', () => {
    const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });
    const unwilling = holding(career, roster[0] ?? '', 'Worn');
    const before = serialiseCareer(unwilling);

    let thrown: unknown;
    try {
      commitParty(unwilling, commission.id, roster.slice(0, 2), fixtureContent);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe('HeroRefused');
    expect(serialiseCareer(unwilling)).toBe(before);

    // And again with `insist: false` spelled out, which is not consent either.
    expect(() =>
      commitParty(unwilling, commission.id, roster.slice(0, 2), fixtureContent, { insist: false }),
    ).toThrow(EngineError);
    expect(serialiseCareer(unwilling)).toBe(before);
  });

  it('is legal with `insist: true` when nobody refuses, and emits nothing extra', () => {
    const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });
    const plain = commitParty(career, commission.id, roster.slice(0, 2), fixtureContent);
    const insisted = commitParty(career, commission.id, roster.slice(0, 2), fixtureContent, {
      insist: true,
    });
    expect(insisted.events).toEqual(plain.events);
    expect(serialiseCareer(insisted.career)).toBe(serialiseCareer(plain.career));
  });
});

describe('what insisting costs', () => {
  const opened = newCareer('insistence-cost', fixtureContent, QUIET).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('charges each refusing Hero once, in Hero order, and leaves the willing untouched', () => {
    const { career, commission } = offering(opened, { tags: ['water'], difficulty: 10 });
    const unwilling = holding(thinking(career, roster[1] ?? '', 0), roster[0] ?? '', 'Never the water');
    const named = [roster[0] ?? '', roster[1] ?? '', roster[2] ?? ''];
    const alsoUnwilling = holding(unwilling, roster[2] ?? '', 'Worn');

    const proposal = proposeParty(alsoUnwilling, commission.id, named, fixtureContent);
    expect(proposal.refusals.map((refusal) => refusal.heroId)).toEqual([roster[0], roster[2]]);

    const step = commitParty(alsoUnwilling, commission.id, named, fixtureContent, { insist: true });
    expect(insistences(step.events).map((event) => event.heroId)).toEqual([roster[0], roster[2]]);
    expect(heroRegard(step.events).map((event) => event.heroId)).toEqual([roster[0], roster[2]]);
    expect(heroRegard(step.events).every((event) => event.reason === REASON_INSISTED)).toBe(true);
    expect(
      step.events.filter((event) => event.type === 'CommissionRefused').map((event) => event.heroId),
    ).toEqual([roster[0], roster[2]]);

    const cost = alsoUnwilling.config.insistenceRegardCost;
    for (const id of [roster[0], roster[2]]) {
      const was = alsoUnwilling.guild.roster.find((hero) => hero.id === id)?.regardForGuildmaster.value ?? 0;
      const now = step.career.guild.roster.find((hero) => hero.id === id)?.regardForGuildmaster.value;
      expect(now).toBe(was - cost);
    }
    const willing = step.career.guild.roster.find((hero) => hero.id === roster[1]);
    expect(willing?.regardForGuildmaster).toEqual(
      alsoUnwilling.guild.roster.find((hero) => hero.id === roster[1])?.regardForGuildmaster,
    );
  });

  it('costs twice when it happens twice, and stops at the Regard floor', () => {
    let career: Career = holding(thinking(opened, roster[0] ?? '', 0), roster[0] ?? '', 'Worn');
    const seen: { value: number; delta: number }[] = [];

    for (let round = 0; round < 4; round += 1) {
      const commission = career.board[0];
      if (commission === undefined) throw new Error('the test expected a Commission');
      const step = commitParty(career, commission.id, [roster[0] ?? ''], fixtureContent, {
        insist: true,
      });
      const applied = insistences(step.events)[0];
      if (applied === undefined) throw new Error('the test expected an InsistenceApplied');
      seen.push({ value: applied.value, delta: applied.delta });
      career = advance(step.career, career.config.commissionSpanMin, fixtureContent).career;
    }

    expect(seen).toEqual([
      { value: -2, delta: -2 },
      { value: -4, delta: -2 },
      { value: -5, delta: -1 },
      { value: -5, delta: 0 },
    ]);
    expect(career.guild.roster.find((hero) => hero.id === roster[0])?.regardForGuildmaster.value).toBe(
      career.config.regardMin,
    );
    expect(career.config.regardMin).toBe(-5);
  });
});

describe('Backing is worked out after the price has been paid', () => {
  // A Guildmaster of Nerve 2 and Guile 3 contributes a Stat term of exactly 1 and carries
  // no Trait that adds to Backing, so the arithmetic below is the Regard term alone.
  const opened = newCareer('backing-1', fixtureContent, QUIET).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('is the Career whose Guildmaster the numbers below are written against', () => {
    expect(opened.guild.guildmaster.stats.Nerve).toBe(2);
    expect(opened.guild.guildmaster.stats.Guile).toBe(3);
    expect(
      opened.guild.guildmaster.traits.every(
        (held) => fixtureContent.traits.find((def) => def.name === held.name)?.backing === undefined,
      ),
    ).toBe(true);
  });

  it('sends a weaker Party than the one proposeParty described', () => {
    const { career, commission } = offering(opened, { tags: ['guard'], difficulty: 10 });
    const unwilling = holding(thinking(career, roster[0] ?? '', 0), roster[0] ?? '', 'Worn');

    const proposal = proposeParty(unwilling, commission.id, [roster[0] ?? ''], fixtureContent);
    expect(proposal.backing).toBe(1);

    const step = commitParty(unwilling, commission.id, [roster[0] ?? ''], fixtureContent, {
      insist: true,
    });
    const committed = step.events.find((event) => event.type === 'PartyCommitted');
    expect(committed?.backing).toBe(0);
    expect(committed?.backing).toBeLessThan(proposal.backing);
    expect(step.career.parties[0]?.backing).toBe(0);

    // The order is what makes it so: the Regard movement is reported before the commit.
    const regardAt = step.events.findIndex((event) => event.type === 'HeroRegardForGuildmasterChanged');
    const commitAt = step.events.findIndex((event) => event.type === 'PartyCommitted');
    expect(regardAt).toBeGreaterThanOrEqual(0);
    expect(regardAt).toBeLessThan(commitAt);
  });
});
