// The Guildmaster (M7-S3 part 2; the CLI's `show guildmaster [guildId]`, M4-S5): the player's
// Guildmaster in their own section, another Guild's on its page. Their Stats and what each bears
// on, their Traits and what each does, and their Regard for every Patron, each Hero on their Roster
// and each other Guild in play, as bands and never as numbers (pre-M0 review B3).

import type { WorldDocument } from '@heroesim/engine';
import { useMemo } from 'react';
import { guildmasterView, type GuildmasterView, type RegardRow } from '../state/world-views';
import { Heading, Section, Terms } from './section';

export function Guildmaster({ document }: { document: WorldDocument }) {
  const view = useMemo(() => guildmasterView(document), [document]);
  return (
    <Section
      id="guildmaster"
      title="Guildmaster"
      help={
        'Your character in the world. Their Stats bear on running the Guild, never on fighting: each says what it bears ' +
        'on. Their Traits help or hinder the Guild, and their Regard for others is shown as a band.'
      }
    >
      {view === null ? <p>The Guild has no Guildmaster.</p> : <GuildmasterDetails view={view} level={3} />}
    </Section>
  );
}

export function GuildmasterDetails({ view, level }: { view: GuildmasterView; level: 3 | 4 }) {
  const sub = level === 3 ? 4 : 5;
  return (
    <div className="guildmaster">
      <Heading level={level}>
        {view.name}, Guildmaster of {view.guildName}
      </Heading>
      <Terms pairs={view.attributes} />

      <Heading level={sub}>Stats</Heading>
      <div className="table-wrap">
        <table>
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

      <Heading level={sub}>Traits</Heading>
      {view.traits.length === 0 ? (
        <p>none</p>
      ) : (
        <ul>
          {view.traits.map((trait) => (
            <li key={trait.name}>
              {trait.name}: {trait.effect}
            </li>
          ))}
        </ul>
      )}

      <Heading level={sub}>Regard for Patrons</Heading>
      <Regard rows={view.patrons} />
      <Heading level={sub}>Regard for Heroes on the Roster</Heading>
      <Regard rows={view.heroes} />
      <Heading level={sub}>Regard for the other Guilds, through their Guildmasters</Heading>
      <Regard rows={view.guilds} />
    </div>
  );
}

function Regard({ rows }: { rows: readonly RegardRow[] }) {
  if (rows.length === 0) return <p>none</p>;
  return (
    <ul>
      {rows.map((row, index) => (
        <li key={`${row.name}-${index}`}>
          {row.name}, {row.detail}: {row.regard}
        </li>
      ))}
    </ul>
  );
}
