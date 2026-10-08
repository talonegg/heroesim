// Why time stopped (M7-S3, DL-66 item 4; M9-S3, DL-103): the stop as a sentence, and where the CLI
// points to a command, a button takes the player there. A decision needed names Quests, and each is
// a button that opens its Party on the Board (the review's A3), as a Quest to staff does. The home
// view shows it.
//
// The Bankruptcy stop (M9-S7, #32) is a warning card: the stop's sentence with the Day Bankruptcy
// falls on, what can be done about it in words that name no number and weigh no choice, and the ways
// to Wealth: the Market's Sell, where what the Guild holds is sold (M9-S6; DL-109 item 2, Q20; moved
// from the Hall by M9-F2, DL-112 item 5), and the Board.
//
// A Party's stop offers nothing more (DL-112 item 8, DL-118): the play that brought it home opened
// Guild › Home at its Quest report, under the card. A module's stop keeps "Read what happened".

import type { QuestId } from '@heroesim/engine';
import type { GameAction } from '../state/reducer';
import type { StopView } from '../state/selectors';
import { Icon, type IconName } from './icons';
import type { SectionId } from './section';

/** Somewhere to go, or another fast forward. */
type Step = { label: string; target: SectionId } | { label: string; again: true };

/** What each stop offers next: a step, several, or nothing. */
type Next = Step | readonly Step[] | null;

const nextFor: Readonly<Record<StopView['kind'], Next>> = {
  ended: null,
  // M9-S7: where Wealth comes from, what the Guild holds to sell and the Board to send a Party.
  // Sell is the Market's (DL-115).
  'below-floor': [
    { label: 'Sell what the Guild holds', target: 'sell' },
    { label: 'Open the Board', target: 'board' },
  ],
  // M9-S7: shown only when none of the Quests it named is still on the Board, as for a decision.
  'quest-staffable': { label: 'Open the Board', target: 'board' },
  // M9-F5: the play opened Guild › Home at the Quest report, below this card (DL-112 item 8).
  'party-returned': null,
  // Shown only when none of the Quests it named is still on the Board.
  'decision-needed': { label: 'Open the Board', target: 'board' },
  'transfer-offer': { label: 'Answer the Offer', target: 'offers' },
  // M8-S2: the module's own events say why it asked.
  module: { label: 'Read what happened', target: 'history' },
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

/** What can be done about a stop, in words, where the sentence alone does not say it. */
const wordsFor: Readonly<Partial<Record<StopView['kind'], readonly string[]>>> = {
  'below-floor': [
    'To stay in business, Wealth must be back to the Bankruptcy floor or more on a night by then, after any Upkeep due.',
    'Sell what the Guild holds at the Market, or send a Party on a Quest: its reward comes in when it comes home. ' +
      'Recruiting, building and buying spend Wealth.',
  ],
};

/** A stop that warns: the card is drawn as a warning, its icon and words the cue as well as its colour. */
const warns: Readonly<Partial<Record<StopView['kind'], true>>> = { 'below-floor': true };

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
  const steps: readonly Step[] = next === null ? [] : Array.isArray(next) ? next : [next as Step];
  const words = wordsFor[stop.kind] ?? [];
  return (
    <div className={warns[stop.kind] === true ? 'stop stop--warning' : 'stop'} data-testid="stop">
      <Icon name={iconFor[stop.kind]} className="stop__icon" />
      <div className="stop__body">
        <p>{stop.sentence}</p>
        {words.map((said) => (
          <p key={said} className="stop__words">
            {said}
          </p>
        ))}
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
        {steps.length === 0 ? null : (
          <div className="actions">
            {steps.map((step) => (
              <button
                key={step.label}
                type="button"
                className={'again' in step ? 'button--primary' : undefined}
                disabled={'again' in step && idle}
                onClick={() => ('again' in step ? play({ kind: 'fastForward', until: stop.until ?? [] }) : onGo(step.target))}
              >
                {'again' in step ? <Icon name="forward" /> : null}
                <span>{step.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
