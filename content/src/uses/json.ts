// The content as JSON, for the register of a Trait's uses (v1.1.4-S12): each source's value as it was
// read, before the parser shapes it, so that a use is found, added and removed where it is written,
// in the file and at the path an author sees. A folder's value is its rows' by key (DL-260), so a
// path into it starts with the row's key, which names the row's file.

import { placeOf, type ContentSource } from '../parse.js';

/** A content set as JSON: each source's value by its name. A source left out holds no use. */
export type ContentJson = Readonly<Partial<Record<ContentSource, unknown>>>;

/** The sources a change writes, each with its whole new value. */
export type ContentChange = Partial<Record<ContentSource, unknown>>;

/** Where a value stands in a source: its keys and indices from the source's top, a folder's row's key first. */
export type JsonPath = readonly (string | number)[];

/** A JSON object. */
export type JsonObject = Record<string, unknown>;

/** A change the register will not make, saying why. */
export class UseRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UseRefusal';
  }
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The object's own entries, or none for a value that is no object. */
export function entriesOf(value: unknown): [string, unknown][] {
  return isObject(value) ? Object.entries(value) : [];
}

/** The value at `path` below `value`, or `undefined`. */
export function at(value: unknown, path: JsonPath): unknown {
  let here = value;
  for (const step of path) {
    if (typeof step === 'number') here = Array.isArray(here) ? here[step] : undefined;
    else here = isObject(here) && Object.hasOwn(here, step) ? here[step] : undefined;
    if (here === undefined) return undefined;
  }
  return here;
}

/** A path in words, as a content refusal names a place in a source: `deep-cut.leavesTrait`. */
export function pathText(path: JsonPath): string {
  return path.join('.');
}

/** A file's value, copied to be changed; refused when the content has no such file. */
export function copyOf(content: ContentJson, file: ContentSource): unknown {
  const value = content[file];
  if (value === undefined) throw new UseRefusal(`${file} is not in the content`);
  return structuredClone(value);
}

/** The object at `path` of `root` (a copy being changed), refused when there is none. */
export function objectAt(root: unknown, path: JsonPath, file: ContentSource): JsonObject {
  const value = at(root, path);
  if (!isObject(value)) throw new UseRefusal(`${placeOf(file, path)} is not there`);
  return value;
}

/** The list at `path` of `root` (a copy being changed), refused when there is none. */
export function listAt(root: unknown, path: JsonPath, file: ContentSource): unknown[] {
  const value = at(root, path);
  if (!Array.isArray(value)) throw new UseRefusal(`${placeOf(file, path)} is not a list`);
  return value;
}

/** Sets the value at `path` of `root` (a copy being changed); the place's parent must be there. */
export function setAt(root: unknown, path: JsonPath, value: unknown, file: ContentSource): void {
  const parent = at(root, path.slice(0, -1));
  const last = path.at(-1);
  if (typeof last === 'number' && Array.isArray(parent)) parent[last] = value;
  else if (typeof last === 'string' && isObject(parent)) parent[last] = value;
  else throw new UseRefusal(`${placeOf(file, path)} is not there`);
}

/** Removes the member or item at `path` of `root` (a copy being changed); the place must be there. */
export function removeAt(root: unknown, path: JsonPath, file: ContentSource): void {
  const parent = at(root, path.slice(0, -1));
  const last = path.at(-1);
  if (typeof last === 'number' && Array.isArray(parent) && last < parent.length) parent.splice(last, 1);
  else if (typeof last === 'string' && isObject(parent) && Object.hasOwn(parent, last)) delete parent[last];
  else throw new UseRefusal(`${placeOf(file, path)} is not there`);
}

/** Every path below `value`, `path` its own, at which `test` holds of the value, outermost first. */
export function pathsWhere(value: unknown, test: (value: unknown) => boolean, path: JsonPath = []): JsonPath[] {
  const found: JsonPath[] = test(value) ? [path] : [];
  if (Array.isArray(value)) value.forEach((each, index) => found.push(...pathsWhere(each, test, [...path, index])));
  else if (isObject(value)) for (const [key, each] of Object.entries(value)) found.push(...pathsWhere(each, test, [...path, key]));
  return found;
}
