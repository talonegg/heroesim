// `captain --hero <heroId>` (DL-280 item 6, DL-287): the player's Guild names one of its Heroes its
// Captain. What the command does to an open save and what it prints; `main.ts` opens the save, and
// writes it back only when this succeeds.
//
// The CLI holds no rule: the engine's `nameCaptain` decides, and a refusal is its typed rejection in
// the refusals' words (ADR-0003, DL-240). What was done is the History's own sentences.

import { applyAction, playerGuild, type EngineDeps, type WorldDocument } from '@heroesim/engine';
import type { Command } from '../args.js';
import { narrateLine, refusalLine } from '../namer.js';
import type { CommandOutcome } from './outcome.js';

/**
 * Names the Hero the command gives the player's Guild's Captain under the save's own deps, and says
 * it as the History does: the naming, and the outgoing Captain's Morale where another is replaced.
 */
export function nameCaptain(command: Extract<Command, { name: 'captain' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'nameCaptain', reason: 'no-player-guild' }, setting) };

  const result = applyAction(document, { kind: 'nameCaptain', guildId: guild.id, heroId: command.hero }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return { ok: true, document: result.document, lines: result.events.map((event) => narrateLine(event, deps.content, deps.config)) };
}
