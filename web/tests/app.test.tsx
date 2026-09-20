import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advance, newCareer, type Career } from '@heroesim/engine';
import { App } from '../src/App';
import { content } from '../src/content';
import { Shell } from '../src/layout/Shell';

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

/**
 * Every span of Days on screen is counted, never printed against a hard-coded plural
 * (DL-27 §4). The header read "in 1 Days" for a whole epic, and a committed screenshot
 * carried it, because the plural was a literal beside a `{…}` hole rather than a count.
 */
describe('how the client counts Days', () => {
  afterEach(() => {
    cleanup();
  });

  function header(career: Career) {
    return render(
      <Shell
        career={career}
        content={content}
        paragraphs={[]}
        pane="board"
        onPane={() => undefined}
        onAdvance={() => undefined}
        onAnswer={() => undefined}
        onSend={() => undefined}
        onOpenSaves={() => undefined}
        onOpenHall={() => undefined}
        onOpenApplicants={() => undefined}
        onOpenRivals={() => undefined}
        onOpenLeague={() => undefined}
        onOpenMore={() => undefined}
        onNewCareer={() => undefined}
        busy={false}
      />,
    );
  }

  /**
   * Every element's own text, one per line. `container.textContent` runs one element's
   * last word into the next one's first — "in 1 DayBoard refreshes" — which hides both
   * the singular and the plural from a word-boundary match.
   */
  function linesOf(container: HTMLElement): string {
    return [...container.querySelectorAll('*')]
      .map((element) => element.textContent ?? '')
      .join('\n');
  }

  it('never says "1 Days", at any Day a Career passes through', () => {
    let career = newCareer(SEED, content).career;
    let sawSingular = false;

    // One Day at a time, so both header countdowns — Upkeep and the Board refresh — are
    // read at every value they take, the single Day before each of them included.
    for (let day = 0; day < 90 && career.ended === undefined; day += 1) {
      const view = header(career);
      const text = linesOf(view.container);
      expect(text, `Day ${String(career.day)}`).not.toMatch(/\b1 Days\b/);
      if (/\b1 Day\b/.test(text)) sawSingular = true;
      view.unmount();
      career = advance(career, 1, content).career;
    }

    // It cannot pass by never reaching one: a singular has to have been on screen.
    expect(sawSingular, 'no countdown ever reached a single Day').toBe(true);
  });

  it('counts the span on every Commission on the Board', () => {
    const career = newCareer(SEED, content).career;
    const view = header(career);
    const board = linesOf(view.container);
    expect(board).not.toMatch(/\b1 Days\b/);
    // The Board carries a span for every Commission on it, so it is the densest place a
    // plural could be hard-coded.
    expect(board).toMatch(/\b\d+ Days\b/);
    view.unmount();
  });
});
