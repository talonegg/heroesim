// Every Guild and the Rankings (M7-S3 part 2; the CLI's `show guilds` and `show rankings [--by
// fame|wealth]`, and `show roster`, `show hall` and `show guildmaster` given another Guild's id).
//
// One table (M9-S6, DL-106; the review's B4): Place, Guild, Disposition, Fame, Wealth, Heroes and
// Upkeep. A column's heading orders the table by it (`guildsTable`), in place of the old By Fame and
// By Wealth toggle. By Fame or by Wealth, the table is the Rankings and Guilds level on the measure
// share a place ("joint 1st", DL-95, DL-91); by any other column the order is for display only, and
// Place still reads by Fame. The order is kept in this browser. The player's Guild's row is marked,
// and a folded Guild is listed last with the Day it folded. Each Guild's name has its Guildmaster's
// thumbnail beside it (v1.1.3-S7, DL-135 item 9: the Rivals list).
//
// A row opens its Guild in place (no router, M7 §0): its page (B10) has its Roster as a table with
// the Transfer fee your Guild would pay for each Hero and "Take in" (the CLI's `transfer --in`), and
// its Hall and Guildmaster folded; a Hero's page opens from its Roster. A part of the Rankings view.
// A Guild's page opens the Guild's History, and a Guild's name in the History opens its page here,
// the player's Guild's included (M9-S5, DL-105): which Guild is open is then the shell's.

import type { GuildId, HeroId, WorldDocument } from '@heroesim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { guildPage, guildsTable, type GuildRow, type GuildSort, type GuildsTable } from '../state/world-views';
import { GuildmasterDetails } from './guildmaster';
import { HallDetails } from './hall';
import { HeroPage } from './hero-page';
import { useHistoryLinks } from './history-entries';
import { Icon } from './icons';
import { GuildBanner, PortraitThumb } from './pictures';
import { rememberChoice, rememberedChoice } from './remembered';
import { Part } from './section';
import { Chip, Disclosure, SortHeader, useReturn, VisuallyHidden, type Direction } from './ui';

type Play = (action: GameAction) => void;

const sorts: readonly GuildSort[] = ['fame', 'wealth', 'name', 'disposition', 'heroes', 'upkeep'];

/** The key this browser keeps the Guilds' order under. */
export const guildsOrderKey = 'heroesim.guildsOrder';

/** Each column that orders the table, in its place, with which way it orders. */
const columns: readonly { sort: GuildSort; label: string; direction: Direction; number: boolean }[] = [
  { sort: 'name', label: 'Guild', direction: 'ascending', number: false },
  { sort: 'disposition', label: 'Disposition', direction: 'ascending', number: false },
  { sort: 'fame', label: 'Fame', direction: 'descending', number: true },
  { sort: 'wealth', label: 'Wealth', direction: 'descending', number: true },
  { sort: 'heroes', label: 'Heroes', direction: 'descending', number: true },
  { sort: 'upkeep', label: 'Upkeep', direction: 'descending', number: true },
];

/** The id of a row's Guild, which opens its page and takes the keyboard back when it closes. */
function rowId(guildId: GuildId): string {
  return `guilds-${guildId}`;
}

export function Guilds({
  document,
  busy,
  play,
  open: given,
  onOpen,
}: {
  document: WorldDocument;
  busy: boolean;
  play: Play;
  /** The Guild whose page is open, when the shell keeps it; the part keeps its own otherwise (M9-S5). */
  open?: GuildId | null;
  onOpen?: (guildId: GuildId | null) => void;
}) {
  const [sort, setSort] = useState<GuildSort>(() => rememberedChoice(guildsOrderKey, sorts, 'fame'));
  const table = useMemo(() => guildsTable(document, sort), [document, sort]);
  const [own, setOwn] = useState<GuildId | null>(null);
  const open = given === undefined ? own : given;
  const setOpen = onOpen ?? setOwn;
  const back = useReturn();
  return (
    <Part id="guilds">
      {open === null ? (
        <GuildsTableView
          table={table}
          sort={sort}
          onSort={(next) => {
            setSort(next);
            rememberChoice(guildsOrderKey, next);
          }}
          onOpen={(guildId) => {
            back.opened(rowId(guildId));
            setOpen(guildId);
          }}
        />
      ) : (
        <GuildPage
          key={open}
          document={document}
          guildId={open}
          busy={busy}
          play={play}
          onBack={() => {
            setOpen(null);
            back.closed();
          }}
        />
      )}
    </Part>
  );
}

function GuildsTableView({
  table,
  sort,
  onSort,
  onOpen,
}: {
  table: GuildsTable;
  sort: GuildSort;
  onSort: (sort: GuildSort) => void;
  onOpen: (guildId: GuildId) => void;
}) {
  const measure = table.measure === 'wealth' ? 'Wealth' : 'Fame';
  return (
    <div className="table-wrap">
      <table className="table guilds-table" aria-label="Every Guild, and the Rankings">
        <thead>
          <tr>
            <th scope="col">
              Place <span className="subtle">by {measure}</span>
            </th>
            {columns.map((column) => (
              <SortHeader
                key={column.sort}
                label={column.label}
                direction={column.direction}
                active={sort === column.sort}
                onSort={() => onSort(column.sort)}
                {...(column.number ? { className: 'number' } : {})}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <GuildLine key={row.guildId} row={row} onOpen={onOpen} />
          ))}
        </tbody>
        {table.folded.length === 0 ? null : (
          <tbody className="guilds-table__folded">
            {table.folded.map((row) => (
              <GuildLine key={row.guildId} row={row} onOpen={onOpen} />
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

/** One Guild's row: its place, or the Day it folded; its name, which opens its page; and its numbers. */
function GuildLine({ row, onOpen }: { row: GuildRow; onOpen: (guildId: GuildId) => void }) {
  return (
    <tr className={row.mine ? 'mine' : row.folded === null ? undefined : 'is-folded'} data-testid="guild-row">
      <td className="guilds-table__place">{row.place ?? row.folded}</td>
      <th scope="row">
        <span className="named">
          {row.guildmaster === null ? null : <PortraitThumb role="guildmaster" sex={row.guildmaster.sex} portraitKey={row.guildmaster.portraitKey} />}
          <button type="button" id={rowId(row.guildId)} className="link" aria-label={`Open ${row.name}`} onClick={() => onOpen(row.guildId)}>
            {row.name}
          </button>
        </span>
        {row.mine ? <VisuallyHidden>, your Guild</VisuallyHidden> : null}
      </th>
      <td>{row.disposition}</td>
      <td className="number">{row.fame}</td>
      <td className="number">{row.wealth}</td>
      <td className="number">{row.heroes}</td>
      <td className="number">{row.upkeep}</td>
    </tr>
  );
}

/** The id of a Roster row's name on a Guild's page, which opens the Hero's page and takes the keyboard back. */
function heroRowId(heroId: HeroId): string {
  return `guild-hero-${heroId}`;
}

function GuildPage({
  document,
  guildId,
  busy,
  play,
  onBack,
}: {
  document: WorldDocument;
  guildId: GuildId;
  busy: boolean;
  play: Play;
  onBack: () => void;
}) {
  const view = useMemo(() => guildPage(document, guildId), [document, guildId]);
  const [hero, setHero] = useState<HeroId | null>(null);
  const back = useReturn();
  const links = useHistoryLinks();
  // The keyboard goes to the Guild's name as its page opens, and to a Hero's as theirs does; closing
  // a Hero's page returns it to their row (`useReturn`).
  useEffect(() => {
    globalThis.document.getElementById('guild-page-name')?.focus();
  }, []);
  useEffect(() => {
    if (hero !== null) globalThis.document.getElementById('hero-name')?.focus();
  }, [hero]);
  const toGuilds = (
    <div className="actions actions--back">
      <button type="button" className="button--quiet" onClick={onBack}>
        <Icon name="back" />
        <span>Back to the Guilds</span>
      </button>
    </div>
  );
  if (view === null) {
    return (
      <div>
        <p>That Guild is not in the world.</p>
        {toGuilds}
      </div>
    );
  }
  if (hero !== null) {
    return (
      <HeroPage
        key={hero}
        document={document}
        heroId={hero}
        onBack={() => {
          setHero(null);
          back.closed();
        }}
        backLabel={`Back to ${view.name}`}
        play={play}
        busy={busy}
        level={4}
      />
    );
  }
  return (
    <article className="guild-page" aria-labelledby="guild-page-name">
      {toGuilds}
      {/* The Guild's Banner beside its name, the largest of its Banners (v1.1.2-S2, DL-125 item 7). */}
      <h4 id="guild-page-name" className="titled" tabIndex={-1}>
        <GuildBanner guild={view.guildId} large />
        <span>{view.name}</span>
      </h4>
      <p className="guild-page__line">
        {view.controller} · {view.background}
        {view.folded === null ? '' : ` · ${view.folded}`}
      </p>
      <ul className="chips" aria-label={`${view.name}'s standing`}>
        <li>
          <Chip tone="brass" icon="wealth">
            {view.wealth}
            <VisuallyHidden> Wealth</VisuallyHidden>
          </Chip>
        </li>
        <li>
          <Chip tone="brass" icon="fame">
            {view.fame}
            <VisuallyHidden> Fame</VisuallyHidden>
          </Chip>
        </li>
      </ul>
      {links === null ? null : (
        <div className="actions">
          <button type="button" aria-label={`Read the History of ${view.name}`} onClick={() => links.onHistory(view.guildId)}>
            <Icon name="history" />
            <span>Read its History</span>
          </button>
        </div>
      )}

      <h5>Roster</h5>
      {view.roster.length === 0 ? (
        <p>The Roster is empty.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table--first-sticky" aria-label={`The Roster of ${view.name}`}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Class</th>
                <th scope="col" className="number">
                  Level
                </th>
                <th scope="col" className="number">
                  Age
                </th>
                {view.mine ? null : (
                  <>
                    <th scope="col" className="number">
                      Transfer fee
                    </th>
                    <th scope="col">
                      <VisuallyHidden>Take in</VisuallyHidden>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {view.roster.map((row) => (
                <tr key={row.heroId} data-testid="guild-hero">
                  <th scope="row">
                    <button
                      type="button"
                      id={heroRowId(row.heroId)}
                      className="link"
                      onClick={() => {
                        back.opened(heroRowId(row.heroId));
                        setHero(row.heroId);
                      }}
                    >
                      {row.name}
                    </button>
                  </th>
                  <td>{row.className}</td>
                  <td className="number">{row.level}</td>
                  <td className="number">{row.age}</td>
                  {view.mine ? null : (
                    <>
                      <td className="number" data-testid="fee">
                        {row.fee}
                      </td>
                      <td>
                        {row.fee === null ? null : (
                          <button type="button" aria-label={`Take ${row.name} in`} disabled={busy} onClick={() => play({ kind: 'transferIn', heroId: row.heroId })}>
                            Take in
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Disclosure summary="Hall">
        <HallDetails view={view.hall} />
      </Disclosure>
      {view.guildmaster === null ? (
        <p>The Guild has no Guildmaster.</p>
      ) : (
        <Disclosure summary={`Guildmaster: ${view.guildmaster.name}`}>
          <GuildmasterDetails view={view.guildmaster} level={5} />
        </Disclosure>
      )}
    </article>
  );
}
