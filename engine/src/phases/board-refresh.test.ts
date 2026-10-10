import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { QuestTemplate } from '../content-types.js';
import { compareByCodeUnit, type GuildId, type Hero, type PatronId, type Quest, type QuestId, type World, type WorldDocument } from '../document.js';
import { count, entriesFor } from '../history.js';
import { generateQuest } from '../generators/quests.js';
import { patronBoardWeight } from '../regard.js';
import { createStreams, pick } from '../rng.js';
import { boardTopTier, offeredTiers } from '../tiers.js';
import { dayOf, timeOfDay, yearOf } from '../time.js';
import { plannedStreams, playWith, setup, streamsOutOfPlace, testContent, testDeps, withValid } from '../world.test-support.js';
import { boardRefresh, boardSizeAt } from './board-refresh.js';
import { phaseContext } from './phase.js';

/** Advances to a Turn, validating every document. */
const playTo = playWith(advance);

function created(seed: string, deps: EngineDeps = testDeps()): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

/**
 * No Rivals: they take Quests each afternoon, and the tests that play Turns watch the
 * Board's own refresh.
 */
const noRivals = { rivalCount: 0 };

/** Takes `n` Quests off the Board and out of the world, as a Guild taking them would. */
function takeFromBoard(world: World, n: number): void {
  for (const questId of world.board.splice(0, n)) delete world.quests[questId];
}

describe('boardSizeAt (DL-261)', () => {
  /** A Year of ten Days, so that a test plays several. */
  const turnsPerYear = 30;

  test("is the start, grown by the Years played and floored to a whole Board, never above the cap", () => {
    const config = testDeps({ turnsPerYear, boardSizeStart: 2, boardGrowthPerYear: 1.5, boardSizeMax: 7 }).config;
    // Years 0 to 5: 2, 3.5, 5, 6.5, 8 and 9.5 Quests' worth, each floored, the last two capped.
    expect([0, 1, 2, 3, 4, 5].map((year) => boardSizeAt(year * turnsPerYear, config))).toEqual([2, 3, 5, 6, 7, 7]);
  });

  test('counts the Years played as the whole Years since Turn 0, as yearOf does: it grows on the first Turn of a Year', () => {
    const config = testDeps({ turnsPerYear, boardSizeStart: 4, boardGrowthPerYear: 1, boardSizeMax: 10 }).config;
    expect(boardSizeAt(0, config)).toBe(4);
    expect(boardSizeAt(turnsPerYear - 1, config)).toBe(4);
    expect(boardSizeAt(turnsPerYear, config)).toBe(5);
    expect(boardSizeAt(3 * turnsPerYear + 7, config)).toBe(4 + yearOf(3 * turnsPerYear + 7, config));

    // Never by a part of a Year: at 1.5 a Year, the last Turn of Year 1 holds Year 1's 3.5, not 4.95.
    const faster = testDeps({ turnsPerYear, boardSizeStart: 2, boardGrowthPerYear: 1.5, boardSizeMax: 10 }).config;
    expect(boardSizeAt(2 * turnsPerYear - 1, faster)).toBe(3);
    expect(boardSizeAt(2 * turnsPerYear, faster)).toBe(5);
  });

  test('a part of a Quest a Year adds a Quest each time the parts make a whole one', () => {
    const config = testDeps({ turnsPerYear, boardSizeStart: 3, boardGrowthPerYear: 0.5, boardSizeMax: 6 }).config;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((year) => boardSizeAt(year * turnsPerYear, config))).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 6]);
  });

  test('a growth in hundredths adds its Quest in the Year its parts make a whole one, though no binary fraction holds it exactly', () => {
    // 0.29 × 100 and 1.16 × 25 are 28.999… and 28.999… in floating point.
    const hundredths = testDeps({ turnsPerYear, boardSizeStart: 6, boardGrowthPerYear: 0.29, boardSizeMax: 100 }).config;
    expect(boardSizeAt(100 * turnsPerYear, hundredths)).toBe(35);
    expect(boardSizeAt(99 * turnsPerYear, hundredths)).toBe(34);
    const larger = testDeps({ turnsPerYear, boardSizeStart: 0, boardGrowthPerYear: 1.16, boardSizeMax: 100 }).config;
    expect(boardSizeAt(25 * turnsPerYear, larger)).toBe(29);
    expect(boardSizeAt(24 * turnsPerYear, larger)).toBe(27);
  });

  test('with no growth, is the start every Year: the defaults keep a Board of one size', () => {
    const config = testDeps({ turnsPerYear, boardSizeStart: 5, boardGrowthPerYear: 0, boardSizeMax: 9 }).config;
    expect([0, 1, 20].map((year) => boardSizeAt(year * turnsPerYear, config))).toEqual([5, 5, 5]);
  });

  test('a new world opens on the start, and a played Board grows each Year to the cap, refilled the first morning of the Year', () => {
    const deps = testDeps({ ...noRivals, turnsPerYear, boardSizeStart: 2, boardGrowthPerYear: 1.5, boardSizeMax: 5 });
    let document = created('growing', deps);
    expect(document.world.board).toHaveLength(2);

    const mornings: number[] = [];
    for (let year = 1; year <= 3; year += 1) {
      document = playTo(document, year * turnsPerYear, deps).document;
      expect(timeOfDay(document.world.turn)).toBe('morning');
      mornings.push(document.world.board.length);
    }

    expect(mornings).toEqual([3, 5, 5]);
  });
});

describe('boardRefresh', () => {
  test("refills the Board to the Year's size every morning, and it never holds more", () => {
    const deps = testDeps(noRivals);
    const size = boardSizeAt(0, deps.config);
    let document = created('refill', deps);
    expect(document.world.board).toHaveLength(size);

    for (let turn = 1; turn <= 30; turn += 1) {
      // Two Quests go each afternoon, as Rivals would take them.
      if (timeOfDay(document.world.turn) === 'afternoon') {
        document = { ...document, world: structuredClone(document.world) };
        takeFromBoard(document.world, 2);
      }
      const before = document.world.board.length;
      document = playTo(document, turn, deps).document;
      const { board } = document.world;

      if (timeOfDay(turn) === 'morning') expect(board, `Turn ${turn}`).toHaveLength(size);
      else expect(board.length, `Turn ${turn}`).toBe(before);
      expect(board.length).toBeLessThanOrEqual(size);
      for (const questId of board) expect(document.world.quests[questId]?.status).toBe('offered');
    }
  });

  test("draws nothing onto a Board already holding the Year's size or more, and removes nothing unexpired", () => {
    const deps = testDeps(noRivals);
    const document = created('full', deps);
    const smaller = testDeps({ ...noRivals, boardSizeStart: 3, boardSizeMax: 3 });

    const { document: morning, events } = playTo(document, 3, smaller);

    expect(events.filter((event) => event.type === 'quest.offered')).toEqual([]);
    expect(morning.world.board).toEqual(document.world.board);
  });

  test('expires an offered Quest questOfferDays after it was offered, with quest.expired, and removes its row', () => {
    const deps = testDeps(noRivals);
    const document = created('expiry', deps);
    const offered = [...document.world.board];
    const patrons = offered.map((id) => document.world.quests[id]?.patronId);
    const lastNight = 3 * deps.config.questOfferDays - 1;

    const { document: night } = playTo(document, lastNight, deps);
    expect(night.world.board).toEqual(offered);
    expect(count(night.history, 'quest.expired')).toBe(0);

    const { document: morning, events } = playTo(night, lastNight + 1, deps);

    expect(dayOf(morning.world.turn) - dayOf(0)).toBe(deps.config.questOfferDays);
    const expired = events.filter((event) => event.type === 'quest.expired');
    expect(expired.map((event) => event.participants)).toEqual(offered.map((id, i) => [id, patrons[i]]));
    for (const event of expired) {
      const [questId, patronId] = event.participants as [QuestId, PatronId];
      expect(event).toMatchObject({ turn: morning.world.turn, milestone: false });
      expect(event.payload).toEqual({ questId, patronId, templateKey: document.world.quests[questId]?.templateKey });
      expect(event.labels[patronId]).toBe(document.world.patrons[patronId]?.name);
    }
    for (const questId of offered) {
      expect(Object.hasOwn(morning.world.quests, questId)).toBe(false);
      expect(entriesFor(morning.history, questId).map((entry) => entry.type)).toEqual(['quest.expired', 'quest.offered']);
    }
    // Expired first, then the Board refilled from empty.
    expect(events.map((event) => event.type)).toEqual([
      ...offered.map(() => 'quest.expired'),
      ...offered.map(() => 'quest.offered'),
    ]);
    expect(morning.world.board.some((id) => offered.includes(id))).toBe(false);
    expect(morning.world.board).toHaveLength(boardSizeAt(morning.world.turn, deps.config));
  });

  test('reads questOfferDays from the config it is given', () => {
    const deps = testDeps({ ...noRivals, questOfferDays: 5 });
    const document = created('five-days', deps);

    expect(count(playTo(document, 14, deps).document.history, 'quest.expired')).toBe(0);
    expect(count(playTo(document, 15, deps).document.history, 'quest.expired')).toBe(boardSizeAt(0, deps.config));
  });

  test("advances the board stream and, for the new Quests' Encounter sequences, the encounters stream, and no other", () => {
    // The morning's Market refresh draws from `market`: a Market of size 0 draws nothing.
    const deps = testDeps({ ...noRivals, marketSize: 0 });
    const document = created('streams', deps);
    const others = plannedStreams.filter((name) => !Object.hasOwn(document.world.rng, name));
    Object.assign(document.world.rng, createStreams(document.meta.seed, others));
    const night = playTo(withValid(document, deps), 8, deps).document;
    const before = structuredClone(night.world.rng) as Record<string, unknown>;

    const morning = playTo(night, 9, deps).document;

    expect(count(morning.history, 'quest.expired')).toBe(boardSizeAt(0, deps.config));
    expect(streamsOutOfPlace(before, morning.world.rng, ['board', 'encounters'])).toEqual([]);
  });

  /** How many Quests each Patron offers over `rounds` refreshes of an emptied Board, run alone. */
  function tallyOffers(world: World, deps: EngineDeps, rounds: number): Map<string, number> {
    const tally = new Map<string, number>();
    for (let round = 0; round < rounds; round += 1) {
      takeFromBoard(world, world.board.length);
      for (const event of boardRefresh(world, phaseContext(world, deps))) {
        const patronId = event.participants[1] ?? '';
        tally.set(patronId, (tally.get(patronId) ?? 0) + 1);
      }
    }
    return tally;
  }

  test("weights each Patron by their mean Regard across the Guilds in play (R22): twice as often at the scale's top, never at its bottom", () => {
    const deps = testDeps({ regardMin: -20, regardMax: 20, boardRegardWeight: 1 });
    const { world } = created('weighted', deps);
    const [favoured, shunned, ...rest] = Object.values(world.patrons);
    if (favoured === undefined || shunned === undefined) throw new Error('Too few Patrons');
    const guildIds = Object.keys(world.guilds) as GuildId[];
    expect(guildIds.length).toBeGreaterThan(1);
    for (const guildId of guildIds) {
      favoured.regard[guildId] = { value: 20, since: 0, reason: 'test' };
      shunned.regard[guildId] = { value: -20, since: 0, reason: 'test' };
    }
    // Weights 2, 0 and 1 for each of the rest: a draw in twelve Patrons' worth.
    const rounds = 2000;
    const total = 2 + rest.length;

    const tally = tallyOffers(world, deps, rounds);

    const drawn = rounds * boardSizeAt(world.turn, deps.config);
    expect(tally.get(shunned.id) ?? 0).toBe(0);
    expect(Math.abs((tally.get(favoured.id) ?? 0) / drawn - 2 / total)).toBeLessThan(0.015);
    for (const patron of rest) expect(Math.abs((tally.get(patron.id) ?? 0) / drawn - 1 / total), patron.id).toBeLessThan(0.01);
    // The mean is across the Guilds in play: one Guild's Regard alone moves it by its share.
    for (const guildId of guildIds.slice(1)) delete favoured.regard[guildId];
    expect(patronBoardWeight(favoured, world, deps.config)).toBeCloseTo(1 + 1 / guildIds.length, 10);
  });

  /**
   * The Boards `boardRefresh` offers `world` emptied, `rounds` times, and the Boards `pick` over the
   * Patrons gives, with the streams each leaves. Many Boards, not one: a Patron weighed a little off
   * uniform moves only the rare draw near a bucket's edge, which a single Board seldom meets (DL-246).
   */
  function offeredAndUniform(world: World, deps: EngineDeps, rounds = 200) {
    const again = structuredClone(world);
    const patrons = Object.values(again.patrons).sort((a, b) => compareByCodeUnit(a.id, b.id));
    const offered: (string | undefined)[] = [];
    const uniform: string[] = [];
    for (let round = 0; round < rounds; round += 1) {
      takeFromBoard(world, world.board.length);
      takeFromBoard(again, again.board.length);
      offered.push(...boardRefresh(world, phaseContext(world, deps)).map((event) => event.participants[1]));
      // The same draws by `pick`, as DL-25's refresh made them: one draw for the Patron, then the Quest's.
      const state = again.rng.board;
      while (again.board.length < boardSizeAt(again.turn, deps.config)) {
        const patron = pick(state, patrons);
        uniform.push(generateQuest(again, patron, deps).events[0]?.participants[1] ?? '');
      }
    }
    return { offered, uniform, stream: world.rng.board, uniformStream: again.rng.board };
  }

  test('draws uniformly whatever the Regard when boardRegardWeight is 0: the very Boards a uniform draw gives, refresh after refresh', () => {
    const deps = testDeps({ boardRegardWeight: 0 });
    const { world } = created('unweighted', deps);
    const [favoured] = Object.values(world.patrons);
    if (favoured === undefined) throw new Error('No Patrons');
    for (const guildId of Object.keys(world.guilds) as GuildId[]) favoured.regard[guildId] = { value: 20, since: 0, reason: 'test' };

    const { offered, uniform, stream, uniformStream } = offeredAndUniform(world, deps);

    expect(offered).toEqual(uniform);
    expect(stream).toEqual(uniformStream);
  });

  test('draws, with every Patron at neutral, the very Boards a uniform draw gives, refresh after refresh: a new world opens on the Board it opened on before Patron Regard weighed the draw (DL-43)', () => {
    const deps = testDeps();
    const { world } = created('same-board', deps);

    const { offered, uniform, stream, uniformStream } = offeredAndUniform(world, deps);

    expect(offered).toEqual(uniform);
    expect(stream).toEqual(uniformStream);
  });

  test("draws each Quest up to the Board's top Tier, the highest the Guilds in play have unlocked as the refresh begins (DL-271)", () => {
    const deps = testDeps();
    const { world } = created('top-tier', deps);
    /** The Tiers of `rounds` Boards drawn afresh, each Quest's beside the lowest its template offers. */
    const drawn = (rounds: number): { tier: number; lowest: number }[] => {
      const all: { tier: number; lowest: number }[] = [];
      for (let round = 0; round < rounds; round += 1) {
        takeFromBoard(world, world.board.length);
        boardRefresh(world, phaseContext(world, deps));
        for (const questId of world.board) {
          const quest = world.quests[questId] as Quest;
          const template = testContent.questTemplates[quest.templateKey] as QuestTemplate;
          all.push({ tier: quest.tier, lowest: offeredTiers(template, deps.config)[0] as number });
        }
      }
      return all;
    };

    // A new world's Heroes are at Level 1: the top is Tier 1, and each Quest is at its template's lowest Tier.
    expect(boardTopTier(world, deps.config)).toBe(1);
    for (const { tier, lowest } of drawn(20)) expect(tier).toBe(lowest);

    // Every Hero on a Roster at Level 9: the best fours unlock Tier 4, and the refresh draws above the lowest, never past 4 but at a lowest above it.
    for (const guild of Object.values(world.guilds)) for (const heroId of guild.rosterIds) (world.heroes[heroId] as Hero).level = 9;
    expect(boardTopTier(world, deps.config)).toBe(4);
    const unlocked = drawn(20);
    expect(unlocked.some(({ tier, lowest }) => tier > lowest)).toBe(true);
    expect(unlocked.some(({ tier }) => tier === 4)).toBe(true);
    for (const { tier, lowest } of unlocked) expect(tier).toBeLessThanOrEqual(Math.max(4, lowest));
  });

  test('never draws a Patron whose Sphere no template serves, and leaves the Board empty when none is served', () => {
    const deps = testDeps();
    const document = created('unserved', deps);
    const { world } = document;
    const crownOnly: EngineDeps = {
      config: deps.config,
      content: {
        ...testContent,
        questTemplates: Object.fromEntries(
          Object.entries(testContent.questTemplates).filter(([, template]) => template.sphereKeys.includes('crown')),
        ),
      },
    };

    for (let round = 0; round < 20; round += 1) {
      takeFromBoard(world, world.board.length);
      for (const event of boardRefresh(world, phaseContext(world, crownOnly))) {
        const patronId = event.participants[1] as PatronId;
        expect(world.patrons[patronId]?.sphereKey).toBe('crown');
      }
    }

    const none: EngineDeps = { config: deps.config, content: { ...testContent, questTemplates: {} } };
    takeFromBoard(world, world.board.length);
    expect(boardRefresh(world, phaseContext(world, none))).toEqual([]);
    expect(world.board).toEqual([]);
  });
});
