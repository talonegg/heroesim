/**
 * Save slots on disk. Saves are snapshots, not event logs (ADR-0004); the engine owns
 * the one serialiser and this file owns only where the text goes (DL-02).
 *
 * Every write is atomic: the text goes to a temporary file beside the slot and is then
 * renamed over it, so a save interrupted half way leaves the previous one intact.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { deserialiseCareer, SaveError, serialiseCareer, type Career } from '@heroesim/engine';

/** The slot a Career is kept in unless the player names another. */
export const AUTOSAVE_SLOT = 'autosave';

/** What a listing knows about a slot without loading the whole Career. */
export interface SlotSummary {
  name: string;
  /** The Day the Career stands on. Absent if the file could not be read. */
  day?: number;
  seed?: string;
  guildName?: string;
  /** Set when the file is there but cannot be trusted. */
  problem?: string;
}

const SLOT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/** Refuse anything that could walk out of the Career directory. */
export function checkSlotName(name: string): string {
  if (!SLOT_PATTERN.test(name) || name.includes('..')) {
    throw new SaveError(
      `"${name}" is not a slot name; use letters, numbers, dot, dash or underscore`,
    );
  }
  return name;
}

/** Where a slot's file lives. */
export function slotPath(careerDir: string, name: string): string {
  return join(resolve(careerDir), `${checkSlotName(name)}.json`);
}

/** Every slot in the Career directory, in name order, with what each holds. */
export function listSlots(careerDir: string): SlotSummary[] {
  const dir = resolve(careerDir);
  if (!existsSync(dir)) return [];
  const summaries: SlotSummary[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const name = entry.name.slice(0, -'.json'.length);
    if (!SLOT_PATTERN.test(name)) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as Record<string, unknown>;
      const guild = raw['guild'] as Record<string, unknown> | undefined;
      const summary: SlotSummary = { name };
      if (typeof raw['day'] === 'number') summary.day = raw['day'];
      if (typeof raw['seed'] === 'string') summary.seed = raw['seed'];
      if (typeof guild?.['name'] === 'string') summary.guildName = guild['name'];
      summaries.push(summary);
    } catch {
      summaries.push({ name, problem: 'the file is not readable' });
    }
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Write a Career to a slot, atomically: a temporary file first, then a rename over the
 * slot, so an interrupted save never replaces a good one with half a document.
 *
 * @returns the path written
 */
export function saveSlot(careerDir: string, name: string, career: Career): string {
  const dir = resolve(careerDir);
  mkdirSync(dir, { recursive: true });
  const path = slotPath(dir, name);
  const temporary = `${path}.writing`;
  writeFileSync(temporary, serialiseCareer(career), 'utf8');
  renameSync(temporary, path);
  return path;
}

/**
 * Read a Career back from a slot.
 *
 * @throws SaveError when the slot is empty, unreadable, or written by another format
 * version — a mismatch is refused rather than guessed at (DL-02).
 */
export function loadSlot(careerDir: string, name: string): Career {
  const path = slotPath(careerDir, name);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new SaveError(`there is nothing saved in slot "${name}"`);
  }
  try {
    return deserialiseCareer(text);
  } catch (cause) {
    if (cause instanceof SaveError) throw new SaveError(`slot "${name}": ${cause.message}`);
    throw cause;
  }
}

/**
 * Remove a slot.
 *
 * @returns whether there was one to remove
 */
export function deleteSlot(careerDir: string, name: string): boolean {
  const path = slotPath(careerDir, name);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/**
 * Remove a slot only if it holds this Career. The autosave is cleared this way when a
 * Career ends, so that nothing dangling is left behind (E1-S5).
 *
 * @returns whether a file was removed
 */
export function deleteSlotForCareer(careerDir: string, name: string, career: Career): boolean {
  const path = slotPath(careerDir, name);
  if (!existsSync(path)) return false;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (raw['seed'] !== career.seed) return false;
  } catch {
    return false;
  }
  rmSync(path);
  return true;
}
