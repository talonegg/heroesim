// A Hero's page (M7-S3; the CLI's `show hero` and `show history <heroId>`): Attributes and State,
// Stats with their hints, gear, Skills, Relationships on the Roster as bands, then the Hero's
// Milestones, which a Hero's page always shows first, and their History, newest first, a page at a
// time. Potential is never shown (M3-S3): the "Outlook" column is the hint word `heroPage` gives,
// and its rows carry no field that could hold the number.
//
// Given `play`, it offers what can be done with the Hero where they are (M7-S3 part 2, DL-73): on
// the player's Roster, the CLI's `equip`, `unequip` and `transfer --to`; on another Guild's, its
// `transfer --in`; in the Unattached pool, its `recruit`. The fees are the engine's, and a play the
// engine refuses is said as a sentence.

import type { GuildId, HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { heroPage, type HeroActions, type LogLine, type StatRow } from '../state/selectors';

export function HeroPage({
  document,
  heroId,
  onBack,
  backLabel = 'Back to the Roster',
  play,
  busy = false,
}: {
  document: WorldDocument;
  heroId: HeroId;
  onBack?: () => void;
  backLabel?: string;
  /** Offers the Hero's actions when given. */
  play?: (action: GameAction) => void;
  busy?: boolean;
}) {
  const [page, setPage] = useState(0);
  const view = useMemo(() => heroPage(document, heroId, page), [document, heroId, page]);
  const back =
    onBack === undefined ? null : (
      <div className="actions">
        <button type="button" onClick={onBack}>
          {backLabel}
        </button>
      </div>
    );
  const own = play !== undefined && view?.actions?.kind === 'own';
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
      <ul className={own ? 'rows' : undefined}>
        {view.gear.map((gear, index) => (
          <li key={`${gear.slot}-${index}`}>
            <span>
              {capitalised(gear.slot)}: {gear.item}
              {gear.modifies === '' ? '' : ` (${gear.modifies})`}
            </span>
            {own && gear.worn && play !== undefined ? (
              <button type="button" disabled={busy} onClick={() => play({ kind: 'unequip', heroId, slot: gear.slot })}>
                Unequip {gear.item}
              </button>
            ) : null}
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

      {play === undefined || view.actions === null ? null : (
        <HeroActionsView actions={view.actions} heroId={heroId} name={view.name} busy={busy} play={play} />
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

/** What can be done with the Hero where they are: the player's own, a Rival's, or one in the pool. */
function HeroActionsView({
  actions,
  heroId,
  name,
  busy,
  play,
}: {
  actions: HeroActions;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  switch (actions.kind) {
    case 'pool':
      return (
        <>
          <h4>Recruit</h4>
          <p>
            Signing fee {actions.fee} Wealth. Signs for your Guild: {actions.signs}.
          </p>
          <div className="actions">
            <button type="button" className="button--primary" disabled={busy} onClick={() => play({ kind: 'recruit', heroId })}>
              Recruit {name}
            </button>
          </div>
        </>
      );
    case 'rival':
      return (
        <>
          <h4>Transfer</h4>
          <p>
            Your Guild would pay {actions.guildName} a Transfer fee of {actions.fee} Wealth to take {name} in, if{' '}
            {actions.guildName} is willing to part with them.
          </p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => play({ kind: 'transferIn', heroId })}>
              Take {name} in
            </button>
          </div>
        </>
      );
    case 'own':
      return <OwnHeroActions actions={actions} heroId={heroId} name={name} busy={busy} play={play} />;
  }
}

/** Equip gear the Guild holds, and transfer the Hero out to another Guild in play for the fee it would pay. */
function OwnHeroActions({
  actions,
  heroId,
  name,
  busy,
  play,
}: {
  actions: Extract<HeroActions, { kind: 'own' }>;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
}) {
  const [to, setTo] = useState<GuildId | ''>('');
  const target = actions.transferTo.find((guild) => guild.guildId === to) ?? actions.transferTo[0];
  return (
    <>
      <h4>Equip gear the Guild holds</h4>
      {actions.equip.length === 0 ? (
        <p>The Guild holds no gear; the Market sells it.</p>
      ) : (
        <ul className="rows">
          {actions.equip.map((gear) => (
            <li key={gear.key}>
              <span>
                {gear.name}, {gear.kind}
                {gear.modifies === '' ? '' : ` (${gear.modifies})`}
              </span>
              <button type="button" disabled={busy} onClick={() => play({ kind: 'equip', heroId, ...gear.gear })}>
                Equip {gear.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4>Transfer</h4>
      {target === undefined ? (
        <p>No other Guild is in play to take {name}.</p>
      ) : (
        <>
          <p className="note">
            The other Guild must be willing to take {name}, and pays the fee. Their gear stays with your Guild, and the
            Heroes left behind who held them in high Regard lose Morale.
          </p>
          <label className="field">
            <span>Transfer {name} to</span>
            <select value={target.guildId} onChange={(event) => setTo(event.target.value as GuildId)}>
              {actions.transferTo.map((guild) => (
                <option key={guild.guildId} value={guild.guildId}>
                  {guild.name}, for {guild.fee} Wealth
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => play({ kind: 'transferOut', heroId, toGuildId: target.guildId })}>
              Transfer {name} to {target.name}
            </button>
          </div>
        </>
      )}
    </>
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
