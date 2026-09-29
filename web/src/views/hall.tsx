// The Hall (M7-S3 part 2; the CLI's `show hall [guildId]` and `build`, M3-S6): each facility's
// grade and the Improvement built at it, what it does, and the next grade's Improvement and cost
// (`nextImprovement`); in the player's own Hall, a button to build it. Another Guild's Hall is shown
// on its page, without one. The engine's `build` decides.
//
// A view of the shell (M9-S3, DL-103), with the Guildmaster, what the Guild holds and the Market as
// its parts. The facilities' rows with grade pips are M9-S6's.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { heldView } from '../state/selectors';
import { hallView, type HallView } from '../state/world-views';
import { Guildmaster } from './guildmaster';
import { Icon } from './icons';
import { Market } from './market';
import { Heading, Part, View } from './section';

export function Hall({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => hallView(document), [document]);
  return (
    <View id="hall">
      {view === null ? <p>The save has no player’s Guild.</p> : <HallDetails view={view} level={3} busy={busy} play={play} />}
      <Guildmaster document={document} />
      <Held document={document} />
      <Market document={document} busy={busy} play={play} />
    </View>
  );
}

/** What the Guild holds: drawn only when it holds something (M9-S3, the review's A5). */
function Held({ document }: { document: WorldDocument }) {
  const held = useMemo(() => heldView(document), [document]);
  if (held.length === 0) return null;
  return (
    <Part id="held">
      <ul className="rows rows--plain">
        {held.map((row) => (
          <li key={row.key}>
            <span>
              <strong>{row.quantity === 1 ? row.name : `${row.quantity} × ${row.name}`}</strong>
              {row.kind === '' ? '' : `, ${row.kind}`}
              {row.modifies === '' ? '' : ` (${row.modifies})`}
            </span>
          </li>
        ))}
      </ul>
    </Part>
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
  level: 3 | 6;
  busy?: boolean;
  play?: (action: GameAction) => void;
}) {
  return (
    <>
      <ul className="cards cards--grid">
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
                  <Icon name="build" />
                  <span>Build {row.next.name}</span>
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="upkeep">
        Upkeep of {view.guildName}: <strong>{view.upkeep}</strong>.
      </p>
    </>
  );
}
