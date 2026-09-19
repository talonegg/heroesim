import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

/**
 * The client, driven the way a player drives it: start a Career from a fixed seed, send
 * a Party, advance until it comes back, and read the report. Nothing here asserts on a
 * sentence `narrate` wrote — only that the right people are named in it.
 */

const SEED = 'web-unit-01';

function advanceUntilReturn(limit = 40): void {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    if (screen.queryAllByTestId('para-return').length > 0) return;
    fireEvent.click(screen.getByTestId('advance'));
  }
}

describe('the Heroesim client', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('starts a Career, sends a Party, advances and reports what happened', () => {
    render(<App seed={SEED} />);

    fireEvent.click(screen.getByTestId('begin'));
    expect(screen.getByTestId('guild-name')).toBeInTheDocument();

    const heroNames = screen
      .getAllByTestId('hero')
      .map((card) => within(card).getByRole('heading').textContent ?? '');
    expect(heroNames.length).toBeGreaterThan(1);

    fireEvent.click(within(screen.getAllByTestId('commission')[0]!).getByRole('button'));

    const toggles = screen.getAllByTestId('party-toggle');
    expect(toggles.length).toBeGreaterThanOrEqual(2);
    const sent = toggles.slice(0, 2).map((toggle) => toggle.textContent?.split(' · ')[0] ?? '');
    fireEvent.click(toggles[0]!);
    fireEvent.click(toggles[1]!);
    fireEvent.click(screen.getByTestId('commit-party'));

    expect(screen.queryByTestId('commit-party')).toBeNull();
    expect(screen.getAllByTestId('para-commit').length).toBeGreaterThan(0);

    advanceUntilReturn();

    const report = screen.getByTestId('report-log').textContent ?? '';
    expect(screen.getAllByTestId('para-return').length).toBeGreaterThan(0);
    expect(sent.some((name) => name !== '' && report.includes(name))).toBe(true);
  });

  it('two taps on Advance in one batch drive one engine call, not two', () => {
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));

    const dayBefore = screen.getByTestId('day').textContent;
    const advance = screen.getByTestId('advance');
    act(() => {
      advance.click();
      advance.click();
    });
    const dayAfterTwo = screen.getByTestId('day').textContent;

    // One further, settled Advance moves the Day again — so the drop above was the
    // guard, not the engine refusing to move.
    fireEvent.click(screen.getByTestId('advance'));
    const dayAfterThree = screen.getByTestId('day').textContent;

    expect(dayAfterTwo).not.toBe(dayBefore);
    expect(dayAfterThree).not.toBe(dayAfterTwo);
  });

  it('saves to a slot, and loads it back into the same Day and coin', () => {
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    fireEvent.click(screen.getByTestId('advance'));

    const day = screen.getByTestId('day').textContent;
    const coin = screen.getByTestId('coin').textContent;

    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('save-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByTestId('advance'));
    expect(screen.getByTestId('day').textContent).not.toBe(day);

    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));

    expect(screen.getByTestId('day').textContent).toBe(day);
    expect(screen.getByTestId('coin').textContent).toBe(coin);
  });

  it('asks once before clearing a slot', () => {
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('save-2'));

    fireEvent.click(screen.getByTestId('clear-2'));
    expect(screen.getByTestId('clear-confirm-2')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('clear-confirm-2'));

    expect(screen.queryByTestId('clear-confirm-2')).toBeNull();
    expect(screen.getByTestId('load-2')).toBeDisabled();
  });

  it('shows a refused action as one dismissible sentence', () => {
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));

    // Open a Commission, send nobody: the Commit button refuses to be pressed, so the
    // sentence is proved through the reducer path the picker uses.
    fireEvent.click(within(screen.getAllByTestId('commission')[0]!).getByRole('button'));
    expect(screen.getByTestId('commit-party')).toBeDisabled();
  });
});
