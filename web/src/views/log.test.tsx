import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { started, withRosterReleased } from '../state/game.test-support';
import { gameReducer } from '../state/reducer';
import { logView } from '../state/selectors';
import { Log } from './log';

// The log reads its lines again only when the game in hand or the log changes, and so not at each
// step of a fast forward, which changes neither until it ends (v1.0.1-S5, DL-96 item 3): read at
// every step, a year's log from the play before would be narrated again 36 times (v1.0.1-S6, DL-97).
vi.mock('../state/selectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/selectors')>();
  return { ...actual, logView: vi.fn(actual.logView) };
});

afterEach(cleanup);

test('reads its lines again when the game or the log changes, not at each step of a fast forward', () => {
  const first = gameReducer(gameReducer(withRosterReleased(started()), { kind: 'fastForward', until: [] }), { kind: 'settle' });
  const second = gameReducer(first, { kind: 'settle' });
  expect(second.forwarding?.turnsPlayed).toBe(60);
  expect(second.document).toBe(first.document);
  expect(second.log).toBe(first.log);

  const { rerender } = render(<Log state={first} guildName="The Lantern" />);
  const reads = vi.mocked(logView).mock.calls.length;
  rerender(<Log state={second} guildName="The Lantern" />);

  expect(vi.mocked(logView).mock.calls.length).toBe(reads);

  // Stopped, the game and the log are the steps': read again.
  rerender(<Log state={gameReducer(second, { kind: 'stop' })} guildName="The Lantern" />);

  expect(vi.mocked(logView).mock.calls.length).toBe(reads + 1);
});
