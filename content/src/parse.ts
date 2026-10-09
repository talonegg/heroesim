// Text in, content out (M1-S4): the driver of the content kinds' readers (DL-243). Pure: no file
// system, so a browser bundle can use it (M7-S1). Each file is read by its kind (`kinds/`): an object
// keyed by content key, whose rows do not repeat their key, or a file of its own shape; every field
// present, of its type, and no field the kind does not know. Then the whole set is validated
// (`validate.ts`).

import type { ContentSet } from '@heroesim/engine/content';
import { findDuplicateKeys } from './duplicate-keys.js';
import { contentFiles, contentSetId, type ContentFileName } from './files.js';
import { ContentError } from './kinds/error.js';
import { contentKinds, type AnyKindReader } from './kinds/index.js';
import { validateContent } from './validate.js';

export { contentFiles, contentSetId, type ContentFileName };

/**
 * Parse and validate a content set from the text of its files.
 *
 * @param files each file's text by its name in the content directory (`stats.json`); files
 *   that are not content files are ignored, so a whole directory's JSON may be passed
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

/** The content set `kinds` read from `files`, each kind its own file into its own place: `readContent` with a test's kinds. */
export function readKinds(kinds: readonly AnyKindReader[], files: Readonly<Record<string, string>>): ContentSet {
  const problems: string[] = [];
  const set: Record<string, unknown> = { id: contentSetId };
  for (const kind of kinds) set[kind.key] = readKind(kind, files[kind.file], problems);
  if (problems.length > 0) throw new ContentError(problems);
  return set as unknown as ContentSet;
}

/** `kind`'s value read from its file's `text`, or its default where the file is missing, each problem recorded in `problems`. */
export function readKind(kind: AnyKindReader, text: string | undefined, problems: string[]): unknown {
  return kind.read(readJson(kind.file, text, problems), problems);
}

/** The byte-order mark some Windows editors write at the start of a UTF-8 file; JSON.parse refuses it. */
const byteOrderMark = String.fromCharCode(0xfeff);

/** A file's JSON, or `undefined` with a problem recorded when it is missing, malformed or has a key twice. */
function readJson(file: ContentFileName, text: string | undefined, problems: string[]): unknown {
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
