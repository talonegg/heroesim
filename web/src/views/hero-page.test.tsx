import type { HeroId, WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../app';
import { withTheGone } from '../state/game.test-support';
import { gameReducer, initialGameState, type GameState, type Play } from '../state/reducer';
import { HeroPage } from './hero-page';
import { closeMenu, openGuildPart, openMenu, openView, rosterList, section, type GuildPartName, type ViewName } from './page.test-support';

// M7-S3's third box: `show hero`'s rule holds in the browser. Potential is never rendered (data-model
// rule 9, M3-S3): every Hero's Potential is set to numbers found nowhere else, each Hero's page is
// rendered, and the rendered DOM, text and attributes alike, is searched for them: the whole page,
// every section of it. A Hero's page is searched for the word too. The page elsewhere may name the
// concept, as the CLI does: the Guildmaster's Judgement bears on "how sharp the Potential hints read"
// (DL-73). The page is views in a shell (M9-S3, DL-103): "the whole page" is every view and the game
// menu, each opened in turn, beside the status bar and the History rail that are always there.

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

/** The sentinels the whole page shows: none, whatever else it says. */
function sentinelsIn(html: string, sentinels: readonly string[]): string[] {
  return sentinels.filter((sentinel) => html.includes(sentinel));
}

/** Opens each Hero listed in `region` by their name, checks their page (its name at `level`) and the whole page, and goes back. */
function everyPageFrom(region: () => HTMLElement, back: string, container: HTMLElement, sentinels: readonly string[], level: 3 | 4): number {
  const names = within(region())
    .getAllByRole('button')
    .filter((button) => button.className === 'link')
    .map((button) => button.textContent ?? '');
  for (const name of names) {
    fireEvent.click(within(region()).getByRole('button', { name }));
    const page = within(region()).getByRole('article');
    expect(within(page).getByRole('heading', { level }).textContent).toBe(name);
    expect(potentialIn(page.outerHTML, sentinels)).toEqual([]);
    expect(sentinelsIn(container.innerHTML, sentinels)).toEqual([]);
    fireEvent.click(within(page).getByRole('button', { name: back }));
  }
  return names.length;
}

/** Every view and the game menu, each opened in turn, searched whole. */
function everyView(container: HTMLElement, sentinels: readonly string[]): void {
  for (const view of ['Guildmaster', 'Guild', 'Roster', 'Board', 'Rankings', 'Market', 'History'] as const satisfies readonly ViewName[]) {
    openView(view);
    expect(sentinelsIn(container.innerHTML, sentinels), view).toEqual([]);
  }
  // Each of the Guild's parts, its tab opened (M9-F2).
  for (const part of ['Home', 'Hall', 'Stores', 'Treasury'] as const satisfies readonly GuildPartName[]) {
    openGuildPart(part);
    expect(sentinelsIn(container.innerHTML, sentinels), `the Guild's ${part}`).toEqual([]);
  }
  openMenu();
  expect(sentinelsIn(globalThis.document.body.innerHTML, sentinels), 'the game menu').toEqual([]);
  closeMenu();
}

// Opening every pool Hero's page and every Rival Hero's page renders the whole page each time:
// about 2 to 4.5 s alone or in the web project, and past Vitest's 5 s default in a full `npm test`
// on a busy machine (M7 verification, DL-74). The timeout bounds a hang, not the speed.
describe('Potential is never rendered', { timeout: 30_000 }, () => {
  test("on any page of the player's Roster, opened from the page, text and attributes alike", () => {
    const { state, sentinels } = withSentinels();
    const { container } = render(<App initial={state} />);
    everyView(container, sentinels);
    const names = within(rosterList())
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      fireEvent.click(within(rosterList()).getByRole('button', { name }));
      const page = within(screen.getByRole('region', { name: 'Roster' })).getByRole('article');
      expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe(name);

      // The hint is there, a word for each Stat; the number is not, anywhere on the page.
      expect(within(page).getAllByTitle('Outlook').length).toBeGreaterThan(10);
      expect(within(page).getAllByText(/^(Modest|Promising|Exceptional)$/).length).toBeGreaterThan(10);
      expect(potentialIn(page.outerHTML, sentinels)).toEqual([]);
      expect(sentinelsIn(container.innerHTML, sentinels)).toEqual([]);

      // Every page of the Hero's History too, its folds among them; a History of one page has no pages to turn (M9-S5).
      const older = (): HTMLButtonElement | null => within(page).queryByRole('button', { name: 'Older' });
      while (older()?.disabled === false) {
        fireEvent.click(within(page).getByRole('button', { name: 'Older' }));
        expect(potentialIn(page.outerHTML, sentinels)).toEqual([]);
        expect(sentinelsIn(container.innerHTML, sentinels)).toEqual([]);
      }
      fireEvent.click(within(page).getByRole('button', { name: 'Back to the Roster' }));
    }
  });

  test("on the page of every Hero in the pool and on every Rival's Roster, opened from the page", () => {
    const { state, sentinels } = withSentinels();
    const { container } = render(<App initial={state} />);
    const pool = (): HTMLElement => section('Unattached pool');
    const guilds = (): HTMLElement => section('Guilds');

    // In a part of a view, a Hero's name is one level below the part's heading (M9-S3).
    expect(everyPageFrom(pool, 'Back to the pool', container, sentinels, 4)).toBeGreaterThan(0);
    let opened = 0;
    const rivals = within(guilds())
      .getAllByRole('button', { name: /^Open / })
      .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
    for (const open of rivals) {
      fireEvent.click(within(guilds()).getByRole('button', { name: open }));
      const guildName = open.replace(/^Open /, '');
      expect(sentinelsIn(container.innerHTML, sentinels)).toEqual([]);
      opened += everyPageFrom(guilds, `Back to ${guildName}`, container, sentinels, 4);
      fireEvent.click(within(guilds()).getByRole('button', { name: 'Back to the Guilds' }));
    }
    expect(rivals.length).toBeGreaterThan(0);
    expect(opened).toBeGreaterThan(0);
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

  test('on the page of a Hero on no Roster and not in the pool, dead or retired, opened from the History (DL-74)', () => {
    const { state: sentinelled, sentinels } = withSentinels();
    const { state, dead, retired } = withTheGone(sentinelled);
    const { container } = render(<App initial={state} />);
    const history = (): HTMLElement => section('History');

    for (const hero of [dead, retired]) {
      fireEvent.change(within(history()).getByRole('searchbox', { name: 'Find someone in the History by name' }), { target: { value: hero.name } });
      fireEvent.click(within(history()).getByRole('button', { name: `Read ${hero.name}` }));
      const page = within(history()).getByRole('article');
      expect(within(page).getByRole('heading', { level: 3 }).textContent).toBe(hero.name);
      expect(within(page).getAllByText(/^(Modest|Promising|Exceptional)$/).length).toBeGreaterThan(10);
      expect(potentialIn(page.outerHTML, sentinels)).toEqual([]);
      expect(sentinelsIn(container.innerHTML, sentinels)).toEqual([]);
      fireEvent.click(within(page).getByRole('button', { name: 'Back to the History of The Lantern' }));
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
