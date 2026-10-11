// The Roster (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes, and one Hero's
// page in their place when chosen. No router (M7 §0): which Hero is open is this view's own state,
// and "Back to the Roster" closes the page. A Hero's page offers equip, unequip and transfer out
// (part 2, DL-73).
//
// A view of the shell (M9-S3, DL-103), with the Transfer Offers, only while one stands, and the
// Unattached pool as its parts. Each Hero is a compact card (M9-S6, DL-106): their name, Class, Level
// and age, a Morale chip, and where they are, injured or away shown by an icon and its words. Their
// page opens with the keyboard on their name, and closing it returns the keyboard to their card, or
// to the Roster's heading when a filter now hides them or they left (DL-213).
// Their thumbnail stands beside their name (v1.1.3-S7, DL-135 item 9), the small Silhouette while
// they have no picture. The Guild's Captain has a mark before their Class's, on the tile, in the Table and
// beside the name on a phone, and a tile has a Fatigue chip beside Morale's (DL-289).
//
// Tiles or a Table (v1.1.5-S12, DL-169 items 6 to 11): "Tiles | Table" at the top, Tiles the first
// time; the tiles add each Trait with what it does and each Item the Hero carries, and no Stat; the
// Table is `roster-table.tsx`'s. One "Sort by" serves both, with a button for its direction, the
// Table's headings in step with it, ties in the default order. The view, the columns hidden, the
// phone's tab and the sort are kept in this browser (`remembered.ts`), never in the save.
//
// Unique Items (v1.1.5-S14, DL-182 item 4): on a tile, a Unique Item's picture before its name in its
// chip, and the tile of a Hero who carries one a thin gold glow; in the Table, their row the glow.
//
// Filters (DL-206 items 25 to 29, DL-213, DL-289): by Class, by availability, and by the band of Morale and of
// Fatigue, several choices each, each group's name (Class, Where, Morale, Fatigue) shown before its chips, not kept; the tiles, the Table and the phone's
// tabs show the same Heroes, the rows kept for the document sorted and then filtered
// (`rosterFacets`). Tiles or Table is a choice of one of its own (`OneChoice`).

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import {
  orderWords,
  reverseOrderName,
  rosterColumnGroups,
  rosterFacets,
  rosterRows,
  rosterSortChoices,
  rosterTableColumns,
  sortedRoster,
  type RosterOrder,
  type RosterRow,
  type RosterSortKey,
} from '../state/selectors';
import { HeroPage } from './hero-page';
import { HeroName, Icon } from './icons';
import { Offers } from './offers';
import { ItemPicture, PortraitThumb } from './pictures';
import { Pool } from './pool';
import { preferences, useRemembered } from './remembered';
import { ColumnsPanel, nameId, RosterTable } from './roster-table';
import { headingOf, View } from './section';
import { Chip, fatigueTones, FilterChips, moraleTones, OneChoice, Tabs, useFacets, useNarrow, useReturn } from './ui';

/** How the Roster shows its Heroes. */
type ShownAs = 'tiles' | 'table';

const shownAsChoices: readonly { key: ShownAs; label: string }[] = [
  { key: 'tiles', label: 'Tiles' },
  { key: 'table', label: 'Table' },
];

/** A sort as this browser keeps it: `level:descending`. */
function keptOrder(order: RosterOrder): string {
  return `${order.key}:${order.direction}`;
}

/** The sort a kept one names. */
function orderKept(kept: string): RosterOrder {
  const [key = 'default', direction] = kept.split(':');
  return { key, direction: direction === 'descending' ? 'descending' : 'ascending' };
}

export function Roster({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const groups = useMemo(() => rosterColumnGroups(), []);
  const sorts = useMemo(() => rosterSortChoices(), []);
  const tableColumns = useMemo(() => rosterTableColumns(groups), [groups]);
  const columnKeys = useMemo(() => groups.flatMap((group) => group.columns.map((column) => column.key)), [groups]);
  const [shownAs, setShownAs] = useRemembered(preferences.rosterView);
  const [keptOrderOf, keepOrder] = useRemembered(preferences.rosterOrder);
  // One value while the sort kept is the same, so that the rows are sorted only when it changes (DL-205).
  const order = useMemo(() => orderKept(keptOrderOf), [keptOrderOf]);
  const [hidden, setHidden] = useRemembered(preferences.rosterColumns);
  const [tab, setTab] = useRemembered(preferences.rosterTab);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const narrow = useNarrow();
  // The rows are built once a document (`rosterRows`), and a new sort only sorts them (v1.1.6-S13, DL-186 item 22).
  const built = useMemo(() => rosterRows(document), [document]);
  const sorted = useMemo(() => sortedRoster(built, order), [built, order]);
  const facets = useMemo(() => rosterFacets(), []);
  // Filtered after the sort, so that a filter builds and sorts nothing again (DL-199).
  const { rows, filters } = useFacets(sorted, facets);
  const [open, setOpen] = useState<HeroId | null>(null);
  // A Hero a filter now hides, or who left, returns the keyboard to the Roster's heading (DL-213).
  const back = useReturn(headingOf('roster'));
  useEffect(() => {
    if (open !== null) globalThis.document.getElementById('hero-name')?.focus();
  }, [open]);

  const firstDirection = (key: RosterSortKey) => sorts.find((sort) => sort.key === key)?.first ?? 'ascending';
  const sortBy = (next: RosterOrder): void => {
    keepOrder(keptOrder(next));
  };
  /** The sort in force, the other way. */
  const reversed = (): RosterOrder => ({ key: order.key, direction: order.direction === 'ascending' ? 'descending' : 'ascending' });
  /** A heading's sort in its first direction, or the other way when it is the sort in force. */
  const sortByHeading = (key: RosterSortKey): void => sortBy(order.key === key ? reversed() : { key, direction: firstDirection(key) });
  const opened = (heroId: HeroId): void => {
    back.opened(nameId(heroId));
    setOpen(heroId);
  };
  const hide = (next: string[]): void => {
    const sorted = columnKeys.filter((key) => next.includes(key));
    setHidden(sorted);
  };

  if (open !== null) {
    return (
      <View id="roster">
        <HeroPage
          key={open}
          document={document}
          heroId={open}
          onBack={() => {
            setOpen(null);
            back.closed();
          }}
          play={play}
          busy={busy}
        />
      </View>
    );
  }

  const table = (columns: RosterGroupColumns) => (
    <RosterTable rows={rows} columns={columns} order={order} firstDirection={firstDirection} onSort={sortByHeading} onOpen={opened} />
  );
  // In the wide Table's order, State after the Hero's short columns (DL-289, Q21 a); a phone's tab keeps its group's.
  const shownColumns = (keys: readonly string[]): RosterGroupColumns => tableColumns.filter((column) => keys.includes(column.key) && !hidden.includes(column.key));
  const tabGroup = groups.find((group) => group.key === tab) ?? groups[0];
  const tabColumns = shownColumns(tabGroup?.columns.map((column) => column.key) ?? []);

  return (
    <View id="roster">
      <p className="view__lead">{sorted.length === 0 ? 'The Roster is empty.' : `${sorted.length} ${sorted.length === 1 ? 'Hero' : 'Heroes'} on the Roster.`}</p>
      {sorted.length === 0 ? null : (
        <>
          <div className="roster__bar">
            <OneChoice label="Show the Roster as" options={shownAsChoices} chosen={shownAs} onChoose={setShownAs} />
            <div className="roster__sort">
              <label className="field field--inline">
                <span>Sort by</span>
                <select value={order.key} onChange={(event) => sortBy({ key: event.target.value, direction: firstDirection(event.target.value) })}>
                  {sorts
                    .filter((sort) => sort.area === null)
                    .map((sort) => (
                      <option key={sort.key} value={sort.key}>
                        {sort.label}
                      </option>
                    ))}
                  {/* The Stat areas by their kind, not by where a group stands: State has no Stat to sort by (DL-289). */}
                  {groups
                    .filter((group) => group.kind === 'stat-area')
                    .map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {sorts
                          .filter((sort) => sort.area === group.label)
                          .map((sort) => (
                            <option key={sort.key} value={sort.key}>
                              {sort.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="roster__direction"
                data-testid="roster-direction"
                aria-label={reverseOrderName(order.key, order.direction)}
                onClick={() => sortBy(reversed())}
              >
                {/* The name says the action, then the direction (DL-185); the tooltip stays a mouse's, read once. */}
                <span className="roster__direction-shown" aria-hidden="true" title="Reverse the order">
                  <Icon name={order.direction === 'ascending' ? 'up' : 'down'} />
                  <span>{orderWords(order.key, order.direction)}</span>
                </span>
              </button>
              {shownAs === 'table' && !narrow ? (
                <button type="button" aria-expanded={columnsOpen} aria-controls="roster-columns" onClick={() => setColumnsOpen(!columnsOpen)}>
                  Columns
                </button>
              ) : null}
            </div>
          </div>
          {shownAs === 'table' && !narrow && columnsOpen ? <ColumnsPanel id="roster-columns" groups={groups} hidden={hidden} onHidden={hide} /> : null}
          <div className="roster__filters">
            <FilterChips {...filters.class} labelShown />
            <FilterChips {...filters.availability} labelShown />
            <FilterChips {...filters.morale} labelShown />
            <FilterChips {...filters.fatigue} labelShown />
          </div>
          {/* Said as a filter changes it (DL-206 item 28). */}
          <div role="status" className="roster__shown">
            {rows.length === sorted.length ? null : (
              <p className="subtle" data-testid="roster-shown">
                {rows.length === 0
                  ? 'No Hero on the Roster matches the filters.'
                  : `Showing ${rows.length} of ${sorted.length} ${sorted.length === 1 ? 'Hero' : 'Heroes'}.`}
              </p>
            )}
          </div>
          {rows.length === 0 ? null : shownAs === 'tiles' ? (
            <ul className="cards hero-cards" aria-label="Heroes on the Roster">
              {rows.map((row) => (
                <li key={row.heroId} className={row.carriesUnique ? 'card hero-card carries-unique' : 'card hero-card'}>
                  <HeroCard row={row} onOpen={() => opened(row.heroId)} />
                </li>
              ))}
            </ul>
          ) : narrow ? (
            <Tabs
              label="Columns of the Table"
              tabs={groups.map(({ key, label }) => ({ key, label }))}
              open={tabGroup?.key ?? 'hero'}
              onOpen={(key) => {
                setTab(key);
              }}
              idOf={(key) => `roster-tab-${key}`}
            >
              {table(tabColumns)}
              {tabColumns.length === 0 ? <p className="subtle">The columns of this tab are hidden: show them from Columns on a wider screen.</p> : null}
            </Tabs>
          ) : (
            table(shownColumns(columnKeys))
          )}
        </>
      )}
      <Offers document={document} busy={busy} play={play} />
      <Pool document={document} busy={busy} play={play} />
    </View>
  );
}

/** The columns a Table shows after Name. */
type RosterGroupColumns = ReturnType<typeof rosterColumnGroups>[number]['columns'];

/**
 * A Hero on the Roster: who, their Class, Level and Age, their Morale and Fatigue, and where they are; then each
 * Trait with what it does, and each Item they carry, its effect in its tooltip and the screen
 * reader's words (v1.1.5-S12, DL-169 item 9). No Stat (Q12). A Unique Item's picture stands before
 * its name, and a Hero who carries one has their tile glow gold, which says nothing the Items' names
 * do not (v1.1.5-S14, DL-182 item 4).
 */
function HeroCard({ row, onOpen }: { row: RosterRow; onOpen: () => void }) {
  return (
    <>
      <span className="named">
        <PortraitThumb role="hero" sex={row.sex} portraitKey={row.portraitKey} />
        <button type="button" id={nameId(row.heroId)} className="link" onClick={onOpen}>
          <HeroName icon={row.classIcon} className={row.className} name={row.name} captain={row.captain} />
        </button>
      </span>
      <p className="hero-card__line">
        {row.className} · Level {row.level} · Age {row.age}
      </p>
      <p className="hero-card__state">
        <Chip tone={moraleTones[row.moraleBand]} icon="morale">
          Morale {row.morale}, {row.moraleBand}
        </Chip>
        <Chip tone={fatigueTones[row.fatigueBand]} icon="fatigue">
          Fatigue {row.fatigue}, {row.fatigueBand}
        </Chip>
        {row.why === 'injured' ? (
          <Chip tone="warn" icon="injury">
            {row.whereabouts}
          </Chip>
        ) : row.why === 'in-party' ? (
          <Chip tone="accent" icon="travel">
            {row.whereabouts}
          </Chip>
        ) : (
          <Chip icon="hall">{row.whereabouts}</Chip>
        )}
      </p>
      {row.traits.length === 0 ? null : (
        <p className="hero-card__state hero-card__traits">
          {row.traits.map((trait) => (
            <Chip key={trait.name} tone="accent" title="Trait">
              {trait.name}: {trait.effect}
            </Chip>
          ))}
        </p>
      )}
      {row.items.length === 0 ? null : (
        <p className="hero-card__state hero-card__items">
          {row.items.map((item, index) => (
            <Chip
              key={`${item.name}-${index}`}
              {...(item.unique ? { picture: <ItemPicture definitionKey={item.definitionKey} /> } : {})}
              {...(item.effect === '' ? {} : { title: item.effect, spoken: `${item.name}: ${item.effect}` })}
            >
              {item.name}
            </Chip>
          ))}
        </p>
      )}
    </>
  );
}
