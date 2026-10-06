// The status bar (M9-S3, DL-103; the review's A2): it stays in view on every view. It holds the
// player's Guild, its Wealth and Fame, the date and time of day with a sun or a moon, the Year shown at
// every width (DL-206 item 32, DL-210), its place in the Rankings and, while the Guild is below the
// Bankruptcy floor, the countdown as a warning pill, each read from `headerView` (the engine's
// `rankingPlaces`, `timeOfDay`, `bankruptcyCountdown`, and the calendar of `@heroesim/words`).
// It also holds time: Advance a Turn, Fast forward and the other ways to fast forward, and while a
// fast forward is between its steps, how far it has come and its Stop (v1.0.1-S5, DL-96). The game
// menu opens from it, and a refusal is docked under it.
//
// Time moves only here (the CLI's `advance` and `advance --until`): fast forward stops on its own
// when a Party of the player's comes home, a decision is needed, a Transfer Offer arrives, the Guild
// falls below the Bankruptcy floor (M9-S1, DL-101) or the game ends, and at the latest after a year.
// Two stops come only when asked, from the split button's other ways: a Quest the Heroes at home can
// staff appearing, even with a Party out (`quest-staffable`, the CLI's `--until staffable`; M9-S7),
// and new Heroes in the Unattached pool (pre-M0 review B7). Why it stopped is the home view's to say.

import type { StopCondition } from '@heroesim/engine';
import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react';
import type { GameAction } from '../state/reducer';
import type { HeaderView, ProgressView } from '../state/selectors';
import { Icon, type IconName } from './icons';
import { GuildBanner } from './pictures';
import { StatPill, useDismiss, VisuallyHidden } from './ui';

/** What time is, and what its controls do: the time controls' accessible description (DL-73 item 9). */
export const timeHelp =
  'Time moves only here; everything else on the page acts within the current Turn. Advance a Turn plays one. ' +
  'Fast forward plays Turns until a Party of yours comes home, a decision is needed, a Transfer Offer arrives, your ' +
  'Guild falls below the Bankruptcy floor or the game ends, and at the latest after a Year; from its other ways, it ' +
  'can also stop when a Quest the Heroes at home can staff appears, even with a Party out, or when new Heroes join ' +
  'the Unattached pool. ' +
  'It plays them 30 Turns, ten Days, at a time, showing how far it has come, and Stop ends it there.';

/** The stops a fast forward makes only when asked (the CLI's `--until staffable` and `--until pool`). */
const sooner: readonly { label: string; until: readonly StopCondition[] }[] = [
  // M9-S7 (#32, DL-85 item 8): even with a Party out. "You", as the page says elsewhere (DL-109 item 2, Q7).
  { label: 'Fast forward until a Quest you can staff appears', until: ['quest-staffable'] },
  { label: 'Fast forward until new Heroes join the pool', until: ['pool-refreshed'] },
];

const glyphs: Readonly<Record<HeaderView['timeOfDay'], IconName>> = { morning: 'morning', afternoon: 'afternoon', night: 'night' };

export function StatusBar({
  view,
  busy,
  playing,
  ended,
  progress,
  play,
  menuOpen,
  onMenu,
  onGuild,
  menuButton,
  bar,
  children,
}: {
  view: HeaderView;
  busy: boolean;
  /** Busy playing Turns, not an action within one. */
  playing: boolean;
  ended: boolean;
  /** How far a fast forward has come, between its steps; `null` while none is. */
  progress: ProgressView | null;
  play: (action: GameAction) => void;
  menuOpen: boolean;
  onMenu: () => void;
  /** Opens the home view, where the countdown is said in full. */
  onGuild: () => void;
  menuButton: Ref<HTMLButtonElement>;
  /** The bar itself: the shell measures it, so what sticks below it knows where to start. */
  bar: Ref<HTMLElement>;
  /** The refusal, docked under the bar. */
  children?: ReactNode;
}) {
  return (
    <header className="status" ref={bar}>
      <div className="status__bar">
        <div className="status__guild">
          {/* The Guild's Banner beside its name (v1.1.2-S2, DL-125 item 7). */}
          <h1 id="guild-name" className="titled">
            <GuildBanner guild={view.guildId} />
            <span>{view.guildName}</span>
          </h1>
        </div>
        <div className="status__facts">
          <StatPill icon="wealth" label="Wealth" value={view.wealth} testId="wealth" />
          <StatPill icon="fame" label="Fame" value={view.fame} testId="fame" />
          <span className="stat stat--plain">
            <Icon name={glyphs[view.timeOfDay]} />
            <span className="stat__label">When</span>{' '}
            <span data-testid="time">{view.time}</span>
          </span>
          <span className="stat stat--plain">
            <Icon name="rankings" />
            <span className="stat__label">Rankings</span>{' '}
            <span data-testid="rankings">
              {view.place}
              {view.measure === '' ? null : <span className="wide-only"> {view.measure}</span>}
            </span>
          </span>
          {view.due === null ? null : (
            <button type="button" className="chip chip--bad chip--button" data-testid="countdown" onClick={onGuild}>
              <Icon name="alert" />
              <span>{view.due}</span>
            </button>
          )}
          {view.ended === null ? null : (
            <span className="chip chip--bad">
              <Icon name="alert" />
              <span>The game has ended</span>
            </span>
          )}
        </div>
        <TimeControls busy={busy} playing={playing} ended={ended} play={play} />
        <div className="status__menu">
          <button type="button" ref={menuButton} className="button--quiet" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}>
            <Icon name="menu" />
            <span>Game</span>
          </button>
        </div>
      </div>
      {progress === null ? null : (
        <div className="status__progress" data-testid="progress">
          <div className="status__progress-words">
            <p>{progress.sentence}</p>
            {progress.countdown === null ? null : <p className="countdown">{progress.countdown}</p>}
          </div>
          <button type="button" onClick={() => play({ kind: 'stop' })}>
            <Icon name="stop" />
            <span>Stop the Fast forward</span>
          </button>
        </div>
      )}
      {children}
    </header>
  );
}

/** Advance a Turn, Fast forward, and the other ways to fast forward behind a small menu. */
function TimeControls({ busy, playing, ended, play }: { busy: boolean; playing: boolean; ended: boolean; play: (action: GameAction) => void }) {
  const idle = busy || ended;
  const [open, setOpen] = useState(false);
  const within = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, within, trigger);
  return (
    <div className="status__time" role="group" aria-labelledby="time-label" aria-describedby="time-help">
      <VisuallyHidden id="time-label">Time</VisuallyHidden>
      <p id="time-help" hidden>
        {timeHelp}
      </p>
      <button type="button" className="button--primary" disabled={idle} onClick={() => play({ kind: 'advance' })}>
        <Icon name="advance" />
        <span>Advance a Turn</span>
      </button>
      <span className="split" ref={within}>
        <button type="button" className="split__main" disabled={idle} onClick={() => play({ kind: 'fastForward', until: [] })}>
          <Icon name="forward" />
          <span>Fast forward</span>
        </button>
        <button
          type="button"
          ref={trigger}
          className="split__more"
          aria-expanded={open && !idle}
          aria-controls="fast-forward-ways"
          disabled={idle}
          onClick={() => setOpen(!open)}
        >
          <Icon name="chevron" />
          <VisuallyHidden>More ways to Fast forward</VisuallyHidden>
        </button>
        {open && !idle ? (
          <div className="popover popover--time" id="fast-forward-ways">
            <p className="note">
              Fast forward stops of its own accord when a Party of yours comes home, a decision is needed, a Transfer
              Offer arrives, your Guild falls below the Bankruptcy floor or the game ends. It can stop sooner:
            </p>
            {sooner.map(({ label, until }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  play({ kind: 'fastForward', until });
                }}
              >
                {label}
              </button>
            ))}
            <p className="note">A Quest you can staff is one the Heroes at home could take, even with a Party out.</p>
          </div>
        ) : null}
      </span>
      <p className="visually-hidden" role="status">
        {playing ? 'Playing the Turns…' : ''}
      </p>
    </div>
  );
}
