// The drift check (v1.1.4-S12, DL-150 item 14): the register's engine entries against the code. A read
// of a Trait (`reads.ts`) in a declaration no entry lists is drift, as is a declaration an entry lists
// that reads none, or one it runs through that is not there: the register says where Traits are read,
// so a rule that starts reading one, or stops, changes it.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { engineEntriesOf, register, type RegisterEntry } from '@heroesim/content/uses';
import ts from 'typescript';
import { traitReads, type TraitRead } from './reads.js';

/** What the drift check found: each read no entry lists, each listed source that reads no Trait, and each declaration run through that is not there. */
export interface Drift {
  ok: boolean;
  reads: number;
  unlisted: TraitRead[];
  stale: { entry: string; file: string; name: string }[];
  missing: { entry: string; file: string; name: string }[];
  problems: string[];
}

/** The top-level declarations of a file's text, by name. */
function declarations(file: string, text: string): Set<string> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined) names.add(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const each of statement.declarationList.declarations) if (ts.isIdentifier(each.name)) names.add(each.name.text);
  }
  return names;
}

/** The register's engine entries held against the code under `root`. */
export function drift(root: string, entries: readonly RegisterEntry[] = register): Drift {
  const found = traitReads(root);
  const engine = engineEntriesOf(entries);
  const listed = new Set(engine.flatMap((entry) => entry.sources.flatMap((place) => place.names.map((name) => `${place.file}#${name}`))));
  const reading = new Set(found.map((read) => `${read.file}#${read.name}`));

  const unlisted = found.filter((read) => !listed.has(`${read.file}#${read.name}`));
  const stale = engine.flatMap((entry) =>
    entry.sources.flatMap((place) => place.names.filter((name) => !reading.has(`${place.file}#${name}`)).map((name) => ({ entry: entry.id, file: place.file, name }))),
  );
  const missing = engine.flatMap((entry) =>
    entry.through.flatMap((place) => {
      const full = path.join(root, place.file);
      const names = existsSync(full) ? declarations(place.file, readFileSync(full, 'utf8')) : new Set<string>();
      return place.names.filter((name) => !names.has(name)).map((name) => ({ entry: entry.id, file: place.file, name }));
    }),
  );

  const problems = [
    ...unlisted.map((read) => `${read.file}:${read.line}: ${read.name} reads ${read.reads}, which no entry of the register lists`),
    ...stale.map((each) => `${each.file}: ${each.name}, listed by the register's ${each.entry}, reads no Trait`),
    ...missing.map((each) => `${each.file}: ${each.name}, which the register's ${each.entry} runs through, is not there`),
  ];
  return { ok: problems.length === 0, reads: found.length, unlisted, stale, missing, problems };
}
