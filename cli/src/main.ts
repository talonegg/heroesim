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
  applyAction,
  createWorld,
  defaultConfig,
  entriesBetween,
  entriesFor,
  fastForward,
  parseId,
  playerGuild,
  setupRefusal,
  type EngineDeps,
  type EntityId,
  type Guild,
  type Hero,
  type StopReason,
  type TurnEvent,
  type WorldDocument,
  type WorldSetup,
} from '@heroesim/engine';
import { ContentError } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import { heroReading, playerReading, readableSeed, rowOf } from '@heroesim/words';
import { parseArgs, usage, type Command, type View } from './args.js';
import { buildImprovement } from './commands/build.js';
import { nameCaptain } from './commands/captain.js';
import { equipGear, unequipGear } from './commands/equip.js';
import { buyItems, renderMarket, sellItems } from './commands/market.js';
import { recruitHero } from './commands/recruit.js';
import { answerOffer, renderOffers, transferHero } from './commands/transfer.js';
import { dispatchParty } from './commands/dispatch.js';
import { previewParty } from './commands/preview.js';
import { setupRefusalWords, unknownStatWords, unspentStatWords } from './commands/setup.js';
import type { CommandOutcome } from './commands/outcome.js';
import { modulesFor } from './modules.js';
import { refusalLine } from './namer.js';
import { stopLine, renderAdvance } from './advance.js';
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
} from './render.js';
import { savePath, withModules, writeSave } from './saves.js';
import { exitCodes, open, over, refuse, say, type CliIo, type Context, type Exit } from './context.js';

export { exitCodes, type CliIo, type Exit } from './context.js';

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
      return recruitHero(command.hero, command.years, context);
    case 'preview':
      return look(context, (document, deps) => previewParty(command, document, deps));
    case 'dispatch':
      return act(context, command.name, (document, deps) => dispatchParty(command, document, deps));
    case 'build':
      return act(context, command.name, (document, deps) => buildImprovement(command, document, deps));
    case 'captain':
      return act(context, command.name, (document, deps) => nameCaptain(command, document, deps));
    case 'equip':
      return act(context, command.name, (document, deps) => equipGear(command, document, deps));
    case 'unequip':
      return act(context, command.name, (document, deps) => unequipGear(command, document, deps));
    case 'buy':
      return act(context, command.name, (document, deps) => buyItems(command, document, deps));
    case 'sell':
      return act(context, command.name, (document, deps) => sellItems(command, document, deps));
    case 'transfer':
      return act(context, command.name, (document, deps) => transferHero(command, document, deps));
    case 'accept':
    case 'decline':
      return act(context, command.name, (document, deps) => answerOffer(command, document, deps));
    case 'rebase':
      return rebaseRules(context);
    case 'save':
      return saveAs(command.as, context);
    case 'load':
      return load(command.file, context);
  }
}

/**
 * A command that acts within the current Turn (`cli/src/commands/`): opens the save, applies
 * `change` under the save's own deps, and on success writes the new document and prints its lines;
 * on a refusal prints the problem and writes nothing. A game that has ended is refused, `action`
 * its command.
 */
function act(
  { io, content, path }: Context,
  action: Command['name'],
  change: (document: WorldDocument, deps: EngineDeps) => CommandOutcome,
): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const ended = over(io, opened.document, opened.deps, action);
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

/**
 * `new`: the setup from the flags, the names trimmed, checked by the engine's `setupRefusal` under
 * the current defaults (M9-S2) and refused in `new`'s own words as a bad command line, before any
 * save is touched.
 */
function newWorld(command: Extract<Command, { name: 'new' }>, { io, content, path, modules }: Context): Exit {
  const { background, sex, age, traits, birthplace, appearance, biography, portrait, stats } = command;
  const setup: WorldSetup = {
    guildmasterName: command.master.trim(),
    guildName: command.guild.trim(),
    ...(background === undefined ? {} : { backgroundKey: background }),
    ...(sex === undefined ? {} : { guildmasterSex: sex }),
    ...(age === undefined ? {} : { guildmasterAge: age }),
    ...(traits === undefined ? {} : { guildmasterTraitKeys: traits }),
    ...(birthplace === undefined ? {} : { guildmasterBirthplace: birthplace }),
    ...(appearance === undefined ? {} : { guildmasterAppearance: appearance }),
    ...(biography === undefined ? {} : { guildmasterBiography: biography }),
    ...(portrait === undefined ? {} : { guildmasterPortraitKey: portrait }),
    ...(stats === undefined ? {} : { guildmasterStats: stats }),
    createdAt: io.now().toISOString(),
  };
  // A new game starts under the current defaults; from then on it plays under its own. Each
  // module installed makes its slice and stream (M8-S4).
  const deps = { config: defaultConfig, content, ...withModules(modules) };
  // A Stat content lacks counts for nothing in the engine (rule 5), so `new` refuses it first (v1.1.4-S11).
  const unknownStat = stats === undefined ? null : unknownStatWords(stats, content);
  if (unknownStat !== null) return refuse(io, unknownStat, exitCodes.usage);
  const refusal = setupRefusal(setup, deps);
  if (refusal !== null) return refuse(io, setupRefusalWords(refusal, content), exitCodes.usage);

  if (existsSync(path) && !command.force) {
    return refuse(io, `A save already exists at ${path}. Replace it with --force, or name another with --save.`);
  }

  const seed = command.seed ?? readableSeed(() => io.random());
  const { document } = createWorld(seed, setup, deps);
  writeSave(path, document);
  // v1.1.4-S14 (DL-149 item 5): the Stat points `--stats` leaves unspent are lost, and `new` says so.
  const unspent = unspentStatWords(stats, content, deps.config);
  return say(io, [
    `Created a world from seed ${seed} and saved it to ${path}.`,
    ...(unspent === null ? [] : [unspent]),
    '',
    ...renderSummary(document, deps),
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
  // What the player reads the save through, once for the view (DL-241).
  const reading = playerReading(document, deps);
  /** The Guild named, or the player's; a refusal in the refusals' words when the save has no player's Guild (DL-240). */
  const guildOf = (guildId: string | undefined): Guild | Exit => {
    if (guildId === undefined) {
      return reading.guild ?? refuse(io, refusalLine({ action: 'show', reason: 'no-player-guild' }, { world, content, calendar: deps.config }));
    }
    return rowOf(world.guilds, guildId) ?? refuse(io, `${path} has no Guild ${guildId}.`);
  };

  switch (view.kind) {
    case 'summary':
      return say(io, renderSummary(document, deps));
    case 'guilds':
      return say(io, renderGuilds(document, deps));
    case 'roster': {
      const guild = guildOf(view.guildId);
      return typeof guild === 'number' ? guild : say(io, renderRoster(reading, guild));
    }
    case 'hall': {
      const guild = guildOf(view.guildId);
      return typeof guild === 'number' ? guild : say(io, renderHall(guild, deps));
    }
    case 'pool':
      return say(io, renderPool(reading));
    case 'patrons':
      return say(io, renderPatrons(document, deps));
    case 'board':
      return say(io, renderBoard(reading));
    case 'rankings':
      return say(io, renderRankings(document, deps, view.by));
    case 'hero': {
      const hero: Hero | undefined = rowOf(world.heroes, view.heroId);
      if (hero === undefined) return refuse(io, `${path} has no Hero ${view.heroId}.`);
      return say(io, renderHero(heroReading(reading, hero), deps.config));
    }
    case 'guildmaster': {
      const guild = guildOf(view.guildId);
      return typeof guild === 'number' ? guild : say(io, renderGuildmaster(guild, document, deps));
    }
    case 'market':
      return say(io, renderMarket(document, deps));
    case 'offers':
      return say(io, renderOffers(document, deps));
    case 'history': {
      if (view.entityId === undefined) {
        const entries = entriesBetween(history, 0, Infinity);
        return say(io, renderHistory(`History: ${entryCount(entries.length)}, oldest first`, entries, deps.config));
      }
      if (parseId(view.entityId) === null) {
        return refuse(io, `"${view.entityId}" is not an id such as hero-000001 or guild-000001.`, exitCodes.usage);
      }
      const entries = entriesFor(history, view.entityId as EntityId);
      const label = entries[0]?.labels[view.entityId as EntityId];
      const who = label === undefined ? view.entityId : `${label} (${view.entityId})`;
      return say(io, renderHistory(`History of ${who}: ${entryCount(entries.length)}, newest first`, entries, deps.config));
    }
  }
}

// ── advance and rebase ───────────────────────────────────────────────────────────────────────

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
  const refused = over(io, document, deps, 'advance');
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
  const said = stop?.kind === 'module' ? stopLine(stop, document, turns, deps.config) : undefined;
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
  const refused = over(io, document, deps, 'advance');
  if (refused !== undefined) return refused;
  const guild = playerGuild(document.world);
  if (guild === undefined) {
    return refuse(io, refusalLine({ action: 'fastForward', reason: 'no-player-guild' }, { world: document.world, content: deps.content, calendar: deps.config }));
  }

  const maxTurns = command.max ?? deps.config.turnsPerYear;
  const result = fastForward(document, { guildId: guild.id, until: command.until, maxTurns }, deps);
  writeSave(path, result.document);
  const played = result.document.world.turn - document.world.turn;
  const stop = stopLine(result.stoppedBecause, result.document, maxTurns, deps.config);
  return say(io, renderAdvance(played, result.events, result.document, deps, stop));
}

/**
 * `rebase`: the save adopts this release's `defaultConfig` and `configVersion`, through `applyAction`
 * as every action, whatever deps it is given (DL-205). Refused, writing nothing, when the save's
 * `meta.configVersion` is this release's already.
 */
function rebaseRules({ io, content, path }: Context): Exit {
  const opened = open(io, path, content);
  if (opened === undefined) return exitCodes.refused;
  const was = opened.document.meta.configVersion;
  const result = applyAction(opened.document, { kind: 'rebase' }, opened.deps);
  if (!result.ok) {
    return refuse(io, refusalLine(result.rejection, { world: opened.document.world, content, calendar: opened.deps.config }));
  }
  writeSave(path, result.document);
  return say(io, [`Adopted this release's rules: configVersion ${was} to ${result.document.meta.configVersion}.`]);
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
