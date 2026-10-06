import type { QuestId } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StopView } from '../state/selectors';
import { StopCard } from './stop';

// Why time stopped, in the home view (M9-S3, DL-103). "Fast forward again" (v1.0.1-S5, DL-96 item
// 5): after the player's Stop it asks for the stops the stopped fast forward was asked for,
// `pool-refreshed` among them; after a year's `max-turns` it asks for none, as before (v1.0.1-S6,
// DL-97). A decision needed makes each Quest it names a button to its Party.

afterEach(cleanup);

/** The card for `stop`, idle, and the calls its buttons make. */
function card(stop: StopView) {
  const play = vi.fn();
  const onGo = vi.fn();
  const onOpenQuest = vi.fn();
  render(<StopCard stop={stop} idle={false} play={play} onGo={onGo} onOpenQuest={onOpenQuest} />);
  return { play, onGo, onOpenQuest };
}

describe('"Fast forward again"', () => {
  test("after the player's Stop asks for the stops the stopped fast forward was asked for", () => {
    const { play } = card({ kind: 'player', sentence: 'Stopped: you asked to stop, after 30 Turns.', until: ['pool-refreshed'] });
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward again' }));

    expect(play).toHaveBeenCalledWith({ kind: 'fastForward', until: ['pool-refreshed'] });
  });

  test('after a year played to its end asks for none', () => {
    const { play } = card({ kind: 'max-turns', sentence: 'Stopped: played the most Turns allowed, 1080.' });
    fireEvent.click(screen.getByRole('button', { name: 'Fast forward again' }));

    expect(play).toHaveBeenCalledWith({ kind: 'fastForward', until: [] });
  });
});

describe('a decision needed', () => {
  const sentence = 'Stopped: a decision is needed: The Lantern has no Party out, and could send one on Clear the barrow and Clear the barrow.';

  test('makes each Quest it names a button to its Party, two of one name told apart by their Patrons and rewards', () => {
    const quests = [
      { questId: 'quest-000001' as QuestId, name: 'Clear the barrow', patron: 'Orabel Quint', reward: 120 },
      { questId: 'quest-000002' as QuestId, name: 'Clear the barrow', patron: 'Piers Latimer', reward: 140 },
    ];
    const { onOpenQuest } = card({ kind: 'decision-needed', sentence, quests });

    fireEvent.click(screen.getByRole('button', { name: 'Choose a Party for Clear the barrow, offered by Piers Latimer, for 140 Wealth' }));

    expect(onOpenQuest).toHaveBeenCalledWith('quest-000002');
    expect(screen.queryByRole('button', { name: 'Open the Board' })).toBeNull();
  });

  test('when none of the Quests it named is still on the Board, opens the Board', () => {
    const { onGo } = card({ kind: 'decision-needed', sentence, quests: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Open the Board' }));

    expect(onGo).toHaveBeenCalledWith('board');
  });
});

describe('the Bankruptcy stop (M9-S7, #32)', () => {
  const sentence = 'Stopped: The Lantern fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 35 unless its Wealth recovers by then.';

  test('is a warning card with the Day Bankruptcy falls on, and says in words what can be done about it', () => {
    card({ kind: 'below-floor', sentence });

    const stop = screen.getByTestId('stop');
    expect(stop.classList.contains('stop--warning')).toBe(true);
    expect(within(stop).getByText(sentence)).toBeDefined();
    expect(stop.textContent).toContain(
      'To stay in business, Wealth must be back to the Bankruptcy floor or more on a night by then, after any Upkeep due.',
    );
    expect(stop.textContent).toContain('Sell what the Guild holds at the Market, or send a Party on a Quest: its reward comes in when it comes home.');
  });

  test("goes to the Market's Sell, and to the Board (DL-109 item 2, Q20, as M9-F2 moves Sell)", () => {
    const { onGo } = card({ kind: 'below-floor', sentence });

    fireEvent.click(screen.getByRole('button', { name: 'Sell what the Guild holds' }));
    expect(onGo).toHaveBeenLastCalledWith('sell');
    fireEvent.click(screen.getByRole('button', { name: 'Open the Board' }));
    expect(onGo).toHaveBeenLastCalledWith('board');
    expect(screen.queryByRole('button', { name: 'Read what happened' })).toBeNull();
  });
});

describe('a Quest to staff (M9-S7, #32)', () => {
  const sentence = "Stopped: a Quest to staff: The Lantern's Heroes at home could go on Clear the barrow.";

  test('makes each Quest it names a button to its Party, as a decision needed does', () => {
    const quests = [{ questId: 'quest-000003' as QuestId, name: 'Clear the barrow', patron: 'Orabel Quint', reward: 120 }];
    const { onOpenQuest } = card({ kind: 'quest-staffable', sentence, quests });

    fireEvent.click(screen.getByRole('button', { name: 'Choose a Party for Clear the barrow, offered by Orabel Quint, for 120 Wealth' }));
    expect(onOpenQuest).toHaveBeenCalledWith('quest-000003');
    expect(screen.getByTestId('stop').classList.contains('stop--warning')).toBe(false);
  });

  test('when none of its Quests is still on the Board, opens the Board', () => {
    const { onGo } = card({ kind: 'quest-staffable', sentence, quests: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Open the Board' }));

    expect(onGo).toHaveBeenCalledWith('board');
  });
});

describe("a Party's return and a module's stop (M9-F5, DL-112 item 8)", () => {
  test('the Party stop offers nothing more: its report is under it on Guild › Home; a module’s stop keeps "Read what happened"', () => {
    card({ kind: 'party-returned', sentence: "Stopped: The Lantern's Party came home." });
    expect(screen.queryByRole('button', { name: 'Read what happened' })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    cleanup();

    const { onGo } = card({ kind: 'module', sentence: 'Stopped: the probe Module asked to stop.' });
    fireEvent.click(screen.getByRole('button', { name: 'Read what happened' }));
    expect(onGo).toHaveBeenCalledWith('history');
  });
});
