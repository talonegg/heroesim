// How a content kind is read (DL-243): a small vocabulary of fields, from which each kind's module
// describes its rows, and the reader every kind's fields read through. Pure, so a browser can read
// content with it (the page's script carries this and the kinds' shapes, never their rules).
//
// A field reads its value from a row, recording a problem where it is missing or of the wrong type
// and giving a stand-in, so that reading goes on and every problem is reported at once. A row's
// fields are read in the order its kind writes them, and a field no kind reads is refused.

import { isFolder, rowFile, type ContentSource } from '../files.js';

/** A field's value read from a row, and the fields of the objects it holds, by which a tool finds every field's name. */
export interface Field<Value> {
  read(row: RowReader, field: string): Value;
  /** The fields of the objects this field holds: an object's, a list's items', or each kind's of a union. */
  readonly holds: readonly Readonly<Record<string, Field<unknown>>>[];
}

/** Each field of a row of type `Row`, by its name, in the order the row is written; an optional field's reader may give `undefined`. */
export type Fields<Row> = { [Name in keyof Row]-?: Pick<Row, Name> extends Required<Pick<Row, Name>> ? Field<Row[Name]> : Field<Row[Name] | undefined> };

/** A field with nothing inside it: a string, a number, a list of strings. */
function plain<Value>(read: (row: RowReader, field: string) => Value): Field<Value> {
  return { read, holds: [] };
}

export const text = plain((row, field) => row.string(field));
/** A finite number, whole or not. */
export const number = plain((row, field) => row.number(field));
export const integer = plain((row, field) => row.integer(field));
export const boolean = plain((row, field) => row.boolean(field));
export const strings = plain((row, field) => row.strings(field));
/** An object of numbers by key, such as a Class's growth. */
export const numbers = plain((row, field) => row.numbers(field));
/** A list of finite numbers, such as a picture's `apparentAge`. */
export const numberList = plain((row, field) => row.numberList(field));
/** A whole number, or `null`: present either way. */
export const integerOrNull = plain((row, field) => row.integerOrNull(field));
/** A string, or `null`: present either way. */
export const textOrNull = plain((row, field) => row.stringOrNull(field));
/** A string, or no such field: refused, when it is there, as "a string, or no such field". */
export const optionalText = plain((row, field) => row.optionalString(field));

/** A value of any type, as it stands: a Query, a pass formula, held by the kind's rules. */
export function anything<Value>(): Field<Value> {
  return plain((row, field) => row.value(field) as Value);
}

/** A list of anything, `expected` saying what it is a list of; each item is the kind's rules'. */
export function listOf<Value>(expected: string): Field<Value[]> {
  return plain((row, field) => row.list(field, expected) as Value[]);
}

/** One of `choices`, keyed by the engine's union so that the compiler refuses a list that misses or invents a member. */
export function oneOf<Choice extends string>(choices: Readonly<Record<Choice, true>>): Field<Choice> {
  return plain((row, field) => row.oneOf(field, choices));
}

/** A list of strings, each one of `choices`, such as a Quest template's Encounter kinds. */
export function oneOfEach<Choice extends string>(choices: Readonly<Record<Choice, true>>): Field<Choice[]> {
  return plain((row, field) => row.oneOfEach(field, choices));
}

/** The engine's list of a union's members as the choices of a field (DL-186 item 6: content repeats none). */
export function choicesOf<Choice extends string>(list: readonly Choice[]): Record<Choice, true> {
  return Object.fromEntries(list.map((choice) => [choice, true])) as Record<Choice, true>;
}

/** `field`, or `undefined` when the row has none: an optional field, left out of the row it is read into. */
export function optional<Value>(field: Field<Value>): Field<Value | undefined> {
  return { read: (row, name) => row.optional(name, (each) => field.read(row, each)), holds: field.holds };
}

/** `field`, or `value()` when the row has none: an optional field with a default. */
export function withDefault<Value>(field: Field<Value>, value: () => Value): Field<Value> {
  return { read: (row, name) => row.optional(name, (each) => field.read(row, each)) ?? value(), holds: field.holds };
}

/** The value of each of `fields` read from `row`, in their order, leaving out each optional field the row has none of. */
export function readFields<Row>(row: RowReader, fields: Fields<Row>): Row {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields) as [string, Field<unknown>][]) {
    const value = field.read(row, name);
    if (value !== undefined) values[name] = value;
  }
  return values as Row;
}

/** An object of `fields` and no other, `what` naming it in a refusal of a field it does not have. */
export function object<Row>(fields: Fields<Row>, what: string): Field<Row> {
  return {
    read(row, name) {
      const child = row.child(name);
      const value = readFields(child, fields);
      child.refuseUnknown(what);
      return value;
    },
    holds: [fields],
  };
}

/** How a row of one of several kinds is read: its fields by `kind`, and what a refusal calls a row of each. */
export interface Union<Kind extends string, Row> {
  /** The field that says which kind a row is, read first. */
  by: 'kind';
  /** Each kind's fields after its `kind`. */
  kinds: { [Each in Kind]: Fields<Omit<Extract<Row, { kind: Each }>, 'kind'>> };
  /** What a refusal of a field a row does not have calls it. */
  what: (kind: Kind) => string;
}

/** A row read as one of `union`'s kinds: `kind`, then that kind's fields and no other. */
export function readUnion<Kind extends string, Row>(row: RowReader, union: Union<Kind, Row>): Row {
  const kind = row.oneOf(union.by, choicesOf(Object.keys(union.kinds) as Kind[]));
  const value = { kind, ...readFields(row, union.kinds[kind] as unknown as Fields<Record<string, unknown>>) } as Row;
  row.refuseUnknown(union.what(kind));
  return value;
}

/** The fields each kind of `union` holds. */
function unionHolds(union: Union<string, unknown>): Readonly<Record<string, Field<unknown>>>[] {
  return Object.values(union.kinds) as Readonly<Record<string, Field<unknown>>>[];
}

/** An object of one of `union`'s kinds. */
export function oneOfKinds<Kind extends string, Row>(union: Union<Kind, Row>): Field<Row> {
  return { read: (row, name) => readUnion(row.child(name), union), holds: unionHolds(union as unknown as Union<string, unknown>) };
}

/** A list of objects, each read by `shape`. */
export function listOfRows<Row>(shape: RowShape<Row>): Field<Row[]> {
  return { read: (row, name) => row.children(name).map((child) => shape.read(child)), holds: shape.holds };
}

/** An object of values by any key, each read by `field`: the sentences by age band, the Callings by key. */
export function byKey<Value>(field: Field<Value>): Field<Record<string, Value>> {
  return {
    read(row, name) {
      const child = row.child(name);
      return Object.fromEntries(child.keys().map((key) => [key, field.read(child, key)]));
    },
    holds: field.holds,
  };
}

/** An object of rows by any key, each an object read by `shape`; an item that is no object is a problem of its own. */
export function rowsByKey<Row>(shape: RowShape<Row>): Field<Record<string, Row>> {
  return {
    read: (row, name) => Object.fromEntries(row.keyed(name, (child) => shape.read(child))),
    holds: shape.holds,
  };
}

/** How a row is read whole: its fields and the refusal of any other, or a union of kinds. */
export interface RowShape<Row> {
  read(row: RowReader): Row;
  readonly holds: readonly Readonly<Record<string, Field<unknown>>>[];
}

/** A row of `fields` and no other, `what` naming it in a refusal of a field it does not have. */
export function rowOf<Row>(fields: Fields<Row>, what: string): RowShape<Row> {
  return {
    read(row) {
      const value = readFields(row, fields);
      row.refuseUnknown(what);
      return value;
    },
    holds: [fields],
  };
}

/** A row of one of `union`'s kinds. */
export function rowOfKinds<Kind extends string, Row>(union: Union<Kind, Row>): RowShape<Row> {
  return { read: (row) => readUnion(row, union), holds: unionHolds(union as unknown as Union<string, unknown>) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * How a kind's content is read into its place in the content set (DL-243): its `source`, one file or
 * a folder of one file a row (DL-260), the key of the set it fills, and its value; `empty` when its
 * source is missing or not of its shape, so that the rest are read and every problem reported. A
 * folder's rows come to `read` as one object by key, as a file's would.
 */
export interface KindReader<Key extends string, Value> {
  key: Key;
  source: ContentSource;
  read(json: unknown, problems: string[]): Value;
  /** The fields of the objects it holds, for a tool that reads every field's name. */
  readonly holds: readonly Readonly<Record<string, Field<unknown>>>[];
}

/**
 * A table of rows keyed by content key, each read by `fields` and refusing any other, `what` naming a
 * row, or by `shape`; its key taken from where it is stored: its member's name in a file, or its
 * file's name in a folder, where a refusal names the row's file (DL-260).
 */
export function table<Key extends string, Row extends { key: string }>(
  key: Key,
  source: ContentSource,
  fields: Fields<Omit<Row, 'key'>>,
  what: string,
): KindReader<Key, Record<string, Row>>;
export function table<Key extends string, Row extends { key: string }>(
  key: Key,
  source: ContentSource,
  shape: RowShape<Omit<Row, 'key'>>,
): KindReader<Key, Record<string, Row>>;
export function table<Key extends string, Row extends { key: string }>(
  key: Key,
  source: ContentSource,
  given: Fields<Omit<Row, 'key'>> | RowShape<Omit<Row, 'key'>>,
  what?: string,
): KindReader<Key, Record<string, Row>> {
  const shape = what === undefined ? (given as RowShape<Omit<Row, 'key'>>) : rowOf(given as Fields<Omit<Row, 'key'>>, what);
  return {
    key,
    source,
    read(json, problems) {
      const rows: Record<string, Row> = {};
      if (json === undefined) return rows;
      if (!isObject(json)) {
        problems.push(`${source}: must be an object of rows keyed by content key`);
        return rows;
      }
      for (const [rowKey, raw] of Object.entries(json)) {
        const file = isFolder(source) ? rowFile(source, rowKey) : source;
        if (!isObject(raw)) {
          problems.push(file === source ? `${source}: ${rowKey} must be an object` : `${file}: must be an object`);
          continue;
        }
        rows[rowKey] = { key: rowKey, ...shape.read(new RowReader(file, file === source ? [rowKey] : [], raw, problems)) } as Row;
      }
      return rows;
    },
    holds: shape.holds,
  };
}

/**
 * A file that is one object, read by `fields` and refusing any other, `what` naming it; `empty()` its
 * value when the file is missing or no object, which `notAnObject` says.
 */
export function single<Key extends string, Value>(
  key: Key,
  file: `${string}.json`,
  fields: Fields<Value>,
  what: string,
  notAnObject: string,
  empty: () => Value,
): KindReader<Key, Value> {
  return {
    key,
    source: file,
    read(json, problems) {
      if (json === undefined) return empty();
      if (!isObject(json)) {
        problems.push(`${file}: ${notAnObject}`);
        return empty();
      }
      const top = new RowReader(file, [], json, problems);
      const value = readFields(top, fields);
      top.refuseUnknown(what);
      return value;
    },
    holds: [fields],
  };
}

/**
 * Reads a row's fields, recording a problem for each that is missing or of the wrong type and
 * returning a stand-in so reading can go on and every problem be reported at once.
 */
export class RowReader {
  private readonly read = new Set<string>();

  constructor(
    /** The file read, as a refusal names it: `stats.json`, `items/short-sword.json`. */
    private readonly file: string,
    private readonly prefix: readonly string[],
    private readonly raw: Record<string, unknown>,
    /** Where the problems found are recorded. */
    private readonly problems: string[],
  ) {}

  /** `field`'s value as it stands, of any type, then counted as read: for a value checked elsewhere. */
  value(field: string): unknown {
    return this.field(field);
  }

  string(field: string): string {
    const value = this.field(field);
    if (typeof value === 'string') return value;
    this.wrong(field, value, 'a string');
    return '';
  }

  /** A finite number, whole or not. */
  number(field: string): number {
    const value = this.field(field);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    this.wrong(field, value, 'a number');
    return 0;
  }

  integer(field: string): number {
    const value = this.field(field);
    if (Number.isInteger(value)) return value as number;
    this.wrong(field, value, 'a whole number');
    return 0;
  }

  oneOf<Choice extends string>(field: string, choices: Readonly<Record<Choice, true>>): Choice {
    const value = this.field(field);
    if (typeof value === 'string' && Object.hasOwn(choices, value)) return value as Choice;
    const listed = Object.keys(choices);
    this.wrong(field, value, listed.length === 0 ? 'none: there is nothing to choose from' : `one of ${listed.join(', ')}`);
    return Object.keys(choices)[0] as Choice;
  }

  strings(field: string): string[] {
    const value = this.field(field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    this.wrong(field, value, 'a list of strings');
    return [];
  }

  boolean(field: string): boolean {
    const value = this.field(field);
    if (typeof value === 'boolean') return value;
    this.wrong(field, value, 'true or false');
    return false;
  }

  /** A whole number, or `null`: present either way. */
  integerOrNull(field: string): number | null {
    const value = this.field(field);
    if (value === null || Number.isInteger(value)) return value as number | null;
    this.wrong(field, value, 'a whole number or null');
    return null;
  }

  /** Record a problem, saying `why`, when the row has `field`, which it must not. */
  forbid(field: string, why: string): void {
    if (this.field(field) !== undefined) this.problems.push(`${this.path(field)} ${why}`);
  }

  /** A string, or `null`: present either way. */
  stringOrNull(field: string): string | null {
    const value = this.field(field);
    if (value === null || typeof value === 'string') return value;
    this.wrong(field, value, 'a string or null');
    return null;
  }

  /** `read`'s value of `field`, or `undefined` when the field is absent: an optional field of any type. */
  optional<Value>(field: string, read: (field: string) => Value): Value | undefined {
    if (this.raw[field] === undefined) {
      this.read.add(field);
      return undefined;
    }
    return read(field);
  }

  /** A string, or `undefined` when the field is absent. */
  optionalString(field: string): string | undefined {
    const value = this.field(field);
    if (value === undefined || typeof value === 'string') return value;
    this.wrong(field, value, 'a string, or no such field');
    return undefined;
  }

  /** A list of strings, each one of `choices`, such as a Quest template's Encounter kinds. */
  oneOfEach<Choice extends string>(field: string, choices: Readonly<Record<Choice, true>>): Choice[] {
    const value = this.field(field);
    const isChoice = (item: unknown): item is Choice => typeof item === 'string' && Object.hasOwn(choices, item);
    if (Array.isArray(value) && value.every(isChoice)) return [...value];
    this.wrong(field, value, `a list, each one of ${Object.keys(choices).join(', ')}`);
    return [];
  }

  /** A list of finite numbers, such as a picture's `apparentAge`; how many, and which, is the rules'. */
  numberList(field: string): number[] {
    const value = this.field(field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))) return [...value];
    this.wrong(field, value, 'a list of numbers');
    return [];
  }

  /** A list of anything, `expected` saying what it is a list of, such as a Synergy's conditions; each item is the rules'. */
  list(field: string, expected: string): unknown[] {
    const value = this.field(field);
    if (Array.isArray(value)) return value;
    this.wrong(field, value, expected);
    return [];
  }

  numbers(field: string): Record<string, number> {
    const value = this.field(field);
    if (isObject(value) && Object.values(value).every((item) => typeof item === 'number')) {
      return value as Record<string, number>;
    }
    this.wrong(field, value, 'an object of numbers');
    return {};
  }

  object(field: string): Record<string, unknown> {
    const value = this.field(field);
    if (isObject(value)) return value;
    this.wrong(field, value, 'an object');
    return {};
  }

  /** A reader for the object in `field`, reporting its problems under this row's path. */
  child(field: string): RowReader {
    return new RowReader(this.file, [...this.prefix, field], this.object(field), this.problems);
  }

  /**
   * A reader for each object in the list in `field`, reporting its problems under this row's path
   * and the item's place in the list; an item that is not an object is a problem of its own.
   */
  children(field: string): RowReader[] {
    const value = this.field(field);
    if (!Array.isArray(value)) {
      this.wrong(field, value, 'a list of objects');
      return [];
    }
    const readers: RowReader[] = [];
    value.forEach((item: unknown, index) => {
      const where = [...this.prefix, field, String(index)];
      if (isObject(item)) readers.push(new RowReader(this.file, where, item, this.problems));
      else this.problems.push(`${this.file}: ${where.join('.')} is ${JSON.stringify(item)}; expected an object`);
    });
    return readers;
  }

  /** `read`'s value of each object in the object in `field`, by its key, in turn; an item that is not an object is a problem of its own. */
  keyed<Value>(field: string, read: (row: RowReader) => Value): [string, Value][] {
    return Object.entries(this.object(field)).flatMap(([key, raw]): [string, Value][] => {
      const where = [...this.prefix, field, key];
      if (isObject(raw)) return [[key, read(new RowReader(this.file, where, raw, this.problems))]];
      this.problems.push(`${this.file}: ${where.join('.')} must be an object`);
      return [];
    });
  }

  /** Every field of the row, each then counted as read: for an object keyed by content, such as age bands. */
  keys(): string[] {
    const keys = Object.keys(this.raw);
    for (const key of keys) this.read.add(key);
    return keys;
  }

  /** Record a problem for every field of the row that nothing read. */
  refuseUnknown(what: string): void {
    for (const field of Object.keys(this.raw)) {
      if (!this.read.has(field)) {
        this.problems.push(`${this.path(field)} is not a field of ${what}`);
      }
    }
  }

  private field(field: string): unknown {
    this.read.add(field);
    return this.raw[field];
  }

  private wrong(field: string, value: unknown, expected: string): void {
    const found = value === undefined ? 'is missing' : `is ${JSON.stringify(value)}`;
    this.problems.push(`${this.path(field)} ${found}; expected ${expected}`);
  }

  private path(field: string): string {
    return `${this.file}: ${[...this.prefix, field].join('.')}`;
  }
}
