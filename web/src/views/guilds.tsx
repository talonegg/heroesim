// Every Guild (M7-S3 part 2; the CLI's `show guilds`, and `show roster`, `show hall` and `show
// guildmaster` given another Guild's id): each Guild with its controller, Guildmaster, Roster,
// Wealth, Fame and Upkeep, a folded one marked with its Day. Another Guild opens in place (no
// router, M7 §0) on its page: its Roster with the Transfer fee your Guild would pay for each Hero
// and a button to take them in (the CLI's `transfer --in`), its Hall and its Guildmaster; and a
// Hero's page opens from there.
//
// A part of the Rankings (M9-S3, DL-103). The table it merges into and a Rival's page redesigned are
// M9-S6's.

import type { GuildId, HeroId, WorldDocument } from '@heroesim/engine';
import { useMemo, useState } from 'react';
import type { GameAction } from '../state/reducer';
import { guildPage, guildsView, type GuildRow } from '../state/world-views';
import { GuildmasterDetails } from './guildmaster';
import { HallDetails } from './hall';
import { HeroPage } from './hero-page';
import { Icon } from './icons';
import { Part, Terms } from './section';

type Play = (action: GameAction) => void;

export function Guilds({ document, busy, play }: { document: WorldDocument; busy: boolean; play: Play }) {
  const rows = useMemo(() => guildsView(document), [document]);
  const [open, setOpen] = useState<GuildId | null>(null);
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
      <h4 id="guild-page-name">{view.name}</h4>
      <p className="subtle">
        {view.controller}
        {view.folded === null ? '' : `, ${view.folded}`}
      </p>

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
