// The log (M7-S3; the CLI's `advance` output): the events of the last play the engine carried out,
// oldest first, each a sentence from the front end's own `narrate.ts`. A year's fast forward makes
// thousands, so it shows them a hundred at a time, and can keep to the player's own Guild: a choice
// that holds from play to play while the game is in hand (DL-74).
//
// A part of the History view (M9-S3, DL-103). The choice is the shell's, so it holds whichever view
// is open; M9-S5 folds the part into the History.

import { useMemo, useState } from 'react';
import type { GameState } from '../state/reducer';
import { logView, type LogLine } from '../state/selectors';
import { Lines } from './hero-page';
import { Part } from './section';

/** How many lines the log shows at first, and how many more each "Show more" adds. */
export const logPageSize = 100;

export function Log({
  state,
  guildName,
  mine,
  onMine,
}: {
  state: GameState;
  guildName: string;
  /** Whether to keep to the player's Guild: a choice that outlives each play, as the History's does. */
  mine: boolean;
  onMine: (mine: boolean) => void;
}) {
  // The paging starts again with each play's log.
  // Read again only when the game or the log changes: not between the steps of a fast forward,
  // which change neither until it ends (v1.0.1-S5, DL-96).
  const { document, log } = state;
  const lines = useMemo(() => logView({ document, log }, mine), [document, log, mine]);
  return (
    <Part id="log">
      <label className="choice">
        <input type="checkbox" checked={mine} onChange={(event) => onMine(event.target.checked)} />
        <span>Only what concerns {guildName}</span>
      </label>
      <LogLines key={`${state.document?.world.turn ?? 0}:${state.log.length}:${String(mine)}`} lines={lines} />
    </Part>
  );
}

/** The lines, `logPageSize` at first and each "Show more" adding as many again. */
function LogLines({ lines }: { lines: readonly LogLine[] }) {
  const [shown, setShown] = useState(logPageSize);
  return (
    <>
      <p className="subtle">
        {lines.length === 0 ? 'Nothing to report.' : `${lines.length} ${lines.length === 1 ? 'event' : 'events'}, oldest first.`}
      </p>
      {lines.length === 0 ? null : <Lines lines={lines.slice(0, shown)} empty="" />}
      {lines.length > shown ? (
        <div className="actions">
          <button type="button" onClick={() => setShown(shown + logPageSize)}>
            Show {Math.min(logPageSize, lines.length - shown)} more
          </button>
        </div>
      ) : null}
    </>
  );
}
