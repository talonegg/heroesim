// Harm that reads the Stats (v1.1.4-S4, DL-148 item 14, `CONTEXT.md` Exposure and Guard): who an
// Injury or a Death falls on, and who shrugs it off, follow content's Queries and the Heroes' Stats.
// - `among`, a Set Query over the Party, names who it may fall on, narrowed to those it can fall on;
//   when that leaves no one, it falls on any of them (`narrowed`).
// - `exposedBy` weights the draw of who is hit: 1 + `exposureRange` × (1 − the Hero's mean share of
//   those Stats' content range), so the weakest are the likeliest (`exposure`).
// - `guardedBy` scales the chance by 1 − `guardRange` × the chosen Hero's mean share, and a Morale
//   loss's `steadiedBy` scales each Hero's loss by the same rule (`guard`).
// A share reads the Hero's effective Stats as the Queries do (`QueryMember.stats`), so armour's
// Constitution protects; never their form, which is about what a Hero adds to a Check (DL-155).
//
// Pure: it draws nothing, so the resolver's draws keep their number and order. With none of the
// fields every weight and every guard is 1, and the draw of who is hit is `pick`'s.

import type { GameConfig } from '../config.js';
import type { ContentSet, SetQuery, StatKey } from '../content-types.js';
import type { HeroId } from '../document.js';
import { membersOf, type QueryMember, type QueryParty } from './query.js';

/** What harm reads of the configuration. */
export type HarmConfig = Pick<GameConfig, 'exposureRange' | 'guardRange'>;

/** What harm reads of content: each Stat's range. */
export type HarmContent = Pick<ContentSet, 'stats'>;

/**
 * `member`'s mean share of the content range of the Stats `statKeys` names, each from 0 at the Stat's
 * `min` to 1 at its `max`, read of their effective Stats; `undefined` when content defines none of
 * them, or none is named, so that the field counts for nothing (data-model rule 5).
 */
export function meanShare(member: Pick<QueryMember, 'stats'>, statKeys: readonly StatKey[], content: HarmContent): number | undefined {
  let total = 0;
  let counted = 0;
  for (const statKey of statKeys) {
    const stat = Object.hasOwn(content.stats, statKey) ? content.stats[statKey] : undefined;
    if (stat === undefined) continue;
    const value = Object.hasOwn(member.stats, statKey) ? (member.stats[statKey] ?? stat.default) : stat.default;
    const range = stat.max - stat.min;
    total += range > 0 ? Math.min(1, Math.max(0, (value - stat.min) / range)) : 0;
    counted += 1;
  }
  return counted === 0 ? undefined : total / counted;
}

/**
 * `member`'s weight in the draw of who harm `exposedBy` the Stats `statKeys` falls on: 1 +
 * `exposureRange` × (1 − their mean share). 1 for none.
 */
export function exposure(member: Pick<QueryMember, 'stats'>, statKeys: readonly StatKey[] | undefined, content: HarmContent, config: HarmConfig): number {
  const share = statKeys === undefined ? undefined : meanShare(member, statKeys, content);
  return share === undefined ? 1 : 1 + config.exposureRange * (1 - share);
}

/**
 * What `member` keeps of a chance `guardedBy`, or of a Morale loss `steadiedBy`, the Stats `statKeys`:
 * 1 − `guardRange` × their mean share. 1 for none.
 */
export function guard(member: Pick<QueryMember, 'stats'>, statKeys: readonly StatKey[] | undefined, content: HarmContent, config: HarmConfig): number {
  const share = statKeys === undefined ? undefined : meanShare(member, statKeys, content);
  return share === undefined ? 1 : 1 - config.guardRange * share;
}

/**
 * Of `pool`, the Heroes harm can fall on in Party order, those `among` names of `party`; all of
 * `pool` when there is no `among`, or when it names none of them.
 */
export function narrowed<Hero extends { id: HeroId }>(pool: readonly Hero[], among: SetQuery | undefined, party: QueryParty): readonly Hero[] {
  if (among === undefined) return pool;
  const named = new Set(membersOf(among, party).map((member) => member.hero.id));
  const within = pool.filter((hero) => named.has(hero.id));
  return within.length === 0 ? pool : within;
}
