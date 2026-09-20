import { describe, expect, it } from 'vitest';
import { commitParty, newCareer, proposeParty, unavailableAmong, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import { partyPreview } from '../src/state/selectors';

/**
 * The selectors hold no rule of their own (E8-S2). The one that could drift furthest is
 * "who cannot be sent, and why": the engine answers it inside `proposeParty`, including
 * the precedence a Hero who is both away and hurt is reported under, and anything the web
 * client worked out beside it would be a second copy of that rule.
 *
 * These tests fail the moment the client's answer stops being the engine's.
 */

const SEED = 'web-unavailable-01';

interface FourStates {
  career: Career;
  /** A Commission still on the Board, to ask the question through. */
  commissionId: string;
  /** A Hero who can be sent. */
  free: string;
  /** Away with a Party. */
  away: string;
  /** At home, carrying an Injury. */
  injured: string;
  /** Away *and* carrying an Injury — the case the precedence is about. */
  both: string;
}

/**
 * A Roster with one Hero in each of the four states. The Party is committed through the
 * engine, and the Injuries are written onto a copy of what it returned — the same way the
 * engine's own tests reach a hurt Roster, since an Injury comes of a failed Check.
 */
function fourStates(): FourStates {
  const opened = newCareer(SEED, content).career;
  const work = opened.board[0];
  const roster = opened.guild.roster;
  if (work === undefined) throw new Error('the test expected a Board');
  if (roster.length < 4) throw new Error('the test expected four Heroes on the Roster');
  const sent = commitParty(opened, work.id, [roster[0]!.id, roster[1]!.id], content, {
    insist: true,
  }).career;

  const career = JSON.parse(JSON.stringify(sent)) as Career;
  const hurt = { name: 'Cracked rib', since: career.day, liftsOn: career.day + 20 };
  career.guild.roster[1]!.traits.push({ ...hurt });
  career.guild.roster[2]!.traits.push({ ...hurt });
  const next = career.board[0];
  if (next === undefined) throw new Error('the test expected the Board to hold more work');

  return {
    career,
    commissionId: next.id,
    away: career.guild.roster[0]!.id,
    both: career.guild.roster[1]!.id,
    injured: career.guild.roster[2]!.id,
    free: career.guild.roster[3]!.id,
  };
}

/** The engine's own answer for this Career, asked the way a Party picker would ask it. */
function asTheEngineSeesIt(world: FourStates) {
  return proposeParty(world.career, world.commissionId, [world.free], content).unavailable;
}

describe('who cannot be sent, and why', () => {
  it('gives the engine’s answer before anybody has been chosen', () => {
    const world = fourStates();
    const { unavailable } = partyPreview(world.career, world.commissionId, []);

    expect(unavailable).toEqual(asTheEngineSeesIt(world));
    expect(unavailable).toEqual([
      { heroId: world.away, reason: 'away' },
      // Away *and* hurt is reported as away: that is the fact that stops them being
      // picked today, and it is the engine's precedence, not this client's.
      { heroId: world.both, reason: 'away' },
      { heroId: world.injured, reason: 'injured' },
    ]);
    expect(unavailable.some((entry) => entry.heroId === world.free)).toBe(false);
  });

  it('covers the whole Roster, not only the Heroes who were chosen', () => {
    const world = fourStates();
    const chosen = partyPreview(world.career, world.commissionId, [world.free]).unavailable;
    expect(chosen).toEqual(asTheEngineSeesIt(world));
  });

  it('still answers when the engine will not take a Party at all', () => {
    const world = fourStates();
    // A Commission that has left the Board is one of the two ways `proposeParty` refuses
    // the question; a Roster on which nobody is free is the other.
    expect(partyPreview(world.career, 'no-such-commission', []).unavailable).toEqual(
      asTheEngineSeesIt(world),
    );

    // Nobody free is the other: `proposeParty` never even gets asked, because `partyPreview`
    // now reads `unavailableAmong` directly (DL-18) — proved here against the engine's own
    // answer for this stranded Roster, not only against a hand-written expectation.
    const stranded = JSON.parse(JSON.stringify(world.career)) as Career;
    stranded.guild.roster[3]!.traits.push({
      name: 'Cracked rib',
      since: stranded.day,
      liftsOn: stranded.day + 20,
    });
    const { unavailable } = partyPreview(stranded, world.commissionId, []);
    expect(unavailable).toEqual(unavailableAmong(stranded));
    expect(unavailable).toEqual([
      { heroId: world.away, reason: 'away' },
      { heroId: world.both, reason: 'away' },
      { heroId: world.injured, reason: 'injured' },
      { heroId: world.free, reason: 'injured' },
    ]);
  });

  it('names no refusal until a refusing Hero has actually been chosen', () => {
    const world = fourStates();
    const career = JSON.parse(JSON.stringify(world.career)) as Career;
    const sour = career.guild.roster[3]!;
    sour.regardForGuildmaster = {
      value: career.config.refusalRegardThreshold,
      reason: 'you sent them anyway',
      nature: 'neutral',
    };

    // The only Hero free to be named is the one who refuses — and the preview still says
    // nothing about a refusal, because nobody has been put in the Party yet.
    expect(partyPreview(career, world.commissionId, []).refusals).toEqual([]);
    const chosen = partyPreview(career, world.commissionId, [sour.id]).refusals;
    expect(chosen.map((refusal) => refusal.heroId)).toEqual([sour.id]);
  });
});
