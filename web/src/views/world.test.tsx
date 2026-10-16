import type { GuildId, ModuleEvent, OfferId, StopReason } from '@heroesim/engine';
import { cleanup, fireEvent, getNodeText, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { content } from '../content';
import { saveText } from '../state/game-file';
import { changed, documentOf, played, started, withOffer, withOlderRules, withWealth } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { idle, inHistory, openView, renderGame, section, seedShown, silverOf, startNewGame } from './page.test-support';

// The views of the wider world and the game as a file (DL-73): the CLI's `show
// rankings`, `show guilds`, `show roster|hall|guildmaster <guildId>`, `show guildmaster`, `show
// patrons`, `rebase`, `save --as` and `load`, driven through the page's controls. Each region is
// found by opening its view, or the game menu, first (DL-103). The History's are in
// `history.test.tsx`.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shared places and the Bankruptcy countdown (DL-95)', () => {
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
    'unless Wealth is back to 0 Silver or more on a night by then, after any Upkeep due.';

  /** The countdown as the status bar's pill says it, and in full in the home view (DL-103). */
  function shown(dueDay: number): void {
    expect(within(screen.getByRole('banner')).getByTestId('countdown').textContent).toBe(`Bankruptcy on the night of Year 1 Day ${dueDay + 1}`);
    expect(within(screen.getByRole('region', { name: 'Guild' })).getByText(countdown(dueDay))).toBeDefined();
  }

  test("the status bar shows the countdown only while the player's Guild is below the floor, from the game's own grace, and the home view says it in full", () => {
    renderGame(played(started(), { kind: 'advance', turns: 2 }));
    expect(screen.queryByTestId('countdown')).toBeNull();
    cleanup();

    renderGame(belowTheFloor());
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 1, night');
    shown(30);
    cleanup();

    renderGame(belowTheFloor(10));
    shown(10);
  });

  test("stays after Wealth rises during a Day, and goes at that night's check", () => {
    const risen = withWealth(belowTheFloor(10), 1_000);
    renderGame(risen);
    shown(10);
    cleanup();

    renderGame(played(risen, { kind: 'advance', turns: 3 }));
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 2, night');
    expect(screen.queryByTestId('countdown')).toBeNull();
  });
});

describe('the Guilds', () => {
  test("open a Rival's page: its Hall, with no Build, and its Guildmaster", () => {
    renderGame(started());

    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Open The Ashford Guild' }));

    const page = within(section('Guilds')).getByRole('article');
    // Its Hall and Guildmaster folded (the review's B10); the rows, fees and the way back are `rankings.test.tsx`'s.
    expect(within(page).getAllByRole('img', { name: 'Grade 0 of 3' })).toHaveLength(3);
    expect(within(page).queryByRole('button', { name: /^Build / })).toBeNull();
    expect(within(page).getByRole('heading', { level: 5, name: /, Guildmaster of The Ashford Guild$/ })).toBeDefined();
  });

  test("a Rival's page gives its Wealth and each Facility's next grade's cost in coins (DL-294 item 1)", () => {
    const state = started();
    renderGame(state);
    fireEvent.click(within(section('Guilds')).getByRole('button', { name: 'Open The Ashford Guild' }));
    const page = within(section('Guilds')).getByRole('article');
    const ashford = Object.values(documentOf(state).world.guilds).find((guild) => guild.name === 'The Ashford Guild');

    expect(silverOf(within(page).getByRole('list', { name: "The Ashford Guild's standing" }).querySelectorAll('li')[0] as HTMLElement)).toBe(ashford?.wealth);
    const next = within(page).getAllByText(/^Next: .+,$/);
    expect(next).toHaveLength(3);
    for (const each of next) {
      const name = /^Next: (.+),$/.exec(getNodeText(each).trim())?.[1];
      expect(silverOf(each)).toBe(Object.values(content.improvements).find((improvement) => improvement.name === name)?.cost);
    }
  });
});

describe('new rules', () => {
  test('are offered while the game plays under older ones, and adopting them is recorded', async () => {
    const state = withOlderRules(started(), 2);
    renderGame(state);
    const notice = section('New rules available');
    const [from, to] = /configVersion (\d+); this release’s rules are configVersion (\d+)/.exec(notice.textContent ?? '')?.slice(1) ?? [];
    expect(Number(to) - Number(from)).toBe(2);

    fireEvent.click(within(notice).getByRole('button', { name: 'Adopt the new rules' }));
    await idle();

    expect(screen.queryByRole('region', { name: 'New rules available' })).toBeNull();
    // The World History holds it, new: it names no Guild.
    fireEvent.click(within(within(section('History')).getByRole('group', { name: 'Whose History' })).getByRole('button', { name: 'The World History' }));
    expect(inHistory(`The rules moved from configVersion ${from} to ${to}.`).classList.contains('is-new')).toBe(true);
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
      renderGame(state);

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
    renderGame(started());
    const input = within(section('This game')).getByLabelText('Load a save file');

    fireEvent.change(input, { target: { files: [new File([saveText(later.document as NonNullable<GameState['document']>)], 'save.json')] } });
    await waitFor(() => expect(seedShown()).toBe('loaded-game'));
    expect(screen.getByTestId('time').textContent).toBe('Year 1 Day 2, afternoon');

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), { target: { files: [new File(['{"not":'], 'broken.json')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^Cannot load the save: /));
    expect(seedShown()).toBe('loaded-game');
  });

  test('starts a new game in place of the game in hand, or goes back to it', async () => {
    renderGame(started());

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    expect(screen.getByText('The game in hand is lost unless you export it first.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the game in hand' }));
    expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Start a new game' }));
    startNewGame({ guildName: 'The Second Lamp', guildmasterName: 'Bran Tull' });
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
    renderGame(started());
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
    renderGame(played(started(), { kind: 'advance', turns: 2 }));
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
    ];
    for (const [stoppedBecause, label, heading] of stops) {
      const { unmount } = render(<App initial={{ ...state, stoppedBecause }} />);
      // The last iteration's view is remembered: why time stopped is the home view's to say.
      openView('Guild');
      fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: label }));
      // Parts of the Roster view: their headings are one below the view's.
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: heading }));
      unmount();
    }
  });

  test("a Contract's end goes to the Roster, where the Heroes Out of Contract are (DL-316)", () => {
    const state = started();
    const guildId = 'guild-000001' as GuildId;
    const heroIds = (state.document?.world.guilds[guildId]?.rosterIds ?? []).slice(0, 2);
    render(<App initial={{ ...state, stoppedBecause: { kind: 'contract-expired', guildId, heroIds } }} />);
    openView('Guild');

    const stop = screen.getByTestId('stop');
    expect(stop.textContent).toMatch(/^Stopped: Contracts ended: .+ and .+ of The Lantern are Out of Contract\./);
    fireEvent.click(within(stop).getByRole('button', { name: 'Open the Roster' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Roster' }));
  });

  test("a module's stop is said, and goes to what happened, where a module's own event reads as one", () => {
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
    // The History, on the player's Guild, with the keyboard on its title.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: 'The History of The Lantern' }));
    expect(inHistory('The probe Module recorded probe.fired for The Lantern.').classList.contains('is-new')).toBe(true);
  });
});
