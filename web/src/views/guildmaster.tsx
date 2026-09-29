// The Guildmaster (M7-S3 part 2; the CLI's `show guildmaster [guildId]`, M4-S5): the player's
// Guildmaster in a view of their own, another Guild's on its page. Their Stats and what each bears
// on, their Traits and what each does, and their Regard for every Patron, each Hero on their Roster
// and each other Guild in play, as bands and never as numbers (pre-M0 review B3).
//
// A part of the Hall (M9-S3, DL-103) until M9-F2 made it the Guildmaster view, at the top of the
// navigation (DL-111 item 7, DL-112 item 5). Their Sex and Age, then the descriptive Attributes written
// (M9-S2), each only when set; each Trait with its effect's words; and Regard as chips on one ramp
// from hostile to close, the neutral ones folded under their count (M9-S6, DL-106; the review's C8).
// A Guildmaster opens their History (M9-S5, DL-105).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { guildmasterView, type GuildmasterView, type RegardRow } from '../state/world-views';
import { useHistoryLinks } from './history-entries';
import { Icon } from './icons';
import { Heading, Terms, View } from './section';
import { Chip, Folded, regardTones } from './ui';

/** The Guildmaster view: the player's Guildmaster. */
export function Guildmaster({ document }: { document: WorldDocument }) {
  const view = useMemo(() => guildmasterView(document), [document]);
  return (
    <View id="guildmaster">
      {view === null ? <p>The Guild has no Guildmaster.</p> : <GuildmasterDetails view={view} level={3} />}
    </View>
  );
}

/** A Guildmaster's details under a heading at `level`: 3 in the Guildmaster view, 5 on a Guild's page. */
export function GuildmasterDetails({ view, level }: { view: GuildmasterView; level: 3 | 5 }) {
  const sub = level === 3 ? 4 : 6;
  const links = useHistoryLinks();
  return (
    <div className="guildmaster">
      <Heading level={level}>
        {view.name}, Guildmaster of {view.guildName}
      </Heading>
      <Terms pairs={view.attributes} />
      {links === null ? null : (
        <div className="actions">
          <button type="button" aria-label={`Read the History of ${view.name}`} onClick={() => links.onHistory(view.guildmasterId)}>
            <Icon name="history" />
            <span>Read their History</span>
          </button>
        </div>
      )}

      <div className="guildmaster__grid">
        <div>
          <Heading level={sub}>Stats</Heading>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Stat</th>
                  <th scope="col" className="number">
                    Value
                  </th>
                  <th scope="col">Bears on</th>
                </tr>
              </thead>
              <tbody>
                {view.stats.map((stat) => (
                  <tr key={stat.name}>
                    <th scope="row">{stat.name}</th>
                    <td className="number">{stat.value}</td>
                    <td>{stat.bearsOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Heading level={sub}>Traits</Heading>
          {view.traits.length === 0 ? (
            <p className="subtle">none</p>
          ) : (
            <ul className="traits" aria-label={`${view.name}'s Traits`}>
              {view.traits.map((trait) => (
                <li key={trait.name}>
                  <Chip tone="accent">{trait.name}</Chip> <span>{trait.effect}</span>
                </li>
              ))}
            </ul>
          )}

          <Heading level={sub}>Regard</Heading>
          <Regard label="For Patrons" rows={view.patrons} />
          <Regard label="For Heroes on the Roster" rows={view.heroes} />
          <Regard label="For the other Guilds, through their Guildmasters" rows={view.guilds} />
        </div>
      </div>
    </div>
  );
}

/** One kind of Regard, each row a name, what they are and the band as a chip; the neutral ones folded. */
function Regard({ label, rows }: { label: string; rows: readonly RegardRow[] }) {
  return (
    <div className="regard-group">
      <p className="caption">{label}</p>
      <Folded
        rows={rows}
        label={label}
        row={(row) => (
          <>
            <span className="regards__name">{row.name}</span> <span className="regards__detail">{row.detail}</span>
            <span className="regards__bands">
              <Chip tone={regardTones[row.regard]}>{row.regard}</Chip>
            </span>
          </>
        )}
      />
    </div>
  );
}
