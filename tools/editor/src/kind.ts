// A kind of content the editor edits (DL-150 item 12): one or more lists of keyed rows, each list a
// content file, and the forms its rows are made in; and, as its extension, the uses of a row's key in
// other content (`UseKind`). The edit session (`session.ts`, DL-244) holds the pending edits, checks
// them and finishes, through the content files' adapter (`content-files.ts`), the same for every
// kind; a kind says only what its rows are. Traits are the one kind (`traits-kind.ts`); Encounters
// come when the owner asks.

import type { ContentFileName } from '@heroesim/content';
import type { ContentJson, JsonPath } from '@heroesim/content/uses';

/** A JSON object: a row. */
export type Row = Record<string, unknown>;

/** One list of a kind: its rows are the members of one content file. */
export interface KindList {
  id: string;
  title: string;
  file: ContentFileName;
}

/** A field of a row's form. `key` and `effects` are the editor's own; the rest are plain values. */
export interface FieldForm {
  name: string;
  label: string;
  type: 'text' | 'integer' | 'keys' | 'effects';
  required: boolean;
}

/** A field of an effect's form, with the values it may take where they are few. */
export interface EffectFieldForm {
  name: string;
  label: string;
  type: 'choice' | 'choices' | 'integer' | 'number' | 'stat-changes' | 'tags';
  choices?: readonly string[];
  optional?: boolean;
}

/** One kind of effect a list offers (DL-150 item 8). */
export interface EffectForm {
  kind: string;
  label: string;
  fields: readonly EffectFieldForm[];
}

/** A list's form: its fields, and the effects it offers. */
export interface ListForm {
  list: string;
  title: string;
  fields: readonly FieldForm[];
  effects: readonly EffectForm[];
}

/** One use of a row's key elsewhere in content. */
export interface Use {
  entry: string;
  file: ContentFileName;
  path: JsonPath;
  at: string;
  /** Whether it refuses the row's removal; one that does not, the editor takes out itself. */
  blocksRemoval: boolean;
}

/** A rule that reads a row of the kind, as the register names it. */
export interface Rule {
  id: string;
  title: string;
  reads: string;
}

/**
 * A place in other content where a row's key is used, as the register names it (v1.1.4-S13): whether
 * the editor adds a use there (`assign`), with the target's fields in words, takes one out
 * (`unassign`), and changes one in place (`update`, v1.1.6-S4), with the values it changes in words.
 * `null` where it does none of them.
 */
export interface UseEntry {
  id: string;
  title: string;
  lists: readonly string[];
  add: { how: string; target: Readonly<Record<string, string>> } | null;
  remove: { how: string } | null;
  update: { how: string; fields: Readonly<Record<string, string>> } | null;
}

/** The content a use's assignment or unassignment makes, and an assignment's use where it stands; or each problem where the entry refuses it. */
export type UseChange = { content: ContentJson; problems: []; added?: Use } | { content: null; problems: string[] };

export interface Kind {
  name: string;
  title: string;
  lists: readonly KindList[];
  /** The forms, their choices read from `content`. */
  forms(content: ContentJson): ListForm[];
  /** A row from a form's values, `previous` giving any not given, in its list's field order; each problem where a value is not of its field's type. */
  rowFrom(list: string, values: Readonly<Record<string, unknown>>, previous: Row | undefined): { row: Row; problems: string[] };
  /** The content with `key`'s row in `list` set to `row`, or removed where it is `null`, and what the kind keeps beside it changed with it. */
  put(content: ContentJson, list: string, key: string, row: Row | null): ContentJson;
  /** Every use of `key` in `content`. */
  uses(content: ContentJson, key: string): Use[];
  /** The rules that read the row `row` of `list`. */
  rules(list: string, row: Row): Rule[];
  /** A row's words for a search and a table: its effects, say. */
  words(list: string, row: Row): string[];
}

/**
 * A kind's extension for the uses of a row's key in other content (DL-150 item 13, DL-186 item 14):
 * the places the register names, and a use added, taken out or changed in place there.
 */
export interface UseKind {
  /** The places in other content where a key is used, and whether a use is added and removed there. */
  useEntries(): UseEntry[];
  /** The content with a use of `key` added in `entry`, at `target` (the fields its entry names). */
  assign(content: ContentJson, key: string, entry: string, target: Readonly<Record<string, unknown>>): UseChange;
  /** The content with the use of `key` in `entry` at `at` (a `Use`'s `at`) taken out. */
  unassign(content: ContentJson, key: string, entry: string, at: string): UseChange;
  /** The content with the use of `key` in `entry` at `at` changed in place, to `values` (the values its entry names). */
  update(content: ContentJson, key: string, entry: string, at: string, values: Readonly<Record<string, unknown>>): UseChange;
}
