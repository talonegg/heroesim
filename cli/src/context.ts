// What every command of the CLI shares (DL-234): the outside world it is given, its exit codes, the
// save it opens, and how it says a result or a refusal. main.ts runs the commands, and a command of
// cli/src/commands/ takes these from here, so that no command imports main.ts back.

import type { ContentSet, EngineDeps, Module, WorldDocument } from '@heroesim/engine';
import { refusalLine } from './namer.js';
import { readSave, type ReadSave } from './saves.js';

/** Everything the CLI takes from outside itself. */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** The working directory: saves and relative paths resolve against it. */
  cwd: string;
  /** Read for `HEROESIM_SAVE_DIR` (docs/environment.md). */
  env: Readonly<Record<string, string | undefined>>;
  /** The clock, read once by `new` for `meta.createdAt`. */
  now(): Date;
  /** A draw in `[0, 1)` for a made-up seed: `Math.random` in play. */
  random(): number;
}

/**
 * 0 done; 1 refused (no save, a save that does not load, an id not in it, a save `new` would
 * replace, a file-system error); 2 a bad command line or a bad value on it (DL-21).
 */
export const exitCodes = { ok: 0, refused: 1, usage: 2 } as const;

export type Exit = (typeof exitCodes)[keyof typeof exitCodes];

export interface Context {
  io: CliIo;
  content: ContentSet;
  /** The save the command reads and writes. */
  path: string;
  /**
   * The modules the command installs, by `--modules` on `new`, `load` and `advance` (M8-S4, DL-79):
   * none unless given, and none for every other command.
   */
  modules: readonly Module[];
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────

export function say(io: CliIo, lines: readonly string[]): Exit {
  io.stdout(`${lines.join('\n')}\n`);
  return exitCodes.ok;
}

export function refuse(io: CliIo, problem: string, code: Exit = exitCodes.refused): Exit {
  io.stderr(`${problem}\n`);
  return code;
}

/**
 * Why the save at `path` does not load, in a sentence. A save of an older schema than this engine
 * reads, as a `v1.1.1` save is since schema 5 and a `v1.1.2` save since schema 6, is refused in the
 * owner's words, the page's too (v1.1.2-S3, DL-125 item 10.2; v1.1.3-S6, DL-135 item 7); the rest
 * name the engine's reason.
 */
function loadRefusalWords(reason: Exclude<ReadSave, { ok: true }>['reason'], path: string): string {
  if (reason.kind === 'missing') return `${reason.message}. Create a world with \`new\`, or name a save with --save.`;
  if (reason.kind === 'unsupported-version' && reason.documentVersion < reason.schemaVersion) {
    return `This game was saved by an older Heroesim and cannot be loaded: ${path}.`;
  }
  return `Cannot load ${path}: ${reason.message}.`;
}

/**
 * The save at `path`, loaded and checked, with the deps to play it under, `modules` installed (none
 * unless given); `undefined` after printing why it does not load. Content keys the content does not
 * define, and a module's slice no module in `modules` owns, are warned about and the save still loads
 * (data-model rule 5, §3.4).
 */
export function open(
  io: CliIo,
  path: string,
  content: ContentSet,
  modules: readonly Module[] = [],
): { document: WorldDocument; deps: EngineDeps } | undefined {
  const read = readSave(path, content, modules);
  if (!read.ok) {
    refuse(io, loadRefusalWords(read.reason, path));
    return undefined;
  }
  for (const warning of read.warnings) io.stderr(`Warning: ${warning.detail}\n`);
  return { document: read.document, deps: read.deps };
}

/**
 * The refusal of `action`, a Turn (`advance`) or a command's, after the game's end, or `undefined`
 * while it goes on: once the player's game has ended the world stops as it stands (DL-28, DL-53), and
 * nothing is written. In the refusals' words (DL-240), its date by `deps.config`, the config the save
 * plays under (`playDeps`, DL-210).
 */
export function over(io: CliIo, document: WorldDocument, deps: EngineDeps, action: string): Exit | undefined {
  const { world } = document;
  if (world.ended === null) return undefined;
  return refuse(io, refusalLine({ action, reason: 'game-ended', ending: world.ended }, { world, content: deps.content, calendar: deps.config }));
}
