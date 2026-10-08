// `rebase` (M2-S1, data-model §2, pre-M0 review D1): the game adopts the current default rules. A
// front end plays a loaded game under its own `meta.config`, filled forward with the current
// defaults, so tuning reaches a game only when the player says so, and the History says when.

import { configVersion, defaultConfig } from '../config.js';
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
 * The rules a game could adopt (pre-M0 review D1): its own `meta.configVersion` and this release's
 * later `configVersion`, or `null` when the game's are not behind them. What a front end's "new rules
 * available" notice reads (M7-S3, DL-73). `rebase` itself refuses only equal versions, so a save
 * from a later release can still be brought to these rules; no front end offers that, since nothing
 * newer is available to it. The version is the game's `meta`'s, not the config's (DL-193).
 */
export function newRules(meta: Pick<Meta, 'configVersion'>): { from: number; to: number } | null {
  const from = meta.configVersion;
  return from < configVersion ? { from, to: configVersion } : null;
}

/**
 * Rewrites `meta.config` to this release's `defaultConfig` (a copy, whole: a field the save had and
 * `defaultConfig` lacks goes) and `meta.configVersion` to this release's `configVersion`, and appends
 * `world.rules-adopted`, a Milestone carrying the old and the new version. It reads no deps, so the
 * config a game plays under can never be what it adopts (DL-205). Rejected `already-current` when
 * the game's version is this release's.
 *
 * The returned document has a new `meta`; the old document's `meta` is left alone, since `meta`
 * is shared by reference across the documents of successive Turns. `world` does not change and is
 * shared too, as `history` always is.
 */
export function rebase(document: WorldDocument): ActionResult<RebaseRejection> {
  const { meta, world, history } = document;
  const oldConfigVersion = meta.configVersion;
  const newConfigVersion = configVersion;
  if (oldConfigVersion === newConfigVersion) {
    return { ok: false, rejection: { action: 'rebase', reason: 'already-current', configVersion: oldConfigVersion } };
  }

  const adopted = eventEmitter(world)({
    type: 'world.rules-adopted',
    participants: [],
    payload: { oldConfigVersion, newConfigVersion },
  });
  append(history, adopted);
  return { ok: true, document: { meta: { ...meta, configVersion, config: { ...defaultConfig } }, world, history }, events: [adopted] };
}
