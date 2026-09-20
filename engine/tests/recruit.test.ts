/**
 * E4-S3: accept and decline. Taking somebody on pays a fee and produces a Hero; sending
 * them away costs nothing but the Upkeep you did not take on. Every rejection leaves the
 * Career byte-identical, which is the promise `improveHall` already makes (E3-S4).
 */

import { describe, expect, it } from 'vitest';
import { advance, upkeepDue } from '../src/career.js';
import {
  acceptApplicant,
  acceptRefusal,
  applicantById,
  applicantOffers,
  declineApplicant,
  REASON_TAKEN_ON,
} from '../src/applicant.js';
// Moved to `rival.ts` in E5, where `moveHero` — the one place any Roster gains anybody —
// now seeds it. Same constant, same value; only the file it lives in changed.
import { REASON_NEW_TO_THE_GUILD } from '../src/rival.js';
import type { GameConfig } from '../src/config.js';
import { EngineError } from '../src/errors.js';
import type { GameEvent } from '../src/events.js';
import { serialiseCareer } from '../src/save.js';
import type { Applicant, Career } from '../src/types.js';
import { newCareer } from '../src/world.js';
import { deepFreeze, fixtureContent, holdingCoin, patronsThinking } from './fixtures.js';

const content = fixtureContent;
const RICH: Partial<GameConfig> = { startingCoin: 1_000_000 };

/** A Career with a batch of Applicants waiting and coin enough to take any of them. */
function withApplicants(seed: string, config?: Partial<GameConfig>): Career {
  const opened = patronsThinking(newCareer(seed, content, { ...RICH, ...config }).career, 5);
  const run = advance(opened, 10, content);
  if (run.career.applicants.length === 0) throw new Error('the test expected a batch');
  return run.career;
}

function first(career: Career): Applicant {
  const applicant = career.applicants[0];
  if (applicant === undefined) throw new Error('the test expected an Applicant');
  return applicant;
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

describe('accepting an Applicant', () => {
  const career = withApplicants('accept');
  const applicant = first(career);
  const step = acceptApplicant(career, applicant.id);
  const joined = step.career.guild.roster.find((hero) => hero.id === applicant.id);

  it('produces a Hero with the same id, name, Stats, Traits, Background and age', () => {
    expect(joined, 'the Applicant should be on the Roster').toBeDefined();
    expect(joined?.id).toBe(applicant.id);
    expect(joined?.name).toBe(applicant.name);
    expect(joined?.pronouns).toBe(applicant.pronouns);
    expect(joined?.stats).toEqual(applicant.stats);
    expect(joined?.background).toBe(applicant.background);
    expect(joined?.traits).toEqual(applicant.traits);
    expect(joined?.age).toBe(applicant.age);
    // Nothing anywhere carries a flag saying which of the two they are (ADR-0003).
    expect(Object.keys(joined ?? {})).not.toContain('isApplicant');
    expect(joined?.formerHeroId).toBeUndefined();
  });

  it('sets the three Days and the Regard the Career starts them on', () => {
    expect(joined?.joinedOn).toBe(step.career.day);
    expect(joined?.lastCommittedOn).toBe(step.career.day);
    expect(joined?.regardDecayedOn).toBe(step.career.day);
    expect(joined?.regardForGuildmaster.value).toBe(step.career.config.joiningRegard);
    expect(joined?.regardForGuildmaster.reason).toBe(REASON_TAKEN_ON);
    expect(joined?.regardForGuildmaster.nature).toBe('neutral');
  });

  it('takes them out of the batch and puts them on the Roster exactly once', () => {
    expect(step.career.applicants.map((entry) => entry.id)).not.toContain(applicant.id);
    expect(applicantById(step.career, applicant.id)).toBeUndefined();
    expect(step.career.guild.roster.filter((hero) => hero.id === applicant.id)).toHaveLength(1);
    expect(step.career.guild.roster).toHaveLength(career.guild.roster.length + 1);
    expect(step.career.ledger.applicantsAccepted).toBe(1);
  });

  it('seeds Regard both ways in the same step, for every Hero already on the Roster', () => {
    const neutral = step.career.config.joiningRegardAmongHeroes;
    for (const hero of career.guild.roster) {
      const theirs = joined?.regardFor[hero.id];
      expect(theirs, `the newcomer's Regard for ${hero.id}`).toEqual({
        value: neutral,
        reason: REASON_NEW_TO_THE_GUILD,
        nature: 'neutral',
      });
      const ours = step.career.guild.roster.find((entry) => entry.id === hero.id)?.regardFor[
        applicant.id
      ];
      expect(ours, `${hero.id}'s Regard for the newcomer`).toEqual({
        value: neutral,
        reason: REASON_NEW_TO_THE_GUILD,
        nature: 'neutral',
      });
      // And what they already thought of one another is untouched.
      const before = career.guild.roster.find((entry) => entry.id === hero.id);
      for (const [id, regard] of Object.entries(before?.regardFor ?? {})) {
        expect(
          step.career.guild.roster.find((entry) => entry.id === hero.id)?.regardFor[id],
        ).toEqual(regard);
      }
    }
    // The Guildmaster's own map gains an entry too, so none of them is left with a hole.
    expect(step.career.guild.guildmaster.regardFor[applicant.id]?.reason).toBe(
      REASON_NEW_TO_THE_GUILD,
    );
  });

  it('reports the offer taken, then the coin, then the Roster gaining a person', () => {
    expect(step.events.map((event) => event.type)).toEqual([
      'ApplicantAccepted',
      'CoinChanged',
      'HeroJoined',
    ]);
    const [accepted, coin, joinedEvent] = step.events;
    if (accepted?.type !== 'ApplicantAccepted') throw new Error('the first event is the offer');
    if (coin?.type !== 'CoinChanged') throw new Error('the second event is the coin');
    if (joinedEvent?.type !== 'HeroJoined') throw new Error('the third event is the Roster');

    expect(accepted.applicantId).toBe(applicant.id);
    expect(accepted.heroId).toBe(applicant.id);
    expect(accepted.fee).toBe(applicant.askingFee);
    expect(accepted.calibre).toBe(applicant.calibre);
    expect(coin.reason).toBe('recruitment');
    expect(coin.delta).toBe(-applicant.askingFee);
    expect(coin.balance).toBe(career.guild.coin - applicant.askingFee);
    expect(joinedEvent.heroId).toBe(applicant.id);
    expect(joinedEvent.name).toBe(applicant.name);
    expect(joinedEvent.calibre).toBe(applicant.calibre);
    expect(joinedEvent.age).toBe(applicant.age);
    expect(joinedEvent.formerHeroId).toBeUndefined();
    for (const event of step.events) expect(event.day).toBe(career.day);
  });

  it('pays the asking fee and nothing else', () => {
    expect(step.career.guild.coin).toBe(career.guild.coin - applicant.askingFee);
  });

  it('does not touch the Career it was given', () => {
    const frozen = deepFreeze(withApplicants('accept-frozen'));
    const before = serialiseCareer(frozen);
    acceptApplicant(frozen, first(frozen).id);
    declineApplicant(frozen, first(frozen).id);
    acceptRefusal(frozen, first(frozen).id);
    applicantOffers(frozen);
    expect(serialiseCareer(frozen)).toBe(before);
  });

  it('is felt at the next Upkeep, which is larger for the larger Roster', () => {
    const { upkeepPerHero } = career.config;
    expect(upkeepDue(step.career)).toBe(upkeepDue(career) + upkeepPerHero);

    const owed = advance(step.career, career.config.upkeepEveryDays, content).events.filter(
      (event): event is Extract<GameEvent, { type: 'UpkeepOwed' }> => event.type === 'UpkeepOwed',
    );
    expect(owed.length).toBeGreaterThan(0);
    expect(owed[0]?.amount).toBe(upkeepDue(step.career));
    expect(owed[0]?.amount).toBe(upkeepDue(career) + upkeepPerHero);
  });
});

describe('an offer that cannot be taken', () => {
  it('throws RosterFull at the cap, and leaves the Career byte-identical', () => {
    const career = withApplicants('roster-full', { rosterCap: 4 });
    expect(career.guild.roster).toHaveLength(4);
    const before = serialiseCareer(career);
    const error = rejection(() => acceptApplicant(career, first(career).id));
    expect(error.code).toBe('RosterFull');
    expect(serialiseCareer(career)).toBe(before);

    // One place free, and the same offer goes through.
    const room = withApplicants('roster-full', { rosterCap: 5 });
    expect(() => acceptApplicant(room, first(room).id)).not.toThrow();
  });

  it('throws InsufficientCoin one coin short, and leaves the Career byte-identical', () => {
    const career = withApplicants('poor');
    const applicant = first(career);
    const short = holdingCoin(career, applicant.askingFee - 1);
    const before = serialiseCareer(short);
    expect(rejection(() => acceptApplicant(short, applicant.id)).code).toBe('InsufficientCoin');
    expect(serialiseCareer(short)).toBe(before);

    const exact = holdingCoin(career, applicant.askingFee);
    const step = acceptApplicant(exact, applicant.id);
    expect(step.career.guild.coin).toBe(0);
  });

  it('throws NoSuchApplicant for an id nobody is waiting under', () => {
    const career = withApplicants('unknown');
    expect(rejection(() => acceptApplicant(career, 'nobody')).code).toBe('NoSuchApplicant');
    expect(rejection(() => declineApplicant(career, 'nobody')).code).toBe('NoSuchApplicant');
    // A Hero's own id is not an Applicant's.
    const hero = career.guild.roster[0]?.id ?? '';
    expect(rejection(() => acceptApplicant(career, hero)).code).toBe('NoSuchApplicant');
  });

  it('throws NoSuchApplicant for somebody who has already given up waiting', () => {
    const career = withApplicants('expired');
    const applicant = first(career);
    const later = advance(career, career.config.applicantLingerDays, content).career;
    expect(later.day).toBeGreaterThanOrEqual(applicant.expiresOn);
    expect(applicantById(later, applicant.id)).toBeUndefined();
    expect(rejection(() => acceptApplicant(later, applicant.id)).code).toBe('NoSuchApplicant');
    expect(rejection(() => declineApplicant(later, applicant.id)).code).toBe('NoSuchApplicant');
  });

  it('throws CareerEnded once there is no Career left to join', () => {
    const career = withApplicants('over', { careerYears: 1, daysPerYear: 20 });
    const applicant = first(career);
    const ended = advance(career, 100, content).career;
    expect(ended.ended).toBeDefined();
    expect(rejection(() => acceptApplicant(ended, applicant.id)).code).toBe('CareerEnded');
    expect(rejection(() => declineApplicant(ended, applicant.id)).code).toBe('CareerEnded');
  });
});

describe('acceptRefusal and applicantOffers', () => {
  it('answer with the very code the call would throw, and with the shortfall', () => {
    const career = withApplicants('refusal');
    const applicant = first(career);
    expect(acceptRefusal(career, applicant.id)).toBeUndefined();
    expect(acceptRefusal(career, 'nobody')).toEqual({ code: 'NoSuchApplicant' });

    const short = holdingCoin(career, applicant.askingFee - 12);
    expect(acceptRefusal(short, applicant.id)).toEqual({
      code: 'InsufficientCoin',
      shortfall: 12,
    });
    expect(rejection(() => acceptApplicant(short, applicant.id)).code).toBe('InsufficientCoin');

    const full = withApplicants('refusal', { rosterCap: 4 });
    expect(acceptRefusal(full, first(full).id)).toEqual({ code: 'RosterFull' });

    const ended = advance(
      withApplicants('refusal-ended', { careerYears: 1, daysPerYear: 20 }),
      100,
      content,
    ).career;
    expect(acceptRefusal(ended, 'anything')).toEqual({ code: 'CareerEnded' });
  });

  it('list every Applicant with the Days they have left', () => {
    const career = withApplicants('offers');
    const offers = applicantOffers(career);
    expect(offers).toHaveLength(career.applicants.length);
    for (const offer of offers) {
      expect(offer.daysLeft).toBe(offer.applicant.expiresOn - career.day);
      expect(offer.daysLeft).toBeGreaterThan(0);
      expect(offer.refusal).toBeUndefined();
    }

    // On the Day before they give up, the batch that arrived first has one Day left; the
    // batches that have arrived since have their own, longer, clocks.
    const applicant = first(career);
    const nearly = advance(career, applicant.expiresOn - 1 - career.day, content).career;
    const offer = applicantOffers(nearly).find((entry) => entry.applicant.id === applicant.id);
    expect(offer?.daysLeft).toBe(1);
    const gone = advance(nearly, 1, content).career;
    expect(applicantOffers(gone).map((entry) => entry.applicant.id)).not.toContain(applicant.id);
  });
});

describe('declining an Applicant', () => {
  const career = withApplicants('decline');
  const applicant = first(career);
  const step = declineApplicant(career, applicant.id);

  it('sends them away and says the player did it', () => {
    expect(step.events).toEqual([
      {
        type: 'ApplicantDeclined',
        day: career.day,
        applicantId: applicant.id,
        name: applicant.name,
        reason: 'player',
      },
    ]);
    expect(applicantById(step.career, applicant.id)).toBeUndefined();
    expect(step.career.applicants).toHaveLength(career.applicants.length - 1);
  });

  it('costs nothing at all', () => {
    expect(step.career.guild.coin).toBe(career.guild.coin);
    expect(step.career.guild.roster).toEqual(career.guild.roster);
    expect(step.career.ledger).toEqual(career.ledger);
    expect(upkeepDue(step.career)).toBe(upkeepDue(career));
  });

  it('leaves the rest of the batch exactly where it was', () => {
    expect(step.career.applicants).toEqual(
      career.applicants.filter((entry) => entry.id !== applicant.id),
    );
  });
});

describe('the Roster cap', () => {
  it('is never exceeded, however many offers are taken', () => {
    let career = withApplicants('cap', { rosterCap: 6 });
    for (let round = 0; round < 40; round += 1) {
      for (const applicant of [...career.applicants]) {
        if (acceptRefusal(career, applicant.id) !== undefined) continue;
        career = acceptApplicant(career, applicant.id).career;
      }
      expect(career.guild.roster.length).toBeLessThanOrEqual(career.config.rosterCap);
      career = advance(career, 10, content).career;
      if (career.ended !== undefined) break;
    }
    expect(career.guild.roster.length).toBe(6);
  });
});

/**
 * ADR-0003, and E4's definition of done: an Applicant is a distinct type from a Hero.
 * This is a type-level test as much as a runtime one — the `@ts-expect-error` lines fail
 * the build the moment the two shapes become assignable to one another.
 */
describe('an Applicant is not a Hero', () => {
  const career = withApplicants('distinct');
  const applicant = first(career);
  const hero = career.guild.roster[0];

  it('carries none of the fields only somebody on the Roster can have', () => {
    for (const field of [
      'regardForGuildmaster',
      'regardFor',
      'joinedOn',
      'lastCommittedOn',
      'regardDecayedOn',
      'exit',
    ]) {
      expect(Object.keys(applicant), field).not.toContain(field);
    }
    expect(Object.keys(applicant).sort()).toEqual(
      [
        'age',
        'arrivedOn',
        'askingFee',
        'background',
        'calibre',
        'expiresOn',
        'id',
        'name',
        'pronouns',
        'stats',
        'traits',
      ].sort(),
    );
  });

  it('has no flag anywhere saying which of the two it is', () => {
    const everything = JSON.stringify(career);
    expect(everything).not.toContain('isApplicant');
    expect(everything).not.toContain('"applicant":true');
    for (const value of Object.values(applicant)) expect(typeof value).not.toBe('boolean');
  });

  it('does not type-check as one, in either direction', () => {
    if (hero === undefined) throw new Error('the test expected a Hero');
    // @ts-expect-error an Applicant has no Regard for the Guildmaster and never will
    const notAHero: typeof hero = applicant;
    // @ts-expect-error a Hero has no asking fee and no Day they give up waiting
    const notAnApplicant: Applicant = hero;
    expect(notAHero.id).toBe(applicant.id);
    expect(notAnApplicant.id).toBe(hero.id);
  });
});
