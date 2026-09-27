// The modules the page may install (M8-S4, DL-79), named by the query parameter `modules` of its
// address, comma-separated: `?modules=probe`. Without it the page installs none, as it did before
// M8. A module is code, not data, so the page knows each it may install by id. The only one is the
// probe (engine/src/modules/probe.ts), which is test-only: the parameter is a test switch, which no
// control on the page sets, and the page says when it is on (app.tsx).
//
// It lives in `state/` because it reads an engine value, the probe, which only `state/` may import
// (M7-S2). Importing it puts the probe in the bundle, where DL-78 had none of it (DL-79).

import { probe, type Module } from '@heroesim/engine';

/** Every module the page may install, by id. */
export const pageModules: Readonly<Record<string, Module>> = Object.freeze({ [probe.id]: probe });

/** The query parameter that names them. */
export const modulesParameter = 'modules';

/**
 * The page's modules the query string `search` names, `?modules=probe`, each once, in the order
 * named, the order their hooks run in: none when it names none. An id the page does not know
 * installs nothing; the page names what it did install, so a mistyped id shows as nothing installed.
 */
export function modulesFromQuery(search: string): Module[] {
  const value = new URLSearchParams(search).get(modulesParameter) ?? '';
  const ids = [...new Set(value.split(',').map((id) => id.trim()))];
  return ids.flatMap((id) => {
    const module = Object.hasOwn(pageModules, id) ? pageModules[id] : undefined;
    return module === undefined ? [] : [module];
  });
}
