// This game as a file (M7-S3 part 2; the CLI's `save --as <file>` and `load <file>`, DL-73): export
// the game in hand as the save the CLI writes, byte for byte; load a save file, the CLI's or one
// exported here, through the reducer's `load` play; or start a new game in its place. Keeping saves
// in the browser, in IndexedDB, is M7-S4's.

import type { WorldDocument } from '@heroesim/engine';
import type { ChangeEvent } from 'react';
import type { GameAction, GameState } from '../state/reducer';
import { saveFileName, saveText } from '../state/game-file';
import { Section } from './section';

/** Hands the browser `text` as a file named `name` to save: a download, which requests nothing. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file picker that loads the save chosen: its text goes to the reducer, which reads it (DL-20, DL-65). */
export function LoadSave({ busy, play }: { busy: boolean; play: (action: GameAction) => void }) {
  async function chosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.target;
    const file = input.files?.[0];
    if (file === undefined) return;
    const text = await file.text();
    input.value = '';
    play({ kind: 'load', text });
  }
  return (
    <label className="field">
      <span>Load a save file</span>
      <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => void chosen(event)} />
    </label>
  );
}

export function GameFile({
  document,
  state,
  busy,
  play,
  onNewGame,
}: {
  document: WorldDocument;
  state: GameState;
  busy: boolean;
  play: (action: GameAction) => void;
  onNewGame: () => void;
}) {
  return (
    <Section
      id="game"
      title="This game"
      help={
        'Export the game as a save file, the one the CLI writes, which the CLI or this page can load. Loading a save ' +
        'file, or starting a new game, puts it in place of the game in hand, which is lost unless exported first.'
      }
    >
      <div className="actions">
        <button type="button" onClick={() => download(saveFileName(document), saveText(document))}>
          Export this game
        </button>
      </div>
      <LoadSave busy={busy} play={play} />
      {state.warnings.length === 0 ? null : (
        <>
          <p>The save names things this release’s content does not define; they are shown as they are:</p>
          <ul>
            {state.warnings.map((warning) => (
              <li key={`${warning.id}-${warning.key}`}>{warning.detail}</li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button type="button" onClick={onNewGame}>
          Start a new game
        </button>
      </div>
    </Section>
  );
}
