/**
 * E3's gate: *a Career runs to Retirement in which a Hero is injured and recovers, a Hero
 * is scarred and keeps working, and a Hero retires by age.*
 *
 * Nothing here is arranged. The Career is opened from a seed with the shipped defaults,
 * played to its end through the public API, and the only thing the policy does that E2's
 * did not is improve the Hall when it can comfortably afford to — which is what a player
 * would do, and what keeps an injured Roster from being the whole of a twenty-year story.
 *
 * Beneath the gate is the smoke run the epic's risk table asks for (E3 §5): two hundred
 * Careers, checked for a Hero stuck injured for ever and for the death spiral.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  isInjured,
  newCareer,
  proposeParty,
  type Career,
  type GameEvent,
  type Hero,
} from '../src/index.js';
import { fixtureContent } from './fixtures.js';

const strength = (hero: Hero): number =>
  hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;

/**
 * The best available Heroes to the best-paying work, two at a time, buying a Hall
 * improvement whenever there is comfortably enough coin for one. It never insists: the
 * Regard it moves is only ever moved by work and by neglect. `availableHeroes` is what
 * keeps it from committing anybody who is hurt, so the policy needs no rule of its own.
 */
function playBuyingTheHall(start: Career): { career: Career; events: GameEvent[] } {
  let career = start;
  const events: GameEvent[] = [];
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the policy never reached the end of the Career');

    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
        continue;
      }
      const bought = improveHall(career, improvement);
      career = bought.career;
      events.push(...bought.events);
    }

    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          left.map((hero) => hero.id),
          fixtureContent,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, fixtureContent);
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }

    const step = advanceUntilAttention(career, fixtureContent);
    career = step.career;
    events.push(...step.events);
  }
  return { career, events };
}

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

describe('the E3 gate, on one fixed seed', () => {
  const run = playBuyingTheHall(newCareer('e3-gate-14', fixtureContent).career);

  it('reaches Retirement rather than insolvency', () => {
    expect(run.career.ended?.reason).toBe('retirement');
    expect(run.career.day).toBe(run.career.config.careerYears * run.career.config.daysPerYear + 1);
  });

  it('injures a Hero, who recovers and is available again', () => {
    const injured = of(run.events, 'HeroInjured');
    const lifted = of(run.events, 'InjuryLifted');
    expect(injured.length).toBeGreaterThan(0);

    const recovered = injured.filter((hurt) =>
      lifted.some(
        (clear) => clear.heroId === hurt.heroId && clear.trait === hurt.trait && clear.day >= hurt.liftsOn,
      ),
    );
    expect(recovered.length).toBeGreaterThan(0);

    // The whole arc on one of them: hurt, off the list of people who can be sent, then
    // clear of it and sent out again.
    const one = recovered[0];
    if (one === undefined) throw new Error('the test expected a recovered Hero');
    const clear = lifted.find(
      (event) => event.heroId === one.heroId && event.trait === one.trait && event.day >= one.liftsOn,
    );
    expect(clear?.daysBorne).toBe((clear?.day ?? 0) - one.day);
    expect(
      run.events.some(
        (event) =>
          event.type === 'PartyCommitted' &&
          event.day > (clear?.day ?? 0) &&
          event.heroIds.includes(one.heroId),
      ),
      'they took work again once the Injury had lifted',
    ).toBe(true);
  });

  it('scars a Hero, who keeps working', () => {
    const scarred = of(run.events, 'HeroScarred');
    expect(scarred.length).toBeGreaterThan(0);

    const kept = scarred.filter((scar) =>
      run.events.some(
        (event) =>
          event.type === 'PartyCommitted' && event.day > scar.day && event.heroIds.includes(scar.heroId),
      ),
    );
    expect(kept.length).toBeGreaterThan(0);

    // And the Scar never lifted: it is still on them, or on the record of them.
    const one = kept[0];
    if (one === undefined) throw new Error('the test expected a scarred Hero');
    expect(of(run.events, 'InjuryLifted').some((event) => event.trait === one.trait)).toBe(false);
    const person =
      run.career.guild.roster.find((hero) => hero.id === one.heroId) ??
      run.career.guild.formerHeroes.find((hero) => hero.id === one.heroId);
    expect(person?.traits.map((trait) => trait.name)).toContain(one.trait);
    expect(person?.traits.find((trait) => trait.name === one.trait)?.liftsOn).toBeUndefined();
  });

  it('retires a Hero by age, and it is not counted as a loss', () => {
    const retired = of(run.events, 'HeroRetired');
    expect(retired.length).toBeGreaterThan(0);

    const one = retired[0];
    if (one === undefined) throw new Error('the test expected a retired Hero');
    expect(one.age).toBeGreaterThanOrEqual(run.career.config.heroRetirementAge);
    expect(one.yearsServed).toBeGreaterThan(0);

    const person = run.career.guild.formerHeroes.find((hero) => hero.id === one.heroId);
    expect(person?.exit?.kind).toBe('retirement');
    expect(person?.exit?.onDay).toBe(one.day);
    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain(one.heroId);

    const end = run.career.ended;
    expect(end?.reckoning.heroesRetired).toBe(
      run.career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'retirement').length,
    );
    expect(end?.reckoning.heroesLost).toBe(
      run.career.guild.formerHeroes.filter((hero) => hero.exit?.kind !== 'retirement').length,
    );
    expect(run.career.ledger.heroesRetired).toBe(end?.reckoning.heroesRetired);
  });

  it('counts what happened in the ledger, and nobody is in two places at once', () => {
    const { ledger } = run.career;
    expect(ledger.heroesInjured).toBe(of(run.events, 'HeroInjured').length);
    expect(ledger.heroesScarred).toBe(of(run.events, 'HeroScarred').length);
    expect(ledger.heroesDied).toBe(of(run.events, 'HeroDied').length);
    // `HeroRetired` fires for a Rival's Hero too from E5, by the same rule and at the
    // same age (E5-S1), and `ledger.heroesRetired` counts Heroes who retired out of the
    // PLAYER's Roster — somebody else's people are not that. So the comparison is scoped
    // to the ones who are in this Guild's own history, which is a sharper claim than
    // counting every Retirement in the world and calling it the Guild's.
    const oursRetired = of(run.events, 'HeroRetired').filter((event) =>
      run.career.guild.formerHeroes.some(
        (hero) => hero.id === event.heroId && hero.exit?.kind === 'retirement',
      ),
    );
    expect(ledger.heroesRetired).toBe(oursRetired.length);

    const onRoster = new Set(run.career.guild.roster.map((hero) => hero.id));
    const gone = run.career.guild.formerHeroes.map((hero) => hero.id);
    expect(gone.filter((id) => onRoster.has(id))).toEqual([]);
    expect(new Set(gone).size).toBe(gone.length);
    for (const hero of run.career.guild.formerHeroes) {
      expect(['departure', 'death', 'retirement']).toContain(hero.exit?.kind);
    }
  });
});

describe('two hundred Careers under harm', () => {
  it(
    'leaves nobody injured for ever, and most of them still reach ten years',
    () => {
      const exits = { departure: 0, death: 0, retirement: 0 };
      const seedsWithAllThree: string[] = [];
      let reachedTenYears = 0;
      let everInjured = 0;
      let everScarred = 0;

      for (let seed = 0; seed < 200; seed += 1) {
        const name = `e3-smoke-${seed}`;
        const run = playBuyingTheHall(newCareer(name, fixtureContent).career);
        const { career } = run;
        expect(career.ended, name).toBeDefined();
        if (career.ended === undefined) continue;

        // Nobody is stuck injured for ever. Two ways of saying it, both checked: no Hero
        // left on the Roster is carrying an Injury whose Day has already come, and every
        // Injury given long enough ago to have run its span either lifted or its bearer
        // left the Roster before it could.
        for (const hero of career.guild.roster) {
          for (const trait of hero.traits) {
            if (trait.liftsOn === undefined) continue;
            expect(trait.liftsOn, `${name}: ${hero.id} is stuck with ${trait.name}`).toBeGreaterThan(
              career.day,
            );
          }
        }
        const lifted = of(run.events, 'InjuryLifted');
        for (const hurt of of(run.events, 'HeroInjured')) {
          if (hurt.liftsOn > career.day) continue;
          const cleared = lifted.some(
            (event) => event.heroId === hurt.heroId && event.trait === hurt.trait && event.day >= hurt.liftsOn,
          );
          const left = career.guild.formerHeroes.find((hero) => hero.id === hurt.heroId);
          const wentFirst = left !== undefined && (left.exit?.onDay ?? Infinity) <= hurt.liftsOn;
          expect(
            cleared || wentFirst,
            `${name}: ${hurt.heroId} never got clear of ${hurt.trait}`,
          ).toBe(true);
        }

        // Injuries lift deterministically from the seed: the same Career played twice
        // clears the same Injuries on the same Days.
        if (seed < 5) {
          const again = playBuyingTheHall(newCareer(name, fixtureContent).career);
          expect(
            of(again.events, 'InjuryLifted').map((event) => `${event.day}:${event.heroId}:${event.trait}`),
            name,
          ).toEqual(lifted.map((event) => `${event.day}:${event.heroId}:${event.trait}`));
        }

        const years = (career.ended.onDay - 1) / career.config.daysPerYear;
        if (years >= 10) reachedTenYears += 1;
        if (career.ledger.heroesInjured > 0) everInjured += 1;
        if (career.ledger.heroesScarred > 0) everScarred += 1;

        const kinds = new Set<string>();
        for (const hero of career.guild.formerHeroes) {
          const kind = hero.exit?.kind;
          expect(kind, `${name}: a former Hero with no exit`).toBeDefined();
          if (kind === undefined) continue;
          exits[kind] += 1;
          kinds.add(kind);
        }
        if (kinds.size === 3) seedsWithAllThree.push(name);

        // The reckoning agrees with the Roster it was built from.
        expect(career.ended.reckoning.heroesOnRoster, name).toBe(career.guild.roster.length);
        expect(career.ended.reckoning.heroesLost, name).toBe(
          career.guild.formerHeroes.filter((hero) => hero.exit?.kind !== 'retirement').length,
        );
        expect(career.ended.reckoning.heroesRetired, name).toBe(
          career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'retirement').length,
        );
      }

      // The death-spiral guard the epic's risk table asks for (E3 §5).
      expect(reachedTenYears / 200).toBeGreaterThan(0.5);
      // Harm is common enough to be the thing the epic is about.
      expect(everInjured / 200).toBeGreaterThan(0.9);
      expect(everScarred / 200).toBeGreaterThan(0.5);
      // Both of E3's own ways out of the Roster are seen across the fleet. Departure is
      // not asserted here: this policy never insists, so it walks a Hero out about once
      // in two hundred Careers, and an assertion on that would be a coin toss. E2 proves
      // Departure deterministically in `departure.test.ts`; what is checked here is that
      // every exit found carries one of the three kinds, which the loop above does.
      expect(exits.death).toBeGreaterThan(0);
      expect(exits.retirement).toBeGreaterThan(0);
      expect(exits.departure + exits.death + exits.retirement).toBeGreaterThan(0);
      // The one acceptance box E3 does not meet (E3-S3), pinned at what it measures
      // rather than at what was hoped for. Under this policy a Career sees a Death about
      // one time in ten and a Departure about one in a hundred and twenty, so all three
      // kinds together is rarer than one seed in two hundred. Pinned so that a change
      // which makes it reachable fails here and is looked at, rather than passing an
      // assertion that could never have failed.
      expect(seedsWithAllThree, seedsWithAllThree.join(', ')).toHaveLength(0);
    },
    600_000,
  );
});

describe('a Roster that runs out of people', () => {
  it('is survivable: the Career runs on and reaches an ending', () => {
    // Everybody is already old enough to retire, so the Roster empties at the first Board
    // refresh and the Career has to carry on without anybody at all.
    const opened = newCareer('e3-empty-roster', fixtureContent, {
      careerYears: 2,
      daysPerYear: 120,
    }).career;
    const everybody: Career = {
      ...opened,
      guild: {
        ...opened.guild,
        roster: opened.guild.roster.map((hero) => ({
          ...hero,
          age: opened.config.heroRetirementAge,
        })),
      },
    };
    const run = playBuyingTheHall(everybody);
    expect(run.career.guild.roster).toHaveLength(0);
    expect(run.career.ended).toBeDefined();
    expect(of(run.events, 'HeroRetired')).toHaveLength(opened.config.startingHeroes);
    expect(run.career.ended?.reckoning.heroesOnRoster).toBe(0);
    expect(run.career.ended?.reckoning.heroesRetired).toBe(opened.config.startingHeroes);
    expect(run.career.ended?.reckoning.heroesLost).toBe(0);
    // Nobody is left, so nobody is hurt, and Upkeep has fallen to the base.
    expect(run.career.guild.roster.filter(isInjured)).toEqual([]);
    expect(of(run.events, 'UpkeepOwed').at(-1)?.amount).toBe(opened.config.upkeepBase);
  });
});
