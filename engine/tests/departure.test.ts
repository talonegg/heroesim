/**
 * E2-S3: the Hero who walks out. Departure is a Guild-side Check — the Guildmaster's
 * Guile against `config.departureDc` — so the two ends of it are pinned by putting that
 * DC out of reach in one direction or the other rather than by scripting a die.
 *
 * Regard drift is switched off throughout (`regardDecayEveryDays: 0`), so the only thing
 * moving Regard in these tests is the rule under test.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty, proposeParty } from '../src/career.js';
import type { GameConfig } from '../src/config.js';
import type { GameEvent } from '../src/events.js';
import { REASON_TALKED_ROUND } from '../src/regard.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { allThinking, fixtureContent, thinking } from './fixtures.js';

/** A Check the Guildmaster cannot fail, and one they cannot pass. */
const ALWAYS_KEPT: Partial<GameConfig> = { departureDc: 0, regardDecayEveryDays: 0 };
const ALWAYS_LOST: Partial<GameConfig> = { departureDc: 100, regardDecayEveryDays: 0 };

/**
 * Coin enough that a Guild which takes no work at all still reaches the end of the run.
 * These tests watch Regard over many Board refreshes; insolvency would only cut them short.
 */
const SOLVENT: Partial<GameConfig> = { startingCoin: 100_000 };

function departures(events: readonly GameEvent[]): Extract<GameEvent, { type: 'HeroDeparted' }>[] {
  return events.filter((event) => event.type === 'HeroDeparted');
}

function talkedRound(
  events: readonly GameEvent[],
  heroId: string,
): Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }>[] {
  return events
    .filter((event) => event.type === 'HeroRegardForGuildmasterChanged')
    .filter((event) => event.reason === REASON_TALKED_ROUND && event.heroId === heroId);
}

describe('who gets checked, and how often', () => {
  const opened = newCareer('departure-cadence', fixtureContent, {
    ...ALWAYS_KEPT,
    ...SOLVENT,
    talkedRoundRegardGain: 0,
  }).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('checks a Hero at the threshold once per Board refresh and never twice on a Day', () => {
    const sullen = thinking(opened, roster[0] ?? '', -4);
    const run = advance(sullen, 100, fixtureContent);
    const days = talkedRound(run.events, roster[0] ?? '').map((event) => event.day);

    const refreshes = run.events
      .filter((event) => event.type === 'BoardRefreshed')
      .map((event) => event.day);
    expect(refreshes).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(days).toEqual(refreshes);
    expect(new Set(days).size).toBe(days.length);
  });

  it('leaves a Hero above the threshold alone entirely', () => {
    const content = thinking(opened, roster[0] ?? '', opened.config.refusalRegardThreshold + 1);
    const run = advance(content, 100, fixtureContent);
    expect(talkedRound(run.events, roster[0] ?? '')).toEqual([]);
    expect(departures(run.events)).toEqual([]);
  });

  it('records that the Guildmaster talked them round, and lifts them back out of refusing', () => {
    const generous = newCareer('departure-kept', fixtureContent, ALWAYS_KEPT).career;
    const sullen = thinking(generous, generous.guild.roster[0]?.id ?? '', -5);
    const run = advance(sullen, 10, fixtureContent);
    const kept = run.career.guild.roster[0];

    expect(departures(run.events)).toEqual([]);
    expect(run.career.guild.formerHeroes).toEqual([]);
    expect(kept?.regardForGuildmaster.reason).toBe(REASON_TALKED_ROUND);
    expect(kept?.regardForGuildmaster.value).toBe(-5 + generous.config.talkedRoundRegardGain);
    expect(kept?.regardForGuildmaster.value).toBeGreaterThan(generous.config.refusalRegardThreshold);

    // And a Hero talked round will take work again, which is the point of the gain.
    const commission = run.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    expect(
      proposeParty(run.career, commission.id, [kept?.id ?? ''], fixtureContent).refusals,
    ).toEqual([]);
  });
});

describe('a Hero who walks out', () => {
  const opened = newCareer('departure-lost', fixtureContent, { ...ALWAYS_LOST, ...SOLVENT }).career;
  const roster = opened.guild.roster.map((hero) => hero.id);

  it('leaves the Roster for formerHeroes, with an exit and everything else intact', () => {
    const lost = thinking(opened, roster[0] ?? '', -5, 'the business at Thurrow');
    const was = lost.guild.roster.find((hero) => hero.id === roster[0]);
    const run = advance(lost, 10, fixtureContent);

    expect(departures(run.events)).toEqual([
      { type: 'HeroDeparted', day: 10, heroId: roster[0], regardValue: -5, reason: 'regard' },
    ]);
    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain(roster[0]);
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toEqual([roster[0]]);

    const gone = run.career.guild.formerHeroes[0];
    expect(gone?.exit).toEqual({ kind: 'departure', onDay: 10, reason: 'the business at Thurrow' });
    expect(gone?.regardForGuildmaster).toEqual(was?.regardForGuildmaster);
    expect(gone?.traits).toEqual(was?.traits);
    expect(gone?.stats).toEqual(was?.stats);
    expect(gone?.name).toBe(was?.name);
  });

  it('is not lost from a Regard the player has not watched fall past the threshold', () => {
    const sullen = thinking(opened, roster[0] ?? '', opened.config.departureRegardThreshold + 1);
    const run = advance(sullen, 100, fixtureContent);
    expect(departures(run.events)).toEqual([]);
    expect(run.career.guild.roster.map((hero) => hero.id)).toContain(roster[0]);
    expect(run.career.guild.roster.find((hero) => hero.id === roster[0])?.regardForGuildmaster.value).toBe(
      opened.config.departureRegardThreshold + 1,
    );
  });

  it('counts in the ledger and in the reckoning at the end', () => {
    const short = newCareer('departure-reckoning', fixtureContent, {
      ...ALWAYS_LOST,
      careerYears: 1,
      daysPerYear: 30,
    }).career;
    const lost = thinking(short, short.guild.roster[0]?.id ?? '', -5);
    const run = advance(lost, 60, fixtureContent);

    expect(run.career.ledger.departures).toBe(1);
    expect(run.career.ended?.reason).toBe('retirement');
    expect(run.career.ended?.reckoning.heroesLost).toBe(1);
    expect(run.career.ended?.reckoning.heroesOnRoster).toBe(short.guild.roster.length - 1);
  });
});

describe('a Hero away on a Commission', () => {
  const opened = newCareer('departure-away', fixtureContent, {
    ...ALWAYS_LOST,
    commissionSpanMin: 10,
    commissionSpanMax: 10,
  }).career;

  it('does not vanish mid-Commission; the check is deferred to their return Day', () => {
    // Somebody who cannot draw the one fixture Vignette that moves Regard, so the only
    // thing that touches this Hero's Regard while they are away is nothing at all.
    const chosen = opened.guild.roster.find((hero) => !hero.traits.some((held) => held.name === 'Craven'));
    if (chosen === undefined) throw new Error('the test expected a Hero without Craven');

    const soured = thinking(opened, chosen.id, -5);
    const waited = advance(soured, 4, fixtureContent);
    expect(waited.career.day).toBe(5);
    expect(departures(waited.events)).toEqual([]);

    const commission = waited.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const sent = commitParty(waited.career, commission.id, [chosen.id], fixtureContent, {
      insist: true,
    });
    expect(sent.career.parties[0]?.returnsOn).toBe(15);

    // Day 10 refreshes the Board while they are away: they are not checked and not lost.
    const away = advance(sent.career, 5, fixtureContent);
    expect(away.career.day).toBe(10);
    expect(away.events.some((event) => event.type === 'BoardRefreshed')).toBe(true);
    expect(departures(away.events)).toEqual([]);
    expect(away.career.guild.roster.map((hero) => hero.id)).toContain(chosen.id);
    expect(away.career.parties).toHaveLength(1);

    // They finish the work first, and go on the Day they come home.
    const home = advance(away.career, 5, fixtureContent);
    expect(home.career.day).toBe(15);
    const returned = home.events.findIndex((event) => event.type === 'PartyReturned');
    const left = home.events.findIndex((event) => event.type === 'HeroDeparted');
    expect(returned).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThan(returned);
    expect(departures(home.events).map((event) => event.day)).toEqual([15]);
    expect(home.career.parties).toHaveLength(0);
    expect(home.career.guild.formerHeroes.map((hero) => hero.id)).toEqual([chosen.id]);
  });
});

describe('a Roster emptied by Departure', () => {
  it('is survivable: advance does not crash and Upkeep falls to upkeepBase', () => {
    const opened = newCareer('departure-empty', fixtureContent, {
      ...ALWAYS_LOST,
      careerYears: 1,
      daysPerYear: 60,
    }).career;
    const abandoned: Career = allThinking(opened, -5);
    const run = advance(abandoned, 200, fixtureContent);

    expect(departures(run.events).map((event) => event.day)).toEqual(
      opened.guild.roster.map(() => 10),
    );
    expect(run.career.guild.roster).toEqual([]);
    expect(run.career.guild.formerHeroes).toHaveLength(opened.guild.roster.length);
    expect(run.career.ledger.departures).toBe(opened.guild.roster.length);

    const upkeeps = run.events.filter((event) => event.type === 'UpkeepOwed');
    const afterTheDoorShut = upkeeps.filter((event) => event.day > 10);
    expect(afterTheDoorShut.length).toBeGreaterThan(0);
    expect(afterTheDoorShut.every((event) => event.amount === opened.config.upkeepBase)).toBe(true);

    expect(run.career.ended?.reason).toBe('retirement');
    expect(run.career.ended?.reckoning.heroesOnRoster).toBe(0);
    expect(run.career.ended?.reckoning.heroesLost).toBe(opened.guild.roster.length);
  });
});
