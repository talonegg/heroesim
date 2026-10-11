// The Party as a Query reads it (v1.1.4-S1, ADR-0010, DL-148 items 4 to 6): how a Check's score and a
// Synergy's requirements read the Party. A Query is content, a JSON array operator first
// (content-types.ts, `NumQuery` and the four types it is built of); the engine only evaluates it, so
// a new way to read the Party is a content change unless it needs a new operator (ADR-0006). Each
// operator is a row of `query/operators.ts` (v1.1.6-S10, DL-186 item 6), which the evaluator's
// functions, exported here, walk; this file takes the Party they read.
//
// Each Hero's effective Stats are read once, through `effectiveStats`, when the Party is taken for
// an Encounter, with their Morale on the Quest, their Fatigue on the Encounter's Day, their age,
// whether they are hurt and how far that is relieved, and their formed Stats, which the form module
// works out from those (form.ts, DL-284, DL-285). It is the one place a member is built: the
// resolver, the estimate and the Party builder all take the Party here. It reads only the Party's own Heroes and their state on the Quest: never
// the Guild's leader nor the Guild's dealings (M4's third risk; the Check's test reads this file to
// hold it so), nor Regard between particular Heroes (DL-148 item 5).

import type { EngineDeps } from '../config.js';
import type { ContentSet } from '../content-types.js';
import type { Hero, HeroId, StatValues, World } from '../document.js';
import { effectiveStats } from '../selectors.js';
import { ageOf } from '../time.js';
import { formedStats, hurtRelief, relievesHurt, workingMorale } from './form.js';

export { evaluate, heroOf, holds, is, membersOf, valueOf } from './query/operators.js';

/** One member of the Party as a Query reads them on an Encounter. */
export interface QueryMember {
  hero: Hero;
  /** Their effective Stats (`effectiveStats`), read once when the Party is taken: what every read but a Check's score reads. */
  stats: StatValues;
  /** Their formed Stats on the Encounter (`formedStats`, DL-284): what a Check's score reads of each Stat they add into it. */
  formed: StatValues;
  /** Their Morale on the Quest (`workingMorale`): what `["morale"]` reads, and what Morale's factor in their form reads. */
  morale: number;
  /** Their Fatigue on the Encounter's Day (the Quest clock, clock.ts): what Fatigue's factors in their form and on their harm read. */
  fatigue: number;
  /** Their age in whole years at the Turn the Party is taken (`ageOf`). */
  age: number;
  /** Whether they are hurt on this Quest: what `["hurt"]` reads. */
  hurt: boolean;
  /**
   * The share of their hurt's gap relieved on the Encounter (`hurtRelief`, DL-285): by a Healer among
   * the other members, by a heal Item spent on them, or both; 0 when they are unhurt.
   */
  relief: number;
}

/** What has happened to the Party on the Quest so far, and the Day it has come to, as the Queries read it (v1.1.4-S3). */
export interface OnQuest {
  /** The Heroes hurt earlier on the Quest; none when absent. */
  hurt?: ReadonlySet<HeroId>;
  /** The hurt Heroes a heal Item spent at their Injury relieves for the rest of the Quest (DL-285); none when absent. */
  relieved?: ReadonlySet<HeroId>;
  /**
   * The Morale consequences applied so far to each Hero, by id: their own (DL-155), a loss
   * `steadiedBy` their Stats being less for some (harm.ts). 0 for a Hero absent, and for all when absent.
   */
  moraleByHero?: Readonly<Record<HeroId, number>>;
  /**
   * Each Hero's Fatigue on the Encounter's Day, by id, from the Quest clock (`questClock`'s
   * `fatigueAt`, DL-282 item 4). A Hero absent reads their stored Fatigue, as they set out.
   */
  fatigueByHero?: Readonly<Record<HeroId, number>>;
}

/** What a Query reads of content: whether a key it names is still defined. */
export type QueryContent = Pick<ContentSet, 'skills' | 'classes' | 'backgrounds' | 'heroTraits'>;

/** The Party a Query is evaluated over: its members in Party order, and the content they are read by. */
export interface QueryParty {
  members: readonly QueryMember[];
  content: QueryContent;
  /**
   * The Party this one is on another Day of the same Quest (the estimate's, `atFatigue`): its members
   * the same but for their Fatigue and formed Stats, which no Synergy's requirement reads, so it meets
   * that Party's Synergies (synergy.ts). Absent for a Party taken afresh.
   */
  base?: QueryParty;
}

/**
 * `heroes`, the members still in the sequence in Party order, as Queries read them on one Encounter:
 * each Hero's effective Stats read once (`effectiveStats`); their Morale on the Quest, their stored
 * Morale plus their own of `onQuest.moraleByHero` held to the scale (`workingMorale`); their Fatigue
 * on the Encounter's Day, `onQuest.fatigueByHero`'s or else their stored Fatigue; their age at
 * `world.turn`; whether `onQuest.hurt` holds their id; their relief once hurt (`hurtRelief`, DL-285),
 * by a Healer when another of `heroes` is of a Class content marks `relievesHurt`, one relief however
 * many, and by a heal Item when `onQuest.relieved` holds their id; and their formed Stats from those
 * (`formedStats`, DL-284). With nothing `onQuest`, the Party as it sets out.
 */
export function queryParty(
  heroes: readonly Hero[],
  world: World,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  onQuest: OnQuest = {},
): QueryParty {
  const { config, content } = deps;
  const { hurt = new Set(), relieved = new Set(), moraleByHero = {}, fatigueByHero = {} } = onQuest;
  const healers = heroes.filter((hero) => relievesHurt(hero.classKey, content));
  return {
    members: heroes.map((hero) => {
      const delta = Object.hasOwn(moraleByHero, hero.id) ? (moraleByHero[hero.id] ?? 0) : 0;
      const morale = workingMorale(hero.morale, delta, config);
      const fatigue = Object.hasOwn(fatigueByHero, hero.id) ? (fatigueByHero[hero.id] ?? hero.fatigue) : hero.fatigue;
      const isHurt = hurt.has(hero.id);
      const relief = isHurt ? hurtRelief({ healer: healers.some((healer) => healer.id !== hero.id), item: relieved.has(hero.id) }, config) : 0;
      const stats = effectiveStats(hero, world, content);
      return {
        hero,
        stats,
        formed: formedStats(stats, { morale, fatigue, hurt: isHurt, relief }, deps),
        morale,
        fatigue,
        age: ageOf(hero, world.turn, config),
        hurt: isHurt,
        relief,
      };
    }),
    content,
  };
}

/**
 * `member` on another Day of the same Quest (DL-284): as they are but for their Fatigue, `fatigue`, and
 * their formed Stats read again at it (`formedStats`); the same member when their Fatigue is unchanged.
 * What the estimate takes for each Day of a Quest its Encounters fall on (estimate.ts).
 */
export function atFatigue(member: QueryMember, fatigue: number, deps: Pick<EngineDeps, 'config' | 'content'>): QueryMember {
  if (fatigue === member.fatigue) return member;
  return { ...member, fatigue, formed: formedStats(member.stats, { morale: member.morale, fatigue, hurt: member.hurt, relief: member.relief }, deps) };
}
