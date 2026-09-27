// A refusal (M7-S2's map, M7-S3's view): the last play the engine or the page refused, as a
// sentence, until the next play is carried out or the player puts it away.

import { content } from '../content';
import type { GameAction, GameState } from '../state/reducer';
import { rejectionSentence } from '../state/rejections';

export function Refusal({ state, play }: { state: GameState; play: (action: GameAction) => void }) {
  const { rejection, document } = state;
  if (rejection === null) return null;
  return (
    <div className="refusal" role="alert">
      <p>{rejectionSentence(rejection, document?.world ?? null, content)}</p>
      <button type="button" onClick={() => play({ kind: 'dismiss' })}>
        Dismiss
      </button>
    </div>
  );
}
