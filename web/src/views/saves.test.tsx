import type { WorldDocument } from '@heroesim/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../app';
import { browserSaves, createSaves, type Saves } from '../saves';
import { memoryStore } from '../saves.test-support';
import { saveText } from '../state/game-file';
import { played, started } from '../state/game.test-support';
import type { GameState } from '../state/reducer';
import { section, seedShown } from './page.test-support';

// Saved in this browser (M7-S4, DL-67), driven through the page's controls: save the game in hand
// under a name, list it, load it back in place of a later game or before any game, export it as the
// file the CLI reads, delete it; and where the browser keeps nothing, say so and play on. The saves
// are kept here in a map standing in for IndexedDB, which jsdom lacks; Playwright drives IndexedDB.
// With a game in hand they are in the game menu (M9-S3, DL-103).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function idle(): Promise<void> {
  await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'));
}

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

function keptInMemory(): { saves: Saves; store: ReturnType<typeof memoryStore> } {
  const store = memoryStore();
  return { store, saves: createSaves(async () => store, { now: () => new Date('2026-09-27T10:00:00.000Z') }) };
}

describe('saved in this browser', () => {
  test('saves the game in hand under a name, lists it, and loads it back in place of a later game', async () => {
    const { saves } = keptInMemory();
    render(<App initial={started()} saves={saves} />);
    const game = section('This game');
    await within(game).findByText('No game is saved in this browser yet.');

    fireEvent.change(within(game).getByLabelText('Save as'), { target: { value: 'journey' } });
    fireEvent.click(within(game).getByRole('button', { name: 'Save in this browser' }));

    expect(await within(game).findByText(/^Saved as “journey”, [\d.]+ kB\.$/)).toBeDefined();
    const listed = within(game).getByRole('article', { name: 'journey' });
    expect(within(listed).getByText(/^Saved .+, [\d.]+ kB$/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(screen.getByTestId('time').textContent).toBe('Day 0, afternoon, Year 0');

    fireEvent.click(within(section('This game')).getByRole('button', { name: 'Load journey' }));
    await waitFor(() => expect(screen.getByTestId('time').textContent).toBe('Day 0, morning, Year 0'));
    await idle();
    expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();
  });

  test('names a save by its seed and Day when no name is given', async () => {
    const { store, saves } = keptInMemory();
    render(<App initial={started()} saves={saves} />);
    const game = section('This game');
    await within(game).findByText('No game is saved in this browser yet.');

    expect((within(game).getByLabelText('Save as') as HTMLInputElement).placeholder).toBe('heroesim-app-test-day-0');
    fireEvent.click(within(game).getByRole('button', { name: 'Save in this browser' }));

    await within(game).findByRole('article', { name: 'heroesim-app-test-day-0' });
    expect([...store.records.keys()]).toEqual(['heroesim-app-test-day-0']);
  });

  test('before any game, as after the page is reloaded, loads a game saved earlier', async () => {
    const { saves } = keptInMemory();
    const later = played(started('saved-earlier'), { kind: 'advance', turns: 7 });
    await saves.save('earlier', documentOf(later));
    render(<App saves={saves} />);
    const newGame = section('A new game');

    fireEvent.click(await within(newGame).findByRole('button', { name: 'Load earlier' }));

    await waitFor(() => expect(seedShown()).toBe('saved-earlier'));
    await idle();
    expect(screen.getByTestId('time').textContent).toBe('Day 2, afternoon, Year 0');
  });

  test('exports a save kept here as the file the CLI reads: its text uncompressed, byte for byte', async () => {
    const { saves } = keptInMemory();
    const state = played(started(), { kind: 'advance', turns: 4 });
    await saves.save('journey', documentOf(state));
    // jsdom has no object URLs: stand in for the browser's, and keep what the page hands it.
    const files: Blob[] = [];
    const downloads: string[] = [];
    const browser = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    URL.createObjectURL = (blob: Blob | MediaSource) => (files.push(blob as Blob), 'blob:save');
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    try {
      render(<App initial={started()} saves={saves} />);
      const game = section('This game');

      fireEvent.click(await within(game).findByRole('button', { name: 'Export journey' }));

      expect(await within(game).findByText('Exported “journey” as journey.json.')).toBeDefined();
      expect(downloads).toEqual(['journey.json']);
      const [file] = files;
      if (file === undefined) throw new Error('nothing downloaded');
      // Compared as Node's bytes: jsdom's File and Node's encoder make arrays of two realms.
      expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from(saveText(documentOf(state)), 'utf8'))).toBe(true);
    } finally {
      Object.assign(URL, browser);
    }
  });

  test('deletes a save only when asked twice', async () => {
    const { store, saves } = keptInMemory();
    await saves.save('journey', documentOf(started()));
    render(<App initial={started()} saves={saves} />);
    const game = section('This game');

    fireEvent.click(await within(game).findByRole('button', { name: 'Delete journey' }));
    fireEvent.click(within(game).getByRole('button', { name: 'Keep it' }));
    expect(store.records.size).toBe(1);
    fireEvent.click(within(game).getByRole('button', { name: 'Delete journey' }));
    fireEvent.click(within(game).getByRole('button', { name: 'Delete “journey” for good' }));

    expect(await within(game).findByText('Deleted “journey”.')).toBeDefined();
    expect(within(game).getByText('No game is saved in this browser yet.')).toBeDefined();
    expect(store.records.size).toBe(0);
  });

  test('says why a save was not kept, in the browser’s words', async () => {
    const full = new Error('The quota has been exceeded.');
    full.name = 'QuotaExceededError';
    const saves = createSaves(async () => memoryStore({ refuse: full }));
    render(<App initial={started()} saves={saves} />);
    const game = section('This game');
    await within(game).findByText('No game is saved in this browser yet.');

    fireEvent.click(within(game).getByRole('button', { name: 'Save in this browser' }));

    expect(await within(game).findByText('The browser could not do it: QuotaExceededError: The quota has been exceeded.')).toBeDefined();
  });
});

describe('where the browser keeps no saves', () => {
  const unavailable = /^This browser will not keep saves for this page, as in a private window or with site data blocked \(.+\)\. The game plays on; export it to keep it\.$/;

  test('says so before a game, and a game still starts', async () => {
    render(<App saves={browserSaves({})} />);

    expect(within(section('A new game')).getByTestId('saves-unavailable').textContent).toMatch(unavailable);
    fireEvent.change(screen.getByLabelText('Guild name'), { target: { value: 'The Lantern' } });
    fireEvent.change(screen.getByLabelText(/Guildmaster/), { target: { value: 'Ada Vell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await idle();

    expect(screen.getByRole('heading', { level: 1, name: 'The Lantern' })).toBeDefined();
  });

  test('says so with a game in hand, offers no save, and the game plays on and still exports', async () => {
    render(<App initial={started()} saves={browserSaves({})} />);
    const game = section('This game');

    expect(within(game).getByTestId('saves-unavailable').textContent).toMatch(unavailable);
    expect(within(game).queryByRole('button', { name: 'Save in this browser' })).toBeNull();
    expect(within(game).getByRole('button', { name: 'Export this game' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Advance a Turn' }));
    await idle();
    expect(screen.getByTestId('time').textContent).toBe('Day 0, afternoon, Year 0');
  });

  test('where it shows only when the database is opened, says so then', async () => {
    const indexedDB = {
      open: () => {
        throw new DOMException('access to the Indexed Database API is denied in this context.', 'SecurityError');
      },
    } as unknown as IDBFactory;
    render(<App initial={started()} saves={browserSaves({ indexedDB, CompressionStream, DecompressionStream })} />);

    const note = await within(section('This game')).findByTestId('saves-unavailable');

    expect(note.textContent).toMatch(unavailable);
    expect(note.textContent).toContain('(SecurityError: access to the Indexed Database API is denied in this context). ');
    expect(within(section('This game')).queryByRole('button', { name: 'Save in this browser' })).toBeNull();
  });
});
