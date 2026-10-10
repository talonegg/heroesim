import type * as Engine from '@heroesim/engine';
import { advance, fastForward } from '@heroesim/engine';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { started, withRosterReleased } from './game.test-support';
import { fastForwardStepTurns, useGame, type GameState, type Play } from './reducer';

// The reducer wired to React: a play is accepted at once, the busy state is committed and
// painted, and only then does the engine run, once, however many taps arrived meanwhile. Rendered
// under StrictMode, which calls a component's reducer twice: the engine must still run once, and
// the shared History take each Turn's events once (ADR-0008). A fast forward plays in steps, each
// settled after the one before it is painted, and the player's Stop is taken between them
// (DL-96).
vi.mock('@heroesim/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof Engine>();
  return { ...engine, advance: vi.fn(engine.advance), fastForward: vi.fn(engine.fastForward) };
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const newGame: Play = {
  kind: 'newGame',
  seed: 'use-game-test',
  guildName: 'The Lantern',
  guildmasterName: 'Ada Vell',
  createdAt: '2026-09-27T09:00:00.000Z',
};

/** The hook under StrictMode, with a game started and settled. */
async function startedGame() {
  const hook = renderHook(() => useGame(), { wrapper: StrictMode });
  act(() => hook.result.current[1](newGame));
  await waitFor(() => expect(hook.result.current[0].document).not.toBeNull());
  return hook;
}

function turnOf(state: GameState): number {
  if (state.document === null) throw new Error('expected a game in hand');
  return state.document.world.turn;
}

describe('useGame', () => {
  test('two taps on Advance in one batch drive one engine call', async () => {
    const { result } = await startedGame();
    const before = result.current[0];
    const entries = before.document?.history.entries.length ?? 0;

    act(() => {
      const play = result.current[1];
      play({ kind: 'advance' });
      play({ kind: 'advance' });
    });
    await waitFor(() => expect(result.current[0].busy).toBe(false));

    const after = result.current[0];
    expect(advance).toHaveBeenCalledTimes(1);
    expect(turnOf(after)).toBe(turnOf(before) + 1);
    expect(after.document?.history.entries.length).toBe(entries + after.log.length);
  });

  test('the busy state is committed before the engine runs, and a tap meanwhile is dropped', async () => {
    const { result } = await startedGame();
    const before = result.current[0];

    act(() => result.current[1]({ kind: 'fastForward', until: [], maxTurns: 3 }));

    expect(result.current[0]).toMatchObject({ busy: true, document: before.document });
    expect(fastForward).not.toHaveBeenCalled();

    act(() => result.current[1]({ kind: 'advance' }));
    await waitFor(() => expect(result.current[0].busy).toBe(false));

    expect(fastForward).toHaveBeenCalledTimes(1);
    // The engine's fast forward calls its own `advance`, not this spy: the tap on Advance never ran.
    expect(advance).not.toHaveBeenCalled();
    expect(turnOf(result.current[0]) - turnOf(before)).toBeGreaterThanOrEqual(1);
    expect(turnOf(result.current[0]) - turnOf(before)).toBeLessThanOrEqual(3);
    expect(result.current[0].stoppedBecause).not.toBeNull();
  });

  // Each of these plays steps of the real engine, each after a paint: under the whole suite's load,
  // longer than waitFor's second and the default 5 s (DL-164).
  test('a fast forward is steps of at most 30 Turns, each settled after the step before it is rendered', { timeout: 30_000 }, async () => {
    const engine = await vi.importActual<typeof Engine>('@heroesim/engine');
    const { result } = renderHook(() => useGame(withRosterReleased(started('use-game-test'))), { wrapper: StrictMode });
    // What the page had rendered of the fast forward as each step began: how far it had come.
    const rendered: (number | null)[] = [];
    vi.mocked(fastForward).mockImplementation((...args) => {
      rendered.push(result.current[0].forwarding?.turnsPlayed ?? null);
      return engine.fastForward(...args);
    });
    try {
      act(() => result.current[1]({ kind: 'fastForward', until: [], maxTurns: 3 * fastForwardStepTurns }));
      expect(result.current[0]).toMatchObject({ busy: true, forwarding: null });
      expect(fastForward).not.toHaveBeenCalled();

      // Three steps of the real engine, each after a paint: longer than waitFor's second under load.
      await waitFor(() => expect(result.current[0].busy).toBe(false), { timeout: 20_000 });

      expect(vi.mocked(fastForward).mock.calls.map(([, options]) => options.maxTurns)).toEqual([30, 30, 30]);
      expect(rendered).toEqual([null, 30, 60]);
      expect(result.current[0]).toMatchObject({ forwarding: null, stoppedBecause: { kind: 'max-turns' } });
    } finally {
      vi.mocked(fastForward).mockImplementation(engine.fastForward);
    }
  });

  test('a Stop between steps is taken at once, while busy, and no step runs after it', async () => {
    const { result } = renderHook(() => useGame(withRosterReleased(started('use-game-test'))), { wrapper: StrictMode });

    act(() => result.current[1]({ kind: 'fastForward', until: [] }));
    await waitFor(() => expect(result.current[0].forwarding).not.toBeNull());
    act(() => result.current[1]({ kind: 'stop' }));

    const stopped = result.current[0];
    const calls = vi.mocked(fastForward).mock.calls.length;
    expect(stopped).toMatchObject({ busy: false, pending: null, forwarding: null });
    expect(stopped.stopped?.turnsPlayed).toBe(calls * fastForwardStepTurns);
    // Any settle already asked for comes due, and finds nothing to play.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fastForward).toHaveBeenCalledTimes(calls);
    expect(result.current[0]).toBe(stopped);
  });

  test('a fast forward asked for again straight after a Stop is settled a step a render, the settle asked for before the Stop called off', { timeout: 30_000 }, async () => {
    const engine = await vi.importActual<typeof Engine>('@heroesim/engine');
    const { result } = renderHook(() => useGame(withRosterReleased(started('use-game-test'))), { wrapper: StrictMode });
    act(() => result.current[1]({ kind: 'fastForward', until: [] }));
    await waitFor(() => expect(result.current[0].forwarding).not.toBeNull());

    const rendered: (number | null)[] = [];
    vi.mocked(fastForward).mockImplementation((...args) => {
      rendered.push(result.current[0].forwarding?.turnsPlayed ?? null);
      return engine.fastForward(...args);
    });
    try {
      act(() => {
        result.current[1]({ kind: 'stop' });
        result.current[1]({ kind: 'fastForward', until: [], maxTurns: 3 * fastForwardStepTurns });
      });
      // Three steps of the real engine, each after a paint, as above.
      await waitFor(() => expect(result.current[0].busy).toBe(false), { timeout: 20_000 });

      expect(rendered).toEqual([null, 30, 60]);
    } finally {
      vi.mocked(fastForward).mockImplementation(engine.fastForward);
    }
  });

  // The same, when the settle asked for before the Stop is waiting as a task, not a frame: where
  // frames fire at once, so each settle waits as a task after its frame, and where there are none
  // (DL-97). jsdom has frames, so neither way is taken above.
  test.each([
    ['frames that fire at once', (callback: FrameRequestCallback) => (callback(0), 1)],
    ['no frames', undefined],
  ])('with %s, a settle asked for before a Stop is called off as well', { timeout: 30_000 }, async (_frames, frame) => {
    vi.stubGlobal('requestAnimationFrame', frame);
    const engine = await vi.importActual<typeof Engine>('@heroesim/engine');
    const { result } = renderHook(() => useGame(withRosterReleased(started('use-game-test'))), { wrapper: StrictMode });
    act(() => result.current[1]({ kind: 'fastForward', until: [] }));
    await waitFor(() => expect(result.current[0].forwarding).not.toBeNull());

    const rendered: (number | null)[] = [];
    vi.mocked(fastForward).mockImplementation((...args) => {
      rendered.push(result.current[0].forwarding?.turnsPlayed ?? null);
      return engine.fastForward(...args);
    });
    try {
      act(() => {
        result.current[1]({ kind: 'stop' });
        result.current[1]({ kind: 'fastForward', until: [], maxTurns: 3 * fastForwardStepTurns });
      });
      // Three steps of the real engine, each after a paint, as above.
      await waitFor(() => expect(result.current[0].busy).toBe(false), { timeout: 20_000 });

      expect(rendered).toEqual([null, 30, 60]);
    } finally {
      vi.mocked(fastForward).mockImplementation(engine.fastForward);
    }
  });

  test('a refusal is stored, not thrown, and dismissed', async () => {
    const { result } = await startedGame();

    act(() => result.current[1]({ kind: 'rebase' }));
    await waitFor(() => expect(result.current[0].busy).toBe(false));
    expect(result.current[0].rejection).toMatchObject({ action: 'rebase', reason: 'already-current' });

    act(() => result.current[1]({ kind: 'dismiss' }));
    expect(result.current[0].rejection).toBeNull();
  });
});
