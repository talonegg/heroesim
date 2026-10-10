import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import {
  compareByCodeUnit,
  type Guild,
  type GuildId,
  type Guildmaster,
  type Hero,
  type HeroId,
  type OfferId,
  type PartyId,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { addStack, holdings } from '../items.js';
import { baseStat, playerGuild, signingFee, transferFee } from '../selectors.js';
import { testDeps, withDispositions, withValid } from '../world.test-support.js';
import { applyAction, type Action } from './action.js';
import type { ActionResult, Rejection } from './result.js';

// Transfers in both directions, the Morale they cost, the Guildmasters' Regard they raise, and
// the Transfer Offers a Guild that answers for itself receives (R28, INPUTS 7.6, pre-M0 review D5,
// DL-57). Every document a test makes is held to the validator; the numbers the tests rely on are
// pinned here, and Negotiation is stilled unless a test is about it.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** The config the tests rely on, pinned against a balance pass. */
const pins: Partial<GameConfig> = {
  negotiationRange: 0,
  marketSize: 0,
  startingRosterSize: 4,
  transferFeeFactor: 2,
  transferMoraleCost: -15,
  transferRegardBand: 'warm',
  guildmasterRegardPerTransferDeal: 2,
  transferOfferDays: 3,
  transferLockDays: 30,
  moraleMin: 0,
  moraleMax: 100,
  moraleBands: { wretched: 0, low: 20, steady: 40, high: 75, elated: 90 },
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
};

/**
 * Every Rival deals whenever it is asked: an appetite of 1 (it lets any Hero go but its last, and takes
 * into any Roster) and a recruit threshold of 0 (any Wealth above nothing is enough to hire).
 */
const deps = testDeps(pins, withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000 }));

function created(seed: string, with_: EngineDeps = deps): WorldDocument {
  return withValid(createWorld(seed, setup, with_).document, with_);
}

function player(world: World): Guild {
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error("No player's Guild");
  return guild;
}

/** Every Rival, by Guild id. */
function rivals(world: World): Guild[] {
  const playerId = player(world).id;
  return Object.values(world.guilds)
    .filter((guild) => guild.id !== playerId)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

function firstRival(world: World): Guild {
  const [rival] = rivals(world);
  if (rival === undefined) throw new Error('No Rival');
  return rival;
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

function rosterOf(world: World, guild: Guild): Hero[] {
  return guild.rosterIds.map((heroId) => heroOf(world, heroId));
}

function guildOf(world: World, guildId: GuildId): Guild {
  const guild = world.guilds[guildId];
  if (guild === undefined) throw new Error(`No Guild ${guildId}`);
  return guild;
}

/** The Wealth of every Guild together. */
const totalWealth = (world: World): number => Object.values(world.guilds).reduce((sum, guild) => sum + guild.wealth, 0);

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

/** A Regard entry of `value` for `id`, as a shared Quest would leave it. */
function regardFor(hero: Hero, id: HeroId, value: number): void {
  hero.regard[id] = { value, since: 0, reason: 'quest.resolved' };
}

/** The document after a successful action, held to the validator; throws on a refusal. */
function accepted(result: ActionResult, with_: EngineDeps = deps): { document: WorldDocument; events: EngineEvent[] } {
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
  return { document: withValid(result.document, with_), events: result.events };
}

/** The rejection of the action `act` takes on `document`, having checked that it changed nothing. */
function refused(document: WorldDocument, act: () => ActionResult): Rejection {
  const before = JSON.stringify(document);
  const result = act();
  if (result.ok) throw new Error('Expected a refusal');
  expect(JSON.stringify(document)).toBe(before);
  return result.rejection;
}

/** The list price of a signing fee, before Negotiation and before rounding (DL-27), worked out here. */
function listPrice(hero: Hero, config: GameConfig, content: EngineDeps['content']): number {
  const statSum = Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .reduce((sum, stat) => sum + baseStat(hero.stats, stat), 0);
  return config.signingFeeBase + config.signingFeePerLevel * hero.level + statSum / config.signingFeeStatDivisor;
}

// ── The acceptance boxes ─────────────────────────────────────────────────────────────────────

describe('a Transfer out', () => {
  // The story's first box.
  test("a Transfer out of a close Hero lowers the Morale of their friends and no one else's", () => {
    const document = created('friends');
    const { world } = document;
    const guild = player(world);
    const rival = firstRival(world);
    rival.wealth = 10_000;
    const [leaving, close, warm, cool, stranger] = [...rosterOf(world, guild), ...rosterOf(world, rival)];
    if (leaving === undefined || close === undefined || warm === undefined || cool === undefined || stranger === undefined) {
      throw new Error('Too few Heroes');
    }
    // The first four on the player's Roster, the fifth on the Rival's: the cool one stays behind with
    // the friends, so that their Morale standing still is the rule's doing, not their Roster's.
    expect(guild.rosterIds.slice(0, 4)).toEqual([leaving.id, close.id, warm.id, cool.id]);
    expect(rival.rosterIds).toContain(stranger.id);
    // Two friends: one close, one warm (the band's start, the lowest that pays); one who is cool
    // toward them; a Rival's Hero who is close to them but on another Roster. The leaving Hero is
    // close to the cool one, which is Regard held one way and costs the cool one nothing.
    regardFor(close, leaving.id, 15);
    regardFor(warm, leaving.id, 4);
    regardFor(cool, leaving.id, -13);
    regardFor(stranger, leaving.id, 15);
    regardFor(leaving, cool.id, 15);
    // The close friend falls from high to steady; the warm one stays steady.
    close.morale = 80;
    warm.morale = 60;
    const before = Object.fromEntries(Object.values(world.heroes).map((hero) => [hero.id, hero.morale]));

    const { document: after, events } = accepted(
      applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: leaving.id, toGuildId: rival.id }, deps),
    );

    const morale = Object.fromEntries(Object.values(after.world.heroes).map((hero) => [hero.id, hero.morale]));
    expect(morale).toEqual({ ...before, [close.id]: 65, [warm.id]: 45 });
    // Only a band crossing is told: the close friend's, high to steady, for the Transfer.
    expect(ofType(events, 'hero.morale-changed').map((event) => event.payload)).toEqual([
      { heroId: close.id, cause: 'transfer', before: 80, after: 65, bandBefore: 'high', bandAfter: 'steady' },
    ]);
  });

  // The story's second box, this way round.
  test("moves the Hero to the Rival's Roster for transferFee, paid to the Guild they leave: the document valid, the Wealth across Guilds unchanged", () => {
    const document = created('out');
    const guild = player(document.world);
    const rival = firstRival(document.world);
    rival.wealth = 10_000;
    const [hero] = rosterOf(document.world, guild);
    if (hero === undefined) throw new Error('No Hero');
    const fee = transferFee(hero, document.world.guildmasters[rival.guildmasterId], deps);
    const wealth = { leaving: guild.wealth, joining: rival.wealth, total: totalWealth(document.world) };

    const { document: after, events } = accepted(applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: rival.id }, deps));

    const { world } = after;
    expect(totalWealth(world)).toBe(wealth.total);
    expect(guildOf(world, guild.id).wealth).toBe(wealth.leaving + fee);
    expect(guildOf(world, rival.id).wealth).toBe(wealth.joining - fee);
    expect(guildOf(world, guild.id).rosterIds).not.toContain(hero.id);
    expect(guildOf(world, rival.id).rosterIds.at(-1)).toBe(hero.id);
    expect(heroOf(world, hero.id).guildId).toBe(rival.id);
    const [transferred] = ofType(events, 'hero.transferred');
    expect(transferred?.payload).toEqual({ heroId: hero.id, fromGuildId: guild.id, toGuildId: rival.id, fee, offerId: null });
    expect(transferred?.milestone).toBe(true);
    // The document given is left as it was (DL-24).
    expect(heroOf(document.world, hero.id).guildId).toBe(guild.id);
  });

  test('the cost holds Morale at moraleMin: a close friend at 5 ends at 0, still wretched, and nothing is told of it', () => {
    const document = created('floor');
    const { world } = document;
    const guild = player(world);
    const rival = firstRival(world);
    rival.wealth = 10_000;
    const [leaving, friend] = rosterOf(world, guild) as [Hero, Hero];
    regardFor(friend, leaving.id, 15);
    friend.morale = deps.config.moraleMin + 5;

    const { document: after, events } = accepted(applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: leaving.id, toGuildId: rival.id }, deps));

    expect(heroOf(after.world, friend.id).morale).toBe(deps.config.moraleMin);
    // 5 and 0 are both wretched (the pinned bands): no band crossed, so no event.
    expect(ofType(events, 'hero.morale-changed')).toEqual([]);
  });

  test('the gear the Hero carries stays with the Guild they leave (DL-49 item 8)', () => {
    const document = created('gear');
    const guild = player(document.world);
    const rival = firstRival(document.world);
    rival.wealth = 10_000;
    const [hero] = rosterOf(document.world, guild);
    if (hero === undefined) throw new Error('No Hero');
    addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: hero.id, slot: 'armour' });

    const { document: after, events } = accepted(applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: rival.id }, deps));

    expect(holdings(after.world, { kind: 'hero', id: hero.id })).toEqual({ items: [], stacks: [] });
    const vault = holdings(after.world, { kind: 'guild', id: guild.id });
    expect(vault.stacks.map((stack) => [stack.definitionKey, stack.quantity])).toEqual([['padded-jack', 1]]);
    expect(ofType(events, 'item.returned').map((event) => [event.payload.guildId, event.payload.cause])).toEqual([[guild.id, 'transferred']]);
    // Returned before the Hero left: the History tells the gear first, then the Transfer.
    expect(events.map((event) => event.type).slice(0, 2)).toEqual(['item.returned', 'hero.transferred']);
  });

  test('is refused, changing nothing, in its order: folded, same Guild, not on the Roster, in a Party, refused, too poor', () => {
    const document = created('out-refusals');
    const { world } = document;
    const guild = player(world);
    const [rival, other] = rivals(world) as [Guild, Guild];
    const [hero, second] = rosterOf(world, guild) as [Hero, Hero];
    const [theirs] = rosterOf(world, rival) as [Hero];
    const out = (heroId: HeroId, toGuildId: GuildId, with_ = deps) =>
      refused(document, () => applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId, toGuildId }, with_));

    expect(out(hero.id, guild.id)).toEqual({ action: 'transferOut', reason: 'same-guild', guildId: guild.id });
    expect(out(theirs.id, other.id)).toEqual({ action: 'transferOut', reason: 'hero-not-on-roster', heroId: theirs.id });
    second.partyId = 'party-000099' as PartyId;
    expect(out(second.id, rival.id)).toEqual({
      action: 'transferOut',
      reason: 'hero-in-party',
      heroId: second.id,
      partyId: 'party-000099',
    });
    second.partyId = null;
    // The Rival's consent to take the Hero in (`transferAnswer`): no appetite at all, or not rich enough to hire.
    const noAppetite = testDeps(pins, withDispositions({ transferAppetite: 0, recruitThreshold: 0 }));
    expect(out(hero.id, rival.id, noAppetite)).toMatchObject({ reason: 'transfer-refused', guildId: rival.id, side: 'in', because: 'roster-size' });
    const noHiring = testDeps(pins, withDispositions({ transferAppetite: 1, recruitThreshold: 1_000_000 }));
    expect(out(hero.id, rival.id, noHiring)).toMatchObject({ reason: 'transfer-refused', side: 'in', because: 'wealth' });
    rival.wealth = 1;
    expect(out(hero.id, rival.id)).toEqual({
      action: 'transferOut',
      reason: 'insufficient-wealth',
      guildId: rival.id,
      fee: transferFee(hero, world.guildmasters[rival.guildmasterId], deps),
      wealth: 1,
    });
    rival.foldedOnTurn = 0;
    expect(out(hero.id, rival.id)).toEqual({ action: 'transferOut', reason: 'guild-folded', guildId: rival.id });
    expect(() => applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: 'guild-000099' as GuildId }, deps)).toThrow(RangeError);
  });
});

describe('a Transfer in', () => {
  // The story's second box, the other way round.
  test("takes a Rival's Hero for transferFee, paid to the Rival: the document valid, the Wealth across Guilds unchanged", () => {
    const document = created('in');
    const guild = player(document.world);
    guild.wealth = 10_000;
    const rival = firstRival(document.world);
    const [hero, friend] = rosterOf(document.world, rival) as [Hero, Hero];
    regardFor(friend, hero.id, 12);
    friend.morale = 50;
    const fee = transferFee(hero, document.world.guildmasters[guild.guildmasterId], deps);
    const wealth = { joining: guild.wealth, leaving: rival.wealth, total: totalWealth(document.world) };

    const { document: after, events } = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: hero.id }, deps));

    const { world } = after;
    expect(totalWealth(world)).toBe(wealth.total);
    expect(guildOf(world, guild.id).wealth).toBe(wealth.joining - fee);
    expect(guildOf(world, rival.id).wealth).toBe(wealth.leaving + fee);
    expect(guildOf(world, guild.id).rosterIds.at(-1)).toBe(hero.id);
    expect(heroOf(world, hero.id).guildId).toBe(guild.id);
    expect(ofType(events, 'hero.transferred').map((event) => event.payload)).toEqual([
      { heroId: hero.id, fromGuildId: rival.id, toGuildId: guild.id, fee, offerId: null },
    ]);
    // The Rival's Roster pays the same Morale cost as the player's would.
    expect(heroOf(world, friend.id).morale).toBe(35);
  });

  test('asks the other Guild to consent, by its Disposition: an appetite of 0.5 lets a Hero go while it keeps two, and no further', () => {
    const half = testDeps(pins, withDispositions({ transferAppetite: 0.5, recruitThreshold: 0, buildThreshold: 1_000_000 }));
    let document = created('in-consent', half);
    const guildId = player(document.world).id;
    const rivalId = firstRival(document.world).id;
    guildOf(document.world, guildId).wealth = 100_000;

    // Kept Heroes times the appetite must reach one: a Roster of three lets one go (two kept), of two not.
    let taken = 0;
    while (guildOf(document.world, rivalId).rosterIds.length > 2) {
      const [heroId] = guildOf(document.world, rivalId).rosterIds as [HeroId];
      document = accepted(applyAction(document, { kind: 'transferIn', guildId, heroId }, half), half).document;
      taken += 1;
    }
    expect(taken).toBeGreaterThanOrEqual(2);
    const [heroId] = guildOf(document.world, rivalId).rosterIds as [HeroId];
    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId, heroId }, half))).toEqual({
      action: 'transferIn',
      reason: 'transfer-refused',
      guildId: rivalId,
      heroId,
      side: 'out',
      because: 'roster-size',
    });
  });

  test('is refused, changing nothing, in its order: folded, same Guild, a Hero away in a Party, refused, too poor', () => {
    const document = created('in-refusals');
    const { world } = document;
    const guild = player(world);
    guild.wealth = 10_000;
    const rival = firstRival(world);
    const [theirs] = rosterOf(world, rival) as [Hero];
    const [ours] = rosterOf(world, guild) as [Hero];
    const noAppetite = testDeps(pins, withDispositions({ transferAppetite: 0, recruitThreshold: 0 }));
    const take = (heroId: HeroId, with_ = deps) => refused(document, () => applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId }, with_));

    // A Rival's Hero away on a Quest stays with its Party (the epic: `partyId` must be null), whether
    // or not the Rival would let them go and whether or not the fee could be paid.
    theirs.partyId = 'party-000099' as PartyId;
    expect(take(theirs.id)).toEqual({ action: 'transferIn', reason: 'hero-in-party', heroId: theirs.id, partyId: 'party-000099' });
    expect(take(theirs.id, noAppetite)).toMatchObject({ reason: 'hero-in-party' });
    guild.wealth = 0;
    expect(take(theirs.id)).toMatchObject({ reason: 'hero-in-party' });
    theirs.partyId = null;
    // At home, the Rival asked first, and the fee after.
    expect(take(theirs.id, noAppetite)).toEqual({
      action: 'transferIn',
      reason: 'transfer-refused',
      guildId: rival.id,
      heroId: theirs.id,
      side: 'out',
      because: 'roster-size',
    });
    expect(take(theirs.id)).toMatchObject({ reason: 'insufficient-wealth', guildId: guild.id, wealth: 0 });
    guild.wealth = 10_000;
    expect(take(ours.id)).toEqual({ action: 'transferIn', reason: 'same-guild', guildId: guild.id });
    // A folded Guild takes no one, first of all.
    guild.foldedOnTurn = 0;
    expect(take(theirs.id)).toEqual({ action: 'transferIn', reason: 'guild-folded', guildId: guild.id });
    expect(take(ours.id)).toEqual({ action: 'transferIn', reason: 'guild-folded', guildId: guild.id });
  });

  test('a Guild whose Disposition content does not define consents to nothing: no Hero taken from it, none sent to it (data-model rule 5)', () => {
    const document = created('unknown-disposition');
    const { world } = document;
    const guild = player(world);
    guild.wealth = 10_000;
    const rival = firstRival(world);
    rival.wealth = 10_000;
    rival.controller = { kind: 'rival', disposition: 'unheard-of' };
    const [theirs] = rosterOf(world, rival) as [Hero];
    const [ours] = rosterOf(world, guild) as [Hero];

    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: theirs.id }, deps))).toEqual({
      action: 'transferIn',
      reason: 'transfer-refused',
      guildId: rival.id,
      heroId: theirs.id,
      side: 'out',
      because: 'unknown-disposition',
    });
    expect(refused(document, () => applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: ours.id, toGuildId: rival.id }, deps))).toEqual({
      action: 'transferOut',
      reason: 'transfer-refused',
      guildId: rival.id,
      heroId: ours.id,
      side: 'in',
      because: 'unknown-disposition',
    });
  });

  test("is refused a Hero of a Guild that answers for itself: a Rival cannot take the player's Hero, only make an offer", () => {
    const document = created('in-player');
    const guild = player(document.world);
    const rival = firstRival(document.world);
    rival.wealth = 10_000;
    const [hero] = rosterOf(document.world, guild) as [Hero];

    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId: rival.id, heroId: hero.id }, deps))).toEqual({
      action: 'transferIn',
      reason: 'transfer-refused',
      guildId: guild.id,
      heroId: hero.id,
      side: 'out',
      because: 'answers-offers',
    });
    // Its own Hero, a Hero on no Roster, and a Guild that cannot pay.
    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: hero.id }, deps))).toMatchObject({ reason: 'same-guild' });
    const pooled = Object.values(document.world.heroes).find((row) => row.unattachedSince !== null) as Hero;
    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: pooled.id }, deps))).toMatchObject({
      reason: 'hero-not-on-roster',
    });
    guild.wealth = 0;
    const [theirs] = rosterOf(document.world, rival) as [Hero];
    expect(refused(document, () => applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: theirs.id }, deps))).toMatchObject({
      reason: 'insufficient-wealth',
      guildId: guild.id,
      wealth: 0,
    });
  });
});

describe('a Hero just transferred is held on their new Roster for transferLockDays (DL-60)', () => {
  test('taken in, they are not sent back, sold on or offered for until the morning of the Day the lock runs out', () => {
    // A lock of 2 Days: the Day boundary it is held to is the one of any length, and few Turns reach it.
    const short = { ...pins, transferLockDays: 2 };
    const locking = testDeps(short, withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000 }));
    /** Rivals who neither deal, hire, build nor buy while Days pass: the lock is the only thing that changes. */
    const still = testDeps(short, withDispositions({ transferAppetite: 0, recruitThreshold: 1_000_000, buildThreshold: 1_000_000, gearThreshold: 1_000_000 }));
    let document = created('lock');
    const guild = player(document.world);
    guild.wealth = 10_000;
    const [rival, other] = rivals(document.world) as [Guild, Guild];
    rival.wealth = 10_000;
    other.wealth = 10_000;
    const [hero] = rosterOf(document.world, rival) as [Hero];
    document = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: hero.id }, locking)).document;
    expect(heroOf(document.world, hero.id).transferredOnTurn).toBe(0);
    // Transferred on Day 0: held through Day 1, free from the morning of Day 2, Turn 6.
    const lock = { heroId: hero.id, transferredOnTurn: 0, untilTurn: 6 };
    const back = (at: WorldDocument) => applyAction(at, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: rival.id }, locking);

    expect(refused(document, () => back(document))).toEqual({ action: 'transferOut', reason: 'recently-transferred', ...lock });
    expect(refused(document, () => applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: other.id }, locking))).toEqual({
      action: 'transferOut',
      reason: 'recently-transferred',
      ...lock,
    });
    expect(refused(document, () => applyAction(document, { kind: 'offerTransfer', guildId: other.id, heroId: hero.id }, locking))).toEqual({
      action: 'offerTransfer',
      reason: 'recently-transferred',
      ...lock,
    });
    // Held before the Rival is asked: one with no appetite at all still hears of the lock first.
    const noAppetite = testDeps(short, withDispositions({ transferAppetite: 0, recruitThreshold: 0 }));
    expect(refused(document, () => applyAction(document, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: rival.id }, noAppetite))).toMatchObject({
      reason: 'recently-transferred',
    });

    while (document.world.turn < 5) document = withValid(advance(document, still).document, still);
    expect(refused(document, () => back(document))).toMatchObject({ reason: 'recently-transferred', untilTurn: 6 });
    document = withValid(advance(document, still).document, still);
    const { events } = accepted(back(document));
    expect(ofType(events, 'hero.transferred').map((event) => [event.payload.heroId, event.payload.toGuildId])).toEqual([[hero.id, rival.id]]);
  });

  test("a Rival's Hero another Rival has just taken is held there: the player's transferIn is refused", () => {
    const document = created('lock-rivals');
    const guild = player(document.world);
    guild.wealth = 10_000;
    const [rival, other] = rivals(document.world) as [Guild, Guild];
    other.wealth = 10_000;
    const [hero] = rosterOf(document.world, rival) as [Hero];
    const moved = accepted(applyAction(document, { kind: 'transferIn', guildId: other.id, heroId: hero.id }, deps)).document;

    expect(refused(moved, () => applyAction(moved, { kind: 'transferIn', guildId: guild.id, heroId: hero.id }, deps))).toEqual({
      action: 'transferIn',
      reason: 'recently-transferred',
      heroId: hero.id,
      transferredOnTurn: 0,
      untilTurn: 90,
    });
  });

  test('a lock of 0 Days holds no one: a Hero taken can be sent back at once', () => {
    const unlocked = testDeps({ ...pins, transferLockDays: 0 }, withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000 }));
    const document = created('no-lock', unlocked);
    const guild = player(document.world);
    guild.wealth = 10_000;
    const rival = firstRival(document.world);
    rival.wealth = 10_000;
    const [hero] = rosterOf(document.world, rival) as [Hero];
    const taken = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: hero.id }, unlocked), unlocked).document;

    const back = accepted(applyAction(taken, { kind: 'transferOut', guildId: guild.id, heroId: hero.id, toGuildId: rival.id }, unlocked), unlocked);

    expect(heroOf(back.document.world, hero.id).guildId).toBe(rival.id);
  });
});

describe('transferFee (INPUTS 7.6, DL-43, DL-57)', () => {
  test("is the signing fee's list price times transferFeeFactor, times the paying Guildmaster's Negotiation exactly as signingFee, rounded down once", () => {
    const negotiating = testDeps({ ...pins, negotiationRange: 0.1, transferFeeFactor: 2 });
    const { world } = created('fee', negotiating);
    const [hero] = rosterOf(world, firstRival(world)) as [Hero];
    const list = listPrice(hero, negotiating.config, negotiating.content);
    const [shrewd, soft, middling] = [{ stats: { negotiation: 20 } }, { stats: { negotiation: 1 } }, { stats: { negotiation: 10.5 } }];

    expect(transferFee(hero, undefined, negotiating)).toBe(Math.floor(list * 2));
    expect(transferFee(hero, shrewd, negotiating)).toBe(Math.floor(list * 2 * 0.9));
    expect(transferFee(hero, soft, negotiating)).toBe(Math.floor(list * 2 * 1.1));
    expect(transferFee(hero, middling, negotiating)).toBe(Math.floor(list * 2));
    // The signing fee shares the core and is what it was: the list price, the same Negotiation.
    expect(signingFee(hero, negotiating, shrewd)).toBe(Math.floor(list * 0.9));
    const triple = testDeps({ ...pins, negotiationRange: 0.1, transferFeeFactor: 3 });
    expect(transferFee(hero, shrewd, triple)).toBe(Math.floor(list * 3 * 0.9));
  });
});

describe("the fee every action charges is at the paying Guildmaster's Negotiation (DL-43, DL-57)", () => {
  test("transferIn, transferOut and offerTransfer each price the Hero at the Negotiation of the Guild that pays: not the one paid, not the list price", () => {
    const negotiating = testDeps({ ...pins, negotiationRange: 0.1 }, withDispositions({ transferAppetite: 1, recruitThreshold: 0, buildThreshold: 1_000_000 }));
    const document = created('negotiated', negotiating);
    const { world } = document;
    const guild = player(world);
    const [rival, other] = rivals(world) as [Guild, Guild];
    // The player's Guildmaster drives the hardest bargain there is, the Rivals' the softest.
    const gm = (of: Guild): Guildmaster => {
      const row = world.guildmasters[of.guildmasterId];
      if (row === undefined) throw new Error(`No Guildmaster for ${of.id}`);
      return row;
    };
    gm(guild).stats['negotiation'] = 20;
    gm(rival).stats['negotiation'] = 1;
    gm(other).stats['negotiation'] = 1;
    for (const each of [guild, rival, other]) each.wealth = 100_000;
    /** The fee `payer` would pay for `hero`, having checked it differs from the payee's price and the list price. */
    const priced = (hero: Hero, payer: Guild, payee: Guild): number => {
      const fee = transferFee(hero, gm(payer), negotiating);
      expect(new Set([fee, transferFee(hero, gm(payee), negotiating), transferFee(hero, undefined, negotiating)]).size).toBe(3);
      return fee;
    };
    const [theirs] = rosterOf(world, rival) as [Hero];
    const [sold, asked] = rosterOf(world, guild) as [Hero, Hero];
    const feeIn = priced(theirs, guild, rival);
    const feeOut = priced(sold, rival, guild);
    const feeOffered = priced(asked, other, guild);

    // The player takes a Rival's Hero: the player pays, at its own Guildmaster's Negotiation.
    const taken = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: theirs.id }, negotiating), negotiating);
    expect(ofType(taken.events, 'hero.transferred').map((event) => event.payload.fee)).toEqual([feeIn]);
    expect(guildOf(taken.document.world, guild.id).wealth).toBe(100_000 - feeIn);
    // The player sends a Hero to a Rival: the Rival pays, at its Guildmaster's.
    const sent = accepted(applyAction(taken.document, { kind: 'transferOut', guildId: guild.id, heroId: sold.id, toGuildId: rival.id }, negotiating), negotiating);
    expect(ofType(sent.events, 'hero.transferred').map((event) => event.payload.fee)).toEqual([feeOut]);
    expect(guildOf(sent.document.world, rival.id).wealth).toBe(100_000 + feeIn - feeOut);
    // A Rival offers for a Hero of the player: the fee offered is at the offering Guild's.
    const offer = accepted(applyAction(sent.document, { kind: 'offerTransfer', guildId: other.id, heroId: asked.id }, negotiating), negotiating);
    expect(Object.values(offer.document.world.offers).map((row) => row.fee)).toEqual([feeOffered]);
  });
});

describe("the Guildmasters' Regard (R9, Guildmaster Regard's third writer)", () => {
  test('rises by guildmasterRegardPerTransferDeal each way with every Transfer, told only when it crosses a band', () => {
    let document = created('regard');
    const guild = player(document.world);
    guild.wealth = 10_000;
    const rival = firstRival(document.world);
    const [first, second] = rosterOf(document.world, rival) as [Hero, Hero];
    const ours = guild.guildmasterId;
    const theirs = rival.guildmasterId;

    const one = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: first.id }, deps));
    document = one.document;
    expect(document.world.guildmasters[ours]?.regard[theirs]).toEqual({ value: 2, since: 0, reason: 'hero.transferred' });
    expect(document.world.guildmasters[theirs]?.regard[ours]?.value).toBe(2);
    expect(ofType(one.events, 'guildmaster.regard-changed')).toEqual([]);

    const two = accepted(applyAction(document, { kind: 'transferIn', guildId: guild.id, heroId: second.id }, deps));
    // Neutral to warm, at 4: the Guildmaster of the Guild the Hero left first.
    expect(ofType(two.events, 'guildmaster.regard-changed').map((event) => event.payload)).toEqual([
      { guildmasterId: theirs, guildId: rival.id, entityId: ours, cause: 'transfer-deal', before: 2, after: 4, bandBefore: 'neutral', bandAfter: 'warm' },
      { guildmasterId: ours, guildId: guild.id, entityId: theirs, cause: 'transfer-deal', before: 2, after: 4, bandBefore: 'neutral', bandAfter: 'warm' },
    ]);
  });
});

// ── Transfer Offers ──────────────────────────────────────────────────────────────────────────

describe('Transfer Offers (data-model §3.2)', () => {
  /** A world where the first Rival has offered for the player's first Hero. */
  function offered(seed: string) {
    const document = created(seed);
    const guild = player(document.world);
    const [rival, other] = rivals(document.world) as [Guild, Guild];
    rival.wealth = 10_000;
    other.wealth = 10_000;
    const [hero] = rosterOf(document.world, guild) as [Hero];
    const result = accepted(applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId: hero.id }, deps));
    const [event] = ofType(result.events, 'guild.transfer-offered');
    if (event === undefined) throw new Error('No offer');
    return { ...result, guild, rival, other, hero, offerId: event.payload.offerId };
  }

  test('a Guild offers a fee for a Hero of a Guild that answers for itself: the row, standing through its third night, and nothing paid', () => {
    const { document, events, guild, rival, hero, offerId } = offered('offer');
    const fee = transferFee(hero, document.world.guildmasters[rival.guildmasterId], deps);

    expect(document.world.offers[offerId]).toEqual({
      id: offerId,
      kind: 'transfer',
      fromGuildId: guild.id,
      toGuildId: rival.id,
      heroId: hero.id,
      fee,
      offeredOnTurn: 0,
      expiresOnTurn: 8, // the night of Day 2: Days 0, 1 and 2
    });
    expect(events.map((event) => [event.type, event.participants.slice(0, 4)])).toEqual([
      ['guild.transfer-offered', [offerId, hero.id, guild.id, rival.id]],
    ]);
    expect(guildOf(document.world, rival.id).wealth).toBe(10_000);
    expect(heroOf(document.world, hero.id).guildId).toBe(guild.id);
  });

  test("accepted, the Hero moves for the fee offered, the offer goes, and any other offer for the Hero lapses", () => {
    const { document, guild, rival, other, hero, offerId } = offered('accept');
    const second = accepted(applyAction(document, { kind: 'offerTransfer', guildId: other.id, heroId: hero.id }, deps));
    const [secondId] = Object.keys(second.document.world.offers).filter((id) => id !== offerId) as [OfferId];
    const fee = second.document.world.offers[offerId]?.fee ?? 0;
    // The fee is the one offered (that it is not what the Hero would cost now is the next test's).
    const total = totalWealth(second.document.world);

    const { document: after, events } = accepted(applyAction(second.document, { kind: 'acceptTransfer', guildId: guild.id, offerId }, deps));

    expect(after.world.offers).toEqual({});
    expect(totalWealth(after.world)).toBe(total);
    expect(heroOf(after.world, hero.id).guildId).toBe(rival.id);
    expect(ofType(events, 'hero.transferred').map((event) => event.payload)).toEqual([
      { heroId: hero.id, fromGuildId: guild.id, toGuildId: rival.id, fee, offerId },
    ]);
    expect(ofType(events, 'hero.transferred')[0]?.participants).toContain(offerId);
    expect(ofType(events, 'guild.transfer-offer-expired').map((event) => [event.payload.offerId, event.payload.cause])).toEqual([
      [secondId, 'hero-left'],
    ]);
  });

  test('accepted, the offering Guild pays the fee it offered, though the Hero would cost more now (DL-57 item 2)', () => {
    const { document, guild, rival, hero, offerId } = offered('accept-fixed');
    const fee = document.world.offers[offerId]?.fee ?? Number.NaN;
    // The Hero gains Levels while the offer stands, so that their price today is dearer than the one offered.
    heroOf(document.world, hero.id).level += 3;
    const today = transferFee(heroOf(document.world, hero.id), document.world.guildmasters[rival.guildmasterId], deps);
    expect(today).toBeGreaterThan(fee);
    const wealth = { asked: guildOf(document.world, guild.id).wealth, offering: guildOf(document.world, rival.id).wealth };

    const { document: after, events } = accepted(applyAction(document, { kind: 'acceptTransfer', guildId: guild.id, offerId }, deps));

    expect(guildOf(after.world, rival.id).wealth).toBe(wealth.offering - fee);
    expect(guildOf(after.world, guild.id).wealth).toBe(wealth.asked + fee);
    expect(ofType(events, 'hero.transferred').map((event) => event.payload.fee)).toEqual([fee]);
  });

  test('declined, the offer goes with guild.transfer-offer-declined and nothing else changes', () => {
    const { document, guild, offerId } = offered('decline');
    const world = structuredClone(document.world);

    const { document: after, events } = accepted(applyAction(document, { kind: 'declineTransfer', guildId: guild.id, offerId }, deps));

    expect(events.map((event) => event.type)).toEqual(['guild.transfer-offer-declined']);
    expect(after.world).toEqual({ ...world, offers: {} });
  });

  test('is refused, changing nothing: an offer not found or asking another Guild, one already made, one not needed, a Hero away', () => {
    const { document, guild, rival, other, hero, offerId } = offered('offer-refusals');
    const unknown = 'offer-000099' as OfferId;

    expect(refused(document, () => applyAction(document, { kind: 'acceptTransfer', guildId: guild.id, offerId: unknown }, deps))).toEqual({
      action: 'acceptTransfer',
      reason: 'offer-not-found',
      offerId: unknown,
    });
    expect(refused(document, () => applyAction(document, { kind: 'acceptTransfer', guildId: rival.id, offerId }, deps))).toMatchObject({ reason: 'offer-not-found' });
    expect(refused(document, () => applyAction(document, { kind: 'declineTransfer', guildId: other.id, offerId }, deps))).toMatchObject({ reason: 'offer-not-found' });
    expect(refused(document, () => applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId: hero.id }, deps))).toEqual({
      action: 'offerTransfer',
      reason: 'offer-pending',
      offerId,
    });
    // A Rival's Hero is asked for by transferIn: its Disposition answers at once.
    const [theirs] = rosterOf(document.world, other) as [Hero];
    expect(refused(document, () => applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId: theirs.id }, deps))).toEqual({
      action: 'offerTransfer',
      reason: 'no-offer-needed',
      guildId: other.id,
    });
    // A Hero away cannot be handed over; the offer stands until they are home or it expires.
    heroOf(document.world, hero.id).partyId = 'party-000099' as PartyId;
    expect(refused(document, () => applyAction(document, { kind: 'acceptTransfer', guildId: guild.id, offerId }, deps))).toMatchObject({ reason: 'hero-in-party' });
    expect(document.world.offers[offerId]).toBeDefined();
    // Nor is an offer made for a Hero away.
    expect(refused(document, () => applyAction(document, { kind: 'offerTransfer', guildId: other.id, heroId: hero.id }, deps))).toEqual({
      action: 'offerTransfer',
      reason: 'hero-in-party',
      heroId: hero.id,
      partyId: 'party-000099',
    });
  });

  test('every Transfer action is an Action value a front end or controller applies alike', () => {
    const { document, guild, offerId } = offered('as-actions');
    const actions: Action[] = [{ kind: 'declineTransfer', guildId: guild.id, offerId }];
    let current = document;
    for (const action of actions) current = accepted(applyAction(current, action, deps)).document;
    expect(current.world.offers).toEqual({});
  });
});
