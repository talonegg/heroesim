// The effects of a Facility, each described once (DL-297, as a Trait's are, DL-243): its label in the
// content editor's form and the number it holds, with its bounds. How a Facility's and an Improvement's
// `effects` are read, the rules they are held to and the editor's forms derive from it. Keyed by the
// engine's `facilityEffectKinds`, so a kind the engine adds and this misses fails to compile. What an
// effect does, and how the Hall's Facilities' values of it join, is the engine's (`facilities.ts`), and
// how a player reads it the words'; a new kind is an engine change (DL-294 item 3).

import { facilityEffectKinds, type FacilityEffectKind, type FacilityEffects } from '@heroesim/engine/content';
import { integer, number, object, optional, type Field, type Fields } from './read.js';

/** The number one effect holds: whole or not, and its bounds, a least it may be or a bound it is above. */
export interface FacilityEffectField {
  /** Its label in the editor's form. */
  label: string;
  type: 'integer' | 'number';
  /** The least it may be. */
  min?: number;
  /** A bound it is above. */
  above?: number;
}

/**
 * Each effect of a Facility (DL-294 item 3): a heal factor above 0, which multiplies an Injury's Days
 * (DL-53); the others 0 or more, as the settings they replace were, so that no Facility tires a Hero
 * at home, takes XP away or lowers Morale.
 */
export const facilityEffects: Readonly<Record<FacilityEffectKind, FacilityEffectField>> = Object.freeze({
  healFactor: { label: 'Heal factor', type: 'number', above: 0 },
  trainingXp: { label: 'Training XP a night', type: 'number', min: 0 },
  moraleBaseline: { label: 'Morale baseline', type: 'number', min: 0 },
  fatigueFall: { label: 'Fatigue fall a night at home', type: 'number', min: 0 },
});

/** How a Facility's or an Improvement's `effects` are read: an object of the kinds described, each a number, any of them left out. */
export const facilityEffectsField: Field<FacilityEffects> = object(
  Object.fromEntries(
    facilityEffectKinds.map((kind) => [kind, optional(facilityEffects[kind].type === 'integer' ? integer : number)]),
  ) as Fields<FacilityEffects>,
  "a Facility's effects",
);

/** The words a value's rule asks for: "a number above 0", "a whole number of 0 or more". */
export function boundsWords(field: FacilityEffectField): string {
  const bounds = [...(field.min === undefined ? [] : [`of ${field.min} or more`]), ...(field.above === undefined ? [] : [`above ${field.above}`])];
  return `a ${field.type === 'integer' ? 'whole ' : ''}number${bounds.length === 0 ? '' : ` ${bounds.join(' and ')}`}`;
}

/** Whether `value` is one `field` allows. */
export function allowsEffect(field: FacilityEffectField, value: unknown): boolean {
  const ofType = field.type === 'integer' ? Number.isInteger(value) : Number.isFinite(value);
  return ofType && (field.min === undefined || (value as number) >= field.min) && (field.above === undefined || (value as number) > field.above);
}

/** The kinds in words: "healFactor, trainingXp, moraleBaseline or fatigueFall". */
const kindsWords = `${facilityEffectKinds.slice(0, -1).join(', ')} or ${facilityEffectKinds.at(-1) ?? ''}`;

/**
 * The rules of the effects at `at`: each a kind described, its value held to its bounds, each problem
 * named by its path. Which kinds a row must have is its kind's rule (`facilities.ts`).
 */
export function checkFacilityEffects(at: string, effects: FacilityEffects, problems: string[]): void {
  for (const [kind, value] of Object.entries(effects)) {
    const described = Object.hasOwn(facilityEffects, kind) ? facilityEffects[kind as FacilityEffectKind] : undefined;
    if (described === undefined) problems.push(`${at}.${kind} is not an effect of a Facility: it is ${kindsWords}`);
    else if (!allowsEffect(described, value)) problems.push(`${at}.${kind} is ${String(value)}; it is ${boundsWords(described)}`);
  }
}
