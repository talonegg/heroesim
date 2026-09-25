import { afterEach, describe, expect, test, vi } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Hero, HeroId, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { phases } from '../pipeline.js';
import { createStreams } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { durationDaysOf, nightOf } from '../time.js';
import { buildDocument, plannedStreams, testDeps, withValid } from '../world.test-support.js';
import { heroState, lastAnniversaryNight, retirementChance } from './hero-state.js';
import { phaseContext } from './phase.js';

// M2-S6: the night's Hero State Engine (DL-29). Documents a test inspects after `advance` are held
// to the validator; a test of one rule over many nights runs the phase alone on a world whose Turn
// it moves from night to night.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const noHarm = { fail: 0, success: 0, strong: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

/** Advances to Turn `turn`, validating every document, and returns the events of the Turns played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  let current = document;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

/** Runs the phase alone on `world` on the night of Day `day`. */
function night(world: World, day: number, deps: EngineDeps, document?: WorldDocument): EngineEvent[] {
  world.turn = nightOf(day);
  return heroState(world, phaseContext(world, deps, document?.history));
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const rosterOf = (world: World): HeroId[] => (playerGuild(world) as Guild).rosterIds;

describe('healing', () => {
  test('an Injury heals on its night and not before, with hero.healed', () => {
    // No Rivals: their Parties would come home hurt, and they are not the subject (DL-30 item 11).
    const deps = testDeps({ rivalCount: 0 });
    const start = created('heal', deps);
    const [heroId] = rosterOf(start.world) as [HeroId];
    hero(start.world, heroId).injury = { typeKey: 'bruised-ribs', healsOnTurn: nightOf(3) };

    const before = playTo(start, nightOf(3) - 1, deps);
    expect(hero(before.document.world, heroId).injury).toEqual({ typeKey: 'bruised-ribs', healsOnTurn: nightOf(3) });
    expect(ofType(before.events, 'hero.healed')).toEqual([]);

    const { document, events } = playTo(before.document, nightOf(3), deps);

    expect(hero(document.world, heroId).injury).toBeNull();
    expect(ofType(events, 'hero.healed')).toMatchObject([
      { turn: nightOf(3), participants: [heroId, (playerGuild(document.world) as Guild).id], milestone: false },
    ]);
    expect(ofType(events, 'hero.healed')[0]?.payload).toEqual({ heroId, typeKey: 'bruised-ribs', traitKey: null });
    expect(hero(document.world, heroId).traits).toEqual([]);
  });

  test('a type that leaves a Trait adds it once, however often the Hero heals of it', () => {
    const deps = testDeps();
    const { world } = created('scar', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    const scarred = deps.content.injuries['deep-cut']?.leavesTrait;
    expect(scarred).toBe('scarred');

    const traitKeys: (string | null)[] = [];
    for (const day of [1, 2]) {
      hero(world, heroId).injury = { typeKey: 'deep-cut', healsOnTurn: nightOf(day) };
      const [healed] = ofType(night(world, day, deps), 'hero.healed');
      traitKeys.push(healed === undefined ? 'not healed' : healed.payload.traitKey);
    }

    expect(traitKeys).toEqual(['scarred', null]);
    expect(hero(world, heroId).traits).toEqual(['scarred']);
  });

  test('a type content no longer defines heals on its night and leaves nothing (data-model rule 5)', () => {
    const deps = testDeps();
    const { world } = created('unknown-injury', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    hero(world, heroId).injury = { typeKey: 'frostbite', healsOnTurn: nightOf(1) };

    const events = night(world, 1, deps);

    expect(ofType(events, 'hero.healed')[0]?.payload).toEqual({ heroId, typeKey: 'frostbite', traitKey: null });
    expect(hero(world, heroId)).toMatchObject({ injury: null, traits: [] });
  });
});

describe('Morale drift', () => {
  test('converges on the baseline over nights from either side, never passing it', () => {
    const deps = testDeps({ moraleDrift: 3 });
    const { world } = created('converge', deps);
    const baseline = deps.config.moraleBaseline;
    const starts = [100, 71, 61, 59, 50.5, 0];
    const ids = rosterOf(world);

    for (const [index, start] of starts.entries()) {
      const heroId = ids[index % ids.length] as HeroId;
      hero(world, heroId).morale = start;
      const seen = [start];
      for (let day = 1; day <= 40; day += 1) {
        night(world, index * 100 + day, deps);
        seen.push(hero(world, heroId).morale);
      }
      const side = Math.sign(start - baseline);
      for (let i = 1; i < seen.length; i += 1) {
        const [was, now] = [seen[i - 1] as number, seen[i] as number];
        // Each night closer by the drift, or onto the baseline, and never across it.
        expect(Math.abs(now - baseline)).toBe(Math.max(0, Math.abs(was - baseline) - 3));
        expect(Math.sign(now - baseline) === side || now === baseline).toBe(true);
      }
      expect(seen.at(-1)).toBe(baseline);
    }
  });

  test('a year of drift that crosses no band appends nothing; one crossing appends exactly one hero.morale-changed', () => {
    // Only the Hero State Engine runs, so every entry the year appends is its own.
    for (const phase of phases) if (phase.name !== 'heroState') vi.spyOn(phase, 'run').mockReturnValue([]);
    const deps = testDeps();
    expect(deps.config.moraleBands).toEqual({ wretched: 0, low: 20, steady: 40, high: 75, elated: 90 });
    const start = created('drift-year', deps);
    const [quiet, falling, rising] = rosterOf(start.world) as [HeroId, HeroId, HeroId];

    // Steady to steady: 70 drifts to 60 without leaving the band.
    hero(start.world, quiet).morale = 70;
    const calm = playTo(start, deps.config.turnsPerYear, deps);
    expect(calm.events).toEqual([]);
    expect(hero(calm.document.world, quiet).morale).toBe(60);

    // High to steady, and low to steady: one crossing each, on the night it happens.
    hero(calm.document.world, falling).morale = 80;
    hero(calm.document.world, rising).morale = 35;
    const from = calm.document.world.turn;
    const { document, events } = playTo(calm.document, from + deps.config.turnsPerYear, deps);

    const crossings = ofType(events, 'hero.morale-changed');
    expect(events).toHaveLength(2);
    expect(crossings.map(({ payload }) => [payload.heroId, payload.cause, payload.bandBefore, payload.bandAfter])).toEqual([
      [rising, 'drift', 'low', 'steady'],
      [falling, 'drift', 'high', 'steady'],
    ]);
    expect(crossings.map(({ payload }) => [payload.before, payload.after])).toEqual([
      [39, 40],
      [75, 74],
    ]);
    expect(document.history.byType['hero.morale-changed']).toHaveLength(2);
  });
});

describe('Retirement', () => {
  const certain = { heroRetirementChancePerYear: 1 };

  test('is checked on the night of each anniversary of entering the world', () => {
    const config = { turnsPerYear: 1080 };
    // Entered on the morning of Day 0: first anniversary on Day 360, whose night is Turn 1082.
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 1081, config)).toBeNull();
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 1082, config)).toBe(1082);
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 2161, config)).toBe(1082);
    expect(lastAnniversaryNight({ enteredTurn: 0 }, 2162, config)).toBe(2162);
    // Entered at night, as a pool Hero does: the anniversary is that same night a year on.
    expect(lastAnniversaryNight({ enteredTurn: 50 }, 1130, config)).toBe(1130);
    expect(lastAnniversaryNight({ enteredTurn: 50 }, 1129, config)).toBeNull();
  });

  test('has a chance of heroRetirementChancePerYear for each year past heroRetirementAge, none at or below it, doubled while injured', () => {
    const { config } = testDeps();
    const fit = { injury: null };
    const injured = { injury: { typeKey: 'broken-arm', healsOnTurn: 99 } };

    expect([config.heroRetirementAge, config.heroRetirementChancePerYear, config.heroRetirementInjuredMultiplier]).toEqual([45, 0.02, 2]);
    expect([18, 44, 45, 46, 50].map((age) => retirementChance(fit, age, config))).toEqual([0, 0, 0, 0.02, 0.1]);
    expect(retirementChance(injured, 46, config)).toBe(0.04);
    expect(retirementChance(injured, 200, config)).toBe(1);
  });

  test('never fires below heroRetirementAge, even at a chance of 1 a year past it', () => {
    const deps = testDeps({ ...certain, turnsPerYear: 30 });
    const { world } = created('young', deps);
    const ids = Object.values(world.guilds).flatMap((guild) => guild.rosterIds);
    for (const heroId of ids) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 30 });

    // Anniversaries on the nights of Days 10, 20, …: ages 31 to 45 retire no one.
    for (let year = 1; year <= 15; year += 1) {
      expect(ofType(night(world, 10 * year, deps), 'hero.retired'), `age ${30 + year}`).toEqual([]);
    }
    // At 46, one year past it, every Hero goes.
    expect(ofType(night(world, 160, deps), 'hero.retired').map((event) => event.payload.age)).toEqual(ids.map(() => 46));
  });

  test('over 10,000 Hero-years past the age, retires at the configured chance within 20%', () => {
    const deps = testDeps();
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 100 });
    const base = document.world;
    const home = Object.values(base.guilds).flatMap((guild) => guild.rosterIds).filter((id) => id !== ids.partyHero);
    const rate = (fields: Partial<Hero>): number => {
      let checks = 0;
      let retired = 0;
      let stream = structuredClone(base.rng.heroes);
      while (checks < 10_000) {
        const world = structuredClone(base);
        world.rng.heroes = stream;
        // Entered on Turn 0 at 45: tonight, Day 360, is their first anniversary, at 46.
        for (const heroId of home) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 45, ...fields });
        retired += ofType(night(world, 360, deps), 'hero.retired').length;
        checks += home.length;
        stream = world.rng.heroes;
      }
      return retired / checks;
    };
    const chance = deps.config.heroRetirementChancePerYear;

    expect(Math.abs(rate({}) - chance)).toBeLessThan(0.2 * chance);
    expect(Math.abs(rate({ ageAtEntry: 49 }) - 5 * chance)).toBeLessThan(0.2 * 5 * chance);
    const injured = rate({ injury: { typeKey: 'broken-arm', healsOnTurn: nightOf(400) } });
    expect(Math.abs(injured - 2 * chance)).toBeLessThan(0.2 * 2 * chance);
  });

  test('takes the Hero off the Roster, keeping their row, Guild and retiredOnTurn, with the hero.retired Milestone', () => {
    const deps = testDeps({ ...certain, turnsPerYear: 30, rivalCount: 0 });
    const start = created('retire', deps);
    const guild = playerGuild(start.world) as Guild;
    const [heroId] = guild.rosterIds as [HeroId];
    Object.assign(hero(start.world, heroId), { enteredTurn: 0, ageAtEntry: 60 });

    const { document, events } = playTo(start, nightOf(10), deps);

    const [retired] = ofType(events, 'hero.retired');
    expect(retired).toMatchObject({
      turn: nightOf(10),
      participants: [heroId, guild.id],
      milestone: true,
      payload: { heroId, guildId: guild.id, age: 61 },
    });
    expect(hero(document.world, heroId)).toMatchObject({ retiredOnTurn: nightOf(10), guildId: guild.id, partyId: null });
    expect(rosterOf(document.world)).not.toContain(heroId);
    expect(document.history.milestones).toContain(document.history.entries.indexOf(retired as EngineEvent));
  });

  test('checks a Hero away on the anniversary on the night their Party brings them home', () => {
    // No Rivals: they would take the Board's Quests and send Parties of their own (DL-30 item 11).
    const deps = testDeps({ ...certain, turnsPerYear: 30, rivalCount: 0, stubInjuryChance: noHarm, stubDeathChance: noHarm });
    const start = created('away', deps);
    const ids = rosterOf(start.world);
    for (const heroId of ids) Object.assign(hero(start.world, heroId), { enteredTurn: 0, ageAtEntry: 60 });
    // Sent on the first morning a Quest on the Board keeps them away over the night of Day 10.
    let morning = start;
    let quest: Quest | undefined;
    let day = 0;
    while (quest === undefined && day < 10) {
      day += 1;
      morning = playTo(morning, 3 * day, deps).document;
      const today = day;
      quest = morning.world.board
        .map((id) => morning.world.quests[id] as Quest)
        .find(({ requirements: { classKey, skillKey, partySizeMin, partySizeMax }, durationTurns }) =>
          classKey === undefined && skillKey === undefined && partySizeMin <= 2 && partySizeMax >= 2 &&
          today + durationDaysOf({ durationTurns }) > 10,
        );
    }
    if (quest === undefined) throw new Error('No Quest to send them on');
    const away = ids.slice(0, 2);
    const sent = dispatch(morning, { guildId: (playerGuild(morning.world) as Guild).id, questId: quest.id, heroIds: away }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const returnsOnTurn = nightOf(day + durationDaysOf(quest));

    const anniversary = playTo(withValid(sent.document, deps), nightOf(10), deps);
    const retiredThen = ofType(anniversary.events, 'hero.retired').map((event) => event.payload.heroId);
    expect(retiredThen).toEqual(ids.slice(2));
    for (const heroId of away) expect(hero(anniversary.document.world, heroId).retiredOnTurn).toBeNull();

    const home = playTo(anniversary.document, returnsOnTurn, deps);
    const retiredLater = ofType(home.events, 'hero.retired');
    expect(retiredLater.map((event) => [event.turn, event.payload.heroId])).toEqual(away.map((heroId) => [returnsOnTurn, heroId]));
    expect(ofType(home.events, 'quest.resolved')).toHaveLength(1);
  });
});

describe('which Heroes it covers', () => {
  test('leaves the Unattached pool, the dead, the retired and a folded Guild alone', () => {
    const deps = testDeps({ heroRetirementChancePerYear: 1 });
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 2, unattached: 1 });
    const { world } = document;
    const player = world.guilds[ids.playerGuild] as Guild;
    const retired = hero(world, ids.idleHero as HeroId);
    retired.retiredOnTurn = 30;
    player.rosterIds = player.rosterIds.filter((id) => id !== retired.id);
    (world.guilds[ids.rivalGuild] as Guild).foldedOnTurn = 0;
    const untouched = [ids.unattachedHero as HeroId, ids.deadHero, retired.id, ids.rivalHero].map((id) => hero(world, id));
    for (const it of untouched) Object.assign(it, { morale: 90, ageAtEntry: 70, injury: { typeKey: 'deep-cut', healsOnTurn: 0 } });
    const before = structuredClone(untouched);

    const events = night(world, 360, deps);

    expect(untouched).toEqual(before);
    const named = new Set(events.flatMap((event) => event.participants));
    for (const it of untouched) expect(named.has(it.id), it.id).toBe(false);
  });

  test('advances the heroes stream and no other', () => {
    const deps = testDeps();
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 20 });
    const { world } = document;
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    for (const heroId of (world.guilds[ids.playerGuild] as Guild).rosterIds) {
      Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 50, morale: 80, injury: { typeKey: 'deep-cut', healsOnTurn: 0 } });
    }
    const before = structuredClone(world.rng) as Record<string, unknown>;

    const events = night(world, 360, deps);

    expect(ofType(events, 'hero.healed').length).toBeGreaterThan(0);
    const after = world.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'heroes') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });
});
