import { createHash } from 'node:crypto';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, encounterKinds, type EngineDeps, type RegardBand } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import {
  controllerKinds,
  noWealth,
  rivalTransferWays,
  transferDirections,
  type DispositionTally,
  type OfferTally,
  type TransferTally,
} from './counters.js';
import type { GameRecord } from './play.js';
import { machine } from './report.js';
import { seedNames } from './seeds.js';
import { playReport, sweepFingerprint, sweepPlay, sweepPlayInParallel, sweepTotals, type PlaySweep } from './sweep.js';

// The play sweep on a handful of short games, under `npm test`. The full run is
// play.harness.test.ts (M2-S12, DL-34).

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

  test('plays the first seed twice more and finds the two byte-identical', () => {
    expect(sweep.workers).toBe(1);
    expect(sweep.replay).toMatchObject({ seed: 'seed-0001', identical: true, advance: { count: 60 } });
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
      expect(report).toContain('| Save after 20 years | under 20 MiB |');
      expect(report).toContain(`Node ${process.version}`);
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
