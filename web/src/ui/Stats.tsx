import type { Stats as StatBlock } from '@heroesim/engine';
import { STATS } from '../state/selectors';

/** The four Stats as four labelled numbers, in their canonical order. */
export function Stats({ stats }: { stats: StatBlock }) {
  return (
    <dl className="stats">
      {STATS.map((stat) => (
        <div className="stat" key={stat}>
          <dt>{stat}</dt>
          <dd>{stats[stat]}</dd>
        </div>
      ))}
    </dl>
  );
}
