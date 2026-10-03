// The Roster (M7-S3; the CLI's `show roster` and `show hero`): the player's Heroes, and one Hero's
// page in their place when chosen. No router (M7 §0): which Hero is open is this view's own state,
// and "Back to the Roster" closes the page. A Hero's page offers equip, unequip and transfer out
// (part 2, DL-73).
//
// A view of the shell (M9-S3, DL-103), with the Transfer Offers, only while one stands, and the
// Unattached pool as its parts. Each Hero is a compact card (M9-S6, DL-106): their name, Class, Level
// and age, a Morale chip, and where they are, injured or away shown by an icon and its words. Their
// page opens with the keyboard on their name, and closing it returns the keyboard to their card.
// Their thumbnail stands beside their name (v1.1.3-S7, DL-135 item 9), the small Silhouette while
// they have no picture.
//
// Tiles or a Table (v1.1.5-S12, DL-169 items 6 to 11): "Tiles | Table" at the top, Tiles the first
// time; the tiles add each Trait with what it does and each Item the Hero carries, and no Stat; the
// Table is `roster-table.tsx`'s. One "Sort by" serves both, with a button for its direction, the
// Table's headings in step with it, ties in the default order. The view, the columns hidden, the
// phone's tab and the sort are kept in this browser (`remembered.ts`), never in the save.

import type { HeroId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { orderWords, rosterColumnGroups, rosterSortChoices, rosterView, type RosterOrder, type RosterRow, type RosterSortKey } from '../state/selectors';
import { HeroPage } from './hero-page';
import { Icon } from './icons';
import { Offers } from './offers';
import { PortraitThumb } from './pictures';
import { Pool } from './pool';
import { rememberChoice, rememberedChoice, rememberedList, rememberList } from './remembered';
import { ColumnsPanel, nameId, RosterTable } from './roster-table';
import { View } from './section';
import { Chip, FilterChips, moraleTones, Tabs, useNarrow, useReturn } from './ui';

/** The keys this browser keeps the Roster's choices under (DL-169 item 11). */
export const rosterViewKey = 'heroesim.rosterView';
export const rosterColumnsKey = 'heroesim.rosterColumns';
export const rosterTabKey = 'heroesim.rosterTab';
export const rosterOrderKey = 'heroesim.rosterOrder';

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

export function Roster({ document, busy, play }: { document: WorldDocument; busy: boolean; play: (action: GameAction) => void }) {
  const groups = useMemo(() => rosterColumnGroups(), []);
  const sorts = useMemo(() => rosterSortChoices(), []);
  const columnKeys = useMemo(() => groups.flatMap((group) => group.columns.map((column) => column.key)), [groups]);
  const [shownAs, setShownAs] = useState<ShownAs>(() =>
    rememberedChoice(
      rosterViewKey,
      shownAsChoices.map(({ key }) => key),
      'tiles',
    ),
  );
  const [order, setOrder] = useState<RosterOrder>(() => {
    const kept = rememberedChoice(
      rosterOrderKey,
      sorts.flatMap(({ key }) => [`${key}:ascending`, `${key}:descending`]),
      null,
    );
    const [key = 'default', direction] = kept?.split(':') ?? [];
    return { key, direction: direction === 'descending' ? 'descending' : 'ascending' };
  });
  const [hidden, setHidden] = useState<readonly string[]>(() => rememberedList(rosterColumnsKey, columnKeys) ?? []);
  const [tab, setTab] = useState<string>(() =>
    rememberedChoice(
      rosterTabKey,
      groups.map(({ key }) => key),
      'hero',
    ),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const narrow = useNarrow();
  const rows = useMemo(() => rosterView(document, order), [document, order]);
  const [open, setOpen] = useState<HeroId | null>(null);
  const back = useReturn();
  useEffect(() => {
    if (open !== null) globalThis.document.getElementById('hero-name')?.focus();
  }, [open]);

  const firstDirection = (key: RosterSortKey) => sorts.find((sort) => sort.key === key)?.first ?? 'ascending';
  const sortBy = (next: RosterOrder): void => {
    setOrder(next);
    rememberChoice(rosterOrderKey, keptOrder(next));
  };
  /** A heading's sort in its first direction, or the other way when it is the sort in force. */
  const sortByHeading = (key: RosterSortKey): void =>
    sortBy(order.key === key ? { key, direction: order.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: firstDirection(key) });
  const opened = (heroId: HeroId): void => {
    back.opened(nameId(heroId));
    setOpen(heroId);
  };
  const hide = (next: string[]): void => {
    const sorted = columnKeys.filter((key) => next.includes(key));
    setHidden(sorted);
    rememberList(rosterColumnsKey, sorted);
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
  const shownColumns = (keys: readonly string[]): RosterGroupColumns =>
    groups.flatMap((group) => group.columns).filter((column) => keys.includes(column.key) && !hidden.includes(column.key));
  const tabGroup = groups.find((group) => group.key === tab) ?? groups[0];
  const tabColumns = shownColumns(tabGroup?.columns.map((column) => column.key) ?? []);

  return (
    <View id="roster">
      <p className="view__lead">{rows.length === 0 ? 'The Roster is empty.' : `${rows.length} ${rows.length === 1 ? 'Hero' : 'Heroes'} on the Roster.`}</p>
      {rows.length === 0 ? null : (
        <>
          <div className="roster__bar">
            <FilterChips
              label="Show the Roster as"
              options={shownAsChoices}
              shown={shownAs}
              all={null}
              onShow={(key) => {
                if (key === null) return;
                setShownAs(key);
                rememberChoice(rosterViewKey, key);
              }}
            />
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
                  {groups.slice(1).map((group) => (
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
                title="Reverse the order"
                onClick={() => sortBy({ key: order.key, direction: order.direction === 'ascending' ? 'descending' : 'ascending' })}
              >
                <Icon name={order.direction === 'ascending' ? 'up' : 'down'} />
                <span>{orderWords(order.key, order.direction)}</span>
              </button>
              {shownAs === 'table' && !narrow ? (
                <button type="button" aria-expanded={columnsOpen} aria-controls="roster-columns" onClick={() => setColumnsOpen(!columnsOpen)}>
                  Columns
                </button>
              ) : null}
            </div>
          </div>
          {shownAs === 'table' && !narrow && columnsOpen ? <ColumnsPanel id="roster-columns" groups={groups} hidden={hidden} onHidden={hide} /> : null}
          {shownAs === 'tiles' ? (
            <ul className="cards hero-cards" aria-label="Heroes on the Roster">
              {rows.map((row) => (
                <li key={row.heroId} className="card hero-card">
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
                rememberChoice(rosterTabKey, key);
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
 * A Hero on the Roster: who, their Class, Level and Age, their Morale, and where they are; then each
 * Trait with what it does, and each Item they carry, its effect in its tooltip and the screen
 * reader's words (v1.1.5-S12, DL-169 item 9). No Stat (Q12).
 */
function HeroCard({ row, onOpen }: { row: RosterRow; onOpen: () => void }) {
  return (
    <>
      <span className="named">
        <PortraitThumb role="hero" sex={row.sex} portraitKey={row.portraitKey} />
        <button type="button" id={nameId(row.heroId)} className="link" onClick={onOpen}>
          {row.name}
        </button>
      </span>
      <p className="hero-card__line">
        {row.className} · Level {row.level} · Age {row.age}
      </p>
      <p className="hero-card__state">
        <Chip tone={moraleTones[row.moraleBand]} icon="morale">
          Morale {row.morale}, {row.moraleBand}
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
            <Chip key={`${item.name}-${index}`} {...(item.effect === '' ? {} : { title: item.effect, spoken: `${item.name}: ${item.effect}` })}>
              {item.name}
            </Chip>
          ))}
        </p>
      )}
    </>
  );
}
