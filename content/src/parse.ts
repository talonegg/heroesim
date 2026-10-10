// Text in, content out: the driver of the content kinds' readers (DL-243). Pure: no file
// system, so a browser bundle can use it. Each kind is read from its source (`kinds/`): a file keyed
// by content key, whose rows do not repeat their key, a folder of one file a row named by its key
// (DL-260), or a file of its own shape; every field present, of its type, and no field the kind does
// not know. Then the whole set is validated (`validate.ts`).

import type { ContentSet } from '@heroesim/engine/content';
import { findDuplicateKeys } from './duplicate-keys.js';
import { contentSetId, isFolder, placeOf, rowFile, rowFilesIn, type ContentSource } from './files.js';
import { ContentError } from './kinds/error.js';
import { contentKinds, contentSources, type AnyKindReader } from './kinds/index.js';
import { validateContent } from './validate.js';

export { contentSetId, contentSources, isFolder, placeOf, rowFile, rowFilesIn, type ContentSource };

/**
 * Parse and validate a content set from the text of its files.
 *
 * @param files each file's text by its path in the content directory (`stats.json`, a folder's row
 *   `items/short-sword.json`); files that are not content files are ignored, so a whole directory's
 *   JSON may be passed
 * @throws ContentError naming the file and key of every problem found
 */
export function parseContent(files: Readonly<Record<string, string>>): ContentSet {
  return validateContent(readContent(files));
}

/**
 * Parse a content set from the text of its files, checking each row's shape but not the rules
 * across rows (`validateContent`). Only for text already validated: the page's build runs
 * `parseContent` on the same files and fails on any problem, so the script need not carry the
 * checks (DL-152). Everything else calls `parseContent`.
 *
 * @throws ContentError naming the file and key of every problem of shape found
 */
export function readContent(files: Readonly<Record<string, string>>): ContentSet {
  return readKinds(contentKinds, files);
}

/** The content set `kinds` read from `files`, each kind its own source into its own place: `readContent` with a test's kinds. */
export function readKinds(kinds: readonly AnyKindReader[], files: Readonly<Record<string, string>>): ContentSet {
  const problems: string[] = [];
  const set: Record<string, unknown> = { id: contentSetId };
  for (const kind of kinds) set[kind.key] = readKind(kind, files, problems);
  if (problems.length > 0) throw new ContentError(problems);
  return set as unknown as ContentSet;
}

/**
 * The files of `files` that `source` reads, as `[name, text]`: its one file, or each of its folder's
 * rows' in key order (DL-260); none where there is none.
 */
export function sourceFiles(source: ContentSource, files: Readonly<Record<string, string>>): [string, string][] {
  if (!isFolder(source)) return Object.hasOwn(files, source) ? [[source, files[source] as string]] : [];
  return rowFilesIn(source, Object.keys(files)).map(([, name]) => [name, files[name] as string]);
}

/**
 * `kind`'s value read from its source among `files`, or its default where its file is missing, each
 * problem recorded in `problems`. A folder's rows are read as one object by key, in key order, since
 * a folder has no order of its own; a folder with no row holds none, as git keeps no empty folder
 * (DL-260); and a row whose file is not JSON is left out.
 */
export function readKind(kind: AnyKindReader, files: Readonly<Record<string, string>>, problems: string[]): unknown {
  const { source } = kind;
  if (!isFolder(source)) return kind.read(readJson(source, files[source], problems), problems);
  const json: Record<string, unknown> = {};
  for (const [key, name] of rowFilesIn(source, Object.keys(files))) {
    const value = readJson(name, files[name], problems);
    if (value !== undefined) json[key] = value;
  }
  return kind.read(json, problems);
}

/** The byte-order mark some Windows editors write at the start of a UTF-8 file; JSON.parse refuses it. */
const byteOrderMark = String.fromCharCode(0xfeff);

/** A file's JSON, or `undefined` with a problem recorded when it is missing, malformed or has a key twice. */
function readJson(file: string, text: string | undefined, problems: string[]): unknown {
  if (text === undefined) {
    problems.push(`${file}: missing`);
    return undefined;
  }
  const unmarked = text.startsWith(byteOrderMark) ? text.slice(1) : text;
  let json: unknown;
  try {
    json = JSON.parse(unmarked);
  } catch (cause) {
    problems.push(`${file}: not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`);
    return undefined;
  }
  for (const { key, path, line } of findDuplicateKeys(unmarked)) {
    const where = path.length === 0 ? 'at the top level' : `in ${path.join('.')}`;
    problems.push(`${file}: duplicate key "${key}" ${where} (line ${line})`);
  }
  return json;
}
