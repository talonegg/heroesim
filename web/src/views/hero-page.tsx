// A Hero's page (M7-S3; the CLI's `show hero` and `show history <heroId>`): Attributes and State,
// Stats with their hints, gear, Skills, Relationships on the Roster as bands, then the Hero's
// Milestones, which a Hero's page always shows first, and their History, newest first, a page at a
// time. Potential is never shown (M3-S3): the "Outlook" column is the hint word `heroPage` gives,
// and its rows carry no field that could hold the number.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import { heroPage, type LogLine, type StatRow } from '../state/selectors';

export function HeroPage({ document, heroId, onBack }: { document: WorldDocument; heroId: HeroId; onBack?: () => void }) {
  const [page, setPage] = useState(0);
  const view = useMemo(() => heroPage(document, heroId, page), [document, heroId, page]);
  const back =
    onBack === undefined ? null : (
      <div className="actions">
        <button type="button" onClick={onBack}>
          Back to the Roster
        </button>
      </div>
    );
  if (view === null) {
    return (
      <div className="hero-page">
        <p>That Hero is no longer in the world.</p>
        {back}
      </div>
    );
  }
  const { history } = view;
  return (
    <article className="hero-page" aria-labelledby="hero-name">
      {back}
      <h3 id="hero-name">{view.name}</h3>
      <dl className="terms">
        {view.attributes.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h4>Stats</h4>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col" className="number">
                Base
              </th>
              <th scope="col" className="number">
                Effective
              </th>
              <th scope="col">Outlook</th>
            </tr>
          </thead>
          {areas(view.stats).map(([area, rows]) => (
            <tbody key={area}>
              <tr>
                <th scope="colgroup" colSpan={4} className="area">
                  {area}
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td className="number">{row.base}</td>
                  <td className="number">{row.effective}</td>
                  <td>{row.outlook}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <h4>Gear</h4>
      <ul>
        {view.gear.map((gear, index) => (
          <li key={`${gear.slot}-${index}`}>
            {capitalised(gear.slot)}: {gear.item}
            {gear.modifies === '' ? '' : ` (${gear.modifies})`}
          </li>
        ))}
      </ul>

      <h4>Skills</h4>
      {view.skills.length === 0 ? (
        <p>none</p>
      ) : (
        <ul>
          {view.skills.map((skill) => (
            <li key={skill.name}>
              {skill.name} {skill.rating}
            </li>
          ))}
        </ul>
      )}

      {view.relationships === null ? null : (
        <>
          <h4>Relationships on the Roster</h4>
          {view.relationships.length === 0 ? (
            <p>none</p>
          ) : (
            <ul>
              {view.relationships.map((mate) => (
                <li key={mate.name}>
                  {mate.name}, {mate.className}: Regard {mate.regard}, Relationship {mate.relationship}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h4>Milestones</h4>
      <Lines lines={view.milestones} empty="None yet." />

      <h4>History, newest first</h4>
      <p className="subtle">
        Page {history.page + 1} of {history.pages}, {history.entries} {history.entries === 1 ? 'entry' : 'entries'} in all.
      </p>
      <Lines lines={history.lines} empty="Nothing yet." />
      <div className="actions">
        <button type="button" disabled={history.page === 0} onClick={() => setPage(history.page - 1)}>
          Newer
        </button>
        <button type="button" disabled={history.page >= history.pages - 1} onClick={() => setPage(history.page + 1)}>
          Older
        </button>
      </div>
    </article>
  );
}

/** Lines of the History, each with when it fell. */
export function Lines({ lines, empty }: { lines: readonly LogLine[]; empty: string }) {
  if (lines.length === 0) return <p>{empty}</p>;
  return (
    <ol className="lines">
      {lines.map((line) => (
        <li key={line.key} className={line.milestone ? 'milestone' : undefined}>
          <span className="when">{line.when}</span> {line.sentence}
        </li>
      ))}
    </ol>
  );
}

/** The Stats grouped by area, in content's order: each row names its area only on the first of it. */
function areas(stats: readonly StatRow[]): [string, StatRow[]][] {
  const groups: [string, StatRow[]][] = [];
  for (const row of stats) {
    const last = groups.at(-1);
    if (row.area !== '' || last === undefined) groups.push([row.area, [row]]);
    else last[1].push(row);
  }
  return groups;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
