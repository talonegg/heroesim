// The Facilities and their grades, the editor's third content kind (DL-297): two lists, the
// Facilities in `facilities.json` and their grade rows, the Improvements, in `improvements.json`, keyed
// apart, edited together in one edit session, since a grade names its Facility and holds exactly its
// Facility's effects. A row's key is fixed once made; a grade's is its Facility's and its number
// (`quarters-2`). The order of the Facilities is every Hall's and a Rival's build order, so a Facility
// added stands last. A Facility is used where a grade names it and where a Disposition's `buildOrder`
// lists it, and is not removed while it is.
//
// The forms are derived from content's description of the effects (`facility-effects.ts`, DL-243), so
// an effect the engine adds and content describes is asked for here. The rows are checked by the
// content's checks (`content/src/kinds/facilities.ts`, `improvements.ts`) as every edit is made.

import { facilityEffects, placeOf, rowFields, type ContentSource } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { facilityEffectKinds } from '@heroesim/engine/content';
import type { EffectForm, FieldForm, Kind, ListForm, Row, Use } from './kind.js';

/** The kind's two lists, by name. */
export type FacilityList = 'facilities' | 'grades';

/** Each list's file. */
export const facilitySources: Readonly<Record<FacilityList, ContentSource>> = { facilities: 'facilities.json', grades: 'improvements.json' };

/** Each list's row in words. */
const rowWords: Readonly<Record<FacilityList, string>> = { facilities: 'a Facility', grades: 'a grade' };

export const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The rows of `list` in `content`, by key, in the file's order (a Facility's is every Hall's). */
export function rowsOf(content: ContentJson, list: FacilityList): [string, Row][] {
  const rows = content[facilitySources[list]];
  return isObject(rows) ? Object.entries(rows).flatMap(([key, row]): [string, Row][] => (isObject(row) ? [[key, row]] : [])) : [];
}

/** The row `key` of `list`, or `undefined`. */
export function rowIn(content: ContentJson, list: FacilityList, key: string): Row | undefined {
  const rows = content[facilitySources[list]];
  return isObject(rows) && Object.hasOwn(rows, key) && isObject(rows[key]) ? rows[key] : undefined;
}

/** The grade rows of the Facility `facility`, by grade, lowest first: each its key, number and row. */
export function gradesOf(content: ContentJson, facility: string): { key: string; grade: number; row: Row }[] {
  return rowsOf(content, 'grades')
    .flatMap(([key, row]) => (row.facility === facility ? [{ key, grade: typeof row.grade === 'number' ? row.grade : Number.NaN, row }] : []))
    .sort((a, b) => a.grade - b.grade);
}

/** The key of the grade row a Facility's `grade` has: `quarters-2`. */
export const gradeKey = (facility: string, grade: number): string => `${facility}-${grade}`;

/** The fields of a row of `source`, in the order its kind writes them, each optional or not. */
function fieldsOf(source: ContentSource): { name: string; optional: boolean }[] {
  return rowFields(source) ?? [];
}

/** `effects` with its kinds in the order the engine lists them, a name that is none of them kept after, for the content's checks to refuse. */
export function effectsOrdered(effects: Row): Row {
  const out: Row = {};
  for (const kind of facilityEffectKinds) if (Object.hasOwn(effects, kind)) out[kind] = effects[kind];
  for (const [name, value] of Object.entries(effects)) if (!Object.hasOwn(out, name)) out[name] = value;
  return out;
}

/** `row` with its fields in the order its kind writes them, and its effects' kinds in theirs; a field its kind does not have kept after, for the content's checks to refuse. */
function ordered(row: Row, source: ContentSource): Row {
  const out: Row = {};
  for (const { name } of fieldsOf(source)) if (Object.hasOwn(row, name)) out[name] = isObject(row[name]) && name === 'effects' ? effectsOrdered(row[name]) : row[name];
  for (const [name, value] of Object.entries(row)) if (!Object.hasOwn(out, name)) out[name] = value;
  return out;
}

/** The effects' forms, one value each, derived from content's description of the kinds. */
function effectForms(): EffectForm[] {
  return facilityEffectKinds.map((kind) => {
    const { label, type } = facilityEffects[kind];
    return { kind, label, fields: [{ name: 'value', label, type }] };
  });
}

const nameField: FieldForm = { name: 'name', label: 'Name', type: 'text', required: true };
const effectsField: FieldForm = { name: 'effects', label: 'Effects', type: 'effects', required: true };

export const facilitiesKind: Kind = {
  name: 'facilities',
  title: 'Facilities and their grades',
  lists: [
    { id: 'facilities', title: 'Facilities', file: facilitySources.facilities },
    { id: 'grades', title: 'Grades', file: facilitySources.grades },
  ],
  keysApart: true,

  // A Facility's form: its name, whether the name is plural, its upkeep in whole Silver, and each effect it has at grade 0.
  // A grade's: the Facility it raises, its number (the next free one), its cost in whole Silver, its name and a value for exactly its Facility's effects.
  forms: (content) => {
    const facilities = rowsOf(content, 'facilities').map(([key]) => key);
    const forms: ListForm[] = [
      {
        list: 'facilities',
        title: 'Facilities',
        fields: [nameField, { name: 'plural', label: 'Plural', type: 'boolean', required: true }, { name: 'upkeep', label: 'Upkeep', type: 'integer', required: true }, effectsField],
        effects: effectForms(),
      },
      {
        list: 'grades',
        title: 'Grades',
        fields: [
          { name: 'facility', label: 'Facility', type: 'text', required: true, choices: facilities },
          { name: 'grade', label: 'Grade', type: 'integer', required: true },
          { name: 'cost', label: 'Cost', type: 'integer', required: true },
          nameField,
          effectsField,
        ],
        effects: effectForms(),
      },
    ];
    return forms;
  },

  rowFrom(list, values, previous) {
    const source = facilitySources[list as FacilityList];
    const fields = fieldsOf(source);
    const optional = (name: string): boolean => fields.find((field) => field.name === name)?.optional ?? true;
    const row: Row = { ...(previous ?? {}) };
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue;
      if (value === null && optional(name)) delete row[name];
      else row[name] = value;
    }
    return { row: ordered(row, source), problems: [] };
  },

  // A grade new to the file stands after the last grade of its Facility, a Facility new to its file last.
  put(content, list, key, row) {
    const source = facilitySources[list as FacilityList];
    const rows: [string, unknown][] = Object.entries(isObject(content[source]) ? content[source] : {});
    const at = rows.findIndex(([each]) => each === key);
    let next: [string, unknown][];
    if (row === null) next = rows.filter(([each]) => each !== key);
    else if (at >= 0) next = rows.map((each, index) => (index === at ? [key, row] : each));
    else {
      const owner = list === 'grades' ? row.facility : undefined;
      const after = owner === undefined ? -1 : rows.map(([, each]) => (isObject(each) ? each.facility : undefined)).lastIndexOf(owner);
      next = after < 0 ? [...rows, [key, row]] : [...rows.slice(0, after + 1), [key, row], ...rows.slice(after + 1)];
    }
    return { ...content, [source]: Object.fromEntries(next) };
  },

  uses(content, key, list) {
    return list === 'grades' ? [] : facilityUses(content, key);
  },

  rules: () => [],
  words: () => [],
};

/** Where `key`, a Facility, is named: by a grade, and in a Disposition's `buildOrder`. Each refuses its removal. */
export function facilityUses(content: ContentJson, key: string): Use[] {
  const grade = (name: string): Use => ({ entry: 'grade', file: facilitySources.grades, path: [name, 'facility'], at: placeOf(facilitySources.grades, [name, 'facility']), blocksRemoval: true });
  const dispositions = isObject(content['dispositions.json']) ? Object.entries(content['dispositions.json']) : [];
  const order = (name: string, at: number): Use => ({
    entry: 'build-order',
    file: 'dispositions.json',
    path: [name, 'buildOrder', at],
    at: placeOf('dispositions.json', [name, 'buildOrder', at]),
    blocksRemoval: true,
  });
  return [
    ...rowsOf(content, 'grades').flatMap(([name, row]) => (row.facility === key ? [grade(name)] : [])),
    ...dispositions.flatMap(([name, row]) => (isObject(row) && Array.isArray(row.buildOrder) ? row.buildOrder.flatMap((each, at) => (each === key ? [order(name, at)] : [])) : [])),
  ];
}

/** A row's word: `a Facility` or `a grade`. */
export function rowWord(list: FacilityList): string {
  return rowWords[list];
}
