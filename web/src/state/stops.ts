// Why time stopped, in the page's words (M7-S3, DL-66): the narration's one sentence (`narrateStop` in
// `@heroesim/words`, v1.1.7-S3, DL-209) filled by the page's Namer (`namer.ts`): a Guild and a Hero by
// name alone, a Quest by its template's name and a Party counted, never an id; where the CLI points to
// a command, the page gives a button (`nextFor` in `views/stop.tsx`).

import type { StopReason, WorldDocument } from '@heroesim/engine';
import { narrateStop, sentenceText } from '@heroesim/words';
import { pageNamer, textOf, type Narration } from './namer';

/**
 * Why an advance or a fast forward stopped, in one sentence. `document` is where it stopped, its
 * dates by the game's calendar (DL-210); `maxTurns` the cap it played under.
 */
export function stopText(stop: StopReason, document: WorldDocument, maxTurns: number, narration: Narration): string {
  const namer = pageNamer(narration.questName);
  return sentenceText(narrateStop(stop, document.world, maxTurns, narration.calendar), (slot) => textOf(namer(slot)));
}
