// A Hero's page (M7-S3; the CLI's `show hero` and `show history <heroId>`): Attributes and State,
// Stats with their hints, gear, Skills, Relationships on the Roster as bands, then the Hero's
// Milestones, which a Hero's page always shows first, and their History, newest first, a page at a
// time. Potential is never shown (M3-S3): the "Outlook" column is the hint word `heroPage` gives,
// and its rows carry no field that could hold the number.
//
// Their History is the History's own page of it (M9-S5, DL-105): grouped by Day and time of day,
// folded and marked as the History view shows it, each name opening whom it names.
//
// Given `play`, it offers what can be done with the Hero where they are (M7-S3 part 2, DL-73): on
// the player's Roster, the CLI's `equip`, `unequip` and `transfer --to`; on another Guild's, its
// `transfer --in`; in the Unattached pool, its `recruit`. The fees are the engine's, and a play the
// engine refuses is said as a sentence.

import type { GuildId, HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState, type ReactNode } from 'react';
import type { GameAction } from '../state/reducer';
import { heroPage, type HeroActions, type LogLine, type StatRow } from '../state/selectors';
import { EntityHistory } from './history-entries';
import { Icon } from './icons';

/** The heading levels a Hero's page takes: its name's, and one below for its parts (M9-S3). */
type Levels = 3 | 4;

function Sub({ level, children }: { level: Levels; children: ReactNode }) {
  return level === 3 ? <h4>{children}</h4> : <h5>{children}</h5>;
}

export function HeroPage({
  document,
  heroId,
  onBack,
  backLabel = 'Back to the Roster',
  play,
  busy = false,
  level = 3,
}: {
  document: WorldDocument;
  heroId: HeroId;
  onBack?: () => void;
  backLabel?: string;
  /** Offers the Hero's actions when given. */
  play?: (action: GameAction) => void;
  busy?: boolean;
  /** The level of the Hero's name: 3 in a view, 4 in a part of one (M9-S3). */
  level?: Levels;
}) {
  const view = useMemo(() => heroPage(document, heroId), [document, heroId]);
  const back =
    onBack === undefined ? null : (
      <div className="actions actions--back">
        <button type="button" className="button--quiet" onClick={onBack}>
          <Icon name="back" />
          <span>{backLabel}</span>
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
  return (
    <article className="hero-page" aria-labelledby="hero-name">
      {back}
      {/* The keyboard may be put on the name when the page opens (the Party builder's drill-down, M9-S4). */}
      {level === 3 ? (
        <h3 id="hero-name" tabIndex={-1}>
          {view.name}
        </h3>
      ) : (
        <h4 id="hero-name" tabIndex={-1}>
          {view.name}
        </h4>
      )}
      <dl className="terms">
        {view.attributes.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <Sub level={level}>Stats</Sub>
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

      <Sub level={level}>Gear</Sub>
      <ul className={own ? 'rows' : undefined}>
        {view.gear.map((gear, index) => (
          <li key={`${gear.slot}-${index}`}>
            <span>
              {capitalised(gear.slot)}: {gear.item}
              {gear.modifies === '' ? '' : ` (${gear.modifies})`}
            </span>
            {own && gear.worn && play !== undefined ? (
              <button type="button" aria-label={`Unequip ${gear.item}`} disabled={busy} onClick={() => play({ kind: 'unequip', heroId, slot: gear.slot })}>
                Unequip
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <Sub level={level}>Skills</Sub>
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
          <Sub level={level}>Relationships on the Roster</Sub>
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
        <HeroActionsView actions={view.actions} heroId={heroId} name={view.name} busy={busy} play={play} level={level} />
      )}

      {/* No Milestone yet, no heading: an empty list is not drawn (M9-S3, the review's A5). */}
      {view.milestones.length === 0 ? null : (
        <>
          <Sub level={level}>Milestones</Sub>
          <Lines lines={view.milestones} empty="" />
        </>
      )}

      <Sub level={level}>History, newest first</Sub>
      <EntityHistory document={document} whose={heroId} level={level === 3 ? 5 : 6} />
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
  level,
}: {
  actions: HeroActions;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
  level: Levels;
}) {
  switch (actions.kind) {
    case 'pool':
      return (
        <>
          <Sub level={level}>Recruit</Sub>
          <p>
            Signing fee {actions.fee} Wealth. Signs for your Guild: {actions.signs}.
          </p>
          <div className="actions">
            <button type="button" className="button--primary" aria-label={`Recruit ${name}`} disabled={busy} onClick={() => play({ kind: 'recruit', heroId })}>
              Recruit
            </button>
          </div>
        </>
      );
    case 'rival':
      return (
        <>
          <Sub level={level}>Transfer</Sub>
          <p>
            Your Guild would pay {actions.guildName} a Transfer fee of {actions.fee} Wealth to take {name} in, if{' '}
            {actions.guildName} is willing to part with them.
          </p>
          <div className="actions">
            <button type="button" aria-label={`Take ${name} in`} disabled={busy} onClick={() => play({ kind: 'transferIn', heroId })}>
              Take in
            </button>
          </div>
        </>
      );
    case 'own':
      return <OwnHeroActions actions={actions} heroId={heroId} name={name} busy={busy} play={play} level={level} />;
  }
}

/** Equip gear the Guild holds, and transfer the Hero out to another Guild in play for the fee it would pay. */
function OwnHeroActions({
  actions,
  heroId,
  name,
  busy,
  play,
  level,
}: {
  actions: Extract<HeroActions, { kind: 'own' }>;
  heroId: HeroId;
  name: string;
  busy: boolean;
  play: (action: GameAction) => void;
  level: Levels;
}) {
  const [to, setTo] = useState<GuildId | ''>('');
  const target = actions.transferTo.find((guild) => guild.guildId === to) ?? actions.transferTo[0];
  return (
    <>
      <Sub level={level}>Equip gear the Guild holds</Sub>
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
              <button type="button" aria-label={`Equip ${gear.name}`} disabled={busy} onClick={() => play({ kind: 'equip', heroId, ...gear.gear })}>
                Equip
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sub level={level}>Transfer</Sub>
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
  if (lines.length === 0) return empty === '' ? null : <p className="subtle">{empty}</p>;
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
