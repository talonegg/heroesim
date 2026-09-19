/**
 * `clone.ts` is written out field by field for speed, so it has to know the whole of the
 * world state. This is the test that proves it does: a Career with every optional field
 * populated goes in, and a deep-equal copy that shares nothing comes out.
 */

import { describe, expect, it } from 'vitest';
import { advance, commitParty } from '../src/career.js';
import { cloneCareer } from '../src/clone.js';
import { serialiseCareer } from '../src/save.js';
import type { Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

/** A Career with a Party out, an Injury running, finished work behind it and an ending. */
function fullyPopulated(): Career {
  const opened = newCareer('clone', fixtureContent, {
    careerYears: 1,
    daysPerYear: 30,
    commissionSpanMin: 5,
    commissionSpanMax: 5,
  }).career;

  const first = opened.board[0];
  if (first === undefined) throw new Error('the test expected a Commission');
  let career = commitParty(opened, first.id, [opened.guild.roster[0]?.id ?? ''], fixtureContent).career;
  career = advance(career, 6, fixtureContent).career;

  const next = career.board[0];
  if (next === undefined) throw new Error('the test expected the Board to have refilled');
  career = commitParty(career, next.id, [career.guild.roster[1]?.id ?? ''], fixtureContent).career;

  // Keep the second Party out past the end, so a Career that has ended still carries one.
  const away = career.parties[0];
  if (away === undefined) throw new Error('the test expected a Party');
  away.returnsOn = 990;
  away.beatDays = [980, 985];

  const hero = career.guild.roster[0];
  if (hero !== undefined) hero.traits.push({ name: 'Bruised', since: career.day, liftsOn: career.day + 99 });
  career.ledger.commissionsByPatron['pa1'] = 3;

  return advance(career, 40, fixtureContent).career;
}

describe('cloning a Career', () => {
  const original = fullyPopulated();

  it('reaches every part of the world', () => {
    expect(original.parties.length).toBeGreaterThan(0);
    expect(original.recentCommissions.length).toBeGreaterThan(0);
    expect(original.board.length).toBeGreaterThan(0);
    expect(original.ended).toBeDefined();
    expect(cloneCareer(original)).toEqual(original);
    expect(serialiseCareer(cloneCareer(original))).toBe(serialiseCareer(original));
  });

  it('shares no object with the original', () => {
    const copy = cloneCareer(original);
    expect(copy).not.toBe(original);
    expect(copy.config).not.toBe(original.config);
    expect(copy.rng).not.toBe(original.rng);
    expect(copy.guild).not.toBe(original.guild);
    expect(copy.guild.guildmaster).not.toBe(original.guild.guildmaster);
    expect(copy.guild.guildmaster.stats).not.toBe(original.guild.guildmaster.stats);
    expect(copy.ledger).not.toBe(original.ledger);
    expect(copy.ledger.commissionsByPatron).not.toBe(original.ledger.commissionsByPatron);
    expect(copy.ended).not.toBe(original.ended);
    expect(copy.ended?.reckoning).not.toBe(original.ended?.reckoning);
    for (const [index, hero] of copy.guild.roster.entries()) {
      expect(hero).not.toBe(original.guild.roster[index]);
      expect(hero.traits).not.toBe(original.guild.roster[index]?.traits);
      expect(hero.regardFor).not.toBe(original.guild.roster[index]?.regardFor);
    }
    for (const [index, commission] of copy.recentCommissions.entries()) {
      expect(commission).not.toBe(original.recentCommissions[index]);
      expect(commission.tags).not.toBe(original.recentCommissions[index]?.tags);
    }
  });

  it('keeps an omitted optional field omitted', () => {
    const running = newCareer('running', fixtureContent).career;
    const copy = cloneCareer(running);
    expect('ended' in copy).toBe(false);
    expect(copy.guild.roster[0]?.traits.every((held) => !('liftsOn' in held))).toBe(true);
  });
});
