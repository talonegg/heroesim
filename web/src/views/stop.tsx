// Why time stopped (M7-S3, DL-66 item 4; M9-S3, DL-103): the stop as a sentence, and where the CLI
// points to a command, a button takes the player there. A decision needed names Quests, and each is
// a button that opens its Party on the Board (the review's A3). The home view shows it.

import type { QuestId } from '@heroesim/engine';
import type { GameAction } from '../state/reducer';
import type { StopView } from '../state/selectors';
import { Icon, type IconName } from './icons';
import type { SectionId } from './section';

/** What each stop offers next: somewhere to go, another fast forward, or nothing. */
type Next = { label: string; target: SectionId } | { label: string; again: true } | null;

const nextFor: Readonly<Record<StopView['kind'], Next>> = {
  ended: null,
  // M9-S1 (DL-101): the new stops; M9-S7 gives them their place on the page.
  'below-floor': { label: 'Read what happened', target: 'log' },
  'quest-staffable': { label: 'Open the Board', target: 'board' },
  'party-returned': { label: 'Read what happened', target: 'log' },
  // Shown only when none of the Quests it named is still on the Board.
  'decision-needed': { label: 'Open the Board', target: 'board' },
  'transfer-offer': { label: 'Answer the offer', target: 'offers' },
  // M8-S2: the module's own events say why it asked.
  module: { label: 'Read what happened', target: 'log' },
  'max-turns': { label: 'Fast forward again', again: true },
  'pool-refreshed': { label: 'See who joined the pool', target: 'pool' },
  // v1.0.1-S5: the player's Stop, which goes on with the stops it was asked for.
  player: { label: 'Fast forward again', again: true },
};

const iconFor: Readonly<Record<StopView['kind'], IconName>> = {
  ended: 'alert',
  'below-floor': 'alert',
  'quest-staffable': 'board',
  'party-returned': 'guild',
  'decision-needed': 'board',
  'transfer-offer': 'roster',
  module: 'about',
  'max-turns': 'forward',
  'pool-refreshed': 'roster',
  player: 'stop',
};

export function StopCard({
  stop,
  idle,
  play,
  onGo,
  onOpenQuest,
}: {
  stop: StopView;
  /** No play can be taken: busy, or the game has ended. */
  idle: boolean;
  play: (action: GameAction) => void;
  onGo: (target: SectionId) => void;
  onOpenQuest: (questId: QuestId) => void;
}) {
  const quests = stop.quests ?? [];
  const next = quests.length > 0 ? null : nextFor[stop.kind];
  return (
    <div className="stop" data-testid="stop">
      <Icon name={iconFor[stop.kind]} className="stop__icon" />
      <div className="stop__body">
        <p>{stop.sentence}</p>
        {quests.length === 0 ? null : (
          <>
            <div className="stop__caption" aria-hidden="true">
              Choose a Party for
            </div>
            <ul className="quest-buttons">
              {quests.map((quest) => (
                <li key={quest.questId}>
                  <button
                    type="button"
                    className="quest-button"
                    aria-label={`Choose a Party for ${quest.name}, offered by ${quest.patron}, for ${quest.reward} Wealth`}
                    onClick={() => onOpenQuest(quest.questId)}
                  >
                    <span className="quest-button__name">{quest.name}</span>
                    <span className="quest-button__patron">
                      {quest.patron} · {quest.reward} Wealth
                    </span>
                    <Icon name="go" className="quest-button__go" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {next === null ? null : (
          <div className="actions">
            <button
              type="button"
              className={'again' in next ? 'button--primary' : undefined}
              disabled={'again' in next && idle}
              onClick={() => ('again' in next ? play({ kind: 'fastForward', until: stop.until ?? [] }) : onGo(next.target))}
            >
              {'again' in next ? <Icon name="forward" /> : null}
              <span>{next.label}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
