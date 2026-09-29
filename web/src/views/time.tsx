// Time (M7-S3): advance a Turn, or fast forward, the CLI's `advance` and `advance --until`. The
// stops the player may choose are buttons: fast forward stops on its own when a Party of theirs
// comes home, a decision is needed, a Transfer Offer arrives or the game ends, and at the latest
// after a year; new Heroes in the Unattached pool stop it only when asked (pre-M0 review B7). Why
// it stopped is a sentence, and where the CLI points to a command, a button takes the player there.
// A fast forward plays in steps (v1.0.1-S5, DL-96): between them this section shows the Turns
// played, the Day reached and, while the Guild is below the Bankruptcy floor, the countdown, and a
// Stop that ends it there, with the page's own sentence and "Fast forward again".

import type { GameAction } from '../state/reducer';
import type { ProgressView, StopView } from '../state/selectors';
import { Section, type SectionId } from './section';

/** What each stop offers the player next: a section to go to, another fast forward, or nothing. */
const nextFor: Readonly<Record<StopView['kind'], { label: string; section: SectionId } | { label: string; again: true } | null>> = {
  ended: null,
  // M9-S1: the new stops; M9-S7 gives them their place on the page.
  'below-floor': { label: 'Read what happened', section: 'log' },
  'party-returned': { label: 'Read what happened', section: 'log' },
  'decision-needed': { label: 'Choose a Party on the Board', section: 'board' },
  'quest-staffable': { label: 'Choose a Party on the Board', section: 'board' },
  'transfer-offer': { label: 'Answer the offer', section: 'offers' },
  // M8-S2: the module's own events say why it asked.
  module: { label: 'Read what happened', section: 'log' },
  'max-turns': { label: 'Fast forward again', again: true },
  'pool-refreshed': { label: 'See who joined the pool', section: 'pool' },
  // v1.0.1-S5: the player's Stop, which goes on with the stops it was asked for.
  player: { label: 'Fast forward again', again: true },
};

export function Time({
  busy,
  playing,
  ended,
  progress,
  stop,
  play,
  goTo,
}: {
  busy: boolean;
  /** Busy playing Turns, not an action within one. */
  playing: boolean;
  ended: boolean;
  /** How far a fast forward has come, between its steps; `null` while none is. */
  progress: ProgressView | null;
  stop: StopView | null;
  play: (action: GameAction) => void;
  goTo: (section: SectionId) => void;
}) {
  const next = stop === null ? null : nextFor[stop.kind];
  const idle = busy || ended;
  return (
    <Section
      id="time"
      title="Time"
      className="time"
      help={
        'Time moves only here; everything else on the page acts within the current Turn. Advance a Turn plays one. ' +
        'Fast forward plays Turns until a Party of yours comes home, a decision is needed, a Transfer Offer arrives or ' +
        'the game ends, and at the latest after a year; it can also stop when new Heroes join the Unattached pool. ' +
        'It plays them 30 Turns, ten Days, at a time, showing how far it has come, and Stop ends it there.'
      }
    >
      <div className="actions">
        <button type="button" className="button--primary" disabled={idle} onClick={() => play({ kind: 'advance' })}>
          Advance a Turn
        </button>
        <button type="button" disabled={idle} onClick={() => play({ kind: 'fastForward', until: [] })}>
          Fast forward
        </button>
        <button type="button" disabled={idle} onClick={() => play({ kind: 'fastForward', until: ['pool-refreshed'] })}>
          Fast forward until new Heroes join the pool
        </button>
      </div>
      <p className="busy" role="status">
        {playing ? 'Playing the Turns…' : ''}
      </p>
      {progress === null ? null : (
        <div className="progress" data-testid="progress">
          <p>{progress.sentence}</p>
          {progress.countdown === null ? null : <p className="countdown">{progress.countdown}</p>}
          <div className="actions">
            <button type="button" onClick={() => play({ kind: 'stop' })}>
              Stop the fast forward
            </button>
          </div>
        </div>
      )}
      {stop === null ? null : (
        <div className="stop" data-testid="stop">
          <p>{stop.sentence}</p>
          {next === null ? null : (
            <button
              type="button"
              disabled={'again' in next && idle}
              onClick={() => ('again' in next ? play({ kind: 'fastForward', until: stop.until ?? [] }) : goTo(next.section))}
            >
              {next.label}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
