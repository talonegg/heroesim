import { afterEach, describe, expect, test, vi } from 'vitest';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import { phases, runTurn } from './pipeline.js';
import { phaseContext } from './phases/phase.js';
import { timeOfDay } from './time.js';
import { testDeps, withValid } from './world.test-support.js';

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const deps = testDeps();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the phase list', () => {
  test('names the phases of approach §2 in its order, each on its time of day', () => {
    expect(phases.map((phase) => [phase.timeOfDay, phase.name])).toEqual([
      ['morning', 'boardRefresh'],
      ['morning', 'marketRefresh'],
      ['afternoon', 'rivalControllers'],
      ['afternoon', 'questsAdvance'],
      ['night', 'questsConclude'],
      ['night', 'levelUps'],
      ['night', 'heroState'],
      ['night', 'guildState'],
      ['night', 'poolRefresh'],
      ['night', 'endings'],
    ]);
  });
});

describe('runTurn', () => {
  test('runs each phase only on its time of day, in list order, over nine Turns of advance', () => {
    const calls: [turn: number, name: string][] = [];
    const spies = phases.map((phase) =>
      vi.spyOn(phase, 'run').mockImplementation((world) => {
        calls.push([world.turn, phase.name]);
        return [];
      }),
    );
    let { document } = createWorld('nine-turns', setup, deps);

    for (let turn = 1; turn <= 9; turn += 1) document = withValid(advance(document, deps).document, testDeps());

    // Nine Turns from Turn 0 are three of each time of day, so every phase runs three times.
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(3);
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((turn) =>
      phases.filter((phase) => phase.timeOfDay === timeOfDay(turn)).map((phase): [number, string] => [turn, phase.name]),
    );
    expect(calls).toEqual(expected);
  });

  test("returns the phases' events in the order they ran", () => {
    const { document } = createWorld('events', setup, deps);
    const world = structuredClone(document.world);
    world.turn = 5; // a night
    const ctx = phaseContext(world, deps);
    // Any event type serves; this one's payload carries a string to tell the phases apart by.
    for (const phase of phases) {
      vi.spyOn(phase, 'run').mockImplementation(() => [
        ctx.emit({ type: 'world.created', participants: [], payload: { seed: phase.name } }),
      ]);
    }

    const events = runTurn(world, ctx);

    expect(events.map((event) => event.payload)).toEqual(
      ['questsConclude', 'levelUps', 'heroState', 'guildState', 'poolRefresh', 'endings'].map((seed) => ({ seed })),
    );
  });

  test("refuses a context made for another Turn than the world's", () => {
    const { document } = createWorld('mismatch', setup, deps);
    const world = structuredClone(document.world);
    const ctx = phaseContext(world, deps);
    world.turn += 1;

    expect(() => runTurn(world, ctx)).toThrow(RangeError);
  });
});
