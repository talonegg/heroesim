// The log (M7-S3; the CLI's `advance` output): the events of the last play the engine carried out,
// oldest first, each a sentence from the front end's own `narrate.ts`. A year's fast forward makes
// thousands, so it shows them a hundred at a time, and can keep to the player's own Guild.

import { useMemo, useState } from 'react';
import type { GameState } from '../state/reducer';
import { logView } from '../state/selectors';
import { Lines } from './hero-page';
import { Section } from './section';

/** How many lines the log shows at first, and how many more each "Show more" adds. */
export const logPageSize = 100;

export function Log({ state, guildName }: { state: GameState; guildName: string }) {
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(logPageSize);
  const lines = useMemo(() => logView(state, mine), [state, mine]);
  return (
    <Section
      id="log"
      title="Since your last action"
      help="What happened in the Turns you last played, or from the action you last took, each event as a sentence in the order it happened."
    >
      <label className="choice">
        <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />
        <span>Only what concerns {guildName}</span>
      </label>
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
    </Section>
  );
}
