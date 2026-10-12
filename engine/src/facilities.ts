// The Hall's Facilities (DL-294 item 3): content defines each Facility, its grades (the Improvements)
// and its effects' values at each grade, from the closed set `facilityEffectKinds`. The engine names no
// Facility: every rule a Facility bears on reads its effect here, by kind, over the Hall's Facilities,
// so a Facility, or a grade, content adds needs no change of code (DL-297).
//
// Pure, and draws nothing.

import type { ContentSet, Facility, FacilityEffectKind, FacilityEffects, FacilityKey, Improvement } from './content-types.js';
import type { Hall } from './document.js';

/** How one effect's values join across a Hall's Facilities, and what a Hall with none of it reads. */
export interface FacilityEffectRule {
  /** What a Hall reads where no Facility has the effect: the value that changes nothing. */
  neutral: number;
  /** How two Facilities' values of it join: multiplied, as factors are, or added. */
  join: 'multiply' | 'add';
}

/**
 * Each effect's rule (DL-297): a heal factor multiplies, so two Facilities that each halve an Injury's
 * Days quarter them; the others add. A Hall with no Facility of an effect reads its neutral: an
 * Injury's Days as drawn, no training XP, no Morale added, no fall of Fatigue at home.
 */
export const facilityEffectRules: Readonly<Record<FacilityEffectKind, FacilityEffectRule>> = Object.freeze({
  healFactor: { neutral: 1, join: 'multiply' },
  trainingXp: { neutral: 0, join: 'add' },
  moraleBaseline: { neutral: 0, join: 'add' },
  fatigueFall: { neutral: 0, join: 'add' },
});

/** A Hall before any Improvement: every Facility content defines at grade 0, in content's order. */
export function foundedHall(content: Pick<ContentSet, 'facilities'>): Hall {
  return Object.fromEntries(Object.keys(content.facilities).map((key) => [key, 0]));
}

/** `key`'s grade in `hall`: 0 where the Hall has none, as a Facility content added since its founding. */
export function facilityGrade(hall: Readonly<Hall>, key: FacilityKey): number {
  return Object.hasOwn(hall, key) ? (hall[key] as number) : 0;
}

/** Each Facility's Improvements by grade, worked out once for a set of Improvements. */
const gradesByImprovements = new WeakMap<object, Map<FacilityKey, Improvement[]>>();

/** `facility`'s Improvements, in the order of their grades. */
function improvementsOf(facility: FacilityKey, content: Pick<ContentSet, 'improvements'>): readonly Improvement[] {
  let byFacility = gradesByImprovements.get(content.improvements);
  if (byFacility === undefined) {
    byFacility = new Map();
    for (const row of Object.values(content.improvements)) byFacility.set(row.facility, [...(byFacility.get(row.facility) ?? []), row]);
    for (const rows of byFacility.values()) rows.sort((a, b) => a.grade - b.grade);
    gradesByImprovements.set(content.improvements, byFacility);
  }
  return byFacility.get(facility) ?? [];
}

/** `facility`'s top grade: the highest of its Improvements', 0 for a Facility with none. */
export function topGrade(facility: FacilityKey, content: Pick<ContentSet, 'improvements'>): number {
  return improvementsOf(facility, content).at(-1)?.grade ?? 0;
}

/**
 * The values of `facility`'s effects at `grade`: its own row's at grade 0 or below, the Improvement's
 * of that grade above it, and a grade past its top, which a save may hold from content that had more,
 * reading the top's (DL-297).
 */
export function facilityEffectsAt(
  facility: Pick<Facility, 'key' | 'effects'>,
  grade: number,
  content: Pick<ContentSet, 'improvements'>,
): FacilityEffects {
  let effects = facility.effects;
  for (const row of improvementsOf(facility.key, content)) {
    if (row.grade > grade) break;
    effects = row.effects;
  }
  return effects;
}

/**
 * What `hall` gives of the effect `kind` (DL-297): the values of every Facility content defines that
 * has it, each at its grade in the Hall, joined by the effect's rule (`facilityEffectRules`), and its
 * neutral where none has it. A key of the Hall content does not define is read by no rule (rule 5).
 * A Hero on no Roster reads an empty Hall, every Facility at grade 0.
 */
export function hallEffect(hall: Readonly<Hall>, kind: FacilityEffectKind, content: Pick<ContentSet, 'facilities' | 'improvements'>): number {
  const { neutral, join } = facilityEffectRules[kind];
  let value = neutral;
  for (const facility of Object.values(content.facilities)) {
    if (!Object.hasOwn(facility.effects, kind)) continue;
    const each = facilityEffectsAt(facility, facilityGrade(hall, facility.key), content)[kind];
    if (each === undefined) continue;
    value = join === 'multiply' ? value * each : value + each;
  }
  return value;
}
