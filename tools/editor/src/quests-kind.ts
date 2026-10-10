// The Quest templates and the Encounters, the editor's second content kind (DL-257 item 8, DL-267):
// two lists, each a folder of one file a row (`quest-templates/`, `encounters/`, DL-260), keyed apart,
// edited together in one edit session, since a Beat's pool reads the Encounters and an Encounter's
// removal reads the pools. A row's key is fixed once made. An Encounter is used where a Beat's pool
// names it or a template names it as its Finale, and is not removed while it is.
//
// Each change of a part of a row (a Beat, a Tier's override, the Finale, a Check, a consequence) is
// made here on the row as it stands and held as a change of the fields it touched, which the
// content's checks then hold (`content/src/kinds/quest-templates.ts`, `encounters.ts`). The views say
// what a row plays: each Tier a template offers with its figures and the Beats it draws, and each
// Beat's pool with the Encounters it may draw (DL-262).

import { placeOf, rowFields, type ContentSource } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { beatsDrawn, degrees, inBeatPool, tierFields, tierLadder, type Encounter, type QuestBeatPool, type TierRow } from '@heroesim/engine/content';
import type { Kind, Row, Use } from './kind.js';
import { Refused } from './session.js';

/** The kind's two lists, by the command family that edits each. */
export type QuestList = 'quests' | 'encounters';

/** Each list's folder. */
export const questSources: Readonly<Record<QuestList, `${string}/`>> = { quests: 'quest-templates/', encounters: 'encounters/' };

/** Each list's row in words. */
const rowWords: Readonly<Record<QuestList, string>> = { quests: 'a Quest template', encounters: 'an Encounter' };

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The rows of `list` in `content`, by key, in key order (DL-260). */
export function rowsOf(content: ContentJson, list: QuestList): [string, Row][] {
  const rows = content[questSources[list]];
  return isObject(rows) ? Object.entries(rows).flatMap(([key, row]): [string, Row][] => (isObject(row) ? [[key, row]] : [])).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : [];
}

/** The row `key` of `list`, or `undefined`. */
export function rowIn(content: ContentJson, list: QuestList, key: string): Row | undefined {
  const rows = content[questSources[list]];
  return isObject(rows) && Object.hasOwn(rows, key) && isObject(rows[key]) ? rows[key] : undefined;
}

/** The fields of a row of `source`, in the order its kind writes them, each optional or not. */
function fieldsOf(source: ContentSource): { name: string; optional: boolean }[] {
  return rowFields(source) ?? [];
}

/** `row` with its fields in the order its kind writes them, a field its kind does not have kept after, for the content's checks to refuse. */
function ordered(row: Row, source: ContentSource): Row {
  const out: Row = {};
  for (const { name } of fieldsOf(source)) if (Object.hasOwn(row, name)) out[name] = row[name];
  for (const [name, value] of Object.entries(row)) if (!Object.hasOwn(out, name)) out[name] = value;
  return out;
}

/** `row` with `values` given: each set, but `null` on a field a row may leave out, or none of its kind's, which takes it out. */
function withValues(row: Row, values: Readonly<Record<string, unknown>>, optional: (name: string) => boolean): Row {
  const out: Row = { ...row };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null && optional(name)) delete out[name];
    else out[name] = value;
  }
  return out;
}

export const questsKind: Kind = {
  name: 'quests',
  title: 'Quest templates and Encounters',
  lists: [
    { id: 'quests', title: 'Quest templates', file: questSources.quests },
    { id: 'encounters', title: 'Encounters', file: questSources.encounters, command: 'encounters' },
  ],
  keysApart: true,

  // The page has no form for them: they are the commands' alone (DL-267).
  forms: () => [],

  rowFrom(list, values, previous) {
    const source = questSources[list as QuestList];
    const fields = fieldsOf(source);
    const optional = (name: string): boolean => fields.find((field) => field.name === name)?.optional ?? true;
    return { row: ordered(withValues(previous ?? {}, values, optional), source), problems: [] };
  },

  put(content, list, key, row) {
    const source = questSources[list as QuestList];
    const rows: Record<string, unknown> = { ...(isObject(content[source]) ? content[source] : {}) };
    if (row === null) delete rows[key];
    else rows[key] = row;
    return { ...content, [source]: rows };
  },

  uses(content, key, list) {
    return list === 'quests' ? [] : encounterUses(content, key);
  },

  rules: () => [],
  words: () => [],
};

/** Where `key`, an Encounter, is named: in a Beat's pool, or as a template's Finale. Each refuses its removal. */
export function encounterUses(content: ContentJson, key: string): Use[] {
  const source = questSources.quests;
  const use = (path: (string | number)[]): Use => ({ entry: path[1] === 'finale' ? 'finale' : 'beat-pool', file: source, path, at: placeOf(source, path), blocksRemoval: true });
  return rowsOf(content, 'quests').flatMap(([template, row]) => [
    ...beatsOf(row).flatMap((beat, index) => (beat.pool.encounters ?? []).flatMap((named, at) => (named === key ? [use([template, 'beats', index, 'pool', 'encounters', at])] : []))),
    ...(row.finale === key ? [use([template, 'finale'])] : []),
  ]);
}

// ── What a row plays ────────────────────────────────────────────────────────────────────────────

interface Beat {
  line: string;
  pool: QuestBeatPool;
}

/** A template's Beats, each as far as it is a Beat: a line and a pool. */
export function beatsOf(row: Row): Beat[] {
  const beats = Array.isArray(row.beats) ? row.beats : [];
  return beats.map((beat) => {
    const each = isObject(beat) ? beat : {};
    return { line: typeof each.line === 'string' ? each.line : '', pool: isObject(each.pool) ? (each.pool as QuestBeatPool) : {} };
  });
}

/** Every template's Finale. */
export function finalesOf(content: ContentJson): Set<string> {
  return new Set(rowsOf(content, 'quests').flatMap(([, row]) => (typeof row.finale === 'string' ? [row.finale] : [])));
}

/** The Encounters `pool` may draw, by key, in key order: each it names or matches, never a Finale (`inBeatPool`, DL-262). */
export function poolDraws(content: ContentJson, pool: QuestBeatPool, finales: ReadonlySet<string> = finalesOf(content)): string[] {
  return rowsOf(content, 'encounters').flatMap(([key, row]) => {
    const encounter = { key, kind: row.kind, tags: Array.isArray(row.tags) ? row.tags : [] } as Pick<Encounter, 'key' | 'kind' | 'tags'>;
    return !finales.has(key) && inBeatPool(encounter, pool) ? [key] : [];
  });
}

/** A Tier a template offers, as it plays it: its figures, the ladder's with the template's overrides, those it overrides, and the Beats it draws before its Finale. */
export interface TierView {
  tier: number;
  figures: TierRow;
  overridden: string[];
  beats: number[];
  finale: string | null;
}

/** The Tiers `row` offers, held on the ladder (DL-262), each as it plays. */
export function tiersOf(row: Row): TierView[] {
  const min = typeof row.tierMin === 'number' ? Math.max(1, row.tierMin) : 1;
  const max = typeof row.tierMax === 'number' ? Math.min(row.tierMax, tierLadder.length) : 0;
  const overrides = isObject(row.overrides) ? row.overrides : {};
  const finale = typeof row.finale === 'string' ? row.finale : null;
  const count = beatsOf(row).length;
  const tiers: TierView[] = [];
  for (let tier = min; tier <= max; tier += 1) {
    const override = isObject(overrides[String(tier)]) ? (overrides[String(tier)] as Row) : {};
    const figures = { ...(tierLadder[tier - 1] as TierRow), ...override } as TierRow;
    const drawn = beatsDrawn(count, finale !== null, typeof figures.beats === 'number' ? figures.beats : 0);
    tiers.push({ tier, figures, overridden: tierFields.filter((field) => Object.hasOwn(override, field)), beats: Array.from({ length: drawn }, (_, index) => index), finale });
  }
  return tiers;
}

/**
 * How many of `row`'s Beats, from the first, some Tier it offers plays (`tiersOf`): a Tier of k Beats
 * plays the first k - 1 and the Finale, or the first k (DL-262 item 3), so a Beat past these draws
 * no Encounter into any Quest.
 */
export function playedBeats(row: Row): number {
  return Math.max(0, ...tiersOf(row).map((tier) => tier.beats.length));
}

// ── A part of a row changed ─────────────────────────────────────────────────────────────────────

/** `given` as an index into a list of `size`, from 0; up to `size` itself where `end` is allowed; refused, naming the list's indices, where it is not one. */
function indexIn(given: number | undefined, size: number, where: string, what: string, end = false): number {
  const last = end ? size : size - 1;
  if (given !== undefined && Number.isSafeInteger(given) && given >= 0 && given <= last) return given;
  const range = last < 0 ? 'it has none' : last === 0 ? `${where}.0 alone` : `${where}.0 to ${where}.${last}`;
  throw new Refused([`${where}.${String(given)} is not ${what}: ${range}`]);
}

/** A Beat's fields in order, its line then its pool. */
function beatRow(beat: Row): Row {
  const { line, pool, ...rest } = beat;
  return { ...(line === undefined ? {} : { line }), ...(pool === undefined ? {} : { pool }), ...rest };
}

/** The Beats of `row` as written, each a JSON object. */
function writtenBeats(row: Row): Row[] {
  return (Array.isArray(row.beats) ? row.beats : []).map((beat) => (isObject(beat) ? beat : {}));
}

/** A template's Beats with one added at `at`, its end by default: `{ beats }`. */
export function beatAdded(row: Row, at: number | undefined, beat: Readonly<Record<string, unknown>>): Row {
  const beats = writtenBeats(row);
  const place = at === undefined ? beats.length : indexIn(at, beats.length, 'beats', 'a place for a Beat', true);
  return { beats: [...beats.slice(0, place), beatRow({ ...beat }), ...beats.slice(place)] };
}

/** A template's Beats with the one at `at` given `values`, `null` taking a field out: `{ beats }`. */
export function beatChanged(row: Row, at: number | undefined, values: Readonly<Record<string, unknown>>): Row {
  const beats = writtenBeats(row);
  const index = indexIn(at, beats.length, 'beats', 'a Beat of it');
  return { beats: beats.map((beat, each) => (each === index ? beatRow(withValues(beat, values, () => true)) : beat)) };
}

/** A template's Beats with the one at `from` moved to `to`: `{ beats }`. */
export function beatMoved(row: Row, from: number | undefined, to: number | undefined): Row {
  const beats = writtenBeats(row);
  const index = indexIn(from, beats.length, 'beats', 'a Beat of it');
  const place = indexIn(to, beats.length, 'beats', 'a place for a Beat among its Beats');
  const moved = beats.filter((_, each) => each !== index);
  moved.splice(place, 0, beats[index] as Row);
  return { beats: moved };
}

/** A template's Beats without the one at `at`: `{ beats }`. */
export function beatRemoved(row: Row, at: number | undefined): Row {
  const beats = writtenBeats(row);
  const index = indexIn(at, beats.length, 'beats', 'a Beat of it');
  return { beats: beats.filter((_, each) => each !== index) };
}

/** A Tier's override, refused where `tier` is no whole number, or a figure none of a Tier's. */
function figuresChecked(tier: number | undefined, names: readonly string[]): number {
  if (tier === undefined || !Number.isSafeInteger(tier)) throw new Refused([`Tier ${String(tier)} is not a Tier: a whole number, 1 to ${tierLadder.length}`]);
  for (const name of names) if (!(tierFields as readonly string[]).includes(name)) throw new Refused([`"${name}" is not a figure of a Tier: ${tierFields.join(', ')}`]);
  return tier;
}

/** The overrides with each Tier's in Tier order and its figures in the ladder's order, or `null` where none is left: `{ overrides }`. */
function overridesRow(overrides: Readonly<Record<string, Row>>): Row {
  const tiers = Object.keys(overrides).sort((a, b) => Number(a) - Number(b));
  if (tiers.length === 0) return { overrides: null };
  return {
    overrides: Object.fromEntries(
      tiers.map((tier) => {
        const figures = overrides[tier] ?? {};
        const known = tierFields.filter((field) => Object.hasOwn(figures, field)).map((field) => [field, figures[field]]);
        return [tier, Object.fromEntries([...known, ...Object.entries(figures).filter(([name]) => !(tierFields as readonly string[]).includes(name))])];
      }),
    ),
  };
}

function overridesOf(row: Row): Record<string, Row> {
  return Object.fromEntries(Object.entries(isObject(row.overrides) ? row.overrides : {}).map(([tier, figures]) => [tier, isObject(figures) ? { ...figures } : {}]));
}

/** A template's overrides with `figures` set for `tier`, each of a Tier's: `{ overrides }`. */
export function overrideSet(row: Row, tier: number | undefined, figures: Readonly<Record<string, unknown>>): Row {
  const names = Object.keys(figures);
  if (names.length === 0) throw new Refused(['an override sets one figure of a Tier at least: <figure>=<value>']);
  const at = String(figuresChecked(tier, names));
  const overrides = overridesOf(row);
  overrides[at] = { ...overrides[at], ...figures };
  return overridesRow(overrides);
}

/** A template's overrides with `names` cleared for `tier`, or its whole override where none is named: `{ overrides }`. */
export function overrideCleared(row: Row, tier: number | undefined, names: readonly string[]): Row {
  const at = String(figuresChecked(tier, names));
  const overrides = overridesOf(row);
  const override = overrides[at];
  if (override === undefined) throw new Refused([`Tier ${at} has no override: ${Object.keys(overrides).length === 0 ? 'it overrides no Tier' : `it overrides Tiers ${Object.keys(overrides).join(', ')}`}`]);
  for (const name of names) if (!Object.hasOwn(override, name)) throw new Refused([`Tier ${at} does not override ${name}: it overrides ${Object.keys(override).join(', ')}`]);
  if (names.length === 0) delete overrides[at];
  else {
    for (const name of names) delete override[name];
    if (Object.keys(override).length === 0) delete overrides[at];
  }
  return overridesRow(overrides);
}

/** A template's Finale and its line, set together: `{ finale, finaleLine }`. */
export function finaleSet(encounter: string | undefined, line: string | undefined): Row {
  if (encounter === undefined || encounter === '') throw new Refused(['a Finale is an Encounter: name it']);
  if (line === undefined) throw new Refused(['a Finale has its line, given with it: line=<text>']);
  return { finale: encounter, finaleLine: line };
}

/** A template without its Finale and its line: `{ finale: null, finaleLine: null }`; refused where it has none. */
export function finaleCleared(row: Row): Row {
  if (row.finale === undefined) throw new Refused(['it has no Finale to clear']);
  return { finale: null, finaleLine: null };
}

/** An Encounter's Checks as written. */
function writtenChecks(row: Row): Row[] {
  return (Array.isArray(row.checks) ? row.checks : []).map((check) => (isObject(check) ? check : {}));
}

/** The index of the Check `key` of `row`; refused, naming its Checks, where it has none of that key. */
function checkAt(row: Row, key: string | undefined): number {
  const checks = writtenChecks(row);
  const index = checks.findIndex((check) => check.key === key);
  if (index < 0) throw new Refused([`"${String(key)}" is not a Check of it: its Checks are ${checks.map((check) => String(check.key)).join(', ') || 'none'}`]);
  return index;
}

/** The pass formula given with a change of the Checks: set, taken out where `null`, untouched where not given. */
function withPass(change: Row, pass: unknown): Row {
  return pass === undefined ? change : { ...change, pass };
}

/** An Encounter's Checks with `check` added, its key new among them: `{ checks, pass? }`. */
export function checkAdded(row: Row, check: Readonly<Record<string, unknown>>, pass: unknown): Row {
  const checks = writtenChecks(row);
  if (checks.some((each) => each.key === check.key)) throw new Refused([`"${String(check.key)}" is a Check of it already`]);
  return withPass({ checks: [...checks, { ...check }] }, pass);
}

/** An Encounter's Checks with the Check `key` given `values`, `null` taking a field out: `{ checks, pass? }`. */
export function checkChanged(row: Row, key: string | undefined, values: Readonly<Record<string, unknown>>, pass: unknown): Row {
  const index = checkAt(row, key);
  return withPass({ checks: writtenChecks(row).map((check, each) => (each === index ? withValues(check, values, () => true) : check)) }, pass);
}

/** An Encounter's Checks without the Check `key`: `{ checks, pass? }`. */
export function checkRemoved(row: Row, key: string | undefined, pass: unknown): Row {
  const index = checkAt(row, key);
  return withPass({ checks: writtenChecks(row).filter((_, each) => each !== index) }, pass);
}

/** An Encounter's consequences, each Degree's list as written. */
function writtenConsequences(row: Row): Record<string, Row[]> {
  const given = isObject(row.consequences) ? row.consequences : {};
  return Object.fromEntries(Object.entries(given).map(([degree, list]) => [degree, (Array.isArray(list) ? list : []).map((each) => (isObject(each) ? each : {}))]));
}

/** `degree`, refused where it is none of the Degrees. */
function degreeOf(degree: string | undefined): string {
  if (degree === undefined || !(degrees as readonly string[]).includes(degree)) throw new Refused([`"${String(degree)}" is not a Degree: ${degrees.join(', ')}`]);
  return degree;
}

/** An Encounter's consequences with `consequence` added to `degree`'s list at `at`, its end by default; the list made where it has none: `{ consequences }`. */
export function consequenceAdded(row: Row, degree: string | undefined, at: number | undefined, consequence: Readonly<Record<string, unknown>>): Row {
  const consequences = writtenConsequences(row);
  const named = degreeOf(degree);
  const list = consequences[named] ?? [];
  const place = at === undefined ? list.length : indexIn(at, list.length, `consequences.${named}`, `a place for a consequence`, true);
  consequences[named] = [...list.slice(0, place), { ...consequence }, ...list.slice(place)];
  return { consequences };
}

/** An Encounter's consequences with the one at `at` of `degree` given `values`, `null` taking a field out: `{ consequences }`. */
export function consequenceChanged(row: Row, degree: string | undefined, at: number | undefined, values: Readonly<Record<string, unknown>>): Row {
  const consequences = writtenConsequences(row);
  const named = degreeOf(degree);
  const list = consequences[named] ?? [];
  const index = indexIn(at, list.length, `consequences.${named}`, 'a consequence of it');
  consequences[named] = list.map((each, place) => (place === index ? withValues(each, values, () => true) : each));
  return { consequences };
}

/** An Encounter's consequences without the one at `at` of `degree`, the list kept, empty or not: `{ consequences }`. */
export function consequenceRemoved(row: Row, degree: string | undefined, at: number | undefined): Row {
  const consequences = writtenConsequences(row);
  const named = degreeOf(degree);
  const list = consequences[named] ?? [];
  const index = indexIn(at, list.length, `consequences.${named}`, 'a consequence of it');
  consequences[named] = list.filter((_, place) => place !== index);
  return { consequences };
}

/** A row's words: `a Quest template` or `an Encounter`. */
export function rowWord(list: QuestList): string {
  return rowWords[list];
}
