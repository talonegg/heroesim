// Synergies (M4-S3, R26, INPUTS 6.4, DL-45), and the Synergy term of a Check's capability (M4-S2's
// seam, DL-42). A Synergy is content (`synergies.json`, principle 6): a combination of Classes or
// Skills a Party may hold, the bonus it earns, and the Encounter kinds it earns it on. The engine
// only matches the combination against the Party's members and adds the bonus; a new Synergy is a
// content change.
//
// On an Encounter, the Synergies that apply are those the members still in the sequence meet
// (`synergiesFor`) whose kinds hold the Encounter's (`synergiesOn`). Their `factor`s are multiplied
// together and scale `base`, the capability's Stats and Skills term, and their `flat`s are summed
// and added unscaled: the term is `base × (∏ factor − 1) + Σ flat`, so that the capability before
// the teamwork scalar is `base × ∏ factor + Σ flat`. No Synergy's bonus is read against another's,
// so the order they are listed in never matters. With none, the term is 0, which leaves the Check
// what it would be without it.

import type { EngineDeps } from '../config.js';
import type { ContentSet, Encounter, EncounterKind, Synergy, SynergyRequires } from '../content-types.js';
import type { Hero } from '../document.js';
import { sortedRows } from '../generators/draw.js';

/** Who a Synergy is matched against: the Class and Skills of each member. */
export type SynergyMember = Pick<Hero, 'classKey' | 'skills'>;

/**
 * Whether `heroes` meet `requires`: at least the count named of each Class, and each Skill named
 * held, at any rating, by at least one member. A Hero counts once for their Class and may hold
 * several of the Skills.
 */
export function meetsRequirement(heroes: readonly SynergyMember[], requires: SynergyRequires): boolean {
  for (const [classKey, count] of Object.entries(requires.classes ?? {})) {
    if (heroes.filter((hero) => hero.classKey === classKey).length < count) return false;
  }
  for (const skillKey of requires.skills ?? []) {
    if (!heroes.some((hero) => Object.hasOwn(hero.skills, skillKey) && (hero.skills[skillKey] ?? 0) >= 1)) return false;
  }
  return true;
}

/**
 * The Synergies `heroes`, as a Party, would have (M4-S3): every one of content's whose requirement
 * they meet (`meetsRequirement`), in key order, whatever Encounter they meet. A selector: the Check
 * reads it through `synergiesOn`, and a front end shows it for a proposed Party before dispatch.
 */
export function synergiesFor(heroes: readonly SynergyMember[], content: Pick<ContentSet, 'synergies'>): Synergy[] {
  return sortedRows(content.synergies, (synergy) => meetsRequirement(heroes, synergy.requires));
}

/** Whether `synergy` applies on an Encounter of `kind`: one of its kinds, or any kind when it names none. */
export function appliesOn(synergy: Pick<Synergy, 'kinds'>, kind: EncounterKind): boolean {
  return synergy.kinds === undefined || synergy.kinds.includes(kind);
}

/** The Synergies `heroes` have on `encounter`: `synergiesFor`'s, those of its kind, in key order. */
export function synergiesOn(
  heroes: readonly SynergyMember[],
  encounter: Pick<Encounter, 'kind'>,
  content: Pick<ContentSet, 'synergies'>,
): Synergy[] {
  return synergiesFor(heroes, content).filter((synergy) => appliesOn(synergy, encounter.kind));
}

/**
 * The Synergy bonus `heroes`, the Party members still in the sequence, add to their capability on
 * `encounter`, whose capability before it is `base` (Stats and Skills): `base × (∏ factor − 1) +
 * Σ flat` over `synergiesOn`'s Synergies, a missing `factor` being 1 and a missing `flat` 0. The
 * Check adds it to `base` before the teamwork scalar (DL-42 item 10, DL-45).
 */
export function synergyBonus(
  heroes: readonly Hero[],
  encounter: Encounter,
  base: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  let factor = 1;
  let flat = 0;
  for (const synergy of synergiesOn(heroes, encounter, deps.content)) {
    factor *= synergy.bonus.factor ?? 1;
    flat += synergy.bonus.flat ?? 0;
  }
  return base * (factor - 1) + flat;
}
