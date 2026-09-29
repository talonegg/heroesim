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
 * The chain: `migrations[n]` turns a version-n document into version n + 1. A milestone that
 * changes the schema adds its step with the new `schemaVersion` (data-model §6).
 */
export const migrations: Readonly<Record<number, Migration>> = Object.freeze({
  1: unattachedPoolFields,
  2: transferredOnTurnField,
  3: guildmasterAttributeFields,
});

/**
 * Version 1 to 2 (M2-S8, DL-27): every Hero gains `unattachedSince` and `leftPoolOnTurn`. In a
 * version-1 world only generation put a Hero in the pool, so a living, unretired Hero with no
 * Guild entered it at `enteredTurn`; no Hero had yet left it. Changes nothing it does not
 * recognise, leaving a damaged save for the validator to refuse, and never changes its input.
 */
function unattachedPoolFields(document: SavedDocument): SavedDocument {
  const { world } = document;
  if (!isObject(world) || !isObject(world.heroes)) return document;
  const heroes = Object.fromEntries(
    Object.entries(world.heroes).map(([id, hero]) => {
      if (!isObject(hero)) return [id, hero];
      const inPool = hero.guildId === null && hero.diedOnTurn === null && hero.retiredOnTurn === null;
      return [id, { ...hero, unattachedSince: inPool ? hero.enteredTurn : null, leftPoolOnTurn: null }];
    }),
  );
  return { ...document, world: { ...world, heroes } };
}

/**
 * Version 2 to 3 (DL-60): every Hero gains `transferredOnTurn`, the Turn of their last Transfer, read
 * from the History a version-2 save carries: the Turn of the last `hero.transferred` entry naming the
 * Hero in its payload, or `null` for a Hero it names in none (every Hero of a save made before M6-S2).
 * Changes nothing it does not recognise, leaving a damaged save for the validator to refuse, and
 * never changes its input.
 */
function transferredOnTurnField(document: SavedDocument): SavedDocument {
  const { world, history } = document;
  if (!isObject(world) || !isObject(world.heroes)) return document;
  const lastTransfer = new Map<unknown, unknown>();
  const entries = isObject(history) && Array.isArray(history.entries) ? (history.entries as unknown[]) : [];
  for (const entry of entries) {
    if (isObject(entry) && entry.type === 'hero.transferred' && isObject(entry.payload)) lastTransfer.set(entry.payload.heroId, entry.turn);
  }
  const heroes = Object.fromEntries(
    Object.entries(world.heroes).map(([id, hero]) => [id, isObject(hero) ? { ...hero, transferredOnTurn: lastTransfer.get(id) ?? null } : hero]),
  );
  return { ...document, world: { ...world, heroes } };
}

/**
 * Version 3 to 4 (M9-S2, DL-102): every Guildmaster gains the three descriptive Attributes, empty,
 * and `retiredOnTurn`, `null`. No Guildmaster retired in a version-3 world without their Guild
 * folding (DL-28 item 1), and a folded Guild's Guildmaster is a record no rule reads, so every one
 * is read as in office; their Traits are left as they are (DL-100 item 4). Changes nothing it does
 * not recognise, leaving a damaged save for the validator to refuse, and never changes its input.
 */
function guildmasterAttributeFields(document: SavedDocument): SavedDocument {
  const { world } = document;
  if (!isObject(world) || !isObject(world.guildmasters)) return document;
  const guildmasters = Object.fromEntries(
    Object.entries(world.guildmasters).map(([id, guildmaster]) => [
      id,
      isObject(guildmaster) ? { ...guildmaster, birthplace: '', appearance: '', biography: '', retiredOnTurn: null } : guildmaster,
    ]),
  );
  return { ...document, world: { ...world, guildmasters } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
