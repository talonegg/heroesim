// Save files (INPUTS 3.12, §9): where they live, and how one is read into a document and the
// `deps` to play it under. The CLI keeps nothing between invocations: every command reads the
// save it names and, if it changed the World State, writes it back.
//
// Reading is two steps, in this order (DL-20 item 11, DL-21):
//   1. `deserialise` with the engine's own `defaultConfig`, so the save's `meta.version` is
//      compared with this code's `schemaVersion` and any migration runs;
//   2. only then the play config, `{ ...defaultConfig, ...meta.config }` (data-model §2, pre-M0
//      review D3): the game plays under the rules it was started with, and a field its save
//      predates reads as the current default.
// Merging first would carry the save's own `schemaVersion` into the check and skip every
// migration.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  defaultConfig,
  deserialise,
  serialise,
  type ContentSet,
  type EngineDeps,
  type LoadRefusal,
  type Module,
  type ValidationWarning,
  type WorldDocument,
} from '@heroesim/engine';

/** The save every command uses unless `--save` names another. */
export const currentSave = 'current';

/** The directory of named saves: `HEROESIM_SAVE_DIR`, or `.saves` in the working directory. */
export function saveDir(cwd: string, env: Readonly<Record<string, string | undefined>>): string {
  const override = env['HEROESIM_SAVE_DIR'];
  return override === undefined || override === '' ? join(cwd, '.saves') : resolve(cwd, override);
}

/**
 * Where a save named on the command line lives. A bare name, with no slash and no `.json`, is
 * `<name>.json` in the save directory: `--save demo` is `.saves/demo.json`. Anything else is a
 * path, relative to the working directory.
 */
export function savePath(name: string, cwd: string, env: Readonly<Record<string, string | undefined>>): string {
  const isPath = isAbsolute(name) || /[\\/]/.test(name) || name.endsWith('.json');
  return isPath ? resolve(cwd, name) : join(saveDir(cwd, env), `${name}.json`);
}

/**
 * The deps a loaded game plays under: its own config, filled forward with the current defaults, and
 * the modules the command line installs (`--modules`, M8-S4), none unless given.
 */
export function playDeps(document: WorldDocument, content: ContentSet, modules: readonly Module[] = []): EngineDeps {
  return { config: { ...defaultConfig, ...document.meta.config }, content, ...withModules(modules) };
}

/** `{ modules }` when there are any: with none, the deps are what they were before M8. */
export function withModules(modules: readonly Module[]): Pick<EngineDeps, 'modules'> {
  return modules.length === 0 ? {} : { modules };
}

export type OpenedSave =
  | { ok: true; document: WorldDocument; warnings: ValidationWarning[]; deps: EngineDeps }
  | { ok: false; reason: LoadRefusal };

/**
 * A save's text as a document to play: loaded against the engine's own config, validated against
 * `content` and, for a module's slice, by the module among `modules` that owns it (a slice none owns
 * is warned of and kept), then given its play deps. A refusal carries the engine's typed reason.
 */
export function openSave(text: string, content: ContentSet, modules: readonly Module[] = []): OpenedSave {
  const loaded = deserialise(text, { config: defaultConfig, content, ...withModules(modules) });
  if (!loaded.ok) return loaded;
  const { document, warnings } = loaded;
  return { ok: true, document, warnings, deps: playDeps(document, content, modules) };
}

export type ReadSave = OpenedSave | { ok: false; reason: { kind: 'missing'; message: string } };

/** Reads and opens the save at `path` under `modules`; a missing file is a refusal of its own. */
export function readSave(path: string, content: ContentSet, modules: readonly Module[] = []): ReadSave {
  if (!existsSync(path)) {
    return { ok: false, reason: { kind: 'missing', message: `There is no save at ${path}` } };
  }
  return openSave(readFileSync(path, 'utf8'), content, modules);
}

/** Writes `document` to `path` as canonical JSON, creating the directory if it is missing. */
export function writeSave(path: string, document: WorldDocument): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialise(document), 'utf8');
}
