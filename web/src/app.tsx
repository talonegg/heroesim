// The app shell (M7-S3): one column that stacks, its sections in the order a Turn reads. First the
// header (the Guild, its Wealth and Fame, the Day and time of day, its place in the Rankings), the
// notice of new rules when there are any, and time; then the Board with dispatch, the Roster with
// Hero pages, the Transfer Offers and the Unattached pool; the Market, the Hall, the Guildmaster
// and the Patrons; the Rankings and every Guild; the log of what happened since the last action,
// the whole History, and the game as a file (part 2, DL-73) with the saves kept in this browser
// (M7-S4, DL-67). Before there is a game, a new one, and the saves to load one from.
// Every play goes through `useGame`, the one reducer (M7-S2); no component calls the engine, and
// every number shown comes from a selector under `state/`.
// The modules it installs are those its address names, `?modules=probe`, a test switch, none without
// it; the footer says when one is installed (M8-S4, DL-79).

import type { Module, WorldDocument } from '@heroesim/engine';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { content } from './content';
import { browserSaves, type Saves } from './saves';
import { rulesNotice } from './state/game-file';
import { modulesFromQuery } from './state/modules';
import { listed } from './state/narrate';
import { useGame, type GameState } from './state/reducer';
import { headerView, stopView } from './state/selectors';
import { Board } from './views/board';
import { GameFile } from './views/game-file';
import { Guildmaster } from './views/guildmaster';
import { Guilds } from './views/guilds';
import { Hall } from './views/hall';
import { Header } from './views/header';
import { History } from './views/history';
import { Log } from './views/log';
import { Market } from './views/market';
import { NewGame } from './views/new-game';
import { Offers } from './views/offers';
import { Patrons } from './views/patrons';
import { Pool } from './views/pool';
import { Rankings } from './views/rankings';
import { Refusal } from './views/refusal';
import { Roster } from './views/roster';
import { RulesNotice } from './views/rules-notice';
import type { SectionId } from './views/section';
import { Time } from './views/time';

/** Takes the player to a section of the page and puts the keyboard there: its heading. */
function goTo(section: SectionId): void {
  const heading = document.getElementById(`${section}-heading`);
  heading?.scrollIntoView?.({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

/** The sections a game in hand shows, in order, as the index at the top names them. */
const index: readonly { id: SectionId; label: string }[] = [
  { id: 'time', label: 'Time' },
  { id: 'board', label: 'Board' },
  { id: 'roster', label: 'Roster' },
  { id: 'offers', label: 'Offers' },
  { id: 'pool', label: 'Pool' },
  { id: 'market', label: 'Market' },
  { id: 'hall', label: 'Hall' },
  { id: 'guildmaster', label: 'Guildmaster' },
  { id: 'patrons', label: 'Patrons' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'guilds', label: 'Guilds' },
  { id: 'log', label: 'Since your last action' },
  { id: 'history', label: 'History' },
  { id: 'game', label: 'This game' },
];

/** `the probe module`, `the probe and weather modules`: what the footer says is installed. */
function installedWords(modules: readonly Module[]): string {
  return `the ${listed(modules.map((module) => module.id))} ${modules.length === 1 ? 'module' : 'modules'}`;
}

/** The saves this browser keeps for the page, opened on first use (`saves.ts`). */
const kept = browserSaves();

/** The modules the page's address names, read once, when the page opens: none without the switch. */
function addressModules(): Module[] {
  return typeof window === 'undefined' ? [] : modulesFromQuery(window.location.search);
}

/** The page. `initial` and `saves` are a test's way in: a game already in hand, saves kept elsewhere. */
export function App({ initial, saves = kept }: { initial?: GameState; saves?: Saves }) {
  // Read from the address as the page mounts, and the same for its lifetime, as `useGame` asks.
  const [modules] = useState(addressModules);
  const [game, play] = useGame(initial, modules);
  const { document: current, busy, pending } = game;
  // The game in hand when the player asked for a new one; the form shows while it is still in hand.
  const [replacing, setReplacing] = useState<WorldDocument | null>(null);
  const header = useMemo(() => (current === null ? null : headerView(current)), [current]);
  const notice = useMemo(() => (current === null ? null : rulesNotice(current)), [current]);
  const stop = useMemo(() => stopView(game), [game]);
  const onGoTo = useCallback((section: SectionId) => goTo(section), []);
  const playing = busy && (pending?.kind === 'advance' || pending?.kind === 'fastForward');

  return (
    <div className="app">
      {current === null ? null : <p className="brand">Heroesim</p>}
      <main aria-busy={busy}>
        <Refusal state={game} play={play} />
        {current === null || replacing === current ? (
          <>
            <h1>Heroesim</h1>
            <NewGame saves={saves} busy={busy} play={play} {...(current === null ? {} : { onCancel: () => setReplacing(null) })} />
          </>
        ) : (
          <>
            {header === null ? <h1>Heroesim</h1> : <Header view={header} />}
            <nav className="index" aria-label="Sections">
              <ul>
                {index.map(({ id, label }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        goTo(id);
                      }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {notice === null ? null : <RulesNotice notice={notice} busy={busy} play={play} />}
            <Time busy={busy} playing={playing} ended={current.world.ended !== null} stop={stop} play={play} goTo={onGoTo} />
            {/* Keyed by the game in hand: what one game had open (a Hero's page, a Guild, a Quest's
                Party, whose History) is not open in the next one started or loaded (DL-74). */}
            <Fragment key={game.games}>
              <Board document={current} busy={busy} play={play} />
              <Roster document={current} busy={busy} play={play} />
              <Offers document={current} busy={busy} play={play} />
              <Pool document={current} busy={busy} play={play} />
              <Market document={current} busy={busy} play={play} />
              <Hall document={current} busy={busy} play={play} />
              <Guildmaster document={current} />
              <Patrons document={current} guildName={header?.guildName ?? 'your Guild'} />
              <Rankings document={current} />
              <Guilds document={current} busy={busy} play={play} />
              <Log state={game} guildName={header?.guildName ?? 'your Guild'} />
              <History document={current} busy={busy} play={play} />
            </Fragment>
            <GameFile document={current} state={game} saves={saves} busy={busy} play={play} onNewGame={() => setReplacing(current)} />
          </>
        )}
      </main>
      <footer className="footer">
        <p>
          Content set {content.id}, version {content.version}, loaded.
        </p>
        {modules.length === 0 ? null : <p>Installed for testing: {installedWords(modules)}.</p>}
      </footer>
    </div>
  );
}
