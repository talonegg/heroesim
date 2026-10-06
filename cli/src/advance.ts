// The CLI's framing of an advance (M2-S11, DL-33): why a fast forward stopped, in one line, and what
// `advance` prints, each event one line in the CLI's words (`narrateLine`, the narration's sentence
// filled by the CLI's Namer). The stop's words are the narration's, one for both front ends (v1.1.7-S3,
// DL-209): the CLI's Namer gives the ids its commands take and the command that answers, where the
// page puts a button (`web/src/state/stops.ts`).

import type { EngineDeps, StopReason, TurnEvent, WorldDocument } from '@heroesim/engine';
import { narrateStop, sentenceText, whenOfTurn } from '@heroesim/words';
import { cliNamer, narrateLine } from './namer.js';
import { renderCountdown, renderDate, renderTime, table } from './render.js';

/**
 * Why a fast forward stopped, in one line: the narration's sentence (`narrateStop` in
 * `@heroesim/words`, v1.1.7-S3, DL-209) filled by the CLI's Namer, with the ids and the commands its
 * names and slots give. `document` is where it stopped, its dates by the game's calendar
 * (`meta.config`, DL-210); `maxTurns` the cap it played under.
 */
export function stopLine(stop: StopReason, document: WorldDocument, maxTurns: number): string {
  return sentenceText(narrateStop(stop, document.world, maxTurns, document.meta.config), cliNamer);
}

// ── Advancing ────────────────────────────────────────────────────────────────────────────────

/**
 * `advance`: how many Turns were played, where time stands now, why a fast forward stopped when it
 * was one (`stop`), the Bankruptcy countdown while the player's Guild is below the floor
 * (`renderCountdown`, DL-95), whether the game has ended and when, and each event of the Turns
 * played, oldest first, one line each with its Turn and date (DL-206 item 33, DL-210) in the CLI's words.
 */
export function renderAdvance(
  played: number,
  events: readonly TurnEvent[],
  document: WorldDocument,
  deps: EngineDeps,
  stop?: string,
): string[] {
  const { turn, ended } = document.world;
  return [
    `Played ${played} ${played === 1 ? 'Turn' : 'Turns'}. Now ${renderTime(turn, deps.config)}.`,
    ...(stop === undefined ? [] : [stop]),
    ...renderCountdown(document, deps),
    ...(ended === null ? [] : [`The game ended on ${renderDate(ended.turn, deps.config)}: ${ended.reason}.`]),
    '',
    ...(events.length === 0
      ? ['No events.']
      : [
          `Events: ${events.length}, oldest first`,
          '',
          ...table(
            [{ heading: 'Turn', align: 'right' }, { heading: 'Date' }, { heading: 'What happened' }],
            events.map((event) => [String(event.turn), whenOfTurn(event.turn, deps.config), narrateLine(event, deps.content, deps.config)]),
          ),
        ]),
  ];
}
