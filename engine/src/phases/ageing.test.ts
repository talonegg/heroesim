import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import type { ContentSet, StatArea } from '../content-types.js';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type HeroId, type History, type World, type WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType, TurnEvent } from '../events.js';
import { append, createHistory } from '../history.js';
import { createStreams, next } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { nightOf } from '../time.js';
import { buildDocument, heroStatKeys, plannedStreams, testContent, testDeps, withValid } from '../world.test-support.js';
import { ageing } from './ageing.js';
import { phaseContext } from './phase.js';

// M3-S4: the yearly ageing decline (INPUTS 5.5, DL-37). A test of the rule over many nights runs the
// phase alone on a world whose Turn it moves from night to night; the tests of what it does beside
// the Retirement check play the whole pipeline and hold every document to the validator.
//
// The rules are pinned: ten Days a year, so an anniversary is the night of every tenth Day for a
// Hero who entered on Turn 0, and INPUTS 5.5's decline, not whatever the defaults become.

const rules = {
  turnsPerYear: 30,
  declineAge: 40,
  declinePerYear: 1,
  declineAreas: ['physical'],
} satisfies Partial<GameConfig>;

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

function created(seed: string, deps: EngineDeps): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

/** Runs the phase alone on `world` on the night of Day `day`, reading `history` if given. */
function night(world: World, day: number, deps: EngineDeps, history?: History): TurnEvent[] {
  world.turn = nightOf(day);
  return ageing(world, phaseContext(world, deps, history));
}

/** Advances to Turn `turn`, validating every document, and returns the events of the Turns played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
  let current = document;
  const events: TurnEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const rosterOf = (world: World): HeroId[] => (playerGuild(world) as Guild).rosterIds;

const areaOf = (statKey: string): StatArea | undefined => testContent.stats[statKey]?.area;
const statsIn = (...areas: StatArea[]): string[] => heroStatKeys.filter((key) => areas.includes(areaOf(key) as StatArea));

/** The keys whose value differs between two sets of Stats. */
const changedKeys = (before: Record<string, number>, after: Record<string, number>): string[] =>
  heroStatKeys.filter((key) => before[key] !== after[key]);

describe('the decline', () => {
  test('never falls before declineAge, and from it takes exactly one Stat a year, on the anniversary night', () => {
    const deps = testDeps({ ...rules, rivalCount: 0 });
    const { world } = created('decline', deps);
    const ids = rosterOf(world);
    for (const heroId of ids) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 35 });
    let declines = 0;

    // Anniversaries on the nights of Days 10 to 100: ages 36 to 39, then 40 to 45.
    for (let day = 1; day <= 100; day += 1) {
      const before = ids.map((heroId) => structuredClone(hero(world, heroId).stats));
      const events = night(world, day, deps);
      const age = 35 + Math.floor(day / 10);

      if (day % 10 !== 0 || age < 40) {
        expect(events, `Day ${day}, age ${age}`).toEqual([]);
        ids.forEach((heroId, index) => expect(hero(world, heroId).stats).toEqual(before[index]));
        continue;
      }
      const declined = ofType(events, 'hero.declined');
      expect(declined).toHaveLength(events.length);
      expect(declined.map((event) => event.payload.heroId)).toEqual(ids);
      ids.forEach((heroId, index) => {
        const { payload } = declined[index] as EngineEventOf<'hero.declined'>;
        const was = before[index] as Record<string, number>;
        expect(changedKeys(was, hero(world, heroId).stats)).toEqual([payload.statKey]);
        expect(payload).toEqual({ heroId, statKey: payload.statKey, delta: -1, age });
        expect(hero(world, heroId).stats[payload.statKey]).toBe((was[payload.statKey] ?? 0) - 1);
      });
      declines += declined.length;
    }

    expect(declines).toBe(6 * ids.length);
  });

  test('draws only from the Stats in declineAreas, and reaches every one of them', () => {
    for (const areas of [['physical'], ['magical', 'social']] satisfies StatArea[][]) {
      const deps = testDeps({ ...rules, declineAreas: areas });
      const { document } = buildDocument({ rivals: 1, rosterSize: 50 });
      const { world } = document;
      const heroIds = Object.values(world.guilds).flatMap((guild) => guild.rosterIds);
      for (const heroId of heroIds) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 45 });
      const before = structuredClone(world.heroes);
      const drawn = new Set<string>();

      for (let year = 1; year <= 10; year += 1) {
        for (const event of ofType(night(world, 10 * year, deps), 'hero.declined')) drawn.add(event.payload.statKey);
      }

      expect([...drawn].sort()).toEqual(statsIn(...areas).sort());
      for (const heroId of heroIds) {
        for (const key of changedKeys(before[heroId]?.stats ?? {}, hero(world, heroId).stats)) {
          expect(areas, `${heroId} ${key}`).toContain(areaOf(key));
        }
      }
    }
  });

  test("never takes a Stat below its content minimum, and leaves a Hero with none above it alone", () => {
    const deps = testDeps({ ...rules, declinePerYear: 3, rivalCount: 0 });
    const { world } = created('floor', deps);
    const [heroId] = rosterOf(world) as [HeroId];
    const it = hero(world, heroId);
    Object.assign(it, { enteredTurn: 0, ageAtEntry: 49 });
    for (const key of statsIn('physical')) it.stats[key] = testContent.stats[key]?.min ?? 1;
    it.stats.dexterity = 2;

    const first = ofType(night(world, 10, deps), 'hero.declined').filter((event) => event.payload.heroId === heroId);
    expect(first.map((event) => event.payload)).toEqual([{ heroId, statKey: 'dexterity', delta: -1, age: 50 }]);
    expect(it.stats.dexterity).toBe(1);
    const floor = structuredClone(it.stats);

    const second = night(world, 20, deps).filter((event) => event.participants.includes(heroId));
    expect(second).toEqual([]);
    expect(it.stats).toEqual(floor);
  });

  test('takes declinePerYear from a Stat with room to fall, and nothing at all at 0', () => {
    for (const declinePerYear of [3, 0]) {
      const deps = testDeps({ ...rules, declinePerYear, rivalCount: 0 });
      const { world } = created(`per-year-${declinePerYear}`, deps);
      const ids = rosterOf(world);
      // At 50 on the night of Day 10, every Physical Stat at 15: far above the minimum of 1.
      for (const heroId of ids) {
        Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 49 });
        for (const key of statsIn('physical')) hero(world, heroId).stats[key] = 15;
      }
      const before = ids.map((heroId) => structuredClone(hero(world, heroId).stats));

      const events = night(world, 10, deps);

      if (declinePerYear === 0) {
        expect(events).toEqual([]);
        ids.forEach((heroId, index) => expect(hero(world, heroId).stats).toEqual(before[index]));
        continue;
      }
      const declined = ofType(events, 'hero.declined');
      expect(declined.map((event) => event.payload.heroId)).toEqual(ids);
      ids.forEach((heroId, index) => {
        const { payload } = declined[index] as EngineEventOf<'hero.declined'>;
        expect(payload).toEqual({ heroId, statKey: payload.statKey, delta: -3, age: 50 });
        expect(changedKeys(before[index] as Record<string, number>, hero(world, heroId).stats)).toEqual([payload.statKey]);
        expect(hero(world, heroId).stats[payload.statKey]).toBe(12);
      });
    }
  });

  test('holds off until a declineAge other than the default: none from 45 to 49 when it is 50, then one a year', () => {
    const deps = testDeps({ ...rules, declineAge: 50, rivalCount: 0 });
    const { world } = created('late-decline', deps);
    const ids = rosterOf(world);
    for (const heroId of ids) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 44 });

    // Anniversaries on the nights of Days 10 to 70: ages 45 to 51.
    for (let year = 1; year <= 7; year += 1) {
      const age = 44 + year;
      const declined = ofType(night(world, 10 * year, deps), 'hero.declined');
      expect(
        declined.map((event) => [event.payload.heroId, event.payload.age]),
        `age ${age}`,
      ).toEqual(age < 50 ? [] : ids.map((heroId) => [heroId, age]));
    }
  });

  test('leaves Potential untouched', () => {
    const deps = testDeps({ ...rules, rivalCount: 0 });
    const { world } = created('potential', deps);
    const ids = rosterOf(world);
    for (const heroId of ids) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 50 });
    const potential = ids.map((heroId) => structuredClone(hero(world, heroId).potential));

    for (let year = 1; year <= 5; year += 1) expect(ofType(night(world, 10 * year, deps), 'hero.declined')).toHaveLength(ids.length);

    expect(ids.map((heroId) => hero(world, heroId).potential)).toEqual(potential);
  });
});

describe('beside the Retirement check', () => {
  test('a Hero who retires on the night does not decline; one who stays does, after the Retirements', () => {
    const deps = testDeps({ ...rules, rivalCount: 0, heroRetirementAge: 45, heroRetirementChancePerYear: 1 });
    const start = created('retire-first', deps);
    const guild = playerGuild(start.world) as Guild;
    const [leaving, staying] = guild.rosterIds as [HeroId, HeroId];
    // At the first anniversary, the night of Day 10: 46, certain to retire; and 40, too young to.
    Object.assign(hero(start.world, leaving), { enteredTurn: 0, ageAtEntry: 45 });
    Object.assign(hero(start.world, staying), { enteredTurn: 0, ageAtEntry: 39 });
    const leavingStats = structuredClone(hero(start.world, leaving).stats);

    const { document, events } = playTo(start, nightOf(10), deps);

    const declined = ofType(events, 'hero.declined');
    expect(declined).toHaveLength(1);
    expect(declined[0]).toMatchObject({
      turn: nightOf(10),
      participants: [staying, guild.id],
      milestone: false,
      payload: { heroId: staying, delta: -1, age: 40 },
    });
    expect(ofType(events, 'hero.retired').map((event) => event.payload.heroId)).toEqual([leaving]);
    expect(events.indexOf(ofType(events, 'hero.retired')[0] as EngineEvent)).toBeLessThan(events.indexOf(declined[0] as EngineEvent));
    expect(hero(document.world, leaving).stats).toEqual(leavingStats);
    expect(document.history.byType['hero.declined']).toHaveLength(1);
  });

  test('checks a Hero away on the anniversary on the night their Party brings them home', () => {
    const deps = testDeps({ ...rules, rivalCount: 0 });
    const { world } = created('away', deps);
    const guild = playerGuild(world) as Guild;
    const [away, home] = guild.rosterIds as [HeroId, HeroId];
    for (const heroId of [away, home]) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 49 });
    // Sent on the morning of Day 8, home on the night of Day 12: away over the anniversary on Day 10.
    const partyId = makeId('parties', 99);
    const history = createHistory();
    append(history, {
      turn: 3 * 8,
      type: 'quest.taken',
      participants: [away],
      labels: {},
      milestone: false,
      payload: { questId: makeId('quests', 99), partyId, guildId: guild.id, heroIds: [away], returnsOnTurn: nightOf(12) },
    });
    hero(world, away).partyId = partyId;

    const anniversary = ofType(night(world, 10, deps, history), 'hero.declined').map((event) => event.payload.heroId);
    hero(world, away).partyId = null;
    const between = ofType(night(world, 11, deps, history), 'hero.declined');
    const returned = ofType(night(world, 12, deps, history), 'hero.declined').map((event) => event.payload.heroId);

    expect(anniversary).not.toContain(away);
    expect(anniversary).toContain(home);
    expect(between).toEqual([]);
    expect(returned).toEqual([away]);
  });

  test('does not check again a Hero sent out on the anniversary night itself, on the night their Party brings them home', () => {
    // An action may be taken in any Turn (pre-M0 review D2), the night's included. A Party that
    // leaves on an anniversary night leaves after that night's check (DL-29 item 14), so the Hero
    // declined that night and their homecoming is no second check that year.
    const deps = testDeps({ ...rules, rivalCount: 0 });
    const { world } = created('left-on-the-night', deps);
    const guild = playerGuild(world) as Guild;
    const [sent] = guild.rosterIds as [HeroId];
    Object.assign(hero(world, sent), { enteredTurn: 0, ageAtEntry: 49 });
    const history = createHistory();

    const anniversary = ofType(night(world, 10, deps, history), 'hero.declined').map((event) => event.payload.heroId);
    // Sent during the night of Day 10, after the night's phases; home on the night of Day 12.
    const partyId = makeId('parties', 99);
    append(history, {
      turn: nightOf(10),
      type: 'quest.taken',
      participants: [sent],
      labels: {},
      milestone: false,
      payload: { questId: makeId('quests', 99), partyId, guildId: guild.id, heroIds: [sent], returnsOnTurn: nightOf(12) },
    });
    hero(world, sent).partyId = partyId;
    const between = night(world, 11, deps, history);
    hero(world, sent).partyId = null;
    const stats = structuredClone(hero(world, sent).stats);
    const stream = structuredClone(world.rng.heroes);
    const returned = night(world, 12, deps, history);

    expect(anniversary).toContain(sent);
    expect(between).toEqual([]);
    expect(returned).toEqual([]);
    expect(hero(world, sent).stats).toEqual(stats);
    expect(world.rng.heroes).toEqual(stream);
  });
});

describe('what it covers and draws', () => {
  test('leaves the Unattached pool, the dead, the retired and a folded Guild alone', () => {
    const deps = testDeps(rules);
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 2, unattached: 1 });
    const { world } = document;
    const player = world.guilds[ids.playerGuild] as Guild;
    const retired = hero(world, ids.idleHero as HeroId);
    retired.retiredOnTurn = 30;
    player.rosterIds = player.rosterIds.filter((id) => id !== retired.id);
    (world.guilds[ids.rivalGuild] as Guild).foldedOnTurn = 0;
    const untouched = [ids.unattachedHero as HeroId, ids.deadHero, retired.id, ids.rivalHero].map((id) => hero(world, id));
    for (const it of untouched) Object.assign(it, { enteredTurn: 0, ageAtEntry: 60 });
    const before = structuredClone(untouched);

    const events = night(world, 10, deps);

    expect(untouched).toEqual(before);
    const named = new Set(events.flatMap((event) => event.participants));
    for (const it of untouched) expect(named.has(it.id), it.id).toBe(false);
  });

  test('takes one heroes draw for each due check, whatever the age, none on other nights, and moves no other stream', () => {
    const deps = testDeps(rules);
    const { document, ids } = buildDocument({ rivals: 1, rosterSize: 5 });
    const { world } = document;
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    // Every Hero on a Roster is due on the night of Day 10 but the Party's, who is away.
    const due = Object.values(world.guilds).flatMap((guild) => guild.rosterIds).filter((id) => id !== ids.partyHero);
    const drawsFor = (count: number, state: World['rng']['heroes']): World['rng']['heroes'] => {
      const copy = structuredClone(state);
      for (let i = 0; i < count; i += 1) next(copy);
      return copy;
    };

    for (const ageAtEntry of [20, 50]) {
      for (const heroId of due) Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry });
      const before = structuredClone(world.rng) as Record<string, World['rng']['heroes']>;

      expect(night(world, 9, deps)).toEqual([]);
      expect(world.rng).toEqual(before);

      const events = night(world, 10, deps);

      // At 21 no one declines; at 51 everyone does.
      expect(events).toHaveLength(ageAtEntry === 20 ? 0 : due.length);
      const after = world.rng as Record<string, unknown>;
      for (const name of plannedStreams) {
        if (name === 'heroes') expect(after[name], name).toEqual(drawsFor(due.length, before.heroes as World['rng']['heroes']));
        else expect(after[name], name).toEqual(before[name]);
      }
    }
  });

  test('picks the declining Stat in key order, whatever order content lists its Stats in (DL-19 item 3)', () => {
    const declines = (content: ContentSet): string[] => {
      const deps: EngineDeps = { ...testDeps(rules), content };
      const { world } = buildDocument({ rivals: 1, rosterSize: 10 }).document;
      for (const heroId of Object.values(world.guilds).flatMap((guild) => guild.rosterIds)) {
        Object.assign(hero(world, heroId), { enteredTurn: 0, ageAtEntry: 45 });
      }
      const drawn: string[] = [];
      for (let year = 1; year <= 10; year += 1) {
        for (const { payload } of ofType(night(world, 10 * year, deps), 'hero.declined')) drawn.push(`${payload.heroId} ${payload.statKey}`);
      }
      return drawn;
    };
    const reversed: ContentSet = { ...testContent, stats: Object.fromEntries(Object.entries(testContent.stats).reverse()) };

    const asListed = declines(testContent);

    expect(asListed.length).toBeGreaterThan(100);
    expect(declines(reversed)).toEqual(asListed);
  });

  test('defaults to INPUTS 5.5: from 40, one point a year, from the Physical Stats', () => {
    const { config } = testDeps();

    expect([config.declineAge, config.declinePerYear, config.declineAreas]).toEqual([40, 1, ['physical']]);
    expect(Object.isFrozen(config.declineAreas)).toBe(true);
  });
});
