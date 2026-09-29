// The Patrons (M7-S3 part 2; the CLI's `show patrons`, M4-S5): each Patron, their Sphere, and their
// Regard for the player's Guild as a band, which weighs on how often they post to the Board.
//
// A part of the Rankings (M9-S3, DL-103), as one table (M9-S6, DL-106; the review's B5): Patron,
// Sphere, their Regard for the player's Guild, the player's Guildmaster's Regard for them (once a
// list of its own in the Guildmaster's part), and their Quests on the Board now. Regard is a chip on
// one ramp (C8); a Patron neutral both ways is folded under the count of them ("9 neutral").

import type { WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { patronsView, type PatronRow } from '../state/world-views';
import { Icon } from './icons';
import { Part } from './section';
import { Chip, regardTones } from './ui';

export function Patrons({ document, guildName }: { document: WorldDocument; guildName: string }) {
  const rows = useMemo(() => patronsView(document), [document]);
  const [unfolded, setUnfolded] = useState(false);
  const shown = rows.filter((row) => !row.neutral);
  const neutral = rows.filter((row) => row.neutral);
  return (
    <Part id="patrons">
      {rows.length === 0 ? (
        <p>No Patron yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table--first-sticky patrons-table" aria-label="The Patrons">
            <thead>
              <tr>
                <th scope="col">Patron</th>
                <th scope="col">Sphere</th>
                <th scope="col">Their Regard for {guildName}</th>
                <th scope="col">Your Guildmaster’s Regard</th>
                <th scope="col" className="number">
                  Quests on the Board
                </th>
              </tr>
            </thead>
            {shown.length === 0 ? null : (
              <tbody>
                {shown.map((row) => (
                  <Patron key={row.patronId} row={row} />
                ))}
              </tbody>
            )}
            {neutral.length === 0 ? null : (
              <>
                <tbody>
                  <tr className="fold-row">
                    <td colSpan={5}>
                      <button
                        type="button"
                        className="button--quiet fold-button"
                        aria-expanded={unfolded}
                        aria-controls="patrons-neutral"
                        onClick={() => setUnfolded(!unfolded)}
                      >
                        <Icon name="chevron" className="fold-button__mark" />
                        <span>{neutral.length} neutral</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tbody id="patrons-neutral" hidden={!unfolded}>
                  {neutral.map((row) => (
                    <Patron key={row.patronId} row={row} />
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
    </Part>
  );
}

function Patron({ row }: { row: PatronRow }) {
  return (
    <tr data-testid="patron">
      <th scope="row">{row.name}</th>
      <td>{row.sphere}</td>
      <td>{row.regard === null ? <span className="subtle">none</span> : <Chip tone={regardTones[row.regard]}>{row.regard}</Chip>}</td>
      <td>
        {row.guildmasterRegard === null ? (
          <span className="subtle">none</span>
        ) : (
          <Chip tone={regardTones[row.guildmasterRegard]}>{row.guildmasterRegard}</Chip>
        )}
      </td>
      <td className="number">{row.quests}</td>
    </tr>
  );
}
