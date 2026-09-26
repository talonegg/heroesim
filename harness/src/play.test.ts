import { loadContent } from '@heroesim/content/node';
import { defaultConfig, playerGuild, serialise, type EngineDeps, type Guild } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { regardSnapshot } from './counters.js';
import { measureDocument, playGame, recordGame, validatingEveryTurn } from './play.js';

// Ordinary tests, run by `npm test`: a few short games under the automatic policy. The full play
// sweep is play.harness.test.ts, behind HEROESIM_HARNESS (M2-S12, DL-34).

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
/** Twenty Days: long enough for Parties to leave and come home, and short for `npm test`. */
const years = 60 / deps.config.turnsPerYear;

describe('validatingEveryTurn reads HEROESIM_VALIDATE (INPUTS §9)', () => {
  test.each([
    [undefined, false],
    ['', false],
    ['0', false],
    ['false', false],
    ['1', true],
    [' TRUE ', true],
  ])('%j is %s', (value, expected) => {
    expect(validatingEveryTurn(value)).toBe(expected);
  });

  test('refuses anything else rather than not validating', () => {
    expect(() => validatingEveryTurn('yes')).toThrow(/HEROESIM_VALIDATE/);
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

  test('validates after every advance and the whole document at the end, and the validator accepts it', () => {
    expect(game.invalid).toBeNull();
    expect(game.validateMs).toHaveLength(60);
    expect(game.wholeValidateMs).not.toBeNull();
  });

  test('stops on the Turn the game ends', () => {
    const doomed: EngineDeps = { ...deps, config: { ...deps.config, startingWealth: -1000, bankruptcyGraceDays: 1 } };
    const ended = playGame('play-b', doomed, { years, validate: true });
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

  test("the player's Guild's Regard as year 10 begins, from the world as the last Turn left it (M4, DL-55)", () => {
    const shortYears: EngineDeps = { ...deps, config: { ...deps.config, turnsPerYear: 12 } };
    const game = playGame('play-a', shortYears, { years: 10 });
    expect(game.document.world.turn).toBe(120);
    expect(game.observations.rosters).toHaveLength(11);
    expect(game.observations.regardAtCountedYear).toEqual(regardSnapshot(game.document.world, shortYears.config));
    const pairs = (n: number): number => (n * (n - 1)) / 2;
    const counted = Object.values(game.observations.regardAtCountedYear?.relationships ?? {}).reduce((a, b) => a + b, 0);
    expect(counted).toBe(pairs((playerGuild(game.document.world) as Guild).rosterIds.length));
  });
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
});
