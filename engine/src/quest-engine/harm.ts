// Harm that reads the Stats (v1.1.4-S4, DL-148 item 14, `CONTEXT.md` Exposure and Guard): who an
// Injury or a Death falls on, and who shrugs it off, follow content's Queries and the Heroes' Stats.
// - `among`, a Set Query, names who it may fall on, read over those it can fall on: an Injury's over
//   the unhurt living Heroes, so `bottom` 1 takes the weakest unhurt and passes over a weaker Hero
//   already hurt; a Death's over the living Party (v1.1.5-S4, DL-168 item 6, DL-178). When it names
//   no one, it falls on any of them (`narrowed`).
// - `exposedBy` weights the draw of who is hit: 1 + `exposureRange` × (1 − the Hero's mean share of
//   those Stats' content range), so the weakest are the likeliest (`exposure`).
// - `guardedBy` scales the chance by 1 − `guardRange` × the chosen Hero's mean share, and a Morale
//   loss's `steadiedBy` scales each Hero's loss by the same rule (`guard`, `moraleOf`).
// A share reads the Hero's effective Stats as the Queries do (`QueryMember.stats`), so armour's
// Constitution protects; never their form, which is about what a Hero adds to a Check (DL-155).
//
// It owns who a consequence falls on and the draws that takes (v1.1.6-S9, DL-186 item 4): `strike`
// for one count of an Injury or a Death, `chooseEarner` for an earned Trait, each two draws from the
// stream it is given, whether it lands then on whom, whether or not anyone can be hit; the resolver
// asks and applies (resolve.ts). With none of the fields every weight and every guard is 1, and the
// draw of who is hit is `pick`'s. The Party as the Queries read it is asked for only when a field
// needs it.

import type { GameConfig } from '../config.js';
import type {
  ContentSet,
  DeathConsequence,
  Degree,
  InjuryConsequence,
  MoraleConsequence,
  SetQuery,
  StatKey,
  TraitConsequence,
  TraitKey,
} from '../content-types.js';
import { rowOf, type HeroId } from '../document.js';
import type { Stream } from '../generators/draw.js';
import { next, pick, weightedPick } from '../rng.js';
import { mayEarn, type HeroTraitContent } from '../traits.js';
import { succeeded } from './degree.js';
import { membersOf, type QueryMember, type QueryParty } from './query.js';

/** What harm reads of the configuration. */
export type HarmConfig = Pick<GameConfig, 'exposureRange' | 'guardRange'>;

/** What harm reads of content: each Stat's range. */
export type HarmContent = Pick<ContentSet, 'stats'>;

/** What `strike`, `chooseEarner` and `moraleOf` read: the configuration's ranges, the Stats and the Hero Traits. */
export interface HarmDeps {
  config: HarmConfig;
  content: HarmContent & HeroTraitContent;
}

/**
 * The Party on the Quest as harm reads it before a consequence (v1.1.6-S9): its living members in
 * Party order, those hurt on the Quest so far, and those the Encounter being applied has injured, in
 * the order it did, some perhaps since dead.
 */
export interface Candidates<Hero extends { id: HeroId }> {
  living: readonly Hero[];
  hurt: ReadonlySet<HeroId>;
  injuredHere: readonly HeroId[];
}

/** A Trait drawn on the Quest so far, by its Hero, and whether it is a positive one. */
export interface Drawn {
  heroId: HeroId;
  positive: boolean;
}

/**
 * `member`'s mean share of the content range of the Stats `statKeys` names, each from 0 at the Stat's
 * `min` to 1 at its `max`, read of their effective Stats; `undefined` when content defines none of
 * them, or none is named, so that the field counts for nothing (data-model rule 5).
 */
export function meanShare(member: Pick<QueryMember, 'stats'>, statKeys: readonly StatKey[], content: HarmContent): number | undefined {
  let total = 0;
  let counted = 0;
  for (const statKey of statKeys) {
    const stat = rowOf(content.stats, statKey);
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
 * Of `pool`, the Heroes a consequence can fall on in Party order, those `among` names, read over
 * `party`'s members in `pool` (v1.1.5-S4, DL-178): so a `bottom` or a `top` ranks only the Heroes it
 * can fall on. None when it names none of them. An earned Trait's `among` is read so too (v1.1.5's
 * re-close, DL-185), over its own pool, without `narrowed`'s fallback.
 */
function namedIn<Hero extends { id: HeroId }>(pool: readonly Hero[], among: SetQuery, party: QueryParty): Hero[] {
  const inPool = new Set(pool.map((hero) => hero.id));
  const over: QueryParty = { ...party, members: party.members.filter((member) => inPool.has(member.hero.id)) };
  const named = new Set(membersOf(among, over).map((member) => member.hero.id));
  return pool.filter((hero) => named.has(hero.id));
}

/**
 * Of `pool`, the Heroes harm can fall on in Party order, those `among` names (`namedIn`, v1.1.5-S4,
 * DL-178). All of `pool` when there is no `among`, or when it names none of them.
 */
export function narrowed<Hero extends { id: HeroId }>(pool: readonly Hero[], among: SetQuery | undefined, party: QueryParty): readonly Hero[] {
  if (among === undefined) return pool;
  const within = namedIn(pool, among, party);
  return within.length === 0 ? pool : within;
}

/**
 * Whom one count of an Injury, or a Death, lands on (v1.1.4-S4, v1.1.6-S9): two draws from `stream`,
 * taken whether or not it lands, so tuning a chance never shifts a later draw. The first, whether it
 * lands; the second, on whom, by `weightedPick`, each Hero's weight their exposure by `exposedBy`, or
 * one draw from no one when there is no one to hit. Its pool is an Injury's the unhurt living, so
 * that no Hero carries two Injuries from a Quest, and a Death's the living Party, since a wound makes
 * no one safer (v1.1.5-S4, DL-178); of it those its `among` names, read over the pool, or all of it
 * when it names none of them (`narrowed`). It lands when the first draw is below the chance times the
 * chosen Hero's guard by `guardedBy`. `party`, the living as the Queries read them, is asked for only
 * when it reads one of the fields; with none, the draws are `chance`'s and `pick`'s. `undefined` when
 * it lands on no one.
 */
export function strike<Hero extends { id: HeroId }>(
  consequence: InjuryConsequence | DeathConsequence,
  candidates: Candidates<Hero>,
  party: () => QueryParty,
  stream: Stream,
  deps: HarmDeps,
): Hero | undefined {
  const u = next(stream);
  const pool = consequence.kind === 'injury' ? candidates.living.filter((hero) => !candidates.hurt.has(hero.id)) : candidates.living;
  const { among, exposedBy, guardedBy } = consequence;
  const reads = among !== undefined || exposedBy !== undefined || guardedBy !== undefined;
  const members = reads ? party() : undefined;
  const within = members === undefined ? pool : narrowed(pool, among, members);
  if (within.length === 0) {
    next(stream);
    return undefined;
  }
  const byHero = members === undefined ? undefined : byId(members);
  const weightOf = (hero: Hero): number => {
    const member = byHero?.get(hero.id);
    return member === undefined ? 1 : exposure(member, exposedBy, deps.content, deps.config);
  };
  const hero = weightedPick(stream, within, within.map(weightOf));
  const member = byHero?.get(hero.id);
  const guarded = member === undefined ? 1 : guard(member, guardedBy, deps.content, deps.config);
  return u < consequence.chance * guarded ? hero : undefined;
}

/** Whom an earned Trait falls on (`chooseEarner`), and whether it is a positive one. */
export interface Earner<Hero> {
  hero: Hero;
  positive: boolean;
}

/**
 * Whom an earned Trait drawn at `degree` falls on (v1.1.4-S7, DL-148 item 25; v1.1.6-S9): two draws
 * from `stream`, taken whether or not it lands, the second from no one too. The first, whether it
 * lands, below the chance; the second, on whom, by `pick`. A positive Trait, at a Triumph or a
 * Success, falls among the living Party; a negative one, at a Failure, among those this Encounter
 * injured who still live; of them those `among` names, read over them alone, so that a `bottom` or a
 * `top` ranks only the Heroes it can fall on (`namedIn`; #52's judgement call 6, v1.1.5's re-close,
 * DL-185), and none when it names none, with no fallback; of those the Heroes who may take it: who
 * may earn this one (`mayEarn`) and have drawn no Trait on this Quest (`drawn`), save that a negative
 * one may fall on a Hero holding a positive one, which it then takes the place of (DL-159's
 * verification). A negative one at a Setback, which reads the failure list having none of its own,
 * falls on no one, its two draws still taken (v1.1.4-S14). `party` is asked for only when there is an
 * `among`. `undefined` when it lands on no one.
 */
export function chooseEarner<Hero extends { id: HeroId; traits: readonly TraitKey[] }>(
  consequence: TraitConsequence,
  degree: Degree,
  candidates: Candidates<Hero>,
  drawn: readonly Drawn[],
  party: () => QueryParty,
  stream: Stream,
  deps: HarmDeps,
): Earner<Hero> | undefined {
  const u = next(stream);
  const positive = succeeded(degree);
  if (!positive && degree !== 'failure') {
    next(stream);
    return undefined;
  }
  const pool = positive ? candidates.living : candidates.living.filter((hero) => candidates.injuredHere.includes(hero.id));
  const named = consequence.among === undefined ? undefined : new Set(namedIn(pool, consequence.among, party()).map((hero) => hero.id));
  const eligible = pool.filter(
    (hero) =>
      (named === undefined || named.has(hero.id)) &&
      !drawn.some((it) => it.heroId === hero.id && (positive || !it.positive)) &&
      mayEarn(hero.traits, consequence.traitKey, deps.content),
  );
  if (eligible.length === 0) {
    next(stream);
    return undefined;
  }
  const hero = pick(stream, eligible);
  return u < consequence.chance ? { hero, positive } : undefined;
}

/**
 * Each of `living`'s own share of a Morale consequence, by id in Party order (v1.1.4-S4): a loss
 * `steadiedBy` some Stats times the Hero's guard by them; a gain, or a loss steadied by none, as
 * written. Draws nothing; `party` is asked for only for a steadied loss.
 */
export function moraleOf<Hero extends { id: HeroId }>(
  consequence: MoraleConsequence,
  living: readonly Hero[],
  party: () => QueryParty,
  deps: HarmDeps,
): Map<HeroId, number> {
  const { delta, steadiedBy } = consequence;
  const steadied = delta < 0 && steadiedBy !== undefined ? byId(party()) : undefined;
  return new Map(
    living.map((hero): [HeroId, number] => {
      const member = steadied?.get(hero.id);
      return [hero.id, member === undefined ? delta : delta * guard(member, steadiedBy, deps.content, deps.config)];
    }),
  );
}

/** `party`'s members by their Hero's id. */
function byId(party: QueryParty): Map<HeroId, QueryMember> {
  return new Map(party.members.map((member) => [member.hero.id, member]));
}
