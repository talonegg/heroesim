// The Hall (M7-S3 part 2; the CLI's `show hall [guildId]` and `build`, M3-S6): each facility's
// grade and the Improvement built at it, what it does, and the next grade's Improvement and cost
// (`nextImprovement`); in the player's own Hall, a button to build it. Another Guild's Hall is shown
// on its page, without one. The engine's `build` decides.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { hallView, type HallView } from '../state/world-views';
import { Heading, Section } from './section';

export function Hall({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => hallView(document), [document]);
  return (
    <Section
      id="hall"
      title="Hall"
      help={
        'Your Guild’s premises. Build raises a facility one grade for the next grade’s cost. Each grade does more than ' +
        'the one below it, and each adds to the Upkeep.'
      }
    >
      {view === null ? <p>The save has no player’s Guild.</p> : <HallDetails view={view} level={3} busy={busy} play={play} />}
    </Section>
  );
}

/** A Hall's facilities and Upkeep; with `play`, and the Hall the player's own, a Build button for each next grade. */
export function HallDetails({
  view,
  level,
  busy = false,
  play,
}: {
  view: HallView;
  level: 3 | 5;
  busy?: boolean;
  play?: (action: GameAction) => void;
}) {
  return (
    <>
      <ul className="cards">
        {view.facilities.map((row) => (
          <li key={row.facility} className="card">
            <Heading level={level}>
              {row.name}: grade {row.grade}
            </Heading>
            <p className="subtle">Built: {row.built}.</p>
            <p>{row.does}</p>
            <p>{row.next === null ? 'At the top grade.' : `Next grade: ${row.next.name}, ${row.next.cost} Wealth.`}</p>
            {view.mine && row.next !== null && play !== undefined ? (
              <div className="actions">
                <button type="button" disabled={busy} onClick={() => play({ kind: 'build', facility: row.facility })}>
                  Build {row.next.name}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p>
        Upkeep of {view.guildName}: {view.upkeep}.
      </p>
    </>
  );
}
