import type { HeroId, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { gameReducer, initialGameState, type GameState, type Play } from '../state/reducer';
import { HeroPage } from './hero-page';

// M7-S3's third box: `show hero`'s rule holds in the browser. Potential is never rendered (data-model
// rule 9, M3-S3): every Hero's Potential is set to numbers found nowhere else, each Hero's page is
// rendered, and the rendered DOM, text and attributes alike, is searched for them and for the word.

afterEach(cleanup);

/** A number no view shows by chance: far beyond any Stat, Wealth, Day or count in a young game. */
const sentinelBase = 900_001;

function played(state: GameState, action: Play): GameState {
  return gameReducer(gameReducer(state, action), { kind: 'settle' });
}

/** A game a fortnight in, every Hero's Potential replaced by sentinels; and the sentinels. */
function withSentinels(): { state: GameState; sentinels: string[] } {
  let state = played(initialGameState, {
    kind: 'newGame',
    seed: 'hints-only',
    guildName: 'The Lantern',
    guildmasterName: 'Ada Vell',
    createdAt: '2026-09-27T09:00:00.000Z',
  });
  state = played(state, { kind: 'advance', turns: 42 });
  const document = state.document as WorldDocument;
  const world = structuredClone(document.world);
  const sentinels: string[] = [];
  for (const hero of Object.values(world.heroes)) {
    for (const key of Object.keys(hero.potential)) {
      const sentinel = sentinelBase + sentinels.length;
      hero.potential[key] = sentinel;
      sentinels.push(String(sentinel));
    }
  }
  return { state: { ...state, document: { ...document, world } }, sentinels };
}

/** What the rendered DOM shows of Potential: each sentinel found, and the word itself. */
function potentialIn(html: string, sentinels: readonly string[]): string[] {
  return [...sentinels.filter((sentinel) => html.includes(sentinel)), ...(/potential/i.test(html) ? ['the word Potential'] : [])];
}

describe('Potential is never rendered', () => {
  test("on any page of the player's Roster, opened from the page, text and attributes alike", () => {
    const { state, sentinels } = withSentinels();
    const { container } = render(<App initial={state} />);
    const names = within(screen.getByRole('region', { name: 'Roster' }))
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      fireEvent.click(within(screen.getByRole('region', { name: 'Roster' })).getByRole('button', { name }));
      const page = within(screen.getByRole('region', { name: 'Roster' })).getByRole('article');
      expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe(name);

      // The hint is there, a word for each Stat; the number is not, anywhere on the page.
      expect(within(page).getByRole('columnheader', { name: 'Outlook' })).toBeDefined();
      expect(within(page).getAllByText(/^(modest|promising|exceptional)$/).length).toBeGreaterThan(10);
      expect(potentialIn(container.innerHTML, sentinels)).toEqual([]);

      // Every page of the Hero's History too.
      while (!(within(page).getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled) {
        fireEvent.click(within(page).getByRole('button', { name: 'Older' }));
        expect(potentialIn(container.innerHTML, sentinels)).toEqual([]);
      }
      fireEvent.click(within(page).getByRole('button', { name: 'Back to the Roster' }));
    }
  });

  test('on the page of every Hero in the world: on a Rival\'s Roster, in the Unattached pool, dead or departed', () => {
    const { state, sentinels } = withSentinels();
    const document = state.document as WorldDocument;
    const heroIds = Object.keys(document.world.heroes) as HeroId[];
    expect(heroIds.length).toBeGreaterThan(20);

    for (const heroId of heroIds) {
      const { container, unmount } = render(<HeroPage document={document} heroId={heroId} />);
      expect(within(container).getByRole('heading', { level: 3 }).textContent).toBe(document.world.heroes[heroId]?.name);
      expect(potentialIn(container.innerHTML, sentinels)).toEqual([]);
      unmount();
    }
  });

  test('the search finds a Potential that is rendered: it would catch a view that leaked one', () => {
    const { state, sentinels } = withSentinels();
    const hero = Object.values((state.document as WorldDocument).world.heroes)[0];
    const leaked = Object.values(hero?.potential ?? {})[0];
    const { container } = render(
      <p title={`Potential ${leaked}`}>
        <span>{leaked}</span>
      </p>,
    );

    expect(potentialIn(container.innerHTML, sentinels)).toEqual([String(leaked), 'the word Potential']);
  });
});
