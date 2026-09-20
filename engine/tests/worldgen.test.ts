import { describe, expect, it } from 'vitest';
import { standing } from '../src/career.js';
import { defaultConfig } from '../src/config.js';
import type { GameEvent } from '../src/events.js';
import { newCareer } from '../src/world.js';
import { fixtureContent } from './fixtures.js';

const { career, events } = newCareer('worldgen', fixtureContent);

function background(name: string) {
  const found = fixtureContent.backgrounds.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`the fixture has no Background "${name}"`);
  return found;
}

describe('a new Career', () => {
  it('starts on Day one, with the configured coin and nothing owed', () => {
    expect(career.day).toBe(1);
    expect(career.formatVersion).toBe(1);
    expect(career.seed).toBe('worldgen');
    expect(career.guild.coin).toBe(defaultConfig.startingCoin);
    expect(career.ledger.peakCoin).toBe(defaultConfig.startingCoin);
    expect(career.ledger.lastUpkeepNegative).toBe(false);
    expect(career.parties).toEqual([]);
    expect(career.guild.formerHeroes).toEqual([]);
    expect(career.guild.hall).toEqual([]);
    expect(career.ended).toBeUndefined();
  });

  it('has the configured number of Heroes, Patrons and Rivals', () => {
    expect(career.guild.roster).toHaveLength(defaultConfig.startingHeroes);
    expect(career.patrons).toHaveLength(defaultConfig.patronCount);
    expect(career.rivals).toHaveLength(defaultConfig.rivalCount);
  });

  it('honours an overridden config', () => {
    const small = newCareer('small', fixtureContent, {
      startingHeroes: 2,
      patronCount: 2,
      rivalCount: 1,
      startingCoin: 120,
    }).career;
    expect(small.guild.roster).toHaveLength(2);
    expect(small.patrons).toHaveLength(2);
    expect(small.rivals).toHaveLength(1);
    expect(small.guild.coin).toBe(120);
    expect(small.config.careerYears).toBe(defaultConfig.careerYears);
  });

  it('opens with a Board inside the configured bounds, every Commission from a real Patron', () => {
    expect(career.board.length).toBeGreaterThanOrEqual(defaultConfig.boardSizeMin);
    expect(career.board.length).toBeLessThanOrEqual(defaultConfig.boardSizeMax);
    const patronIds = new Set(career.patrons.map((patron) => patron.id));
    for (const commission of career.board) {
      expect(patronIds.has(commission.patronId)).toBe(true);
      expect(commission.postedOn).toBe(1);
      expect(commission.expiresOn).toBe(defaultConfig.boardRefreshEveryDays);
      expect(commission.difficulty).toBeGreaterThanOrEqual(defaultConfig.difficultyMin);
      expect(commission.difficulty).toBeLessThanOrEqual(defaultConfig.difficultyMax);
      expect(commission.fee).toBeGreaterThanOrEqual(defaultConfig.feeMin);
      expect(commission.fee).toBeLessThanOrEqual(defaultConfig.feeMax);
      expect(commission.spanDays).toBeGreaterThanOrEqual(defaultConfig.commissionSpanMin);
      expect(commission.spanDays).toBeLessThanOrEqual(defaultConfig.commissionSpanMax);
      expect(commission.beatCount).toBeGreaterThanOrEqual(defaultConfig.beatsMin);
      expect(commission.beatCount).toBeLessThanOrEqual(defaultConfig.beatsMax);
      expect(commission.tags.length).toBeGreaterThan(0);
    }
  });

  it('prices a Commission by how hard it is', () => {
    const easiest = newCareer('fees', fixtureContent, {
      difficultyMin: 8,
      difficultyMax: 15,
      feeMin: 80,
      feeMax: 200,
    }).career;
    for (const commission of easiest.board) {
      const expected = Math.round(80 + 120 * ((commission.difficulty - 8) / 7));
      expect(commission.fee).toBe(expected);
    }
  });

  it('reports what it built', () => {
    const types = events.map((event: GameEvent) => event.type);
    expect(types[0]).toBe('CareerStarted');
    expect(types.at(-1)).toBe('BoardRefreshed');
    expect(types.filter((type) => type === 'CommissionPosted')).toHaveLength(career.board.length);

    const started = events[0];
    if (started?.type !== 'CareerStarted') throw new Error('the first event should be CareerStarted');
    expect(started.seed).toBe('worldgen');
    expect(started.guildName).toBe(career.guild.name);
    expect(started.heroIds).toEqual(career.guild.roster.map((hero) => hero.id));
  });
});

describe('the people a Career starts with', () => {
  it('gives everyone four Stats inside the configured range', () => {
    const people = [career.guild.guildmaster, ...career.guild.roster];
    for (const person of people) {
      const values = Object.values(person.stats);
      expect(values).toHaveLength(4);
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(defaultConfig.statMin);
        expect(value).toBeLessThanOrEqual(defaultConfig.statMax);
      }
    }
  });

  it('gives the Guildmaster the configured total and remembers it for the reckoning', () => {
    const total = Object.values(career.guild.guildmaster.stats).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(defaultConfig.guildmasterStatTotal);
    expect(career.guild.guildmaster.startingStats).toEqual(career.guild.guildmaster.stats);
  });

  it('gives each Hero a total inside the configured band', () => {
    for (const hero of career.guild.roster) {
      const total = Object.values(hero.stats).reduce((sum, value) => sum + value, 0);
      expect(total).toBeGreaterThanOrEqual(defaultConfig.heroStatTotalMin);
      expect(total).toBeLessThanOrEqual(defaultConfig.heroStatTotalMax);
    }
  });

  it('applies the Traits of the Background everyone drew', () => {
    for (const person of [career.guild.guildmaster, ...career.guild.roster]) {
      expect(person.traits.map((held) => held.name)).toEqual(background(person.background).traits);
      for (const held of person.traits) {
        expect(held.since).toBe(1);
        expect(held.liftsOn).toBeUndefined();
      }
    }
  });

  it('lets the Guildmaster hold a Trait that carries Backing', () => {
    const drawn = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      drawn.add(newCareer(`gm-${seed}`, fixtureContent).career.guild.guildmaster.background);
    }
    expect(drawn).toContain('Levy years');
  });

  it('names everybody differently', () => {
    const names = [career.guild.guildmaster.name, ...career.guild.roster.map((hero) => hero.name)];
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(career.patrons.map((patron) => patron.name)).size).toBe(career.patrons.length);
    expect(new Set(career.rivals.map((rival) => rival.name)).size).toBe(career.rivals.length);
    expect(fixtureContent.names.guildNames).toContain(career.guild.name);
  });

  it('draws each Patron from a real Sphere, with Regard already formed', () => {
    const sphereIds = new Set(fixtureContent.spheres.map((sphere) => sphere.id));
    for (const patron of career.patrons) {
      expect(sphereIds.has(patron.sphere)).toBe(true);
      expect(patron.regardForGuild.value).toBeGreaterThanOrEqual(defaultConfig.patronStartingRegardMin);
      expect(patron.regardForGuild.value).toBeLessThanOrEqual(defaultConfig.patronStartingRegardMax);
      expect(patron.regardForGuild.reason).toBe('came with the Guild');
    }
    expect(standing(career)).toBe(
      Math.round(
        (career.patrons.reduce((sum, patron) => sum + patron.regardForGuild.value, 0) /
          career.patrons.length) *
          defaultConfig.standingScale,
      ),
    );
  });

  it('sets each Rival’s Standing near the Guild’s own', () => {
    for (const rival of career.rivals) {
      expect(rival.standing).toBeGreaterThanOrEqual(0);
      expect(rival.standing).toBeLessThanOrEqual(standing(career) + defaultConfig.rivalStandingSpread);
    }
  });
});

describe('the Regard a Career starts with', () => {
  it('gives every Hero an opinion of the Guildmaster, and the Guildmaster one of them', () => {
    for (const hero of career.guild.roster) {
      expect(hero.regardForGuildmaster.reason).toBe('came with the Guild');
      expect(hero.regardForGuildmaster.nature).toBe('neutral');
      expect(hero.regardForGuildmaster.value).toBeGreaterThanOrEqual(
        defaultConfig.heroRegardForGuildmasterMin,
      );
      expect(hero.regardForGuildmaster.value).toBeLessThanOrEqual(
        defaultConfig.heroRegardForGuildmasterMax,
      );
      expect(career.guild.guildmaster.regardFor[hero.id]).toBeDefined();
    }
  });

  it('gives every pair of Heroes a history, in both directions', () => {
    for (const hero of career.guild.roster) {
      const others = career.guild.roster.filter((other) => other.id !== hero.id);
      expect(Object.keys(hero.regardFor).sort()).toEqual(others.map((other) => other.id).sort());
      for (const other of others) {
        const forwards = hero.regardFor[other.id];
        const backwards = other.regardFor[hero.id];
        expect(forwards).toBeDefined();
        expect(backwards).toBeDefined();
        expect(forwards?.nature).toBe(backwards?.nature);
        expect(forwards?.reason).toBe(backwards?.reason);
        expect(forwards?.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('seeds the configured bonds and at most one rivalry', () => {
    const natures: string[] = [];
    for (let left = 0; left < career.guild.roster.length; left += 1) {
      for (let right = left + 1; right < career.guild.roster.length; right += 1) {
        const one = career.guild.roster[left];
        const other = career.guild.roster[right];
        const between = one && other ? one.regardFor[other.id] : undefined;
        if (between !== undefined) natures.push(between.nature);
      }
    }
    expect(natures.filter((nature) => nature === 'bond')).toHaveLength(defaultConfig.startingBonds);
    expect(natures.filter((nature) => nature === 'rivalry').length).toBeLessThanOrEqual(
      defaultConfig.startingRivalries,
    );
  });
});

describe('generation from a seed', () => {
  it('builds the same world twice, and different worlds from different seeds', () => {
    expect(newCareer('same', fixtureContent).career).toEqual(newCareer('same', fixtureContent).career);
    expect(newCareer('same', fixtureContent).career).not.toEqual(
      newCareer('other', fixtureContent).career,
    );
  });
});
