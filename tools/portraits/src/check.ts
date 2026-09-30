// `check` (DL-135 item 11, v1.1.3-S2): the tool's own checks, alone.
// - Every live key in the register has its picture and its thumbnail in `media/`, and every picture
//   and thumbnail there has its key, live, in its role's and sex's folder.
// - Every live key is listed in `content/portraits.json` under its role and sex, every key listed
//   there is live, and every live key has a row in `content/portrait-appearances.json`.
// - Every picture and thumbnail is its size, and within its weight.
// The content's own checks (`@heroesim/content`) judge the rows themselves.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { picture, thumbnail } from './convert.js';
import { picturePaths, readRegistry, roles, sexes, type Registry, type Role } from './registry.js';
import { webpSize } from './webp.js';

/** One thing `check` found wrong: what kind, and a sentence naming it. */
export interface Failure {
  code:
    | 'register'
    | 'missing-picture'
    | 'missing-thumbnail'
    | 'unregistered-file'
    | 'retired-file'
    | 'misplaced-file'
    | 'unlisted-key'
    | 'listed-not-live'
    | 'missing-row'
    | 'oversized'
    | 'wrong-size'
    | 'content-file';
  message: string;
  key?: string;
  file?: string;
}

export interface CheckResult {
  ok: boolean;
  /** The live keys, by role. */
  live: number;
  failures: Failure[];
}

/** A path under the root, with `/` separators, for messages. */
function shown(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

function readJson(root: string, file: string, failures: Failure[]): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push({ code: 'content-file', file: shown(root, file), message: `${shown(root, file)} cannot be read: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

function checkSize(root: string, file: string, key: string, limits: { width: number; height: number; maxBytes: number }, what: string, failures: Failure[]): void {
  const bytes = readFileSync(file);
  const where = shown(root, file);
  if (bytes.length > limits.maxBytes) {
    failures.push({ code: 'oversized', key, file: where, message: `${where}: the ${what} of ${key} is ${bytes.length} bytes, over the ${limits.maxBytes} allowed` });
  }
  const size = webpSize(bytes);
  if (size === null || size.width !== limits.width || size.height !== limits.height) {
    const found = size === null ? 'not a WebP' : `${size.width} × ${size.height}`;
    failures.push({ code: 'wrong-size', key, file: where, message: `${where}: the ${what} of ${key} is ${found}, not ${limits.width} × ${limits.height}` });
  }
}

/** Runs the tool's checks on the repository at `root`. */
export function check(root: string): CheckResult {
  const failures: Failure[] = [];
  let registry: Registry;
  try {
    registry = readRegistry(root);
  } catch (error) {
    return { ok: false, live: 0, failures: [{ code: 'register', message: error instanceof Error ? error.message : String(error) }] };
  }
  const live = Object.entries(registry.portraits).filter(([, entry]) => entry.status === 'live');

  // The register against media/.
  for (const [key, entry] of live) {
    const files = picturePaths(root, entry.role, entry.sex, key);
    if (!existsSync(files.picture)) {
      failures.push({ code: 'missing-picture', key, file: shown(root, files.picture), message: `${key} is live in the register, and ${shown(root, files.picture)} is missing` });
    } else checkSize(root, files.picture, key, picture, 'picture', failures);
    if (!existsSync(files.thumbnail)) {
      failures.push({ code: 'missing-thumbnail', key, file: shown(root, files.thumbnail), message: `${key} is live in the register, and its thumbnail ${shown(root, files.thumbnail)} is missing` });
    } else checkSize(root, files.thumbnail, key, thumbnail, 'thumbnail', failures);
  }
  const portraitsDir = path.join(root, 'media', 'portraits');
  for (const folder of existsSync(portraitsDir) ? readdirSync(portraitsDir) : []) {
    const role = (Object.keys(roles) as Role[]).find((each) => roles[each].folder === folder);
    for (const sex of sexes) {
      const dir = path.join(portraitsDir, folder, sex);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir).filter((each) => each.endsWith('.webp'))) {
        const key = name.replace(/(\.thumb)?\.webp$/, '');
        const where = shown(root, path.join(dir, name));
        const entry = registry.portraits[key];
        if (entry === undefined) failures.push({ code: 'unregistered-file', key, file: where, message: `${where} has no key in the register` });
        else if (entry.status !== 'live') failures.push({ code: 'retired-file', key, file: where, message: `${where} is in media/, and ${key} is retired` });
        else if (entry.role !== role || entry.sex !== sex) {
          failures.push({ code: 'misplaced-file', key, file: where, message: `${where} is in the wrong folder: ${key} is a ${entry.sex} ${entry.role}'s` });
        }
      }
    }
  }

  // The register against the content.
  const portraitsFile = path.join(root, 'content', 'portraits.json');
  const listed = readJson(root, portraitsFile, failures) as Record<string, Record<string, unknown>> | null;
  const appearancesFile = path.join(root, 'content', 'portrait-appearances.json');
  const appearances = readJson(root, appearancesFile, failures) as { portraits?: Record<string, unknown> } | null;
  if (listed !== null) {
    for (const [key, entry] of live) {
      const list = listed[entry.role]?.[entry.sex];
      if (!Array.isArray(list) || !list.includes(key)) {
        failures.push({ code: 'unlisted-key', key, file: 'content/portraits.json', message: `${key} is live in the register, and content/portraits.json does not list it under ${entry.role}.${entry.sex}` });
      }
    }
    for (const role of Object.keys(roles) as Role[]) {
      for (const sex of sexes) {
        const list = listed[role]?.[sex];
        for (const key of Array.isArray(list) ? list : []) {
          if (registry.portraits[key]?.status !== 'live') {
            failures.push({ code: 'listed-not-live', key: String(key), file: 'content/portraits.json', message: `content/portraits.json lists ${String(key)}, which is not live in the register` });
          }
        }
      }
    }
  }
  if (appearances !== null) {
    for (const [key] of live) {
      if (appearances.portraits === undefined || !Object.hasOwn(appearances.portraits, key)) {
        failures.push({ code: 'missing-row', key, file: 'content/portrait-appearances.json', message: `${key} is live in the register, and has no row in content/portrait-appearances.json` });
      }
    }
  }
  return { ok: failures.length === 0, live: live.length, failures };
}
