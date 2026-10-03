import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { availableHeroes, partyFor } from '../controllers/rival.js';
import { createWorld } from '../create.js';
import { facilityKeys, makeId, type FacilityKey, type Guild, type Guildmaster, type Hero, type World, type WorldDocument } from '../document.js';
import type { TurnEvent } from '../events.js';
import { count } from '../history.js';
import { moraleBaselineFor } from '../morale.js';
import { phaseContext } from '../phases/phase.js';
import { training } from '../phases/training.js';
import { affordableImprovement, healFactor, nextImprovement, playerGuild, upkeep } from '../selectors.js';
import { serialise } from '../serialise.js';
import { dayOf, nightOf } from '../time.js';
import { testContent, testDeps, withEncounters, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import { build, type BuildRejection } from './build.js';
import { dispatch } from './dispatch.js';

// M3-S6: Hall Improvements (INPUTS 7.3, DL-38). The test content carries the core's nine
// Improvements, three grades of each facility at 200, 500 and 1,000 Wealth. Every document a test
// makes is held to the validator; the config values a test relies on are pinned.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** No Rivals: none of these tests is about them, and a Rival acts every afternoon (DL-30). */
const deps = testDeps({ rivalCount: 0, hallMaintenancePerGrade: 10 });

/** A new world and its player's Guild, with `wealth`. */
function scene(seed = 'build', wealth = 10_000, with_: EngineDeps = deps): { document: WorldDocument; guild: Guild } {
  const { document } = createWorld(seed, setup, with_);
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('No player');
  guild.wealth = wealth;
  return { document, guild };
}

/** The costs of `facility`'s grades in content, lowest grade first. */
function costsOf(facility: FacilityKey): number[] {
  return Object.values(deps.content.improvements)
    .filter((it) => it.facility === facility)
    .sort((a, b) => a.grade - b.grade)
    .map((it) => it.cost);
}

describe('build', () => {
  test.each(facilityKeys)(
    '%s climbs from 0 to its top grade, each for the next grade’s cost, and refuses beyond',
    (facility) => {
      const start = 10_000;
      let { document, guild } = scene(`climb-${facility}`, start);
      const costs = costsOf(facility);
      expect(costs).toEqual([200, 500, 1000]);

      let spent = 0;
      for (const [index, cost] of costs.entries()) {
        const grade = index + 1;
        const result = build(document, { guildId: guild.id, facility }, deps);
        if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
        document = withValid(result.document, deps);
        guild = document.world.guilds[guild.id] as Guild;
        spent += cost;
        expect(guild.hall[facility]).toBe(grade);
        expect(guild.wealth).toBe(start - spent);
        expect(result.events).toEqual([
          {
            turn: 0,
            type: 'guild.improved',
            participants: [guild.id],
            labels: { [guild.id]: guild.name },
            milestone: true,
            payload: { guildId: guild.id, facility, grade, improvementKey: expect.any(String) as string, cost },
          },
        ]);
      }
      expect(spent).toBe(1700);
      // Only this facility moved.
      for (const other of facilityKeys) if (other !== facility) expect(guild.hall[other]).toBe(0);

      const saved = serialise(document);
      const beyond = build(document, { guildId: guild.id, facility }, deps);
      expect(beyond).toEqual({ ok: false, rejection: { action: 'build', reason: 'max-grade', facility, grade: 3 } });
      expect(serialise(document)).toBe(saved);
      expect(count(document.history, 'guild.improved')).toBe(3);
    },
  );

  test('names the Improvement built, and appends a Milestone to the History', () => {
    const { document, guild } = scene();

    const result = build(document, { guildId: guild.id, facility: 'trainingYard' }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const [event] = result.events;
    expect(event?.type === 'guild.improved' && event.payload.improvementKey).toBe('training-yard-1');
    const { history } = result.document;
    expect(history.entries.at(-1)).toBe(event);
    expect(history.milestones.at(-1)).toBe(history.entries.length - 1);
  });

  test("gives a new world and leaves the input's as it was, sharing meta and the History", () => {
    const { document, guild } = scene();
    const before = structuredClone(document.world);

    const result = build(document, { guildId: guild.id, facility: 'infirmary' }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    expect(result.document.world).not.toBe(document.world);
    expect(document.world).toEqual(before);
    expect(result.document.meta).toBe(document.meta);
    expect(result.document.history).toBe(document.history);
  });

  test('builds with Wealth exactly equal to the cost, leaving none', () => {
    const { document, guild } = scene('exact', 200);

    const result = build(document, { guildId: guild.id, facility: 'quarters' }, deps);

    expect(result.ok && result.document.world.guilds[guild.id]?.wealth).toBe(0);
  });

  test('is the same rule for a Rival (ADR-0002), and what applyAction does with a build action', () => {
    const withRival = testDeps({ rivalCount: 1 });
    const { document } = createWorld('rival-builds', setup, withRival);
    const rival = Object.values(document.world.guilds).find((each) => each.controller.kind === 'rival') as Guild;
    rival.wealth = 1_000;
    const twin = structuredClone(document);

    const direct = build(document, { guildId: rival.id, facility: 'infirmary' }, withRival);
    const applied = applyAction(twin, { kind: 'build', guildId: rival.id, facility: 'infirmary' }, withRival);

    if (!direct.ok) throw new Error(`Refused: ${direct.rejection.reason}`);
    const { world } = withValid(direct.document, withRival);
    expect(world.guilds[rival.id]).toMatchObject({ wealth: 800, hall: { infirmary: 1, trainingYard: 0, quarters: 0 } });
    expect(applied.ok && serialise(applied.document)).toBe(serialise(direct.document));
  });

  test('raises Upkeep by hallMaintenancePerGrade for each grade built (DL-26)', () => {
    let { document, guild } = scene();
    const before = upkeep(guild, document.world, deps.config);

    for (const facility of ['infirmary', 'infirmary', 'quarters'] as const) {
      const result = build(document, { guildId: guild.id, facility }, deps);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      document = result.document;
    }
    guild = document.world.guilds[guild.id] as Guild;

    expect(upkeep(guild, document.world, deps.config)).toBe(before + 3 * 10);
  });
});

describe('build refuses, never throwing and changing nothing', () => {
  function refused(document: WorldDocument, guild: Guild, facility: FacilityKey): BuildRejection {
    const saved = serialise(document);
    const entries = document.history.entries.length;
    let result: ReturnType<typeof build> | undefined;
    expect(() => (result = build(document, { guildId: guild.id, facility }, deps))).not.toThrow();
    expect(serialise(document)).toBe(saved);
    expect(document.history.entries).toHaveLength(entries);
    if (result === undefined || result.ok) throw new Error('Built, where a refusal was expected');
    return result.rejection;
  }

  test('insufficient-wealth: Wealth one below the next grade’s cost, naming both', () => {
    const { document, guild } = scene('poor', 199);
    expect(refused(document, guild, 'infirmary')).toEqual({
      action: 'build',
      reason: 'insufficient-wealth',
      facility: 'infirmary',
      cost: 200,
      wealth: 199,
    });
    guild.hall.infirmary = 1;
    guild.wealth = 499;
    expect(refused(document, guild, 'infirmary')).toMatchObject({ reason: 'insufficient-wealth', cost: 500 });
  });

  test('max-grade: a facility at its top grade, or past it after content shrank, whatever the Wealth', () => {
    const { document, guild } = scene();
    guild.hall.quarters = 3;
    expect(refused(document, guild, 'quarters')).toEqual({ action: 'build', reason: 'max-grade', facility: 'quarters', grade: 3 });
    guild.hall.quarters = 5;
    expect(refused(document, guild, 'quarters')).toMatchObject({ reason: 'max-grade', grade: 5 });
  });

  test('guild-folded: a Guild that has folded builds nothing, whatever its Wealth, before any other check', () => {
    const { document, guild } = scene();
    guild.foldedOnTurn = 0;
    guild.hall.infirmary = 3;
    expect(refused(document, guild, 'infirmary')).toEqual({ action: 'build', reason: 'guild-folded', guildId: guild.id });
  });
});

describe('build throws on a programming error', () => {
  test('a Guild id the world does not hold, or a facility the Hall does not have, changing nothing', () => {
    const { document, guild } = scene();
    const saved = serialise(document);

    expect(() => build(document, { guildId: makeId('guilds', 99), facility: 'infirmary' }, deps)).toThrow(RangeError);
    expect(() => build(document, { guildId: guild.id, facility: 'stables' as FacilityKey }, deps)).toThrow(RangeError);
    expect(serialise(document)).toBe(saved);
  });
});

describe('nextImprovement', () => {
  test("is content's row for the next grade, and null at the top", () => {
    const hall = { infirmary: 0, trainingYard: 2, quarters: 3 };
    expect(nextImprovement({ hall }, 'infirmary', deps.content)).toMatchObject({ key: 'infirmary-1', grade: 1, cost: 200 });
    expect(nextImprovement({ hall }, 'trainingYard', deps.content)).toMatchObject({ grade: 3, cost: 1000 });
    expect(nextImprovement({ hall }, 'quarters', deps.content)).toBeNull();
    expect(nextImprovement({ hall }, 'infirmary', { improvements: {} })).toBeNull();
  });
});

describe('affordableImprovement', () => {
  test('is the next Improvement only while Wealth is above the multiple times its cost and covers it', () => {
    const hall = { infirmary: 1, trainingYard: 0, quarters: 3 };
    const at = (wealth: number, multiple = 3) =>
      affordableImprovement({ hall, wealth }, 'infirmary', multiple, deps.content)?.key ?? null;

    expect(at(1_500)).toBeNull();
    expect(at(1_501)).toBe('infirmary-2');
    expect(at(499, 0.5)).toBeNull(); // above half the cost, and short of it
    expect(at(500, 0.5)).toBe('infirmary-2');
    expect(affordableImprovement({ hall, wealth: 1e9 }, 'quarters', 3, deps.content)).toBeNull();
  });
});

// ── What a grade does ───────────────────────────────────────────────────────────────────────

/** Advances `document` to `turn` under `with_`, holding each Turn's document to the validator. */
function playTo(document: WorldDocument, turn: number, with_: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
  let current = document;
  const events: TurnEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, with_);
    current = withValid(result.document, with_);
    events.push(...result.events);
  }
  return { document: current, events };
}

describe('what a grade built does (M3-S6)', () => {
  test('quarters at grade 1 shift the Morale baseline by quartersMoraleBonus, and nightly drift follows it', () => {
    // The Guildmaster's Inspiration and Traits stilled (M4-S5): this test is about the quarters.
    const pinned = testDeps({ rivalCount: 0, moraleBaseline: 60, quartersMoraleBonus: 5, moraleDrift: 1, inspirationMoraleShift: 0 });
    const { document, guild } = scene('quarters', 10_000, pinned);
    (document.world.guildmasters[guild.guildmasterId] as Guildmaster).traits = [];
    const [heroId] = guild.rosterIds;
    const hero = heroId === undefined ? undefined : document.world.heroes[heroId];
    if (hero === undefined) throw new Error('No Hero');
    expect(hero.morale).toBe(60);
    expect(moraleBaselineFor(hero, document.world, pinned.config, pinned.content)).toBe(60);
    // A twin with a History of its own: documents share theirs (ADR-0008), and each is played on.
    const twin = structuredClone(document);

    const built = build(document, { guildId: guild.id, facility: 'quarters' }, pinned);
    if (!built.ok) throw new Error(`Refused: ${built.rejection.reason}`);

    expect(moraleBaselineFor(hero, built.document.world, pinned.config, pinned.content)).toBe(65);
    // Five nights of drift at 1 a night take a Hero at 60 to 65, and the sixth holds them there.
    const { document: later } = playTo(built.document, nightOf(5), pinned);
    const { document: unbuilt } = playTo(twin, nightOf(5), pinned);
    for (const id of guild.rosterIds) {
      expect(later.world.heroes[id]?.morale, id).toBe(65);
      expect(unbuilt.world.heroes[id]?.morale, id).toBe(60);
    }
  });

  test('the baseline is held inside the Morale scale, and a Hero on no Roster has no quarters', () => {
    const config = { moraleBaseline: 60, quartersMoraleBonus: 30, moraleMin: 0, moraleMax: 100, inspirationMoraleShift: 0 };
    const hall = { infirmary: 0, trainingYard: 0, quarters: 2 };
    const world = { guilds: { [makeId('guilds', 1)]: { hall, guildmasterId: makeId('guildmasters', 1) } }, guildmasters: {} } as never;

    expect(moraleBaselineFor({ guildId: makeId('guilds', 1) }, world, config, testContent)).toBe(100);
    expect(moraleBaselineFor({ guildId: null }, world, config, testContent)).toBe(60);
  });

  test('the infirmary at grade 1 halves a new Injury, by the factor it reads when the Injury is inflicted', () => {
    // Every Check fails and injures the lone Hero sent, once, and nobody dies (M4-S2); the
    // infirmary's factors pinned.
    const hurt = testDeps(
      { rivalCount: 0, infirmaryHealFactor: [1, 1 / 2, 1 / 3] },
      withEncounters({ difficultyFactor: 1000, success: [], failure: [{ kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 }] }),
    );
    /** The Days to heal of the one Injury a Party sent from `document` on its first Quest comes home with. */
    const healDays = (document: WorldDocument): number => {
      const guild = playerGuild(document.world) as Guild;
      const [questId] = document.world.board;
      const quest = questId === undefined ? undefined : document.world.quests[questId];
      if (quest === undefined) throw new Error('An empty Board');
      quest.requirements = { partySizeMin: 1, partySizeMax: 1 };
      const heroIds = partyFor(document.world, guild, quest, availableHeroes(document.world, guild), hurt);
      if (heroIds === null) throw new Error('No Party');
      const sent = dispatch(document, { guildId: guild.id, questId: quest.id, heroIds }, hurt);
      if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
      const returns = sent.document.world.parties[sent.document.world.quests[quest.id]?.partyIds[0] ?? makeId('parties', 0)]
        ?.returnsOnTurn;
      if (returns === undefined) throw new Error('No Party');
      const { events } = playTo(sent.document, returns, hurt);
      const injured = events.filter((event) => event.type === 'hero.injured');
      expect(injured).toHaveLength(1);
      const [event] = injured;
      return event?.type === 'hero.injured' ? dayOf(event.payload.healsOnTurn) - dayOf(returns) : Number.NaN;
    };
    const { document } = scene('infirmary', 10_000, hurt);
    const built = build(document, { guildId: (playerGuild(document.world) as Guild).id, facility: 'infirmary' }, hurt);
    if (!built.ok) throw new Error(`Refused: ${built.rejection.reason}`);

    // The two worlds share a seed and `build` draws nothing, so the same Injury is drawn in each.
    const without = healDays(structuredClone(document));
    const withInfirmary = healDays(built.document);

    expect(without).toBeGreaterThanOrEqual(5);
    expect(withInfirmary).toBe(Math.max(1, Math.round(without / 2)));
    expect(withInfirmary).toBeLessThan(without);
  });

  test('under the default rules, every grade content defines does more than the grade below it (DL-53)', () => {
    // The defaults on purpose, not pinned values: what is checked is that they give each grade a
    // player can pay for an effect of its own. The test content carries the core's three grades.
    const defaults = testDeps({ rivalCount: 0 });
    const { config, content } = defaults;
    const { document, guild } = scene('every-grade', 10_000, defaults);
    const [heroId] = guild.rosterIds;
    if (heroId === undefined) throw new Error('No Hero');
    /** The effect of `facility` at each grade from 0 to content's top grade. */
    const byGrade = (facility: FacilityKey, effect: (grade: number) => number): number[] => {
      const top = Math.max(...Object.values(content.improvements).filter((it) => it.facility === facility).map((it) => it.grade));
      return Array.from({ length: top + 1 }, (_, grade) => effect(grade));
    };
    const falling = (values: readonly number[]): boolean => values.every((value, index) => index === 0 || value < (values[index - 1] ?? 0));
    const rising = (values: readonly number[]): boolean => values.every((value, index) => index === 0 || value > (values[index - 1] ?? 0));
    const at = (facility: FacilityKey, grade: number): World => {
      const world = structuredClone(document.world);
      (world.guilds[guild.id] as Guild).hall[facility] = grade;
      return world;
    };

    const heal = byGrade('infirmary', (grade) => healFactor({ hall: { ...guild.hall, infirmary: grade } }, config));
    const baseline = byGrade('quarters', (grade) => moraleBaselineFor(at('quarters', grade).heroes[heroId] as Hero, at('quarters', grade), config, content));
    const trainingXp = byGrade('trainingYard', (grade) => {
      const world = at('trainingYard', grade);
      world.turn = nightOf(0);
      training(world, phaseContext(world, defaults));
      return (world.heroes[heroId] as Hero).xp;
    });

    expect([heal.length, baseline.length, trainingXp.length]).toEqual([4, 4, 4]);
    expect(heal, `infirmary ${heal.join(', ')}`).toSatisfy(falling);
    expect(baseline, `quarters ${baseline.join(', ')}`).toSatisfy(rising);
    expect(trainingXp, `training yard ${trainingXp.join(', ')}`).toSatisfy(rising);
  });

  test('the training yard at grade 1 is on the Guild row the night’s training reads (M3-S2)', () => {
    const { document, guild } = scene('yard');

    const built = build(document, { guildId: guild.id, facility: 'trainingYard' }, deps);

    if (!built.ok) throw new Error(`Refused: ${built.rejection.reason}`);
    expect(withValid(built.document, deps).world.guilds[guild.id]?.hall.trainingYard).toBe(1);
  });
});
