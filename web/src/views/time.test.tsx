import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StopView } from '../state/selectors';
import { Time } from './time';

// The Time section's "Fast forward again" (v1.0.1-S5, DL-96 item 5): after the player's Stop it
// asks for the stops the stopped fast forward was asked for, `pool-refreshed` among them; after a
// year's `max-turns` it asks for none, as before (v1.0.1-S6, DL-97).

afterEach(cleanup);

/** The section after `stop`, idle, and the plays its buttons send. */
function after(stop: StopView): ReturnType<typeof vi.fn> {
  const play = vi.fn();
  render(<Time busy={false} playing={false} ended={false} progress={null} stop={stop} play={play} goTo={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fast forward again' }));
  return play;
}

describe('"Fast forward again"', () => {
  test("after the player's Stop asks for the stops the stopped fast forward was asked for", () => {
    const play = after({ kind: 'player', sentence: 'Stopped: you asked to stop, after 30 Turns.', until: ['pool-refreshed'] });

    expect(play).toHaveBeenCalledWith({ kind: 'fastForward', until: ['pool-refreshed'] });
  });

  test('after a year played to its end asks for none', () => {
    const play = after({ kind: 'max-turns', sentence: 'Stopped: played the most Turns allowed, 1080.' });

    expect(play).toHaveBeenCalledWith({ kind: 'fastForward', until: [] });
  });
});
