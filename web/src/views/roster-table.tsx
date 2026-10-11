// The Roster as a Table (v1.1.5-S12, DL-169 items 7 to 9): Name with the Portrait's thumbnail, pinned
// as in the Unattached pool; Class, Level, Age, where the Hero is, Traits and Items; their State, Morale and
// Fatigue, each with its band (DL-289); and the 20 Stats at their effective values. A Stat a source raises is green with a ▲ after it, one lowered red
// with a ▼, by the net change; its tooltip and the screen reader's words give the base and each source.
// Traits and Items by name, each effect in a tooltip and the screen reader's words. The Table scrolls in
// its own box. Its headings sort it, the same sort as "Sort by" (`roster.tsx`). Never a Potential.
// The row of a Hero who carries a Unique Item glows gold, with no picture: its Items cell names the
// Item (v1.1.5-S14, DL-182 item 4).
//
// The Guild's Captain has a mark before their Class's in the Name cell (DL-289).
//
// Which columns show is chosen in the Columns panel on a wide screen, its boxes grouped as Hero, State and
// the four areas, All and None for each group, and Reset; Name always shows (DL-169 item 7). On a
// phone, six tabs show one group at a time, the columns hidden on a wide screen hidden in each.

import type { HeroId } from '@heroesim/engine';
import { Fragment, type ReactNode } from 'react';
import type { RosterColumn, RosterColumnGroup, RosterOrder, RosterRow, RosterSortKey, SortDirection } from '../state/selectors';
import { PortraitThumb } from './pictures';
import { HeroName } from './icons';
import { Chip, fatigueTones, moraleTones, SortHeader, StickyTableBox, VisuallyHidden } from './ui';

/** The id of a Hero's name, which opens their page and takes the keyboard back when it closes: the tiles' and the Table's. */
export function nameId(heroId: HeroId): string {
  return `roster-${heroId}`;
}

/** The marks after a raised and a lowered Stat, and the words a screen reader reads in their place. */
const marks = { up: ['▲', 'raised'], down: ['▼', 'lowered'] } as const;

/**
 * Words shown with a tooltip, and the same said with more for the screen reader: the tooltip on the
 * shown part, which the screen reader skips, so that it is the mouse's alone and nothing is read twice
 * (v1.1.5-S10, the close review). `title` null: the words alone.
 */
function Tipped({ shown, title, said, className }: { shown: ReactNode; title: string | null; said: string; className?: string }) {
  if (title === null) return <>{shown}</>;
  return (
    <>
      <span aria-hidden="true" title={title} {...(className === undefined ? {} : { className })}>
        {shown}
      </span>
      <VisuallyHidden>{said}</VisuallyHidden>
    </>
  );
}

/** Things by name, each effect in its tooltip and the screen reader's words; `None` for none. */
function Named({ things }: { things: readonly { name: string; effect: string }[] }) {
  if (things.length === 0) return <span className="subtle">None</span>;
  return things.map((thing, index) => (
    <Fragment key={`${thing.name}-${index}`}>
      {index === 0 ? null : ', '}
      <Tipped shown={thing.name} title={thing.effect === '' ? null : thing.effect} said={`${thing.name}: ${thing.effect}`} className="named-thing" />
    </Fragment>
  ));
}

/** One cell of a Hero's row, by its column. */
function Cell({ row, column }: { row: RosterRow; column: RosterColumn }) {
  switch (column.key) {
    case 'class':
      return <td data-column="class">{row.className}</td>;
    case 'level':
      return (
        <td data-column="level" className="number">
          {row.level}
        </td>
      );
    case 'age':
      return (
        <td data-column="age" className="number">
          {row.age}
        </td>
      );
    case 'morale':
      return (
        <td data-column="morale" className="number">
          <Chip tone={moraleTones[row.moraleBand]}>
            {row.morale}, {row.moraleBand}
          </Chip>
        </td>
      );
    case 'fatigue':
      return (
        <td data-column="fatigue" className="number">
          <Chip tone={fatigueTones[row.fatigueBand]}>
            {row.fatigue}, {row.fatigueBand}
          </Chip>
        </td>
      );
    case 'where':
      return (
        <td data-column="where" className="roster-table__where">
          {row.whereabouts}
        </td>
      );
    case 'traits':
      return (
        <td data-column="traits" className="roster-table__named">
          <Named things={row.traits} />
        </td>
      );
    case 'items':
      return (
        <td data-column="items" className="roster-table__named">
          <Named things={row.items} />
        </td>
      );
    default: {
      const stat = row.stats.find((each) => each.key === column.key);
      if (stat === undefined) return <td data-column={column.key} className="number" />;
      if (stat.change === null) {
        return (
          <td data-column={column.key} className="number">
            <Tipped shown={stat.value} title={stat.words} said={`${stat.value}, ${stat.words ?? ''}`} />
          </td>
        );
      }
      const [mark, said] = marks[stat.change];
      return (
        <td data-column={column.key} className={`number change change--${stat.change}`}>
          <Tipped shown={`${stat.value} ${mark}`} title={stat.words ?? ''} said={`${stat.value}, ${said}: ${stat.words ?? ''}`} />
        </td>
      );
    }
  }
}

/**
 * The Table of `rows` with `columns` after Name. A heading sorts by its column through `onSort`: the
 * sort `order` names is marked on its heading, and each other heading shows the way it first sorts.
 */
export function RosterTable({
  rows,
  columns,
  order,
  firstDirection,
  onSort,
  onOpen,
}: {
  rows: readonly RosterRow[];
  columns: readonly RosterColumn[];
  order: RosterOrder;
  firstDirection: (key: RosterSortKey) => SortDirection;
  onSort: (key: RosterSortKey) => void;
  onOpen: (heroId: HeroId) => void;
}) {
  const heading = (key: RosterSortKey, label: string, number: boolean) => (
    <SortHeader
      key={key}
      label={label}
      direction={order.key === key ? order.direction : firstDirection(key)}
      active={order.key === key}
      onSort={() => onSort(key)}
      {...(number ? { className: 'number' } : {})}
    />
  );
  return (
    <StickyTableBox className="roster-table-wrap">
      <table className="table table--first-sticky roster-table" aria-label="Heroes on the Roster">
        <thead>
          <tr>
            {heading('name', 'Name', false)}
            {columns.map((column) =>
              column.sort === null ? (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ) : (
                heading(column.sort, column.label, column.number)
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.heroId} data-testid="roster-row" {...(row.carriesUnique ? { className: 'carries-unique' } : {})}>
              <th scope="row">
                <span className="named">
                  <PortraitThumb role="hero" sex={row.sex} portraitKey={row.portraitKey} />
                  <button type="button" id={nameId(row.heroId)} className="link" onClick={() => onOpen(row.heroId)}>
                    <HeroName icon={row.classIcon} className={row.className} name={row.name} captain={row.captain} />
                  </button>
                </span>
              </th>
              {columns.map((column) => (
                <Cell key={column.key} row={row} column={column} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </StickyTableBox>
  );
}

/**
 * The Columns panel (DL-169 item 7), on a wide screen: a box for each column, grouped as Hero, State and the
 * four areas, with All and None for each group, and Reset, which shows every one. Name is always shown.
 */
export function ColumnsPanel({
  id,
  groups,
  hidden,
  onHidden,
}: {
  id: string;
  groups: readonly RosterColumnGroup[];
  hidden: readonly string[];
  onHidden: (hidden: string[]) => void;
}) {
  const shown = (keys: readonly string[], show: boolean): void => {
    const rest = hidden.filter((key) => !keys.includes(key));
    onHidden(show ? rest : [...rest, ...keys]);
  };
  return (
    <div className="columns-panel" id={id} role="group" aria-label="Columns">
      <p className="subtle columns-panel__note">Name is always shown.</p>
      <div className="columns-panel__groups">
        {groups.map((group) => {
          const keys = group.columns.map((column) => column.key);
          return (
            <fieldset key={group.key} className="columns-panel__group">
              <legend>{group.label}</legend>
              <div className="columns-panel__all">
                <button type="button" className="button--quiet" aria-label={`All the ${group.label} columns`} onClick={() => shown(keys, true)}>
                  All
                </button>
                <button type="button" className="button--quiet" aria-label={`None of the ${group.label} columns`} onClick={() => shown(keys, false)}>
                  None
                </button>
              </div>
              {group.columns.map((column) => (
                <label key={column.key} className="column-choice">
                  <input type="checkbox" checked={!hidden.includes(column.key)} onChange={(event) => shown([column.key], event.target.checked)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <button type="button" aria-label="Reset the columns" onClick={() => onHidden([])}>
        Reset
      </button>
    </div>
  );
}
