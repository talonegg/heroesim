// The Rankings (M7-S3 part 2; the CLI's `show rankings [--by fame|wealth]`, M3-S5, R10): every Guild
// in play in the engine's order, by Fame or by Wealth as the player chooses. A folded Guild is not
// ranked; the Guilds section lists it.

import type { RankingMeasure, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { rankingsView } from '../state/world-views';
import { Section } from './section';

const measures: readonly { by: RankingMeasure; label: string; heading: string }[] = [
  { by: 'fame', label: 'By Fame', heading: 'Fame' },
  { by: 'wealth', label: 'By Wealth', heading: 'Wealth' },
];

export function Rankings({ document }: { document: WorldDocument }) {
  const [by, setBy] = useState<RankingMeasure>('fame');
  const rows = useMemo(() => rankingsView(document, by), [document, by]);
  const measure = measures.find((each) => each.by === by) ?? measures[0];
  return (
    <Section id="rankings" title="Rankings" help="Every Guild in play, ordered by its Fame or by its Wealth: choose which.">
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
    </Section>
  );
}
