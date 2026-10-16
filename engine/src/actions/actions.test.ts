import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { Guild, GuildId, Hero, HeroId, Stack, World, WorldDocument } from '../document.js';
import { transferFee } from '../selectors.js';
import { serialise } from '../serialise.js';
import { buildDocument, testDeps, withValid, type FixtureIds } from '../world.test-support.js';
import { copyWorld } from '../world-copy.js';
import { applyAction, applyActions, applyGuildActions, type GuildAction } from './action.js';
import { applyBuild } from './build.js';
import { applyBuy } from './buy.js';
import { applyDispatch } from './dispatch.js';
import { applyEquip, applyUnequip } from './equip.js';
import { applyRecruit } from './recruit.js';
import { applySell } from './sell.js';
import { applyAcceptTransfer, applyDeclineTransfer, applyOfferTransfer, applyTransferIn, applyTransferOut } from './transfer.js';
import { applyNameCaptain } from './captain.js';
import type { WorldActionResult } from './result.js';

// A Guild's actions in a Turn applied on one copy of the world (DL-238, ADR-0011 as amended): the
// list equals its actions applied one by one through `applyAction`, refusals included.

// The engine's copy, watched as it is, to count the copies a list makes.
vi.mock('../world-copy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../world-copy.js')>();
  return { ...actual, copyWorld: vi.fn(actual.copyWorld) };
});

afterEach(() => {
  vi.mocked(copyWorld).mockClear();
});

const deps = testDeps({ rivalCount: 0, sellRatio: 0.5 });

/** The built document, its player's Guild at `wealth`: 3 Healing draughts in its holding, 12 on the Market. */
function built(wealth = 100) {
  const { document, ids } = buildDocument();
  (document.world.guilds[ids.playerGuild] as Guild).wealth = wealth;
  return { document: withValid(document, deps), ids };
}

/** `actions` applied one by one through `applyAction`: the document they leave, and each one's outcome. */
function oneByOne(document: WorldDocument, actions: readonly GuildAction[]) {
  const results: WorldActionResult[] = [];
  let current = document;
  for (const action of actions) {
    const result = applyAction(current, action, deps);
    if (result.ok) current = result.document;
    results.push(result.ok ? { ok: true, events: result.events } : result);
  }
  return { document: current, results };
}

describe('applyActions', () => {
  test("applies a Guild's actions in order on one copy, a refused one changing nothing, and appends the done ones' events", () => {
    const { document, ids } = built();
    const guildId = ids.playerGuild;
    const worldBefore = JSON.stringify(document.world);
    const entries = document.history.entries.length;
    const actions: GuildAction[] = [
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 2 },
      // One left: refused, and the next sale still finds it.
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 2 },
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 1 },
    ];

    const { document: after, results } = applyActions(document, actions, deps);

    expect(vi.mocked(copyWorld)).toHaveBeenCalledTimes(1);
    expect(results.map((result) => (result.ok ? 'done' : result.rejection.reason))).toEqual(['done', 'insufficient-quantity', 'done']);
    const { world } = withValid(after, deps);
    expect(world.guilds[guildId]?.wealth).toBe(100 + 3 * 15);
    expect(world.stacks[ids.marketStack]?.quantity).toBe(15);
    const events = results.flatMap((result) => (result.ok ? result.events : []));
    expect(events.map((event) => event.type)).toEqual(['item.sold', 'item.sold']);
    expect(after.history.entries.slice(entries)).toEqual(events);
    // The document given keeps its World State; the History is shared, and appended to (ADR-0008).
    expect(after.history).toBe(document.history);
    expect(after.meta).toBe(document.meta);
    expect(JSON.stringify(document.world)).toBe(worldBefore);
  });

  test('equals the same actions applied one by one, refusals included, to the byte', () => {
    const { document, ids } = built(40);
    const guildId = ids.playerGuild;
    const actions: GuildAction[] = [
      { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 1 },
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 3 },
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 1 },
      { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 50 },
      { kind: 'build', guildId, facility: 'quarters' },
      { kind: 'recruit', guildId, heroId: ids.partyHero, years: 2 },
      { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 2 },
    ];
    const apart = structuredClone(document);

    const together = applyActions(document, actions, deps);
    const one = oneByOne(apart, actions);

    expect(together.results).toEqual(one.results);
    expect(together.results.filter((result) => !result.ok).length).toBeGreaterThanOrEqual(3);
    expect(together.results.filter((result) => result.ok).length).toBeGreaterThanOrEqual(2);
    expect(serialise(together.document)).toBe(serialise(one.document));
  });

  test('a refused action of every kind leaves the world as it found it: each rule refuses before it writes', () => {
    const { document, ids } = built(0);
    const guildId = ids.playerGuild;
    const world = structuredClone(document.world);
    const before = JSON.stringify(world);
    const offerId = ids.offer;
    const refused: GuildAction[] = [
      { kind: 'dispatch', guildId, questId: ids.takenQuest, heroIds: [ids.partyHero] },
      { kind: 'dispatch', guildId, questId: ids.offeredQuest, heroIds: [ids.rivalHero] },
      { kind: 'dispatch', guildId, questId: ids.offeredQuest, heroIds: [ids.partyHero] },
      { kind: 'recruit', guildId, heroId: ids.partyHero, years: 2 },
      { kind: 'recruit', guildId, heroId: ids.unattachedHero as never, years: 2 },
      { kind: 'build', guildId, facility: 'quarters' },
      { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 1 },
      { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 13 },
      { kind: 'buy', guildId, definitionKey: 'whetstone', quantity: 1 },
      { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 4 },
      { kind: 'sell', guildId, stackId: ids.marketStack, quantity: 1 },
      { kind: 'equip', guildId, heroId: ids.partyHero, stackId: ids.guildStack },
      { kind: 'equip', guildId, heroId: ids.rivalHero, stackId: ids.guildStack },
      { kind: 'unequip', guildId, heroId: ids.partyHero, slot: 'armour' },
      { kind: 'transferIn', guildId, heroId: ids.partyHero, years: 2 },
      { kind: 'transferIn', guildId, heroId: ids.rivalHero, years: 2 },
      { kind: 'transferOut', guildId, heroId: ids.partyHero, toGuildId: ids.rivalGuild },
      { kind: 'offerTransfer', guildId, heroId: ids.rivalHero, years: 2 },
      { kind: 'acceptTransfer', guildId, offerId },
      { kind: 'declineTransfer', guildId, offerId },
    ];

    const results = applyGuildActions(world, refused, deps);

    const reasons = results.map((result) => (result.ok ? `${result.events[0]?.type} done` : `${result.rejection.action} ${result.rejection.reason}`));
    expect(reasons.filter((reason) => reason.endsWith(' done'))).toEqual([]);
    // Every rule, each refusal a reason of its own.
    expect(new Set(reasons).size).toBe(refused.length);
    expect(JSON.stringify(world)).toBe(before);
  });

  test("each rule's late refusals, met once the checks before them have passed, leave the world as they found it", () => {
    const { document, ids } = built(0);
    const player = ids.playerGuild;
    const rival = ids.rivalGuild;
    const idle = ids.idleHero as HeroId;
    const third = (document.world.guilds[player] as Guild).rosterIds[2] as HeroId;
    const pair = [idle, third];
    /** The Rival answers a Transfer at once, by a Disposition that lets a Hero of its Roster of three go and takes one in. */
    const ambitious = (world: World): void => {
      (world.guilds[rival] as Guild).controller = { kind: 'rival', disposition: 'ambitious' };
    };
    /** The Guild's Wealth one short of the Transfer fee its Guildmaster's Negotiation sets for `heroId`. */
    const shortOfFee = (world: World, guildId: GuildId, heroId: HeroId): void => {
      const guild = world.guilds[guildId] as Guild;
      guild.wealth = transferFee(world.heroes[heroId] as Hero, world.guildmasters[guild.guildmasterId], deps) - 1;
    };
    const cases: [GuildAction, string, ((world: World) => void)?][] = [
      [{ kind: 'dispatch', guildId: player, questId: ids.offeredQuest, heroIds: [idle] }, 'requirement-unmet'],
      [
        { kind: 'dispatch', guildId: player, questId: ids.offeredQuest, heroIds: pair, consumables: [{ definitionKey: 'padded-jack', quantity: 1 }] },
        'not-consumable',
      ],
      [
        { kind: 'dispatch', guildId: player, questId: ids.offeredQuest, heroIds: pair, consumables: [{ definitionKey: 'whetstone', quantity: 1 }] },
        'not-held-by-guild',
      ],
      [
        {
          kind: 'dispatch',
          guildId: player,
          questId: ids.offeredQuest,
          heroIds: pair,
          consumables: [{ definitionKey: 'healing-draught', quantity: 4 }],
        },
        'insufficient-quantity',
      ],
      [{ kind: 'equip', guildId: player, heroId: idle, stackId: ids.marketStack }, 'not-held-by-guild'],
      [{ kind: 'equip', guildId: player, heroId: idle, stackId: ids.guildStack }, 'not-gear'],
      [
        { kind: 'equip', guildId: player, heroId: idle, stackId: ids.heroStack, slot: 'trinket' },
        'wrong-slot',
        (world) => {
          (world.stacks[ids.heroStack] as Stack).holder = { kind: 'guild', id: player };
        },
      ],
      [
        { kind: 'equip', guildId: player, heroId: idle, stackId: ids.partyStack },
        'slot-occupied',
        (world) => {
          (world.stacks[ids.heroStack] as Stack).holder = { kind: 'hero', id: idle, slot: 'armour' };
          Object.assign(world.stacks[ids.partyStack] as Stack, { definitionKey: 'padded-jack', holder: { kind: 'guild', id: player } });
        },
      ],
      [{ kind: 'unequip', guildId: player, heroId: idle, slot: 'armour' }, 'slot-empty'],
      [
        { kind: 'transferIn', guildId: player, heroId: ids.rivalHero, years: 2 },
        'recently-transferred',
        (world) => {
          ambitious(world);
          (world.heroes[ids.rivalHero] as Hero).transferredOnTurn = world.turn;
        },
      ],
      [{ kind: 'transferIn', guildId: player, heroId: ids.rivalHero, years: 2 }, 'insufficient-wealth', ambitious],
      [{ kind: 'transferOut', guildId: player, heroId: idle, toGuildId: rival }, 'transfer-refused'],
      [
        { kind: 'transferOut', guildId: player, heroId: idle, toGuildId: rival },
        'insufficient-wealth',
        (world) => {
          ambitious(world);
          shortOfFee(world, rival, idle);
        },
      ],
      [
        { kind: 'offerTransfer', guildId: rival, heroId: idle, years: 2 },
        'offer-pending',
        (world) => {
          Object.assign(world.offers[ids.offer] as object, { fromGuildId: player, toGuildId: rival, heroId: idle });
        },
      ],
      [{ kind: 'offerTransfer', guildId: rival, heroId: idle, years: 2 }, 'insufficient-wealth', (world) => shortOfFee(world, rival, idle)],
      [
        { kind: 'acceptTransfer', guildId: rival, offerId: ids.offer },
        'guild-folded',
        (world) => {
          (world.guilds[player] as Guild).foldedOnTurn = world.turn;
        },
      ],
      [
        { kind: 'acceptTransfer', guildId: rival, offerId: ids.offer },
        'hero-in-party',
        (world) => {
          (world.heroes[ids.rivalHero] as Hero).partyId = ids.party;
        },
      ],
      [{ kind: 'acceptTransfer', guildId: rival, offerId: ids.offer }, 'insufficient-wealth'],
      [
        { kind: 'nameCaptain', guildId: player, heroId: idle },
        'captain-locked',
        (world) => {
          const guild = world.guilds[player] as Guild;
          guild.captainId = guild.rosterIds.find((heroId) => heroId !== idle) ?? null;
          guild.captainChangedOnTurn = world.turn;
        },
      ],
    ];

    for (const [action, reason, prepare] of cases) {
      const world = structuredClone(document.world);
      prepare?.(world);
      const before = serialise({ ...document, world });

      const [result] = applyGuildActions(world, [action], deps);

      expect(result?.ok ? 'done' : `${result?.rejection.action} ${result?.rejection.reason}`).toBe(`${action.kind} ${reason}`);
      expect(serialise({ ...document, world })).toBe(before);
    }
  });

  test('gives back the document it was given when no action is done: none copied for an empty list', () => {
    const { document, ids } = built(0);
    const before = serialise(document);

    expect(applyActions(document, [], deps)).toEqual({ document, results: [] });
    expect(vi.mocked(copyWorld)).not.toHaveBeenCalled();

    const refused = applyActions(document, [{ kind: 'buy', guildId: ids.playerGuild, definitionKey: 'healing-draught', quantity: 1 }], deps);
    expect(refused.document).toBe(document);
    expect(refused.results).toEqual([{ ok: false, rejection: expect.objectContaining({ action: 'buy', reason: 'insufficient-wealth' }) }]);
    expect(serialise(document)).toBe(before);
  });
});

describe('applyAction', () => {
  // Every Guild action is its rule run on a copy of the document's world (DL-24, DL-238): for an
  // accepted action of each kind, the rule run in place on a clone ends with the world the copy did,
  // and the same events; the document given keeps its world, and shares its meta and its History.
  // Each row names its kind's own rule, so the table holds `applyGuildAction`'s routing too (DL-246).
  const player = (ids: FixtureIds) => ids.playerGuild;
  const idle = (ids: FixtureIds) => ids.idleHero as HeroId;
  /** The Rival lets a Hero of its Roster go and takes one in at once (the late refusals' arrangement above). */
  const ambitious = (world: World, ids: FixtureIds): void => {
    (world.guilds[ids.rivalGuild] as Guild).controller = { kind: 'rival', disposition: 'ambitious' };
  };
  /** The Party's Hero's armour, the fixture's padded jack, moved to `holder`. */
  const jackTo = (world: World, ids: FixtureIds, holder: Stack['holder']): void => {
    (world.stacks[ids.heroStack] as Stack).holder = holder;
  };
  interface Row {
    action: GuildAction;
    /** The kind's own rule, run in place. */
    rule: (world: World) => WorldActionResult;
    prepare?: ((world: World) => void) | undefined;
  }
  /** A row: `action` on the built document, `rule` its kind's rule, the world arranged by `prepare` first. */
  const row =
    <Request,>(
      action: (ids: FixtureIds, world: World) => GuildAction & Request,
      rule: (world: World, request: Request, deps: EngineDeps) => WorldActionResult,
      prepare?: (world: World, ids: FixtureIds) => void,
    ) =>
    (ids: FixtureIds, world: World): Row => {
      const made = action(ids, world);
      return { action: made, rule: (on) => rule(on, made, deps), prepare: prepare === undefined ? undefined : (on) => prepare(on, ids) };
    };
  const rows: Record<GuildAction['kind'] | 'sell an Item', (ids: FixtureIds, world: World) => Row> = {
    dispatch: row(
      (ids, world) => ({ kind: 'dispatch', guildId: player(ids), questId: ids.offeredQuest, heroIds: [idle(ids), (world.guilds[player(ids)] as Guild).rosterIds[2] as HeroId] }),
      applyDispatch,
    ),
    recruit: row((ids) => ({ kind: 'recruit', guildId: player(ids), heroId: ids.unattachedHero as HeroId, years: 2 }), applyRecruit),
    build: row((ids) => ({ kind: 'build', guildId: player(ids), facility: 'quarters' }), applyBuild),
    equip: row((ids) => ({ kind: 'equip', guildId: player(ids), heroId: idle(ids), stackId: ids.heroStack }), applyEquip, (world, ids) =>
      jackTo(world, ids, { kind: 'guild', id: player(ids) }),
    ),
    unequip: row((ids) => ({ kind: 'unequip', guildId: player(ids), heroId: idle(ids), slot: 'armour' }), applyUnequip, (world, ids) =>
      jackTo(world, ids, { kind: 'hero', id: idle(ids), slot: 'armour' }),
    ),
    buy: row((ids) => ({ kind: 'buy', guildId: player(ids), definitionKey: 'healing-draught', quantity: 2 }), applyBuy),
    sell: row((ids) => ({ kind: 'sell', guildId: player(ids), stackId: ids.guildStack, quantity: 2 }), applySell),
    'sell an Item': row((ids) => ({ kind: 'sell', guildId: player(ids), itemId: ids.item }), applySell, (world, ids) => {
      (world.items[ids.item] as { holder: Stack['holder'] }).holder = { kind: 'guild', id: player(ids) };
    }),
    transferIn: row((ids) => ({ kind: 'transferIn', guildId: player(ids), heroId: ids.rivalHero, years: 2 }), applyTransferIn, ambitious),
    transferOut: row((ids) => ({ kind: 'transferOut', guildId: player(ids), heroId: idle(ids), toGuildId: ids.rivalGuild }), applyTransferOut, ambitious),
    offerTransfer: row((ids) => ({ kind: 'offerTransfer', guildId: ids.rivalGuild, heroId: idle(ids), years: 2 }), applyOfferTransfer),
    acceptTransfer: row((ids) => ({ kind: 'acceptTransfer', guildId: ids.rivalGuild, offerId: ids.offer }), applyAcceptTransfer),
    declineTransfer: row((ids) => ({ kind: 'declineTransfer', guildId: ids.rivalGuild, offerId: ids.offer }), applyDeclineTransfer),
    nameCaptain: row((ids) => ({ kind: 'nameCaptain', guildId: player(ids), heroId: idle(ids) }), applyNameCaptain),
  };

  test.each(Object.keys(rows))('%s is its rule run on a copy of the world: the same world and events, the input left as it was, meta and the History shared', (kind) => {
    const { document, ids } = built(10_000);
    const arranged = rows[kind as keyof typeof rows](ids, document.world);
    arranged.prepare?.(document.world);
    const before = structuredClone(document.world);
    const world = structuredClone(document.world);

    const applied = applyAction(document, arranged.action, deps);
    const inPlace = arranged.rule(world);

    expect(applied.ok ? 'done' : applied.rejection.reason).toBe('done');
    expect(inPlace.ok ? 'done' : inPlace.rejection.reason).toBe('done');
    if (!applied.ok || !inPlace.ok) return;
    expect(world).toEqual(applied.document.world);
    expect(inPlace.events).toEqual(applied.events);
    withValid(applied.document, deps);
    expect(applied.document.world).not.toBe(document.world);
    expect(document.world).toEqual(before);
    expect(applied.document.meta).toBe(document.meta);
    expect(applied.document.history).toBe(document.history);
  });

});
