import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import { availableHeroes, partyPool } from '../best-party.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { outOfContract } from '../contract.js';
import { renewsOnOffer } from '../controllers/rival.js';
import { createWorld } from '../create.js';
import {
  compareByCodeUnit,
  type Contract,
  type Guild,
  type Hero,
  type HeroId,
  type OfferId,
  type Quest,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { guildmasterOf } from '../guildmaster.js';
import { regardValue } from '../regard.js';
import { dispositionOf, offeredQuests, playerGuild } from '../selectors.js';
import { dayOf, nightOf } from '../time.js';
import { freeOffer, transferLock, underOffer } from '../transfer.js';
import { harmlessContent, setup, testDeps, thriftyRivals, withDispositions, withValid } from '../world.test-support.js';
import { applyAction, type Action } from './action.js';
import { fameRefusal, unavailability } from './dispatch.js';
import type { ActionResult, Rejection } from './result.js';

// The free Offer (Q8), the Rivals' answer to it (Q15) and Under Offer (Q-G, Q-H; DL-294 item 6,
// DL-311, DL-319). A Guild that wants a Hero Out of Contract offers a fee of 0; a Guild that answers
// through Offers, the player's, has `transferOfferDays` to renew them, or they are taken when it runs
// out; a Rival answers at once. A Hero any Offer stands for is Under Offer while home, and no Party
// takes them. Every document a test makes is held to the validator.

const pins: Partial<GameConfig> = {
  negotiationRange: 0,
  marketSize: 0,
  startingRosterSize: 4,
  transferFeeFactor: 0.3,
  transferOfferDays: 3,
  transferLockDays: 30,
  transferMoraleCost: -15,
  transferRegardBand: 'warm',
  guildmasterRegardPerTransferDeal: 2,
  transferGeneratorChance: 0,
  moraleMin: 0,
  moraleMax: 100,
  moraleBands: { wretched: 0, low: 20, steady: 40, high: 75, elated: 90 },
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
};

/** Rivals that seek no Transfer and hire nothing by choice, so the tests' own Offers are the only ones. */
const quiet = withDispositions({ ...thriftyRivals, transferAppetite: 0 }, harmlessContent);
const deps = testDeps(pins, quiet);

/** A world made with the Rivals' Rosters generated in the default range, 4 to 8 Heroes, then played with `with_`. */
function created(seed: string, with_: EngineDeps = deps): WorldDocument {
  const generating = testDeps({ ...with_.config, rivalRosterMin: 4, rivalRosterMax: 8 }, with_.content);
  return withValid(createWorld(seed, setup, generating).document, with_);
}

function player(world: World): Guild {
  return playerGuild(world) as Guild;
}

function rival(world: World): Guild {
  const [first] = Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  if (first === undefined) throw new Error('No Rival');
  return first;
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

function accepted(result: ActionResult, with_: EngineDeps = deps): { document: WorldDocument; events: EngineEvent[] } {
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
  return { document: withValid(result.document, with_), events: result.events };
}

function refused(document: WorldDocument, action: Action, with_: EngineDeps = deps): Rejection {
  const before = JSON.stringify(document);
  const result = applyAction(document, action, with_);
  if (result.ok) throw new Error('Expected a refusal');
  expect(JSON.stringify(document)).toBe(before);
  return result.rejection;
}

/** The morning of Day 3, with `hero`'s Contract ended on Day 2: Out of Contract (DL-316). */
function expire(world: World, hero: Hero): void {
  world.turn = Math.max(world.turn, 9);
  hero.contract = { ...(hero.contract as Contract), endDay: dayOf(world.turn) - 1 };
  expect(outOfContract(hero, world.turn)).toBe(true);
}

/** Advances `document` until `done` holds of it, gathering the events. */
function playUntil(document: WorldDocument, done: (world: World) => boolean, with_: EngineDeps = deps) {
  let current = document;
  const events: EngineEvent[] = [];
  for (let turns = 0; !done(current.world); turns += 1) {
    if (turns > 60) throw new Error('Played 60 Turns and it never came');
    const result = advance(current, with_);
    current = withValid(result.document, with_);
    // No Module runs in these worlds: every event is the engine's.
    events.push(...(result.events as EngineEvent[]));
  }
  return { document: current, events };
}

/** A Quest on the Board `guild` may take, with no Class or Skill required. */
function openQuest(world: World, guild: Guild, with_: EngineDeps = deps): Quest {
  const quest = offeredQuests(world).find(
    (each) => fameRefusal(guild, each, with_) === null && each.requirements.classKey === undefined && each.requirements.skillKey === undefined,
  );
  if (quest === undefined) throw new Error('No open Quest on the Board');
  return quest;
}

/** `hero` sent alone, or with the fewest of their Roster a Quest needs, on an open Quest. */
function sendAway(document: WorldDocument, guild: Guild, hero: Hero, with_: EngineDeps = deps): WorldDocument {
  const quest = openQuest(document.world, guild, with_);
  const others = guild.rosterIds.filter((id) => id !== hero.id).slice(0, Math.max(0, quest.requirements.partySizeMin - 1));
  return accepted(applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: [hero.id, ...others] }, with_), with_).document;
}

/** A free Offer from the first Rival for the player's first Hero, made Out of Contract. */
function freeOffered(seed: string) {
  const document = created(seed);
  const guild = player(document.world);
  const bidder = rival(document.world);
  const hero = heroOf(document.world, guild.rosterIds[0] as HeroId);
  expire(document.world, hero);
  const result = accepted(applyAction(document, { kind: 'offerTransfer', guildId: bidder.id, heroId: hero.id, years: 2 }, deps));
  const [offered] = ofType(result.events, 'guild.transfer-offered');
  if (offered === undefined) throw new Error('No Offer');
  return { ...result, guild, bidder, hero, offerId: offered.payload.offerId };
}

describe('the free Offer (Q8)', () => {
  test('a Guild offers a fee of 0 for a Hero Out of Contract: the row stands transferOfferDays, and the Hero is Under Offer', () => {
    const { document, guild, bidder, hero, offerId, events } = freeOffered('free-made');
    const offer = document.world.offers[offerId];
    expect(offer).toEqual({
      id: offerId,
      kind: 'transfer',
      fromGuildId: guild.id,
      toGuildId: bidder.id,
      heroId: hero.id,
      fee: 0,
      years: 2,
      offeredOnTurn: 9,
      expiresOnTurn: nightOf(5), // Days 3, 4 and 5
    });
    expect(events.map((event) => event.type)).toEqual(['guild.transfer-offered']);
    expect(freeOffer(document.world, offer as NonNullable<typeof offer>)).toBe(true);
    expect(underOffer(document.world, heroOf(document.world, hero.id))).toBe(true);
  });

  test('renewed, the Offer is withdrawn, its end renewed, and the Hero is free to go again', () => {
    const { document, guild, hero, offerId } = freeOffered('free-renewed');
    const { document: after, events } = accepted(applyAction(document, { kind: 'renew', guildId: guild.id, heroId: hero.id, years: 1 }, deps));
    expect(events.map((event) => event.type)).toEqual(['hero.contract-renewed', 'guild.transfer-offer-expired']);
    expect(ofType(events, 'guild.transfer-offer-expired')[0]?.payload).toMatchObject({ offerId, cause: 'renewed', fee: 0 });
    expect(after.world.offers).toEqual({});
    expect(unavailability(heroOf(after.world, hero.id), after.world)).toBeNull();
    expect(heroOf(after.world, hero.id).guildId).toBe(guild.id);
  });

  test("run out, the Hero is taken for no fee on the bidder's Contract, with the Transfer's Morale cost, Regard and lock", () => {
    const { document, guild, bidder, hero, offerId } = freeOffered('free-taken');
    const friend = heroOf(document.world, guild.rosterIds[1] as HeroId);
    friend.regard[hero.id] = { value: 15, since: 0, reason: 'quest.resolved' };
    friend.morale = 50;
    const regard = regardValue(guildmasterOf(bidder, document.world)?.regard ?? {}, guild.guildmasterId);

    const { document: after, events } = playUntil(document, (world) => world.offers[offerId] === undefined);

    expect(after.world.turn).toBe(nightOf(5));
    const ended = ofType(events, 'guild.transfer-offer-expired');
    expect(ended.map((event) => [event.payload.offerId, event.payload.cause, event.turn])).toEqual([[offerId, 'taken', nightOf(5)]]);
    const [moved] = ofType(events, 'hero.transferred');
    expect(moved?.payload).toMatchObject({ heroId: hero.id, fromGuildId: guild.id, toGuildId: bidder.id, fee: 0, offerId, years: 2 });
    expect(events.indexOf(ended[0] as EngineEvent)).toBeLessThan(events.indexOf(moved as EngineEvent));
    const taken = heroOf(after.world, hero.id);
    expect(taken.guildId).toBe(bidder.id);
    expect(taken.contract).toMatchObject({ years: 2, signedOnTurn: nightOf(5), endDay: 5 + 2 * 360 });
    expect(transferLock(taken, after.world.turn, deps.config)).not.toBeNull();
    // The friend's Morale drifts over the Offer's Days; the take costs them transferMoraleCost that night.
    const cost = ofType(events, 'hero.morale-changed').filter((event) => event.payload.heroId === friend.id && event.turn === nightOf(5));
    expect(cost.map((event) => event.payload.after - event.payload.before)).toContain(-15);
    const bidderAfter = after.world.guilds[bidder.id] as Guild;
    expect(regardValue(guildmasterOf(bidderAfter, after.world)?.regard ?? {}, guild.guildmasterId)).toBe(regard + 2);
  });

  test('declined is refused, free-offer: a free Offer is answered only by renewing; accepted, the Hero goes at once for no fee', () => {
    const { document, guild, bidder, hero, offerId } = freeOffered('free-declined');
    expect(refused(document, { kind: 'declineTransfer', guildId: guild.id, offerId })).toEqual({
      action: 'declineTransfer',
      reason: 'free-offer',
      offerId,
    });
    const { document: after, events } = accepted(applyAction(document, { kind: 'acceptTransfer', guildId: guild.id, offerId }, deps));
    expect(ofType(events, 'hero.transferred')[0]?.payload).toMatchObject({ fee: 0, offerId, toGuildId: bidder.id });
    expect(heroOf(after.world, hero.id).guildId).toBe(bidder.id);
  });

  test('transferIn refuses a Hero Out of Contract, out-of-contract: a free Offer is the one way to take them', () => {
    const document = created('free-no-transfer-in');
    const guild = player(document.world);
    const seller = rival(document.world);
    const hero = heroOf(document.world, seller.rosterIds[0] as HeroId);
    expire(document.world, hero);
    expect(refused(document, { kind: 'transferIn', guildId: guild.id, heroId: hero.id, years: 2 })).toEqual({
      action: 'transferIn',
      reason: 'out-of-contract',
      heroId: hero.id,
    });
  });
});

describe("a Rival's answer, at once (Q15)", () => {
  /** The player's free Offer for the first Rival's Hero `index`, its Levels set to `levels` in Roster order. */
  function answered(seed: string, levels: readonly number[], index: number, with_: EngineDeps = deps) {
    const document = created(seed, with_);
    const guild = player(document.world);
    const seller = rival(document.world);
    seller.rosterIds.forEach((id, at) => {
      heroOf(document.world, id).level = levels[at] ?? 1;
    });
    const hero = heroOf(document.world, seller.rosterIds[index] as HeroId);
    expire(document.world, hero);
    const result = accepted(applyAction(document, { kind: 'offerTransfer', guildId: guild.id, heroId: hero.id, years: 3 }, with_), with_);
    return { ...result, guild, seller, hero };
  }

  test("renews a Hero at or above its Roster's median Level, at its own length: the Offer made and withdrawn, renewed", () => {
    const { document, events, seller, hero } = answered('rival-renews', [3, 5, 1, 2, 2, 2, 2, 2], 0);
    expect(events.map((event) => event.type)).toEqual(['guild.transfer-offered', 'hero.contract-renewed', 'guild.transfer-offer-expired']);
    expect(ofType(events, 'guild.transfer-offer-expired')[0]?.payload.cause).toBe('renewed');
    expect(document.world.offers).toEqual({});
    const kept = heroOf(document.world, hero.id);
    expect(kept.guildId).toBe(seller.id);
    expect(kept.contract?.years).toBe(deps.content.dispositions[dispositionOf(seller) as string]?.contractYears);
    expect(outOfContract(kept, document.world.turn)).toBe(false);
  });

  test('lets a Hero below the median go while its Roster is above its floor: taken at once, for no fee', () => {
    const { document, events, guild, seller, hero } = answered('rival-lets-go', [1, 5, 4, 4, 4, 4, 4, 4], 0);
    expect(seller.rosterIds.length).toBeGreaterThan(deps.config.rivalRosterMin);
    const types = events.map((event) => event.type);
    expect(types[0]).toBe('guild.transfer-offered');
    expect(types).toContain('hero.transferred');
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['taken']);
    expect(ofType(events, 'hero.transferred')[0]?.payload).toMatchObject({ fee: 0, fromGuildId: seller.id, toGuildId: guild.id, years: 3 });
    expect(heroOf(document.world, hero.id).guildId).toBe(guild.id);
    expect(document.world.offers).toEqual({});
  });

  test('renews a Hero below the median when its Roster is at its floor, rivalRosterMin', () => {
    const probe = created('rival-floor');
    const size = rival(probe.world).rosterIds.length;
    const atFloor = testDeps({ ...pins, rivalRosterMin: size }, quiet);
    const { document, events, seller, hero } = answered('rival-floor', [1, 5, 4, 4, 4, 4, 4, 4], 0, atFloor);
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['renewed']);
    expect(heroOf(document.world, hero.id).guildId).toBe(seller.id);
  });

  test('renewsOnOffer: Level at or above the median of the Roster, the Hero among it, or the Roster at the floor', () => {
    const world = { heroes: {} as World['heroes'] };
    const roster = ['hero-000001', 'hero-000002', 'hero-000003', 'hero-000004'] as HeroId[];
    roster.forEach((id, at) => {
      world.heroes[id] = { id, level: [1, 2, 4, 6][at] } as Hero;
    });
    const guild = { rosterIds: roster };
    // The median of 1, 2, 4, 6 is 3.
    expect(renewsOnOffer(world, guild, heroOf(world as World, roster[2] as HeroId), 0)).toBe(true);
    expect(renewsOnOffer(world, guild, heroOf(world as World, roster[1] as HeroId), 0)).toBe(false);
    expect(renewsOnOffer(world, guild, heroOf(world as World, roster[1] as HeroId), 4)).toBe(true);
    expect(renewsOnOffer(world, { rosterIds: roster.slice(0, 3) }, heroOf(world as World, roster[1] as HeroId), 0)).toBe(true);
  });

  test('a Hero away: the Offer stands, and is answered on the night they come home', () => {
    const document = created('rival-away');
    const guild = player(document.world);
    const seller = rival(document.world);
    seller.rosterIds.forEach((id, at) => {
      heroOf(document.world, id).level = at === 0 ? 1 : 5;
    });
    const hero = heroOf(document.world, seller.rosterIds[0] as HeroId);
    expire(document.world, hero);
    const away = sendAway(document, seller, hero);
    const returnsOnTurn = away.world.parties[heroOf(away.world, hero.id).partyId as keyof World['parties']]?.returnsOnTurn as number;

    const { document: offered, events } = accepted(applyAction(away, { kind: 'offerTransfer', guildId: guild.id, heroId: hero.id, years: 2 }, deps));
    expect(events.map((event) => event.type)).toEqual(['guild.transfer-offered']);
    const [offerId] = Object.keys(offered.world.offers) as [OfferId];
    expect(offered.world.offers[offerId]?.expiresOnTurn).toBe(nightOf(dayOf(returnsOnTurn) + 3));

    const { document: after, events: played } = playUntil(offered, (world) => world.offers[offerId] === undefined);
    expect(after.world.turn).toBe(returnsOnTurn);
    expect(ofType(played, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['taken']);
    expect(heroOf(after.world, hero.id).guildId).toBe(guild.id);
  });
});

describe('Under Offer (Q-G, Q-H)', () => {
  /** A priced Offer from the first Rival for the player's first Hero, under Contract. */
  function priced(seed: string) {
    const document = created(seed);
    const guild = player(document.world);
    const bidder = rival(document.world);
    bidder.wealth = 100_000;
    const hero = heroOf(document.world, guild.rosterIds[0] as HeroId);
    const result = accepted(applyAction(document, { kind: 'offerTransfer', guildId: bidder.id, heroId: hero.id, years: 2 }, deps));
    const [offerId] = Object.keys(result.document.world.offers) as [OfferId];
    return { ...result, guild, bidder, hero, offerId };
  }

  test('dispatch refuses a Hero Under Offer, hero-unavailable because under-offer; the Best Party passes over them', () => {
    const { document, guild, hero } = priced('under-offer-dispatch');
    const quest = openQuest(document.world, guild);
    expect(refused(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds: [hero.id] })).toEqual({
      action: 'dispatch',
      reason: 'hero-unavailable',
      heroId: hero.id,
      because: 'under-offer',
    });
    expect(availableHeroes(document.world, guild).map((each) => each.id)).not.toContain(hero.id);
    expect(partyPool(document.world, guild, deps).map((each) => each.id)).not.toContain(hero.id);
    expect(availableHeroes(document.world, guild)).toHaveLength(guild.rosterIds.length - 1);
  });

  test('free to go again at each end of the Offer: declined, expired, withdrawn by a renewal', () => {
    const declined = priced('under-offer-declined');
    const afterDecline = accepted(applyAction(declined.document, { kind: 'declineTransfer', guildId: declined.guild.id, offerId: declined.offerId }, deps));
    expect(unavailability(heroOf(afterDecline.document.world, declined.hero.id), afterDecline.document.world)).toBeNull();

    const expired = priced('under-offer-expired');
    const { document: afterExpiry, events } = playUntil(expired.document, (world) => world.offers[expired.offerId] === undefined);
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['expired']);
    expect(unavailability(heroOf(afterExpiry.world, expired.hero.id), afterExpiry.world)).toBeNull();

    const renewed = freeOffered('under-offer-renewed');
    expect(unavailability(heroOf(renewed.document.world, renewed.hero.id), renewed.document.world)).toBe('under-offer');
    const afterRenewal = accepted(applyAction(renewed.document, { kind: 'renew', guildId: renewed.guild.id, heroId: renewed.hero.id, years: 2 }, deps));
    expect(unavailability(heroOf(afterRenewal.document.world, renewed.hero.id), afterRenewal.document.world)).toBeNull();
  });

  test('an Offer for a Hero away: made, Under Offer from their return, its Days counted from that night; accepted only once home', () => {
    const document = created('under-offer-away');
    const guild = player(document.world);
    const bidder = rival(document.world);
    bidder.wealth = 100_000;
    const hero = heroOf(document.world, guild.rosterIds[0] as HeroId);
    const away = sendAway(document, guild, hero);
    const partyId = heroOf(away.world, hero.id).partyId as keyof World['parties'];
    const returnsOnTurn = away.world.parties[partyId]?.returnsOnTurn as number;

    const { document: offered } = accepted(applyAction(away, { kind: 'offerTransfer', guildId: bidder.id, heroId: hero.id, years: 2 }, deps));
    const [offerId] = Object.keys(offered.world.offers) as [OfferId];
    expect(offered.world.offers[offerId]?.expiresOnTurn).toBe(nightOf(dayOf(returnsOnTurn) + 3));
    expect(unavailability(heroOf(offered.world, hero.id), offered.world)).toBe('in-party');
    expect(refused(offered, { kind: 'acceptTransfer', guildId: guild.id, offerId })).toMatchObject({ reason: 'hero-in-party' });

    const { document: home } = playUntil(offered, (world) => world.turn > returnsOnTurn);
    expect(heroOf(home.world, hero.id).partyId).toBeNull();
    expect(unavailability(heroOf(home.world, hero.id), home.world)).toBe('under-offer');
    expect(home.world.offers[offerId]).toBeDefined();

    const { document: after, events } = playUntil(home, (world) => world.offers[offerId] === undefined);
    expect(after.world.turn).toBe(nightOf(dayOf(returnsOnTurn) + 3));
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => event.payload.cause)).toEqual(['expired']);
    expect(unavailability(heroOf(after.world, hero.id), after.world)).toBeNull();
  });
});
