// The Hall (M7-S3 part 2; the CLI's `show hall [guildId]` and `build`, M3-S6): each facility's
// grade and the Improvement built at it, what it does, and the next grade's Improvement and cost
// (`nextImprovement`); in the player's own Hall, a button to build it. Another Guild's Hall is shown
// on its page, without one. The engine's `build` decides.
//
// A view of the shell (M9-S3, DL-103), with the Guildmaster, the Market and what the Guild holds as
// its parts. Each facility is one row (M9-S6, DL-106; the review's B9): its name, its grade as pips
// to the top grade content defines, what it does, and "Build <name> · <cost>"; the Upkeep, which each
// grade adds to, sits above them. What the Guild holds is one table with Sell, the second table
// after the Market's (B3), so selling is next to buying.

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { hallView, type HallView } from '../state/world-views';
import { Guildmaster } from './guildmaster';
import { Icon } from './icons';
import { heldCount, Holdings, Market } from './market';
import { Part, View } from './section';
import { VisuallyHidden } from './ui';

export function Hall({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => hallView(document), [document]);
  return (
    <View id="hall">
      {view === null ? <p>The save has no player’s Guild.</p> : <HallDetails view={view} busy={busy} play={play} />}
      <Guildmaster document={document} />
      <Market document={document} busy={busy} play={play} />
      <Held document={document} busy={busy} play={play} />
    </View>
  );
}

/** What the Guild holds, with Sell: drawn only when it holds something (M9-S3, the review's A5). */
function Held({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const count = useMemo(() => heldCount(document), [document]);
  if (count === 0) return null;
  return (
    <Part id="held">
      <Holdings document={document} busy={busy} play={play} />
    </Part>
  );
}

/** A Hall's facilities and Upkeep; with `play`, and the Hall the player's own, a Build button for each next grade. */
export function HallDetails({ view, busy = false, play }: { view: HallView; busy?: boolean; play?: (action: GameAction) => void }) {
  const builds = view.mine && play !== undefined;
  return (
    <div className="facilities">
      <p className="upkeep">
        <Icon name="wealth" />
        <span>
          Upkeep of {view.guildName}: <strong>{view.upkeep}</strong>
        </span>
      </p>
      <ul className="facility-rows" aria-label={`The facilities of ${view.guildName}'s Hall`}>
        {view.facilities.map((row) => (
          <li key={row.facility} className="facility" data-testid="facility">
            <span className="facility__name">{row.name}</span>
            <span className="facility__grade">
              <span className="pips" role="img" aria-label={`Grade ${row.grade} of ${row.top}`}>
                {'●'.repeat(row.grade)}
                {'○'.repeat(Math.max(0, row.top - row.grade))}
              </span>
              {row.built === 'none' ? null : <span className="subtle">{row.built}</span>}
            </span>
            <span className="facility__does">{row.does}</span>
            <span className="facility__next">
              {row.next === null ? (
                <span className="subtle">At the top grade</span>
              ) : builds && play !== undefined ? (
                <button
                  type="button"
                  aria-label={`Build ${row.next.name} for ${row.next.cost} Wealth`}
                  disabled={busy}
                  onClick={() => play({ kind: 'build', facility: row.facility })}
                >
                  <Icon name="build" />
                  <span>
                    Build {row.next.name} · {row.next.cost}
                  </span>
                  <Icon name="wealth" />
                </button>
              ) : (
                <span className="subtle">
                  Next: {row.next.name}, {row.next.cost}
                  <VisuallyHidden> Wealth</VisuallyHidden>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
