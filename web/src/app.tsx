// The page (M7-S3; M9, DL-103 to DL-107): views in a shell, which replaced M7's one column of
// fourteen sections (DL-99 item 1). The status bar stays in view on every view, with the Guild, its
// standing, time and the game menu, and a refusal docked under it. The navigation opens one view at
// a time: Guild, the home view's digest of what needs attention; the Board, with its Quest cards and
// the Party builder (M9-S4, DL-104); the Roster with the Transfer Offers and the Unattached pool;
// the Rankings with the Guilds and the Patrons; and the History, the one place to read what
// happened, the last play's entries its newest (M9-S5, DL-105).
//
// Seven views since M9-F2 (DL-111 items 5 to 8, DL-112 item 5, DL-115), and the Hall view gone. The
// Guildmaster is a view at the top of the navigation, the Market a view with Buy and Sell, and the
// Guild has parts as tabs, Home and Hall, the Hall with Build (M9-F3 adds Stores and Treasury). The
// Guild's part open is the shell's, remembered in this browser as the view is. The navigation has
// one order at every width: under 600px a bottom bar holds Guild, Roster, Board and Rankings, and
// "More" the Guildmaster, the Market and the History; from 600px a side rail holds all seven; from
// 1100px the History rail sits beside the view. Before there is a game, the new-game form with the
// Guildmaster's setup (M9-S7, DL-107), and the saves to load one from.
//
// A name in the History opens whom it names, wherever the History is drawn: a Hero's page, in the
// History; a Guild's page, in the Rankings; a Guildmaster's or a Patron's History (`HistoryLinks`).
//
// A Party's return (M9-F5, DL-111 items 2 and 3, DL-112 item 8): a play that brings a Party of the
// player's home, one Turn or a fast forward, opens Guild › Home at its Quest report, with the keyboard
// on the report's heading, from whichever view; its entry in the rail or the History opens its report
// there again, in Home's place until it is closed or the next play.
//
// Views switch as React state, with no router (R38): the page stays one page with one classic
// script that opens from `file://`. Which view is open is remembered in this browser, and so is the
// Board's order; a Party chosen on the Board and not sent is kept here, by Quest. A new game or
// a load opens the home view, the Guild at its Home, and so does the end of a fast forward, whose
// stop and results it shows. Each view is a labelled region whose heading takes the keyboard when it opens.
//
// Every play goes through `useGame`, the one reducer (M7-S2); no component calls the engine, and
// every number shown comes from a selector under `state/`. The modules it installs are those its
// address names, `?modules=probe`, a test switch, none without it (M8-S4, DL-79).

import type { GuildId, Module, QuestId, WorldDocument } from '@heroesim/engine';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { content } from './content';
import { browserSaves, type Saves } from './saves';
import { navCounts } from './state/digest';
import type { HistoryWhose } from './state/history';
import { returnsIn, type ReturnKey } from './state/quest-return';
import { rulesNotice } from './state/game-file';
import { modulesFromQuery } from './state/modules';
import { noPartyChoices, standingChoices, withChoice, type PartyChoices } from './state/party-choices';
import { useGame, type GameState } from './state/reducer';
import { headerView, progressView, stopView, type BoardOrder } from './state/selectors';
import { Board, boardOrderKey, boardOrders } from './views/board';
import { GameMenu, installedWords } from './views/game-menu';
import { GuildView } from './views/guild';
import { Guildmaster } from './views/guildmaster';
import { History } from './views/history';
import { HistoryLinksContext, type HistoryLinks, type NameSegment } from './views/history-entries';
import { Market } from './views/market';
import { Nav } from './views/nav';
import { NewGame } from './views/new-game';
import { reportHeadingId } from './views/quest-report';
import { Rail } from './views/rail';
import { Rankings } from './views/rankings';
import { Refusal } from './views/refusal';
import {
  rememberChoice,
  rememberedChoice,
  rememberedGuildPart,
  rememberedView,
  rememberGuildPart,
  rememberView,
} from './views/remembered';
import { Roster } from './views/roster';
import { headingOf, isGuildPart, viewIds, viewOf, type GuildPartId, type PartId, type SectionId, type ViewId } from './views/section';
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
  return viewOf[target as PartId | GuildPartId] ?? 'guild';
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
  // The Guild's part open, a tab under its heading (M9-F2): kept from view to view and in this browser.
  const [guildPart, setGuildPart] = useState<GuildPartId>(rememberedGuildPart);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the shell keeps for the views: the Quest whose Party is open, so the home view can open
  // one; the Parties chosen and not sent, by Quest, so leaving the Board loses none (DL-109 item 2,
  // Q16); the Guild whose page is open in the Rankings, so a name can open it; and whose History is
  // shown, the player's Guild's at first, a choice that holds while the game is in hand (DL-74 item
  // 8, DL-99 item 2).
  const [boardQuest, setBoardQuest] = useState<QuestId | null>(null);
  const [partyChoices, setPartyChoices] = useState<PartyChoices>(noPartyChoices);
  // How the Board is ordered: display only, kept from view to view (M9-S4, DL-104) and in this
  // browser, as the Rankings' and the pool's are (DL-109 item 2, Q11).
  const [boardOrder, setBoardOrder] = useState<BoardOrder>(() => rememberedChoice(boardOrderKey, boardOrders, 'posted'));
  const [rankingsGuild, setRankingsGuild] = useState<GuildId | null>(null);
  const [whose, setWhose] = useState<HistoryWhose>(null);
  // An older Quest report, opened from its entry in the rail or the History, which stands in Guild ›
  // Home's place until it is closed or the next play (M9-F5, DL-111 item 3, Q7).
  const [report, setReport] = useState<ReturnKey | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLElement>(null);

  const header = useMemo(() => (current === null ? null : headerView(current)), [current]);
  const notice = useMemo(() => (current === null ? null : rulesNotice(current)), [current]);
  const stop = useMemo(() => stopView(game), [game]);
  const progress = useMemo(() => progressView(game), [game]);
  const counts = useMemo(() => navCounts({ document: current, log: game.log }), [current, game.log]);
  // A choice holds while its Quest is on the Board: sent, expired or taken, it goes.
  const choices = useMemo(() => (current === null ? noPartyChoices : standingChoices(partyChoices, current)), [partyChoices, current]);
  const playing = busy && (pending?.kind === 'advance' || pending?.kind === 'fastForward');
  const forwarding = busy && pending?.kind === 'fastForward';

  /**
   * Opens the view that holds `target` and puts the keyboard on `target`'s heading, or on `id` when
   * given. A part of the Guild opens its tab, with the keyboard on the Guild's heading; the Guild
   * itself opens at the part last open (M9-F2).
   */
  const open = useCallback((target: SectionId, id?: string) => {
    const next = viewFor(target);
    if (isGuildPart(target)) setGuildPart(target);
    setView(next);
    setMenuOpen(false);
    setFocus({ id: id ?? headingOf(isGuildPart(target) ? next : target), fallback: headingOf(next) });
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

  /** A Party's return, from its entry: its report on Guild › Home, with the keyboard on its heading (M9-F5). */
  const openReport = useCallback(
    (key: ReturnKey) => {
      setReport(key);
      open('home', reportHeadingId(key));
    },
    [open],
  );

  /** Closes an older report: Guild › Home as it was, with the keyboard on the Guild's heading. */
  const closeReport = useCallback(() => {
    setReport(null);
    open('home');
  }, [open]);

  const links = useMemo<HistoryLinks>(
    () => ({ log: game.log, onName: openName, onHistory: openHistory, onReport: openReport }),
    [game.log, openName, openHistory, openReport],
  );

  /**
   * Guild › Home, the menu closed, with the keyboard on `focusId` or else the Guild's heading: where a
   * new game, a load, the end of a fast forward and a Party's return each lead. Called while
   * rendering, as those are decided in the render the play ends in (M9-F6, code review: one way
   * there for the three).
   */
  function toGuildHome(focusId: string = headingOf('guild')): void {
    setView('guild');
    setGuildPart('home');
    setMenuOpen(false);
    setFocus({ id: focusId, fallback: headingOf('guild') });
  }

  // A new game or a load: the home view, and nothing the last game had open (DL-74 item 7).
  const [games, setGames] = useState(game.games);
  if (games !== game.games) {
    setGames(game.games);
    toGuildHome();
    setBoardQuest(null);
    setPartyChoices(noPartyChoices);
    setRankingsGuild(null);
    setWhose(null);
    setReport(null);
  }

  // The end of a fast forward, by its stop or the player's: the home view, which says why and what
  // came of it. In the same render as the end, so the page is never idle on the view it left.
  const [wasForwarding, setWasForwarding] = useState(forwarding);
  if (wasForwarding !== forwarding) {
    setWasForwarding(forwarding);
    if (wasForwarding && game.rejection === null) toGuildHome();
  }

  // A play that brought a Party of the player's home, one Turn or a fast forward: Guild › Home at its
  // report, with the keyboard on the report's heading, from whichever view (M9-F5, DL-112 item 8). Any
  // play puts an older report away. In the same render as the play's end, as the fast forward's.
  const [seenLog, setSeenLog] = useState(game.log);
  if (seenLog !== game.log) {
    setSeenLog(game.log);
    setReport(null);
    const [home] = returnsIn({ document: current, log: game.log });
    if (home !== undefined && game.rejection === null) toGuildHome(reportHeadingId(home));
  }

  useEffect(() => rememberView(view), [view]);
  useEffect(() => rememberGuildPart(guildPart), [guildPart]);

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
          <NewGame
            saves={saves}
            busy={busy}
            play={play}
            rejection={game.rejection}
            {...(current === null ? {} : { onCancel: () => setReplacing(null) })}
          />
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
        onGuild={() => open('home')}
        menuButton={menuButton}
        bar={bar}
      >
        <Refusal state={game} play={play} />
      </StatusBar>
      <HistoryLinksContext value={links}>
      <div className="shell">
        <Nav current={view} counts={counts} guildmasterName={header.guildmasterName} onOpen={(next) => open(next)} />
        <main aria-busy={busy} className="main">
          {/* Keyed by the game in hand: what one game had open (a Hero's page, a Guild, whose
              History) is not open in the next one started or loaded (DL-74). */}
          <Fragment key={game.games}>
            {view === 'guildmaster' ? <Guildmaster document={current} /> : null}
            {view === 'guild' ? (
              <GuildView
                part={guildPart}
                onPart={setGuildPart}
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
                report={report}
                onCloseReport={closeReport}
              />
            ) : null}
            {view === 'board' ? (
              <Board
                {...shared}
                state={game}
                open={boardQuest}
                onOpen={setBoardQuest}
                order={boardOrder}
                onOrder={(order) => {
                  setBoardOrder(order);
                  rememberChoice(boardOrderKey, order);
                }}
                choices={choices}
                onChoice={(questId, choice) => setPartyChoices(withChoice(choices, questId, choice))}
                onGuild={() => open('home')}
              />
            ) : null}
            {view === 'roster' ? <Roster {...shared} /> : null}
            {view === 'rankings' ? <Rankings {...shared} guildName={guildName} open={rankingsGuild} onOpen={setRankingsGuild} /> : null}
            {view === 'market' ? <Market {...shared} /> : null}
            {view === 'history' ? <History {...shared} whose={whose} onWhose={setWhose} /> : null}
          </Fragment>
        </main>
        <Rail state={game} onOpenHistory={() => openHistory(null)} onReport={openReport} />
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
          onDebugHistory={() => openHistory('all')}
        />
      ) : null}
    </div>
  );
}
