/**
 * Save slots on disk (E7-S4, DL-02). Saves are snapshots, not event logs (ADR-0004); the
 * engine owns the one serialiser and this file owns only where the text goes and what is
 * wrapped around it.
 *
 * Every write is atomic: the text goes to `<slot>.json.tmp`, is flushed to the disk with
 * `fsync`, and is then renamed over the slot — so a save interrupted half way leaves the
 * previous one intact, and a stale temporary file from a killed write is simply written
 * over by the next save and is never listed or loaded.
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  deserialiseCareer,
  SaveError,
  serialiseCareer,
  yearOf,
  type Career,
  type Content,
} from '@heroesim/engine';

/** The slot a Career is kept in unless the player names another. Nothing else writes it. */
export const AUTOSAVE_SLOT = 'autosave';

/** The three named slots the player is offered, beside the autosave (E7 §3). */
export const NAMED_SLOTS = ['one', 'two', 'three'] as const;

/** Bumped only by a breaking change to the wrapper. A file that does not match is refused. */
export const SLOT_FORMAT_VERSION = 1;

/**
 * What a slot says about itself without the Career being deserialised (E7-S4). It is
 * written from the Career at save time by `headerFor` and by nothing else, so it cannot
 * drift from the document it wraps.
 */
export interface SlotHeader {
  guildName: string;
  /** The Day the Career stands on. */
  day: number;
  /** The Year that Day falls in. */
  year: number;
  rosterSize: number;
  seed: string;
  /** Whether the Career has ended, so the picker can say so before it is opened. */
  ended: boolean;
}

/**
 * A slot file. `career` is the **exact** string `serialiseCareer` returned and is never
 * re-encoded, so DL-02's one-serialiser rule holds and the web client reads the same
 * document. `header` is E7 §4's shape plus the one field the picker's own acceptance box
 * needs (DL-25 §9); `history` is the CLI's own rolling five (E7-S2).
 */
export interface SlotFile {
  formatVersion: number;
  savedOn: string;
  header: SlotHeader;
  career: string;
  history: string[];
}

/** What a listing knows about a slot. */
export interface SlotSummary {
  name: string;
  header?: SlotHeader;
  /** When it was written, as the file records it. */
  savedOn?: string;
  /** Set when the file is there but cannot be trusted; then `header` is absent. */
  problem?: string;
}

/** A Career read back off the disk, with the history that was saved beside it. */
export interface LoadedSlot {
  career: Career;
  history: string[];
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

/** What a slot says about itself, read off the Career it is about to wrap. */
export function headerFor(career: Career): SlotHeader {
  return {
    guildName: career.guild.name,
    day: career.day,
    year: yearOf(career.day, career.config),
    rosterSize: career.guild.roster.length,
    seed: career.seed,
    ended: career.ended !== undefined,
  };
}

function isHeader(value: unknown): value is SlotHeader {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw['guildName'] === 'string' &&
    typeof raw['day'] === 'number' &&
    typeof raw['year'] === 'number' &&
    typeof raw['rosterSize'] === 'number' &&
    typeof raw['seed'] === 'string' &&
    typeof raw['ended'] === 'boolean'
  );
}

/**
 * The header of a document that is a bare `serialiseCareer` string — every save E1 to E6
 * wrote (DL-25 §10). Four field reads off the parsed JSON: the Career is not deserialised,
 * not validated and not cloned.
 */
function headerFromBareCareer(raw: Record<string, unknown>): SlotHeader | undefined {
  const guild = raw['guild'] as Record<string, unknown> | undefined;
  const config = raw['config'] as Record<string, unknown> | undefined;
  const roster = guild?.['roster'];
  if (typeof raw['day'] !== 'number' || typeof raw['seed'] !== 'string') return undefined;
  const perYear = typeof config?.['daysPerYear'] === 'number' ? config['daysPerYear'] : 0;
  return {
    guildName: typeof guild?.['name'] === 'string' ? guild['name'] : '',
    day: raw['day'],
    year: perYear > 0 ? Math.floor((raw['day'] - 1) / perYear) + 1 : 1,
    rosterSize: Array.isArray(roster) ? roster.length : 0,
    seed: raw['seed'],
    ended: raw['ended'] !== undefined && raw['ended'] !== null,
  };
}

/** Every slot in the Career directory, in name order, with what each holds. */
export function listSlots(careerDir: string): SlotSummary[] {
  const dir = resolve(careerDir);
  if (!existsSync(dir)) return [];
  const summaries: SlotSummary[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // A temporary file from a killed write is not a slot and is never offered as one.
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const name = entry.name.slice(0, -'.json'.length);
    if (!SLOT_PATTERN.test(name)) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as Record<
        string,
        unknown
      >;
      if (typeof raw['career'] === 'string') {
        if (raw['formatVersion'] !== SLOT_FORMAT_VERSION) {
          summaries.push({
            name,
            problem:
              `saved in slot format ${String(raw['formatVersion'])}, and this game reads ` +
              `format ${SLOT_FORMAT_VERSION}`,
          });
          continue;
        }
        const header = isHeader(raw['header']) ? raw['header'] : undefined;
        const summary: SlotSummary = { name };
        if (header !== undefined) summary.header = header;
        if (typeof raw['savedOn'] === 'string') summary.savedOn = raw['savedOn'];
        if (header === undefined) summary.problem = 'the file has no header to read';
        summaries.push(summary);
        continue;
      }
      const bare = headerFromBareCareer(raw);
      summaries.push(
        bare === undefined ? { name, problem: 'the file is not a Career' } : { name, header: bare },
      );
    } catch {
      summaries.push({ name, problem: 'the file is not readable' });
    }
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Write a Career and the CLI's own history to a slot, atomically.
 *
 * @param savedOn when this was written, injected so that a test is deterministic and so
 * that the clock is read in exactly one place in the whole front end (E7 §4)
 * @returns the path written
 */
export function saveSlot(
  careerDir: string,
  name: string,
  career: Career,
  history: readonly string[],
  savedOn: string,
): string {
  const dir = resolve(careerDir);
  mkdirSync(dir, { recursive: true });
  const path = slotPath(dir, name);
  const file: SlotFile = {
    formatVersion: SLOT_FORMAT_VERSION,
    savedOn,
    header: headerFor(career),
    // The exact string the engine returned. Never parsed, never re-encoded (DL-02).
    career: serialiseCareer(career),
    history: [...history],
  };
  const temporary = `${path}.tmp`;
  // Truncating open, so a stale temporary file from a killed write is written over rather
  // than appended to; fsync before the rename, so what is renamed is on the disk.
  const handle = openSync(temporary, 'w');
  try {
    writeFileSync(handle, JSON.stringify(file, null, 2), 'utf8');
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, path);
  return path;
}

/**
 * Read a Career back from a slot, in either shape it may be on disk: this format, or a
 * bare `serialiseCareer` string as every save E1 to E6 wrote (DL-25 §10). Nothing is
 * rewritten by reading it.
 *
 * @param content always pass it: without it a Rival's Roster loads **empty** and every
 * selector answers for that empty world until the first `advance` (DL-22 §7)
 * @throws SaveError when the slot is empty, unreadable, or written in a slot format this
 * game does not read — a mismatch is refused rather than guessed at, and the file is left
 * exactly as it was (DL-02)
 */
export function loadSlot(careerDir: string, name: string, content?: Content): LoadedSlot {
  const path = slotPath(careerDir, name);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new SaveError(`there is nothing saved in slot "${name}"`);
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SaveError(`slot "${name}": the file is not readable`);
  }

  const carried = raw['career'];
  const inner = typeof carried === 'string' ? carried : undefined;
  if (inner !== undefined && raw['formatVersion'] !== SLOT_FORMAT_VERSION) {
    throw new SaveError(
      `slot "${name}": it was saved in slot format ${String(raw['formatVersion'])} and this ` +
        `game reads format ${SLOT_FORMAT_VERSION}. The file has not been changed.`,
    );
  }
  const history = Array.isArray(raw['history'])
    ? raw['history'].filter((entry): entry is string => typeof entry === 'string')
    : [];

  try {
    return { career: deserialiseCareer(inner ?? text, content), history };
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
    const header = raw['header'];
    const seed = isHeader(header) ? header.seed : raw['seed'];
    if (seed !== career.seed) return false;
  } catch {
    return false;
  }
  rmSync(path);
  return true;
}
