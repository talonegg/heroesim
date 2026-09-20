import type { Career } from '@heroesim/engine';
import { leagueRows, STANDING_EXPLAINED } from '../state/selectors';
import { Sheet } from '../ui/Sheet';

/**
 * The League (E5-S6): every Guild ordered by Standing, and nothing else.
 *
 * Deliberately a list of stacked rows rather than a table. A table of four columns is the
 * one thing on this client that cannot be made to fit 320 pixels without scrolling
 * sideways, and a League that has to be dragged is a League nobody reads on a phone
 * (E8-S3). Each row carries its own labels, so it reads the same at every width.
 *
 * Your row is marked in **text** and is not moved for it: a Guild at the bottom of the
 * League is at the bottom of the League. The footer says what Standing is and is not, so
 * that nothing here reads as a score.
 */
export function League({ career, onClose }: { career: Career; onClose: () => void }) {
  const rows = leagueRows(career);
  return (
    <Sheet title="The League" onClose={onClose}>
      <ul className="cards" data-testid="league">
        {rows.map((row) => (
          <li
            className={row.isPlayer ? 'card card--you' : 'card'}
            key={row.guildId}
            data-testid="league-row"
            data-player={row.isPlayer ? 'yes' : 'no'}
          >
            <h3 className="card__title">
              {row.name}
              {row.isPlayer ? ' — your Guild' : ''}
            </h3>
            <p className="card__line">
              Standing <b>{row.standing}</b> · <b>{row.rosterSize}</b>{' '}
              {row.rosterSize === 1 ? 'Hero' : 'Heroes'} on the Roster
            </p>
          </li>
        ))}
      </ul>
      <p className="card__line" data-testid="league-footer">
        {STANDING_EXPLAINED}
      </p>
    </Sheet>
  );
}
