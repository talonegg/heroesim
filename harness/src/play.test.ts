import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { loadContent } from '@heroesim/content/node';
import {
  applyAction,
  createWorld,
  defaultConfig,
  dispositionOf,
  playerGuild,
  serialise,
  timeOfDay,
  type EngineDeps,
  type Guild,
  type GuildAction,
  type GuildId,
  type HeroId,
  type WorldDocument,
} from '@heroesim/engine';
import { append } from '@heroesim/engine/testing';
import { describe, expect, test, vi } from 'vitest';
import { emptyObservations, regardSnapshot, savedLength } from './counters.js';
import { harnessSetup } from './creation.js';
import { markHistory, measureDocument, playerTransferred, playGame, readAdvance, recordGame, runConfig } from './play.js';
import { automaticPolicy, defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { machine } from './report.js';
import { summarise } from './stats.js';
import { playReport } from './sweep.js';

// The engine's `serialise`, watched as it is, to count the saves a game writes (v1.1.5-S1).
vi.mock('@heroesim/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@heroesim/engine')>();
  return { ...engine, serialise: vi.fn(engine.serialise) };
});

// Ordinary tests, run by `npm test`: a few short games under the automatic policy. The full play
// sweep is play.harness.test.ts, behind HEROESIM_HARNESS (M2-S12, DL-34).

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
/** Twenty Days: long enough for Parties to leave and come home, and short for `npm test`. */
const years = 60 / deps.config.turnsPerYear;

/**
 * Rivals that deal whenever they can (DL-71): rich from the start, every Disposition's
 * `transferAppetite` 1, and nothing they would build or buy first, so that an afternoon's one purchase
 * is a Transfer and any Rival consents to take a Hero in. The same rule; only the numbers differ.
 */
const dealing: EngineDeps = {
  config: { ...deps.config, rivalStartingWealthMin: 20_000, rivalStartingWealthMax: 20_000 },
  content: {
    ...content,
    dispositions: Object.fromEntries(
      Object.entries(content.dispositions).map(([key, row]) => [key, { ...row, transferAppetite: 1, buildThreshold: 1e9, gearThreshold: 1e9 }]),
    ),
  },
};

// v1.1.6-S7 (DL-193): a run's config is checked, every setting, before any game; and a game plays
// under the deps the engine's `playDeps` gives it, as a front end's does.
describe('runConfig', () => {
  test("is the defaults with HEROESIM_CONFIG's values over them", () => {
    expect(runConfig({ marketSize: 14 })).toEqual({ ...defaultConfig, marketSize: 14 });
    expect(runConfig({})).toEqual(defaultConfig);
  });

  test('refuses a setting its rule refuses, naming each', () => {
    expect(() => runConfig({ checkVariance: 2 })).toThrow(new RangeError('HEROESIM_CONFIG: checkVariance is 2; it is a share from 0 to 1'));
    expect(() => runConfig({ boardSize: 1.5, sellRatio: 1 })).toThrow(/^HEROESIM_CONFIG: boardSize is 1\.5; .*; HEROESIM_CONFIG: sellRatio is 1; /);
  });

  test('a game whose config breaks a rule is refused before its first Turn, naming the setting', () => {
    expect(() => playGame('unsound', { config: { ...defaultConfig, checkVariance: 2 }, content }, { years })).toThrow(/checkVariance is 2; it is a share from 0 to 1/);
  });
});

describe('playGame', () => {
  const game = playGame('play-a', deps, { years, validate: true });

  test('plays to the last Turn under the policy, the rules accepting its every action', () => {
    expect(game.turnsPlayed).toBe(60);
    expect(game.document.world.turn).toBe(60);
    expect(game.advanceMs).toHaveLength(60);
    expect(game.refusals).toEqual([]);
    const taken = game.document.history.byType['quest.taken'] ?? [];
    const guild = playerGuild(game.document.world);
    const players = taken.filter((position) => {
      const payload = game.document.history.entries[position]?.payload as { guildId?: string } | undefined;
      return payload?.guildId === guild?.id;
    });
    expect(players.length).toBeGreaterThan(0);
  });

  test("counts every Hero generated, at the creation and in play, the pool's that the History does not record among them (DL-211)", () => {
    // Every Hero's id is taken from the world's counter, which starts at 1.
    const generated = game.document.world.counters.heroes - 1;
    const recorded = game.document.history.byType['hero.generated']?.length ?? 0;
    expect(recorded).toBeLessThan(generated - deps.config.unattachedPoolSize);
    expect(game.observations.heroes.generated).toBe(generated);
  });

  test('validates after every advance and the whole document at the end, and the validator accepts it', () => {
    expect(game.invalid).toBeNull();
    expect(game.validateMs).toHaveLength(60);
    expect(game.wholeValidateMs).not.toBeNull();
  });

  test('stops on the Turn the game ends', () => {
    // In debt from the start, with a Day's grace: a starting Wealth is no debt (DL-210), so the Guild's is set once it is made.
    const doomed: EngineDeps = { ...deps, config: { ...deps.config, bankruptcyGraceDays: 1 } };
    const ended = playGame('play-b', doomed, {
      years,
      validate: true,
      prepare: (document) => {
        (playerGuild(document.world) as Guild).wealth = -1000;
      },
    });
    expect(ended.document.world.ended).toEqual({ turn: ended.document.world.turn, reason: 'bankruptcy' });
    expect(ended.turnsPlayed).toBe(ended.document.world.turn);
    expect(ended.turnsPlayed).toBeLessThan(60);
    expect(ended.invalid).toBeNull();
  });

  test('plays a seed alike twice: the two games serialise byte for byte the same', () => {
    const again = playGame('play-a', deps, { years });
    expect(serialise(again.document)).toBe(serialise(game.document));
    expect(serialise(playGame('play-c', deps, { years }).document)).not.toBe(serialise(game.document));
  });

  // v1.1.6-S3 (DL-189): the replay plays bare, and its game is the same.
  test('bare, plays the same game with nothing observed', () => {
    const bare = playGame('play-a', deps, { years, bare: true });
    expect(serialise(bare.document)).toBe(serialise(game.document));
    expect(bare.advanceMs).toHaveLength(game.advanceMs.length);
    expect(bare.observations).toEqual(emptyObservations());
    expect(bare.rivalQuestDifficulty.size).toBe(0);
  });

  test('without validation, validates nothing', () => {
    const unchecked = playGame('play-a', deps, { years });
    expect(unchecked.validateMs).toEqual([]);
    expect(unchecked.wholeValidateMs).toBeNull();
  });
});

describe('playGame observes the World State (M3, DL-40)', () => {
  test('each morning before the policy acts, and as each year begins, the last year of a full game included', () => {
    const shortYears: EngineDeps = { ...deps, config: { ...deps.config, turnsPerYear: 30 } };
    const game = playGame('play-a', shortYears, { years: 2 });
    expect(game.turnsPlayed).toBe(60);
    expect(game.document.world.ended).toBeNull();

    const { fameGate, rosters } = game.observations;
    expect(fameGate.player.guildDays).toBe(20);
    expect(rosters).toHaveLength(3);
    expect(rosters[0]?.player).toMatchObject({ heroes: 4, levels: 4 });
    const guild = playerGuild(game.document.world) as Guild;
    const levels = guild.rosterIds.reduce((sum, id) => sum + (game.document.world.heroes[id]?.level ?? 0), 0);
    expect(rosters[2]?.player).toMatchObject({ heroes: guild.rosterIds.length, levels });
    expect(game.observations.regardAtCountedYear).toBeNull();
  });

  test("the player's Guild's Regard after 10 years, from the world as the last Turn left it (M4, DL-55)", () => {
    const shortYears: EngineDeps = { ...deps, config: { ...deps.config, turnsPerYear: 12 } };
    const game = playGame('play-a', shortYears, { years: 10 });
    expect(game.document.world.turn).toBe(120);
    expect(game.observations.rosters).toHaveLength(11);
    expect(game.observations.regardAtCountedYear).toEqual(regardSnapshot(game.document.world, shortYears.config));
    const pairs = (n: number): number => (n * (n - 1)) / 2;
    const counted = Object.values(game.observations.regardAtCountedYear?.relationships ?? {}).reduce((a, b) => a + b, 0);
    expect(counted).toBe(pairs((playerGuild(game.document.world) as Guild).rosterIds.length));
  });

  // v1.1.5-S1 (DL-174): writing a 20-year game's save at every year's end took a sixth of its time
  // and most of its memory. Each year's is counted; the last year's is gzipped from the save
  // `recordGame` writes once the game stops, the same document.
  test("the save as each year ends: every year's length as its text's, counted, and the last year's gzipped once the game stops", { timeout: 30_000 }, () => {
    const shortYears: EngineDeps = { ...deps, config: { ...deps.config, turnsPerYear: 21 } };
    const lengths: number[] = [];
    const worldLengths: number[] = [];
    const watched = playGame('play-a', shortYears, {
      years: 3,
      afterAdvance: (_before, after) => {
        if (after.world.turn % shortYears.config.turnsPerYear !== 0) return;
        lengths.push(serialise(after).length);
        worldLengths.push(JSON.stringify(after.world).length);
      },
    });
    expect(watched.observations.saves.map((save) => save.length)).toEqual(lengths);
    expect(watched.observations.saves.map((save) => save.gzipped)).toEqual([null, null, null]);
    // v1.1.6-S17 (DL-203): the World State beside the save as each year ends.
    expect(watched.observations.worlds.map((world) => world.characters)).toEqual(worldLengths);
    expect(watched.observations.worlds.every((world) => world.copyMs >= 0)).toBe(true);

    // The save and the loaded save, written again: two texts, and none while the game is played.
    vi.mocked(serialise).mockClear();
    const { record } = recordGame('play-a', shortYears, { years: 3 });
    expect(vi.mocked(serialise)).toHaveBeenCalledTimes(2);
    const gzipped = gzipSync(serialise(watched.document)).length;
    expect(record.observations.saves.map((save) => save.length)).toEqual(lengths);
    expect(record.observations.saves.map((save) => save.gzipped)).toEqual([null, null, gzipped]);
    expect(record.measures.gzipped).toBe(gzipped);

    // A game stopped short of a year's end gzips no year's save.
    const short = recordGame('play-a', shortYears, { years: 2.5 }).record;
    expect(short.observations.saves.map((save) => save.gzipped)).toEqual([null, null]);
    expect(short.measures.gzipped).toBeNull();
  });
});

// DL-238: the History's length counted as it grows, held to the walk of the whole document.
describe("playGame counts the save's length as the History grows", () => {
  test.each(['saves-a', 'saves-b', 'saves-c'])(
    "matched against the walk of the whole document and the save's text, every year of a game (%s)",
    { timeout: 30_000 },
    (seed) => {
      const shortYears: EngineDeps = { ...deps, config: { ...deps.config, turnsPerYear: 24 } };
      const walked: number[] = [];
      const written: number[] = [];
      const worlds: number[] = [];
      const game = playGame(seed, shortYears, {
        years: 4,
        afterAdvance: (_before, after) => {
          if (after.world.turn % shortYears.config.turnsPerYear !== 0) return;
          walked.push(savedLength(after));
          written.push(serialise(after).length);
          worlds.push(savedLength(after.world));
        },
      });

      expect(walked).toHaveLength(4);
      expect(game.observations.saves.map((save) => save.length)).toEqual(walked);
      expect(walked).toEqual(written);
      expect(game.observations.worlds.map((world) => world.characters)).toEqual(worlds);
    },
  );
});

describe("playGame records each dispatched Quest's difficulty (M5, DL-62)", () => {
  test('one for every Quest the policy took, read from the Quest as it was taken, which the counters join to its resolution', () => {
    const game = playGame('play-a', deps, { years });
    const { history } = game.document;
    const guild = playerGuild(game.document.world) as Guild;
    const payloads = (type: 'quest.taken' | 'quest.resolved') =>
      (history.byType[type] ?? []).map((position) => history.entries[position]?.payload as { questId: string; guildId: string; templateKey?: string });
    const taken = payloads('quest.taken').filter((payload) => payload.guildId === guild.id);
    expect(taken.length).toBeGreaterThan(0);
    expect([...game.playerQuestDifficulty.keys()].sort()).toEqual(taken.map((payload) => payload.questId).sort());

    // Each difficulty lies in its template's range; the template is named by the Quest's quest.offered.
    const offered = new Map(
      (history.byType['quest.offered'] ?? []).map((position) => {
        const payload = history.entries[position]?.payload as { questId: string; templateKey: string };
        return [payload.questId, payload.templateKey];
      }),
    );
    for (const [questId, difficulty] of game.playerQuestDifficulty) {
      const template = content.questTemplates[offered.get(questId) ?? ''];
      expect(template, questId).toBeDefined();
      expect(difficulty).toBeGreaterThanOrEqual(template?.difficultyMin ?? Infinity);
      expect(difficulty).toBeLessThanOrEqual(template?.difficultyMax ?? -Infinity);
    }

    const { record } = recordGame('play-a', deps, { years });
    const resolved = payloads('quest.resolved').filter((payload) => payload.guildId === guild.id).length;
    const byBand = record.counters.playerQuestsByDifficulty ?? [];
    expect(byBand.reduce((sum, tally) => sum + tally.quests, 0)).toBe(resolved);
    const sum = [...game.playerQuestDifficulty]
      .filter(([questId]) => payloads('quest.resolved').some((payload) => payload.questId === questId))
      .reduce((total, [, difficulty]) => total + difficulty, 0);
    expect(byBand.reduce((total, tally) => total + tally.difficulty, 0)).toBe(sum);
  });
});

describe("playGame reads the Rivals' afternoons (M6, DL-69)", () => {
  test("the difficulty of every Quest a Rival took, as the afternoon found it, which the counters give each Disposition", () => {
    const game = playGame('play-a', deps, { years });
    const { history, world } = game.document;
    const offered = new Map(
      (history.byType['quest.offered'] ?? []).map((position) => {
        const payload = history.entries[position]?.payload as { questId: string; templateKey: string };
        return [payload.questId, payload.templateKey];
      }),
    );
    const rivalTaken = (history.byType['quest.taken'] ?? [])
      .map((position) => history.entries[position]?.payload as { questId: string; guildId: GuildId })
      .filter((payload) => dispositionOf(world.guilds[payload.guildId] as Guild) !== null);
    expect(rivalTaken.length).toBeGreaterThan(0);
    expect([...game.rivalQuestDifficulty.keys()].sort()).toEqual(rivalTaken.map((payload) => payload.questId).sort());
    for (const [questId, difficulty] of game.rivalQuestDifficulty) {
      const template = content.questTemplates[offered.get(questId) ?? ''];
      expect(template, questId).toBeDefined();
      expect(difficulty).toBeGreaterThanOrEqual(template?.difficultyMin ?? Infinity);
      expect(difficulty).toBeLessThanOrEqual(template?.difficultyMax ?? -Infinity);
    }

    const { record } = recordGame('play-a', deps, { years });
    const tallies = Object.values(record.counters.dispositions);
    expect(tallies.reduce((sum, tally) => sum + tally.questsWithDifficulty, 0)).toBe(rivalTaken.length);
    expect(tallies.reduce((sum, tally) => sum + tally.questsTaken, 0)).toBe(rivalTaken.length);
    expect(tallies.reduce((sum, tally) => sum + tally.difficulty, 0)).toBe([...game.rivalQuestDifficulty.values()].reduce((a, b) => a + b, 0));
  });

  test('readAdvance: of the Transfers an afternoon made, those whose seller was in debt as it began, and none on a night', () => {
    // `advance` plays the Turn after the world's on a copy, appending to the same History: here by hand.
    const before = createWorld('play-debt', harnessSetup, deps).document;
    const [debtor, sound] = Object.values(before.world.guilds).filter((guild) => dispositionOf(guild) !== null);
    if (debtor === undefined || sound === undefined) throw new Error('Fewer than two Rivals');
    debtor.belowFloorSince = 0;
    const mark = markHistory(before);
    const after = { ...before, world: structuredClone(before.world) };
    after.world.turn = before.world.turn + 1;
    expect(timeOfDay(after.world.turn)).toBe('afternoon');
    const moved = (from: Guild, to: Guild): number => {
      const position = before.history.entries.length;
      const heroId = from.rosterIds[0] as HeroId;
      append(before.history, {
        turn: after.world.turn,
        type: 'hero.transferred',
        participants: [heroId, from.id, to.id],
        labels: {},
        milestone: true,
        payload: { heroId, fromGuildId: from.id, toGuildId: to.id, fee: 100, offerId: null },
      });
      return position;
    };
    const fromDebtor = moved(debtor, sound);
    moved(sound, debtor);

    const difficulties = new Map<string, number>();
    const sellerInDebt = new Set<number>();
    readAdvance(before, mark, after, difficulties, sellerInDebt);
    expect([...sellerInDebt]).toEqual([fromDebtor]);
    // Read again from after them, nothing more.
    readAdvance(before, markHistory(before), after, difficulties, sellerInDebt);
    expect([...sellerInDebt]).toEqual([fromDebtor]);

    // On a night, whatever the debt, none: the Generator's Transfers are not the afternoon's.
    const none = new Set<number>();
    readAdvance(before, mark, { ...after, world: { ...after.world, turn: after.world.turn + 1 } }, difficulties, none);
    expect(none.size).toBe(0);
  });

  test('readAdvance judges only the Transfers of the advance it reads: a sale made out of debt stays so when the seller falls into debt later', () => {
    const before = createWorld('play-debt', harnessSetup, deps).document;
    const [seller, buyer] = Object.values(before.world.guilds).filter((guild) => dispositionOf(guild) !== null);
    if (seller === undefined || buyer === undefined) throw new Error('Fewer than two Rivals');
    const afternoon = (turn: number): WorldDocument => {
      expect(timeOfDay(turn)).toBe('afternoon');
      return { ...before, world: { ...structuredClone(before.world), turn } };
    };
    const sellerInDebt = new Set<number>();

    // The first afternoon: the seller, out of debt, sells.
    const first = markHistory(before);
    const heroId = seller.rosterIds[0] as HeroId;
    const position = before.history.entries.length;
    append(before.history, {
      turn: 1,
      type: 'hero.transferred',
      participants: [heroId, seller.id, buyer.id],
      labels: {},
      milestone: true,
      payload: { heroId, fromGuildId: seller.id, toGuildId: buyer.id, fee: 100, offerId: null },
    });
    readAdvance(before, first, afternoon(1), new Map(), sellerInDebt);
    expect(sellerInDebt.size).toBe(0);

    // A night puts the seller in debt; the next afternoon makes no Transfer, and the first sale is not read again.
    seller.belowFloorSince = 2;
    readAdvance(before, markHistory(before), afternoon(4), new Map(), sellerInDebt);
    expect(sellerInDebt.has(position)).toBe(false);
    expect(sellerInDebt.size).toBe(0);
  });

  test('recordGame gives the counters the Transfers whose seller was in debt, which they count apart', () => {
    // Every Guild below the floor from the first night, and none bankrupt within the game.
    const inDebt: EngineDeps = { ...dealing, config: { ...dealing.config, bankruptcyFloor: 1e9, bankruptcyGraceDays: 10_000 } };
    const game = playGame('play-a', inDebt, { years });
    const { history, world } = game.document;
    const rivalToRival = (position: number): boolean => {
      const payload = history.entries[position]?.payload as { fromGuildId: GuildId; toGuildId: GuildId };
      return [payload.fromGuildId, payload.toGuildId].every((guildId) => dispositionOf(world.guilds[guildId] as Guild) !== null);
    };
    const afternoons = (history.byType['hero.transferred'] ?? []).filter(
      (position) => rivalToRival(position) && timeOfDay(history.entries[position]?.turn ?? 0) === 'afternoon',
    );
    const sold = [...game.sellerInDebt].filter(rivalToRival);
    expect(sold.length).toBeGreaterThan(0);
    expect(afternoons.length).toBeGreaterThan(sold.length);

    const { record } = recordGame('play-a', inDebt, { years });
    expect(record.counters.rivalTransfers['afternoon-seller-in-debt'].transfers).toBe(sold.length);
    expect(record.counters.rivalTransfers.afternoon.transfers).toBe(afternoons.length - sold.length);
  });
});

describe('the M6-S3 harness assertion (DL-69): no hero.transferred names the player\'s Guild', () => {
  test('holds under the automatic policy', () => {
    const game = playGame('play-a', deps, { years });
    expect(game.assertion).toBeNull();
    expect(playerTransferred(game.document)).toBeNull();
  });

  test("fires on a Transfer into the player's Guild, stopping the game as a validator refusal does, and the report lists it", () => {
    // A player's choices that take a Rival's Hero in on the first Turn, then play as the policy does.
    // Each try is on a copy: an accepted action appends to the History it shares (ADR-0008).
    const takeOne = (document: WorldDocument, given: EngineDeps, policy: Readonly<PolicyConfig>): GuildAction[] => {
      const guild = playerGuild(document.world) as Guild;
      if (document.world.turn !== 0) return automaticPolicy(document, given, policy);
      for (const rival of Object.values(document.world.guilds).filter((other) => other.id !== guild.id)) {
        for (const heroId of rival.rosterIds) {
          const action: GuildAction = { kind: 'transferIn', guildId: guild.id, heroId };
          if (applyAction(structuredClone(document), action, given).ok) return [action];
        }
      }
      throw new Error('No Rival would let a Hero go');
    };
    const game = playGame('play-a', deps, { years, validate: true, choose: takeOne });

    expect(game.refusals).toEqual([]);
    expect(game.invalid).toBeNull();
    const [position] = game.document.history.byType['hero.transferred'] ?? [];
    expect(game.assertion).toEqual({ turn: 0, check: 'player-transferred', id: `$.history.entries[${position}]`, detail: expect.any(String) });
    expect(game.turnsPlayed).toBe(1);
    expect(playerTransferred(game.document, 1)).toBeNull();

    const { record } = recordGame('play-a', deps, { years, choose: takeOne });
    expect(record.assertion).toEqual(game.assertion);
    expect(record.counters.transfers.in.transfers).toBe(1);
    const sweep = {
      seeds: ['play-a'],
      years,
      validated: false,
      policy: defaultPolicyConfig,
      workers: 1,
      games: [record],
      advance: summarise([1]),
      validation: summarise([]),
      replay: null,
      totalMs: 1,
      gamesMs: 1,
    };
    const report = playReport(sweep, { deps, machine: machine(), startedAt: new Date(2026, 8, 27, 12), milestone: 'm6' });
    expect(report).toContain('| Games a harness assertion stopped | 1 |');
    expect(report).toContain('## Harness assertions broken');
    expect(report).toContain(`| \`play-a\` | 0 | player-transferred | \`$.history.entries[${position}]\` |`);
    expect(report).toContain("`hero.transferred` entries naming the player's Guild, 1; games it stopped, 1.");
  });

  test("fires on a Transfer out of the player's Guild on a later Turn, after Turns it has already checked, and not on the Rivals' own", () => {
    // Out of the player's Guild is the way the assertion guards (the Generator never takes from it).
    // The player's choices send a Hero not yet dispatched to a Rival on Turn 2, after two advances
    // each checked, the Rivals dealing among themselves meanwhile, and otherwise play as the policy
    // does.
    const turn = 2;
    const sendOne = (document: WorldDocument, given: EngineDeps, policy: Readonly<PolicyConfig>): GuildAction[] => {
      const guild = playerGuild(document.world) as Guild;
      if (document.world.turn !== turn) return automaticPolicy(document, given, policy);
      for (const rival of Object.values(document.world.guilds).filter((other) => other.id !== guild.id)) {
        for (const heroId of guild.rosterIds) {
          const action: GuildAction = { kind: 'transferOut', guildId: guild.id, heroId, toGuildId: rival.id };
          if (applyAction(structuredClone(document), action, given).ok) return [action];
        }
      }
      throw new Error('No Rival would take a Hero in');
    };
    const game = playGame('play-a', dealing, { years, validate: true, choose: sendOne });

    expect(game.refusals).toEqual([]);
    expect(game.invalid).toBeNull();
    const { history } = game.document;
    const guildId = playerGuild(game.document.world)?.id;
    const transferred = history.byType['hero.transferred'] ?? [];
    const position = transferred.find((at) => (history.entries[at]?.payload as { fromGuildId: string }).fromGuildId === guildId);
    if (position === undefined) throw new Error("No Hero left the player's Guild");
    // The Rivals' Transfers of the Turns before, none naming the player's Guild, did not stop the game.
    expect(transferred.filter((at) => at < position && (history.entries[at]?.turn ?? turn) < turn).length).toBeGreaterThan(0);
    expect(game.assertion).toEqual({
      turn,
      check: 'player-transferred',
      id: `$.history.entries[${position}]`,
      detail: expect.stringContaining("out of the player's Guild"),
    });
    expect(game.turnsPlayed).toBe(turn + 1);
  });
});

describe('recordGame and measureDocument', () => {
  test('reduce a game to its counters and the measures of its last document, which loads back', () => {
    const { record, advanceMs } = recordGame('play-a', deps, { years });
    expect(advanceMs).toHaveLength(60);
    expect(record).toMatchObject({ seed: 'play-a', turnsPlayed: 60, ranFullLength: true, refusals: [], invalid: null });
    expect(record.counters.ending).toBeNull();
    expect(record.counters.lastTurn).toBe(60);
    expect(record.counters.guildYears.player).toEqual([60 / deps.config.turnsPerYear]);
    expect(record.observations.fameGate.player.guildDays).toBe(20);
    expect(record.observations.rosters).toHaveLength(1);
    expect(record.measures.roundTrips).toBe(true);

    const { document } = playGame('play-a', deps, { years });
    const measures = measureDocument(document, deps);
    expect(measures.historyEntries).toBe(document.history.entries.length);
    expect(measures.serialisedLength).toBe(serialise(document).length);
    expect(measures.serialisedLength).toBe(record.measures.serialisedLength);
  });

  test("fingerprint the last document: SHA-256 of its save, in hex, the same for the same game (M8-S1, DL-76)", () => {
    const { record } = recordGame('play-a', deps, { years });
    const { document } = playGame('play-a', deps, { years });

    const { fingerprint } = measureDocument(document, deps);

    expect(fingerprint).toBe(createHash('sha256').update(serialise(document)).digest('hex'));
    expect(record.measures.fingerprint).toBe(fingerprint);
    expect(recordGame('play-b', deps, { years }).record.measures.fingerprint).not.toBe(fingerprint);
  });
});
