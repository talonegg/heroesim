import { describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, type Guild, type GuildId, type Hero, type PatronId, type QuestId, type World, type WorldDocument } from '../document.js';
import { moduleEffectKinds, type ModuleEffects } from '../effects.js';
import { isModuleEvent, type TurnEvent } from '../events.js';
import { fastForward } from '../fast-forward.js';
import type { ModuleContext, ReadonlyWorld } from '../modules.js';
import { regardValue } from '../regard.js';
import { createStreams, next, streamNames } from '../rng.js';
import { playerGuild } from '../selectors.js';
import { deserialise, serialise } from '../serialise.js';
import { dayOf, timeOfDay, timesOfDay } from '../time.js';
import { validate } from '../validate.js';
import { testDeps, withValid } from '../world.test-support.js';
import { createProbe, probe, probeDefaults, probeId, type ProbeFired, type ProbeSlice } from './probe.js';

// The probe module (ADR-0005 as amended 2026-09-25, data-model §3.4, approach §2, N6, DL-78).
// A module that exists only to prove the contract: a slice, a stream, all three hooks, one effect
// of each kind through the effects API, a stop, and a migration from a version 0 of its slice.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

const plainDeps = testDeps();

function withProbe(tunables: Parameters<typeof createProbe>[0] = {}, deps: EngineDeps = testDeps()): EngineDeps {
  return { ...deps, modules: [createProbe(tunables)] };
}

/** A new world under `deps`, validated. */
function created(seed: string, deps: EngineDeps): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

/** Plays `turns` Turns from `document`, keeping every document and every Turn's events. */
function play(document: WorldDocument, deps: EngineDeps, turns: number): { documents: WorldDocument[]; events: TurnEvent[][] } {
  const documents = [document];
  const events: TurnEvent[][] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const played = advance(documents.at(-1) as WorldDocument, deps);
    documents.push(played.document);
    events.push(played.events);
  }
  return { documents, events };
}

function sliceOf(document: WorldDocument): ProbeSlice {
  return (document.world.modules as Record<string, ProbeSlice>)[probeId] as ProbeSlice;
}

/** The world without the probe's slice and stream. */
function coreOf(world: World): unknown {
  const rng = Object.fromEntries(Object.entries(world.rng).filter(([name]) => name !== probeId));
  return { ...world, rng, modules: {} };
}

/** `text` with the probe's slice replaced by what `change` makes of it. */
function withSlice(text: string, change: (slice: Record<string, unknown>) => unknown): string {
  const saved = JSON.parse(text) as { world: { modules: Record<string, Record<string, unknown>> } };
  saved.world.modules[probeId] = change(saved.world.modules[probeId] as Record<string, unknown>) as Record<string, unknown>;
  return JSON.stringify(saved);
}

describe('the probe registers', () => {
  test('its slice and its stream: id probe, stream probe, version 1, nothing counted, its tunables on the slice', () => {
    const deps = { ...testDeps(), modules: [probe] };
    const document = created('registers', deps);

    expect(probe.id).toBe('probe');
    expect(probe.streamName).toBe('probe');
    expect(sliceOf(document)).toEqual({
      version: 1,
      hooks: { morning: 0, afternoon: 0, night: 0 },
      lastStopTurn: null,
      ...probeDefaults,
    });
    expect((document.world.rng as Record<string, unknown>).probe).toEqual(createStreams('registers', ['probe']).probe);
  });

  test('tunables given to createProbe go on the slice it makes; the default probe is createProbe()', () => {
    const document = created('tuned', withProbe({ probeStopEveryDays: 3, probeFireBelow: 0.5 }));

    expect(sliceOf(document)).toMatchObject({ probeStopEveryDays: 3, probeFireBelow: 0.5 });
    expect(createProbe().createSlice).toBeTypeOf('function');
    expect(sliceOf(created('tuned', withProbe()))).toEqual(sliceOf(created('tuned', { ...testDeps(), modules: [probe] })));
  });
});

// ── Box 1 ──────────────────────────────────────────────────────────────────────────────

// A year of Turns, each through `advance`, which copies the world: about a second alone, and
// five to eight under the whole suite's load, past the default 5 s (DL-164).
describe('over a year', { timeout: 60_000 }, () => {
  // Wealth enough that the player's Guild, which takes no Quest here, lasts the year unbankrupt.
  const yearDeps = testDeps({ startingWealth: 1_000_000 });
  const turns = yearDeps.config.turnsPerYear;

  test("installed, the probe's counts equal the mornings, afternoons and nights played", () => {
    const deps = withProbe({}, yearDeps);
    let document = created('a-year', deps);
    for (let turn = 1; turn <= turns; turn += 1) document = advance(document, deps).document;

    const played = { morning: 0, afternoon: 0, night: 0 };
    for (let turn = 1; turn <= turns; turn += 1) played[timeOfDay(turn)] += 1;
    expect(withValid(document, deps).world.turn).toBe(turns);
    expect(sliceOf(document).hooks).toEqual(played);
    // A year is whole Days, and Turn 0, a morning, plays no phase (DL-24): one of each a Day.
    expect(played).toEqual({ morning: turns / 3, afternoon: turns / 3, night: turns / 3 });
  });

  test('uninstalled, world.modules is empty on every Turn of the same year', () => {
    let document = created('a-year', yearDeps);
    const slices = new Set<number>();
    for (let turn = 1; turn <= turns; turn += 1) {
      document = advance(document, yearDeps).document;
      slices.add(Object.keys(document.world.modules).length);
    }

    expect(withValid(document, yearDeps).world.turn).toBe(turns);
    expect(document.world.modules).toEqual({});
    expect([...slices]).toEqual([0]);
    expect(Object.keys(document.world.rng)).toEqual([...streamNames]);
  });
});

// ── The stop ─────────────────────────────────────────────────────────────────────────────────

describe("onAfternoon's stop", () => {
  test('comes every probeStopEveryDays Days, on the afternoon, and records its Turn in lastStopTurn', () => {
    const deps = withProbe({ probeStopEveryDays: 2 });
    const stoppedOn: number[] = [];
    const lastStops: (number | null)[] = [];
    let document = created('stops', deps);
    for (let turn = 1; turn <= 30; turn += 1) {
      const played = advance(document, deps);
      document = played.document;
      lastStops.push(sliceOf(document).lastStopTurn);
      if (played.stoppedBecause?.kind === 'module') {
        expect(played.stoppedBecause).toEqual({ kind: 'module', moduleId: 'probe' });
        stoppedOn.push(turn);
      }
    }

    // The afternoons of Days 2, 4, 6 and 8: Turns 3d + 1.
    expect(stoppedOn).toEqual([7, 13, 19, 25]);
    expect(stoppedOn.map(timeOfDay)).toEqual(['afternoon', 'afternoon', 'afternoon', 'afternoon']);
    expect(stoppedOn.map(dayOf)).toEqual([2, 4, 6, 8]);
    // After Turn t, lastStopTurn is the last stop at or before it.
    expect(lastStops).toEqual(lastStops.map((_, index) => stoppedOn.filter((turn) => turn <= index + 1).at(-1) ?? null));
    expect(withValid(document, deps).world.turn).toBe(30);
  });

  test('halts fast forward with the probe named, the Turn it asked and no other', () => {
    const deps = withProbe({ probeStopEveryDays: 3 });
    let document = created('forward', deps);
    const guildId = playerGuild(document.world)?.id as GuildId;
    const stops: [number, string][] = [];

    for (let tries = 0; tries < 40 && document.world.turn < 10; tries += 1) {
      const result = fastForward(document, { guildId, until: [], maxTurns: 60 }, deps);
      document = result.document;
      stops.push([document.world.turn, result.stoppedBecause.kind]);
    }

    // The afternoon of Day 3 is Turn 10.
    expect(stops.at(-1)).toEqual([10, 'module']);
    expect(stops.slice(0, -1).every(([, kind]) => kind !== 'module')).toBe(true);
    expect(sliceOf(withValid(document, deps)).lastStopTurn).toBe(10);
  });
});

// ── The night ────────────────────────────────────────────────────────────────────────────────

describe("onNight's draw", () => {
  test('below probeFireBelow applies one effect of each kind through the effects API and emits probe.fired listing them', () => {
    const deps = withProbe({ probeFireBelow: 1 });
    const before = advance(created('fires', deps), deps).document;

    // Turn 2 is the first night.
    const night = advance(before, deps);
    const after = withValid(night.document, deps);

    const fired = night.events.filter(isModuleEvent) as ProbeFired[];
    expect(fired.map((event) => event.type)).toEqual(['probe.fired']);
    const [event] = fired as [ProbeFired];
    const { effects, roll } = event.payload;
    expect(roll).toBe(next(createStreams('fires', ['probe']).probe));
    expect(effects.map(({ effect }) => effect.kind)).toEqual([...moduleEffectKinds]);
    expect(effects.every(({ applied }) => applied)).toBe(true);

    const [morale, wealth, regard, injure, offer] = effects.map(({ effect }) => effect) as unknown as [
      { heroId: Hero['id']; delta: number },
      { guildId: GuildId; delta: number },
      { holderId: PatronId; entityId: GuildId; delta: number },
      { heroId: Hero['id']; typeKey: string; days: number },
      { patronId: PatronId },
    ];
    const heroId = morale.heroId;
    const heroBefore = before.world.heroes[heroId] as Hero;
    const guildId = heroBefore.guildId as GuildId;
    expect(morale.delta).toBe(probeDefaults.probeMoraleDelta);
    expect(wealth).toEqual({ kind: 'adjustWealth', guildId, delta: probeDefaults.probeWealthDelta });
    expect(regard).toEqual({ kind: 'adjustRegard', holderId: offer.patronId, entityId: guildId, delta: probeDefaults.probeRegardDelta });
    expect(injure).toEqual({
      kind: 'injure',
      heroId,
      typeKey: Object.keys(deps.content.injuries).sort(compareByCodeUnit)[0],
      days: probeDefaults.probeInjuryDays,
    });
    expect(event.participants).toEqual([heroId, offer.patronId, guildId]);

    // probe.fired first, then each applied effect's events, every one naming the probe.
    const ownEvents = night.events.slice(night.events.indexOf(event));
    expect(ownEvents[0]).toBe(event);
    const fromEffects = ownEvents.slice(1);
    expect(fromEffects.every((entry) => (entry.payload as { moduleId?: string }).moduleId === 'probe')).toBe(true);
    const payloadOf = <Payload>(type: string) => fromEffects.find((entry) => entry.type === type)?.payload as Payload;

    // The core's rows changed as the effects say, each through the core's own rule and event.
    const heroAfter = after.world.heroes[heroId] as Hero;
    const moraleChanged = payloadOf<{ heroId: string; before: number; after: number; cause: string }>('hero.morale-changed');
    expect(moraleChanged).toMatchObject({ heroId, cause: 'module', after: heroAfter.morale });
    expect(moraleChanged.after).toBe(Math.max(deps.config.moraleMin, moraleChanged.before + morale.delta));
    const wealthChanged = payloadOf<{ guildId: string; before: number; after: number }>('guild.wealth-changed');
    expect(wealthChanged).toMatchObject({ guildId, after: (after.world.guilds[guildId] as Guild).wealth });
    expect(wealthChanged.after - wealthChanged.before).toBe(wealth.delta);
    const patronRegard = (world: World) => regardValue(world.patrons[offer.patronId]?.regard ?? {}, guildId);
    expect(patronRegard(after.world) - patronRegard(before.world)).toBe(regard.delta);
    expect(payloadOf('hero.injured')).toMatchObject({ heroId, questId: null, typeKey: injure.typeKey });
    expect(heroAfter.injury?.typeKey).toBe(injure.typeKey);
    const offered = payloadOf<{ questId: QuestId; patronId: PatronId }>('quest.offered');
    expect(offered.patronId).toBe(offer.patronId);
    expect(after.world.board).toContain(offered.questId);
    expect(before.world.board).not.toContain(offered.questId);
  });

  test('at or above probeFireBelow draws its one number and does nothing more', () => {
    const deps = withProbe({ probeFireBelow: 0 });
    const before = advance(created('quiet', deps), deps).document;

    const night = advance(before, deps);

    expect(night.events.filter(isModuleEvent)).toEqual([]);
    const stream = createStreams('quiet', ['probe']).probe;
    next(stream);
    expect((night.document.world.rng as Record<string, unknown>).probe).toEqual(stream);
    expect(sliceOf(night.document).hooks.night).toBe(1);
  });

  /** A world of one Guild in play, `hero` on its Roster, and one Patron: all a night hook reads. */
  function worldOf(hero: Partial<Hero>): ReadonlyWorld {
    const heroId = 'hero-000001';
    const guild = { id: 'guild-000001', foldedOnTurn: null, rosterIds: [heroId] };
    const heroes = { [heroId]: { id: heroId, guildId: guild.id, partyId: null, injury: null, ...hero } };
    return { turn: 2, heroes, guilds: { [guild.id]: guild }, patrons: { 'patron-000001': { id: 'patron-000001' } } } as unknown as ReadonlyWorld;
  }

  test('lists an effect the core refused as refused, with its rejection, and returns only what was applied', () => {
    const slice = createProbe({ probeFireBelow: 1 }).createSlice({} as never);
    const refused = { effect: 'adjustMorale', reason: 'hero-gone' } as const;
    const effects = Object.fromEntries(
      moduleEffectKinds.map((kind) => [kind, vi.fn(() => (kind === 'adjustMorale' ? { ok: false, rejection: refused } : { ok: true, events: [{ type: kind }] }))]),
    ) as unknown as ModuleEffects;
    const emit = vi.fn((draft: object) => ({ ...draft, made: true }));
    const ctx = { turn: 2, rng: { next: () => 0.5 }, emit, effects, content: testDeps().content } as unknown as ModuleContext;

    const result = probe.onNight?.(worldOf({}), slice, ctx);

    const [draft] = emit.mock.calls[0] as unknown as [{ type: string; participants: string[]; payload: { roll: number; effects: { applied: boolean }[] } }];
    expect(draft.type).toBe('probe.fired');
    expect(draft.participants).toEqual(['hero-000001', 'patron-000001']);
    expect(draft.payload.roll).toBe(0.5);
    expect(draft.payload.effects[0]).toEqual({ effect: { kind: 'adjustMorale', heroId: 'hero-000001', delta: slice.probeMoraleDelta }, applied: false, rejection: refused });
    expect(draft.payload.effects.slice(1).every(({ applied }) => applied)).toBe(true);
    expect(result?.events.map((event) => event.type)).toEqual(['probe.fired', 'adjustWealth', 'adjustRegard', 'injure', 'offerQuest']);
  });

  test.each([
    ['the first', 0, 0],
    ['one in the middle', 0.5, 1],
    ['the last', 0.99, 2],
  ])('the night’s one draw also picks the Hero and the Patron: a draw at %s of the range below the threshold picks that one', (_which, share, index) => {
    const slice = createProbe().createSlice({} as never);
    const guild = { id: 'guild-000001', foldedOnTurn: null, rosterIds: ['hero-000003', 'hero-000001', 'hero-000002'] };
    const heroes = Object.fromEntries(guild.rosterIds.map((id) => [id, { id, guildId: guild.id, partyId: null, injury: null }]));
    const patronIds = ['patron-000002', 'patron-000003', 'patron-000001'];
    const patrons = Object.fromEntries(patronIds.map((id) => [id, { id }]));
    const world = { turn: 2, heroes, guilds: { [guild.id]: guild }, patrons } as unknown as ReadonlyWorld;
    const effects = Object.fromEntries(moduleEffectKinds.map((kind) => [kind, vi.fn(() => ({ ok: true, events: [] }))])) as unknown as ModuleEffects;
    const emit = vi.fn((draft: object) => draft);
    const roll = share * slice.probeFireBelow;
    const ctx = { turn: 2, rng: { next: () => roll }, emit, effects, content: testDeps().content } as unknown as ModuleContext;

    probe.onNight?.(world, slice, ctx);

    // Both in id order: the Heroes hero-000001 to hero-000003, the Patrons patron-000001 to patron-000003.
    const heroId = `hero-00000${index + 1}`;
    const patronId = `patron-00000${index + 1}`;
    expect(effects.adjustMorale).toHaveBeenCalledWith(expect.objectContaining({ heroId }));
    expect(effects.adjustRegard).toHaveBeenCalledWith(expect.objectContaining({ holderId: patronId, entityId: guild.id }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ participants: [heroId, patronId], payload: expect.objectContaining({ roll }) }));
  });

  test.each([
    ['in a Party', { partyId: 'party-000001' }],
    ['injured', { injury: { typeKey: 'deep-cut', healsOnTurn: 9 } }],
  ])('fires on none when the only Hero on a Roster is %s: no effect, no event', (_why, hero) => {
    const slice = createProbe({ probeFireBelow: 1 }).createSlice({} as never);
    const world = worldOf(hero as Partial<Hero>);
    const emit = vi.fn();
    const effects = Object.fromEntries(moduleEffectKinds.map((kind) => [kind, vi.fn()])) as unknown as ModuleEffects;
    const ctx = { turn: 2, rng: { next: () => 0.5 }, emit, effects, content: testDeps().content } as unknown as ModuleContext;

    expect(probe.onNight?.(world, slice, ctx)).toEqual({ events: [] });
    expect(emit).not.toHaveBeenCalled();
    expect(Object.values(effects).every((effect) => (effect as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true);
    expect(slice.hooks.night).toBe(1);
  });
});

// ── Box 2 ──────────────────────────────────────────────────────────────────────────────

describe('only the probe stream moves when the probe draws', () => {
  test('each Turn, played from one document with the probe and without, the core streams agree; the probe stream moves only at night', () => {
    const deps = withProbe({ probeFireBelow: 1 });
    let document = created('streams', deps);
    let fired = 0;

    for (let turn = 1; turn <= 30; turn += 1) {
      const withIt = advance(document, deps);
      const withoutIt = advance(document, plainDeps);
      for (const name of streamNames) {
        expect(withIt.document.world.rng[name], `${name} at Turn ${turn}`).toEqual(withoutIt.document.world.rng[name]);
      }
      const probeStream = (of: WorldDocument) => (of.world.rng as Record<string, unknown>).probe;
      expect(probeStream(withoutIt.document), `Turn ${turn}`).toEqual(probeStream(document));
      if (timeOfDay(turn) === 'night') expect(probeStream(withIt.document), `Turn ${turn}`).not.toEqual(probeStream(document));
      else expect(probeStream(withIt.document), `Turn ${turn}`).toEqual(probeStream(document));
      fired += withIt.events.filter((event) => isModuleEvent(event) && (event.type as string) === 'probe.fired').length;
      document = withIt.document;
    }

    // It fired every night, offering a Quest drawn from its own stream each time.
    expect(fired).toBe(10);
    withValid(document, deps);
  });

  test('drawing without firing changes nothing else: Turn by Turn, the world without its slice and stream is the plain game’s', () => {
    const deps = withProbe({ probeFireBelow: 0 });
    const turns = 60;
    const withIt = play(created('isolated', deps), deps, turns).documents;
    const without = play(created('isolated', plainDeps), plainDeps, turns).documents;

    for (let turn = 0; turn <= turns; turn += 1) {
      expect(coreOf((withIt[turn] as WorldDocument).world), `Turn ${turn}`).toEqual((without[turn] as WorldDocument).world);
    }
    const stream = createStreams('isolated', ['probe']).probe;
    for (let night = 0; night < turns / 3; night += 1) next(stream);
    expect((withIt[turns]?.world.rng as Record<string, unknown>).probe).toEqual(stream);
  });
});

// ── Box 3 ──────────────────────────────────────────────────────────────────────────────

describe('a save with a probe slice', () => {
  const deps = withProbe({ probeStopEveryDays: 2 });
  const saved = serialise(play(created('saved', deps), deps, 9).documents.at(-1) as WorldDocument);

  test('of version 0, with no lastStopTurn, loads migrated to version 1, and plays on', () => {
    const version0 = withSlice(saved, (slice) => {
      const older: Record<string, unknown> = { ...slice, version: 0 };
      delete older.lastStopTurn;
      return older;
    });
    expect(JSON.parse(version0).world.modules.probe).not.toHaveProperty('lastStopTurn');

    const loaded = deserialise(version0, deps);
    if (!loaded.ok) throw new Error(loaded.reason.message);

    const current = JSON.parse(saved).world.modules.probe as ProbeSlice;
    expect(loaded.warnings).toEqual([]);
    expect(sliceOf(loaded.document)).toEqual({ ...current, lastStopTurn: null });
    const next = withValid(advance(loaded.document, deps).document, deps);
    expect(sliceOf(next).hooks.afternoon).toBe(current.hooks.afternoon + 1);
  });

  test('none, made before the probe was installed, loads with it without a warning, and gains its slice when next played', () => {
    const plain = serialise(play(created('saved', plainDeps), plainDeps, 9).documents.at(-1) as WorldDocument);

    const loaded = deserialise(plain, deps);
    if (!loaded.ok) throw new Error(loaded.reason.message);

    expect(loaded.warnings).toEqual([]);
    expect(loaded.document.world.modules).toEqual({});
    expect(validate(loaded.document, deps)).toEqual({ ok: true, warnings: [] });
    // Turn 10 is the afternoon of Day 3: the slice is made as the Turn begins, then counted by
    // onAfternoon, which asks for its first stop, probeStopEveryDays (2) Days after Day 0.
    const next = advance(loaded.document, deps);
    expect(sliceOf(withValid(next.document, deps))).toMatchObject({ version: 1, hooks: { morning: 0, afternoon: 1, night: 0 }, lastStopTurn: 10 });
    expect(next.stoppedBecause).toEqual({ kind: 'module', moduleId: probeId });
  });

  test.each(['morning', 'afternoon', 'night'] as const)('with a negative %s count is refused, naming the module', (hook) => {
    const negative = withSlice(saved, (slice) => ({ ...slice, hooks: { ...(slice.hooks as object), [hook]: -1 } }));

    const loaded = deserialise(negative, deps);

    expect(loaded.ok).toBe(false);
    const failures = !loaded.ok && loaded.reason.kind === 'invalid' ? loaded.reason.failures : [];
    expect(failures).toEqual([{ check: 'module-slice', id: `$.world.modules.probe.hooks.${hook}`, detail: expect.stringContaining('probe') }]);
    const document = JSON.parse(negative) as WorldDocument;
    expect(validate(document, deps)).toMatchObject({ ok: false, failures: [{ check: 'module-slice' }] });
  });
});

describe("the probe's own checks of its slice", () => {
  const fresh = (): ProbeSlice => probe.createSlice({} as never);

  test('validateSlice accepts the slice it makes and a counted one', () => {
    expect(probe.validateSlice(fresh())).toEqual([]);
    expect(probe.validateSlice({ ...fresh(), hooks: { morning: 3, afternoon: 4, night: 3 }, lastStopTurn: 7 })).toEqual([]);
  });

  test.each([
    ['not an object', 'probe', []],
    ['an array', [], []],
    ['version 2', { ...fresh(), version: 2 }, ['version']],
    ['no hooks', { ...fresh(), hooks: undefined }, ['hooks']],
    ['a negative count', { ...fresh(), hooks: { morning: 0, afternoon: -2, night: 0 } }, ['hooks', 'afternoon']],
    ['a fractional count', { ...fresh(), hooks: { morning: 0.5, afternoon: 0, night: 0 } }, ['hooks', 'morning']],
    ['a missing count', { ...fresh(), hooks: { morning: 0, afternoon: 0 } }, ['hooks', 'night']],
    ['a count of another name', { ...fresh(), hooks: { morning: 0, afternoon: 0, night: 0, dusk: 1 } }, ['hooks', 'dusk']],
    ['a negative lastStopTurn', { ...fresh(), lastStopTurn: -1 }, ['lastStopTurn']],
    ['a fractional lastStopTurn', { ...fresh(), lastStopTurn: 2.5 }, ['lastStopTurn']],
    ['no lastStopTurn', { ...fresh(), lastStopTurn: undefined }, ['lastStopTurn']],
    ['probeStopEveryDays 0', { ...fresh(), probeStopEveryDays: 0 }, ['probeStopEveryDays']],
    ['probeFireBelow above 1', { ...fresh(), probeFireBelow: 1.5 }, ['probeFireBelow']],
    ['a negative probeFireBelow', { ...fresh(), probeFireBelow: -0.5 }, ['probeFireBelow']],
    ['a fractional probeMoraleDelta', { ...fresh(), probeMoraleDelta: 0.5 }, ['probeMoraleDelta']],
    ['a fractional probeWealthDelta', { ...fresh(), probeWealthDelta: 2.5 }, ['probeWealthDelta']],
    ['a probeRegardDelta that is not a number', { ...fresh(), probeRegardDelta: '2' }, ['probeRegardDelta']],
    ['probeInjuryDays 0', { ...fresh(), probeInjuryDays: 0 }, ['probeInjuryDays']],
  ])('validateSlice refuses %s, saying where and naming the module', (_what, slice, at) => {
    const failures = probe.validateSlice(slice);

    expect(failures.map((failure) => failure.at)).toEqual([at]);
    expect(failures.every(({ detail }) => detail.includes('probe'))).toBe(true);
  });

  test('migrateSlice returns a version-1 slice as it is, and leaves what it cannot read for validateSlice to refuse', () => {
    const current = fresh();

    expect(probe.migrateSlice?.(current)).toBe(current);
    expect(probe.migrateSlice?.('probe')).toBe('probe');
    const future = { ...current, version: 2 };
    expect(probe.migrateSlice?.(future)).toBe(future);
  });

  test('migrateSlice brings version 0 to version 1, adding lastStopTurn as never stopped, and changes nothing it was given', () => {
    const version0: Record<string, unknown> = { ...fresh(), version: 0, hooks: { morning: 2, afternoon: 2, night: 1 } };
    delete version0.lastStopTurn;
    const copy = structuredClone(version0);

    const migrated = probe.migrateSlice?.(version0);

    expect(migrated).toEqual({ ...fresh(), hooks: { morning: 2, afternoon: 2, night: 1 } });
    expect(Object.keys(migrated as object)).toEqual(Object.keys(fresh()));
    expect(probe.validateSlice(migrated)).toEqual([]);
    expect(version0).toEqual(copy);
  });

  test('its counts are keyed by the times of day', () => {
    expect(Object.keys(fresh().hooks)).toEqual([...timesOfDay]);
  });
});
