import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Hall redesigned (DL-106; the review's B9): each facility one row with its grade as pips
// and the cost on its button. The Upkeep sentence above them left for the Treasury (DL-116). A part of the Guild (DL-115), its
// tab's panel; the Guildmaster and the Market left it for views of their own
// (`guildmaster.test.tsx`, `market.test.tsx`).

afterEach(cleanup);

function render_(state: GameState): void {
  render(<App initial={state} />);
}

/** The Hall's facility rows, by their names. */
function facility(name: string): HTMLElement {
  const row = within(section('Hall'))
    .getAllByTestId('facility')
    .find((each) => each.textContent?.startsWith(name) === true);
  if (row === undefined) throw new Error(`no ${name}`);
  return row;
}

describe("the Hall's facilities (the review's B9)", () => {
  test('are one row each: the grade as pips to the top grade, what it does, and Build with its cost; the Upkeep is not here', () => {
    render_(
      changed(started(), (_, player) => {
        player.hall.infirmary = 1;
        player.hall.quarters = 3;
      }),
    );

    expect(within(section('Hall')).getAllByTestId('facility')).toHaveLength(3);
    const infirmary = facility('Infirmary');
    const pips = within(infirmary).getByRole('img', { name: 'Grade 1 of 3' });
    expect(pips.textContent).toBe('●○○');
    expect(within(infirmary).getByText('Sickroom')).toBeDefined();
    expect(within(infirmary).getByText('The infirmary shortens the Days an Injury takes to heal.')).toBeDefined();
    expect(within(infirmary).getByRole('button', { name: 'Build Infirmary ward for 500 Wealth' }).textContent).toBe('Build Infirmary ward · 500');
    expect(within(facility('Training yard')).getByRole('img', { name: 'Grade 0 of 3' }).textContent).toBe('○○○');
    // At the top grade, no button.
    const quarters = facility('Quarters');
    expect(within(quarters).getByRole('img', { name: 'Grade 3 of 3' }).textContent).toBe('●●●');
    expect(within(quarters).getByText('At the top grade')).toBeDefined();
    expect(within(quarters).queryByRole('button')).toBeNull();
    // The Upkeep sentence left the Hall for the Treasury (DL-112 item 6).
    expect(within(section('Hall')).queryByText(/Upkeep/)).toBeNull();
  });
});
