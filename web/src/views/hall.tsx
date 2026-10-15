// The Hall (M7-S3 part 2; the CLI's `show hall [guildId]` and `build`, M3-S6): each Facility's
// grade, the Improvement built at it and its upkeep, what it does, and the next grade's Improvement,
// cost (`nextImprovement`) and upkeep; in the player's own Hall, a button to build it. Another Guild's Hall is shown
// on its page, without one. The engine's `build` decides.
//
// A part of the Guild, its tab's panel (DL-103, DL-111 items 5 to 7, DL-112 item 5); the
// Guildmaster and the Market are views of their own. Each Facility is one
// row (M9-S6, DL-106; the review's B9): its name, its grade as pips to the top grade content
// defines, its upkeep at that grade, what it does, and "Build <name> · <cost>" with the upkeep at the
// grade it would reach (DL-303). Each upkeep is the Facility's part of the Hall's before the
// Guildmaster's Traits, as the Treasury's parts give it; the Upkeep's charges are the Treasury's.

import type { WorldDocument } from '@heroesim/engine';
import { coinWords } from '@heroesim/words';
import { useMemo } from 'react';
import type { GameAction } from '../state/reducer';
import { hallView, type HallView } from '../state/world-views';
import { Coins } from './coins';
import { Icon } from './icons';

/** The Guild's Hall part: the player's Hall, with Build. */
export function Hall({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const view = useMemo(() => hallView(document), [document]);
  return view === null ? <p>The save has no player’s Guild.</p> : <HallDetails view={view} busy={busy} play={play} />;
}

/** A Hall's Facilities; with `play`, and the Hall the player's own, a Build button for each next grade. */
export function HallDetails({ view, busy = false, play }: { view: HallView; busy?: boolean; play?: (action: GameAction) => void }) {
  const builds = view.mine && play !== undefined;
  return (
    <div className="facilities">
      <ul className="facility-rows" aria-label={`The Facilities of ${view.guildName}'s Hall`}>
        {view.facilities.map((row) => (
          <li key={row.facility} className="facility" data-testid="facility">
            <span className="facility__name">{row.name}</span>
            <span className="facility__grade">
              <span className="pips" role="img" aria-label={`Grade ${row.grade} of ${row.top}`}>
                {'●'.repeat(row.grade)}
                {'○'.repeat(Math.max(0, row.top - row.grade))}
              </span>
              {row.built === 'none' ? null : <span className="subtle">{row.built}</span>}
              <span className="subtle">Upkeep <Coins silver={row.upkeep} /></span>
            </span>
            <span className="facility__does">{row.does}</span>
            <span className="facility__next">
              {row.next === null ? (
                <span className="subtle">At the top grade</span>
              ) : builds && play !== undefined ? (
                <button
                  type="button"
                  aria-label={`Build ${row.next.name} for ${coinWords(row.next.cost)}`}
                  disabled={busy}
                  onClick={() => play({ kind: 'build', facility: row.facility })}
                >
                  <Icon name="build" />
                  <span>
                    Build {row.next.name} · <Coins silver={row.next.cost} />
                  </span>
                </button>
              ) : (
                <span className="subtle">
                  Next: {row.next.name}, <Coins silver={row.next.cost} />
                </span>
              )}
              {row.next === null ? null : (
                <span className="subtle">
                  At grade {row.grade + 1}, upkeep <Coins silver={row.next.upkeep} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
