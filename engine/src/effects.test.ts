import { describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { createWorld } from './create.js';
import type { Guild, GuildId, Hero, HeroId, PatronId, WorldDocument } from './document.js';
import type { EffectResult } from './effects.js';
import { isEngineEvent, type EngineEvent, type EngineEventOf, type EngineEventType, type TurnEvent } from './events.js';
import { healDays } from './injuries.js';
import type { Module, ModuleContext, ReadonlyWorld } from './modules.js';
import { regardBand } from './regard.js';
import { streamNames } from './rng.js';
import { healFactor } from './selectors.js';
import { serialise } from './serialise.js';
import { dayOf, nightOf } from './time.js';
import { buildDocument, testDeps, withValid, type FixtureIds } from './world.test-support.js';

// M8-S2: the effects API (ADR-0005 as amended 2026-09-25, DL-77), the only way a module changes a
// core table. Each effect runs the core's own rule and emits the core's own event, naming the module.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

type Apply = (world: ReadonlyWorld, ctx: ModuleContext) => EffectResult[];

/**
 * A module `fx`, with a stream of its own, that applies `apply`'s effects at `hook` and returns every
 * event they made; what they returned is kept in `results`.
 */
function effectModule(apply: Apply, results: EffectResult[], hook: 'onAfternoon' | 'onNight' = 'onAfternoon'): Module {
  return {
    id: 'fx',
    streamName: 'fx',
    createSlice: () => ({}),
    validateSlice: () => [],
    [hook]: (world: ReadonlyWorld, _slice: unknown, ctx: ModuleContext) => {
      const applied = apply(world, ctx);
      results.push(...applied);
      return { events: applied.flatMap((result) => (result.ok ? result.events : [])) };
    },
  };
}

interface Played {
  before: WorldDocument;
  after: WorldDocument;
  events: TurnEvent[];
  results: EffectResult[];
  deps: EngineDeps;
}

/**
 * Turn 1, the first afternoon, of a new world of `seed` in which the module applies `apply`'s
 * effects at its afternoon hook; the document after it validated.
 */
function onFirstAfternoon(seed: string, apply: Apply, prepare: (document: WorldDocument) => void = () => {}): Played {
  const results: EffectResult[] = [];
  const deps: EngineDeps = { ...testDeps(), modules: [effectModule(apply, results)] };
  const created = createWorld(seed, setup, deps).document;
  prepare(created);
  const before = withValid(created, deps);
  const snapshot = structuredClone(before);
  const turn = advance(before, deps);
  return { before: snapshot, after: withValid(turn.document, deps), events: turn.events, results, deps };
}

/**
 * The night after a built document's Turn (fixtureTurn, an afternoon), the module applying `apply`'s
 * effects; `prepare` may change the built document first.
 */
function onBuiltNight(apply: Apply, prepare: (document: WorldDocument, ids: FixtureIds) => void = () => {}): Played & { ids: FixtureIds } {
  const results: EffectResult[] = [];
  const deps: EngineDeps = { ...testDeps(), modules: [effectModule(apply, results, 'onNight')] };
  const { document, ids } = buildDocument();
  prepare(document, ids);
  const before = structuredClone(document);
  const turn = advance(document, deps);
  return { before, after: turn.document, events: turn.events, results, deps, ids };
}

const ofType = <Type extends EngineEventType>(events: readonly TurnEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

/** A Hero on the Roster of the first Guild in id order, in no Party. */
function rosterHero(world: ReadonlyWorld): HeroId {
  const hero = Object.values(world.heroes).find((row) => row.guildId !== null && row.partyId === null);
  if (hero === undefined) throw new Error('no Hero on a Roster');
  return hero.id;
}

/** `results`' one outcome. */
function only(results: readonly EffectResult[]): EffectResult {
  expect(results).toHaveLength(1);
  return results[0] as EffectResult;
}

/** What `work` threw; it must throw. */
function thrownBy(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('it did not throw');
}

/** A new world of `seed` whose Turn 1 applies `apply`: expected to fail naming the module. */
function failsNamingFx(seed: string, apply: Apply): void {
  const deps: EngineDeps = { ...testDeps(), modules: [effectModule(apply, [])] };
  const document = createWorld(seed, setup, deps).document;
  const before = serialise(document);
  expect(thrownBy(() => advance(document, deps))).toMatchObject({ name: 'ModuleError', moduleId: 'fx' });
  expect(serialise(document)).toBe(before);
}

// ── adjustMorale ─────────────────────────────────────────────────────────────────────────────

describe('adjustMorale', () => {
  test("moves a Hero's Morale by the core's rule and always emits hero.morale-changed, cause module, naming the module", () => {
    let heroId = '' as HeroId;
    const { before, after, events, results } = onFirstAfternoon('morale', (world, ctx) => {
      heroId = rosterHero(world);
      return [ctx.effects.adjustMorale({ heroId, delta: -7 }), ctx.effects.adjustMorale({ heroId, delta: 0 })];
    });

    const was = before.world.heroes[heroId]?.morale as number;
    expect(after.world.heroes[heroId]?.morale).toBe(was - 7);
    const changed = ofType(events, 'hero.morale-changed').filter((event) => event.payload.cause === 'module');
    expect(changed.map((event) => event.payload)).toEqual([
      expect.objectContaining({ heroId, cause: 'module', before: was, after: was - 7, moduleId: 'fx' }),
      expect.objectContaining({ heroId, cause: 'module', before: was - 7, after: was - 7, moduleId: 'fx' }),
    ]);
    expect(results.map((result) => result.ok && result.effect)).toEqual([
      { kind: 'adjustMorale', heroId, delta: -7 },
      { kind: 'adjustMorale', heroId, delta: 0 },
    ]);
    expect(after.history.entries).toEqual(expect.arrayContaining(changed));
  });

  test('holds Morale inside moraleMin to moraleMax, as every change is held', () => {
    let heroId = '' as HeroId;
    const { after, deps } = onFirstAfternoon('morale-held', (world, ctx) => {
      heroId = rosterHero(world);
      return [ctx.effects.adjustMorale({ heroId, delta: 1_000 })];
    });

    expect(after.world.heroes[heroId]?.morale).toBe(deps.config.moraleMax);
  });

  test('refuses a Hero out of play, changing nothing', () => {
    const { deadHero } = buildDocument().ids;
    const { results, before, after, ids } = onBuiltNight((_world, ctx) => [ctx.effects.adjustMorale({ heroId: deadHero, delta: 5 })]);

    expect(only(results)).toEqual({ ok: false, rejection: { effect: 'adjustMorale', reason: 'hero-gone' } });
    expect(after.world.heroes[ids.deadHero]?.morale).toBe(before.world.heroes[ids.deadHero]?.morale);
  });

  // Out of play is dead, retired, or gone from the pool with the row kept (DL-27): each is refused.
  test.each<[string, (hero: Hero) => void]>([
    ['retired', (hero) => Object.assign(hero, { diedOnTurn: null, retiredOnTurn: 30 })],
    ['gone from the pool', (hero) => Object.assign(hero, { guildId: null, unattachedSince: null, leftPoolOnTurn: 30 })],
  ])('refuses a Hero %s as it refuses a dead one, in each effect that reads a Hero, changing nothing', (_what, gone) => {
    const { deadHero, partyHero } = buildDocument().ids;
    const { results, before, after } = onBuiltNight(
      (_world, ctx) => [
        ctx.effects.adjustMorale({ heroId: deadHero, delta: 5 }),
        ctx.effects.adjustRegard({ holderId: deadHero, entityId: partyHero, delta: 10 }),
        ctx.effects.injure({ heroId: deadHero, typeKey: 'deep-cut', days: 6 }),
      ],
      (document) => gone(document.world.heroes[deadHero] as Hero),
    );

    expect(results).toEqual([
      { ok: false, rejection: { effect: 'adjustMorale', reason: 'hero-gone' } },
      { ok: false, rejection: { effect: 'adjustRegard', reason: 'holder-gone' } },
      { ok: false, rejection: { effect: 'injure', reason: 'hero-gone' } },
    ]);
    expect(after.world.heroes[deadHero]).toEqual(before.world.heroes[deadHero]);
  });

  test.each([
    ['a fractional delta', { delta: 0.5 }],
    ['a Hero the world lacks', { heroId: 'hero-999999' as HeroId }],
  ])('throws on %s: a programming error, naming the module', (_what, fields) => {
    failsNamingFx('morale-bad', (world, ctx) => [ctx.effects.adjustMorale({ heroId: rosterHero(world), delta: 1, ...fields })]);
  });
});

// ── adjustWealth ─────────────────────────────────────────────────────────────────────────────

describe('adjustWealth', () => {
  test("moves a Guild's Wealth, below 0 if need be, and emits guild.wealth-changed naming the module", () => {
    let guildId = '' as GuildId;
    const { before, after, events } = onFirstAfternoon('wealth', (world, ctx) => {
      guildId = Object.keys(world.guilds)[0] as GuildId;
      const wealth = world.guilds[guildId]?.wealth as number;
      return [ctx.effects.adjustWealth({ guildId, delta: 250 }), ctx.effects.adjustWealth({ guildId, delta: -(wealth + 250) - 10 })];
    });

    const was = before.world.guilds[guildId]?.wealth as number;
    // The first afternoon charges no Upkeep, so only the effects moved it.
    expect(after.world.guilds[guildId]?.wealth).toBe(-10);
    expect(ofType(events, 'guild.wealth-changed')).toEqual([
      expect.objectContaining({ participants: [guildId], milestone: false, payload: { guildId, moduleId: 'fx', before: was, after: was + 250 } }),
      expect.objectContaining({ payload: { guildId, moduleId: 'fx', before: was + 250, after: -10 } }),
    ]);
  });

  test('refuses a folded Guild, changing nothing', () => {
    const results: EffectResult[] = [];
    const deps: EngineDeps = {
      ...testDeps(),
      modules: [effectModule((world, ctx) => [ctx.effects.adjustWealth({ guildId: foldedIn(world), delta: 100 })], results)],
    };
    const document = createWorld('wealth-folded', setup, deps).document;
    const guild = Object.values(document.world.guilds).find((row) => row.controller.kind === 'rival') as Guild;
    guild.foldedOnTurn = 0;
    const wealth = guild.wealth;

    const { document: after } = advance(document, deps);

    expect(only(results)).toEqual({ ok: false, rejection: { effect: 'adjustWealth', reason: 'guild-folded' } });
    expect(after.world.guilds[guild.id]?.wealth).toBe(wealth);
  });

  test('throws on a fractional delta: a programming error, naming the module', () => {
    failsNamingFx('wealth-bad', (world, ctx) => [ctx.effects.adjustWealth({ guildId: Object.keys(world.guilds)[0] as GuildId, delta: 1.5 })]);
  });
});

/** The id of the folded Guild in `world`. */
function foldedIn(world: ReadonlyWorld): GuildId {
  const guild = Object.values(world.guilds).find((row) => row.foldedOnTurn !== null);
  if (guild === undefined) throw new Error('no folded Guild');
  return guild.id;
}

// ── adjustRegard ─────────────────────────────────────────────────────────────────────────────

describe('adjustRegard', () => {
  test("a Patron's Regard for a Guild moves by adjustRegard, recording the Turn and the module, with an event only on a band crossing", () => {
    let patronId = '' as PatronId;
    let guildId = '' as GuildId;
    const { after, events, results, deps } = onFirstAfternoon('regard-patron', (world, ctx) => {
      patronId = Object.keys(world.patrons)[0] as PatronId;
      guildId = Object.keys(world.guilds)[0] as GuildId;
      return [
        ctx.effects.adjustRegard({ holderId: patronId, entityId: guildId, delta: 2 }),
        ctx.effects.adjustRegard({ holderId: patronId, entityId: guildId, delta: 10 }),
      ];
    });

    expect(results.map((result) => result.ok && result.events.length)).toEqual([0, 1]);
    expect(after.world.patrons[patronId]?.regard[guildId]).toEqual({ value: 12, since: 1, reason: 'fx' });
    expect(ofType(events, 'patron.regard-changed').filter((event) => event.payload.cause === 'module')).toEqual([
      expect.objectContaining({
        payload: {
          patronId,
          guildId,
          cause: 'module',
          before: 2,
          after: 12,
          bandBefore: regardBand(2, deps.config),
          bandAfter: regardBand(12, deps.config),
          moduleId: 'fx',
        },
      }),
    ]);
  });

  test("a Guildmaster's Regard for a Hero, and a Hero's for another Hero, move the same way with their own events", () => {
    let guildmasterId = '';
    let heroIds: HeroId[] = [];
    const { after, events } = onFirstAfternoon('regard-people', (world, ctx) => {
      const guild = Object.values(world.guilds)[0];
      if (guild === undefined) throw new Error('no Guild');
      guildmasterId = guild.guildmasterId;
      heroIds = guild.rosterIds.slice(0, 2) as HeroId[];
      const [a, b] = heroIds as [HeroId, HeroId];
      return [
        ctx.effects.adjustRegard({ holderId: guild.guildmasterId, entityId: a, delta: -10 }),
        ctx.effects.adjustRegard({ holderId: a, entityId: b, delta: 10 }),
      ];
    });

    const [a, b] = heroIds as [HeroId, HeroId];
    expect(after.world.guildmasters[guildmasterId as never]?.regard[a]).toEqual({ value: -10, since: 1, reason: 'fx' });
    expect(after.world.heroes[a]?.regard[b]).toEqual({ value: 10, since: 1, reason: 'fx' });
    expect(ofType(events, 'guildmaster.regard-changed').map((event) => event.payload)).toEqual([
      expect.objectContaining({ guildmasterId, entityId: a, cause: 'module', before: 0, after: -10, moduleId: 'fx' }),
    ]);
    expect(ofType(events, 'hero.regard-changed').map((event) => event.payload)).toEqual([
      expect.objectContaining({ heroId: a, entityId: b, cause: 'module', before: 0, after: 10, moduleId: 'fx' }),
    ]);
  });

  test('refuses a Hero out of play as a holder, changing nothing', () => {
    const { deadHero, partyHero } = buildDocument().ids;
    const { results, before, after, ids } = onBuiltNight((_world, ctx) => [
      ctx.effects.adjustRegard({ holderId: deadHero, entityId: partyHero, delta: 10 }),
    ]);

    expect(only(results)).toEqual({ ok: false, rejection: { effect: 'adjustRegard', reason: 'holder-gone' } });
    expect(after.world.heroes[ids.deadHero]?.regard).toEqual(before.world.heroes[ids.deadHero]?.regard);
  });

  test("refuses the Guildmaster of a folded Guild as a holder, changing nothing", () => {
    let guildmasterId = '';
    let patronId = '';
    const { results, before, after } = onFirstAfternoon(
      'regard-folded',
      (world, ctx) => {
        guildmasterId = world.guilds[foldedIn(world)]?.guildmasterId as string;
        patronId = Object.keys(world.patrons)[0] as string;
        return [ctx.effects.adjustRegard({ holderId: guildmasterId as never, entityId: patronId as never, delta: 10 })];
      },
      (document) => {
        // Folded as the ending checks fold a Guild: its Heroes to the pool, its Roster empty.
        const rival = Object.values(document.world.guilds).find((row) => row.controller.kind === 'rival') as Guild;
        for (const heroId of rival.rosterIds) Object.assign(document.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: 0 });
        rival.rosterIds = [];
        rival.foldedOnTurn = 0;
      },
    );

    expect(only(results)).toEqual({ ok: false, rejection: { effect: 'adjustRegard', reason: 'holder-gone' } });
    expect(after.world.guildmasters[guildmasterId as never]?.regard).toEqual(before.world.guildmasters[guildmasterId as never]?.regard);
  });

  test.each<[string, (world: ReadonlyWorld) => { holderId: string; entityId: string }]>([
    ['a Patron holding Regard for a Hero', (world) => ({ holderId: Object.keys(world.patrons)[0] as string, entityId: rosterHero(world) })],
    ['a Guildmaster holding Regard for a Guild', (world) => ({ holderId: Object.values(world.guilds)[0]?.guildmasterId as string, entityId: Object.keys(world.guilds)[0] as string })],
    ['a Hero holding Regard for itself', (world) => ({ holderId: rosterHero(world), entityId: rosterHero(world) })],
    ['a Hero holding Regard for a Patron', (world) => ({ holderId: rosterHero(world), entityId: Object.keys(world.patrons)[0] as string })],
    ['a Hero holding Regard for a Guild', (world) => ({ holderId: rosterHero(world), entityId: Object.keys(world.guilds)[0] as string })],
    ['a Guild as the holder', (world) => ({ holderId: Object.keys(world.guilds)[0] as string, entityId: Object.keys(world.patrons)[0] as string })],
    ['an entity the world lacks', (world) => ({ holderId: rosterHero(world), entityId: 'hero-999999' })],
  ])('throws on %s: a programming error, naming the module', (_what, pick) => {
    failsNamingFx('regard-bad', (world, ctx) => [ctx.effects.adjustRegard({ ...(pick(world) as { holderId: HeroId; entityId: HeroId }), delta: 1 })]);
  });

  test('throws on a delta that is not finite', () => {
    failsNamingFx('regard-nan', (world, ctx) => [
      ctx.effects.adjustRegard({ holderId: Object.keys(world.patrons)[0] as PatronId, entityId: Object.keys(world.guilds)[0] as GuildId, delta: Number.NaN }),
    ]);
  });
});

// ── injure ───────────────────────────────────────────────────────────────────────────────────

describe('injure', () => {
  test("injures a Hero for the Days given, shortened by their Guild's infirmary as a Quest's Injury is, with hero.injured naming the module", () => {
    let heroId = '' as HeroId;
    const { after, events, deps } = onFirstAfternoon('injure', (world, ctx) => {
      heroId = rosterHero(world);
      return [ctx.effects.injure({ heroId, typeKey: 'deep-cut', days: 6 })];
    });

    const hero = after.world.heroes[heroId] as Hero;
    const guild = after.world.guilds[hero.guildId as GuildId] as Guild;
    const healsOnTurn = nightOf(dayOf(1) + healDays(6, healFactor(guild, deps.config)));
    expect(hero.injury).toEqual({ typeKey: 'deep-cut', healsOnTurn });
    expect(ofType(events, 'hero.injured')).toEqual([
      expect.objectContaining({ participants: [heroId, guild.id], payload: { heroId, questId: null, typeKey: 'deep-cut', healsOnTurn, moduleId: 'fx' } }),
    ]);
  });

  test("an infirmary above grade 0 shortens the Days, as it shortens a Quest's Injury", () => {
    let heroId = '' as HeroId;
    const grade = 2;
    const { after, deps } = onFirstAfternoon(
      'injure-infirmary',
      (world, ctx) => {
        heroId = rosterHero(world);
        return [ctx.effects.injure({ heroId, typeKey: 'deep-cut', days: 6 })];
      },
      (document) => {
        for (const guild of Object.values(document.world.guilds)) guild.hall.infirmary = grade;
      },
    );

    const guild = after.world.guilds[after.world.heroes[heroId]?.guildId as GuildId] as Guild;
    const days = healDays(6, healFactor(guild, deps.config));
    // The test sees the infirmary only if it changes the Days.
    expect(guild.hall.infirmary).toBe(grade);
    expect(days).toBeLessThan(6);
    expect(after.world.heroes[heroId]?.injury).toEqual({ typeKey: 'deep-cut', healsOnTurn: nightOf(dayOf(1) + days) });
  });

  test("the Hero State Engine heals it on its night, as it heals any Injury", () => {
    let heroId = '' as HeroId;
    const played = onFirstAfternoon('injure-heals', (world, ctx) => {
      heroId = rosterHero(world);
      return [ctx.effects.injure({ heroId, typeKey: 'bruised-ribs', days: 1 })];
    });
    let document = played.after;
    const healsOnTurn = document.world.heroes[heroId]?.injury?.healsOnTurn as number;
    const healed: EngineEvent[] = [];

    while (document.world.turn < healsOnTurn) {
      const turn = advance(document, played.deps);
      document = withValid(turn.document, played.deps);
      healed.push(...turn.events.filter(isEngineEvent).filter((event) => event.type === 'hero.healed' && event.payload.heroId === heroId));
    }

    expect(document.world.heroes[heroId]?.injury).toBeNull();
    expect(healed.map((event) => event.turn)).toEqual([healsOnTurn]);
  });

  test('refuses a Hero already injured, one away in a Party and one out of play, changing nothing', () => {
    const { partyHero, deadHero, idleHero } = buildDocument().ids;
    const idle = idleHero as HeroId;
    const { results, before, after, ids } = onBuiltNight((_world, ctx) => [
      ctx.effects.injure({ heroId: idle, typeKey: 'deep-cut', days: 6 }),
      ctx.effects.injure({ heroId: idle, typeKey: 'broken-arm', days: 20 }),
      ctx.effects.injure({ heroId: partyHero, typeKey: 'deep-cut', days: 6 }),
      ctx.effects.injure({ heroId: deadHero, typeKey: 'deep-cut', days: 6 }),
    ]);

    expect(results.map((result) => (result.ok ? 'injured' : result.rejection.reason))).toEqual([
      'injured',
      'hero-injured',
      'hero-away',
      'hero-gone',
    ]);
    expect(after.world.heroes[ids.idleHero as HeroId]?.injury?.typeKey).toBe('deep-cut');
    expect(after.world.heroes[ids.deadHero]?.injury).toEqual(before.world.heroes[ids.deadHero]?.injury);
  });

  test.each([
    ['an Injury type content lacks', { typeKey: 'lost-soul' }],
    ['no Days', { days: 0 }],
    ['a fractional number of Days', { days: 2.5 }],
  ])('throws on %s: a programming error, naming the module', (_what, fields) => {
    failsNamingFx('injure-bad', (world, ctx) => [ctx.effects.injure({ heroId: rosterHero(world), typeKey: 'deep-cut', days: 6, ...fields })]);
  });
});

// ── offerQuest ───────────────────────────────────────────────────────────────────────────────

describe('offerQuest', () => {
  test("puts a Quest of the Patron's on the end of the Board, generated as the Board's are, with quest.offered naming the module", () => {
    let patronId = '' as PatronId;
    const { after, events } = onFirstAfternoon('offer', (world, ctx) => {
      patronId = Object.keys(world.patrons)[0] as PatronId;
      return [ctx.effects.offerQuest({ patronId })];
    });
    const plain = advance(createWorld('offer', setup, testDeps()).document, testDeps()).document;

    // The Board as the Turn left it without the module (the Rivals took their pick), and the Quest after it.
    const questId = after.world.board.at(-1);
    const quest = after.world.quests[questId as never];
    expect(after.world.board.slice(0, -1)).toEqual(plain.world.board);
    expect(quest).toMatchObject({ patronId, status: 'offered', offeredOnTurn: 1 });
    expect(ofType(events, 'quest.offered')).toEqual([
      expect.objectContaining({ participants: [questId, patronId], payload: { questId, patronId, templateKey: quest?.templateKey, moduleId: 'fx' } }),
    ]);
  });

  test('offers the template named, and draws only from the module’s stream: every core stream stands as it would have', () => {
    let patronId = '' as PatronId;
    let templateKey = '';
    const played = onFirstAfternoon('offer-streams', (world, ctx) => {
      const patron = Object.values(world.patrons)[0];
      if (patron === undefined) throw new Error('no Patron');
      patronId = patron.id;
      templateKey = Object.values(ctx.content.questTemplates).find((template) => template.sphereKeys.includes(patron.sphereKey))?.key as string;
      return [ctx.effects.offerQuest({ patronId, templateKey })];
    });
    const plain = advance(createWorld('offer-streams', setup, testDeps()).document, testDeps()).document;

    expect(played.after.world.quests[played.after.world.board.at(-1) as never]).toMatchObject({ patronId, templateKey });
    for (const name of streamNames) expect(played.after.world.rng[name], name).toEqual(plain.world.rng[name]);
    expect((played.after.world.rng as Record<string, unknown>).fx).not.toEqual((played.before.world.rng as Record<string, unknown>).fx);
  });

  test('throws for a module that registered no stream to draw from, naming the module', () => {
    const streamless: Module = {
      id: 'fx',
      createSlice: () => ({}),
      validateSlice: () => [],
      onAfternoon: (world, _slice, ctx) => {
        const result = ctx.effects.offerQuest({ patronId: Object.keys(world.patrons)[0] as PatronId });
        return { events: result.ok ? result.events : [] };
      },
    };
    const deps: EngineDeps = { ...testDeps(), modules: [streamless] };

    expect(thrownBy(() => advance(createWorld('offer-streamless', setup, deps).document, deps))).toMatchObject({ name: 'ModuleError', moduleId: 'fx' });
  });

  test("throws on a template that is not the Patron's", () => {
    failsNamingFx('offer-bad', (world, ctx) => [ctx.effects.offerQuest({ patronId: Object.keys(world.patrons)[0] as PatronId, templateKey: 'no-such-template' })]);
  });
});
