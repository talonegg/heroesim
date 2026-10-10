import { describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps, GameConfig } from './config.js';
import { makeId, type Guild, type Guildmaster, type HeroId, type Patron, type PatronId, type RegardMap, type World } from './document.js';
import type { EngineEventOf, EngineEventType, TurnEvent } from './events.js';
import { phaseContext } from './phases/phase.js';
import {
  adjustRegard,
  guildmasterRegardForGuild,
  meanPatronRegard,
  patronBoardWeight,
  recoverRegard,
  regardBand,
  regardBandCounts,
  regardOnOfferExpired,
  regardOnQuestResolved,
  regardValue,
  type ResolvedForRegard,
} from './regard.js';
import { buildDocument, fixtureTurn, testDeps, withValid } from './world.test-support.js';

// Regard's scale and bands, Patron Regard for a Guild, and Guildmaster Regard (R9) with its
// writers (DL-43). The values these tests rely on are pinned here, never read from the defaults.

const pinned: Partial<GameConfig> = {
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
  patronRegardOnSuccess: 1,
  patronRegardOnFailure: -2,
  patronRegardOnExpiry: -1,
  influenceFactor: 0.5,
  guildmasterRegardOnPatronSuccess: 1,
  guildmasterRegardOnPatronFailure: -1,
  guildmasterRegardOnHeroSuccess: 1,
  guildmasterRegardOnHeroFailure: -1,
  boardRegardWeight: 1,
};
const deps = testDeps(pinned);

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

/** The fixture document's world, the player's Guild and Guildmaster, a Patron and two Roster Heroes. */
function scene() {
  const { document, ids } = buildDocument({ rosterSize: 3 });
  const { world } = document;
  const guild = world.guilds[ids.playerGuild] as Guild;
  const guildmaster = world.guildmasters[guild.guildmasterId] as Guildmaster;
  // Regard held before these tests is cleared, so each starts from neutral.
  for (const row of [guild, guildmaster, ...Object.values(world.patrons), ...Object.values(world.heroes)]) row.regard = {};
  const patron = world.patrons[ids.patron] as Patron;
  const heroes = guild.rosterIds.slice(1, 3) as HeroId[];
  return { document, world, ids, guild, guildmaster, patron, heroes };
}

/** A writer's context on `world` at the fixture's Turn under `with_`. */
function context(world: World, with_: EngineDeps = deps) {
  return phaseContext(world, with_);
}

/** The Quest every resolution below is of: the fixture's taken Quest, a row in every scene's world. */
const questId = buildDocument().ids.takenQuest;

function resolved(guild: Guild, patronId: PatronId, heroIds: HeroId[], succeeded: boolean): ResolvedForRegard {
  return { questId, patronId, guild, heroIds, succeeded };
}

describe('the Regard scale and its bands', () => {
  test('absence is neutral; a band is the highest start reached, the lowest below every start', () => {
    const map: RegardMap = {};
    expect(regardValue(map, 'patron-000001' as PatronId)).toBe(0);
    expect(regardBand(0, deps.config)).toBe('neutral');
    const cases: [number, string][] = [
      [-25, 'hostile'],
      [-20, 'hostile'],
      [-12.01, 'hostile'],
      [-12, 'cool'],
      [-4.01, 'cool'],
      [-4, 'neutral'],
      [3.99, 'neutral'],
      [4, 'warm'],
      [12, 'close'],
      [20, 'close'],
    ];
    for (const [value, band] of cases) expect(regardBand(value, deps.config), String(value)).toBe(band);
  });

  test('adjustRegard holds the value inside the scale and records the Turn and the reason', () => {
    const map: RegardMap = {};
    const id = 'patron-000001' as PatronId;

    expect(adjustRegard(map, id, -30, 7, 'quest.resolved', deps.config)).toEqual({
      before: 0,
      after: -20,
      bandBefore: 'neutral',
      bandAfter: 'hostile',
    });
    expect(map[id]).toEqual({ value: -20, since: 7, reason: 'quest.resolved' });
    expect(adjustRegard(map, id, 50, 9, 'quest.expired', deps.config).after).toBe(20);
    expect(map[id]).toEqual({ value: 20, since: 9, reason: 'quest.expired' });
  });

  test('recoverRegard moves toward neutral from either side, stops there, and removes the entry at neutral', () => {
    const [a, b, c] = [makeId('guilds', 1), makeId('guilds', 2), makeId('guilds', 3)];
    const map: RegardMap = { [a]: { value: 1.5, since: 3, reason: 'quest.resolved' }, [b]: { value: -0.5, since: 3, reason: 'x' } };

    expect(recoverRegard(map, a, 1, deps.config).after).toBe(0.5);
    // A drift leaves the last discrete change's Turn and reason.
    expect(map[a]).toEqual({ value: 0.5, since: 3, reason: 'quest.resolved' });
    expect(recoverRegard(map, a, 1, deps.config).after).toBe(0);
    expect(recoverRegard(map, b, 1, deps.config).after).toBe(0);
    expect(map).toEqual({});
    expect(recoverRegard(map, c, 1, deps.config)).toMatchObject({ before: 0, after: 0 });
    expect(map).toEqual({});
  });

  test('regardBandCounts counts the entries held in each band, every band listed', () => {
    const entry = (value: number) => ({ value, since: 0, reason: 'test' });
    const values = [-15, -5, 0.5, 8, 9, 20];
    const map: RegardMap = Object.fromEntries(values.map((value, index) => [makeId('heroes', index + 1), entry(value)]));

    expect(regardBandCounts(map, deps.config)).toEqual({ hostile: 1, cool: 1, neutral: 1, warm: 2, close: 1 });
    expect(regardBandCounts({}, deps.config)).toEqual({ hostile: 0, cool: 0, neutral: 0, warm: 0, close: 0 });
  });
});

describe('Guildmaster Regard for a Guild (rule 1)', () => {
  test('is a selector over Regard for its Guildmaster, never stored', () => {
    const { world, ids, guildmaster } = scene();
    const rival = world.guilds[ids.rivalGuild] as Guild;

    expect(guildmasterRegardForGuild(guildmaster, rival.id, world)).toBe(0);
    guildmaster.regard[rival.guildmasterId] = { value: 9, since: 0, reason: 'test' };
    expect(guildmasterRegardForGuild(guildmaster, rival.id, world)).toBe(9);
    // Nothing is held under the Guild's own id: the Guild's is read through its Guildmaster.
    expect(Object.keys(guildmaster.regard)).toEqual([rival.guildmasterId]);
    expect(guildmasterRegardForGuild(guildmaster, 'guild-000099' as Guild['id'], world)).toBe(0);
  });
});

describe('the Guildmaster Regard writers (R9, pre-M0 review B3): one test each', () => {
  // Each writer's amount pinned apart from the other three, so a test shows the writer reads its own
  // field and no other's (M4 verification: with all four at ±1, a Hero written with a Patron's
  // amount passed).
  const writers = testDeps({
    ...pinned,
    guildmasterRegardOnPatronSuccess: 2,
    guildmasterRegardOnPatronFailure: -3,
    guildmasterRegardOnHeroSuccess: 0.5,
    guildmasterRegardOnHeroFailure: -0.25,
  });

  test('for each Hero home on the Roster, on a success: guildmasterRegardOnHeroSuccess', () => {
    const { world, guild, guildmaster, patron, heroes } = scene();
    regardOnQuestResolved(world, context(world, writers), resolved(guild, patron.id, heroes, true));
    for (const heroId of heroes) expect(regardValue(guildmaster.regard, heroId)).toBe(0.5);
    expect(regardValue(guildmaster.regard, patron.id)).toBe(2);
  });

  test('for each Hero home on the Roster, on a failure: guildmasterRegardOnHeroFailure', () => {
    const { world, guild, guildmaster, patron, heroes } = scene();
    regardOnQuestResolved(world, context(world, writers), resolved(guild, patron.id, heroes, false));
    for (const heroId of heroes) expect(regardValue(guildmaster.regard, heroId)).toBe(-0.25);
    expect(regardValue(guildmaster.regard, patron.id)).toBe(-3);
  });

  test('a Patron whose Quests always fail ends in a lower band than one whose always succeed; an event at each band crossing and no other', () => {
    const { world, ids, guild, guildmaster, patron } = scene();
    const other = world.patrons[Object.keys(world.patrons).find((id) => id !== ids.patron) as PatronId] as Patron;
    const events: TurnEvent[] = [];

    for (let quest = 0; quest < 10; quest += 1) {
      events.push(...regardOnQuestResolved(world, context(world), resolved(guild, patron.id, [], false)));
      events.push(...regardOnQuestResolved(world, context(world), resolved(guild, other.id, [], true)));
    }

    const failing = regardBand(regardValue(guildmaster.regard, patron.id), deps.config);
    const succeeding = regardBand(regardValue(guildmaster.regard, other.id), deps.config);
    expect([failing, succeeding]).toEqual(['cool', 'warm']);
    const crossings = ofType(events, 'guildmaster.regard-changed');
    expect(crossings.map(({ payload }) => [payload.entityId, payload.cause, payload.bandBefore, payload.bandAfter])).toEqual([
      [other.id, 'quest-success', 'neutral', 'warm'],
      [patron.id, 'quest-failure', 'neutral', 'cool'],
    ]);
    expect(crossings[0]?.participants).toEqual([guildmaster.id, other.id, guild.id, questId]);
    expect(crossings[0]?.payload.questId).toBe(questId);
  });

  test("names the Quest on each crossing, for the Patron, a Hero and the Guildmaster's Guild alike (DL-112 item 2)", () => {
    const { world, guild, guildmaster, patron, heroes } = scene();
    const [heroId] = heroes as [HeroId];
    guildmaster.regard[patron.id] = { value: 3.5, since: 0, reason: 'test' };
    guildmaster.regard[heroId] = { value: 3.5, since: 0, reason: 'test' };

    const events = regardOnQuestResolved(world, context(world), resolved(guild, patron.id, [heroId], true));

    const crossings = ofType(events, 'guildmaster.regard-changed');
    expect(crossings.map(({ participants, payload }) => [participants, payload.cause, payload.questId])).toEqual([
      [[guildmaster.id, patron.id, guild.id, questId], 'quest-success', questId],
      [[guildmaster.id, heroId, guild.id, questId], 'quest-success', questId],
    ]);
  });

  test('a Rival Guildmaster accrues Regard the same way, for the Rival Guild (ADR-0002)', () => {
    const { world, ids, patron } = scene();
    const rival = world.guilds[ids.rivalGuild] as Guild;
    const rivalMaster = world.guildmasters[rival.guildmasterId] as Guildmaster;
    const [rivalHero] = rival.rosterIds as HeroId[];

    regardOnQuestResolved(world, context(world), resolved(rival, patron.id, [rivalHero as HeroId], true));

    expect(regardValue(rivalMaster.regard, patron.id)).toBe(1);
    expect(regardValue(rivalMaster.regard, rivalHero as HeroId)).toBe(1);
    expect(regardValue(patron.regard, rival.id)).toBeGreaterThan(0);
  });
});

describe('Patron Regard for a Guild', () => {
  test('rises by patronRegardOnSuccess times the Influence of the Guildmaster, and falls by patronRegardOnFailure, unscaled', () => {
    const { world, guild, guildmaster, patron } = scene();
    // Influence at the top of its range: gains × 1.5, losses as they are.
    guildmaster.stats['influence'] = 20;

    regardOnQuestResolved(world, context(world), resolved(guild, patron.id, [], true));
    expect(regardValue(patron.regard, guild.id)).toBe(1.5);
    regardOnQuestResolved(world, context(world), resolved(guild, patron.id, [], false));
    expect(regardValue(patron.regard, guild.id)).toBe(-0.5);
    expect(patron.regard[guild.id]).toMatchObject({ since: fixtureTurn, reason: 'quest.resolved' });
  });

  test('an offer expiring untaken costs patronRegardOnExpiry with every Guild in play, and none with a folded Guild', () => {
    const { world, ids, patron } = scene();
    const rival = world.guilds[ids.rivalGuild] as Guild;
    const { document: bigger } = buildDocument({ rivals: 2 });
    const third = Object.values(bigger.world.guilds)[2] as Guild;
    world.guilds[third.id] = { ...third, foldedOnTurn: 1, rosterIds: [] };

    const events = regardOnOfferExpired(world, context(world), patron.id);

    expect(regardValue(patron.regard, ids.playerGuild)).toBe(-1);
    expect(regardValue(patron.regard, rival.id)).toBe(-1);
    expect(Object.hasOwn(patron.regard, third.id)).toBe(false);
    expect(patron.regard[ids.playerGuild]).toMatchObject({ reason: 'quest.expired' });
    // No band crossed from neutral at -1: no event (data-model rule 10).
    expect(events).toEqual([]);
  });

  test('emits patron.regard-changed only on a band crossing, naming the Patron, the Guild and the Quest', () => {
    const { world, guild, patron } = scene();
    const events: TurnEvent[] = [];
    for (let quest = 0; quest < 5; quest += 1) {
      events.push(...regardOnQuestResolved(world, context(world), resolved(guild, patron.id, [], false)));
    }
    // -2, -4 (still neutral), -6 (cool), -8, -10: one crossing.
    const crossings = ofType(events, 'patron.regard-changed');
    expect(crossings).toHaveLength(1);
    expect(crossings[0]?.participants).toEqual([patron.id, guild.id, questId]);
    expect(crossings[0]?.payload).toEqual({
      patronId: patron.id,
      guildId: guild.id,
      cause: 'quest-failure',
      questId,
      before: -4,
      after: -6,
      bandBefore: 'neutral',
      bandAfter: 'cool',
    });
  });

  test("the Board weight is 1 plus boardRegardWeight times the mean across the Guilds in play, as a share of the scale's reach, never below 0", () => {
    const { world, ids, patron } = scene();
    const entry = (value: number) => ({ value, since: 0, reason: 'test' });
    expect(patronBoardWeight(patron, world, deps.config)).toBe(1);
    patron.regard[ids.playerGuild] = entry(20);
    expect(meanPatronRegard(patron, world)).toBe(10);
    expect(patronBoardWeight(patron, world, deps.config)).toBe(1.5);
    patron.regard[ids.rivalGuild] = entry(-20);
    patron.regard[ids.playerGuild] = entry(-20);
    expect(patronBoardWeight(patron, world, deps.config)).toBe(0);
    expect(patronBoardWeight(patron, world, testDeps({ ...pinned, boardRegardWeight: 2 }).config)).toBe(0);
    expect(patronBoardWeight(patron, world, testDeps({ ...pinned, boardRegardWeight: 0 }).config)).toBe(1);
  });
});

describe('questsConclude moves Regard on every resolution', () => {
  test("the Patron's and the Guildmaster's Regard move by the amounts for the band quest.resolved reports", () => {
    // Recovery still, so the Patron's value is the writers' alone.
    const still = testDeps({ ...pinned, patronRegardRecoveryPerYear: 0, influenceFactor: 0 });
    const { document, ids } = buildDocument({ rosterSize: 3 });
    const { world } = document;
    const guild = world.guilds[ids.playerGuild] as Guild;
    const guildmaster = world.guildmasters[guild.guildmasterId] as Guildmaster;
    for (const row of [guildmaster, ...Object.values(world.patrons)]) row.regard = {};
    // The Party's stack goes with it: Items come home in M5, and until then nothing moves a stack.
    delete world.stacks[ids.partyStack];
    let current = withValid(document, still);
    const events: TurnEvent[] = [];
    const returns = world.parties[ids.party]?.returnsOnTurn ?? 0;
    while (current.world.turn < returns) {
      const result = advance(current, still);
      current = withValid(result.document, still);
      events.push(...result.events);
    }

    const resolution = ofType(events, 'quest.resolved').find(({ payload }) => payload.questId === ids.takenQuest);
    if (resolution === undefined) throw new Error('The Party did not come home');
    const succeeded = resolution.payload.band !== 'fail';
    const after = current.world;
    const master = after.guildmasters[guild.guildmasterId] as Guildmaster;
    expect(regardValue((after.patrons[ids.patron] as Patron).regard, guild.id)).toBe(succeeded ? 1 : -2);
    expect(regardValue(master.regard, ids.patron)).toBe(succeeded ? 1 : -1);
    const home = resolution.payload.deaths.includes(ids.partyHero) ? 0 : succeeded ? 1 : -1;
    expect(regardValue(master.regard, ids.partyHero)).toBe(home);
  });
});
