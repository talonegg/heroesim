// The content version (v1.1.6-S4, DL-186 item 14) is data, `content/version.json`: `version`, raised
// whenever the content changes, so a document says which content it was created under, and
// `changelog`, a line for each raise saying why. Each intake and apply of the portrait tool and each
// "Finish" of the content editor raises it by one, writing the file as JSON in its own layout
// (`editJson`), so that `git diff` shows the version and the new line alone.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { editJson } from './json-edit.js';
import type { Transaction } from './transaction.js';

/** What `version.json` holds. */
interface VersionFile {
  version: number;
  changelog: string[];
}

/** The file that holds the content version, under a repository's root. */
export function versionPath(root: string): string {
  return path.join(root, 'content', 'version.json');
}

/** The version file at `root`, its text and its value; refused, naming the file, where it holds no version. */
function readVersionFile(root: string): { text: string; json: VersionFile } {
  const file = versionPath(root);
  const text = readFileSync(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: not JSON (${error instanceof Error ? error.message : String(error)})`, { cause: error });
  }
  const { version, changelog } = (typeof json === 'object' && json !== null ? json : {}) as Partial<VersionFile>;
  if (!Number.isInteger(version)) throw new Error(`${file}: no whole number at "version"`);
  if (!Array.isArray(changelog)) throw new Error(`${file}: no list at "changelog"`);
  return { text, json: json as VersionFile };
}

/** The content version a repository holds. */
export function readContentVersion(root: string): number {
  return readVersionFile(root).json.version;
}

/**
 * Raises the content version by one, adding to its changelog a line that says why.
 *
 * @param why what raised it, as a sentence's end: `the portrait tool's intake 2026-10-02 (…)`
 */
export function raiseContentVersion(root: string, files: Transaction, why: string): { from: number; to: number } {
  const { text, json } = readVersionFile(root);
  const from = json.version;
  const to = from + 1;
  files.write(versionPath(root), editJson(text, { ...json, version: to, changelog: [...json.changelog, `${to} from ${why}.`] }));
  return { from, to };
}
