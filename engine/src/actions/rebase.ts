// `rebase` (M2-S1, data-model §2, pre-M0 review D1): the game adopts the current default rules. A
// front end plays a loaded game under its own `meta.config`, filled forward with the current
// defaults, so tuning reaches a game only when the player says so, and the History says when.

import type { EngineDeps, GameConfig } from '../config.js';
import type { Meta, WorldDocument } from '../document.js';
import { eventEmitter } from '../emit.js';
import { append } from '../history.js';
import type { ActionResult, Rejection } from './result.js';

export interface RebaseAction {
  kind: 'rebase';
}

/** The game already plays under the `configVersion` it was asked to adopt. */
export interface RebaseRejection extends Rejection<'rebase', 'already-current'> {
  configVersion: number;
}

/**
 * The rules a game could adopt (pre-M0 review D1): its own `configVersion` and the later one of
 * `config`, the current `defaultConfig` a front end passes, or `null` when the game's are not behind
 * them. What a front end's "new rules available" notice reads (M7-S3, DL-73). `rebase` itself
 * refuses only equal versions, so a save from a later release can still be brought to these rules;
 * no front end offers that, since nothing newer is available to it.
 */
export function newRules(meta: Pick<Meta, 'config'>, config: Pick<GameConfig, 'configVersion'>): { from: number; to: number } | null {
  const from = meta.config.configVersion;
  const to = config.configVersion;
  return from < to ? { from, to } : null;
}

/**
 * Rewrites `meta.config` to `deps.config` (a copy, whole: a field the save had and `deps.config`
 * lacks goes) and appends `world.rules-adopted`, a Milestone carrying the old and the new
 * `configVersion`. A front end passes the current `defaultConfig` as `deps.config`, never the
 * config it plays the save under, which carries the save's own version. Rejected
 * `already-current` when the two `configVersion`s are equal.
 *
 * The returned document has a new `meta`; the old document's `meta` is left alone, since `meta`
 * is shared by reference across the documents of successive Turns. `world` does not change and is
 * shared too, as `history` always is.
 */
export function rebase(document: WorldDocument, deps: EngineDeps): ActionResult<RebaseRejection> {
  const { meta, world, history } = document;
  const oldConfigVersion = meta.config.configVersion;
  const newConfigVersion = deps.config.configVersion;
  if (oldConfigVersion === newConfigVersion) {
    return { ok: false, rejection: { action: 'rebase', reason: 'already-current', configVersion: oldConfigVersion } };
  }

  const adopted = eventEmitter(world)({
    type: 'world.rules-adopted',
    participants: [],
    payload: { oldConfigVersion, newConfigVersion },
  });
  append(history, adopted);
  return { ok: true, document: { meta: { ...meta, config: { ...deps.config } }, world, history }, events: [adopted] };
}
