// `renew --hero <heroId> --years <years>` and `release --hero <heroId> [--confirm]` (DL-316, DL-317, DL-323):
// the player's Guild signs a Hero of its Roster again, or lets one go. What the commands do to an open
// save and what they print; `main.ts` opens the save, and writes it back only when the command succeeds.
//
// The CLI holds no rule: the engine's `renew` and `release` decide, a refusal is their typed rejection in
// the refusals' words (ADR-0003, DL-240), and what was done is the History's own sentences. The one thing
// it adds is the Guild's last Hero: `releaseWarning` says what releasing them would leave, as an estimate,
// and the release is made only with `--confirm`, the page's confirmation (DL-317).

import { applyAction, playerGuild, releaseWarning, type EngineDeps, type WorldDocument } from '@heroesim/engine';
import { releaseWarningWords, rowOf } from '@heroesim/words';
import type { Command } from '../args.js';
import { refusalLine } from '../namer.js';
import type { CommandOutcome } from './outcome.js';
import { done } from './transfer.js';

/** `renew`: the player's Guild signs the Hero again for the years given (`renew`, no fee). */
export function renewHero(command: Extract<Command, { name: 'renew' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const player = playerGuild(document.world);
  if (player === undefined) return { ok: false, problem: refusalLine({ action: 'renew', reason: 'no-player-guild' }, setting) };
  const result = applyAction(document, { kind: 'renew', guildId: player.id, heroId: command.hero, years: command.years }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}

/**
 * `release`: the player's Guild lets the Hero go, paying `releasePayout`. For its last Hero it refuses
 * without `--confirm`, saying what the release would leave (`releaseWarningWords`).
 */
export function releaseHero(command: Extract<Command, { name: 'release' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const { world } = document;
  const setting = { world, content: deps.content, calendar: deps.config };
  const player = playerGuild(world);
  if (player === undefined) return { ok: false, problem: refusalLine({ action: 'release', reason: 'no-player-guild' }, setting) };
  const hero = rowOf(world.heroes, command.hero);
  const warning = hero === undefined || command.confirm ? null : releaseWarning(world, deps, player, hero);
  if (hero !== undefined && warning !== null) {
    return { ok: false, problem: `${releaseWarningWords(`${hero.name} (${hero.id})`, warning)} Add --confirm to release them.` };
  }
  const result = applyAction(document, { kind: 'release', guildId: player.id, heroId: command.hero }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}
