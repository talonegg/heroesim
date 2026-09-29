import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { changed, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section } from './page.test-support';

// The Guildmaster view (M9-F2, DL-111 item 7, DL-112 item 5): the Guildmaster part the Hall view
// held (M9-S6, DL-106; the review's C8), a view of its own at the top of the navigation. The
// Traits with their effects, the descriptive Attributes written, and Regard as chips with the
// neutral folded.

afterEach(cleanup);

function render_(state: GameState): void {
  render(<App initial={state} />);
}

describe('the Guildmaster view (M9-F2)', () => {
  test("is a view with its heading, and gives the player's Guildmaster: name and Guild, Sex and Age, Stats, Traits and Regard", () => {
    render_(started());
    const view = section('Guildmaster');

    expect(within(view).getByRole('heading', { level: 2, name: 'Guildmaster' })).toBeDefined();
    expect(within(view).getByRole('heading', { level: 3, name: 'Ada Vell, Guildmaster of The Lantern' })).toBeDefined();
    const terms = within(view).getAllByRole('term').map((term) => term.textContent);
    expect(terms.slice(0, 2)).toEqual(['Sex', 'Age']);
    expect(within(view).getAllByRole('definition')[0]?.textContent).toMatch(/^(Male|Female)$/);
    expect(within(view).getByRole('heading', { name: 'Stats' })).toBeDefined();
    expect(within(view).getByRole('heading', { name: 'Traits' })).toBeDefined();
    expect(within(view).getByRole('heading', { name: 'Regard' })).toBeDefined();
    expect(within(view).getByRole('button', { name: 'Read the History of Ada Vell' })).toBeDefined();
    // The Hall is not here: it is the Guild's part.
    expect(screen.queryByRole('region', { name: 'Hall' })).toBeNull();
  });

  test('gives the Traits with what each does, the descriptive Attributes written and none left empty, and Regard as chips with the neutral folded', () => {
    const state = changed(started(), (document, player) => {
      const guildmaster = document.world.guildmasters[player.guildmasterId];
      const [patron] = Object.values(document.world.patrons);
      if (guildmaster === undefined || patron === undefined) throw new Error('no Guildmaster or Patron');
      guildmaster.traits = ['thrifty', 'mistrusts-magic'] as never;
      guildmaster.birthplace = 'Harrowgate';
      guildmaster.biography = 'Once a quartermaster of the river levies.';
      guildmaster.regard[patron.id] = { value: 8, since: 0, reason: 'test' };
    });
    render_(state);
    const guildmaster = section('Guildmaster');

    const traits = within(guildmaster).getByRole('list', { name: "Ada Vell's Traits" });
    expect(within(traits).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Thrifty Upkeep ×0.9', 'Mistrusts magic -1 Arcana to Mages']);
    expect(within(guildmaster).getByText('Harrowgate')).toBeDefined();
    expect(within(guildmaster).getByText('Once a quartermaster of the river levies.')).toBeDefined();
    expect(within(guildmaster).getAllByRole('term').map((term) => term.textContent)).toEqual(['Sex', 'Age', 'Birthplace', 'Biography']);
    expect(within(guildmaster).getByRole('rowheader', { name: 'Negotiation' })).toBeDefined();

    const patrons = within(guildmaster).getByRole('list', { name: 'For Patrons' });
    const [warm] = within(patrons).getAllByRole('listitem');
    expect(within(patrons).getAllByRole('listitem')).toHaveLength(1);
    expect(within(warm as HTMLElement).getByText('warm').closest('.chip')?.className).toBe('chip chip--good');
    const counts = within(guildmaster)
      .getAllByText(/^\d+ neutral$/)
      .map((each) => each.textContent);
    expect(counts).toHaveLength(3);
    expect(within(guildmaster).getByRole('list', { name: 'For Patrons, neutral' }).children.length).toBe(Number(/^(\d+)/.exec(counts[0] ?? '')?.[1]));
    // Never a number beside a band.
    for (const item of within(guildmaster).getAllByRole('listitem').filter((each) => each.closest('.regards') !== null)) {
      expect(item.textContent).toMatch(/(hostile|cool|neutral|warm|close)$/);
    }
  });
});

