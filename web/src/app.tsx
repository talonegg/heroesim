// The app shell (M7-S3): one column that stacks, its sections in the order a Turn reads. First the
// header (the Guild, its Wealth and Fame, the Day and time of day, its place in the Rankings) and
// time, then the Board with dispatch, the Roster with Hero pages, and the log of what happened
// since the last action. Before there is a game, a new one. Every play goes through `useGame`, the
// one reducer (M7-S2); no component calls the engine, and every number shown comes from a selector
// under `state/`.

import { useCallback, useMemo } from 'react';
import { content } from './content';
import { useGame, type GameState } from './state/reducer';
import { headerView, stopView } from './state/selectors';
import { Board } from './views/board';
import { Header } from './views/header';
import { Log } from './views/log';
import { NewGame } from './views/new-game';
import { Refusal } from './views/refusal';
import { Roster } from './views/roster';
import { Time, type SectionId } from './views/time';

/** Takes the player to a section of the page and puts the keyboard there: its heading. */
function goTo(section: SectionId): void {
  const heading = document.getElementById(`${section}-heading`);
  heading?.scrollIntoView?.({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

/** The page. `initial` is a test's way in: a game already in hand. */
export function App({ initial }: { initial?: GameState }) {
  const [game, play] = useGame(initial);
  const { document: current, busy } = game;
  const header = useMemo(() => (current === null ? null : headerView(current)), [current]);
  const stop = useMemo(() => stopView(game), [game]);
  const onGoTo = useCallback((section: SectionId) => goTo(section), []);

  return (
    <div className="app">
      {current === null ? null : <p className="brand">Heroesim</p>}
      <main aria-busy={busy}>
        <Refusal state={game} play={play} />
        {current === null ? (
          <>
            <h1>Heroesim</h1>
            <NewGame busy={busy} play={play} />
          </>
        ) : (
          <>
            {header === null ? <h1>Heroesim</h1> : <Header view={header} />}
            <Time busy={busy} ended={current.world.ended !== null} stop={stop} play={play} goTo={onGoTo} />
            <Board document={current} busy={busy} play={play} />
            <Roster document={current} />
            <Log key={`${current.world.turn}:${game.log.length}`} state={game} guildName={header?.guildName ?? 'your Guild'} />
          </>
        )}
      </main>
      <footer className="footer">
        <p>
          Content set {content.id}, version {content.version}, loaded.
        </p>
      </footer>
    </div>
  );
}
