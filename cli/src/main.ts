// @heroesim/cli: `heroesim <command> [flags]`, run as `npm run play -- <command>` (M1-S9).
//
// A non-interactive runner. It keeps nothing between invocations: each command reads the save
// it names, acts, and writes the save back when the World State changed, so the CLI stays thin
// and every game is a file. Output is plain text through render.ts.
//
// The CLI holds no rule. The engine makes and checks the world; content names what it holds;
// every number printed is a document field or an engine selector (see render.ts). What the CLI
// decides for itself is only the command line, where saves live, and how the output is laid out
// (DL-21).
//
// `main` takes its outside world as `io` (the output streams, the working directory, the
// environment, the clock and the random source for a made-up seed), so tests run it in-process
// against a temporary directory. The last line wires Node's when this file is run.

import { existsSync } from 'node:fs';
import {
  createWorld,
  defaultConfig,
  entriesBetween,
  entriesFor,
  parseId,
  playerGuild,
  type ContentSet,
  type EngineDeps,
  type EntityId,
  type Guild,
  type Hero,
  type WorldDocument,
} from '@heroesim/engine';
import { ContentError } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import { parseArgs, usage, type Command, type View } from './args.js';
import {
  renderGuilds,
  renderHero,
  renderHistory,
  renderPatrons,
  renderPool,
  renderRoster,
  renderSummary,
} from './render.js';
import { playDeps, readSave, savePath, writeSave } from './saves.js';
import { readableSeed } from './seed.js';

/** Everything the CLI takes from outside itself. */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** The working directory: saves and relative paths resolve against it. */
  cwd: string;
  /** Read for `HEROESIM_SAVE_DIR` (INPUTS §9). */
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

type Exit = (typeof exitCodes)[keyof typeof exitCodes];

interface Context {
  io: CliIo;
  content: ContentSet;
  /** The save the command reads and writes. */
  path: string;
}

/** Runs one command; returns the exit code. */
export function main(argv: readonly string[], io: CliIo): Exit {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.problem}.\n\n${usage}`);
    return exitCodes.usage;
  }
  const { command } = parsed;
  if (command.name === 'help') {
    io.stdout(usage);
    return exitCodes.ok;
  }

  try {
    const context = { io, content: loadContent(), path: savePath(command.save, io.cwd, io.env) };
    return run(command, context);
  } catch (error) {
    // The file system's refusals (a directory where a save should be, no permission) and a
    // content set that does not load are reported; anything else is a bug and is thrown.
    if (error instanceof ContentError || (error instanceof Error && 'code' in error)) {
      io.stderr(`${error.message}\n`);
      return exitCodes.refused;
    }
    throw error;
  }
}

function run(command: Exclude<Command, { name: 'help' }>, context: Context): Exit {
  switch (command.name) {
    case 'new':
      return newWorld(command, context);
    case 'show':
      return show(command.view, context);
    case 'save':
      return saveAs(command.as, context);
    case 'load':
      return load(command.file, context);
  }
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────

function say(io: CliIo, lines: readonly string[]): Exit {
  io.stdout(`${lines.join('\n')}\n`);
  return exitCodes.ok;
}

function refuse(io: CliIo, problem: string, code: Exit = exitCodes.refused): Exit {
  io.stderr(`${problem}\n`);
  return code;
}

/**
 * The save at `path`, loaded and checked, with the deps to play it under; `undefined` after
 * printing why it does not load. Content keys the content does not define are warned about and
 * the save still loads (data-model rule 5).
 */
function open(io: CliIo, path: string, content: ContentSet): { document: WorldDocument; deps: EngineDeps } | undefined {
  const read = readSave(path, content);
  if (!read.ok) {
    const { reason } = read;
    refuse(
      io,
      reason.kind === 'missing'
        ? `${reason.message}. Create a world with \`new\`, or name a save with --save.`
        : `Cannot load ${path}: ${reason.message}.`,
    );
    return undefined;
  }
  for (const warning of read.warnings) io.stderr(`Warning: ${warning.detail}\n`);
  return { document: read.document, deps: read.deps };
}

// ── new ──────────────────────────────────────────────────────────────────────────────────────

function newWorld(command: Extract<Command, { name: 'new' }>, { io, content, path }: Context): Exit {
  const guildName = command.guild.trim();
  const guildmasterName = command.master.trim();
  if (guildName === '') return refuse(io, 'The Guild needs a name: --guild <name>.', exitCodes.usage);
  if (guildmasterName === '') return refuse(io, 'The Guildmaster needs a name: --master <name>.', exitCodes.usage);

  const { background } = command;
  if (background !== undefined) {
    const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild');
    if (!guildBackgrounds.some((row) => row.key === background)) {
      const choices = guildBackgrounds.map((row) => `${row.key} (${row.name})`).join(', ');
      return refuse(io, `No Guild Background "${background}". Choose one of: ${choices}.`, exitCodes.usage);
    }
  }

  if (existsSync(path) && !command.force) {
    return refuse(io, `A save already exists at ${path}. Replace it with --force, or name another with --save.`);
  }

  const seed = command.seed ?? readableSeed(() => io.random());
  const { document } = createWorld(
    seed,
    {
      guildmasterName,
      guildName,
      ...(background === undefined ? {} : { backgroundKey: background }),
      createdAt: io.now().toISOString(),
    },
    // A new game starts under the current defaults; from then on it plays under its own.
    { config: defaultConfig, content },
  );
  writeSave(path, document);
  return say(io, [
    `Created a world from seed ${seed} and saved it to ${path}.`,
    '',
    ...renderSummary(document, playDeps(document, content)),
  ]);
}

// ── show ─────────────────────────────────────────────────────────────────────────────────────

function rowIn<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

function show(view: View, { io, content, path }: Context): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const { document, deps } = opened;
  const { world, history } = document;

  switch (view.kind) {
    case 'summary':
      return say(io, renderSummary(document, deps));
    case 'guilds':
      return say(io, renderGuilds(document, deps));
    case 'roster': {
      const guild: Guild | undefined =
        view.guildId === undefined ? playerGuild(world) : rowIn(world.guilds, view.guildId);
      if (guild === undefined) {
        return refuse(io, view.guildId === undefined ? `${path} has no player's Guild.` : `${path} has no Guild ${view.guildId}.`);
      }
      return say(io, renderRoster(guild, document, deps));
    }
    case 'pool':
      return say(io, renderPool(document, deps));
    case 'patrons':
      return say(io, renderPatrons(document, deps));
    case 'hero': {
      const hero: Hero | undefined = rowIn(world.heroes, view.heroId);
      if (hero === undefined) return refuse(io, `${path} has no Hero ${view.heroId}.`);
      return say(io, renderHero(hero, document, deps));
    }
    case 'history': {
      if (view.entityId === undefined) {
        const entries = entriesBetween(history, 0, Infinity);
        return say(io, renderHistory(`History: ${entries.length} entries, oldest first`, entries));
      }
      if (parseId(view.entityId) === null) {
        return refuse(io, `"${view.entityId}" is not an id such as hero-000001 or guild-000001.`, exitCodes.usage);
      }
      const entries = entriesFor(history, view.entityId as EntityId);
      const label = entries[0]?.labels[view.entityId as EntityId];
      const who = label === undefined ? view.entityId : `${label} (${view.entityId})`;
      return say(io, renderHistory(`History of ${who}: ${entries.length} entries, newest first`, entries));
    }
  }
}

// ── save and load ────────────────────────────────────────────────────────────────────────────

/**
 * `save --as <file>`: the save, checked by loading it, written to `file` as canonical JSON. A
 * save that does not load is not copied; one that does is copied byte for byte.
 */
function saveAs(file: string, { io, content, path }: Context): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const target = savePath(file, io.cwd, io.env);
  writeSave(target, opened.document);
  return say(io, [`Saved ${path} as ${target}.`]);
}

/** `load <file>`: `file` checked by loading it, then made the save. A refusal changes nothing. */
function load(file: string, { io, content, path }: Context): Exit {
  const source = savePath(file, io.cwd, io.env);
  const opened = open(io, source, content);
  if (opened === undefined) return exitCodes.refused;
  writeSave(path, opened.document);
  return say(io, [`Loaded ${source} into ${path}.`, '', ...renderSummary(opened.document, opened.deps)]);
}

// ── Node ─────────────────────────────────────────────────────────────────────────────────────

/** The real terminal, working directory, environment, clock and `Math.random`. */
export function nodeIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    env: process.env,
    now: () => new Date(),
    random: Math.random,
  };
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2), nodeIo());
