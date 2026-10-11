// Synergies (M4-S3, R26, INPUTS 6.4, DL-45), and the Synergy term of a Check's capability (M4-S2's
// seam, DL-42). A Synergy is content (`synergies.json`, principle 6): what a Party must meet, the
// bonus it earns, and the Encounter kinds it earns it on. Its requirements are Party-level
// conditions written as Queries (DL-148 item 20, DL-151, ADR-0010), every one of which must hold
// (`holds`, query.ts). The engine only evaluates the conditions over the Party's members and adds
// the bonus; a new Synergy is a content change.
//
// On an Encounter, the Synergies that apply are those the members still in the sequence meet
// (`synergiesFor`) whose kinds hold the Encounter's (`synergiesOn`). Their `factor`s are multiplied
// together and scale `base`, the capability's score and Skills term, and their `flat`s are summed
// and added unscaled: the term is `base × (∏ factor − 1) + Σ flat`, so that the capability before
// the teamwork scalar is `base × ∏ factor + Σ flat`. No Synergy's bonus is read against another's,
// so the order they are listed in never matters. With none, the term is 0, which leaves the Check
// what it would be without it.

import type { EngineDeps } from '../config.js';
import type { ContentSet, Encounter, EncounterKind, Synergy, SynergyRequires } from '../content-types.js';
import { sortedRows } from '../generators/draw.js';
import { holds, type QueryParty } from './query.js';

/** Whether `party` meets `requires`: every one of its conditions holds (`holds`). */
export function meetsRequirement(party: QueryParty, requires: SynergyRequires): boolean {
  return requires.every((condition) => holds(condition, party));
}

/**
 * The Synergies `party` would have (M4-S3): every one of content's whose requirement it meets
 * (`meetsRequirement`), in key order, whatever Encounter it meets. A selector: the Check reads it
 * through `synergiesOn`, and a front end shows it for a proposed Party before dispatch. Worked out
 * once for a Party taken (`queryParty`) and a content's Synergies, neither of which changes once
 * taken, however many Checks read it: the chance estimate reads it for every Check of many Parties
 * (v1.1.4-S6, DL-157). A Party on another Day of the same Quest (`QueryParty.base`) meets its base's,
 * since no requirement reads the formed Stats or the Fatigue that alone differ (DL-284).
 */
export function synergiesFor(party: QueryParty, content: Pick<ContentSet, 'synergies'>): Synergy[] {
  const taken = party.base ?? party;
  const known = metBy.get(taken);
  if (known !== undefined && known.synergies === content.synergies) return [...known.met];
  const met = sortedRows(content.synergies, (synergy) => meetsRequirement(taken, synergy.requires));
  metBy.set(taken, { synergies: content.synergies, met });
  return [...met];
}

/** The Synergies each Party taken afresh met, under the Synergies they were read against (`synergiesFor`). */
const metBy = new WeakMap<QueryParty, { synergies: ContentSet['synergies']; met: Synergy[] }>();

/** Whether `synergy` applies on an Encounter of `kind`: one of its kinds, or any kind when it names none. */
export function appliesOn(synergy: Pick<Synergy, 'kinds'>, kind: EncounterKind): boolean {
  return synergy.kinds === undefined || synergy.kinds.includes(kind);
}

/** The Synergies `party` has on `encounter`: `synergiesFor`'s, those of its kind, in key order. */
export function synergiesOn(
  party: QueryParty,
  encounter: Pick<Encounter, 'kind'>,
  content: Pick<ContentSet, 'synergies'>,
): Synergy[] {
  return synergiesFor(party, content).filter((synergy) => appliesOn(synergy, encounter.kind));
}

/**
 * The Synergy bonus `party`, the Party members still in the sequence, add to their capability on
 * `encounter`, whose capability before it is `base` (score and Skills): `base × (∏ factor − 1) +
 * Σ flat` over `synergiesOn`'s Synergies, a missing `factor` being 1 and a missing `flat` 0. The
 * Check adds it to `base` before the teamwork scalar (DL-42 item 10, DL-45).
 */
export function synergyBonus(
  party: QueryParty,
  encounter: Pick<Encounter, 'kind'>,
  base: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  let factor = 1;
  let flat = 0;
  for (const synergy of synergiesOn(party, encounter, deps.content)) {
    factor *= synergy.bonus.factor ?? 1;
    flat += synergy.bonus.flat ?? 0;
  }
  return base * (factor - 1) + flat;
}
