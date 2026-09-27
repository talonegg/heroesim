// Time (M7-S3): advance a Turn, or fast forward, the CLI's `advance` and `advance --until`. The
// stops the player may choose are buttons: fast forward stops on its own when a Party of theirs
// comes home, a decision is needed, a Transfer Offer arrives or the game ends, and at the latest
// after a year; new Heroes in the Unattached pool stop it only when asked (pre-M0 review B7). Why
// it stopped is a sentence, and where the CLI points to a command, a button takes the player there.

import type { StopReason } from '@heroesim/engine';
import type { GameAction } from '../state/reducer';
import type { StopView } from '../state/selectors';

/** A section of the page a button can take the player to. */
export type SectionId = 'board' | 'roster' | 'log';

/** What each stop reason offers the player next: a section to go to, another fast forward, or nothing. */
const nextFor: Readonly<Record<StopReason['kind'], { label: string; section: SectionId } | { label: string; again: true } | null>> = {
  ended: null,
  'party-returned': { label: 'Read what happened', section: 'log' },
  'decision-needed': { label: 'Choose a Party on the Board', section: 'board' },
  'transfer-offer': { label: 'Read the offer', section: 'log' },
  'max-turns': { label: 'Fast forward again', again: true },
  'pool-refreshed': { label: 'Read who joined', section: 'log' },
};

export function Time({
  busy,
  ended,
  stop,
  play,
  goTo,
}: {
  busy: boolean;
  ended: boolean;
  stop: StopView | null;
  play: (action: GameAction) => void;
  goTo: (section: SectionId) => void;
}) {
  const next = stop === null ? null : nextFor[stop.kind];
  const idle = busy || ended;
  return (
    <section className="panel time" aria-labelledby="time-heading">
      <h2 id="time-heading">Time</h2>
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
      <p className="note">
        Fast forward stops when a Party of yours comes home, a decision is needed, a Transfer Offer arrives or the game
        ends, and at the latest after a year.
      </p>
      <p className="busy" role="status">
        {busy ? 'Playing the Turns…' : ''}
      </p>
      {stop === null ? null : (
        <div className="stop" data-testid="stop">
          <p>{stop.sentence}</p>
          {next === null ? null : (
            <button
              type="button"
              disabled={'again' in next && idle}
              onClick={() => ('again' in next ? play({ kind: 'fastForward', until: [] }) : goTo(next.section))}
            >
              {next.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
