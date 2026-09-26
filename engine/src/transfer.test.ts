import { describe, expect, test } from 'vitest';
import { applyGuildAction } from './actions/action.js';
import { applyOfferTransfer } from './actions/transfer.js';
import { advance } from './advance.js';
import type { EngineDeps, GameConfig } from './config.js';
import { rivalChoices } from './controllers/rival.js';
import { createWorld } from './create.js';
import {
  compareByCodeUnit,
  takeId,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type OfferId,
  type World,
  type WorldDocument,
} from './document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from './events.js';
import { fastForward } from './fast-forward.js';
import { offerExpiry } from './phases/offer-expiry.js';
import { phaseContext } from './phases/phase.js';
import { next } from './rng.js';
import { playerGuild, transferFee } from './selectors.js';
import { transferOfferStop } from './stops.js';
import { nightOf, timeOfDay } from './time.js';
import { deepFreeze, heroStatKeys, testDeps, thriftyRivals, withDispositions, withValid } from './world.test-support.js';

// M6-S2 beyond the actions (actions/transfer.test.ts): Transfer Offers expiring at night and lapsing
// when their Hero or a Guild goes, the fold withdrawing them, fast forward's `transfer-offer` stop,
// and the Rivals using the same Transfer rules in `rivalChoices` (DL-57). Every document a test makes
// is held to the validator; the config the tests rely on is pinned.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

const pins: Partial<GameConfig> = { negotiationRange: 0, marketSize: 0, transferFeeFactor: 2, transferOfferDays: 3 };

/** Rivals who deal whenever they would hire, and would hire at any Wealth: every weighing a Transfer. */
const dealing = withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000 });

/** Rivals who neither deal, recruit nor build: for tests whose subject is an offer already made. */
const still = withDispositions({ ...thriftyRivals, transferAppetite: 0 });

function created(seed: string, deps: EngineDeps): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

function player(world: World): Guild {
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error("No player's Guild");
  return guild;
}

function rivals(world: World): Guild[] {
  const playerId = player(world).id;
  return Object.values(world.guilds)
    .filter((guild) => guild.id !== playerId)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

function guildOf(world: World, guildId: GuildId): Guild {
  const guild = world.guilds[guildId];
  if (guild === undefined) throw new Error(`No Guild ${guildId}`);
  return guild;
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

/** Makes `hero` the dearest Hero in any Transfer: every base Stat at the top of its range. */
function dearest(hero: Hero): void {
  for (const key of heroStatKeys) hero.stats[key] = 20;
}

/** `rival`'s offer for `heroId`, applied to `world` in place; its id. */
function offerFor(world: World, rival: Guild, heroId: HeroId, deps: EngineDeps): OfferId {
  const result = applyOfferTransfer(world, { guildId: rival.id, heroId }, deps);
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
  const [offered] = ofType(result.events, 'guild.transfer-offered');
  if (offered === undefined) throw new Error('No offer');
  return offered.payload.offerId;
}

// ── Offers at night ──────────────────────────────────────────────────────────────────────────

describe('Transfer Offers at night (offerExpiry)', () => {
  test('an offer stands through the night of its last Day and is removed that night with guild.transfer-offer-expired', () => {
    const deps = testDeps(pins, still);
    let document = created('expiry', deps);
    const [rival] = rivals(document.world) as [Guild];
    rival.wealth = 10_000;
    const [heroId] = player(document.world).rosterIds as [HeroId];
    const offerId = offerFor(document.world, rival, heroId, deps);
    const expiresOnTurn = document.world.offers[offerId]?.expiresOnTurn ?? -1;
    expect(expiresOnTurn).toBe(nightOf(2));
    document = withValid(document, deps);

    const expired: EngineEventOf<'guild.transfer-offer-expired'>[] = [];
    while (document.world.turn < expiresOnTurn) {
      expect(document.world.offers[offerId], `Turn ${document.world.turn}`).toBeDefined();
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      expired.push(...ofType(result.events, 'guild.transfer-offer-expired'));
    }

    expect(document.world.turn).toBe(expiresOnTurn);
    expect(timeOfDay(expiresOnTurn)).toBe('night');
    expect(document.world.offers).toEqual({});
    expect(expired.map((event) => [event.turn, event.payload.offerId, event.payload.cause])).toEqual([[expiresOnTurn, offerId, 'expired']]);
    expect(expired[0]?.participants.slice(0, 4)).toEqual([offerId, heroId, player(document.world).id, rival.id]);
  });

  test("an offer whose Hero has left the Roster it was made for lapses that night, for hero-left", () => {
    const deps = testDeps(pins, still);
    const document = created('lapse', deps);
    const world = structuredClone(document.world);
    const [rival] = rivals(world) as [Guild];
    rival.wealth = 10_000;
    const guild = player(world);
    const [dying, staying] = guild.rosterIds as [HeroId, HeroId];
    const doomed = offerFor(world, rival, dying, deps);
    const standing = offerFor(world, rivals(world)[1] as Guild, staying, deps);
    // Killed on a Quest tonight: off the Roster, keeping their Guild (DL-20 item 3).
    world.turn = nightOf(0);
    heroOf(world, dying).diedOnTurn = world.turn;
    guild.rosterIds = guild.rosterIds.filter((id) => id !== dying);

    const events = offerExpiry(world, phaseContext(world, deps));

    expect(events.map((event) => [event.type, (event as EngineEventOf<'guild.transfer-offer-expired'>).payload.cause])).toEqual([
      ['guild.transfer-offer-expired', 'hero-left'],
    ]);
    expect(Object.keys(world.offers)).toEqual([standing]);
    expect(world.offers[doomed]).toBeUndefined();
  });
});

// ── The fold (DL-54) ─────────────────────────────────────────────────────────────────────────

describe('a fold withdraws the Transfer Offers that name the folding Guild (DL-54, DL-57)', () => {
  test('every offer it made or was asked, before its Heroes are released and guild.folded; others stand', () => {
    const deps = testDeps({ ...pins, bankruptcyGraceDays: 0 }, still);
    let document = created('fold-offers', deps);
    const { world } = document;
    const [folding, other] = rivals(world) as [Guild, Guild];
    folding.wealth = 10_000;
    other.wealth = 10_000;
    const [first, second] = player(world).rosterIds as [HeroId, HeroId];
    const made = offerFor(world, folding, first, deps);
    const standing = offerFor(world, other, second, deps);
    // An offer the folding Guild is asked, for one of its Heroes (the data model allows one either
    // way; M6-S2's Rivals only make them).
    const [theirs] = folding.rosterIds as [HeroId];
    const asked = takeId(world, 'offers');
    world.offers[asked] = {
      id: asked,
      kind: 'transfer',
      fromGuildId: folding.id,
      toGuildId: other.id,
      heroId: theirs,
      fee: 100,
      offeredOnTurn: 0,
      expiresOnTurn: nightOf(2),
    };
    folding.wealth = deps.config.bankruptcyFloor - 1; // below the floor from the first night
    document = withValid(document, deps);

    let events: EngineEvent[] = [];
    while (document.world.turn < nightOf(0)) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events = events.concat(result.events);
    }

    expect(guildOf(document.world, folding.id).foldedOnTurn).toBe(nightOf(0));
    expect(Object.keys(document.world.offers)).toEqual([standing]);
    const withdrawn = ofType(events, 'guild.transfer-offer-expired');
    expect(withdrawn.map((event) => [event.payload.offerId, event.payload.cause])).toEqual([
      [made, 'guild-folded'],
      [asked, 'guild-folded'],
    ]);
    // In the fold's order: the offers go before its Heroes leave and before guild.folded.
    const types = events.map((event) => event.type);
    const lastWithdrawn = types.lastIndexOf('guild.transfer-offer-expired');
    expect(lastWithdrawn).toBeLessThan(types.indexOf('hero.left-guild'));
    expect(lastWithdrawn).toBeLessThan(types.indexOf('guild.folded'));
  });
});

// ── Fast forward (approach §2) ───────────────────────────────────────────────────────────────

describe("fast forward's transfer-offer stop", () => {
  test("stops, always on, the Turn a Rival makes an offer for a Hero of the watched Guild, naming it", () => {
    // One Rival, which wants a Hero whenever it weighs one; the only Guild it can ask is the player's.
    const deps = testDeps({ ...pins, rivalCount: 1 }, dealing);
    const document = created('ff-offer', deps);
    const [rival] = rivals(document.world) as [Guild];
    rival.wealth = 10_000;
    const guildId = player(document.world).id;

    const result = fastForward(document, { guildId, until: [], maxTurns: 30 }, deps);

    const after = withValid(result.document, deps);
    const offered = ofType(result.events, 'guild.transfer-offered');
    expect(offered.length).toBe(1);
    const offerId = offered[0]?.payload.offerId as OfferId;
    expect(result.stoppedBecause).toEqual({ kind: 'transfer-offer', guildId, offerIds: [offerId] });
    expect(after.world.turn).toBe(offered[0]?.turn);
    expect(after.world.offers[offerId]).toMatchObject({ fromGuildId: guildId, toGuildId: rival.id });
  });

  test('an offer to another Guild, or one standing from an earlier Turn, stops nothing', () => {
    const offered = {
      type: 'guild.transfer-offered',
      payload: { offerId: 'offer-000001', fromGuildId: 'guild-000002', toGuildId: 'guild-000003' },
    } as unknown as EngineEvent;

    expect(transferOfferStop([offered], 'guild-000001' as GuildId)).toBeNull();
    expect(transferOfferStop([], 'guild-000002' as GuildId)).toBeNull();
    expect(transferOfferStop([offered], 'guild-000002' as GuildId)).toEqual({
      kind: 'transfer-offer',
      guildId: 'guild-000002',
      offerIds: ['offer-000001'],
    });
  });
});

// ── The Rivals (rivalChoices) ────────────────────────────────────────────────────────────────

describe('Rivals use the same Transfer rules (rivalChoices)', () => {
  /** A world with an empty Board, so that no Rival dispatches and a draw is only a Transfer's. */
  function scene(seed: string, deps: EngineDeps) {
    const { world } = created(seed, deps);
    world.board = [];
    const [rival, other] = rivals(world) as [Guild, Guild];
    rival.wealth = 10_000;
    return { world, rival, other, guild: player(world) };
  }

  test("takes the dearest Hero it can pay for from a Rival that consents, by transferIn, drawing once from rivals and nothing else", () => {
    const deps = testDeps(pins, dealing);
    const { world, rival, other } = scene('rival-in', deps);
    const [wanted] = other.rosterIds as [HeroId];
    dearest(heroOf(world, wanted));
    const before = structuredClone(world);
    for (const [key, value] of Object.entries(world)) if (key !== 'rng') deepFreeze(value);
    for (const [name, state] of Object.entries(world.rng)) if (name !== 'rivals') deepFreeze(state);

    const choices = rivalChoices(world, rival, deps);

    expect(choices).toEqual([{ kind: 'transferIn', guildId: rival.id, heroId: wanted }]);
    const drawn = structuredClone(before.rng.rivals);
    next(drawn);
    expect(world).toEqual({ ...before, rng: { ...before.rng, rivals: drawn } });
    const applied = structuredClone(before);
    applied.rng.rivals = drawn;
    expect(applyGuildAction(applied, choices[0] as never, deps)).toMatchObject({ ok: true });
    expect(heroOf(applied, wanted).guildId).toBe(rival.id);
  });

  test("makes an offer for a Hero of a Guild that answers for itself, and no other while it stands", () => {
    const deps = testDeps(pins, dealing);
    const { world, rival, guild } = scene('rival-offer', deps);
    const [wanted] = guild.rosterIds as [HeroId];
    dearest(heroOf(world, wanted));

    const choices = rivalChoices(world, rival, deps);
    expect(choices).toEqual([{ kind: 'offerTransfer', guildId: rival.id, heroId: wanted }]);
    expect(applyGuildAction(world, choices[0] as never, deps)).toMatchObject({ ok: true });
    expect(Object.values(world.offers).map((offer) => [offer.toGuildId, offer.heroId])).toEqual([[rival.id, wanted]]);

    // Its offer stands: it weighs no Transfer and draws nothing, and hires from the pool instead.
    const rng = structuredClone(world.rng.rivals);
    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['recruit']);
    expect(world.rng.rivals).toEqual(rng);
  });

  test('with no appetite for Transfers it weighs none and draws nothing', () => {
    const deps = testDeps(pins, withDispositions({ transferAppetite: 0, recruitThreshold: 0, buildThreshold: 1_000_000 }));
    const { world, rival, other } = scene('rival-none', deps);
    dearest(heroOf(world, other.rosterIds[0] as HeroId));
    const rng = structuredClone(world.rng.rivals);

    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['recruit']);
    expect(world.rng.rivals).toEqual(rng);
  });

  test('in debt, transfers its dearest Hero at home out to the Guild that consents and pays most, by transferOut', () => {
    const deps = testDeps(pins, dealing);
    const { world, rival } = scene('rival-debt', deps);
    rival.wealth = -100;
    rival.belowFloorSince = 0;
    const [, leaving] = rival.rosterIds as [HeroId, HeroId];
    dearest(heroOf(world, leaving));
    // Every other Rival consents and, at an even Negotiation, pays alike: the lowest Guild id that can
    // pay takes them.
    const [poor, taker] = rivals(world).filter((guild) => guild.id !== rival.id) as [Guild, Guild];
    for (const other of rivals(world)) if (other.id !== rival.id) other.wealth = 10_000;
    expect(rivalChoices(world, rival, deps)).toEqual([{ kind: 'transferOut', guildId: rival.id, heroId: leaving, toGuildId: poor.id }]);
    poor.wealth = 1;

    const choices = rivalChoices(world, rival, deps);

    expect(choices).toEqual([{ kind: 'transferOut', guildId: rival.id, heroId: leaving, toGuildId: taker.id }]);
    const fee = transferFee(heroOf(world, leaving), world.guildmasters[taker.guildmasterId], deps);
    expect(applyGuildAction(world, choices[0] as never, deps)).toMatchObject({ ok: true });
    expect(guildOf(world, rival.id).wealth).toBe(-100 + fee);
  });

  test('over twenty Days of Rivals dealing whenever they would hire, every choice is accepted and every document valid', () => {
    const deps = testDeps(pins, dealing);
    let document = created('rivals-deal', deps);
    // The player's Heroes the cheapest in the world, so that the Rivals want one another's: a Rival
    // with an offer standing for the player's weighs no other Transfer until it goes.
    for (const heroId of player(document.world).rosterIds) {
      for (const key of heroStatKeys) heroOf(document.world, heroId).stats[key] = 1;
    }
    document = withValid(document, deps);
    const events: EngineEvent[] = [];
    while (document.world.turn < nightOf(20)) {
      if (timeOfDay(document.world.turn + 1) === 'afternoon') {
        // The afternoon's choices as the phase will make them, each checked to be accepted.
        const world = structuredClone(document.world);
        world.turn += 1;
        for (const rival of rivals(world)) {
          for (const action of rivalChoices(world, rival, deps)) {
            expect(applyGuildAction(world, action, deps), `${action.kind} on Turn ${world.turn}`).toMatchObject({ ok: true });
          }
        }
      }
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events.push(...result.events);
    }

    const transferred = ofType(events, 'hero.transferred');
    expect(transferred.length).toBeGreaterThan(0);
    // The player's Guild, idle, answers no offer, so no Hero leaves it or joins it.
    const playerId = player(document.world).id;
    expect(transferred.every((event) => event.payload.fromGuildId !== playerId && event.payload.toGuildId !== playerId)).toBe(true);
  });
});
