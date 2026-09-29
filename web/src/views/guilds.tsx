// Every Guild (M7-S3 part 2; the CLI's `show guilds`, and `show roster`, `show hall` and `show
// guildmaster` given another Guild's id): each Guild with its controller, Guildmaster, Roster,
// Wealth, Fame and Upkeep, a folded one marked with its Day. Another Guild opens in place (no
// router, M7 §0) on its page: its Roster with the Transfer fee your Guild would pay for each Hero
// and a button to take them in (the CLI's `transfer --in`), its Hall and its Guildmaster; and a
// Hero's page opens from there.
//
// A part of the Rankings (M9-S3, DL-103). The table it merges into and a Rival's page redesigned are
// M9-S6's. A Guild's page opens the Guild's History, and a Guild's name in the History opens its
// page here, the player's Guild's included (M9-S5, DL-105).

import type { GuildId, HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { guildPage, guildsView, type GuildRow } from '../state/world-views';
import { GuildmasterDetails } from './guildmaster';
import { HallDetails } from './hall';
import { HeroPage } from './hero-page';
import { useHistoryLinks } from './history-entries';
import { Icon } from './icons';
import { Part, Terms } from './section';

type Play = (action: GameAction) => void;

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
  /** The Guild whose page is open, when the shell keeps it; the part keeps its own otherwise. */
  open?: GuildId | null;
  onOpen?: (guildId: GuildId | null) => void;
}) {
  const rows = useMemo(() => guildsView(document), [document]);
  const [own, setOwn] = useState<GuildId | null>(null);
  const open = given === undefined ? own : given;
  const setOpen = onOpen ?? setOwn;
  return (
    <Part id="guilds">
      {open === null ? (
        <ul className="cards">
          {rows.map((row) => (
            <li key={row.guildId} className="card">
              <GuildCard row={row} onOpen={() => setOpen(row.guildId)} />
            </li>
          ))}
        </ul>
      ) : (
        <GuildPage key={open} document={document} guildId={open} busy={busy} play={play} onBack={() => setOpen(null)} />
      )}
    </Part>
  );
}

function GuildCard({ row, onOpen }: { row: GuildRow; onOpen: () => void }) {
  return (
    <>
      <p>
        <strong>{row.name}</strong>, {row.controller}
        {row.folded === null ? '' : `, ${row.folded}`}
      </p>
      <Terms
        pairs={[
          ['Guildmaster', row.guildmaster],
          ['Background', row.background],
          ['Roster', `${row.roster} ${row.roster === 1 ? 'Hero' : 'Heroes'}`],
          ['Wealth', row.wealth],
          ['Fame', row.fame],
          ['Upkeep', row.upkeep],
        ]}
      />
      {row.mine ? null : (
        <div className="actions">
          <button type="button" aria-label={`Open ${row.name}`} onClick={onOpen}>
            Open
          </button>
        </div>
      )}
    </>
  );
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
  const links = useHistoryLinks();
  const back = (
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
        {back}
      </div>
    );
  }
  if (hero !== null) {
    return <HeroPage key={hero} document={document} heroId={hero} onBack={() => setHero(null)} backLabel={`Back to ${view.name}`} play={play} busy={busy} level={4} />;
  }
  return (
    <article className="guild-page" aria-labelledby="guild-page-name">
      {back}
      <h4 id="guild-page-name" tabIndex={-1}>
        {view.name}
      </h4>
      <p className="subtle">
        {view.controller}
        {view.folded === null ? '' : `, ${view.folded}`}
      </p>
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
        <ul className="cards">
          {view.roster.map((row) => (
            <li key={row.heroId} className="card hero-row">
              <button type="button" className="link" onClick={() => setHero(row.heroId)}>
                {row.name}
              </button>
              <p>
                {row.className}, Level {row.level}, age {row.age}. Morale {row.morale}. {row.background}.
              </p>
              {row.fee === null ? null : (
                <>
                  <p>Transfer fee {row.fee} Wealth.</p>
                  <div className="actions">
                    <button type="button" aria-label={`Take ${row.name} in`} disabled={busy} onClick={() => play({ kind: 'transferIn', heroId: row.heroId })}>
                      Take in
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h5>Hall</h5>
      <HallDetails view={view.hall} level={6} />

      {view.guildmaster === null ? <p>The Guild has no Guildmaster.</p> : <GuildmasterDetails view={view.guildmaster} level={5} />}
    </article>
  );
}
