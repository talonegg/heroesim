// The modules a harness run installs (M8-S3, DL-78). `HEROESIM_MODULES` names them by id, comma-
// separated (INPUTS §9); unset, a run installs none, as every milestone's run before M8 did. A module
// is code, not data, so the harness knows each it may install by id (`harnessModules`), and a child
// process of a parallel sweep installs its own copy by the ids its job names. The only one is the
// probe (engine/src/modules/probe.ts), which is test-only: a run with it plays its seeds with it and
// without it and reports what it changed (modules.harness.test.ts, module-report.ts).
//
// The harness may read the environment: it is not the engine (ADR-0001 binds the engine only).

import { probe, type Module } from '@heroesim/engine';

/** Every module a harness run may install, by id. */
export const harnessModules: Readonly<Record<string, Module>> = Object.freeze({ [probe.id]: probe });

/**
 * Seeds a module run plays when `HEROESIM_SEEDS` is unset (M8-S3): 50, each twice, with the modules
 * installed and with none.
 */
export const defaultModuleSeedCount = 50;

/**
 * The module ids `value` names, in its order: none when it is unset or blank. Throws on an id the
 * harness does not know, an empty one (`probe,,probe`) or one named twice, so a mistyped list fails
 * the run rather than playing without the module.
 */
export function moduleIds(value: string | undefined = process.env.HEROESIM_MODULES): string[] {
  if (value === undefined || value.trim() === '') return [];
  const ids = value.split(',').map((id) => id.trim());
  const known = Object.keys(harnessModules).join(', ');
  for (const id of ids) {
    if (!Object.hasOwn(harnessModules, id)) {
      throw new RangeError(`HEROESIM_MODULES names ${JSON.stringify(id)}, which is not a harness module (${known})`);
    }
  }
  if (new Set(ids).size !== ids.length) throw new RangeError(`HEROESIM_MODULES names a module twice: ${JSON.stringify(value)}`);
  return ids;
}

/** The harness's modules of `ids`, in that order, the order their hooks run in. Throws on an id it does not know. */
export function modulesFor(ids: readonly string[]): Module[] {
  return ids.map((id) => {
    const module = Object.hasOwn(harnessModules, id) ? harnessModules[id] : undefined;
    if (module === undefined) throw new RangeError(`${JSON.stringify(id)} is not a harness module`);
    return module;
  });
}

/**
 * The ids of `modules`, which a child process installs by (`modulesFor`). Throws on a module that is
 * not the harness's own of its id, such as a probe with other tunables: a child would install
 * another, and play other games than this process.
 */
export function idsOf(modules: readonly Module[] = []): string[] {
  return modules.map((module) => {
    if (!Object.hasOwn(harnessModules, module.id) || harnessModules[module.id] !== module) {
      throw new RangeError(`The ${module.id} module is not the harness's own, so a child process cannot install it`);
    }
    return module.id;
  });
}
