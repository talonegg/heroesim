// The register, `media/portraits/registry.json` (DL-135 item 11, v1.1.3-S2): every Portrait key ever
// issued, with its role, sex, fingerprint and whether it is live or retired. A key is never reused,
// even for a picture that is removed, since saves hold it (DL-134 item 5).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatJson } from '@heroesim/content/write';
import type { Fingerprint } from './fingerprint.js';

/**
 * The roles the tool takes pictures for (DL-135 item 10): each with its key's prefix, its folder in
 * `media/portraits/` and its folder in `media/inbox/`. A third role, the Patron's, is one more row.
 */
export const roles = {
  guildmaster: { prefix: 'gm', folder: 'guildmasters', inbox: 'guildmaster' },
  hero: { prefix: 'hero', folder: 'heroes', inbox: 'hero' },
} as const;

export type Role = keyof typeof roles;
export type Sex = 'female' | 'male';
export const sexes: readonly Sex[] = ['female', 'male'];
export type Status = 'live' | 'retired';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.hasOwn(roles, value);
}

export function isSex(value: unknown): value is Sex {
  return value === 'female' || value === 'male';
}

/** One key's entry. */
export interface Entry extends Fingerprint {
  role: Role;
  sex: Sex;
  status: Status;
}

/** How the fingerprints were taken, and the distance within which two pictures are similar. */
export interface FingerprintSettings {
  method: string;
  bits: number;
  similarWithin: number;
  tuning: string;
}

export interface Registry {
  fingerprint: FingerprintSettings;
  portraits: Record<string, Entry>;
}

/** The register's path under a repository's root. */
export function registryPath(root: string): string {
  return path.join(root, 'media', 'portraits', 'registry.json');
}

/** A picture's path, and its thumbnail's, under a repository's root. */
export function picturePaths(root: string, role: Role, sex: Sex, key: string): { picture: string; thumbnail: string } {
  const folder = path.join(root, 'media', 'portraits', roles[role].folder, sex);
  return { picture: path.join(folder, `${key}.webp`), thumbnail: path.join(folder, `${key}.thumb.webp`) };
}

/** A key's parts, if it is a key of the form `<prefix>-<sex>-<number>`. */
export function parseKey(key: string): { role: Role; sex: Sex; number: number } | null {
  const match = /^([a-z]+)-(female|male)-(\d{2,})$/.exec(key);
  if (match === null) return null;
  const role = (Object.keys(roles) as Role[]).find((each) => roles[each].prefix === match[1]);
  if (role === undefined) return null;
  return { role, sex: match[2] as Sex, number: Number(match[3]) };
}

/** The key for a role, sex and number: `gm-female-04`, `hero-male-01`. */
export function keyOf(role: Role, sex: Sex, number: number): string {
  return `${roles[role].prefix}-${sex}-${String(number).padStart(2, '0')}`;
}

/**
 * The next key of a role and sex: one past the highest number ever issued to them, live or
 * retired, so no key is ever issued twice.
 */
export function nextKey(registry: Registry, role: Role, sex: Sex): string {
  let highest = 0;
  for (const key of Object.keys(registry.portraits)) {
    const parts = parseKey(key);
    if (parts !== null && parts.role === role && parts.sex === sex) highest = Math.max(highest, parts.number);
  }
  return keyOf(role, sex, highest + 1);
}

/** Retires a key: its picture leaves the game, and its key is never issued again. */
export function retire(registry: Registry, key: string): Registry {
  const entry = registry.portraits[key];
  if (entry === undefined) throw new Error(`${key} is not in the register`);
  return { ...registry, portraits: { ...registry.portraits, [key]: { ...entry, status: 'retired' } } };
}

/** Reads a register, refusing one that is not the shape above. */
export function readRegistry(root: string): Registry {
  const file = registryPath(root);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return parseRegistry(json, file);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks a register's shape. */
export function parseRegistry(json: unknown, where = 'registry.json'): Registry {
  const problems: string[] = [];
  if (!isObject(json)) throw new Error(`${where}: not an object`);
  const settings = json.fingerprint;
  if (
    !isObject(settings) ||
    typeof settings.method !== 'string' ||
    typeof settings.tuning !== 'string' ||
    !Number.isInteger(settings.bits) ||
    !Number.isInteger(settings.similarWithin)
  ) {
    problems.push('fingerprint: method, bits, similarWithin and tuning are wanted');
  }
  const portraits = json.portraits;
  if (!isObject(portraits)) problems.push('portraits: not an object');
  else {
    for (const [key, entry] of Object.entries(portraits)) {
      const parts = parseKey(key);
      if (parts === null) problems.push(`portraits.${key}: not a key of the form <prefix>-<sex>-<number>`);
      if (!isObject(entry)) {
        problems.push(`portraits.${key}: not an object`);
        continue;
      }
      if (!isRole(entry.role)) problems.push(`portraits.${key}.role: not a role`);
      if (!isSex(entry.sex)) problems.push(`portraits.${key}.sex: not a sex`);
      if (parts !== null && (parts.role !== entry.role || parts.sex !== entry.sex)) {
        problems.push(`portraits.${key}: its role and sex are not its key's`);
      }
      if (entry.status !== 'live' && entry.status !== 'retired') problems.push(`portraits.${key}.status: not live or retired`);
      if (typeof entry.hash !== 'string' || !/^[0-9a-f]+$/.test(entry.hash)) problems.push(`portraits.${key}.hash: not hexadecimal`);
      if (!Array.isArray(entry.trimmed) || !entry.trimmed.every((each) => typeof each === 'string' && /^[0-9a-f]+$/.test(each))) {
        problems.push(`portraits.${key}.trimmed: not a list of hexadecimal hashes`);
      }
    }
  }
  if (problems.length > 0) throw new Error(`${where}:\n  ${problems.join('\n  ')}`);
  return json as unknown as Registry;
}

/** The register as written: formatted as the content files are, each key's entry kept together. */
export function formatRegistry(registry: Registry): string {
  return formatJson(registry);
}
