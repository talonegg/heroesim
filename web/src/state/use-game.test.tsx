import type * as Engine from '@heroesim/engine';
import { advance, fastForward } from '@heroesim/engine';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useGame, type GameState, type Play } from './reducer';

// The reducer wired to React (M7-S2): a play is accepted at once, the busy state is committed and
// painted, and only then does the engine run, once, however many taps arrived meanwhile. Rendered
// under StrictMode, which calls a component's reducer twice: the engine must still run once, and
// the shared History take each Turn's events once (ADR-0008).
vi.mock('@heroesim/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof Engine>();
  return { ...engine, advance: vi.fn(engine.advance), fastForward: vi.fn(engine.fastForward) };
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

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

  test('a tap after the first has settled is taken', async () => {
    const { result } = await startedGame();
    const before = result.current[0];

    act(() => result.current[1]({ kind: 'advance' }));
    await waitFor(() => expect(result.current[0].busy).toBe(false));
    act(() => result.current[1]({ kind: 'advance' }));
    await waitFor(() => expect(result.current[0].busy).toBe(false));

    expect(advance).toHaveBeenCalledTimes(2);
    expect(turnOf(result.current[0])).toBe(turnOf(before) + 2);
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
