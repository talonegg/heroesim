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
  advance,
  createWorld,
  defaultConfig,
  entriesBetween,
  entriesFor,
  fastForward,
  parseId,
  playerGuild,
  rebase,
  type ContentSet,
  type EngineDeps,
  type EntityId,
  type Guild,
  type Hero,
  type Module,
  type StopReason,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { ContentError } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import { parseArgs, usage, type Command, type View } from './args.js';
import { buildImprovement } from './commands/build.js';
import { equipGear, unequipGear } from './commands/equip.js';
import { buyItems, renderMarket, sellItems } from './commands/market.js';
import { recruitHero } from './commands/recruit.js';
import { answerOffer, renderOffers, transferHero } from './commands/transfer.js';
import { dispatchParty } from './commands/dispatch.js';
import { previewParty } from './commands/preview.js';
import type { CommandOutcome } from './commands/outcome.js';
import { modulesFor } from './modules.js';
import { narrateStop, renderAdvance } from './narrate.js';
import {
  renderBoard,
  renderGuildmaster,
  renderGuilds,
  renderHall,
  renderHero,
  renderHistory,
  renderPatrons,
  renderPool,
  renderRankings,
  renderRoster,
  renderSummary,
  rowIn,
} from './render.js';
import { playDeps, readSave, savePath, withModules, writeSave } from './saves.js';
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
    const context = {
      io,
      content: loadContent(),
      path: savePath(command.save, io.cwd, io.env),
      modules: modulesFor('modules' in command ? command.modules : undefined),
    };
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
    case 'advance':
      return 'until' in command ? fastForwardTurns(command, context) : advanceTurns(command.turns, context);
    case 'recruit':
      return recruitHero(command.hero, context);
    case 'preview':
      return look(context, (document, deps) => previewParty(command, document, deps));
    case 'dispatch':
      return act(context, (document, deps) => dispatchParty(command, document, deps));
    case 'build':
      return act(context, (document, deps) => buildImprovement(command, document, deps));
    case 'equip':
      return act(context, (document, deps) => equipGear(command, document, deps));
    case 'unequip':
      return act(context, (document, deps) => unequipGear(command, document, deps));
    case 'buy':
      return act(context, (document, deps) => buyItems(command, document, deps));
    case 'sell':
      return act(context, (document, deps) => sellItems(command, document, deps));
    case 'transfer':
      return act(context, (document, deps) => transferHero(command, document, deps));
    case 'accept':
    case 'decline':
      return act(context, (document, deps) => answerOffer(command, document, deps));
    case 'rebase':
      return rebaseRules(context);
    case 'save':
      return saveAs(command.as, context);
    case 'load':
      return load(command.file, context);
  }
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

/**
 * A command that acts within the current Turn (`cli/src/commands/`): opens the save, applies
 * `change` under the save's own deps, and on success writes the new document and prints its lines;
 * on a refusal prints the problem and writes nothing. A game that has ended is refused.
 */
function act(
  { io, content, path }: Context,
  change: (document: WorldDocument, deps: EngineDeps) => CommandOutcome,
): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const ended = over(io, opened.document, noActionAfterTheEnd);
  if (ended !== undefined) return ended;
  const outcome = change(opened.document, opened.deps);
  if (!outcome.ok) return refuse(io, outcome.problem);
  writeSave(path, outcome.document);
  return say(io, outcome.lines);
}

/**
 * A command that only looks (M4-S5's `preview`): opens the save, asks `ask` of it under the save's
 * own deps, and prints its lines or its problem. The save is never written.
 */
function look(
  { io, content, path }: Context,
  ask: (document: WorldDocument, deps: EngineDeps) => { ok: true; lines: string[] } | { ok: false; problem: string },
): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const answer = ask(opened.document, opened.deps);
  return answer.ok ? say(io, answer.lines) : refuse(io, answer.problem);
}

// ── new ──────────────────────────────────────────────────────────────────────────────────────

function newWorld(command: Extract<Command, { name: 'new' }>, { io, content, path, modules }: Context): Exit {
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
    // A new game starts under the current defaults; from then on it plays under its own. Each
    // module installed makes its slice and stream (M8-S4).
    { config: defaultConfig, content, ...withModules(modules) },
  );
  writeSave(path, document);
  return say(io, [
    `Created a world from seed ${seed} and saved it to ${path}.`,
    '',
    ...renderSummary(document, playDeps(document, content, modules)),
  ]);
}

// ── show ─────────────────────────────────────────────────────────────────────────────────────

/** `1 entry`, `0 entries`, `2 entries`: English's one irregular plural among the CLI's counts. */
function entryCount(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
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
    case 'hall': {
      const guild: Guild | undefined =
        view.guildId === undefined ? playerGuild(world) : rowIn(world.guilds, view.guildId);
      if (guild === undefined) {
        return refuse(io, view.guildId === undefined ? `${path} has no player's Guild.` : `${path} has no Guild ${view.guildId}.`);
      }
      return say(io, renderHall(guild, deps));
    }
    case 'pool':
      return say(io, renderPool(document, deps));
    case 'patrons':
      return say(io, renderPatrons(document, deps));
    case 'board':
      return say(io, renderBoard(document, deps));
    case 'rankings':
      return say(io, renderRankings(document, deps, view.by));
    case 'hero': {
      const hero: Hero | undefined = rowIn(world.heroes, view.heroId);
      if (hero === undefined) return refuse(io, `${path} has no Hero ${view.heroId}.`);
      return say(io, renderHero(hero, document, deps));
    }
    case 'guildmaster': {
      const guild: Guild | undefined =
        view.guildId === undefined ? playerGuild(world) : rowIn(world.guilds, view.guildId);
      if (guild === undefined) {
        return refuse(io, view.guildId === undefined ? `${path} has no player's Guild.` : `${path} has no Guild ${view.guildId}.`);
      }
      return say(io, renderGuildmaster(guild, document, deps));
    }
    case 'market':
      return say(io, renderMarket(document, deps));
    case 'offers':
      return say(io, renderOffers(document, deps));
    case 'history': {
      if (view.entityId === undefined) {
        const entries = entriesBetween(history, 0, Infinity);
        return say(io, renderHistory(`History: ${entryCount(entries.length)}, oldest first`, entries));
      }
      if (parseId(view.entityId) === null) {
        return refuse(io, `"${view.entityId}" is not an id such as hero-000001 or guild-000001.`, exitCodes.usage);
      }
      const entries = entriesFor(history, view.entityId as EntityId);
      const label = entries[0]?.labels[view.entityId as EntityId];
      const who = label === undefined ? view.entityId : `${label} (${view.entityId})`;
      return say(io, renderHistory(`History of ${who}: ${entryCount(entries.length)}, newest first`, entries));
    }
  }
}

// ── advance and rebase ───────────────────────────────────────────────────────────────────────

/**
 * The refusal of a Turn, or of an action, after the game's end, or `undefined` while it goes on:
 * once the player's game has ended the world stops as it stands (DL-28), and nothing is written.
 */
export function over(io: CliIo, document: WorldDocument, what = 'No Turn follows.'): Exit | undefined {
  const { ended } = document.world;
  return ended === null ? undefined : refuse(io, `The game ended on Turn ${ended.turn}: ${ended.reason}. ${what}`);
}

/** What `over` says of an action refused after the end (M3 verification, DL-53). */
export const noActionAfterTheEnd = 'Nothing more can be done in it.';

/**
 * `advance [--turns n] [--modules ids]`: plays up to `turns` Turns under the rules the save plays
 * under, with the modules `--modules` installs (M8-S4), stopping early if the game ends or an
 * installed module asks to stop (M8-S2, DL-77), writes the save and prints what happened, and why it
 * stopped when a module asked. A game that has already ended is refused and nothing is written.
 */
function advanceTurns(turns: number, { io, content, path, modules }: Context): Exit {
  const opened = open(io, path, content, modules);
  if (opened === undefined) return exitCodes.refused;
  const { deps } = opened;
  let { document } = opened;
  const refused = over(io, document);
  if (refused !== undefined) return refused;

  const events: TurnEvent[] = [];
  let played = 0;
  let stop: StopReason | null = null;
  while (played < turns && stop === null) {
    const result = advance(document, deps);
    document = result.document;
    events.push(...result.events);
    played += 1;
    stop = result.stoppedBecause;
  }
  writeSave(path, document);
  // An ending has its own line in what is printed; a module's stop is said as fast forward says it.
  const said = stop?.kind === 'module' ? narrateStop(stop, document, turns) : undefined;
  return say(io, renderAdvance(played, events, document, deps, said));
}

/**
 * `advance --until <stops> [--max n] [--modules ids]`: fast forward for the player's Guild under the
 * save's rules (M2-S11, DL-33), with the modules `--modules` installs (M8-S4), at most `max` Turns
 * or, unless given, one year of them (`turnsPerYear`); writes the save and prints why it stopped and
 * what happened. A game already over is refused and nothing is written.
 */
function fastForwardTurns(
  command: Extract<Command, { name: 'advance'; until: unknown }>,
  { io, content, path, modules }: Context,
): Exit {
  const opened = open(io, path, content, modules);
  if (opened === undefined) return exitCodes.refused;
  const { document, deps } = opened;
  const refused = over(io, document);
  if (refused !== undefined) return refused;
  const guild = playerGuild(document.world);
  if (guild === undefined) return refuse(io, `${path} has no player's Guild.`);

  const maxTurns = command.max ?? deps.config.turnsPerYear;
  const result = fastForward(document, { guildId: guild.id, until: command.until, maxTurns }, deps);
  writeSave(path, result.document);
  const played = result.document.world.turn - document.world.turn;
  const stop = narrateStop(result.stoppedBecause, result.document, maxTurns);
  return say(io, renderAdvance(played, result.events, result.document, deps, stop));
}

/**
 * `rebase`: the save adopts this release's `defaultConfig`. Not the play deps `open` gives, whose
 * config is the save's own filled forward and carries the save's `configVersion`: under those
 * every save would already be current. Refused, writing nothing, when it is.
 */
function rebaseRules({ io, content, path }: Context): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const was = opened.document.meta.config.configVersion;
  const result = rebase(opened.document, { config: defaultConfig, content });
  if (!result.ok) {
    return refuse(io, `${path} already plays under this release's rules, configVersion ${was}.`);
  }
  writeSave(path, result.document);
  return say(io, [`Adopted this release's rules: configVersion ${was} to ${result.document.meta.config.configVersion}.`]);
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

/**
 * `load <file> [--modules ids]`: `file` checked by loading it, a module's slice by the module
 * `--modules` installs (M8-S4), then made the save. A refusal changes nothing.
 */
function load(file: string, { io, content, path, modules }: Context): Exit {
  const source = savePath(file, io.cwd, io.env);
  const opened = open(io, source, content, modules);
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
