/**
 * E3-S2: Injuries lift on their own Day, and an injured Hero cannot be committed.
 *
 * `liftsOn` has been on `HeroTrait` since E1 and E1's own loop already removed a Trait
 * whose span was up (DL-09 §5). What E3 adds is the reporting — `InjuryLifted` alone,
 * never a paired `TraitLifted` — and the consequence: an injured Hero is off the list of
 * people who can be sent, and saying otherwise is refused with a typed error.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  availableHeroes,
  commitParty,
  EngineError,
  injuredHeroes,
  injuredUntil,
  isInjured,
  newCareer,
  proposeParty,
  serialiseCareer,
  type Career,
  type GameConfig,
  type GameEvent,
} from '../src/index.js';
import { hurt, oneVignetteContent } from './fixtures.js';

/**
 * The one-Vignette content, which carries two Injury Traits and three Scars — deep enough
 * for a test to hold two Injuries at once and prove they lift independently.
 */
const content = oneVignetteContent();
const plain = content;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** A Career sitting quietly on a given Day, with nothing else due to happen to it. */
function still(seed: string, config: Partial<GameConfig> = {}): Career {
  return newCareer(seed, content, {
    boardRefreshEveryDays: 1000,
    upkeepEveryDays: 1000,
    regardDecayEveryDays: 1000,
    ...config,
  }).career;
}

function rosterId(career: Career, index: number): string {
  const hero = career.guild.roster[index];
  if (hero === undefined) throw new Error(`the test expected a Hero at Roster place ${index}`);
  return hero.id;
}

function boardId(career: Career): string {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commission.id;
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

describe('an Injury lifting', () => {
  it('comes off on Day 60 when it was given on Day 40 with a span of 20, exactly once', () => {
    const opened = still('lift-40-20');
    const onDay40 = advance(opened, 39, content).career;
    expect(onDay40.day).toBe(40);

    const hero = rosterId(onDay40, 0);
    const injured = hurt(onDay40, hero, 'Bruised', 40, 60);
    expect(isInjured(injured.guild.roster[0] ?? { traits: [] } as never)).toBe(true);

    // Nineteen Days on, it is still borne and nothing has been said about it.
    const before = advance(injured, 19, content);
    expect(before.career.day).toBe(59);
    expect(of(before.events, 'InjuryLifted')).toHaveLength(0);
    expect(availableHeroes(before.career).map((entry) => entry.id)).not.toContain(hero);

    // On Day 60 it lifts, and says so once and once only.
    const onTheDay = advance(before.career, 1, content);
    expect(onTheDay.career.day).toBe(60);
    const lifted = of(onTheDay.events, 'InjuryLifted');
    expect(lifted).toHaveLength(1);
    expect(lifted[0]?.heroId).toBe(hero);
    expect(lifted[0]?.trait).toBe('Bruised');
    expect(lifted[0]?.day).toBe(60);
    expect(lifted[0]?.injuredOn).toBe(40);
    expect(lifted[0]?.daysBorne).toBe(20);

    // And never again, however long the Career runs on.
    const after = advance(onTheDay.career, 200, content);
    expect(of(after.events, 'InjuryLifted')).toHaveLength(0);
    expect(availableHeroes(onTheDay.career).map((entry) => entry.id)).toContain(hero);
  });

  it('reports InjuryLifted alone, and never a paired TraitLifted', () => {
    const opened = still('lift-no-pair');
    const injured = hurt(opened, rosterId(opened, 0), 'Bruised', 1, 5);
    const run = advance(injured, 10, content);
    expect(of(run.events, 'InjuryLifted')).toHaveLength(1);
    expect(of(run.events, 'TraitLifted')).toHaveLength(0);
  });

  it('lifts two Injuries independently, and neither frees the Hero while the other stands', () => {
    const opened = still('lift-two');
    const hero = rosterId(opened, 0);
    const injured = hurt(hurt(opened, hero, 'Bruised', 1, 11), hero, 'Cut hand', 1, 21);
    expect(injuredUntil(injured.guild.roster[0] ?? ({ traits: [] } as never))).toBe(21);

    const first = advance(injured, 10, content);
    expect(first.career.day).toBe(11);
    const lifted = of(first.events, 'InjuryLifted');
    expect(lifted).toHaveLength(1);
    expect(lifted[0]?.trait).toBe('Bruised');
    // Still hurt: the other one stands, so they are still off the list and still refused.
    expect(availableHeroes(first.career).map((entry) => entry.id)).not.toContain(hero);
    expect(injuredHeroes(first.career).map((entry) => entry.id)).toContain(hero);
    expect(
      rejection(() => commitParty(first.career, boardId(first.career), [hero], content)).code,
    ).toBe('HeroNotAvailable');

    const second = advance(first.career, 10, content);
    expect(second.career.day).toBe(21);
    const next = of(second.events, 'InjuryLifted');
    expect(next).toHaveLength(1);
    expect(next[0]?.trait).toBe('Cut hand');
    expect(availableHeroes(second.career).map((entry) => entry.id)).toContain(hero);
    expect(injuredHeroes(second.career)).toHaveLength(0);
  });

  it('leaves a Scar alone: a Trait with no span never lifts and never blocks anybody', () => {
    const opened = still('lift-never');
    const hero = rosterId(opened, 0);
    const scarred = { ...opened, guild: { ...opened.guild, roster: [...opened.guild.roster] } };
    const first = scarred.guild.roster[0];
    if (first === undefined) throw new Error('the test expected a Hero');
    scarred.guild.roster[0] = { ...first, traits: [...first.traits, { name: 'Limps', since: 1 }] };

    const run = advance(scarred, 500, content);
    expect(of(run.events, 'InjuryLifted')).toHaveLength(0);
    expect(of(run.events, 'TraitLifted')).toHaveLength(0);
    expect(availableHeroes(run.career).map((entry) => entry.id)).toContain(hero);
    expect(
      run.career.guild.roster.find((entry) => entry.id === hero)?.traits.map((held) => held.name),
    ).toContain('Limps');
  });
});

describe('an injured Hero cannot be committed', () => {
  it('is left out of availableHeroes and named by injuredHeroes', () => {
    const opened = still('cannot-commit');
    const hero = rosterId(opened, 0);
    const injured = hurt(opened, hero, 'Bruised', 1, 20);

    expect(availableHeroes(injured).map((entry) => entry.id)).toEqual(
      injured.guild.roster.map((entry) => entry.id).filter((id) => id !== hero),
    );
    expect(injuredHeroes(injured).map((entry) => entry.id)).toEqual([hero]);
    expect(injuredHeroes(opened)).toEqual([]);
  });

  it('is refused by commitParty with HeroNotAvailable, and the Career is untouched', () => {
    const opened = still('cannot-commit-throws');
    const hero = rosterId(opened, 0);
    const injured = hurt(opened, hero, 'Bruised', 1, 20);
    const before = serialiseCareer(injured);

    const error = rejection(() => commitParty(injured, boardId(injured), [hero], content));
    expect(error.code).toBe('HeroNotAvailable');
    expect(error.name).toBe('EngineError');
    expect(serialiseCareer(injured)).toBe(before);

    // And asking is refused for the same reason deciding is (E2's rule, kept).
    expect(rejection(() => proposeParty(injured, boardId(injured), [hero], content)).code).toBe(
      'HeroNotAvailable',
    );

    // Somebody who is not hurt still goes.
    const fine = commitParty(injured, boardId(injured), [rosterId(injured, 1)], content);
    expect(fine.career.parties).toHaveLength(1);
  });

  it('can be sent again on the very Day the Injury lifts', () => {
    const opened = still('commit-on-the-day');
    const hero = rosterId(opened, 0);
    const injured = hurt(opened, hero, 'Bruised', 1, 8);
    const run = advance(injured, 7, content);
    expect(run.career.day).toBe(8);
    expect(of(run.events, 'InjuryLifted')).toHaveLength(1);
    expect(commitParty(run.career, boardId(run.career), [hero], content).career.parties).toHaveLength(
      1,
    );
  });
});

describe('PartyProposal.unavailable', () => {
  it('names every Hero who cannot be sent, with the reason', () => {
    const opened = still('unavailable');
    const away = [rosterId(opened, 0), rosterId(opened, 1)];
    const sent = commitParty(opened, boardId(opened), away, content).career;
    const injured = hurt(sent, rosterId(sent, 2), 'Bruised', 1, 40);

    const second = injured.board[0];
    if (second === undefined) throw new Error('the test expected another Commission');
    const proposal = proposeParty(injured, second.id, [rosterId(injured, 3)], content);

    expect(proposal.unavailable).toEqual([
      { heroId: away[0], reason: 'away' },
      { heroId: away[1], reason: 'away' },
      { heroId: rosterId(injured, 2), reason: 'injured' },
    ]);
    // The whole Roster's unavailable members, not only the ones this proposal named.
    expect(proposal.heroIds).toEqual([rosterId(injured, 3)]);
  });

  it('is empty when everybody can go, and says away for a Hero who is both away and injured', () => {
    const opened = still('unavailable-both');
    expect(proposeParty(opened, boardId(opened), [rosterId(opened, 0)], content).unavailable).toEqual(
      [],
    );

    const hero = rosterId(opened, 0);
    const injured = hurt(opened, hero, 'Bruised', 1, 40);
    // Put the injured Hero out on work by hand, which is the only way to be both at once.
    const bothWays: Career = {
      ...injured,
      parties: [
        {
          id: 'p1.1',
          commissionId: 'made-up',
          commission: { ...(injured.board[0] ?? ({} as never)) },
          heroIds: [hero],
          backing: 0,
          departedOn: 1,
          returnsOn: 99,
          beatDays: [],
          beatsResolved: [],
          vignettesUsed: [],
          score: 0,
          decisionUsed: false,
          dcDelta: 0,
        },
      ],
    };
    const proposal = proposeParty(bothWays, boardId(bothWays), [rosterId(bothWays, 1)], content);
    expect(proposal.unavailable).toEqual([{ heroId: hero, reason: 'away' }]);
  });
});

describe('a Hero injured on the last Beat of a Commission', () => {
  it('is injured when they come home, not while they are away', () => {
    // Every Check fails and every failure injures, so the last Beat of the Commission is
    // certain to mark whoever took it.
    const opened = newCareer('hurt-on-the-last-beat', plain, {
      dcMin: 40,
      dcMax: 40,
      criticalMargin: 100,
      injuryChanceOnFailure: 1,
      injurySpanMin: 40,
      injurySpanMax: 40,
      commissionSpanMin: 5,
      commissionSpanMax: 5,
      beatsMin: 2,
      beatsMax: 2,
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    });
    const commission = opened.career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    const hero = rosterId(opened.career, 0);
    const sent = commitParty(opened.career, commission.id, [hero], plain).career;

    const run = advance(sent, 5, plain);
    const home = of(run.events, 'PartyReturned');
    expect(home).toHaveLength(1);
    expect(home[0]?.heroIds).toContain(hero);

    // While they were away they were unavailable because they were away; now they are
    // home they are unavailable because they are hurt, and the Injury is still running.
    expect(run.career.parties).toHaveLength(0);
    expect(isInjured(run.career.guild.roster.find((entry) => entry.id === hero) ?? ({} as never))).toBe(
      true,
    );
    expect(availableHeroes(run.career).map((entry) => entry.id)).not.toContain(hero);
    expect(injuredHeroes(run.career).map((entry) => entry.id)).toContain(hero);
    expect(rejection(() => commitParty(run.career, boardId(run.career), [hero], plain)).code).toBe(
      'HeroNotAvailable',
    );
  });
});
