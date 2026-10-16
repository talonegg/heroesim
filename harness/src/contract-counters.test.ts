import {
  compareByCodeUnit,
  createWorld,
  milestoneTypes,
  type EngineEventType,
  type EntityId,
  type Guild,
  type Hero,
  type HeroId,
  type WorldDocument,
} from '@heroesim/engine';
import { append, makeId } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { counterOf, type Counter } from './counter.js';
import { noContracts, type ContractDays } from './counters.js';
import { gameCounters } from './game-counters.js';
import { coreDeps, countGame, observerOf } from './harness.test-support.js';

// The Contracts' lines (DL-321), each derived over a small hand-built History or World State: the
// player's Guild and the Rivals counted apart. A Day is three Turns, Turn 3k a morning.

const deps = coreDeps;

/** The game's counter `key` alone, read from a History that holds only the entries it reads. */
const only = (key: string): Counter[] => [counterOf(gameCounters, key) as Counter];

interface Fixture {
  document: WorldDocument;
  player: Guild;
  rival: Guild;
  other: Guild;
}

function fixture(seed: string): Fixture {
  const { document } = createWorld(seed, harnessSetup, deps);
  const guilds = Object.values(document.world.guilds).sort((a, b) => compareByCodeUnit(a.id, b.id));
  const player = guilds.find((guild) => guild.controller.kind === 'player');
  const [rival, other] = guilds.filter((guild) => guild.controller.kind === 'rival');
  if (player === undefined || rival === undefined || other === undefined) throw new Error('Not a player and two Rivals');
  return { document, player, rival, other };
}

/** Appends an entry of `type` at `turn`, naming `participants`. */
function add(document: WorldDocument, turn: number, type: EngineEventType, participants: EntityId[], payload: object): void {
  append(document.history, { turn, type, participants, labels: {}, milestone: milestoneTypes[type], payload });
}

/** The side a Rival is counted under: its Disposition. */
const sideOf = (guild: Guild): string => (guild.controller.kind === 'rival' ? guild.controller.disposition : 'player');

const terms = (wage: number, years: number) => ({ wage, years, endDay: 100 });

describe('contractCounters: the Contracts signed, ended and let go, by side', () => {
  test('signings by kind and length, expiries and releases count for the Guild each names, a Transfer for the Guild that signs', () => {
    const { document, player, rival, other } = fixture('contracts-signed');
    const [p1, p2] = player.rosterIds;
    const [r1] = rival.rosterIds;
    const [o1] = other.rosterIds;
    if (p1 === undefined || p2 === undefined || r1 === undefined || o1 === undefined) throw new Error('Rosters too short');
    const recruited = (turn: number, guild: Guild, heroId: HeroId, years: number): void =>
      add(document, turn, 'hero.recruited', [heroId, guild.id], { heroId, guildId: guild.id, fee: 100, ...terms(20, years) });
    const renewed = (turn: number, guild: Guild, heroId: HeroId, years: number): void =>
      add(document, turn, 'hero.contract-renewed', [heroId, guild.id], { heroId, guildId: guild.id, ...terms(20, years) });
    const transferred = (turn: number, from: Guild, to: Guild, heroId: HeroId, years: number): void =>
      add(document, turn, 'hero.transferred', [heroId, from.id, to.id], { heroId, fromGuildId: from.id, toGuildId: to.id, fee: 50, offerId: null, ...terms(20, years) });
    recruited(1, player, p1, 2);
    recruited(2, rival, r1, 1);
    recruited(3, other, o1, 1);
    renewed(4, player, p1, 3);
    renewed(5, rival, r1, 2);
    renewed(6, rival, r1, 2);
    transferred(7, player, rival, p2, 3); // the Rival signs it
    transferred(8, rival, player, r1, 1); // the player signs it
    add(document, 9, 'hero.contract-expired', [p1, player.id], { heroId: p1, guildId: player.id, wage: 22 });
    add(document, 9, 'hero.contract-expired', [r1, rival.id], { heroId: r1, guildId: rival.id, wage: 22 });
    add(document, 10, 'hero.contract-expired', [o1, other.id], { heroId: o1, guildId: other.id, wage: 22 });
    add(document, 11, 'hero.released', [p2, player.id], { heroId: p2, guildId: player.id, payout: 80 });
    add(document, 12, 'hero.released', [o1, other.id], { heroId: o1, guildId: other.id, payout: 0 });
    document.world.turn = 15;

    const { contracts } = countGame(document, deps, undefined, undefined, only('contracts'));

    expect(contracts).toEqual({
      player: { signed: { recruited: { 2: 1 }, transferred: { 1: 1 }, renewed: { 3: 1 } }, expired: 1, released: 1 },
      rival: { signed: { recruited: { 1: 2 }, transferred: { 3: 1 }, renewed: { 2: 2 } }, expired: 2, released: 1 },
    });
  });

  test('a new world has signed nothing', () => {
    const { document } = fixture('contracts-new');

    expect(countGame(document, deps, undefined, undefined, only('contracts')).contracts).toEqual({ player: noContracts(), rival: noContracts() });
  });
});

describe('freeOfferCounters: the Offers made for a Hero Out of Contract', () => {
  test('an Offer is free when the Hero was Out of Contract as it was made, however its fee reads; a renewal or a Transfer ends that', () => {
    const { document, player, rival, other } = fixture('contracts-free-offers');
    const [a, b, c, d] = player.rosterIds;
    // The History names a Hero by id alone; a fifth is one the Rival's Roster holds.
    const [e] = other.rosterIds;
    if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined) throw new Error('Rosters too short');
    const offered = (turn: number, n: number, maker: Guild, heroId: HeroId, fee: number): void =>
      add(document, turn, 'guild.transfer-offered', [makeId('offers', n), heroId, player.id, maker.id], {
        offerId: makeId('offers', n),
        fromGuildId: player.id,
        toGuildId: maker.id,
        heroId,
        fee,
        expiresOnTurn: turn + 8,
      });
    const ended = (turn: number, n: number, maker: Guild, heroId: HeroId, cause: string): void =>
      add(document, turn, 'guild.transfer-offer-expired', [makeId('offers', n), heroId, player.id, maker.id], {
        offerId: makeId('offers', n),
        fromGuildId: player.id,
        toGuildId: maker.id,
        heroId,
        fee: 0,
        cause,
      });
    const expired = (turn: number, heroId: HeroId): void =>
      add(document, turn, 'hero.contract-expired', [heroId, player.id], { heroId, guildId: player.id, wage: 22 });
    const renewed = (turn: number, heroId: HeroId): void =>
      add(document, turn, 'hero.contract-renewed', [heroId, player.id], { heroId, guildId: player.id, ...terms(20, 2) });

    // a: under Contract, a priced Offer at a fee of 0 (a Contract with nothing left) is not free.
    offered(1, 1, rival, a, 0);
    // b: Out of Contract from Turn 2, a free Offer by a Rival withdrawn by a renewal.
    expired(2, b);
    offered(3, 2, rival, b, 0);
    ended(3, 2, rival, b, 'renewed');
    renewed(3, b);
    // b again, under a new Contract: an Offer for them is not free.
    offered(4, 3, other, b, 0);
    // b's new Contract ends too: an Offer for them is free again.
    expired(5, b);
    offered(5, 8, other, b, 0);
    // c: Out of Contract, a free Offer taken, its Transfer after.
    expired(5, c);
    offered(6, 4, other, c, 0);
    ended(6, 4, other, c, 'taken');
    add(document, 6, 'hero.transferred', [c, player.id, other.id], {
      heroId: c,
      fromGuildId: player.id,
      toGuildId: other.id,
      fee: 0,
      offerId: makeId('offers', 4),
      ...terms(20, 1),
    });
    // d: Out of Contract, a free Offer left standing, then a second.
    expired(7, d);
    offered(8, 5, rival, d, 0);
    offered(9, 6, other, d, 0);
    // e: Out of Contract, released, signed again by the Guild with a recruit, then offered for: not free.
    expired(10, e);
    add(document, 11, 'hero.released', [e, player.id], { heroId: e, guildId: player.id, payout: 0 });
    add(document, 12, 'hero.recruited', [e, player.id], { heroId: e, guildId: player.id, fee: 100, ...terms(20, 1) });
    offered(13, 7, rival, e, 0);
    document.world.turn = 15;

    const { freeOffers } = countGame(document, deps, undefined, undefined, only('freeOffers'));

    expect(sideOf(rival)).not.toBe(sideOf(other));
    expect(freeOffers).toEqual({
      [sideOf(rival)]: { player: { made: 2, renewed: 1, taken: 0 } },
      [sideOf(other)]: { player: { made: 3, renewed: 0, taken: 1 } },
    });
  });

  test('a new world has made none', () => {
    const { document } = fixture('contracts-no-free-offers');

    expect(countGame(document, deps, undefined, undefined, only('freeOffers')).freeOffers).toEqual({});
  });
});

describe('observeContractDays: the Heroes Out of Contract and Under Offer, as each Day begins', () => {
  /** Every Hero of every Roster at Level 1 on a wage of 20 that ends on Day 20. */
  function arranged(seed: string): Fixture & { heroes: Hero[] } {
    const made = fixture(seed);
    const heroes = Object.values(made.document.world.guilds).flatMap((guild) => guild.rosterIds.map((id) => made.document.world.heroes[id] as Hero));
    for (const hero of heroes) {
      hero.level = 1;
      hero.contract = { wage: 20, signedOnTurn: 0, years: 2, endDay: 20 };
    }
    return { ...made, heroes };
  }

  test('Hero-Days and Guild-Days Out of Contract and Under Offer, and the wage in force by Level, each side apart', () => {
    const { document, player, rival, other } = arranged('contract-days');
    const [a, b, c] = player.rosterIds.map((id) => document.world.heroes[id] as Hero);
    if (a === undefined || b === undefined || c === undefined) throw new Error('Roster too short');
    // Turn 30 is a morning of Day 10. a's Contract ended on Day 9's night (Turn 29): Out of Contract, at Level 2 on a wage of 30.
    a.level = 2;
    a.contract = { wage: 30, signedOnTurn: 0, years: 1, endDay: 9 };
    // b ends on Day 10, whose night is Turn 32: still under Contract. A priced Offer stands for b, and for c, who is away.
    b.contract = { wage: 20, signedOnTurn: 0, years: 1, endDay: 10 };
    for (const hero of [b, c]) {
      const id = makeId('offers', hero === b ? 1 : 2);
      document.world.offers[id] = { id, kind: 'transfer', fromGuildId: player.id, toGuildId: rival.id, heroId: hero.id, fee: 100, years: 2, offeredOnTurn: 29, expiresOnTurn: 35 };
    }
    c.partyId = makeId('parties', 1);
    // One of the Rival's Heroes is Out of Contract too, with a free Offer standing for it.
    const [r] = rival.rosterIds.map((id) => document.world.heroes[id] as Hero);
    if (r === undefined) throw new Error('Roster too short');
    r.contract = { wage: 25, signedOnTurn: 0, years: 1, endDay: 9 };
    const free = makeId('offers', 3);
    document.world.offers[free] = { id: free, kind: 'transfer', fromGuildId: rival.id, toGuildId: other.id, heroId: r.id, fee: 0, years: 2, offeredOnTurn: 29, expiresOnTurn: 35 };
    const observer = observerOf('contractDays');

    document.world.turn = 30;
    observer.beforeChoices?.({ document, deps });

    const guilds = Object.values(document.world.guilds);
    const rosters = (kind: 'player' | 'rival'): number =>
      guilds.filter((guild) => guild.controller.kind === kind).reduce((total, guild) => total + guild.rosterIds.length, 0);
    expect(observer.value().player).toEqual<ContractDays>({
      guildDays: 1,
      heroDays: rosters('player'),
      outOfContractDays: 1,
      guildDaysOutOfContract: 1,
      underOfferDays: 1, // b; c is away, so not yet Under Offer
      guildDaysUnderOffer: 1,
      wages: { 1: { heroDays: rosters('player') - 1, wage: 20 * (rosters('player') - 1) }, 2: { heroDays: 1, wage: 30 } },
    });
    const rivals = guilds.filter((guild) => guild.controller.kind === 'rival').length;
    expect(observer.value().rival).toEqual<ContractDays>({
      guildDays: rivals,
      heroDays: rosters('rival'),
      outOfContractDays: 1,
      guildDaysOutOfContract: 1,
      underOfferDays: 1,
      guildDaysUnderOffer: 1,
      wages: { 1: { heroDays: rosters('rival'), wage: 20 * (rosters('rival') - 1) + 25 } },
    });
  });

  test('Under Offer is read at every Turn, each Hero and Guild once a Day, as an Offer a Rival makes in the afternoon stands at the choices; the rest at a morning alone', () => {
    const { document, player, rival, other } = arranged('contract-days-turns');
    const [b, d] = player.rosterIds.map((id) => document.world.heroes[id] as Hero);
    const [o] = other.rosterIds.map((id) => document.world.heroes[id] as Hero);
    if (b === undefined || d === undefined || o === undefined) throw new Error('Rosters too short');
    const offer = (n: number, hero: Hero, from: Guild): void => {
      const id = makeId('offers', n);
      document.world.offers[id] = { id, kind: 'transfer', fromGuildId: from.id, toGuildId: rival.id, heroId: hero.id, fee: 100, years: 2, offeredOnTurn: 30, expiresOnTurn: 38 };
    };
    const observer = observerOf('contractDays');
    const at = (turn: number): void => {
      document.world.turn = turn;
      observer.beforeChoices?.({ document, deps });
    };

    offer(1, b, player);
    at(30); // Day 10's morning: b
    const morning = observer.value();
    expect(morning.player).toMatchObject({ guildDays: 1, underOfferDays: 1, guildDaysUnderOffer: 1 });
    expect(morning.rival).toMatchObject({ underOfferDays: 0, guildDaysUnderOffer: 0 });
    const { heroDays } = morning.player;
    offer(2, d, player);
    offer(3, o, other);
    at(31); // its afternoon: d and o, b counted already this Day
    at(32); // its night: nobody new
    expect(observer.value().player).toMatchObject({ guildDays: 1, heroDays, underOfferDays: 2, guildDaysUnderOffer: 1 });
    expect(observer.value().rival).toMatchObject({ underOfferDays: 1, guildDaysUnderOffer: 1 });
    at(33); // Day 11's morning: b, d and o again
    expect(observer.value().player).toMatchObject({ guildDays: 2, heroDays: 2 * heroDays, underOfferDays: 4, guildDaysUnderOffer: 2 });
    expect(observer.value().rival).toMatchObject({ underOfferDays: 2, guildDaysUnderOffer: 2 });
  });

  test('a Guild that has folded is not sampled, and a Hero with no Contract adds no wage', () => {
    const { document, player, other, heroes } = arranged('contract-days-folded');
    other.foldedOnTurn = 10;
    const [a] = player.rosterIds.map((id) => document.world.heroes[id] as Hero);
    if (a === undefined) throw new Error('Roster too short');
    a.contract = null;
    document.world.turn = 30;
    const observer = observerOf('contractDays');

    observer.beforeChoices?.({ document, deps });

    expect(heroes.length).toBeGreaterThan(0);
    expect(observer.value().rival.guildDays).toBe(Object.values(document.world.guilds).filter((guild) => guild.controller.kind === 'rival' && guild.id !== other.id).length);
    expect(observer.value().rival.heroDays).toBe(
      Object.values(document.world.guilds)
        .filter((guild) => guild.controller.kind === 'rival' && guild.id !== other.id)
        .reduce((total, guild) => total + guild.rosterIds.length, 0),
    );
    expect(observer.value().player.wages[1]?.heroDays).toBe(player.rosterIds.length - 1);
    expect(observer.value().player.outOfContractDays).toBe(0);
  });
});
