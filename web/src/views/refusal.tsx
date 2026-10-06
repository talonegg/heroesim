// A refusal (M7-S2's map, M7-S3's view): the last play the engine or the page refused, as a
// sentence, until the next play is carried out or the player puts it away. An alert docked under the
// status bar, with an icon and Dismiss, so it is seen whichever view the play came from and covers
// none of it (M9-S3, DL-103; the review's C9).

import { content } from '../content';
import type { GameAction, GameState } from '../state/reducer';
import { refusedSave, rejectionSentence } from '../state/rejections';
import { Icon } from './icons';

export function Refusal({ state, play }: { state: GameState; play: (action: GameAction) => void }) {
  const { rejection, document } = state;
  // A save of this browser that does not load is said beside it, in the list the player chose it
  // from (`saved-games.tsx`, v1.1.2-S3), and not here as well.
  if (rejection === null || refusedSave(rejection) !== null) return null;
  return (
    <div className="refusal" role="alert">
      <Icon name="alert" className="refusal__icon" />
      <p>{rejectionSentence(rejection, document, content)}</p>
      <button type="button" className="button--quiet" onClick={() => play({ kind: 'dismiss' })}>
        Dismiss
      </button>
    </div>
  );
}
