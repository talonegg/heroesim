import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cameHome, namesakes, started, withNamesakesHurt } from '../state/game.test-support';
import { headerView } from '../state/selectors';
import { GuildView } from './guild';

// The home view's outcome cards (M9-S3, DL-103). A Hero's name is not unique (`drawPersonName`
// avoids no name in use), so each death and Injury on a card is its own line, keyed by its Hero
// (the M9 review).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a Party that came home', () => {
  test('shows each of two Heroes of one name who died, and each of two injured, as a line of its own', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = withNamesakesHurt(cameHome(started('reducer-test')));
    if (state.document === null) throw new Error('no game in hand');
    const header = headerView(state.document);
    if (header === null) throw new Error("no player's Guild");

    render(
      <GuildView
        state={state}
        document={state.document}
        header={header}
        notice={null}
        stop={null}
        busy={false}
        play={vi.fn()}
        onGo={vi.fn()}
        onOpenQuest={vi.fn()}
        onOpenMenu={vi.fn()}
      />,
    );

    const [card] = screen.getAllByRole('listitem').filter((item) => item.classList.contains('outcome'));
    if (card === undefined) throw new Error('no outcome shown');
    expect(within(card).getAllByText(`${namesakes.diedName} died on the Quest`)).toHaveLength(2);
    expect(within(card).getAllByText(new RegExp(`^${namesakes.injuredName}: `))).toHaveLength(2);
    // React says so when two lines share a key: none do.
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });
});
