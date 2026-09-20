/**
 * DL-16 §5's gap, closed (DL-23 §10). Until E6 nothing gave a Hero a timed Trait that was
 * not an Injury, so `liftsOn` alone was the whole of the test; a Decision's option can, and
 * its holder must stay committable, must not be labelled injured by either front end, and
 * must lift as `TraitLifted` rather than `InjuryLifted`.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  answerParty,
  availableHeroes,
  commitParty,
  deserialiseCareer,
  injuredHeroes,
  injuredUntil,
  isInjured,
  isInjuryTrait,
  poachHero,
  serialiseCareer,
  unavailableAmong,
  type Career,
  type Hero,
} from '../src/index.js';
import { aPartyWaiting, decisionContent, edit, of, steadyingContent } from './e6-fixtures.js';

/** A Career in which one Hero carries a timed Trait that is not an Injury, given by play. */
function carrying(seed: string): { career: Career; hero: Hero; liftsOn: number } {
  const found = aPartyWaiting(seed, steadyingContent, { decisionChancePerBeat: 1 });
  const step = answerParty(found.career, found.party.id, 'press-on', steadyingContent);
  const given = of(step.events, 'TraitGained').find((event) => event.trait === 'Steady');
  if (given?.liftsOn === undefined) throw new Error('the test expected a timed Trait to be given');
  // The Party is still away, so bring it home before asking who can be sent. The span is
  // long enough that the Trait is still being carried when they walk through the door.
  let home = step.career;
  for (let day = 0; day < 60 && home.parties.length > 0; day += 1) {
    home = advance(home, 1, steadyingContent).career;
  }
  const hero = home.guild.roster.find((entry) => entry.id === given.heroId);
  if (hero === undefined) throw new Error('the Hero who took it left the Roster');
  return { career: home, hero, liftsOn: given.liftsOn };
}

describe('a timed Trait that is not an Injury', () => {
  const { career, hero, liftsOn } = carrying('tt-basic');
  const held = hero.traits.find((trait) => trait.name === 'Steady');

  it('is given with the kind its TraitDef declares, and the Day it lifts', () => {
    expect(held?.liftsOn).toBe(liftsOn);
    expect(held?.kind).toBe('disposition');
    expect(liftsOn).toBeGreaterThan(career.day - 40);
  });

  it('is not an Injury to any of the five readers', () => {
    expect(isInjuryTrait(held ?? { name: 'x', since: 0 })).toBe(false);
    expect(isInjured(hero)).toBe(false);
    expect(injuredUntil(hero)).toBeUndefined();
    expect(injuredHeroes(career).map((entry) => entry.id)).not.toContain(hero.id);
    expect(unavailableAmong(career).map((entry) => entry.heroId)).not.toContain(hero.id);
  });

  it('does not stop its holder being sent out', () => {
    expect(availableHeroes(career).map((entry) => entry.id)).toContain(hero.id);
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    expect(() => commitParty(career, commission.id, [hero.id], steadyingContent)).not.toThrow();
  });

  it('lifts as TraitLifted rather than InjuryLifted, on its own Day', () => {
    const run = advance(career, liftsOn - career.day, steadyingContent);
    const lifted = of(run.events, 'TraitLifted').filter((event) => event.heroId === hero.id);
    expect(lifted.map((event) => event.trait)).toEqual(['Steady']);
    expect(lifted[0]?.day).toBe(liftsOn);
    expect(of(run.events, 'InjuryLifted').filter((event) => event.heroId === hero.id)).toEqual([]);
    expect(
      run.career.guild.roster
        .find((entry) => entry.id === hero.id)
        ?.traits.some((trait) => trait.name === 'Steady'),
    ).toBe(false);
  });

  it('keeps its kind through a save and a load', () => {
    const loaded = deserialiseCareer(serialiseCareer(career), steadyingContent);
    const back = loaded.guild.roster.find((entry) => entry.id === hero.id);
    expect(back?.traits.find((trait) => trait.name === 'Steady')?.kind).toBe('disposition');
    expect(isInjured(back ?? hero)).toBe(false);
    expect(loaded).toEqual(career);
  });

  it('keeps its kind when the person crosses to another Roster', () => {
    // `moveHero` carries `traits` with `liftsOn` intact, and now with the kind (DL-22).
    const takeable = edit(career, (draft) => {
      draft.guild.coin = 100_000;
      const one = draft.guild.roster.find((entry) => entry.id === hero.id);
      if (one !== undefined) {
        one.regardForGuildmaster = {
          ...one.regardForGuildmaster,
          value: draft.config.poachRegardThreshold,
        };
      }
    });
    // Poaching runs the other way, so put them on a Rival's Roster and take them back.
    const rival = takeable.rivals[0];
    const theirs = rival?.roster[0];
    if (rival === undefined || theirs === undefined) throw new Error('expected a Rival with people');
    const staged = edit(takeable, (draft) => {
      const them = draft.rivals[0]?.roster[0];
      if (them !== undefined) {
        them.traits = [{ name: 'Steady', since: 1, liftsOn: 400, kind: 'disposition' }];
        them.regardForRival = { ...them.regardForRival, value: draft.config.poachRegardThreshold };
      }
    });
    const taken = poachHero(staged, rival.id, theirs.id);
    const moved = taken.career.guild.roster.find((entry) => entry.id === theirs.id);
    const carried = moved?.traits.find((trait) => trait.name === 'Steady');
    expect(carried?.liftsOn).toBe(400);
    expect(carried?.kind).toBe('disposition');
    expect(isInjured(moved ?? hero)).toBe(false);
  });
});

describe('an Injury is still an Injury', () => {
  it('carries kind "injury" when the engine gives it, and still stops its holder working', () => {
    let checked = 0;
    for (let seed = 0; seed < 20 && checked === 0; seed += 1) {
      const found = aPartyWaiting(`tt-injury-${String(seed)}`, decisionContent, {
        decisionChancePerBeat: 1,
        injuryChanceOnFailure: 1,
        injurySpanMin: 200,
        injurySpanMax: 200,
      });
      const step = answerParty(found.career, found.party.id, 'press-on', decisionContent);
      const hurt = of(step.events, 'HeroInjured')[0];
      if (hurt === undefined) continue;
      let home = step.career;
      for (let day = 0; day < 60 && home.parties.length > 0; day += 1) {
        home = advance(home, 1, decisionContent).career;
      }
      const hero = home.guild.roster.find((entry) => entry.id === hurt.heroId);
      if (hero === undefined) continue;
      checked += 1;
      const held = hero.traits.find((trait) => trait.name === hurt.trait);
      expect(held?.kind).toBe('injury');
      expect(isInjured(hero)).toBe(true);
      expect(injuredUntil(hero)).toBe(hurt.liftsOn);
      expect(availableHeroes(home).map((entry) => entry.id)).not.toContain(hero.id);
    }
    expect(checked, 'no seed produced an Injury to examine').toBe(1);
  });

  it('is what a timed Trait carrying no kind at all is read as', () => {
    // Every save written before E6 means exactly this: E5 gave nobody a timed Trait that
    // was not an Injury (DL-21 §5), so the fallback is a fact about those documents.
    expect(isInjuryTrait({ name: 'Old hurt', since: 1, liftsOn: 40 })).toBe(true);
    expect(isInjuryTrait({ name: 'Old hurt', since: 1 })).toBe(false);
    expect(isInjuryTrait({ name: 'Steady', since: 1, liftsOn: 40, kind: 'disposition' })).toBe(false);
    expect(isInjuryTrait({ name: 'Bruised', since: 1, liftsOn: 40, kind: 'injury' })).toBe(true);
  });
});
