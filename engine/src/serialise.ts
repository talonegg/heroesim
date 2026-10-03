// Canonical serialisation, save and load (data-model rules 6 and 7, §6; ADR-0004). One format:
// JSON with every object's keys sorted and no whitespace, so the same state always gives the same
// bytes and the harness checks determinism by comparing them.
//
// A load parses the text, brings an older document forward one schema version at a time through
// the migration chain, and validates the result. Every refusal is a typed `reason`, never a throw:
// a save file is outside the engine's control. The choices the epic left open are DL-20.

import type { EngineDeps } from './config.js';
import type { WorldDocument } from './document.js';
import { findJsonUnsafe } from './json-safe.js';
import { migrateSlices } from './modules.js';
import { validate, type ValidationFailure, type ValidationWarning } from './validate.js';

// ── Save ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The document as canonical JSON: every object's keys in sorted order, at every depth; arrays in
 * their own order; no whitespace. Two documents holding the same values give the same string,
 * whatever order their keys were written in.
 *
 * Throws on a document that is not JSON-safe (rule 6), naming the first offending path: a
 * programming error, since the engine only ever makes JSON-safe documents.
 */
export function serialise(document: WorldDocument): string {
  const unsafe = findJsonUnsafe(document);
  if (unsafe !== null) {
    throw new TypeError(`Only a JSON-safe document serialises: ${unsafe.path} is ${unsafe.kind} (data-model rule 6)`);
  }
  return writeOnce(document);
}

/**
 * `write`'s text in one pass of `JSON.stringify` (v1.1.5-S1, DL-174): the replacer hands it each
 * object whose keys are not already in sorted order as a copy with them sorted, and `JSON.stringify`
 * writes everything into the one string it builds. `write` makes a string of every value at every
 * depth and copies each into its parent's, which for a 20-year game's save of 116 MB allocated 22
 * times its length; this allocates two to three times it.
 *
 * `JSON.stringify` writes an object's array-index keys (`"0"`, `"17"`) first, in ascending number,
 * whatever their place, and a copy cannot be given an own `__proto__` key by assignment. A document
 * holding either key anywhere is written by `write` instead, so the bytes are `write`'s always.
 */
function writeOnce(document: unknown): string {
  let ordered = true;
  const text = JSON.stringify(document, (_key, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object);
    let sorted = true;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] as string;
      if (isArrayIndex(key) || key === '__proto__') ordered = false;
      if (index > 0 && (keys[index - 1] as string) > key) sorted = false;
    }
    if (sorted) return object;
    const copy: Record<string, unknown> = {};
    for (const key of sortKeys(keys)) copy[key] = object[key];
    return copy;
  });
  return ordered ? text : write(document);
}

/**
 * `keys` sorted in place as `Array.prototype.sort` sorts them, by code units. A short list, as most
 * of a document's objects have, is sorted by insertion, which allocates nothing: `sort` allocates its
 * working state on every call, about 1.2 GB over a 20-year save's objects.
 */
function sortKeys(keys: string[]): string[] {
  if (keys.length > 16) return keys.sort();
  for (let index = 1; index < keys.length; index += 1) {
    const key = keys[index] as string;
    let at = index - 1;
    for (; at >= 0 && (keys[at] as string) > key; at -= 1) keys[at + 1] = keys[at] as string;
    keys[at + 1] = key;
  }
  return keys;
}

/** Whether `key` is an array index, a property key every engine enumerates before the others. */
function isArrayIndex(key: string): boolean {
  const first = key.charCodeAt(0);
  if (first < 48 || first > 57) return false;
  return (key === '0' || first !== 48) && /^[0-9]+$/.test(key) && Number(key) < 2 ** 32 - 1;
}

/**
 * Keys sort by `Array.prototype.sort`'s default order, UTF-16 code units, which every JavaScript
 * engine shares, so the bytes do not depend on where they are written.
 */
function write(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(write).join(',')}]`;
  const object = value as Record<string, unknown>;
  const members = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${write(object[key])}`);
  return `{${members.join(',')}}`;
}

// ── Migration ────────────────────────────────────────────────────────────────────────────────

/** A parsed save of any schema version: all a migration can rely on is `meta.version`. */
export interface SavedDocument {
  meta: { version: number; [field: string]: unknown };
  [section: string]: unknown;
}

/** Turns a document of one schema version into the next. Modules migrate their own slices. */
export type Migration = (document: SavedDocument) => SavedDocument;

/**
 * The chain: `migrations[n]` turns a version-n document into version n + 1. A milestone that
 * changes the schema adds its step with the new `schemaVersion` (data-model §6).
 *
 * Empty since schema 5 (v1.1.2-S3): a save of schema 4, as `v1.1.1` wrote it, is refused as
 * `unsupported-version` rather than migrated, the owner's decision (DL-125 item 10.2), and so is any
 * older one. The steps from 1 to 4 (DL-27, DL-60, DL-102) led only to schema 4, so they went with it
 * (DL-130).
 */
export const migrations: Readonly<Record<number, Migration>> = Object.freeze({});

/** Why a save does not load. `message` is prose for a front end; tests assert on the rest. */
export type LoadRefusal =
  | { kind: 'malformed-json'; message: string }
  | { kind: 'not-a-document'; message: string }
  | { kind: 'unsupported-version'; documentVersion: number; schemaVersion: number; message: string }
  | { kind: 'invalid'; failures: ValidationFailure[]; message: string };

/**
 * Brings `document` forward to `schemaVersion`, one step per version, forward only. Refuses,
 * naming both versions and running no step, when the chain has no path: a missing step, or a
 * document newer than the engine. The runner, not the step, sets `meta.version` after each step.
 */
export function migrate(
  document: SavedDocument,
  schemaVersion: number,
  chain: Readonly<Record<number, Migration>> = migrations,
): { ok: true; document: SavedDocument } | { ok: false; reason: LoadRefusal } {
  const documentVersion = document.meta.version;
  const steps: Migration[] = [];
  for (let version = documentVersion; version < schemaVersion; version += 1) {
    const step = Object.hasOwn(chain, version) ? chain[version] : undefined;
    if (step === undefined) break;
    steps.push(step);
  }
  if (documentVersion > schemaVersion || steps.length !== schemaVersion - documentVersion) {
    return {
      ok: false,
      reason: {
        kind: 'unsupported-version',
        documentVersion,
        schemaVersion,
        message:
          `The save is schema version ${documentVersion} and this engine reads version ${schemaVersion}; ` +
          'no migration leads from one to the other',
      },
    };
  }

  let migrated = document;
  steps.forEach((step, index) => {
    const next = step(migrated);
    migrated = { ...next, meta: { ...next.meta, version: documentVersion + index + 1 } };
  });
  return { ok: true, document: migrated };
}

// ── Load ─────────────────────────────────────────────────────────────────────────────────────

export type LoadResult =
  | { ok: true; document: WorldDocument; warnings: ValidationWarning[] }
  | { ok: false; reason: LoadRefusal };

/**
 * Reads a save: parses `text`, checks `meta.version` against `deps.config.schemaVersion`, runs
 * the migration chain, then each installed module's `migrateSlice` on its slice (M8-S1,
 * `migrateSlices`), then the validator against `deps.content` and `deps.modules`, which has each
 * module validate its slice. The warnings (content keys the content does not define, rule 5, and
 * slices no installed module owns) come back beside the document; nothing is repaired.
 *
 * `deps.config` here is the engine's own configuration, `defaultConfig` in a front end: one built
 * as `{ ...defaultConfig, ...meta.config }` carries the save's own `schemaVersion` and would skip
 * every migration. Front ends build that merged config for play, after the load (DL-20).
 */
export function deserialise(text: string, deps: EngineDeps): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: { kind: 'malformed-json', message: `The save is not JSON: ${why}` } };
  }
  if (!isSavedDocument(parsed)) {
    const message = 'The save has no whole-number meta.version: it is not a World State document';
    return { ok: false, reason: { kind: 'not-a-document', message } };
  }

  const migrated = migrate(parsed, deps.config.schemaVersion);
  if (!migrated.ok) return migrated;
  const sliced = migrateSlices(migrated.document, deps);
  if (!sliced.ok) return { ok: false, reason: invalid(sliced.failures) };

  const result = validate(sliced.document, deps);
  if (!result.ok) return { ok: false, reason: invalid(result.failures) };
  return { ok: true, document: sliced.document as unknown as WorldDocument, warnings: result.warnings };
}

function invalid(failures: ValidationFailure[]): LoadRefusal {
  const checks = [...new Set(failures.map(({ check }) => check))].join(', ');
  return { kind: 'invalid', failures, message: `The save fails the validator (${checks}): ${failures[0]?.detail ?? ''}` };
}

function isSavedDocument(value: unknown): value is SavedDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const meta: unknown = (value as Record<string, unknown>).meta;
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return false;
  return Number.isSafeInteger((meta as Record<string, unknown>).version);
}
