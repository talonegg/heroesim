// The Party as a Query reads it (v1.1.4-S1, ADR-0010, DL-148 items 4 to 6): how a Check's score and a
// Synergy's requirements read the Party. A Query is content, a JSON array operator first
// (content-types.ts, `NumQuery` and the four types it is built of); the engine only evaluates it, so
// a new way to read the Party is a content change unless it needs a new operator (ADR-0006). Each
// operator is a row of `query/operators.ts` (v1.1.6-S10, DL-186 item 6), which the evaluator's
// functions, exported here, walk; this file takes the Party they read.
//
// Each Hero's effective Stats are read once, through `effectiveStats`, when the Party is taken for
// an Encounter, with their Morale on the Quest, their age, whether they are hurt and their form
// (v1.1.4-S3, form.ts). It reads only the Party's own Heroes and their state on the Quest: never the
// Guild's leader nor the Guild's dealings (M4's third risk; the Check's test reads this file to hold
// it so), nor Regard between particular Heroes (DL-148 item 5).

import type { EngineDeps } from '../config.js';
import type { ContentSet } from '../content-types.js';
import type { Hero, HeroId, StatValues, World } from '../document.js';
import { effectiveStats } from '../selectors.js';
import { ageOf } from '../time.js';
import { formOf, workingMorale } from './form.js';

export { evaluate, heroOf, holds, is, membersOf, valueOf } from './query/operators.js';

/** One member of the Party as a Query reads them on an Encounter. */
export interface QueryMember {
  hero: Hero;
  /** Their effective Stats (`effectiveStats`), read once when the Party is taken. */
  stats: StatValues;
  /** Their Morale on the Quest (`workingMorale`): what `["morale"]` reads, and what Morale's factor in their form reads. */
  morale: number;
  /** Their age in whole years at the Turn the Party is taken (`ageOf`). */
  age: number;
  /** Whether they are hurt on this Quest: what `["hurt"]` reads. */
  hurt: boolean;
  /** Their form (v1.1.4-S3, `formOf`): the factor on the Stat values they add into a Check's score. */
  form: number;
}

/** What has happened to the Party on the Quest so far, as the Queries read it (v1.1.4-S3). */
export interface OnQuest {
  /** The Heroes hurt earlier on the Quest; none when absent. */
  hurt?: ReadonlySet<HeroId>;
  /**
   * The Morale consequences applied so far to each Hero, by id: their own (DL-155), a loss
   * `steadiedBy` their Stats being less for some (harm.ts). 0 for a Hero absent, and for all when absent.
   */
  moraleByHero?: Readonly<Record<HeroId, number>>;
}

/** What a Query reads of content: whether a key it names is still defined. */
export type QueryContent = Pick<ContentSet, 'skills' | 'classes' | 'backgrounds' | 'heroTraits'>;

/** The Party a Query is evaluated over: its members in Party order, and the content they are read by. */
export interface QueryParty {
  members: readonly QueryMember[];
  content: QueryContent;
}

/**
 * `heroes`, the members still in the sequence in Party order, as Queries read them on one Encounter:
 * each Hero's effective Stats read once (`effectiveStats`); their Morale on the Quest, their stored
 * Morale plus their own of `onQuest.moraleByHero` held to the scale (`workingMorale`); their age at `world.turn`;
 * whether `onQuest.hurt` holds their id; and their form from those two (`formOf`, v1.1.4-S3). With
 * nothing `onQuest`, the Party as it sets out.
 */
export function queryParty(
  heroes: readonly Hero[],
  world: World,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  onQuest: OnQuest = {},
): QueryParty {
  const { config, content } = deps;
  const { hurt = new Set(), moraleByHero = {} } = onQuest;
  return {
    members: heroes.map((hero) => {
      const delta = Object.hasOwn(moraleByHero, hero.id) ? (moraleByHero[hero.id] ?? 0) : 0;
      const morale = workingMorale(hero.morale, delta, config);
      const isHurt = hurt.has(hero.id);
      return {
        hero,
        stats: effectiveStats(hero, world, content),
        morale,
        age: ageOf(hero, world.turn, config),
        hurt: isHurt,
        form: formOf(morale, isHurt, config),
      };
    }),
    content,
  };
}
