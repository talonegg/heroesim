// The Rankings (M7-S3 part 2; the CLI's `show rankings [--by fame|wealth]`, M3-S5, R10): every Guild
// in play in the engine's order, by Fame or by Wealth as the player chooses. A folded Guild is not
// ranked; the Guilds part lists it.
//
// A view of the shell (M9-S3, DL-103), with every Guild and the Patrons as its parts. The one
// sortable table is M9-S6's.

import type { GuildId, RankingMeasure, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { rankingsView } from '../state/world-views';
import { Guilds } from './guilds';
import { Patrons } from './patrons';
import { View } from './section';

const measures: readonly { by: RankingMeasure; label: string; heading: string }[] = [
  { by: 'fame', label: 'By Fame', heading: 'Fame' },
  { by: 'wealth', label: 'By Wealth', heading: 'Wealth' },
];

export function Rankings({
  document,
  guildName,
  busy,
  play,
  open,
  onOpen,
}: {
  document: WorldDocument;
  guildName: string;
  busy: boolean;
  play: (action: GameAction) => void;
  /** The Guild whose page is open, the shell's, so a name in the History can open it (M9-S5); its own when not given. */
  open?: GuildId | null;
  onOpen?: (guildId: GuildId | null) => void;
}) {
  const [by, setBy] = useState<RankingMeasure>('fame');
  const rows = useMemo(() => rankingsView(document, by), [document, by]);
  const measure = measures.find((each) => each.by === by) ?? measures[0];
  return (
    <View id="rankings">
      <div className="actions" role="group" aria-label="Rank by">
        {measures.map((each) => (
          <button key={each.by} type="button" aria-pressed={by === each.by} onClick={() => setBy(each.by)}>
            {each.label}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table aria-label={`Rankings by ${measure?.heading ?? 'Fame'}`}>
          <thead>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Guild</th>
              <th scope="col">Controller</th>
              <th scope="col" className="number">
                {measure?.heading}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.guildId} className={row.mine ? 'mine' : undefined}>
                <td>{row.place}</td>
                <th scope="row">{row.name}</th>
                <td>{row.controller}</td>
                <td className="number">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Guilds document={document} busy={busy} play={play} {...(open === undefined || onOpen === undefined ? {} : { open, onOpen })} />
      <Patrons document={document} guildName={guildName} />
    </View>
  );
}
