import type { GuildId, HeroId, ModuleEvent, OfferId, StopReason } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { saveText } from '../state/game-file';
import { played, started, withOlderRules, withTheGone } from '../state/game.test-support';
import type { GameState } from '../state/reducer';

// The views of the wider world and the game as a file (M7-S3 part 2, DL-73): the CLI's `show
// rankings`, `show guilds`, `show roster|hall|guildmaster <guildId>`, `show guildmaster`, `show
// patrons`, `show history`, `rebase`, `save --as` and `load`, driven through the page's controls.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

function render_(state: GameState): void {
  render(<App initial={state} />);
}

describe('the Rankings', () => {
  test('rank the Guilds in play by Fame, or by Wealth when asked', () => {
    render_(played(started(), { kind: 'advance', turns: 6 }));
    const rankings = section('Rankings');
    expect(within(rankings).getByRole('button', { name: 'By Fame' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(rankings).getByRole('table', { name: 'Rankings by Fame' })).toBeDefined();

    fireEvent.click(within(rankings).getByRole('button', { name: 'By Wealth' }));

    const table = within(rankings).getByRole('table', { name: 'Rankings by Wealth' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['1st', '2nd', '3rd', '4th', '5th']);
    const values = rows.map((row) => Number(within(row).getAllByRole('cell').at(-1)?.textContent));
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect(within(table).getByRole('rowheader', { name: 'The Lantern' })).toBeDefined();
  });
});

describe('the Guilds', () => {
  test("list every Guild, and open a Rival's page: its Roster with fees, its Hall, its Guildmaster", () => {
    render_(started());
    const guilds = section('Guilds');
    expect(within(guilds).getAllByRole('listitem').filter((item) => item.parentElement?.className === 'cards')).toHaveLength(5);
    expect(within(guilds).queryByRole('button', { name: 'Open The Lantern' })).toBeNull();
    expect(within(guilds).getByText('The Ashford Guild')).toBeDefined();

    fireEvent.click(within(guilds).getByRole('button', { name: 'Open The Ashford Guild' }));

    const page = within(section('Guilds')).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name: 'The Ashford Guild' })).toBeDefined();
    expect(within(page).getAllByText(/^Transfer fee \d+ Wealth\.$/).length).toBeGreaterThan(0);
    expect(within(page).getByRole('heading', { level: 5, name: 'Infirmary: grade 0' })).toBeDefined();
    expect(within(page).queryByRole('button', { name: /^Build / })).toBeNull();
    expect(within(page).getByRole('heading', { level: 4, name: /, Guildmaster of The Ashford Guild$/ })).toBeDefined();

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
    expect(within(guildmaster).getByText('the reward agreed and the fees paid')).toBeDefined();
    for (const item of within(guildmaster).getAllByRole('listitem').filter((each) => /: \w+$/.test(each.textContent ?? ''))) {
      expect(item.textContent).not.toMatch(/\d+$/);
    }
    const patrons = within(section('Patrons')).getAllByRole('listitem');
    expect(patrons.length).toBeGreaterThan(0);
    for (const patron of patrons) expect(patron.textContent).toMatch(/^.+, of the .+: Regard for The Lantern (hostile|cool|neutral|warm|devoted)$/);
  });
});

describe('the History', () => {
  test("pages the whole History newest first, and a Guild's", () => {
    render_(played(started(), { kind: 'advance', turns: 12 }));
    const history = (): HTMLElement => section('History');
    expect(within(history()).getByRole('heading', { level: 3, name: 'The whole History' })).toBeDefined();
    const summary = within(history()).getByText(/^Page 1 of \d+, \d+ entries in all, newest first\.$/).textContent ?? '';
    const pages = Number(/of (\d+)/.exec(summary)?.[1]);
    expect(pages).toBeGreaterThan(1);

    fireEvent.click(within(history()).getByRole('button', { name: 'Oldest' }));
    const lines = within(history()).getAllByRole('listitem');
    expect(lines.at(-1)?.textContent).toBe('Day 0, morning The world was made from seed app-test.');
    expect((within(history()).getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(history()).getByLabelText('Whose History'), { target: { value: 'guild-000001' } });
    expect(within(history()).getByRole('heading', { level: 3, name: 'The History of The Lantern' })).toBeDefined();
    expect(within(history()).getByText(/^Page 1 of \d+,/)).toBeDefined();
  });

  test("finds anyone it names by name: a dead Hero's page opens from it, and a Hero gone from the world has their History (DL-74)", () => {
    const { state, dead, gone } = withTheGone(played(started(), { kind: 'advance', turns: 6 }));
    render_(state);
    const history = (): HTMLElement => section('History');
    const search = (): HTMLElement => within(history()).getByRole('searchbox', { name: 'Find someone in the History by name' });

    fireEvent.change(search(), { target: { value: dead.name.toLowerCase() } });
    expect(within(history()).getByRole('status').textContent).toMatch(/^\d+ found/);
    expect(within(within(history()).getByRole('list', { name: 'Found in the History' })).getByText('(Hero, dead)')).toBeDefined();
    fireEvent.click(within(history()).getByRole('button', { name: `Read ${dead.name}` }));

    const page = within(history()).getByRole('article');
    expect(within(page).getByRole('heading', { level: 3, name: dead.name })).toBeDefined();
    expect(within(page).getByText(/^died on Day \d+$/)).toBeDefined();
    expect(within(page).getByRole('heading', { level: 4, name: 'Milestones' })).toBeDefined();
    expect((within(history()).getByLabelText('Whose History') as HTMLSelectElement).value).toBe(dead.id);
    expect(within(history()).queryByRole('list', { name: 'Found in the History' })).toBeNull();
    fireEvent.click(within(page).getByRole('button', { name: 'Back to the whole History' }));
    expect(within(history()).getByRole('heading', { level: 3, name: 'The whole History' })).toBeDefined();

    fireEvent.change(search(), { target: { value: gone.name } });
    expect(within(history()).getByText('(Hero, no longer in the world)')).toBeDefined();
    fireEvent.click(within(history()).getByRole('button', { name: `Read ${gone.name}` }));
    expect(within(history()).queryByRole('article')).toBeNull();
    expect(within(history()).getByRole('heading', { level: 3, name: `The History of ${gone.name}` })).toBeDefined();
    expect(within(history()).getByText(new RegExp(`^${gone.name}, .+, joined the Unattached pool\\.$`))).toBeDefined();

    fireEvent.change(search(), { target: { value: 'no one is called this' } });
    expect(within(history()).getByRole('status').textContent).toBe('No one the History names is called that.');
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
    expect(within(section('Since your last action')).getByText(`The rules moved from configVersion ${from} to ${to}.`)).toBeDefined();
  });

  test('are not offered to a game under this release’s rules', () => {
    render_(started());

    expect(screen.queryByRole('region', { name: 'New rules available' })).toBeNull();
  });
});

describe('the game as a file', () => {
  test('exports the game as the save the CLI writes, byte for byte, named by its seed and Day', async () => {
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

      expect(saved).toEqual([{ download: 'heroesim-app-test-day-0.json', href: 'blob:save' }]);
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
    await waitFor(() => expect(screen.getByTestId('seed').textContent).toBe('loaded-game'));
    expect(screen.getByTestId('time').textContent).toBe('Day 1, afternoon, Year 0');

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), { target: { files: [new File(['{"not":'], 'broken.json')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^Cannot load the save: /));
    expect(screen.getByTestId('seed').textContent).toBe('loaded-game');
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
    await waitFor(() => expect(screen.getByTestId('seed').textContent).toBe('warned'));
    expect(warned()).not.toBeNull();
    expect(within(section('This game')).getByText(/sea-born/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(warned()).not.toBeNull();

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(started('clean').document as NonNullable<GameState['document']>)], 'clean.json')] },
    });
    await waitFor(() => expect(screen.getByTestId('seed').textContent).toBe('clean'));
    expect(warned()).toBeNull();
  });

  test('a save loaded in place of the game in hand shows none of what that game had open (DL-74)', async () => {
    const other = played(started('the-other-game'), { kind: 'advance', turns: 2 });
    render_(played(started(), { kind: 'advance', turns: 2 }));
    const heroOpener = (name: string): HTMLElement =>
      within(section(name))
        .getAllByRole('button')
        .find((button) => button.className === 'link') as HTMLElement;

    fireEvent.click(heroOpener('Roster'));
    fireEvent.click(heroOpener('Unattached pool'));
    fireEvent.click(within(section('Guilds')).getAllByRole('button', { name: /^Open / })[0] as HTMLElement);
    fireEvent.change(within(section('History')).getByLabelText('Whose History'), { target: { value: 'guild-000001' } });
    for (const name of ['Roster', 'Unattached pool', 'Guilds']) expect(within(section(name)).queryByRole('article')).not.toBeNull();
    expect(within(section('History')).getByRole('heading', { level: 3, name: 'The History of The Lantern' })).toBeDefined();

    fireEvent.change(within(section('This game')).getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(other.document as NonNullable<GameState['document']>)], 'other.json')] },
    });
    await waitFor(() => expect(screen.getByTestId('seed').textContent).toBe('the-other-game'));

    for (const name of ['Roster', 'Unattached pool', 'Guilds']) expect(within(section(name)).queryByRole('article')).toBeNull();
    expect(within(section('Roster')).getByText(/^\d+ Heroes? on the Roster\.$/)).toBeDefined();
    expect(within(section('History')).getByRole('heading', { level: 3, name: 'The whole History' })).toBeDefined();
  });

  test('loads a save before any game is in hand', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Load a save file'), {
      target: { files: [new File([saveText(started('from-file').document as NonNullable<GameState['document']>)], 'save.json')] },
    });

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined());
    expect(screen.getByTestId('seed').textContent).toBe('from-file');
  });
});

describe('why time stopped, with a button to what it names', () => {
  test('a Transfer Offer goes to the offers, new Heroes in the pool go to the pool', () => {
    const state = started();
    const guildId = 'guild-000001' as GuildId;
    const stops: [StopReason, string, string][] = [
      [{ kind: 'transfer-offer', guildId, offerIds: ['offer-000001' as OfferId] }, 'Answer the offer', 'Transfer Offers'],
      [{ kind: 'pool-refreshed', heroIds: ['hero-000001' as HeroId] }, 'See who joined the pool', 'Unattached pool'],
    ];
    for (const [stoppedBecause, label, heading] of stops) {
      const { unmount } = render(<App initial={{ ...state, stoppedBecause }} />);
      fireEvent.click(within(screen.getByTestId('stop')).getByRole('button', { name: label }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: heading }));
      unmount();
    }
  });

  test("a module's stop is said, and goes to what happened, where a module's own event reads as one (M8-S2)", () => {
    const state = started();
    const fired = { turn: 1, type: 'probe.fired', participants: [], labels: {}, milestone: false, payload: { effects: [] } } as unknown as ModuleEvent;
    render(<App initial={{ ...state, log: [fired], stoppedBecause: { kind: 'module', moduleId: 'probe' } }} />);

    const stop = screen.getByTestId('stop');
    expect(within(stop).getByText('Stopped: the probe module asked to stop.')).toBeDefined();
    fireEvent.click(within(stop).getByRole('button', { name: 'Read what happened' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Since your last action' }));
    expect(within(section('Since your last action')).getByText('The probe module recorded probe.fired.')).toBeDefined();
  });
});
