import { createHash } from 'node:crypto';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, encounterKinds, schemaVersion, type EngineDeps, type RegardBand, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test, vi } from 'vitest';
import {
  controllerKinds,
  noBands,
  observe,
  noOffers,
  noTransfers,
  noWealth,
  rivalTransferWays,
  transferDirections,
  type DispositionTally,
  type GameCounters,
  type HeroTally,
  type OfferTally,
  type TransferTally,
} from './counters.js';
import type { GameRecord } from './play.js';
import { machine } from './report.js';
import { seedNames } from './seeds.js';
import { compareReplay, playReport, replayedGame, sweepFingerprint, sweepPlay, sweepPlayInParallel, sweepTotals, type PlaySweep } from './sweep.js';

// The play sweep on a handful of short games, under `npm test`. The full run is
// play.harness.test.ts (M2-S12, DL-34).

// The observer of each Turn, watched as it plays, so a test can count the Turns observed (v1.1.6-S3).
vi.mock('./counters.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./counters.js')>();
  return { ...actual, observe: vi.fn(actual.observe) };
});

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const years = 60 / deps.config.turnsPerYear;

/** A clock that advances one millisecond a read, so timings are known. */
function tickingClock(): () => number {
  let t = 0;
  return () => (t += 1);
}

describe('sweepPlay', () => {
  const seeds = seedNames(2);
  const sweep = sweepPlay(seeds, deps, { years, validate: true, now: tickingClock() });
  const totals = sweepTotals(sweep, deps.config.turnsPerYear);

  test('plays every seed, keeping a record of each and no document', () => {
    expect(sweep.games.map((game) => game.seed)).toEqual(seeds);
    expect(sweep.games.every((game) => game.ranFullLength && game.invalid === null && game.refusals.length === 0)).toBe(true);
    expect(sweep.advance).toMatchObject({ count: 120, mean: 1 });
    expect(sweep.validation).toMatchObject({ count: 120, mean: 1 });
  });

  test("plays the first seed once more and finds its last save the sweep's", () => {
    expect(sweep.workers).toBe(1);
    expect(sweep.replay).toMatchObject({ seed: 'seed-0001', identical: true, advance: { count: 60 } });
  });

  // v1.1.6-S3 (DL-189): the replay compares its one play with the record the sweep made of the seed.
  describe('the replay comparison', () => {
    const recorded = sweep.games[0] as GameRecord;
    const { serialisedLength, fingerprint } = recorded.measures;

    test("is identical when the length and the fingerprint are both the record's", () => {
      expect(compareReplay(recorded, { length: serialisedLength, fingerprint }, [1, 3])).toMatchObject({
        seed: 'seed-0001',
        identical: true,
        length: serialisedLength,
        advance: { count: 2, mean: 2 },
      });
    });

    test('is not identical when either differs', () => {
      expect(compareReplay(recorded, { length: serialisedLength, fingerprint: 'x' }, []).identical).toBe(false);
      expect(compareReplay(recorded, { length: serialisedLength + 1, fingerprint }, []).identical).toBe(false);
    });

    test("replays the wanted seed, or the first seed played when it is not among the sweep's", () => {
      expect(replayedGame(sweep.games, 'seed-0002')?.seed).toBe('seed-0002');
      expect(replayedGame(sweep.games, 'seed-9999')?.seed).toBe('seed-0001');
      expect(replayedGame(sweep.games, undefined)?.seed).toBe('seed-0001');
      expect(replayedGame([], 'seed-0001')).toBeUndefined();
    });

    test('plays bare: the sweep observes each of its Turns, the replay none', () => {
      vi.mocked(observe).mockClear();
      const once = sweepPlay(['seed-0001'], deps, { years });
      expect(once.replay).toMatchObject({ identical: true, advance: { count: 60 } });
      expect(vi.mocked(observe)).toHaveBeenCalledTimes(once.games[0]?.turnsPlayed ?? 0);
      expect(once.games[0]?.turnsPlayed).toBe(60);
    });
  });

  // S10, the close review: nothing held that the replay finds two saves that differ. The replay's game
  // (`prepare`'s second call: the sweep's game, then the replay's) is given its player's Guild a
  // name one letter different, of the same length, so that only the saves' contents tell the two apart.
  test('finds the replay not identical when its game differs by one character of the save', () => {
    let calls = 0;
    const prepare = (document: WorldDocument): void => {
      calls += 1;
      if (calls !== 2) return;
      const guild = Object.values(document.world.guilds).find((each) => each.controller.kind === 'player');
      if (guild === undefined) throw new Error("no player's Guild");
      guild.name = `${guild.name.slice(0, -1)}${guild.name.endsWith('x') ? 'y' : 'x'}`;
    };
    const changed = sweepPlay(['seed-0001'], deps, { years, prepare });
    expect(calls).toBe(2);
    expect(changed.replay).toMatchObject({ seed: 'seed-0001', identical: false, length: changed.games[0]?.measures.serialisedLength });
  });

  test('plays the same games when it shares the seeds among child processes', { timeout: 120_000 }, async () => {
    const parallel = await sweepPlayInParallel(seeds, deps, { years, validate: true, workers: 2 });
    const played = (of: PlaySweep) =>
      of.games.map(({ seed, counters, observations, turnsPlayed, ranFullLength, refusals, invalid, measures }) => ({
        seed,
        counters,
        observations,
        turnsPlayed,
        ranFullLength,
        refusals,
        invalid,
        historyEntries: measures.historyEntries,
        serialisedLength: measures.serialisedLength,
        roundTrips: measures.roundTrips,
        fingerprint: measures.fingerprint,
      }));
    expect(parallel.workers).toBe(2);
    expect(played(parallel)).toEqual(played(sweep));
    expect(parallel.advance.count).toBe(120);
    expect(parallel.replay).toMatchObject({ seed: 'seed-0001', identical: true, length: sweep.replay?.length });
  });

  // v1.1.4-S10: each seed is a child of its own, at most `workers` at once, the next as one ends.
  test('plays the same games with more seeds than processes, one seed a child, and skips the replay when asked', { timeout: 120_000 }, async () => {
    const three = seedNames(3);
    const serial = sweepPlay(three, deps, { years, replay: false });
    const parallel = await sweepPlayInParallel(three, deps, { years, workers: 2, replay: false });
    expect(serial.replay).toBeNull();
    expect(parallel.replay).toBeNull();
    expect(parallel.workers).toBe(2);
    expect(parallel.games.map((game) => [game.seed, game.measures.fingerprint])).toEqual(serial.games.map((game) => [game.seed, game.measures.fingerprint]));
    expect(parallel.advance.count).toBe(180);
  });

  test("totals the games' counters", () => {
    expect(totals.games).toBe(2);
    // Two short games: no founding Guildmaster reaches 65 (M9-S2).
    expect(totals.rivalSuccessions).toBe(0);
    expect(totals.endings).toEqual({ retirement: 0, bankruptcy: 0, 'roster-wiped': 0, survived: 2 });
    const taken = sweep.games.reduce((sum, game) => sum + game.counters.questsTaken.player, 0);
    expect(totals.questsTaken.player).toBe(taken);
    expect(totals.questsTaken.rival).toBeGreaterThan(0);
    expect(totals.yearsSurvived).toMatchObject({ min: years, max: years });
    expect(totals.refusals).toBe(0);
    expect(totals.invalidGames).toBe(0);
  });

  test("totals M3's counters: every Guild's Days in play, the Fame gate each morning, the new worlds' Rosters", () => {
    // Two games of 20 Days: five Guilds each, no year begun after the first, no game at year 10.
    const guildYears = (kind: 'player' | 'rival'): number => totals.guildYears[kind].reduce((a, b) => a + b, 0);
    expect(guildYears('player')).toBeCloseTo(2 * years);
    expect(totals.fameGate.player.guildDays).toBe(2 * 20);
    expect(totals.fameGate.rival.guildDays).toBe(sweep.games.reduce((sum, game) => sum + game.observations.fameGate.rival.guildDays, 0));
    expect(totals.rosters).toHaveLength(1);
    expect(totals.rosters[0]).toMatchObject({ games: 2, player: { guilds: 2, wealth: 1000, heroes: 8, levels: 8 }, rival: { guilds: 8 } });
    expect(totals.gamesAtCountedYear).toBe(0);
    expect(totals.signingRefused).toBe(0);
  });

  test("totals M4's counters: each game's Encounters, Synergies and Injuries summed, and no year or Regard to count yet", () => {
    const sumOf = (read: (game: GameRecord) => number): number => sweep.games.reduce((total, game) => total + read(game), 0);
    for (const kind of controllerKinds) {
      for (const encounterKind of encounterKinds) {
        expect(totals.encounters[kind][encounterKind]).toEqual({
          success: sumOf((game) => game.counters.encounters[kind][encounterKind].success),
          failure: sumOf((game) => game.counters.encounters[kind][encounterKind].failure),
          injured: sumOf((game) => game.counters.encounters[kind][encounterKind].injured),
          died: sumOf((game) => game.counters.encounters[kind][encounterKind].died),
        });
      }
      const resolved = totals.questsResolved[kind];
      expect(totals.synergies[kind].quests).toBe(resolved.fail + resolved.success + resolved.strong);
      expect(totals.synergies[kind].applied).toBe(sumOf((game) => game.counters.synergies[kind].applied));
      const injuries = Object.values(totals.injuriesByType[kind]).reduce((a, b) => a + b, 0);
      expect(injuries).toBe(totals.heroesInjured[kind]);
    }
    const checks = encounterKinds.reduce((total, kind) => total + totals.encounters.player[kind].success + totals.encounters.player[kind].failure, 0);
    expect(checks).toBeGreaterThan(0);
    // Twenty Days: no year played in full, and no game after 10 years.
    expect(totals.patronYears).toEqual([]);
    expect(totals.regardAtCountedYear.games).toBe(0);
  });

  test("totals M5's counters: each game's Wealth, Loot, consumables, gear and the player's Quests by difficulty summed", () => {
    const sumOf = (read: (game: GameRecord) => number): number => sweep.games.reduce((total, game) => total + read(game), 0);
    for (const kind of controllerKinds) {
      for (const field of ['signing', 'items', 'itemsBought', 'improvements', 'upkeep', 'questRewards'] as const) {
        expect(totals.wealth[kind][field], `${kind} ${field}`).toBe(sumOf((game) => game.counters.wealth[kind][field]));
      }
      expect(totals.wealth[kind].sales.fold).toBe(sumOf((game) => game.counters.wealth[kind].sales.fold));
      expect(totals.consumables[kind].quests).toBe(totals.synergies[kind].quests);
      expect(totals.consumables[kind].expended).toBe(sumOf((game) => game.counters.consumables[kind].expended));
      expect(totals.gear[kind].equipped).toBe(sumOf((game) => game.counters.gear[kind].equipped));
      for (const table of Object.keys(content.lootTables)) {
        expect(totals.loot[kind][table]?.awards ?? 0).toBe(sumOf((game) => game.counters.loot[kind][table]?.awards ?? 0));
      }
    }
    // The policy recruits and buys armour in the first Days, and pays the first Upkeep.
    expect(totals.wealth.player.signing).toBeGreaterThan(0);
    expect(totals.wealth.player.items).toBeGreaterThan(0);
    expect(totals.gear.player.equipped).toBeGreaterThan(0);
    const resolved = totals.questsResolved.player;
    const byBand = totals.playerQuestsByDifficulty.reduce((total, tally) => total + tally.quests, 0);
    expect(byBand).toBe(resolved.fail + resolved.success + resolved.strong);
    expect(totals.playerQuestsByYear.reduce((total, tally) => total + tally.quests, 0)).toBe(byBand);
  });

  test("totals M6's counters: each game's Transfers, offers, Dispositions and purchases summed, and the Rivals and Rankings as the year began", () => {
    const sumOf = (read: (game: GameRecord) => number): number => sweep.games.reduce((total, game) => total + read(game), 0);
    for (const direction of transferDirections) {
      expect(totals.transfers[direction].transfers).toBe(sumOf((game) => game.counters.transfers[direction].transfers));
      expect(totals.transfers[direction].fees).toBe(sumOf((game) => game.counters.transfers[direction].fees));
    }
    for (const way of rivalTransferWays) expect(totals.rivalTransfers[way].transfers).toBe(sumOf((game) => game.counters.rivalTransfers[way].transfers));
    const r2r = rivalTransferWays.reduce((total, way) => total + totals.rivalTransfers[way].transfers, 0);
    expect(r2r).toBe(totals.transfers['rival-to-rival'].transfers);
    // Every Transfer's fee is spent by one Guild and taken by another.
    const paid = controllerKinds.reduce((total, kind) => total + totals.wealth[kind].transferFeesPaid, 0);
    const taken = controllerKinds.reduce((total, kind) => total + totals.wealth[kind].transferFeesTaken, 0);
    expect(paid).toBe(taken);
    expect(paid).toBe(transferDirections.reduce((total, direction) => total + totals.transfers[direction].fees, 0));
    // The policy makes no Transfer, and the Generator takes none from it.
    expect(totals.transfers.in.transfers + totals.transfers.out.transfers).toBe(0);
    expect(totals.assertionGames).toBe(0);
    const dispositions = Object.values(totals.dispositions);
    expect(Object.keys(totals.dispositions).sort()).toEqual(Object.keys(content.dispositions).sort());
    expect(dispositions.reduce((total, tally) => total + tally.questsTaken, 0)).toBe(totals.questsTaken.rival);
    expect(dispositions.reduce((total, tally) => total + tally.questsWithDifficulty, 0)).toBe(totals.questsTaken.rival);
    expect(dispositions.reduce((total, tally) => total + tally.deaths, 0)).toBe(totals.heroesDied.rival);
    expect(dispositions.reduce((total, tally) => total + tally.recruits, 0)).toBe(totals.heroesRecruited.rival);
    expect(totals.marketPurchases.player?.cost ?? 0).toBe(totals.wealth.player.items);
    const rivalCost = Object.keys(content.dispositions).reduce((total, key) => total + (totals.marketPurchases[key]?.cost ?? 0), 0);
    expect(rivalCost).toBe(totals.wealth.rival.items);
    // Twenty Days: the new world's year-start only, four Rivals and the player's place in each game.
    expect(totals.rivalYearStarts).toHaveLength(1);
    const starts = Object.values(totals.rivalYearStarts[0] ?? {});
    expect(starts.reduce((total, start) => total + start.heroes.length, 0)).toBe(2 * deps.config.rivalCount);
    expect(totals.rankings).toHaveLength(1);
    expect(totals.rankings[0]?.games).toBe(2);
    expect(totals.rankings[0]?.fame.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test("totals and renders M9-S1's counters: each game's nights below the Bankruptcy floor and back, by controller (DL-101)", () => {
    const games = sweep.games.map((game, index) => ({
      ...game,
      counters: { ...game.counters, belowFloor: { player: index + 1, rival: 3 }, floorRecovered: { player: index, rival: 2 } },
    }));
    const floored = { ...sweep, games };
    const summed = sweepTotals(floored, deps.config.turnsPerYear);

    expect(summed.belowFloor).toEqual({ player: 3, rival: 6 });
    expect(summed.floorRecovered).toEqual({ player: 1, rival: 4 });
    const report = playReport(floored, { deps, machine: machine(), startedAt: new Date(2026, 8, 29, 12), milestone: 'm9' });
    expect(report).toContain("| Bankruptcy floor | Player's | a game | Rivals' | a game |");
    expect(report).toContain('| Fell below it (`guild.below-floor`) | 3 | 1.50 | 6 | 3.00 |');
    expect(report).toContain('| Back to it or more (`guild.floor-recovered`) | 1 | 0.50 | 4 | 2.00 |');
  });

  test("totals and renders v1.1.4-S10's Party sizes with the XP each Hero took, and the Traits earned by key (DL-148 item 19)", () => {
    const games = sweep.games.map((game) => ({
      ...game,
      counters: {
        ...game.counters,
        partySizes: {
          player: { 2: { quests: 2, fail: 1, strong: 1, xpPerHero: 90, heroesHome: 3, xpTaken: 150 } },
          rival: { 1: { quests: 1, fail: 0, strong: 0, xpPerHero: 40, heroesHome: 1, xpTaken: 40 } },
        },
        traitsGainedByKey: { player: { lame: 1 }, rival: {} },
      },
    }));
    const parties = { ...sweep, games };
    const summed = sweepTotals(parties, deps.config.turnsPerYear);

    expect(summed.partySizes.player).toEqual({ 2: { quests: 4, fail: 2, strong: 2, xpPerHero: 180, heroesHome: 6, xpTaken: 300 } });
    expect(summed.traitsGainedByKey).toEqual({ player: { lame: 2 }, rival: {} });
    const report = playReport(parties, { deps, machine: machine(), startedAt: new Date(2026, 9, 3, 12), milestone: 'm9-v114-s10' });
    // v1.1.5-S13 (DL-182): the heading says the XP is split across the Party sent.
    expect(report).toContain(
      "with the XP each Hero who came home took (`xpPerHero`: the Quest's XP split across the Party sent, its Dead counted, rounded down, v1.1.5-S13, DL-182) and the XP the Party took in all, a Quest:",
    );
    expect(report).not.toContain('XP is not split');
    expect(report).toContain('| Controller: Party size | Quests resolved | Failed | Strong | XP a Hero | XP the Party took |');
    expect(report).toContain("| The player's Guild: 2 | 4 (100.0%) | 50.0% | 50.0% | 45.0 | 75.0 |");
    expect(report).toContain("| The player's Guild: every size (mean 2.00) | 4 (100.0%) | 50.0% | 50.0% | 45.0 | 75.0 |");
    expect(report).toContain('| The Rivals: 1 | 2 (100.0%) | 0.0% | 0.0% | 40.0 | 40.0 |');
    expect(report).toContain('| `lame` | 2 | 0 |');
    expect(report).toContain('| `scarred` | 0 | 0 |');
  });

  test("totals and renders v1.1.3-S5's Portrait counters, by controller and in all (DL-134 item 9)", () => {
    const games = sweep.games.map((game) => ({
      ...game,
      counters: {
        ...game.counters,
        portraits: {
          player: { guildmasters: 1, pictured: 1, silhouettes: 0, ageHeld: 1, callingClashes: 0 },
          rival: { guildmasters: 6, pictured: 4, silhouettes: 2, ageHeld: 3, callingClashes: 1 },
        },
      },
    }));
    const pictured = { ...sweep, games };
    const summed = sweepTotals(pictured, deps.config.turnsPerYear);

    expect(summed.portraits).toEqual({
      player: { guildmasters: 2, pictured: 2, silhouettes: 0, ageHeld: 2, callingClashes: 0 },
      rival: { guildmasters: 12, pictured: 8, silhouettes: 4, ageHeld: 6, callingClashes: 2 },
    });
    const report = playReport(pictured, { deps, machine: machine(), startedAt: new Date(2026, 9, 1, 12), milestone: 'm9-v113-s5' });
    expect(report).toContain('## Portraits (v1.1.3-S5)');
    expect(report).toContain("| Guildmasters | Player's | Rivals' | All |");
    expect(report).toContain('| Entered play | 2 | 12 | 14 |');
    expect(report).toContain('| With a picture | 2 (100.0%) | 8 (66.7%) | 10 (71.4%) |');
    expect(report).toContain('| With the Silhouette | 0 (0.0%) | 4 (33.3%) | 4 (28.6%) |');
    expect(report).toContain("| Their picture's `apparentAge` holds their age | 2 (100.0%) | 6 (75.0%) | 8 (80.0%) |");
    expect(report).toContain("| Their picture's Calling clashes with a Trait | 0 (0.0%) | 2 (25.0%) | 2 (20.0%) |");
    // After the Rivals and before the Measures, so the play counters' lines stand as they were.
    expect(report.indexOf('## Portraits')).toBeLessThan(report.indexOf('## Measures'));
  });

  test("totals and renders v1.1.3-S6's Hero counters and the saves as each year ended (DL-134 item 9, DL-135 item 6)", () => {
    const mib = 1024 * 1024;
    const games = sweep.games.map((game, index) => ({
      ...game,
      observations: {
        ...game.observations,
        heroes: { generated: 10, pictured: 4, silhouettes: 6, repeats: 1, longestAppearance: 200 + index, longestBiography: 300 - index, blank: 0 },
        saves: [
          { length: (index + 1) * mib, heroFields: 0.25 * mib, gzipped: null },
          { length: (index + 3) * mib, heroFields: 0.5 * mib, gzipped: (index + 1) * 0.25 * mib },
        ],
      },
    }));
    const described = { ...sweep, games };
    const summed = sweepTotals(described, deps.config.turnsPerYear);

    expect(summed.heroes).toEqual({ generated: 20, pictured: 8, silhouettes: 12, repeats: 2, longestAppearance: 201, longestBiography: 300, blank: 0 });
    expect(summed.saves).toEqual([
      { lengths: [mib, 2 * mib], heroFields: [0.25 * mib, 0.25 * mib], gzipped: [] },
      { lengths: [3 * mib, 4 * mib], heroFields: [0.5 * mib, 0.5 * mib], gzipped: [0.25 * mib, 0.5 * mib] },
    ]);
    const report = playReport(described, { deps, machine: machine(), startedAt: new Date(2026, 9, 1, 12), milestone: 'm9-v113-s6' });
    expect(report).toContain('## Heroes described (v1.1.3-S6)');
    expect(report).toContain('| Generated | 20 |');
    expect(report).toContain('| With a picture | 8 (40.0%) |');
    expect(report).toContain('| With the Silhouette | 12 (60.0%) |');
    expect(report).toContain('| Given a picture another Hero on a Roster or in the pool held (a repeat) | 2 (25.0%) |');
    expect(report).toContain('| The longest Biography written, in characters (at most 1,000) | 300 |');
    expect(report).toContain('| 1 | 2 | 1.50 | 2.00 | 0.25 | 0.25 | 16.7% |');
    expect(report).toContain('| 2 | 2 | 3.50 | 4.00 | 0.50 | 0.50 | 14.3% |');
    expect(report).toContain('The largest save at year 2: 4,194,304 characters, 4.00 MiB; gzipped, as the page keeps it in IndexedDB (DL-67): mean 0.38 MiB, max 0.50 MiB.');
    // After the Portraits and before the Measures, so the play counters' lines stand as they were.
    expect(report.indexOf('## Portraits')).toBeLessThan(report.indexOf('## Heroes described'));
    expect(report.indexOf('## Heroes described')).toBeLessThan(report.indexOf('## Measures'));
  });

  // v1.1.6-S1 (DL-186 item 7, DL-187): the totals are one fold over each game's counters, so a counter
  // reaches them with no line of its own. These hold every number a game's counters give to its sum,
  // and each declared exception to its rule.
  describe('one fold over the games', () => {
    /** Every number in `value` by its path from `path`: `wealth.player.sales.fold`, `guildYears.rival.1`. */
    function leaves(value: unknown, path: string, into: Map<string, number> = new Map()): Map<string, number> {
      if (typeof value === 'number') into.set(path, value);
      else if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) leaves(inner, path === '' ? key : `${path}.${key}`, into);
      }
      return into;
    }

    /** The paths in `value` of a `null`, or of a list or record with nothing in it: a counter with no number to check. */
    function empties(value: unknown, path: string): string[] {
      if (value === null) return [path];
      if (typeof value !== 'object') return [];
      const entries = Object.entries(value);
      if (entries.length === 0) return [path];
      return entries.flatMap(([key, inner]) => empties(inner, `${path}.${key}`));
    }

    /** `value` with each number in it replaced by the next of `from`, `from + 1` and so on, in path order. */
    function numbered<T>(value: T, from: number): T {
      let next = from;
      const renumber = (inner: unknown): unknown => {
        if (typeof inner === 'number') return next++;
        if (Array.isArray(inner)) return inner.map(renumber);
        if (typeof inner === 'object' && inner !== null) return Object.fromEntries(Object.entries(inner).map(([key, each]) => [key, renumber(each)]));
        return inner;
      };
      return renumber(value) as T;
    }

    const [first, second] = sweep.games as [GameRecord, GameRecord];
    const grades = { infirmary: [1, 1], trainingYard: [1], quarters: [1, 1, 1] };
    /** The first game's counters with a number in every counter: those a game of 20 Days leaves `null` or empty, filled. */
    const template: GameCounters = {
      ...first.counters,
      traitsGainedByKey: { player: { wayfinder: 1 }, rival: { haunted: 1 } },
      retirementAges: { player: { 61: 1 }, rival: { 63: 1 } },
      injuriesByType: { player: { 'deep-cut': 1 }, rival: { 'broken-arm': 1 } },
      loot: { player: { 'lesser-loot': { awards: 1, items: 1, unique: 0 } }, rival: { 'greater-loot': { awards: 1, items: 2, unique: 1 } } },
      consumables: {
        player: { ...first.counters.consumables.player, byDefinition: { whetstone: 1 } },
        rival: { ...first.counters.consumables.rival, byDefinition: { lockpicks: 1 } },
      },
      improvementGrades: { player: grades, rival: grades },
      improvementGradesByDisposition: { steady: grades },
      patronYears: [12, 12],
      silentPatronYears: [1, 0],
      transfersBySide: { steady: { ambitious: noTransfers() } },
      offers: { player: { steady: noOffers() } },
      moduleEvents: { 'probe.fired': 1 },
      moduleEffects: { probe: { 'hero.injured': 1 } },
    };
    const games = [numbered(template, 1), numbered(template, 10_000)].map((counters, index) => ({ ...(index === 0 ? first : second), counters }));
    const summed = sweepTotals({ ...sweep, games }, deps.config.turnsPerYear);

    test('the fixture gives every counter a number to check', () => {
      expect(empties(template, 'counters')).toEqual(['counters.ending']);
    });

    test("adds every number of each game's counters into the totals at the same path, but the last Turn's", () => {
      const [a, b] = games.map((game) => leaves(game.counters, ''));
      const totalled = leaves(summed, '');
      const paths = [...leaves({ ...template, lastTurn: undefined }, '').keys()];
      expect(paths.length).toBeGreaterThan(300);
      for (const path of paths) expect(totalled.get(path), path).toBe((a?.get(path) ?? Number.NaN) + (b?.get(path) ?? Number.NaN));
    });

    test('reads the ending and the last Turn apart: the endings, the year each ended in, and the years survived', () => {
      const ended = [
        { ...first, counters: { ...first.counters, ending: 'bankruptcy' as const, lastTurn: deps.config.turnsPerYear / 2 } },
        { ...second, counters: { ...second.counters, ending: null, lastTurn: deps.config.turnsPerYear * 1.5 } },
      ];
      const totals = sweepTotals({ ...sweep, years: 2, games: ended }, deps.config.turnsPerYear);
      expect(totals.endings).toEqual({ retirement: 0, bankruptcy: 1, 'roster-wiped': 0, survived: 1 });
      expect(totals.endedInYear).toEqual([1, 0]);
      expect(totals.yearsSurvived).toMatchObject({ count: 2, min: 0.5, max: 1.5 });
      expect(totals).not.toHaveProperty('ending');
      expect(totals).not.toHaveProperty('lastTurn');
    });

    test("counts a game that ended on the sweep's last Turn in its last year, not a year after it", () => {
      const last = deps.config.turnsPerYear * 2;
      const ended = sweep.games.map((game) => ({ ...game, counters: { ...game.counters, ending: 'roster-wiped' as const, lastTurn: last } }));
      expect(sweepTotals({ ...sweep, years: 2, games: ended }, deps.config.turnsPerYear).endedInYear).toEqual([0, 2]);
    });

    test('takes the longest texts as the longest of any game, adding the rest of the Heroes', () => {
      const heroes: HeroTally[] = [
        { generated: 3, pictured: 1, silhouettes: 2, repeats: 0, longestAppearance: 250, longestBiography: 100, blank: 1 },
        { generated: 4, pictured: 2, silhouettes: 2, repeats: 1, longestAppearance: 90, longestBiography: 400, blank: 0 },
      ];
      const described = sweep.games.map((game, index) => ({ ...game, observations: { ...game.observations, heroes: heroes[index] as HeroTally } }));
      expect(sweepTotals({ ...sweep, games: described }, deps.config.turnsPerYear).heroes).toEqual({
        generated: 7,
        pictured: 3,
        silhouettes: 4,
        repeats: 1,
        longestAppearance: 250,
        longestBiography: 400,
        blank: 1,
      });
    });

    test("counts the player's place in the Rankings one-hot each year, a year with no ranking adding nothing", () => {
      const rankings = [
        [null, { fame: 3, wealth: 1, guilds: 5 }],
        [null, { fame: 1, wealth: 1, guilds: 5 }, { fame: 2, wealth: 4, guilds: 5 }],
      ];
      const ranked = sweep.games.map((game, index) => ({ ...game, observations: { ...game.observations, rankings: rankings[index] ?? [] } }));
      const totals = sweepTotals({ ...sweep, games: ranked }, deps.config.turnsPerYear);
      expect(totals.rankings).toHaveLength(3);
      expect(0 in totals.rankings).toBe(false);
      expect(totals.rankings[1]).toEqual({ games: 2, fame: [1, 0, 1], wealth: [2] });
      expect(totals.rankings[2]).toEqual({ games: 1, fame: [0, 1], wealth: [0, 0, 0, 1] });
    });

    test("joins the saves and the Rivals' year-starts: each game's numbers kept, in the games' order", () => {
      const rivals = [
        [[{ disposition: 'steady', heroes: 5, wealth: 400 }, { disposition: 'miserly', heroes: 4, wealth: 300 }], []],
        [[{ disposition: 'steady', heroes: 6, wealth: 500 }], [{ disposition: 'reckless', heroes: 7, wealth: 900 }]],
      ];
      const saves = [
        [{ length: 10, heroFields: 1, gzipped: null }],
        [
          { length: 20, heroFields: 2, gzipped: null },
          { length: 30, heroFields: 3, gzipped: 4 },
        ],
      ];
      const joined = sweep.games.map((game, index) => ({
        ...game,
        observations: { ...game.observations, rivals: rivals[index] ?? [], saves: saves[index] ?? [] },
      }));
      const totals = sweepTotals({ ...sweep, games: joined }, deps.config.turnsPerYear);
      expect(totals.rivalYearStarts).toEqual([
        { steady: { heroes: [5, 6], wealth: [400, 500] }, miserly: { heroes: [4], wealth: [300] } },
        { reckless: { heroes: [7], wealth: [900] } },
      ]);
      expect(totals.saves).toEqual([
        { lengths: [10, 20], heroFields: [1, 2], gzipped: [] },
        { lengths: [30], heroFields: [3], gzipped: [4] },
      ]);
    });

    test('counts games: those of the sweep, those in play as each year began, those with a Regard to count and those that reached year 10', () => {
      const regard = { relationships: noBands(), guildmasterForPatrons: noBands(), guildmasterForHeroes: { ...noBands(), friendly: 2 } };
      const counted = sweep.games.map((game, index) => ({
        ...game,
        counters: { ...game.counters, improvementGrades: index === 0 ? { player: grades, rival: grades } : null },
        observations: {
          ...game.observations,
          rosters: index === 0 ? [...game.observations.rosters, ...game.observations.rosters] : game.observations.rosters,
          regardAtCountedYear: index === 0 ? null : regard,
        },
      }));
      const totals = sweepTotals({ ...sweep, games: counted }, deps.config.turnsPerYear);
      expect(totals.games).toBe(2);
      expect(totals.rosters.map((sum) => sum.games)).toEqual([2, 1]);
      expect(totals.regardAtCountedYear).toMatchObject({ games: 1, guildmasterForHeroes: { friendly: 2 } });
      expect(totals.gamesAtCountedYear).toBe(1);
      expect(totals.improvementGrades.player).toEqual(grades);
    });

    test('counts the refusals, the signings refused, and the games invalid or stopped by an assertion', () => {
      const refusal = (reason: string) => ({ rejection: { reason } }) as unknown as GameRecord['refusals'][number];
      const refused = sweep.games.map((game, index) => ({
        ...game,
        refusals: index === 0 ? [refusal('signing-refused'), refusal('no-wealth')] : [refusal('signing-refused')],
        invalid: index === 0 ? ({ turn: 3, problems: ['x'] } as unknown as GameRecord['invalid']) : null,
        assertion: index === 1 ? ({ turn: 4, message: 'x' } as unknown as GameRecord['assertion']) : null,
      }));
      expect(sweepTotals({ ...sweep, games: refused }, deps.config.turnsPerYear)).toMatchObject({
        refusals: 3,
        signingRefused: 2,
        invalidGames: 1,
        assertionGames: 1,
      });
    });

    test('starts from nothing: a sweep of no games totals every counter at 0, or empty', () => {
      const none = sweepTotals({ ...sweep, games: [] }, deps.config.turnsPerYear);
      expect(none.games).toBe(0);
      expect([...leaves({ ...none, yearsSurvived: undefined }, '').values()].every((n) => n === 0)).toBe(true);
      const noGrades = { infirmary: [], trainingYard: [], quarters: [] };
      expect(none.improvementGrades).toEqual({ player: noGrades, rival: noGrades });
      expect(none.endedInYear).toEqual([0]);
      expect(none.rivalFolds).toEqual({ retirement: 0, bankruptcy: 0, 'roster-wiped': 0 });
    });

    test('refuses a counter it cannot total, or one whose shape differs between games, so it fails the sweep rather than reading 0', () => {
      const worded = sweep.games.map((game) => ({ ...game, counters: { ...game.counters, note: 'a word' } as GameCounters }));
      expect(() => sweepTotals({ ...sweep, games: worded }, deps.config.turnsPerYear)).toThrow(TypeError);
      const reshaped = sweep.games.map((game, index) =>
        index === 0 ? game : { ...game, counters: { ...game.counters, rivalSuccessions: [1] } as unknown as GameCounters },
      );
      expect(() => sweepTotals({ ...sweep, games: reshaped }, deps.config.turnsPerYear)).toThrow(TypeError);
    });
  });

  test("fingerprints the sweep: SHA-256 over each seed's line of its seed and its last save's fingerprint, in seed order", () => {
    const lines = sweep.games.map((game) => `${game.seed}\t${game.measures.fingerprint}\n`).join('');

    expect(sweepFingerprint(sweep.games)).toBe(createHash('sha256').update(lines).digest('hex'));
    expect(sweepFingerprint([...sweep.games].reverse())).toBe(sweepFingerprint(sweep.games));
    const [first, second] = sweep.games as [GameRecord, GameRecord];
    const changed = { ...second, measures: { ...second.measures, fingerprint: first.measures.fingerprint } };
    expect(sweepFingerprint([first, changed])).not.toBe(sweepFingerprint(sweep.games));
  });

  describe('its report', () => {
    const context = { deps, machine: machine(), startedAt: new Date(2026, 8, 26, 12), milestone: 'm4' };
    const report = playReport(sweep, context);

    test("gives the sweep's fingerprint, so two runs' saves compare in one line (M8-S1, DL-76)", () => {
      expect(report).toContain(`| Fingerprint of every seed's last save | \`${sweepFingerprint(sweep.games)}\` |`);
    });

    test('names the draft content files it played in place of the core files, and none when it played the core (v1.1.4-S9)', () => {
      expect(report).toContain(` · content \`core\` version ${deps.content.version} · config version`);
      const drafted = playReport(sweep, { ...context, drafted: ['encounters.json', 'items.json'] });
      expect(drafted).toContain(` · content \`core\` version ${deps.content.version} with the drafts of \`encounters.json\`, \`items.json\` · config version`);
    });

    test('names the config it changed from the defaults, and nothing when it changed none (v1.1.4-S9 verification)', () => {
      expect(report).toContain(`schema version ${schemaVersion} · \`createdAt`);
      const changed = playReport(sweep, { ...context, configured: { checkVariance: 0.4, marketSize: 14 } });
      expect(changed).toContain(`schema version ${schemaVersion}, the defaults changed by \`{"checkVariance":0.4,"marketSize":14}\` · \`createdAt`);
    });

    test('states the seeds, the endings, byte equality and the measures against the targets', () => {
      expect(report).toContain('2 seeds, `seed-0001` to `seed-0002`');
      // M9-S2: the Rival Guildmasters succeeded, beside the folds by cause.
      expect(report).toContain('| Rival Guildmasters succeeded | 0, 0.00 a game |');
      expect(report).toContain("A Rival Guildmaster's Retirement is met by Succession (`guildmaster.succeeded`, M9-S2), not a fold: 0 in all.");
      expect(report).toContain('ran the full 0.06 years 2');
      expect(report).toContain('Games ending in each year (year 0 is the first): 0: 0.');
      expect(report).toContain('| Games the validator refused | 0 |');
      expect(report).toContain('`seed-0001`: identical');
      expect(report).toContain('| Advance one Turn | under 5 ms |');
      expect(report).toContain(`Node ${process.version}`);
    });

    // v1.1.6-S2 (DL-186 items 17 and 21): the years label reads the run's years, a run of other than 20
    // is set against no 20-year target, and the save's target is the Gate's, its gzipped mean (DL-188).
    test("reads the save's target from the Gate's spec, and sets a run of other than 20 years against no 20-year target", () => {
      const saveTarget =
        '| Save after 20 years | gzipped, the mean under 30 MiB (`harness/gate.json`) |';
      expect(report).toContain(`${saveTarget} not comparable: this run played 0.06 years |`);
      expect(report).toContain('| Harness: 1,000 games of 20 years | under 10 min | not comparable: this run played 0.06 years |');
      expect(report).toContain('(the 2 games that ran 0.06 years) |');
      expect(report).not.toContain('ran 20 years');

      const twoYears = playReport({ ...sweep, years: 2 }, context);
      expect(twoYears).toContain(`${saveTarget} not comparable: this run played 2 years |`);
      expect(twoYears).toContain('| Harness: 1,000 games of 20 years | under 10 min | not comparable: this run played 2 years |');
      expect(twoYears).toContain('(the 2 games that ran 2 years) |');
      expect(playReport({ ...sweep, years: 1 }, context)).toContain('not comparable: this run played 1 year |');

      const twenty = playReport({ ...sweep, years: 20 }, context);
      expect(twenty).toContain(`${saveTarget} gzipped: mean`);
      expect(twenty).toMatch(/\| Harness: 1,000 games of 20 years \| under 10 min \| [\d,]+ min \(this run's wall-clock time/);
      expect(twenty).toContain('(the 2 games that ran 20 years) |');
      expect(twenty).not.toContain('not comparable');

      // v1.1.6-S2's verification (DL-188): the gzipped measure is the saves' after the 20th year.
      const mebibyte = 1024 * 1024;
      const savedFor20Years = (gzipped: number): PlaySweep['games'][number]['observations']['saves'] =>
        Array.from({ length: 20 }, (_, year) => ({ length: 140 * mebibyte, heroFields: 0, gzipped: year === 19 ? gzipped : null }));
      const [first, second] = sweep.games as [PlaySweep['games'][number], PlaySweep['games'][number]];
      const measured = playReport(
        {
          ...sweep,
          years: 20,
          games: [
            { ...first, observations: { ...first.observations, saves: savedFor20Years(17 * mebibyte) } },
            { ...second, observations: { ...second.observations, saves: savedFor20Years(21 * mebibyte) } },
          ],
        },
        context,
      );
      expect(measured).toContain(`${saveTarget} gzipped: mean 19.00 MiB, max 21.00 MiB; uncompressed: mean`);
    });

    test("names the policy's values it changed from the defaults (v1.1.6-S2), and writes the Gate's lines when checked", () => {
      expect(report).not.toContain("the policy's defaults changed");
      expect(playReport(sweep, { ...context, policyChanged: { rosterLimit: 10 } })).toContain(
        `schema version ${schemaVersion} · the policy's defaults changed by \`{"rosterLimit":10}\` · \`createdAt`,
      );
      expect(report).not.toContain('## The Gate');
      const gate = { pass: true, status: 'drafted' as const, lines: [{ line: 'Policy actions the rules refused', verdict: 'pass' as const, measured: '0', limit: 'at most 0', source: 'DL-34' }] };
      const checked = playReport(sweep, { ...context, gate });
      expect(checked).toContain('| Policy actions the rules refused | pass | 0 | at most 0 | DL-34 |');
      expect(checked.indexOf('## The Gate')).toBeLessThan(checked.indexOf('## Counters'));
    });

    test("names its milestone and gives M3's counters", () => {
      expect(report.startsWith('# M4 harness report: play\n')).toBe(true);
      expect(report).toContain('## Progression, Fame and the Hall (M3)');
      expect(report).toMatch(/\| Guild-years in play \| 0\.1 \| /);
      expect(report).toContain('| Signings refused by Fame | Hero-Days refused |');
      expect(report).toContain('`signing-refused` rejections returned to the automatic policy: 0.');
      expect(report).toContain('No game was in play after 10 years.');
      expect(report).toContain('over the 0 games that reached it');
      expect(report).toContain('| The Rivals: trainingYard | 0 | — | 0 | 0 | 0 | 0 |');
    });

    test("gives M4's counters: the Encounters by kind, the Synergies, the Injuries, the silent Patrons and the Regard", () => {
      expect(report).toContain('## The Quest Engine (M4)');
      const player = totals.encounters.player.combat;
      const combat = player.success + player.failure;
      expect(report).toContain(`| The player's Guild: combat | ${combat} | ${player.success} (`);
      expect(report).toContain("| The player's Guild: every kind |");
      expect(report).toContain('| Synergies | Quests resolved | With one or more | Synergies a Quest |');
      // Every Synergy and Injury type content holds is listed, applied or not.
      for (const key of Object.keys(content.synergies)) expect(report).toContain(`| \`${key}\` |`);
      for (const key of Object.keys(content.injuries)) expect(report).toContain(`| \`${key}\` |`);
      expect(report).toContain('0 of 0 Patron-years (—).');
      expect(report).toContain('No year was played in full.');
      expect(report).toContain("No player's game was in play after 10 years: no Regard to count.");
    });

    test("gives M5's counters: Wealth by category, Loot by table and by the player's Quest difficulty, consumables and gear", () => {
      expect(report).toContain('## Items (M5)');
      const player = totals.wealth.player;
      expect(report).toContain(`| Spent: signing fees (\`hero.recruited\` \`fee\`) | ${player.signing.toLocaleString('en-GB')} |`);
      expect(report).toContain(`| Spent: Transfers (\`hero.transferred\` \`fee\`, the buying Guild) | ${player.transferFeesPaid.toLocaleString('en-GB')} |`);
      expect(report).toContain('| Taken: Transfers (`hero.transferred` `fee`, the selling Guild) |');
      expect(report).toContain(`| Spent: Items (\`item.bought\` \`cost\`) | ${player.items.toLocaleString('en-GB')} |`);
      expect(report).toContain('| Taken: the Market, `item.sold` `fold` (`proceeds`) |');
      // Every Loot table and consumable content holds is listed, awarded or expended or not.
      for (const key of Object.keys(content.lootTables)) expect(report).toContain(`| \`${key}\` |`);
      for (const definition of Object.values(content.items)) {
        if (definition.kind === 'consumable') expect(report).toContain(`| \`${definition.key}\` |`);
      }
      expect(report).toContain('| Loot table | Player\'s awards | a Guild-year | Items | Unique |');
      expect(report).toContain('By the Quest\'s difficulty (M5-S5\'s third box):');
      expect(report).toContain('| Consumables | Quests resolved | Carried | a Quest | Expended | a Quest |');
      expect(report).toContain('| Gear | Equipped | a Guild-year | Unequipped | Returned: died | Returned: retired | Returned: guild-folded | Returned: transferred |');
    });

    test("gives M6's counters: the Transfers, the offers, the Rivals against the generation range, the Rankings, the purchases and the four characters", () => {
      expect(report).toContain('## Rivals (M6)');
      expect(report).toContain("`hero.transferred` entries naming the player's Guild, 0; games it stopped, 0.");
      expect(report).toContain('| Games a harness assertion stopped | 0 |');
      expect(report).not.toContain('## Harness assertions broken');
      expect(report).toContain("| Into the player's Guild | 0 | 0.00 | 0 | — |");
      const r2r = totals.transfers['rival-to-rival'];
      expect(report).toContain(`| Rival to Rival | ${r2r.transfers.toLocaleString('en-GB')} |`);
      expect(report).toContain('| A night: the Transfer Generator |');
      expect(report).toContain("| An afternoon, the seller in debt: the buyer's choice or the seller's debt sale (`debtTransfer`) |");
      expect(report).toContain('the entries cannot tell those two apart');
      expect(report).toContain('| Side | Bought | Fees paid | Sold | Fees taken | Net Heroes |');
      expect(report).toContain("| Sold by, bought by | The player's Guild | `ambitious` | `miserly` | `reckless` | `steady` |");
      // The generation range read from the config, not written in.
      const { rivalRosterMin, rivalRosterMax, rivalStartingWealthMin, rivalStartingWealthMax } = deps.config;
      expect(report).toContain(`| below ${rivalRosterMin} | above ${rivalRosterMax} | Wealth, mean | median | below ${rivalStartingWealthMin} | above ${rivalStartingWealthMax} |`);
      expect(report).toContain('| Year | Games | Mean place | Place 1 |');
      expect(report).toContain('| Market purchases | Purchases | a Guild-year | Items | Cost | Mean cost |');
      for (const key of Object.keys(content.dispositions)) {
        expect(report).toContain(`| The Rivals, \`${key}\`: infirmary | 0 | — |`);
        expect(report).toContain(`| The Rivals, \`${key}\` |`);
        // Two games, one Rival of each Disposition in each.
        expect(report).toMatch(new RegExp(`\\| \`${key}\` \\| 2 \\| 0\\.1 \\| `));
      }
    });

    test("computes the Rivals' medians and shares against the range, and the Rankings' mean place and distribution", () => {
      const [first, second] = sweep.games;
      if (first === undefined || second === undefined) throw new Error('Fewer than two games');
      const rival = (disposition: string, heroes: number, wealth: number) => ({ disposition, heroes, wealth });
      const made: PlaySweep = {
        ...sweep,
        games: [
          { ...first, observations: { ...first.observations, rivals: [[rival('ambitious', 3, 200), rival('miserly', 9, 500)]], rankings: [{ fame: 1, wealth: 3, guilds: 3 }] } },
          { ...second, observations: { ...second.observations, rivals: [[rival('ambitious', 5, 800)]], rankings: [{ fame: 2, wealth: 3, guilds: 3 }] } },
        ],
      };
      const summed = sweepTotals(made, deps.config.turnsPerYear);
      expect(summed.rivalYearStarts).toEqual([{ ambitious: { heroes: [3, 5], wealth: [200, 800] }, miserly: { heroes: [9], wealth: [500] } }]);
      expect(summed.rankings).toEqual([{ games: 2, fame: [1, 1], wealth: [0, 0, 2] }]);

      const text = playReport(made, { ...context, deps: { ...deps, config: { ...deps.config, rivalRosterMin: 4, rivalRosterMax: 8, rivalStartingWealthMin: 300, rivalStartingWealthMax: 700 } } });
      // Every Rival: Rosters 3, 5, 9 (median 5, one below 4 and one above 8); Wealth 200, 500, 800.
      expect(text).toContain('| 0 | 3 | 5.67 | 5 | 33.3% | 33.3% | 500 | 500 | 33.3% | 33.3% |');
      expect(text).toContain('| `ambitious` | 0 | 2 | 4.00 | 3 | 50.0% | 0.0% | 500 | 200 | 50.0% | 50.0% |');
      expect(text).toContain('| Every Rival | 3 | 5.67 | 5 | 33.3% | 33.3% | 500 | 500 | 33.3% | 33.3% |');
      // By Fame: first and second once each; by Wealth: third both times.
      expect(text).toContain('| 0 | 2 | 1.50 | 1 (50.0%) | 1 (50.0%) | 0 (0.0%) |');
      expect(text).toContain('| 0 | 2 | 3.00 | 0 (0.0%) | 0 (0.0%) | 2 (100.0%) |');
    });

    test('counts a Roster or a Wealth on a bound of the generation range as within it', () => {
      const [first, second] = sweep.games;
      if (first === undefined || second === undefined) throw new Error('Fewer than two games');
      const rival = (heroes: number, wealth: number) => ({ disposition: 'steady', heroes, wealth });
      const made: PlaySweep = {
        ...sweep,
        games: [
          { ...first, observations: { ...first.observations, rivals: [[rival(4, 300)]] } },
          { ...second, observations: { ...second.observations, rivals: [[rival(8, 700)]] } },
        ],
      };
      const text = playReport(made, { ...context, deps: { ...deps, config: { ...deps.config, rivalRosterMin: 4, rivalRosterMax: 8, rivalStartingWealthMin: 300, rivalStartingWealthMax: 700 } } });
      // Rosters 4 and 8 against 4 to 8, Wealth 300 and 700 against 300 to 700: none below, none above.
      expect(text).toContain('| 0 | 2 | 6.00 | 4 | 0.0% | 0.0% | 500 | 300 | 0.0% | 0.0% |');
      expect(text).toContain('| Every Rival | 2 | 6.00 | 4 | 0.0% | 0.0% | 500 | 300 | 0.0% | 0.0% |');
    });

    test("totals and renders M6's counters where they are not zero: the Transfers, the offers, each Disposition, the grades, the purchases and the fees (DL-71)", () => {
      // The fixture's two games hold no Transfer, offer or fold: here each game k (1, then 2) is given
      // made-up M6 counters, k times a pattern, and Guild-years of 0.5 (the player's) and 2 (the Rivals').
      const t = (transfers: number, fees: number): TransferTally => ({ transfers, fees });
      const offer = (made: number, fees: number, accepted: number, declined: number, expired: number, left: number, folded: number): OfferTally => ({
        made,
        fees,
        accepted,
        declined,
        ended: { expired, 'hero-left': left, 'guild-folded': folded },
      });
      const disposition = (k: number): DispositionTally => ({
        guilds: 1,
        guildYears: 2,
        questsTaken: 10 * k,
        questsWithDifficulty: 10 * k,
        difficulty: 400 * k,
        questsResolved: { fail: k, success: 2 * k, strong: 3 * k },
        deaths: k,
        recruits: 2 * k,
        folds: { retirement: 0, bankruptcy: k, 'roster-wiped': 0 },
      });
      const shape = (game: GameRecord, k: number): GameRecord => ({
        ...game,
        counters: {
          ...game.counters,
          guildYears: { player: [0.5], rival: [2] },
          transfers: { in: t(k, 100 * k), out: t(2 * k, 310 * k), 'rival-to-rival': t(5 * k, 970 * k) },
          rivalTransfers: { afternoon: t(2 * k, 300 * k), 'afternoon-seller-in-debt': t(k, 210 * k), generator: t(k, 160 * k), 'accepted-offer': t(k, 300 * k) },
          transfersBySide: {
            player: { ambitious: t(2 * k, 310 * k) },
            ambitious: { player: t(k, 100 * k), reckless: t(3 * k, 500 * k) },
            reckless: { steady: t(2 * k, 470 * k) },
          },
          transfersBack: 3 * k,
          offers: {
            ambitious: { player: offer(6 * k, 1300 * k, k, 2 * k, k, k, 0) },
            reckless: { player: offer(2 * k, 500 * k, 0, k, 0, 0, k) },
          },
          dispositions: Object.fromEntries(Object.keys(content.dispositions).map((key) => [key, disposition(k)])),
          marketPurchases: { player: { purchases: 4 * k, items: 6 * k, cost: 400 * k }, ambitious: { purchases: k, items: k, cost: 100 * k } },
          improvementGradesByDisposition: {
            ambitious: { infirmary: [0, k, 1], trainingYard: [k], quarters: [0, 0, k] },
            miserly: { infirmary: [2 * k], trainingYard: [0, k], quarters: [k] },
          },
          wealth: {
            player: { ...noWealth(), signing: 100 * k, transferFeesPaid: 100 * k, items: 200 * k, upkeep: 600 * k, questRewards: 1000 * k, transferFeesTaken: 310 * k },
            rival: {
              ...noWealth(),
              signing: 50 * k,
              transferFeesPaid: 1280 * k,
              items: 150 * k,
              improvements: 500 * k,
              upkeep: 2000 * k,
              questRewards: 4000 * k,
              transferFeesTaken: 1070 * k,
            },
          },
        },
        observations: {
          ...game.observations,
          rivals: [Object.keys(content.dispositions).map((key) => ({ disposition: key, heroes: 4 + k, wealth: 1000 * k }))],
        },
      });
      const [first, second] = sweep.games;
      if (first === undefined || second === undefined) throw new Error('Fewer than two games');
      const made: PlaySweep = { ...sweep, games: [shape(first, 1), shape(second, 2)] };

      const summed = sweepTotals(made, deps.config.turnsPerYear);
      expect(summed.transfersBack).toBe(9);
      expect(summed.transfersBySide).toEqual({
        player: { ambitious: t(6, 930) },
        ambitious: { player: t(3, 300), reckless: t(9, 1500) },
        reckless: { steady: t(6, 1410) },
      });
      expect(summed.offers).toEqual({
        ambitious: { player: offer(18, 3900, 3, 6, 3, 3, 0) },
        reckless: { player: offer(6, 1500, 0, 3, 0, 0, 3) },
      });
      for (const key of Object.keys(content.dispositions)) {
        expect(summed.dispositions[key]).toEqual({
          guilds: 2,
          guildYears: 4,
          questsTaken: 30,
          questsWithDifficulty: 30,
          difficulty: 1200,
          questsResolved: { fail: 3, success: 6, strong: 9 },
          deaths: 3,
          recruits: 6,
          folds: { retirement: 0, bankruptcy: 3, 'roster-wiped': 0 },
        });
      }
      expect(summed.improvementGradesByDisposition).toEqual({
        ambitious: { infirmary: [0, 3, 2], trainingYard: [3], quarters: [0, 0, 3] },
        miserly: { infirmary: [6], trainingYard: [0, 3], quarters: [3] },
      });

      const text = playReport(made, context);
      // Wealth (M5's table): the player's 0.5 + 0.5 Guild-years, the Rivals' 2 + 2.
      expect(text).toContain('| Spent: Transfers (`hero.transferred` `fee`, the buying Guild) | 300 | 300.0 | 3,840 | 960.0 |');
      expect(text).toContain('| Spent in all | 3,000 | 3,000.0 | 11,940 | 2,985.0 |');
      expect(text).toContain('| Taken: Transfers (`hero.transferred` `fee`, the selling Guild) | 930 | 930.0 | 3,210 | 802.5 |');
      expect(text).toContain('| Taken in all | 3,930 | 3,930.0 | 15,210 | 3,802.5 |');
      expect(text).toContain("The player's Guild: signing 10.0%, Transfers 10.0%, Items 20.0%, Improvements 0.0%, Upkeep 60.0%;");
      // The Transfers by direction and by way, over two games.
      expect(text).toContain("| Into the player's Guild | 3 | 1.50 | 300 | 100 |");
      expect(text).toContain("| Out of the player's Guild | 6 | 3.00 | 930 | 155 |");
      expect(text).toContain('| Rival to Rival | 15 | 7.50 | 2,910 | 194 |');
      expect(text).toContain('| Every Transfer | 24 | 12.00 | 4,140 | 173 |');
      expect(text).toContain('seller out of debt: the buyer\'s choice (`transferChoice`) | 6 | 3.00 | 900 | 150 |');
      expect(text).toContain("seller's debt sale (`debtTransfer`) | 3 | 1.50 | 630 | 210 |");
      expect(text).toContain('| A night: the Transfer Generator | 3 | 1.50 | 480 | 160 |');
      expect(text).toContain('| An accepted Transfer Offer (`offerId` set) | 3 | 1.50 | 900 | 300 |');
      expect(text).toContain("Transfers that took a Hero to a Guild that had sold them before (DL-60's lock): 9.");
      // By side: bought, fees paid, sold, fees taken, net Heroes; then sold by (rows), bought by (columns).
      expect(text).toContain("| The player's Guild | 3 | 300 | 6 | 930 | -3 |");
      expect(text).toContain('| `ambitious` | 6 | 930 | 12 | 1,800 | -6 |');
      expect(text).toContain('| `reckless` | 9 | 1,500 | 6 | 1,410 | 3 |');
      expect(text).toContain('| `steady` | 6 | 1,410 | 0 | 0 | 6 |');
      expect(text).toContain("| The player's Guild | 0 | 6 | 0 | 0 | 0 |");
      expect(text).toContain('| `ambitious` | 3 | 0 | 0 | 9 | 0 |');
      expect(text).toContain('| `reckless` | 0 | 0 | 0 | 0 | 6 |');
      // Offers: made, mean fee, accepted, declined, ended by cause, standing.
      expect(text).toContain("| `ambitious` to the player's Guild | 18 | 217 | 3 | 6 | 3 | 3 | 0 | 3 |");
      expect(text).toContain("| `reckless` to the player's Guild | 6 | 250 | 0 | 3 | 0 | 0 | 3 | 0 |");
      // Market purchases a Guild-year: the player's over its own Guild-years.
      expect(text).toContain("| The player's Guild | 12 | 12.00 | 18 | 1,200 | 100 |");
      expect(text).toContain('| The Rivals, `ambitious` | 3 | 0.75 | 3 | 300 | 100 |');
      // Each Disposition's character: Rivals, Guild-years, Quests a Guild-year, mean difficulty, failed,
      // Deaths and recruits a Guild-year, folds and folds a Guild-year, the Roster and Wealth at a year-start.
      for (const key of Object.keys(content.dispositions)) {
        expect(text).toContain(`| \`${key}\` | 2 | 4.0 | 7.5 | 40.0 | 16.7% | 0.75 | 1.50 | 3 (0 / 3 / 0) | 0.750 | 5.5 | 1,500 |`);
      }
      // The Improvement grades by Disposition (M3's table): Guilds, mean grade, then Guilds at each grade.
      expect(text).toContain('| The Rivals, `ambitious`: infirmary | 5 | 1.40 | 0 | 3 | 2 | 0 |');
      expect(text).toContain('| The Rivals, `miserly`: trainingYard | 3 | 1.00 | 0 | 3 | 0 | 0 |');
    });

    test('sums the Patron-years and the Regard after 10 years over the games that reached them', () => {
      const [first, second] = sweep.games;
      if (first === undefined || second === undefined) throw new Error('Fewer than two games');
      const only = (band: RegardBand, n: number): Record<RegardBand, number> => ({ hostile: 0, cool: 0, neutral: 0, warm: 0, close: 0, [band]: n });
      const reached: PlaySweep = {
        ...sweep,
        games: [
          {
            ...first,
            counters: { ...first.counters, patronYears: [12, 12], silentPatronYears: [0, 1] },
            observations: {
              ...first.observations,
              regardAtCountedYear: { relationships: only('neutral', 3), guildmasterForPatrons: only('warm', 12), guildmasterForHeroes: only('close', 2) },
            },
          },
          { ...second, counters: { ...second.counters, patronYears: [12], silentPatronYears: [2] } },
        ],
      };

      const summed = sweepTotals(reached, deps.config.turnsPerYear);
      expect(summed.patronYears).toEqual([24, 12]);
      expect(summed.silentPatronYears).toEqual([2, 1]);
      expect(summed.regardAtCountedYear).toEqual({
        games: 1,
        relationships: only('neutral', 3),
        guildmasterForPatrons: only('warm', 12),
        guildmasterForHeroes: only('close', 2),
      });

      const text = playReport(reached, context);
      expect(text).toContain('3 of 36 Patron-years (8.3%).');
      expect(text).toContain('| 1 | 12 | 1 (8.3%) |');
      expect(text).toContain('over the 1 games in play then');
      expect(text).toContain("| Relationships within the player's Roster | 3 | 0 (0.0%) | 0 (0.0%) | 3 (100.0%) | 0 (0.0%) | 0 (0.0%) |");
      expect(text).toContain("| The player's Guildmaster for Heroes | 2 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 2 (100.0%) |");
    });

    test('lists refused actions and refused documents when there are any', () => {
      const [first] = sweep.games;
      if (first === undefined) throw new Error('No game');
      const failing: PlaySweep = {
        ...sweep,
        games: [
          {
            ...first,
            refusals: [
              {
                turn: 9,
                action: { kind: 'recruit', guildId: 'guild-000001' as never, heroId: 'hero-000009' as never },
                rejection: { action: 'recruit', reason: 'insufficient-wealth', fee: 90, wealth: 10 },
              },
            ],
            invalid: {
              turn: 12,
              result: { ok: false, failures: [{ check: 'counter-range', id: '$.world.counters.heroes', detail: 'd' }] },
            },
          },
        ],
      };
      const text = playReport(failing, context);
      expect(text).toContain('| `seed-0001` | 9 | recruit | insufficient-wealth |');
      expect(text).toContain('| `seed-0001` | 12 | counter-range | `$.world.counters.heroes` |');
    });
  });
});
