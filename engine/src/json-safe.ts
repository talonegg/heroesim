// JSON-safe values only (data-model rule 6): no `Map`, `Set`, `Date`, class instances,
// `undefined`, `NaN` or `Infinity` anywhere in the document, so that `structuredClone` and
// `JSON.stringify` agree. Beyond the rule's list this also refuses what defeats the same
// purpose: functions, symbols and bigints (which JSON drops or cannot write), negative zero
// (which JSON writes as 0), cycles (which JSON cannot write) and array holes (which JSON writes
// as null). The validator (M1-S7) and the tests reuse it.

/** A value JSON writes and reads back unchanged. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type JsonUnsafeKind =
  | 'undefined'
  | 'nan'
  | 'infinity'
  | 'negative-zero'
  | 'bigint'
  | 'symbol'
  | 'function'
  | 'map'
  | 'set'
  | 'date'
  | 'class-instance'
  | 'array-hole'
  | 'cycle';

/** The first value found that is not JSON-safe, and where: `$.world.heroes["hero-000001"].stats`. */
export interface JsonUnsafe {
  path: string;
  kind: JsonUnsafeKind;
}

/** True when `value` holds only plain objects, arrays, strings, finite numbers, booleans and null. */
export function isJsonSafe(value: unknown): boolean {
  return findJsonUnsafe(value) === null;
}

/** The first value in `value`, depth first, that is not JSON-safe; `null` when there is none. */
export function findJsonUnsafe(value: unknown): JsonUnsafe | null {
  const path: (string | number)[] = [];
  const kind = check(value, path, new Set());
  return kind === null ? null : { path: formatPath(path), kind };
}

/** Leaves `path` pointing at the offending value when it finds one. */
function check(value: unknown, path: (string | number)[], ancestors: Set<object>): JsonUnsafeKind | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (!Number.isFinite(value)) return 'infinity';
    return Object.is(value, -0) ? 'negative-zero' : null;
  }
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'bigint') return 'bigint';
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'function') return 'function';
  if (ancestors.has(value)) return 'cycle';

  let kind: JsonUnsafeKind | null;
  ancestors.add(value);
  if (Array.isArray(value)) {
    kind = Object.getPrototypeOf(value) === Array.prototype ? checkArray(value, path, ancestors) : 'class-instance';
  } else {
    kind = checkObject(value, path, ancestors);
  }
  ancestors.delete(value);
  return kind;
}

function checkArray(array: unknown[], path: (string | number)[], ancestors: Set<object>): JsonUnsafeKind | null {
  for (let index = 0; index < array.length; index += 1) {
    path.push(index);
    const kind = index in array ? check(array[index], path, ancestors) : 'array-hole';
    if (kind !== null) return kind;
    path.pop();
  }
  return null;
}

function checkObject(object: object, path: (string | number)[], ancestors: Set<object>): JsonUnsafeKind | null {
  if (object instanceof Map) return 'map';
  if (object instanceof Set) return 'set';
  if (object instanceof Date) return 'date';
  const prototype: unknown = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) return 'class-instance';

  for (const key of Object.keys(object)) {
    path.push(key);
    const kind = check((object as Record<string, unknown>)[key], path, ancestors);
    if (kind !== null) return kind;
    path.pop();
  }
  return null;
}

/**
 * A path into the document as `findJsonUnsafe` reports it: `['world', 'heroes', 'hero-000001']`
 * is `$.world.heroes["hero-000001"]`. The validator names where it failed the same way.
 */
export function formatPath(path: readonly (string | number)[]): string {
  let text = '$';
  for (const segment of path) {
    if (typeof segment === 'number') text += `[${segment}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(segment)) text += `.${segment}`;
    else text += `[${JSON.stringify(segment)}]`;
  }
  return text;
}
