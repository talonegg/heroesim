import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps, GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { GuildId, Patron, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf } from '../events.js';
import { phases } from '../pipeline.js';
import { regardBand, regardValue } from '../regard.js';
import { nightOf } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { patronState } from './patron-state.js';
import { phaseContext } from './phase.js';

// M4-S5: the Patron State Engine, Patron Regard recovering toward neutral each night (pre-M0 review
// B5, DL-43). The scale, the bands and the rate are pinned here.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

const pinned: Partial<GameConfig> = {
  turnsPerYear: 1080,
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
  patronRegardRecoveryPerYear: 0.5,
};

afterEach(() => {
  vi.restoreAllMocks();
});

const changes = (events: readonly EngineEvent[]): EngineEventOf<'patron.regard-changed'>[] =>
  events.filter((event): event is EngineEventOf<'patron.regard-changed'> => event.type === 'patron.regard-changed');

/** A created world, its first Patron and its Guild ids. */
function scene(deps: EngineDeps): { document: WorldDocument; patron: Patron; guildIds: GuildId[] } {
  const { document } = createWorld('recovery', setup, deps);
  const [patron] = Object.values(document.world.patrons);
  if (patron === undefined) throw new Error('No Patron');
  return { document, patron, guildIds: Object.keys(document.world.guilds) as GuildId[] };
}

/** Runs the phase alone on the night of Day `day`. */
function night(world: World, day: number, deps: EngineDeps): EngineEvent[] {
  world.turn = nightOf(day);
  return patronState(world, phaseContext(world, deps));
}

describe('patronState', () => {
  test('a Patron left at cool with no further dealings is neutral again within 1 / patronRegardRecoveryPerYear years, with one patron.regard-changed', { timeout: 60_000 }, () => {
    // Only the Patron State Engine runs, so every entry is its own and nothing else deals with the Patron.
    for (const phase of phases) if (phase.name !== 'patronState') vi.spyOn(phase, 'run').mockReturnValue([]);
    const deps = testDeps({ ...pinned, rivalCount: 0 });
    const { document, patron, guildIds } = scene(deps);
    const [guildId] = guildIds as [GuildId];
    // The deepest cool there is: the band's own start.
    patron.regard[guildId] = { value: -12, since: 0, reason: 'quest.resolved' };
    expect(regardBand(-12, deps.config)).toBe('cool');

    const years = 1 / (deps.config.patronRegardRecoveryPerYear as number);
    let current = withValid(document, deps);
    const events: EngineEvent[] = [];
    let neutralOn: number | null = null;
    while (current.world.turn < years * deps.config.turnsPerYear) {
      const result = advance(current, deps);
      current = result.document;
      events.push(...result.events);
      const value = regardValue((current.world.patrons[patron.id] as Patron).regard, guildId);
      if (neutralOn === null && regardBand(value, deps.config) === 'neutral') neutralOn = current.world.turn;
    }
    withValid(current, deps);

    expect(neutralOn).not.toBeNull();
    expect(changes(events)).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(changes(events)[0]?.payload).toMatchObject({
      patronId: patron.id,
      guildId,
      cause: 'recovery',
      bandBefore: 'cool',
      bandAfter: 'neutral',
    });
    expect(changes(events)[0]?.turn).toBe(neutralOn);
    // And all the way home: the entry is gone, since absence is neutral.
    expect(Object.hasOwn((current.world.patrons[patron.id] as Patron).regard, guildId)).toBe(false);
  });

  test("moves each night by patronRegardRecoveryPerYear of the scale's reach over the year's nights, toward neutral from either side, never past it", () => {
    const deps = testDeps(pinned);
    const { document, patron, guildIds } = scene(deps);
    const world = structuredClone(document.world);
    const [first, second] = guildIds as [GuildId, GuildId];
    const own = world.patrons[patron.id] as Patron;
    own.regard[first] = { value: 9, since: 0, reason: 'quest.resolved' };
    own.regard[second] = { value: -0.01, since: 0, reason: 'quest.expired' };
    const step = (0.5 * 20) / 360;

    expect(night(world, 1, deps)).toEqual([]);

    expect(regardValue(own.regard, first)).toBeCloseTo(9 - step, 12);
    expect(Object.hasOwn(own.regard, second)).toBe(false);
  });

  test('emits only on the night a value crosses a band, warm to neutral as cool to neutral', () => {
    const deps = testDeps(pinned);
    const { document, patron, guildIds } = scene(deps);
    const world = structuredClone(document.world);
    const [guildId] = guildIds as [GuildId];
    const own = world.patrons[patron.id] as Patron;
    own.regard[guildId] = { value: 4.01, since: 0, reason: 'quest.resolved' };

    const events = night(world, 3, deps);

    expect(changes(events).map(({ payload }) => [payload.bandBefore, payload.bandAfter, payload.cause])).toEqual([
      ['warm', 'neutral', 'recovery'],
    ]);
    expect(night(world, 4, deps)).toEqual([]);
  });

  test('leaves a folded Guild out of play: its entries stand as they are', () => {
    const deps = testDeps(pinned);
    const { document, patron, guildIds } = scene(deps);
    const world = structuredClone(document.world);
    const rivalId = guildIds[1] as GuildId;
    const rival = world.guilds[rivalId];
    if (rival === undefined) throw new Error('No Rival');
    rival.foldedOnTurn = 0;
    const own = world.patrons[patron.id] as Patron;
    own.regard[rivalId] = { value: -9, since: 0, reason: 'quest.resolved' };

    night(world, 2, deps);

    expect(regardValue(own.regard, rivalId)).toBe(-9);
  });

  test('runs each night, after the Guild State Engine and before the pool refresh', () => {
    const names = phases.filter((phase) => phase.timeOfDay === 'night').map((phase) => phase.name);
    expect(names.indexOf('patronState')).toBe(names.indexOf('guildState') + 1);
    expect(names.indexOf('poolRefresh')).toBe(names.indexOf('patronState') + 1);
  });
});
