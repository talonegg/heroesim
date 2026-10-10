// The Best Party (CONTEXT.md; DL-148 item 17, DL-157, DL-175): the Party the engine would send on a
// Quest from a Guild's free Heroes, chosen by the chance estimate. One module answers it for every
// caller (DL-237): the Rivals' controllers, the harness's policy, the Board's "Your best Party" on the
// page and in the CLI, and the harness's calibration. It is opened over one world, which does not
// change while it is open, and a Guild, and it keeps each Hero as they will come home and every
// Party it has weighed, so that a question asked again, or asked of fewer Heroes, weighs only the
// Parties it has not weighed. It lives no longer than its world (DL-232 item 3): one `rivalChoices`
// call, one `automaticPolicy` call, one document on the page. It is never module-global and never
// stored in the document, and it refuses a question once its world has changed.

import type { EngineDeps } from './config.js';
import { chooser } from './controllers/chooser.js';
import { compareByCodeUnit, rowOf, type Guild, type Hero, type HeroId, type Quest, type World } from './document.js';
import { partyEstimator, type EstimatedQuest, type QuestEstimate } from './quest-engine/estimate.js';

/** The Best Party for a Quest, and the estimate it was chosen by (`estimateQuest`'s for it, carrying nothing); `null` for no estimate. */
export interface BestParty {
  heroIds: HeroId[];
  estimate: QuestEstimate | null;
}

/**
 * The Best Party module over one world for one Guild (`bestParties`). Each answer equals the one a
 * module newly opened over the same world gives. An estimate it gives may be given again, to this
 * question or another, so a caller does not change one.
 *
 * Throws a `RangeError` once its world has changed since it was opened: when the world's Turn, its
 * id counters or its random streams have moved, or a Hero asked about is not the world's own row.
 */
export interface BestParties {
  /**
   * The Best Party for `quest` from `heroes`, or `null` when no Party of them meets the Quest's size
   * and requirements. The rule, by the chance estimate (the chance of a success or a strong success,
   * the Party as it comes home, carrying nothing, if no one falls):
   *
   * 1. It starts with the Heroes who meet the Quest's Class and Skill requirements: while one is
   *    unmet, the Hero who most raises the chance among those who meet every requirement still unmet,
   *    or, when no one does, among those who meet one of them. So one Hero who has both goes alone,
   *    and two go only when no one Hero has both.
   * 2. It adds the Hero who most raises the chance until it reaches `partySizeMin`.
   * 3. It keeps adding the Hero who most raises it while that Hero raises it by more than the Guild's
   *    margin (its Disposition's `partyMargin`; for a Guild with none, `playerPartyMargin`), up to
   *    `partySizeMax`: by more than nothing at a margin of 0 (DL-175).
   *
   * Of Heroes who raise it alike, the one who most raises the chance of a strong success goes, then
   * the lowest Hero id, so the rule is deterministic, whatever the order of `heroes`; a Quest whose
   * Encounters are drawn on the way has no estimate, so its Heroes are added by id. The Party is in
   * the order its Heroes were added, which the Quest's Queries read for their ties (DL-148 item 18).
   * `null` exactly when `requiredParty` is, so `staffableQuests` searches with that and lets
   * `dispatch`'s own checks judge the Party. Draws nothing.
   */
  party(quest: Pick<Quest, 'id' | 'requirements'> & EstimatedQuest, heroes: readonly Hero[]): BestParty | null;
  /** `heroes`' chance on `quest`, as a Party in that order: `estimateQuest`'s, carrying nothing. */
  chance(quest: EstimatedQuest, heroes: readonly Hero[]): QuestEstimate | null;
}

/**
 * The Best Party module over `world` for `guild` (DL-237). `world` must not change while the module
 * is used; open one for each world.
 */
export function bestParties(world: World, guild: Pick<Guild, 'controller'>, deps: EngineDeps): BestParties {
  const opened = stampOf(world);
  const margin = partyMarginOf(guild, deps);
  const estimate = partyEstimator(world, deps);
  // Each Party weighed, by what the estimate reads of its Quest and then its Heroes in order.
  const weighed = new Map<string, Map<string, QuestEstimate | null>>();
  const asking = (heroes: readonly Hero[]): void => {
    if (stampOf(world) !== opened || heroes.some((hero) => rowOf(world.heroes, hero.id) !== hero)) {
      throw new RangeError('The Best Party module was opened over another world: open one over this world');
    }
  };
  const weigh = (quest: EstimatedQuest, party: readonly Hero[], pool: readonly Hero[]): QuestEstimate | null => {
    const questKey = JSON.stringify([quest.difficulty, quest.durationTurns, quest.encounterKeys]);
    let ofQuest = weighed.get(questKey);
    if (ofQuest === undefined) {
      ofQuest = new Map();
      weighed.set(questKey, ofQuest);
    }
    const key = party.map((hero) => hero.id).join(' ');
    if (ofQuest.has(key)) return ofQuest.get(key) as QuestEstimate | null;
    const found = estimate(quest, party, { pool });
    ofQuest.set(key, found);
    return found;
  };
  return {
    party(quest, heroes) {
      asking(heroes);
      return search(quest, heroes, margin, (party) => chanceIn(weigh(quest, party, heroes)));
    },
    chance(quest, heroes) {
      asking(heroes);
      return weigh(quest, heroes, heroes);
    },
  };
}

/**
 * What a change of `world` moves, read cheaply: its Turn, its id counters (every row an action makes)
 * and its random streams (every draw).
 */
function stampOf(world: World): string {
  return JSON.stringify([world.turn, world.counters, world.rng]);
}

/** The Best Party's rule (`BestParties.party`), each Party weighed by `chanceOf`. */
function search(quest: Pick<Quest, 'id' | 'requirements'>, available: readonly Hero[], margin: number, chanceOf: (party: readonly Hero[]) => Chance): BestParty | null {
  if (requiredParty(quest, available) === null) return null;
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const party: Hero[] = [];
  const left = (): Hero[] => available.filter((hero) => !party.includes(hero));
  // Of `candidates`, the Hero whose joining leaves the Party the best chance, and that chance.
  const best = (candidates: readonly Hero[]): { hero: Hero; chance: Chance } => {
    let chosen: { hero: Hero; chance: Chance } | undefined;
    for (const hero of candidates) {
      const chance = chanceOf([...party, hero]);
      if (chosen === undefined || better(chance, hero, chosen.chance, chosen.hero)) chosen = { hero, chance };
    }
    if (chosen === undefined) throw new RangeError(`The Best Party found no Hero to add for ${quest.id}`);
    return chosen;
  };

  const ofClass = (hero: Hero): boolean => hero.classKey === classKey;
  const withSkill = (hero: Hero): boolean => skillKey !== undefined && Object.hasOwn(hero.skills, skillKey);
  const unmet = (): ((hero: Hero) => boolean)[] => [
    ...(classKey !== undefined && !party.some(ofClass) ? [ofClass] : []),
    ...(skillKey !== undefined && !party.some(withSkill) ? [withSkill] : []),
  ];
  for (let needs = unmet(); needs.length > 0; needs = unmet()) {
    const rest = left();
    const every = rest.filter((hero) => needs.every((meets) => meets(hero)));
    party.push(best(every.length > 0 ? every : rest.filter((hero) => needs.some((meets) => meets(hero)))).hero);
  }
  while (party.length < partySizeMin) party.push(best(left()).hero);

  let chance = chanceOf(party);
  // No Hero can raise the chance by more than what is left of it below 1, so none is asked once that
  // cannot pass the margin.
  while (party.length < partySizeMax && party.length < available.length && 1 - chance.success > margin) {
    const next = best(left());
    if (!(next.chance.success - chance.success > margin)) break;
    party.push(next.hero);
    chance = next.chance;
  }
  return { heroIds: party.map((hero) => hero.id), estimate: chance.estimate };
}

/** What the Best Party weighs a Party by: its chance of a success or better, and of a strong success; and the estimate they are of. */
interface Chance {
  success: number;
  strong: number;
  estimate: QuestEstimate | null;
}

/**
 * `estimate`'s chances, a success's held to at most 1 against a sum's rounding, so that no Hero raises
 * it by more than is left of it; none for a Quest whose Encounters are drawn on the way.
 */
function chanceIn(estimate: QuestEstimate | null): Chance {
  return estimate === null ? { success: 0, strong: 0, estimate } : { success: Math.min(1, estimate.success), strong: estimate.bands.strong, estimate };
}

/** Whether `hero` joining for `chance` beats `other` joining for `otherChance`: the better success, then strong success, then the lower id. */
function better(chance: Chance, hero: Hero, otherChance: Chance, other: Hero): boolean {
  if (chance.success !== otherChance.success) return chance.success > otherChance.success;
  if (chance.strong !== otherChance.strong) return chance.strong > otherChance.strong;
  return compareByCodeUnit(hero.id, other.id) < 0;
}

/**
 * How much more than this a Hero must raise the chance to join `guild`'s Best Party past
 * `partySizeMin`: its Disposition's `partyMargin`; for a Guild with no Disposition, the player's, or
 * with one content does not define, the configuration's `playerPartyMargin` (DL-157, DL-175).
 */
function partyMarginOf(guild: Pick<Guild, 'controller'>, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  const disposition = chooser(guild, deps.content);
  return disposition === 'own' || disposition === null ? deps.config.playerPartyMargin : disposition.partyMargin;
}

/**
 * A Party of `available` that meets `quest`'s size and requirements, or `null` when none does: the
 * first of them, in the order given, who meets both a required Class and a required Skill, or, when
 * no one does, the first who meets each; then the first of the rest up to `partySizeMin`. The Best
 * Party is named exactly when this names one; who goes is its estimate's to choose. Draws nothing and
 * asks no estimate, so the Board can be searched with it every Turn.
 */
export function requiredParty(quest: Pick<Quest, 'requirements'>, available: readonly Hero[]): Hero[] | null {
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const ofClass = (hero: Hero): boolean => classKey === undefined || hero.classKey === classKey;
  const withSkill = (hero: Hero): boolean => skillKey === undefined || Object.hasOwn(hero.skills, skillKey);
  const party: Hero[] = [];
  if (classKey !== undefined || skillKey !== undefined) {
    const both = available.find((hero) => ofClass(hero) && withSkill(hero));
    if (both !== undefined) {
      party.push(both);
    } else {
      // Only when both are required and no one Hero meets both: then two Heroes meet one each.
      const classHero = available.find(ofClass);
      const skillHero = available.find(withSkill);
      if (classHero === undefined || skillHero === undefined) return null;
      party.push(classHero, skillHero);
    }
  }
  const size = Math.max(partySizeMin, party.length);
  if (size > partySizeMax || size > available.length) return null;
  for (const hero of available) {
    if (party.length >= size) break;
    if (!party.includes(hero)) party.push(hero);
  }
  return party;
}
