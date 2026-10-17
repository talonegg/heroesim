import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import { leaveRoster } from '../captain.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import { takeId, type Guild, type GuildId, type Hero, type HeroId, type OfferId, type PartyId, type World, type WorldDocument } from '../document.js';
import { addStack, holdings } from '../items.js';
import { playerGuild, releasePayout, unattachedHeroes } from '../selectors.js';
import { nightOf } from '../time.js';
import { ofType, playWith, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import type { ActionResult, Rejection } from './result.js';

// `release` (Q10, the owner's Q-B; DL-294 item 6, DL-317): during the term the Guild pays
// `releasePayoutFactor` of the wages left and the Hero joins the Unattached pool with no Contract, their
// gear returned to the Guild's holding and each teammate who held them warmly or better losing
// `transferMoraleCost`; nothing is paid once the Contract has ended. Refused for a Hero away on a Quest and
// one not on the Roster. The Guild's last Hero may be released: the engine refuses nothing for it. Every
// document a test makes is held to the validator.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** The config the tests rely on, pinned against a balance pass. */
const pins: Partial<GameConfig> = {
  negotiationRange: 0,
  marketSize: 0,
  startingRosterSize: 4,
  upkeepEveryDays: 10,
  releasePayoutFactor: 0.8,
  transferMoraleCost: -15,
  transferRegardBand: 'warm',
  moraleMin: 0,
  moraleMax: 100,
  moraleBands: { wretched: 0, low: 20, steady: 40, high: 75, elated: 90 },
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
};
const deps = testDeps({ ...pins, rivalCount: 1 });

/** A Contract of wage 22 ending on Day 360: from Turn 0 it has 36 wage charges left, 792, a payout of 633. */
const contract = { wage: 22, signedOnTurn: 0, years: 1, endDay: 360 };
const payout = 633;

function created(seed = 'release', with_: EngineDeps = deps): { document: WorldDocument; guild: Guild; hero: Hero; world: World } {
  const document = withValid(createWorld(seed, setup, with_).document, with_);
  const guild = playerGuild(document.world) as Guild;
  for (const id of guild.rosterIds) (document.world.heroes[id] as Hero).contract = { ...contract };
  guild.wealth = 5_000;
  return { document, guild, hero: document.world.heroes[guild.rosterIds[0] as HeroId] as Hero, world: document.world };
}

function released(document: WorldDocument, guildId: GuildId, heroId: HeroId, with_: EngineDeps = deps) {
  const result = applyAction(document, { kind: 'release', guildId, heroId }, with_);
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
  return { document: withValid(result.document, with_), events: result.events };
}

/** The rejection of a release that is refused, having checked that it changed nothing. */
function refused(document: WorldDocument, guildId: GuildId, heroId: HeroId): Rejection {
  const before = JSON.stringify(document);
  const result: ActionResult = applyAction(document, { kind: 'release', guildId, heroId }, deps);
  if (result.ok) throw new Error('Expected a refusal');
  expect(JSON.stringify(document)).toBe(before);
  return result.rejection;
}

/** A Regard entry of `value` for `id`, as a shared Quest would leave it. */
function regardFor(hero: Hero, id: HeroId, value: number): void {
  hero.regard[id] = { value, since: 0, reason: 'quest.resolved' };
}

describe('release', () => {
  test("pays releasePayoutFactor of the wages left, rounded down once; the Hero joins the pool with no Contract, off the Roster; a Milestone with the payout", () => {
    const { document, guild, hero } = created();
    const wealth = guild.wealth;
    const [, second] = guild.rosterIds as [HeroId, HeroId, ...HeroId[]];
    expect(releasePayout(hero, 0, deps.config)).toBe(payout);

    const { document: after, events } = released(document, guild.id, hero.id);

    const row = after.world.heroes[hero.id] as Hero;
    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(wealth - payout);
    expect((after.world.guilds[guild.id] as Guild).rosterIds).not.toContain(hero.id);
    expect((after.world.guilds[guild.id] as Guild).rosterIds).toContain(second);
    expect(row).toMatchObject({ guildId: null, unattachedSince: 0, contract: null });
    expect(unattachedHeroes(after.world).map((each) => each.id)).toContain(hero.id);
    const [event] = ofType(events, 'hero.released');
    expect(events.map((each) => each.type)).toEqual(['hero.released']);
    expect(event?.milestone).toBe(true);
    expect(event?.participants).toEqual([hero.id, guild.id]);
    expect(event?.payload).toEqual({ heroId: hero.id, guildId: guild.id, payout });
    // The document given is left as it was (DL-24).
    expect((document.world.heroes[hero.id] as Hero).guildId).toBe(guild.id);
  });

  test('the payout follows the Day: a later Turn leaves fewer wage charges, and so a smaller payout', () => {
    const { document, guild, hero } = created();
    document.world.turn = 300; // Day 100: 26 charges of 22 left, 572, 457.6
    const { document: after, events } = released(document, guild.id, hero.id);
    expect(ofType(events, 'hero.released')[0]?.payload.payout).toBe(457);
    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(5_000 - 457);
    expect((after.world.heroes[hero.id] as Hero).unattachedSince).toBe(300);
  });

  test('nothing is paid once the Contract has ended: a Hero Out of Contract is let go for no payout, their repriced wage not counted', () => {
    const { document, guild, hero } = created();
    (document.world.heroes[hero.id] as Hero).contract = { ...contract, wage: 25, endDay: 40 };
    document.world.turn = nightOf(40) + 3;

    const { document: after, events } = released(document, guild.id, hero.id);

    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(5_000);
    expect(ofType(events, 'hero.released')[0]?.payload).toEqual({ heroId: hero.id, guildId: guild.id, payout: 0 });
    expect((after.world.heroes[hero.id] as Hero).contract).toBeNull();
  });

  test('a Captain released leaves the post empty', () => {
    const { document, guild, hero } = created();
    guild.captainId = hero.id;
    const { document: after } = released(document, guild.id, hero.id);
    expect((after.world.guilds[guild.id] as Guild).captainId).toBeNull();
  });

  test('the gear the Hero carries goes back to the Guild\'s holding, told before the release (cause released)', () => {
    const { document, guild, hero } = created();
    addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: hero.id, slot: 'armour' });

    const { document: after, events } = released(document, guild.id, hero.id);

    expect(holdings(after.world, { kind: 'hero', id: hero.id })).toEqual({ items: [], stacks: [] });
    const vault = holdings(after.world, { kind: 'guild', id: guild.id });
    expect(vault.stacks.map((stack) => [stack.definitionKey, stack.quantity])).toEqual([['padded-jack', 1]]);
    expect(ofType(events, 'item.returned').map((event) => [event.payload.guildId, event.payload.cause])).toEqual([[guild.id, 'released']]);
    expect(events.map((event) => event.type).slice(0, 2)).toEqual(['item.returned', 'hero.released']);
  });

  test('each teammate who held them warmly or better loses transferMoraleCost, as at a Transfer out; only a band crossing is told', () => {
    const { document, guild, hero } = created();
    const [leaving, close, warm, cool] = guild.rosterIds.map((id) => document.world.heroes[id] as Hero) as [Hero, Hero, Hero, Hero];
    expect(leaving.id).toBe(hero.id);
    regardFor(close, leaving.id, 15);
    regardFor(warm, leaving.id, 4);
    regardFor(cool, leaving.id, -13);
    regardFor(leaving, cool.id, 15);
    close.morale = 80;
    warm.morale = 60;
    cool.morale = 60;
    const before = Object.fromEntries(Object.values(document.world.heroes).map((each) => [each.id, each.morale]));

    const { document: after, events } = released(document, guild.id, leaving.id);

    const morale = Object.fromEntries(Object.values(after.world.heroes).map((each) => [each.id, each.morale]));
    expect(morale).toEqual({ ...before, [close.id]: 65, [warm.id]: 45 });
    expect(ofType(events, 'hero.morale-changed').map((event) => event.payload)).toEqual([
      { heroId: close.id, cause: 'transfer', before: 80, after: 65, bandBefore: 'high', bandAfter: 'steady' },
    ]);
    expect(events.map((event) => event.type)).toEqual(['hero.released', 'hero.morale-changed']);
  });

  test('a Transfer Offer standing for the Hero lapses with them: guild.transfer-offer-expired for hero-left', () => {
    const { document, guild, hero } = created();
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
    const offerId: OfferId = takeId(document.world, 'offers');
    document.world.offers[offerId] = {
      id: offerId,
      kind: 'transfer',
      fromGuildId: rival.id,
      toGuildId: guild.id,
      heroId: hero.id,
      fee: 100,
      years: 2,
      offeredOnTurn: 0,
      expiresOnTurn: nightOf(3),
    };
    const { document: after, events } = released(document, guild.id, hero.id);
    expect(after.world.offers[offerId]).toBeUndefined();
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['hero-left']);
  });

  test('a Rival releases its own Hero by the same rule (ADR-0002)', () => {
    const { document, guild } = created();
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
    const heroId = rival.rosterIds[0] as HeroId;
    (document.world.heroes[heroId] as Hero).contract = { ...contract };
    const wealth = rival.wealth;
    const { document: after, events } = released(document, rival.id, heroId);
    expect(events.map((event) => event.type)).toEqual(['hero.released']);
    expect((after.world.guilds[rival.id] as Guild).wealth).toBe(wealth - payout);
  });

  describe('refused, changing nothing', () => {
    test("a Hero not on the Guild's Roster: another Guild's, the pool's, or no row", () => {
      const { document, guild } = created();
      const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
      const pool = unattachedHeroes(document.world)[0] as Hero;
      for (const heroId of [rival.rosterIds[0] as HeroId, pool.id, 'hero-999999' as HeroId]) {
        expect(refused(document, guild.id, heroId)).toEqual({ action: 'release', reason: 'hero-not-on-roster', heroId, guildId: guild.id });
      }
    });

    test('a Hero dead or retired, whom no Roster holds', () => {
      const { document, guild } = created();
      const [dead, retired] = guild.rosterIds.map((id) => document.world.heroes[id] as Hero) as [Hero, Hero];
      dead.diedOnTurn = 0;
      leaveRoster(guild, dead);
      retired.retiredOnTurn = 0;
      leaveRoster(guild, retired);
      for (const hero of [dead, retired]) expect(refused(document, guild.id, hero.id).reason).toBe('hero-not-on-roster');
    });

    test('a Hero away on a Quest: hero-in-party, until they are home', () => {
      const { document, guild, hero } = created();
      (document.world.heroes[hero.id] as Hero).partyId = 'party-000001' as PartyId;
      expect(refused(document, guild.id, hero.id)).toEqual({ action: 'release', reason: 'hero-in-party', heroId: hero.id, partyId: 'party-000001' });
    });

    test('in the order hero-not-on-roster, hero-in-party: the first that holds is the one given', () => {
      const { document, guild, hero } = created();
      const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
      const theirs = document.world.heroes[rival.rosterIds[0] as HeroId] as Hero;
      theirs.partyId = 'party-000001' as PartyId;
      (document.world.heroes[hero.id] as Hero).partyId = 'party-000002' as PartyId;
      expect([refused(document, guild.id, theirs.id).reason, refused(document, guild.id, hero.id).reason]).toEqual(['hero-not-on-roster', 'hero-in-party']);
    });

    test('a Guild the world does not hold is a programming error', () => {
      const { document, hero } = created();
      expect(() => applyAction(document, { kind: 'release', guildId: 'guild-999999' as GuildId, heroId: hero.id }, deps)).toThrow(RangeError);
    });
  });
});

// The owner's Q-B: the last Hero may be released. A Guild that cannot then sign another meets the "Roster
// wiped" ending, which for the player's Guild ends the game (phases/endings.ts).
describe('the last Hero released (Q-B)', () => {
  const alone = testDeps({ ...pins, rivalCount: 0, startingRosterSize: 1 });
  const playTo = playWith(advance, { validate: 'last', stopAtEnd: true });

  function lone(wealth: number) {
    const { document, guild, hero } = created('last-hero', alone);
    guild.wealth = wealth;
    return { document, guild, hero };
  }

  test("with Wealth short of every fee in the pool after the payout, the night ends the game: 'roster-wiped'", () => {
    const { document, guild, hero } = lone(0);
    guild.wealth = payout + 1; // the Wealth after the payout is 1, short of any signing fee

    const { document: after } = released(document, guild.id, hero.id, alone);
    expect((after.world.guilds[guild.id] as Guild).rosterIds).toEqual([]);
    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(1);
    const played = playTo(after, nightOf(0), alone);

    expect(played.document.world.ended).toEqual({ turn: nightOf(0), reason: 'roster-wiped' });
    expect(played.stoppedBecause).toEqual({ kind: 'ended' });
    expect(ofType(played.events, 'game.ended').map((event) => event.payload.reason)).toEqual(['roster-wiped']);
  });

  test('with Wealth that covers the cheapest Hero in the pool, the Guild goes on and can sign one', () => {
    const { document, guild, hero } = lone(0);
    guild.wealth = payout + 100_000;

    const { document: after } = released(document, guild.id, hero.id, alone);
    const played = playTo(after, nightOf(2), alone);

    expect(played.document.world.ended).toBeNull();
    const pooled = unattachedHeroes(played.document.world)[0] as Hero;
    const signed = applyAction(played.document, { kind: 'recruit', guildId: guild.id, heroId: pooled.id, years: 1 }, alone);
    expect(signed.ok).toBe(true);
  });
});

// A payout is a charge on the Wealth like any other: the night's floor test reads it the same night.
describe('a Bankruptcy reached by a payout', () => {
  test('the Wealth the payout leaves below the floor is read the same night: guild.below-floor, and with no grace the game ends', () => {
    const grace = testDeps({ ...pins, rivalCount: 0, bankruptcyGraceDays: 0 });
    const playTo = playWith(advance, { validate: 'last', stopAtEnd: true });
    const { document, guild, hero } = created('bankrupt', grace);
    guild.wealth = payout - 1; // the payout takes it to -1, below the floor of 0
    expect(grace.config.bankruptcyFloor).toBe(0);

    const { document: after } = released(document, guild.id, hero.id, grace);
    expect((after.world.guilds[guild.id] as Guild).wealth).toBe(-1);
    const played = playTo(after, nightOf(0), grace);

    expect(played.document.world.ended).toEqual({ turn: nightOf(0), reason: 'bankruptcy' });
    expect(ofType(played.events, 'guild.below-floor').map((event) => [event.turn, event.payload.wealth])).toEqual([[nightOf(0), -1]]);
    expect((played.document.world.guilds[guild.id] as Guild).belowFloorSince).toBe(nightOf(0));
  });

  test('with a grace, the countdown starts that night and the game ends when it runs out', () => {
    const grace = testDeps({ ...pins, rivalCount: 0, bankruptcyGraceDays: 3 });
    const playTo = playWith(advance, { validate: 'last', stopAtEnd: true });
    const { document, guild, hero } = created('bankrupt-grace', grace);
    guild.wealth = payout - 1;

    const { document: after } = released(document, guild.id, hero.id, grace);
    const early = playTo(after, nightOf(2), grace);
    expect(early.document.world.ended).toBeNull();
    expect((early.document.world.guilds[guild.id] as Guild).belowFloorSince).toBe(nightOf(0));
    expect(playTo(early.document, nightOf(3), grace).document.world.ended).toEqual({ turn: nightOf(3), reason: 'bankruptcy' });
  });
});
