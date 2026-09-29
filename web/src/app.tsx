// The page (M7-S3; M9-S3, DL-103): views in a shell, in place of one column of sections (DL-99
// item 1). The status bar stays in view on every view, with the Guild, its standing, time and the
// game menu, and a refusal docked under it. The navigation opens one view at a time: Guild, the
// home view's digest of what needs attention; the Board; the Roster with the Transfer Offers and the
// Unattached pool; the Hall with the Guildmaster, what the Guild holds and the Market; the Rankings
// with the Guilds and the Patrons; and the History, the one place to read what happened, the last
// play's entries its newest (M9-S5, DL-105). From 1100px the History rail sits beside the view.
// Before there is a game, a new one, and the saves to load one from.
//
// A name in the History opens whom it names, wherever the History is drawn: a Hero's page, in the
// History; a Guild's page, in the Rankings; a Guildmaster's or a Patron's History (`HistoryLinks`).
//
// Views switch as React state, with no router (R38): the page stays one page with one classic
// script that opens from `file://`. Which view is open is remembered in this browser; a new game or
// a load opens the home view, and so does the end of a fast forward, whose stop and results it
// shows. Each view is a labelled region whose heading takes the keyboard when it opens.
//
// Every play goes through `useGame`, the one reducer (M7-S2); no component calls the engine, and
// every number shown comes from a selector under `state/`. The modules it installs are those its
// address names, `?modules=probe`, a test switch, none without it (M8-S4, DL-79).

import type { GuildId, Module, QuestId, WorldDocument } from '@heroesim/engine';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { content } from './content';
import { browserSaves, type Saves } from './saves';
import { navCounts, type OutcomeRow } from './state/digest';
import type { HistoryWhose } from './state/history';
import { rulesNotice } from './state/game-file';
import { modulesFromQuery } from './state/modules';
import { useGame, type GameState } from './state/reducer';
import { headerView, progressView, stopView } from './state/selectors';
import { Board } from './views/board';
import { GameMenu, installedWords } from './views/game-menu';
import { GuildView } from './views/guild';
import { Hall } from './views/hall';
import { History } from './views/history';
import { HistoryLinksContext, type HistoryLinks, type NameSegment } from './views/history-entries';
import { Nav } from './views/nav';
import { NewGame } from './views/new-game';
import { Rail } from './views/rail';
import { Rankings } from './views/rankings';
import { Refusal } from './views/refusal';
import { rememberedView, rememberView } from './views/remembered';
import { Roster } from './views/roster';
import { headingOf, viewIds, viewOf, type PartId, type SectionId, type ViewId } from './views/section';
import { StatusBar } from './views/status-bar';

/** The saves this browser keeps for the page, opened on first use (`saves.ts`). */
const kept = browserSaves();

/** The modules the page's address names, read once, when the page opens: none without the switch. */
function addressModules(): Module[] {
  return typeof window === 'undefined' ? [] : modulesFromQuery(window.location.search);
}

/** The view that holds `target`. */
function viewFor(target: SectionId): ViewId {
  if ((viewIds as readonly string[]).includes(target)) return target as ViewId;
  return viewOf[target as PartId] ?? 'guild';
}

/** Where the keyboard goes next, and a fresh object each time it is asked, so it goes there again. */
interface Focus {
  id: string;
  /** Where it goes when `id` is not on the page: the open view's heading. */
  fallback: string;
}

/** The page. `initial` and `saves` are a test's way in: a game already in hand, saves kept elsewhere. */
export function App({ initial, saves = kept }: { initial?: GameState; saves?: Saves }) {
  // Read from the address as the page mounts, and the same for its lifetime, as `useGame` asks.
  const [modules] = useState(addressModules);
  const [game, play] = useGame(initial, modules);
  const { document: current, busy, pending } = game;
  // The game in hand when the player asked for a new one; the form shows while it is still in hand.
  const [replacing, setReplacing] = useState<WorldDocument | null>(null);
  const [view, setView] = useState<ViewId>(rememberedView);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the shell keeps for the views: the Quest whose Party is open, so the home view can open
  // one; the Guild whose page is open in the Rankings, so a name can open it; and whose History is
  // shown, the player's Guild's at first, a choice that holds while the game is in hand (DL-74 item
  // 8, DL-99 item 2).
  const [boardQuest, setBoardQuest] = useState<QuestId | null>(null);
  const [rankingsGuild, setRankingsGuild] = useState<GuildId | null>(null);
  const [whose, setWhose] = useState<HistoryWhose>(null);
  // The page the History opens on: its newest, save when the home view opens an outcome where it stands.
  const [historyStart, setHistoryStart] = useState(0);
  const [focus, setFocus] = useState<Focus | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLElement>(null);

  const header = useMemo(() => (current === null ? null : headerView(current)), [current]);
  const notice = useMemo(() => (current === null ? null : rulesNotice(current)), [current]);
  const stop = useMemo(() => stopView(game), [game]);
  const progress = useMemo(() => progressView(game), [game]);
  const counts = useMemo(() => navCounts({ document: current, log: game.log }), [current, game.log]);
  const playing = busy && (pending?.kind === 'advance' || pending?.kind === 'fastForward');
  const forwarding = busy && pending?.kind === 'fastForward';

  /** Opens the view that holds `target` and puts the keyboard on `target`'s heading, or on `id` when given. */
  const open = useCallback((target: SectionId, id?: string) => {
    const next = viewFor(target);
    setView(next);
    setMenuOpen(false);
    setFocus({ id: id ?? headingOf(target), fallback: headingOf(next) });
  }, []);

  /** Opens `whose` History in the History view, at its newest, with the keyboard on its title. */
  const openHistory = useCallback(
    (next: HistoryWhose) => {
      setWhose(next);
      open('history', 'history-title');
    },
    [open],
  );

  /** A name in the History: a Guild's page in the Rankings; a Hero's page, or anyone else's History, in the History. */
  const openName = useCallback(
    (name: NameSegment) => {
      if (name.table === 'guilds') {
        setRankingsGuild(name.entityId as GuildId);
        open('rankings', 'guild-page-name');
      } else openHistory(name.entityId);
    },
    [open, openHistory],
  );

  /** How a Party fared, from the home view: its line in the player's Guild's History, on its page, with the keyboard on it. */
  const openOutcome = useCallback(
    (outcome: OutcomeRow) => {
      setWhose(null);
      setHistoryStart(outcome.page ?? 0);
      open('history', outcome.anchor);
    },
    [open],
  );

  const links = useMemo<HistoryLinks>(() => ({ log: game.log, onName: openName, onHistory: openHistory }), [game.log, openName, openHistory]);

  // A new game or a load: the home view, and nothing the last game had open (DL-74 item 7).
  const [games, setGames] = useState(game.games);
  if (games !== game.games) {
    setGames(game.games);
    setView('guild');
    setMenuOpen(false);
    setBoardQuest(null);
    setRankingsGuild(null);
    setWhose(null);
    setFocus({ id: headingOf('guild'), fallback: headingOf('guild') });
  }

  // The end of a fast forward, by its stop or the player's: the home view, which says why and what
  // came of it. In the same render as the end, so the page is never idle on the view it left.
  const [wasForwarding, setWasForwarding] = useState(forwarding);
  if (wasForwarding !== forwarding) {
    setWasForwarding(forwarding);
    if (wasForwarding && game.rejection === null) {
      setView('guild');
      setMenuOpen(false);
      setFocus({ id: headingOf('guild'), fallback: headingOf('guild') });
    }
  }

  useEffect(() => rememberView(view), [view]);

  // Away from the History, it opens at its newest again.
  if (view !== 'history' && historyStart !== 0) setHistoryStart(0);

  useEffect(() => {
    if (focus === null) return;
    const target = document.getElementById(focus.id) ?? document.getElementById(focus.fallback);
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [focus]);

  // What sticks below the status bar starts where it ends, however tall a long name or a refusal
  // makes it: its height, as a length the stylesheet reads. Where nothing measures (jsdom), none.
  useLayoutEffect(() => {
    const element = bar.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const measured = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--status-h', `${Math.round(element.getBoundingClientRect().height)}px`);
    });
    measured.observe(element);
    return () => measured.disconnect();
  }, [current, replacing]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);

  if (current === null || replacing === current || header === null) {
    return (
      <div className="app app--start">
        <main aria-busy={busy} className="start">
          <Refusal state={game} play={play} />
          <p className="brand" aria-hidden="true">
            A Guild-management simulation
          </p>
          <h1>Heroesim</h1>
          <NewGame saves={saves} busy={busy} play={play} {...(current === null ? {} : { onCancel: () => setReplacing(null) })} />
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

  const shared = { document: current, busy, play };
  const guildName = header.guildName;
  return (
    <div className="app" data-view={view}>
      <StatusBar
        view={header}
        busy={busy}
        playing={playing}
        ended={current.world.ended !== null}
        progress={progress}
        play={play}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(!menuOpen)}
        onGuild={() => open('guild')}
        menuButton={menuButton}
        bar={bar}
      >
        <Refusal state={game} play={play} />
      </StatusBar>
      <HistoryLinksContext value={links}>
      <div className="shell">
        <Nav current={view} counts={counts} onOpen={(next) => open(next)} />
        <main aria-busy={busy} className="main">
          {/* Keyed by the game in hand: what one game had open (a Hero's page, a Guild, whose
              History) is not open in the next one started or loaded (DL-74). */}
          <Fragment key={game.games}>
            {view === 'guild' ? (
              <GuildView
                state={game}
                document={current}
                header={header}
                notice={notice}
                stop={stop}
                busy={busy}
                play={play}
                onGo={(target) => (target === 'history' ? openHistory(null) : open(target))}
                onOpenQuest={(questId) => {
                  setBoardQuest(questId);
                  open('board', `quest-${questId}`);
                }}
                onOpenMenu={() => setMenuOpen(true)}
                onReadOutcome={openOutcome}
              />
            ) : null}
            {view === 'board' ? <Board {...shared} open={boardQuest} onOpen={setBoardQuest} /> : null}
            {view === 'roster' ? <Roster {...shared} /> : null}
            {view === 'hall' ? <Hall {...shared} /> : null}
            {view === 'rankings' ? <Rankings {...shared} guildName={guildName} open={rankingsGuild} onOpen={setRankingsGuild} /> : null}
            {view === 'history' ? <History {...shared} whose={whose} onWhose={setWhose} startPage={historyStart} /> : null}
          </Fragment>
        </main>
        <Rail state={game} onOpenHistory={() => openHistory(null)} />
      </div>
      </HistoryLinksContext>
      {modules.length === 0 ? null : (
        <footer className="footer footer--shell">
          <p>Installed for testing: {installedWords(modules)}.</p>
        </footer>
      )}
      {menuOpen ? (
        <GameMenu
          document={current}
          state={game}
          saves={saves}
          busy={busy}
          play={play}
          notice={notice}
          modules={modules}
          onClose={closeMenu}
          onNewGame={() => {
            setMenuOpen(false);
            setReplacing(current);
          }}
        />
      ) : null}
    </div>
  );
}
