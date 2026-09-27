// The modules the CLI may install (M8-S4, DL-79). `--modules <ids>` on `new`, `load` and `advance`
// names them, comma-separated; without it a command installs none, as every command did before M8.
// A module is code, not data, so the CLI knows each it may install by id. The only one is the probe
// (engine/src/modules/probe.ts), which is test-only: `--modules probe` is a test switch, and nothing
// installs it unless the command line says so (DL-78).

import { probe, type Module } from '@heroesim/engine';

/** Every module the CLI may install, by id. */
export const cliModules: Readonly<Record<string, Module>> = Object.freeze({ [probe.id]: probe });

/** Whether `id` names a module the CLI may install. */
export function isCliModule(id: string): boolean {
  return Object.hasOwn(cliModules, id);
}

/**
 * The CLI's modules of `ids`, in that order, the order their hooks run in: none when `ids` is
 * absent. Throws on an id the CLI does not know, which `parseArgs` has already refused.
 */
export function modulesFor(ids: readonly string[] = []): Module[] {
  return ids.map((id) => {
    const module = isCliModule(id) ? cliModules[id] : undefined;
    if (module === undefined) throw new RangeError(`${JSON.stringify(id)} is not a module the CLI installs`);
    return module;
  });
}
