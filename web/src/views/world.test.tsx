import type { GuildId, HeroId, ModuleEvent, OfferId, StopReason } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { saveText } from '../state/game-file';
import { changed, played, started, withOffer, withOlderRules, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { inHistory, openView, section, seedShown } from './page.test-support';

// The views of the wider world and the game as a file (M7-S3 part 2, DL-73): the CLI's `show
// rankings`, `show guilds`, `show roster|hall|guildmaster <guildId>`, `show guildmaster`, `show
// patrons`, `rebase`, `save --as` and `load`, driven through the page's controls. Each region is
// found by opening its view, or the game menu, first (M9-S3, DL-103). The History's are in
// `history.test.tsx` (M9-S5).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

/** The Guilds' table, which holds the Rankings (M9-S6, DL-106; the review's B4). */
function guildsTable(): HTMLElement {
  return within(section('Guilds')).getByRole('table', { name: 'Every Guild, and the Rankings' });
}

/** Each Guild's row as its cells say it: Place, Disposition, Fame, Wealth, Heroes, Upkeep, after its name. */
function guildRows(): string[][] {
  return within(guildsTable())
    .getAllByTestId('guild-row')
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent ?? ''));
}

describe('the Rankings', () => {
  test('rank the Guilds in play by Fame, or by Wealth when its heading is chosen, in one table with the Guilds', () => {
    render_(played(started(), { kind: 'advance', turns: 6 }));
    expect(within(guildsTable()).getByRole('columnheader', { name: 'Fame' }).getAttribute('aria-sort')).toBe('descending');
    expect(within(guildsTable()).getByRole('columnheader', { name: 'Place by Fame' })).toBeDefined();

    fireEvent.click(within(guildsTable()).getByRole('button', { name: 'Order by Wealth' }));

    expect(within(guildsTable()).getByRole('columnheader', { name: 'Wealth' }).getAttribute('aria-sort')).toBe('descending');
    expect(within(guildsTable()).getByRole('columnheader', { name: 'Fame' }).getAttribute('aria-sort')).toBeNull();
    expect(within(guildsTable()).getByRole('columnheader', { name: 'Place by Wealth' })).toBeDefined();
    const rows = guildRows();
    expect(rows).toHaveLength(5);
    expect(rows.map(([place]) => place)).toEqual(['1st', '2nd', '3rd', '4th', '5th']);
    const values = rows.map((row) => Number(row[3]));
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect(within(guildsTable()).getByRole('button', { name: 'Open The Lantern' })).toBeDefined();
  });
});

describe('shared places and the Bankruptcy countdown (v1.0.1-S4, DL-95)', () => {
  test('a new game, every Guild at Fame 0, is joint 1st on each row of the Rankings and in the header', () => {
    render_(started());

    expect(guildRows().map(([place]) => place)).toEqual(Array(5).fill('Joint 1st'));
    expect(screen.getByTestId('rankings').textContent).toBe('Joint 1st of 5 by Fame');
  });

  /** The Lantern below the floor from the start, played through the night of the engine's Day 0, Year 1 Day 1, under `grace` Days. */
  function belowTheFloor(grace?: number): GameState {
    const rules =
      grace === undefined
        ? started()
        : changed(started(), (document) => {
            document.meta.config = { ...document.meta.config, bankruptcyGraceDays: grace };
          });
    return played(withWealth(rules, -1), { kind: 'advance', turns: 2 });
  }

  /** The countdown from the engine's Day, counted from 0; the words count from 1 (DL-210). */
  const countdown = (dueDay: number) =>
    `The Lantern has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day ${dueDay + 1} ` +
    'unless Wealth is back to 0 or more on a night by then, after any Upkeep due.';

  /** The countdown as the status bar's pill says it, and in full in the home view (M9-S3, DL-103). */
  function shown(dueDay: number): void {
    expect(within(screen.getByRole('banner')).getByTestId('countdown').textContent).toBe(`Bankruptcy on the night of Year 1 Day ${dueDay + 1}`);
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByText(countdown(dueDay))).toBeDefined();
  }

  test("the status bar shows the countdown only while the player's Guild is below the floor, from the game's own grace, and the home view says it in full", () => {
    render_(played(started(), { kind: 'advance', turns: 2 }));
    expect(screen.queryByTestId('countdown')).toBeNull();
    cleanup();

    render_(belowTheFloor());
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 1, night');
    shown(30);
    cleanup();

    render_(belowTheFloor(10));
    shown(10);
    // The pill opens the home view, from any other.
    openView('Board');
    fireEvent.click(screen.getByTestId('countdown'));
    shown(10);
  });

  test("stays after Wealth rises during a Day, and goes at that night's check", () => {
    const risen = withWealth(belowTheFloor(10), 1_000);
    render_(risen);
    shown(10);
    cleanup();

    render_(played(risen, { kind: 'advance', turns: 3 }));
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 2, night');
    expect(screen.queryByTestId('countdown')).toBeNull();
  });
});

describe('the Guilds', () => {
  test("list every Guild, and open a Rival's page: its Roster with fees, its Hall, its Guildmaster", () => {
    render_(started());
    const guilds = section('Guilds');
    expect(within(guilds).getAllByTestId('guild-row')).toHaveLength(5);
    expect(within(guilds).getByText('The Ashford Guild')).toBeDefined();

    fireEvent.click(within(guilds).getByRole('button', { name: 'Open The Ashford Guild' }));

    const page = within(section('Guilds')).getByRole('article');
    // Under the Guilds' heading, a part of the Rankings view (M9-S3): its levels one below.
    expect(within(page).getByRole('heading', { level: 4, name: 'The Ashford Guild' })).toBeDefined();
    const fees = within(page).getAllByTestId('fee').map((cell) => cell.textContent ?? '');
    expect(fees.length).toBeGreaterThan(0);
    for (const fee of fees) expect(fee).toMatch(/^\d+$/);
    // Its Hall and Guildmaster folded (M9-S6, the review's B10).
    expect(within(page).getAllByRole('img', { name: 'Grade 0 of 3' })).toHaveLength(3);
    expect(within(page).queryByRole('button', { name: /^Build / })).toBeNull();
    expect(within(page).getByRole('heading', { level: 5, name: /, Guildmaster of The Ashford Guild$/ })).toBeDefined();

    fireEvent.click(within(page).getByRole('button', { name: 'Back to the Guilds' }));
    expect(within(section('Guilds')).queryByRole('article')).toBeNull();
  });
});

describe('the Guildmaster and the Patrons', () => {
  test("show the player's Guildmaster's Stats and what each bears on, and Regard as bands", () => {
    render_(started());
    const guildmaster = section('Guildmaster');

    expect(within(guildmaster).getByRole('heading', { level: 3, name: 'Ada Vell, Guildmaster of The Lantern' })).toBeDefined();
    expect(within(guildmaster).getByRole('rowheader', { name: 'Negotiation' })).toBeDefined();
    expect(within(guildmaster).getByText('The reward agreed and the fees paid')).toBeDefined();
    // Regard as bands, never numbers: a new game's are neutral, folded under their counts (M9-S6).
    for (const list of within(guildmaster).getAllByRole('list').filter((each) => each.className.startsWith('regards'))) {
      for (const item of within(list).getAllByRole('listitem')) expect(item.textContent).toMatch(/(Hostile|Cool|Neutral|Warm|Close)$/);
    }
    expect(within(guildmaster).getAllByText(/^\d+ neutral$/)).toHaveLength(3);
    // A new game's Patrons are neutral both ways: folded under their count, until opened.
    const fold = within(section('Patrons')).getByRole('button', { name: /^\d+ neutral$/ });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fold);
    const patrons = within(section('Patrons')).getAllByTestId('patron');
    expect(patrons.length).toBe(Number(/^(\d+)/.exec(fold.textContent ?? '')?.[1]));
    for (const patron of patrons) {
      const [, theirs, yours] = within(patron)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? '');
      expect([theirs, yours]).toEqual(['Neutral', 'Neutral']);
    }
    // Each opens their History (M9-S5).
    for (const patron of patrons) expect(within(patron).getByRole('button', { name: /^Read the History of .+$/ })).toBeDefined();
  });
});

describe('new rules', () => {
  test('are offered while the game plays under older ones, and adopting them is recorded', async () => {
    const state = withOlderRules(started(), 2);
    render_(state);
    const notice = section('New rules available');
    const [from, to] = /configVersion (\d+); this release’s rules are configVersion (\d+)/.exec(notice.textContent ?? '')?.slice(1) ?? [];
    expect(Number(to) - Number(from)).toBe(2);

    fireEvent.click(within(notice).getByRole('button', { name: 'Adopt the new rules' }));
    await idle();

    expect(screen.queryByRole('region', { name: 'New rules available' })).toBeNull();
    // The World History holds it, new: it names no Guild (M9-F4).
    fireEvent.click(within(within(section('History')).getByRole('group', { name: 'Whose History' })).getByRole('button', { name: 'The World History' }));
    expect(inHistory(`The rules moved from configVersion ${from} to ${to}.`).classList.contains('is-new')).toBe(true);
  });

  test('are not offered to a game under this release’s rules', () => {
    render_(started());

    expect(screen.queryByRole('region', { name: 'New rules available' })).toBeNull();
  });
});

describe('the game as a file', () => {
  test('exports the game as the save the CLI writes, byte for byte, named by its seed and date (DL-210)', async () => {
    const state = started();
    // jsdom has no object URLs: stand in for the browser's, and keep what the page hands it.
    const blobs: Blob[] = [];
    const saved: { download: string; href: string }[] = [];
    const browser = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    URL.createObjectURL = (blob: Blob | MediaSource) => (blobs.push(blob as Blob), 'blob:save');
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ download: this.download, href: this.href });
    });
    try {
      render_(state);

      fireEvent.click(within(section('This game')).getByRole('button', { name: 'Export this game' }));

      expect(saved).toEqual([{ download: 'heroesim-app-test-year-1-day-1.json', href: 'blob:save' }]);
      expect(blobs).toHaveLength(1);
      expect(await blobs[0]?.text()).toBe(saveText(state.document as NonNullable<GameState['document']>));
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      Object.assign(URL, browser);
    }
  });

  test('loads a save file in place of the game in hand, and says why one does not load', async () => {
    const later = played(started('loaded-game'), { kind: 'advance', turns: 4 });
    render_(started());
    const input = within(section('This game')).getByLabelText('Load a save file');

    fireEvent.change(input, { target: { files: [new File([saveText(later.document as NonNullable<GameState['document']>)], 'save.json')] } });
    await waitFor(() => expect(seedShown()).toBe('loaded-game'));
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 2, afternoon');

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), { target: { files: [new File(['{"not":'], 'broken.json')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^Cannot load the save: /));
    expect(seedShown()).toBe('loaded-game');
  });

  test('says in place of loading a file that an older Heroesim saved it, schema 5 as v1.1.2 wrote it, and the game in hand stays (v1.1.2-S3, DL-125 item 10.2; v1.1.3-S6)', async () => {
    const older = JSON.parse(saveText(started('saved-by-v1.1.2').document as NonNullable<GameState['document']>)) as {
      meta: { version: number };
      world: { heroes: Record<string, object> };
    };
    older.meta.version = 5;
    for (const hero of Object.values(older.world.heroes)) {
      for (const field of ['portraitKey', 'appearance', 'biography']) Reflect.deleteProperty(hero, field);
    }
    render_(started());

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([JSON.stringify(older)], 'older.json')] },
    });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^This game was saved by an older Heroesim and cannot be loaded\./));
    expect(seedShown()).toBe('app-test');
  });

  test('starts a new game in place of the game in hand, or goes back to it', async () => {
    render_(started());

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    expect(screen.getByText('The game in hand is lost unless you export it first.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the game in hand' }));
    expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Second Lamp' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Bran Tull' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    expect(screen.getByRole('heading', { level: 1, name: 'The Second Lamp' })).toBeDefined();
  });

  test("lists a loaded save's content keys this content lacks, as the CLI warns of them, until another game is in hand", async () => {
    const saved = JSON.parse(saveText(started('warned').document as NonNullable<GameState['document']>)) as {
      world: { heroes: Record<string, { backgroundKey: string }> };
    };
    const [first] = Object.values(saved.world.heroes);
    if (first === undefined) throw new Error('no Hero');
    first.backgroundKey = 'sea-born';
    render_(started());
    const warned = (): HTMLElement | null =>
      within(section('This game')).queryByText('The save names things this release’s content does not define; they are shown as they are:');
    expect(warned()).toBeNull();

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([JSON.stringify(saved)], 'warned.json')] },
    });
    await waitFor(() => expect(seedShown()).toBe('warned'));
    expect(warned()).not.toBeNull();
    expect(within(section('This game')).getByText(/sea-born/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(warned()).not.toBeNull();

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(started('clean').document as NonNullable<GameState['document']>)], 'clean.json')] },
    });
    await waitFor(() => expect(seedShown()).toBe('clean'));
    expect(warned()).toBeNull();
  });

  test('a save loaded in place of the game in hand shows none of what that game had open (DL-74)', async () => {
    const other = played(started('the-other-game'), { kind: 'advance', turns: 2 });
    render_(played(started(), { kind: 'advance', turns: 2 }));
    const heroOpener = (name: string): HTMLElement =>
      within(section(name))
        .getAllByRole('button')
        .find((button) => button.className === 'link') as HTMLElement;

    // What the shell keeps from view to view: whose History, and the Quest whose Party is open.
    fireEvent.click(within(within(section('History')).getByRole('group', { name: 'Whose History' })).getByRole('button', { name: 'The World History' }));
    const [quest] = within(section('Board')).getAllByRole('article');
    fireEvent.click(within(quest as HTMLElement).getByRole('button', { name: 'Choose a Party' }));
    // And what a view keeps while it is open: a Rival's page, a pool Hero's page and a Hero's page.
    fireEvent.click(within(section('Guilds')).getAllByRole('button', { name: /^Open / })[0] as HTMLElement);
    expect(within(section('Guilds')).queryByRole('article')).not.toBeNull();
    fireEvent.click(heroOpener('Unattached pool'));
    expect(within(section('Unattached pool')).queryByRole('article')).not.toBeNull();
    fireEvent.click(heroOpener('Roster'));
    expect(within(section('Roster')).queryByRole('article')).not.toBeNull();
    expect(within(section('History')).getByRole('heading', { level: 3, name: 'The World History' })).toBeDefined();
    expect(within(section('Board')).queryByRole('form')).not.toBeNull();

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(other.document as NonNullable<GameState['document']>)], 'other.json')] },
    });
    await waitFor(() => expect(seedShown()).toBe('the-other-game'));

    // A load opens the home view, and nothing the last game had open is open.
    expect(screen.getByRole('region', { name: 'Guild' })).toBeDefined();
    for (const name of ['Roster', 'Unattached pool', 'Guilds']) expect(within(section(name)).queryByRole('article')).toBeNull();
    expect(within(section('Roster')).getByText(/^\d+ Heroes? on the Roster\.$/)).toBeDefined();
    // The History opens on the player's Guild again.
    expect(within(section('History')).getByRole('heading', { level: 3, name: 'The History of The Lantern' })).toBeDefined();
    expect(within(section('Board')).queryByRole('form')).toBeNull();
  });

  test('loads a save before any game is in hand', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(started('from-file').document as NonNullable<GameState['document']>)], 'save.json')] },
    });

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined());
    expect(seedShown()).toBe('from-file');
  });
});

describe('why time stopped, with a button to what it names', () => {
  test('a Transfer Offer goes to the offers, new Heroes in the pool go to the pool', () => {
    const state = withOffer(started());
    const guildId = 'guild-000001' as GuildId;
    const offerId = Object.keys(state.document?.world.offers ?? {})[0] as OfferId;
    const stops: [StopReason, string, string][] = [
      [{ kind: 'transfer-offer', guildId, offerIds: [offerId] }, 'Answer the Offer', 'Transfer Offers'],
      [{ kind: 'pool-refreshed', heroIds: ['hero-000001' as HeroId] }, 'See who joined the pool', 'Unattached pool'],
    ];
    for (const [stoppedBecause, label, heading] of stops) {
      const { unmount } = render(<App initial={{ ...state, stoppedBecause }} />);
      // The last iteration's view is remembered: why time stopped is the home view's to say.
      openView('Guild');
      fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: label }));
      // Parts of the Roster view (M9-S3): their headings are one below the view's.
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: heading }));
      unmount();
    }
  });

  test("a module's stop is said, and goes to what happened, where a module's own event reads as one (M8-S2)", () => {
    const state = started();
    // A module's event naming the player's Guild, appended to the History as the engine appends each of a play's.
    const fired = { turn: 0, type: 'probe.fired', participants: ['guild-000001'], labels: { 'guild-000001': 'The Lantern' }, milestone: false, payload: { effects: [] } } as unknown as ModuleEvent;
    const game = state.document as NonNullable<GameState['document']>;
    const history = { ...game.history, entries: [...game.history.entries, fired], byEntity: { ...game.history.byEntity } };
    history.byEntity['guild-000001' as GuildId] = [...(history.byEntity['guild-000001' as GuildId] ?? []), history.entries.length - 1];
    render(<App initial={{ ...state, document: { ...game, history }, log: [fired], stoppedBecause: { kind: 'module', moduleId: 'probe' } }} />);

    const stop = screen.getByTestId('stop');
    expect(within(stop).getByText('Stopped: the probe Module asked to stop.')).toBeDefined();
    fireEvent.click(within(stop).getByRole('button', { name: 'Read what happened' }));
    // The History, on the player's Guild, with the keyboard on its title (M9-S5).
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'The History of The Lantern' }));
    expect(inHistory('The probe Module recorded probe.fired for The Lantern.').classList.contains('is-new')).toBe(true);
  });
});
