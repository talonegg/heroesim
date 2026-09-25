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
  return write(document);
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
 * The chain: `migrations[n]` turns a version-n document into version n + 1. Empty until a
 * milestone changes the schema and adds its step with the new `schemaVersion` (data-model §6).
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
 * the migration chain, then the validator against `deps.content`. The warnings (content keys the
 * content does not define, rule 5) come back beside the document; nothing is repaired.
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

  const result = validate(migrated.document, deps);
  if (!result.ok) {
    const checks = [...new Set(result.failures.map(({ check }) => check))].join(', ');
    return {
      ok: false,
      reason: {
        kind: 'invalid',
        failures: result.failures,
        message: `The save fails the validator (${checks}): ${result.failures[0]?.detail ?? ''}`,
      },
    };
  }
  return { ok: true, document: migrated.document as unknown as WorldDocument, warnings: result.warnings };
}

function isSavedDocument(value: unknown): value is SavedDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const meta: unknown = (value as Record<string, unknown>).meta;
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return false;
  return Number.isSafeInteger((meta as Record<string, unknown>).version);
}
