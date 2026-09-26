import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyBuild } from '../actions/build.js';
import { applyDispatch, dispatch, type DispatchAction } from '../actions/dispatch.js';
import { applyRecruit } from '../actions/recruit.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import { rivalChoices } from '../controllers/rival.js';
import { createWorld } from '../create.js';
import {
  compareByCodeUnit,
  type Guild,
  type GuildId,
  type HeroId,
  type QuestId,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent } from '../events.js';
import { createStreams } from '../rng.js';
import { dispositionOf, playerGuild } from '../selectors.js';
import { plannedStreams, testDeps, withValid } from '../world.test-support.js';
import { phaseContext } from './phase.js';
import { rivalControllers } from './rival-controllers.js';

// M2-S9: the afternoon's Rival controllers (DL-30). Every document a test inspects is held to the
// validator.

// The rules the player's `dispatch`, `recruit` and (from M3-S6) `build` run, watched: a Rival's
// choices must reach them and nothing else (the story's second acceptance box). Each spy calls the
// real rule.
vi.mock('../actions/dispatch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../actions/dispatch.js')>();
  return { ...actual, applyDispatch: vi.fn(actual.applyDispatch) };
});
vi.mock('../actions/recruit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../actions/recruit.js')>();
  return { ...actual, applyRecruit: vi.fn(actual.applyRecruit) };
});
vi.mock('../actions/build.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../actions/build.js')>();
  return { ...actual, applyBuild: vi.fn(actual.applyBuild) };
});

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * INPUTS 4.6's wage and 4.12's three Upkeeps, under which every starting Rival has the Wealth to
 * recruit on its first afternoon: the tests that watch a recruit pin them, since the first balance
 * pass raised both defaults (DL-35). Building is put out of reach unless a test asks for it, since
 * `steady` builds its infirmary in place of a recruit once its Wealth is three times the cost
 * (M3-S6, DL-38), which a starting Rival's may be.
 */
const recruitingDeps = (building = false): EngineDeps =>
  testDeps({ wagePerLevel: 5, recruitWealthMultiple: 3, ...(building ? {} : { buildWealthMultiple: 1_000_000 }) });

afterEach(() => {
  vi.mocked(applyDispatch).mockClear();
  vi.mocked(applyRecruit).mockClear();
  vi.mocked(applyBuild).mockClear();
});

function created(seed: string, deps: EngineDeps): WorldDocument {
  return withValid(createWorld(seed, setup, deps).document, deps);
}

const ofType = <Type extends EngineEvent['type']>(events: EngineEvent[], type: Type) =>
  events.filter((event): event is Extract<EngineEvent, { type: Type }> => event.type === type);

function guildOf(document: WorldDocument, guildId: GuildId): Guild {
  const guild = document.world.guilds[guildId];
  if (guild === undefined) throw new Error(`No Guild ${guildId}`);
  return guild;
}

/** The Rivals of `world`, its own rows, in Guild id order. */
function rivals(world: World): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

function firstRival(world: World): Guild {
  const [rival] = rivals(world);
  if (rival === undefined) throw new Error('No Rival');
  return rival;
}

describe('rivalControllers', () => {
  test('Rivals take Quests off the Board each afternoon, so the player sees fewer', () => {
    const deps = testDeps();
    let document = created('contested', deps);

    for (let day = 0; day < 3; day += 1) {
      // The morning's Board, as the player leaves it (Turn 0 is Day 0's morning; later mornings refill it).
      if (day > 0) document = withValid(advance(document, deps).document, deps);
      const morning = [...document.world.board];
      expect(morning, `Day ${day}`).toHaveLength(deps.config.boardSize);

      const { document: afternoon, events } = advance(document, deps);
      document = withValid(afternoon, deps);

      const taken = ofType(events, 'quest.taken');
      expect(taken.length, `Day ${day}`).toBeGreaterThan(0);
      for (const event of taken) {
        const { questId, guildId } = event.payload;
        expect(dispositionOf(guildOf(document, guildId))).toBe('steady');
        expect(morning).toContain(questId);
        expect(document.world.quests[questId]?.status).toBe('taken');
        expect(document.history.byEntity[questId]?.some((position) => document.history.entries[position] === event)).toBe(true);
      }
      expect(document.world.board).toEqual(morning.filter((questId) => !taken.some((event) => event.payload.questId === questId)));
      expect(document.world.board.length).toBeLessThan(deps.config.boardSize);

      document = withValid(advance(document, deps).document, deps); // the night
    }
  });

  test('act after the player: a Quest the player dispatches to in the morning is not there for a Rival', () => {
    const deps = testDeps();
    // What the first Rival takes when the player leaves the Board alone.
    const alone = created('after-the-player', deps);
    const first = firstRival(alone.world);
    const wanted = rivalChoices(alone.world, first, deps).find((action) => action.kind === 'dispatch');
    if (wanted === undefined) throw new Error('The first Rival takes nothing');
    const untouched = ofType(advance(alone, deps).events, 'quest.taken');
    expect(untouched.find((event) => event.payload.questId === wanted.questId)?.payload.guildId).toBe(first.id);

    // The same world, where the player sends a Party on that Quest in the morning.
    const morning = created('after-the-player', deps);
    const player = playerGuild(morning.world) as Guild;
    const sent = firstAccepted(morning, player, wanted.questId, deps);

    const { document, events } = advance(sent, deps);

    withValid(document, deps);
    const taken = ofType(events, 'quest.taken');
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.map((event) => event.payload.questId)).not.toContain(wanted.questId);
    expect(taken.every((event) => event.payload.guildId !== player.id)).toBe(true);
    const partyIds = document.world.quests[wanted.questId]?.partyIds ?? [];
    expect(partyIds.map((partyId) => document.world.parties[partyId]?.guildId)).toEqual([player.id]);
  });

  test("apply each choice through the player's dispatch, recruit and build rules, and emit only what those return", () => {
    const deps = recruitingDeps(true);
    const document = created('through-the-actions', deps);
    // The first Rival rich enough to build its infirmary (M3-S6), the others to recruit and no more.
    rivals(document.world).forEach((rival, index) => (rival.wealth = index === 0 ? 10_000 : 500));
    // Each Rival's choices as it will make them, in Guild id order, on the world each leaves the next.
    const world = structuredClone(document.world);
    world.turn += 1;
    const expected: { guildId: GuildId; kind: string }[] = [];
    for (const rival of rivals(world)) {
      for (const action of rivalChoices(world, rival, deps)) {
        expected.push({ guildId: action.guildId, kind: action.kind });
        if (action.kind === 'dispatch') applyDispatch(world, action, deps);
        else if (action.kind === 'recruit') applyRecruit(world, action, deps);
        else applyBuild(world, action, deps);
      }
    }
    vi.mocked(applyDispatch).mockClear();
    vi.mocked(applyRecruit).mockClear();
    vi.mocked(applyBuild).mockClear();
    expect(expected.map((each) => each.kind)).toContain('dispatch');
    expect(expected.map((each) => each.kind)).toContain('recruit');
    expect(expected.map((each) => each.kind)).toContain('build');

    const { document: afternoon, events } = advance(document, deps);

    withValid(afternoon, deps);
    const seen = [...calls(applyDispatch, 'dispatch'), ...calls(applyRecruit, 'recruit'), ...calls(applyBuild, 'build')].sort(
      (a, b) => a.order - b.order,
    );
    // Every choice, in order, went to the rule with the Turn's world and the deps' rules.
    expect(seen.map(({ guildId, kind }) => ({ guildId, kind }))).toEqual(expected);
    for (const call of seen) {
      expect(call.world).toBe(afternoon.world);
      expect(call.deps.config).toBe(deps.config);
      expect(call.deps.content).toBe(deps.content);
    }
    // Each was accepted, and the afternoon's events are theirs, in the same order: no side path.
    expect(events).toEqual(seen.flatMap((call) => call.events));
    const eventOf = { dispatch: 'quest.taken', recruit: 'hero.recruited', build: 'guild.improved' } as const;
    expect(events.map((event) => event.type)).toEqual(expected.map(({ kind }) => eventOf[kind as keyof typeof eventOf]));
    expect(afternoon.history.entries.slice(-events.length)).toEqual(events);
  });

  test('never has a choice refused over ten Days, so no Rival sends an unavailable Hero', () => {
    const deps = testDeps();
    let document = created('ten-days', deps);
    let events: EngineEvent[] = [];

    while (document.world.turn < 30) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events = events.concat(result.events);
    }

    const results = [
      ...vi.mocked(applyDispatch).mock.results,
      ...vi.mocked(applyRecruit).mock.results,
      ...vi.mocked(applyBuild).mock.results,
    ];
    expect(results.length).toBeGreaterThan(10);
    for (const result of results) expect(result).toMatchObject({ type: 'return', value: { ok: true } });
    expect(ofType(events, 'quest.taken').length).toBe(vi.mocked(applyDispatch).mock.calls.length);
    expect(ofType(events, 'hero.recruited').length).toBe(vi.mocked(applyRecruit).mock.calls.length);
    expect(ofType(events, 'guild.improved').length).toBe(vi.mocked(applyBuild).mock.calls.length);
  });

  test("drops a refused choice, changing nothing, and applies the Guild's next", () => {
    const deps = recruitingDeps();
    const document = created('refused', deps);
    const world = structuredClone(document.world);
    world.turn += 1;
    const rival = firstRival(world);
    const choices = rivalChoices(world, rival, deps);
    expect(choices.map((action) => action.kind)).toEqual(['dispatch', 'recruit']);
    const refusal = { action: 'dispatch', reason: 'quest-not-offered', questId: 'quest-000001' as QuestId } as const;
    vi.mocked(applyDispatch).mockReturnValueOnce({ ok: false, rejection: refusal });

    const events = rivalControllers(world, phaseContext(world, deps));

    // The first Rival's dispatch was refused and dropped; its recruit went ahead.
    const its = events.filter((event) => event.participants.includes(rival.id));
    expect(its.map((event) => event.type)).toEqual(['hero.recruited']);
    expect(Object.values(world.parties).some((party) => party.guildId === rival.id)).toBe(false);
  });

  test('moves no random stream: steady draws nothing, from rivals or any other', () => {
    const deps = recruitingDeps();
    const document = created('streams', deps);
    const world = structuredClone(document.world);
    // Every planned stream, so that each can be seen to stand still.
    Object.assign(world.rng, createStreams(document.meta.seed, plannedStreams), structuredClone(world.rng));
    world.turn += 1;
    const before = structuredClone(world.rng);

    const events = rivalControllers(world, phaseContext(world, deps));

    expect(ofType(events, 'quest.taken').length).toBeGreaterThan(0);
    expect(ofType(events, 'hero.recruited').length).toBeGreaterThan(0);
    expect(world.rng).toEqual(before);
    expect(Object.keys(world.rng).sort()).toEqual([...plannedStreams].sort());
  });

  test('acts for the Rivals in Guild id order, never for the player, and never for a folded Guild', () => {
    const deps = testDeps();
    const document = created('order', deps);
    const world = structuredClone(document.world);
    world.turn += 1;
    const folded = firstRival(world);
    folded.foldedOnTurn = 0;
    (playerGuild(world) as Guild).wealth = 100_000;

    const events = rivalControllers(world, phaseContext(world, deps));

    const actors = events.map((event) => (event.payload as { guildId: GuildId }).guildId);
    expect(actors.length).toBeGreaterThan(0);
    expect(actors).toEqual([...actors].sort(compareByCodeUnit));
    expect(actors).not.toContain(playerGuild(world)?.id);
    expect(actors).not.toContain(folded.id);
  });
});

interface SeenCall {
  /** When it was called, among every spy's calls. */
  order: number;
  kind: 'dispatch' | 'recruit' | 'build';
  guildId: GuildId;
  world: World;
  deps: EngineDeps;
  /** What the rule returned, which must be an acceptance. */
  events: EngineEvent[];
}

/** Every call a spied rule saw since it was last cleared, each accepted, or the test fails. */
function calls(rule: typeof applyDispatch | typeof applyRecruit | typeof applyBuild, kind: SeenCall['kind']): SeenCall[] {
  const { mock } = vi.mocked(rule);
  return mock.calls.map(([world, request, deps], index) => {
    const result = mock.results[index];
    if (result?.type !== 'return' || !result.value.ok) throw new Error(`A Rival's ${kind} was refused or threw`);
    const order = mock.invocationCallOrder[index] ?? 0;
    return { order, kind, guildId: request.guildId, world, deps, events: result.value.events };
  });
}

/**
 * `guild` sends on `questId` the first Party of its Roster, smallest first, that `dispatch`
 * accepts; the document after, checked.
 */
function firstAccepted(document: WorldDocument, guild: Guild, questId: QuestId, deps: EngineDeps): WorldDocument {
  const roster = guild.rosterIds;
  const parties: HeroId[][] = [];
  for (let mask = 1; mask < 1 << roster.length; mask += 1) {
    parties.push(roster.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  parties.sort((a, b) => a.length - b.length);
  for (const heroIds of parties) {
    const request: Omit<DispatchAction, 'kind'> = { guildId: guild.id, questId, heroIds };
    const result = dispatch(document, request, deps);
    if (result.ok) return withValid(result.document, deps);
  }
  throw new Error(`The player cannot staff ${questId}`);
}
