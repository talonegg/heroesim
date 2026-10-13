import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { changed, documentOf, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { Hall } from './hall';
import { silverOf } from './page.test-support';

// The Hall redesigned (DL-106; the review's B9): each facility one row with its grade as pips
// and the cost on its button. The Upkeep sentence above them left for the Treasury (DL-116). A part of the Guild (DL-115):
// the part alone is rendered here, and its tab in the Guild is `guild.test.tsx`'s; the Guildmaster and the Market left it
// for views of their own (`guildmaster.test.tsx`, `market.test.tsx`).

afterEach(cleanup);

/** The Hall part alone, on the game in `state`. */
function renderHall(state: GameState): void {
  render(<Hall document={documentOf(state)} busy={false} play={vi.fn()} />);
}

/** The Hall's facility rows, by their names. */
function facility(name: string): HTMLElement {
  const row = screen
    .getAllByTestId('facility')
    .find((each) => each.textContent?.startsWith(name) === true);
  if (row === undefined) throw new Error(`no ${name}`);
  return row;
}

describe("the Hall's facilities (the review's B9)", () => {
  test('are one row each: the grade as pips to the top grade, its upkeep in coins, what it does, and Build with its cost', () => {
    renderHall(
      changed(started(), (_, player) => {
        player.hall.infirmary = 1;
        player.hall.quarters = 3;
      }),
    );

    expect(screen.getAllByTestId('facility')).toHaveLength(3);
    const infirmary = facility('Infirmary');
    const pips = within(infirmary).getByRole('img', { name: 'Grade 1 of 3' });
    expect(pips.textContent).toBe('●○○');
    expect(within(infirmary).getByText('Sickroom')).toBeDefined();
    expect(within(infirmary).getByText('The infirmary shortens the Days an Injury takes to heal.')).toBeDefined();
    const build = within(infirmary).getByRole('button', { name: 'Build Infirmary ward for 5 Gold' });
    expect(build.textContent).toMatch(/^Build Infirmary ward · /);
    expect(silverOf(build)).toBe(500);
    expect(within(facility('Training yard')).getByRole('img', { name: 'Grade 0 of 3' }).textContent).toBe('○○○');
    // At the top grade, no button.
    const quarters = facility('Quarters');
    expect(within(quarters).getByRole('img', { name: 'Grade 3 of 3' }).textContent).toBe('●●●');
    expect(within(quarters).getByText('At the top grade')).toBeDefined();
    expect(within(quarters).queryByRole('button')).toBeNull();
    // Each Facility gives its upkeep at its grade in coins (DL-294 item 3, DL-298).
    const upkeepOf = (el: HTMLElement): HTMLElement => within(el).getByText((_, node) => node?.classList.contains('subtle') === true && node.textContent?.startsWith('Upkeep') === true);
    expect(silverOf(upkeepOf(infirmary))).toBe(10);
    expect(silverOf(upkeepOf(facility('Training yard')))).toBe(0);
    expect(silverOf(upkeepOf(quarters))).toBe(30);
  });
});
