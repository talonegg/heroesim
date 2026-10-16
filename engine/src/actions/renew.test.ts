import { describe, expect, test } from 'vitest';
import { leaveRoster } from '../captain.js';
import { contractWage, outOfContract, outOfContractWage } from '../contract.js';
import { createWorld } from '../create.js';
import type { Contract, Guild, GuildId, Hero, HeroId, PartyId, WorldDocument } from '../document.js';
import type { EngineEventOf } from '../events.js';
import { playerGuild } from '../selectors.js';
import { dayOf, nightOf } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import type { RenewRejection } from './renew.js';
import type { ActionResult } from './result.js';

// `renew` (Q9, the owner's Q-A; DL-294 item 6, DL-316): the Hero's Guild signs them again at any time, at
// the wage rule's price now and a length it chooses, with no fee; the new term starts that Day and the
// old one's rest is dropped. Refused for a Hero not on its Roster (dead and retired among them), away on
// a Quest, or a length not offered. Every document a test makes is held to the validator.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const deps = testDeps({ rivalCount: 1 });

function created(seed = 'renew'): { document: WorldDocument; guild: Guild; hero: Hero } {
  const document = withValid(createWorld(seed, setup, deps).document, deps);
  const guild = playerGuild(document.world) as Guild;
  return { document, guild, hero: document.world.heroes[guild.rosterIds[0] as HeroId] as Hero };
}

function renewed(document: WorldDocument, guildId: GuildId, heroId: HeroId, years: number) {
  const result = applyAction(document, { kind: 'renew', guildId, heroId, years }, deps);
  if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
  return { document: withValid(result.document, deps), events: result.events };
}

function refusal(result: ActionResult<RenewRejection>): RenewRejection {
  if (result.ok) throw new Error('Expected a refusal');
  return result.rejection;
}

describe('renew', () => {
  test("signs the Hero again at the wage rule's price now and the length chosen, from today, with no fee; a Milestone with the terms", () => {
    const { document, guild, hero } = created();
    document.world.turn = 40;
    (document.world.heroes[hero.id] as Hero).level += 4;
    const price = contractWage(document.world, document.world.heroes[hero.id] as Hero, guild, 3, deps);
    const wealth = guild.wealth;

    const { document: after, events } = renewed(document, guild.id, hero.id, 3);

    const contract = (after.world.heroes[hero.id] as Hero).contract as Contract;
    expect(contract).toEqual({ wage: price, signedOnTurn: 40, years: 3, endDay: dayOf(40) + 3 * 360 });
    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(wealth);
    expect(events).toHaveLength(1);
    const [event] = events as [EngineEventOf<'hero.contract-renewed'>];
    expect(event.type).toBe('hero.contract-renewed');
    expect(event.milestone).toBe(true);
    expect(event.participants).toEqual([hero.id, guild.id]);
    expect(event.payload).toEqual({ heroId: hero.id, guildId: guild.id, wage: price, years: 3, endDay: contract.endDay });
  });

  test("drops the old term's rest: a shorter term than the one left ends sooner", () => {
    const { document, guild, hero } = created();
    const first = renewed(document, guild.id, hero.id, 3).document;
    first.world.turn = 30;
    const again = renewed(first, guild.id, hero.id, 1).document;
    expect((again.world.heroes[hero.id] as Hero).contract).toMatchObject({ years: 1, signedOnTurn: 30, endDay: dayOf(30) + 360 });
  });

  test('a Hero Out of Contract is signed again, at the length\'s price and no longer at the repriced wage', () => {
    const { document, guild, hero } = created();
    const row = document.world.heroes[hero.id] as Hero;
    const endDay = (row.contract as Contract).endDay;
    row.contract = { ...(row.contract as Contract), wage: outOfContractWage(document.world, row, guild, deps) };
    document.world.turn = nightOf(endDay) + 2;
    expect(outOfContract(row, document.world.turn)).toBe(true);

    const after = renewed(document, guild.id, hero.id, 2).document;

    const renewedHero = after.world.heroes[hero.id] as Hero;
    expect(outOfContract(renewedHero, after.world.turn)).toBe(false);
    expect(renewedHero.contract?.wage).toBe(contractWage(after.world, renewedHero, guild, 2, deps));
  });

  test('a Rival renews its own Heroes by the same rule (ADR-0002)', () => {
    const { document } = created();
    const rival = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const heroId = rival.rosterIds[0] as HeroId;
    const { events } = renewed(document, rival.id, heroId, 1);
    expect(events.map((event) => event.type)).toEqual(['hero.contract-renewed']);
  });

  describe('refused, changing nothing', () => {
    test('a length contractLengthsYears does not offer: length-not-offered, naming those offered', () => {
      const { document, guild, hero } = created();
      expect(refusal(applyAction(document, { kind: 'renew', guildId: guild.id, heroId: hero.id, years: 4 }, deps))).toEqual({
        action: 'renew',
        reason: 'length-not-offered',
        years: 4,
        offered: [1, 2, 3],
      });
    });

    test("a Hero not on the Guild's Roster: another Guild's, the pool's, or no row", () => {
      const { document, guild } = created();
      const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
      const pool = Object.values(document.world.heroes).find((each) => each.unattachedSince !== null) as Hero;
      for (const heroId of [rival.rosterIds[0] as HeroId, pool.id, 'hero-999999' as HeroId]) {
        expect(refusal(applyAction(document, { kind: 'renew', guildId: guild.id, heroId, years: 1 }, deps))).toEqual({
          action: 'renew',
          reason: 'hero-not-on-roster',
          heroId,
          guildId: guild.id,
        });
      }
    });

    test('a Hero dead or retired, whom no Roster holds', () => {
      const { document, guild } = created();
      const [dead, retired] = guild.rosterIds.map((id) => document.world.heroes[id] as Hero) as [Hero, Hero];
      dead.diedOnTurn = 0;
      leaveRoster(guild, dead);
      retired.retiredOnTurn = 0;
      leaveRoster(guild, retired);
      for (const hero of [dead, retired]) {
        expect(refusal(applyAction(document, { kind: 'renew', guildId: guild.id, heroId: hero.id, years: 1 }, deps)).reason).toBe('hero-not-on-roster');
      }
    });

    test('a Hero away on a Quest (the owner, Q-A): hero-in-party, until they are home', () => {
      const { document, guild, hero } = created();
      (document.world.heroes[hero.id] as Hero).partyId = 'party-000001' as PartyId;
      const before = structuredClone(document.world);
      expect(refusal(applyAction(document, { kind: 'renew', guildId: guild.id, heroId: hero.id, years: 1 }, deps))).toEqual({
        action: 'renew',
        reason: 'hero-in-party',
        heroId: hero.id,
        partyId: 'party-000001',
      });
      expect(document.world).toEqual(before);
    });

    test('a Guild the world does not hold is a programming error', () => {
      const { document, hero } = created();
      expect(() => applyAction(document, { kind: 'renew', guildId: 'guild-999999' as GuildId, heroId: hero.id, years: 1 }, deps)).toThrow(RangeError);
    });
  });
});
