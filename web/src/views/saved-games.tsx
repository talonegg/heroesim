// Saved in this browser (M7-S4, DL-67): the game in hand saved under a name, compressed, in
// IndexedDB (`saves.ts`); each save kept listed newest first, to load in place of the game in hand,
// to export as the file the CLI reads, or to delete. Before a game it is how a game saved earlier
// comes back after the page is closed or reloaded. Where the browser keeps nothing for the page it
// says so, and the game plays on without saving.

import type { WorldDocument } from '@heroesim/engine';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { savesFailureSentence, type Saves, type SavesFailure, type SaveSummary } from '../saves';
import { saveFileName } from '../state/game-file';
import type { GameAction } from '../state/reducer';
import { download } from './download';

/** Lets the browser paint "Saving…" before the save text of a long game is written, which holds the page. */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });
}

/** A size as a player reads it: `840 bytes`, `12.4 kB`, `9.8 MB`. */
export function sizeWords(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function whenWords(savedAt: string): string {
  return new Date(savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function SavedGames({
  saves,
  document,
  busy,
  play,
}: {
  saves: Saves;
  /** The game in hand, which can be saved; `null` before a game, when saves can only be loaded. */
  document: WorldDocument | null;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  const [kept, setKept] = useState<readonly SaveSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState<SavesFailure | null>(saves.unavailable);
  const [working, setWorking] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  /** Words for a failure; an `unavailable` one also puts the saves away. */
  const failed = useCallback((failure: SavesFailure): string => {
    if (failure.kind === 'unavailable') setUnavailable(failure);
    return savesFailureSentence(failure);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const listed = await saves.list();
    if (listed.ok) setKept(listed.value);
    else setSaid(failed(listed.failure));
  }, [saves, failed]);

  useEffect(() => {
    if (saves.unavailable === null) void refresh();
  }, [saves, refresh]);

  /** Runs `task`, saying `doing` meanwhile and what it did after. */
  async function run(doing: string, task: () => Promise<string | null>): Promise<void> {
    setWorking(doing);
    setSaid(null);
    await painted();
    try {
      setSaid(await task());
    } finally {
      setWorking(null);
    }
  }

  const defaultName = document === null ? '' : saveFileName(document).replace(/\.json$/, '');

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (document === null) return;
    const as = name.trim() === '' ? defaultName : name;
    void run('Saving…', async () => {
      const saved = await saves.save(as, document);
      if (!saved.ok) return failed(saved.failure);
      setName('');
      await refresh();
      return `Saved as “${saved.value.name}”, ${sizeWords(saved.value.bytes)}.`;
    });
  }

  function load(saveName: string): void {
    void run(`Reading “${saveName}”…`, async () => {
      const loaded = await saves.load(saveName);
      if (!loaded.ok) return failed(loaded.failure);
      play({ kind: 'load', text: loaded.value });
      return null;
    });
  }

  function exportSave(saveName: string): void {
    void run(`Reading “${saveName}”…`, async () => {
      const exported = await saves.export(saveName);
      if (!exported.ok) return failed(exported.failure);
      download(exported.value);
      return `Exported “${saveName}” as ${exported.value.name}.`;
    });
  }

  function remove(saveName: string): void {
    setDeleting(null);
    void run(`Deleting “${saveName}”…`, async () => {
      const removed = await saves.remove(saveName);
      if (!removed.ok) return failed(removed.failure);
      await refresh();
      return `Deleted “${saveName}”.`;
    });
  }

  const idle = !busy && working === null;
  return (
    <div className="saved">
      <h3>Saved in this browser</h3>
      {unavailable !== null ? (
        <p className="warning" role="status" data-testid="saves-unavailable">
          {savesFailureSentence(unavailable)}
        </p>
      ) : (
        <>
          {document === null ? null : (
            <form className="form" aria-label="Save in this browser" onSubmit={save}>
              <label className="field">
                <span>Save as</span>
                <input type="text" name="saveName" value={name} placeholder={defaultName} onChange={(event) => setName(event.target.value)} />
              </label>
              <div className="actions">
                <button type="submit" disabled={!idle}>
                  Save in this browser
                </button>
              </div>
            </form>
          )}
          <p className="busy" role="status" data-testid="saves-status">
            {working ?? said ?? ''}
          </p>
          {kept === null ? null : kept.length === 0 ? (
            <p>No game is saved in this browser yet.</p>
          ) : (
            <ul className="cards" aria-label="Saves kept in this browser">
              {kept.map((save) => (
                <li key={save.name}>
                  <article className="card" aria-label={save.name}>
                    <p className="save-name">{save.name}</p>
                    <p className="subtle">
                      Saved {whenWords(save.savedAt)}, {sizeWords(save.bytes)}
                    </p>
                    {deleting === save.name ? (
                      <div className="actions">
                        <button type="button" disabled={!idle} onClick={() => remove(save.name)}>
                          Delete “{save.name}” for good
                        </button>
                        <button type="button" onClick={() => setDeleting(null)}>
                          Keep it
                        </button>
                      </div>
                    ) : (
                      <div className="actions">
                        <button type="button" aria-label={`Load ${save.name}`} disabled={!idle} onClick={() => load(save.name)}>
                          Load
                        </button>
                        <button type="button" aria-label={`Export ${save.name}`} disabled={!idle} onClick={() => exportSave(save.name)}>
                          Export
                        </button>
                        <button type="button" aria-label={`Delete ${save.name}`} disabled={!idle} onClick={() => setDeleting(save.name)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
