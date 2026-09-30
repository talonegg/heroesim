// This game (M7-S3 part 2, DL-73; M7-S4, DL-67): the CLI's `save --as <file>` and `load <file>`, and
// saves kept in the browser. Export the game in hand as the save the CLI writes, byte for byte; save
// it in this browser, in IndexedDB, and load, export or delete a save kept there; load a save file,
// the CLI's or one exported here, through the reducer's `load` play; or start a new game in its place.
//
// A part of the game menu (M9-S3, DL-103). The file picker is the browser's own control behind a
// button.

import type { WorldDocument } from '@heroesim/engine';
import { useState, type ChangeEvent } from 'react';
import { savesFailureSentence, type Saves } from '../saves';
import type { GameAction, GameState } from '../state/reducer';
import { saveFileName, saveText } from '../state/game-file';
import { download } from './download';
import { Icon } from './icons';
import { SavedGames } from './saved-games';
import { Part } from './section';
import { FileButton } from './ui';

/** A file picker that loads the save chosen: its text (`saves.import`) goes to the reducer, which reads it (DL-20, DL-65). */
export function LoadSave({ saves, busy, play }: { saves: Saves; busy: boolean; play: (action: GameAction) => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  async function chosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.target;
    const file = input.files?.[0];
    if (file === undefined) return;
    const imported = await saves.import(file);
    input.value = '';
    setFailure(imported.ok ? null : savesFailureSentence(imported.failure));
    if (imported.ok) play({ kind: 'load', text: imported.value });
  }
  return (
    <div className="load-save">
      <FileButton label="Load a save file" accept=".json,application/json" disabled={busy} onFile={(event) => void chosen(event)} />
      {failure === null ? null : (
        <p role="alert" className="warning">
          {failure}
        </p>
      )}
    </div>
  );
}

export function GameFile({
  document,
  state,
  saves,
  busy,
  play,
  onNewGame,
}: {
  document: WorldDocument;
  state: GameState;
  saves: Saves;
  busy: boolean;
  play: (action: GameAction) => void;
  onNewGame: () => void;
}) {
  return (
    <Part id="game">
      <div className="actions">
        {/* Not while busy, as saving here is not: between the steps of a fast forward the game in hand
            shares its History with the steps' games (ADR-0008), so the History holds Turns its World
            has not played, and a save of it would not load (v1.0.1-S6, DL-97). */}
        <button
          type="button"
          disabled={busy}
          onClick={() => download(new File([saveText(document)], saveFileName(document), { type: 'application/json' }))}
        >
          <Icon name="save" />
          <span>Export this game</span>
        </button>
        <LoadSave saves={saves} busy={busy} play={play} />
      </div>
      <SavedGames saves={saves} document={document} busy={busy} play={play} rejection={state.rejection} level={4} />
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
      <div className="actions actions--new">
        <button type="button" onClick={onNewGame}>
          <Icon name="new" />
          <span>Start a new game</span>
        </button>
      </div>
    </Part>
  );
}
