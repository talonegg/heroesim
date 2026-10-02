// The content editor's command line (v1.1.4-S12, DL-150 item 7), run as `npm run edit -- traits
// <command>`, the commands under its page and the Trait skills' only way to change a Trait. As the
// portrait tool's, every command takes `--root <dir>`, the repository to work on (this one by
// default), and `--json`, which prints one JSON object on stdout for a skill to read. The exit code is
// 0 for success, 1 for a check that failed or a change refused or undone, and 2 for a command line
// the editor cannot read. The commands are in this package's README.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NotUndone, Undone } from '@heroesim/portraits';
import { repositoryRoot } from './content-files.js';
import { doctor, doctorText } from './doctor.js';
import { Editor, Refused, type RowView } from './editor.js';
import type { Use } from './kind.js';
import { npmTest, type TestRunner } from './tests-run.js';
import { writeTraitsDoc } from './traits-doc.js';

export const usage = `Usage: npm run edit -- [traits <command>] [--root <dir>] [--json]

  (no command)                    Open the editor's page, served from this repository
  traits list                     Every Trait of both lists, with the pending edits made
  traits show <key>               One Trait: its fields, effects, uses and the rules that read it
  traits find <text>              The Traits whose key, name, effects or uses hold the text
  traits uses <key>               Every use of a Trait in content, and the rules that read it
  traits add <list> <key>         Add a Trait to guildmaster or hero, pending; its key is fixed
          --name <n> [--cost <n>] [--excludes a,b | --no-excludes] [--effects <json>]
          [--row <json or @file>]
  traits change <key>             Change a Trait's fields, pending; the same flags as add
  traits remove <key>             Remove a Trait, pending; refused while it is used, naming each use
  traits pending                  The pending edits
  traits discard [<key>]          Drop the pending edits, or one Trait's
  traits finish                   Write the pending edits, raise the content version, run npm test;
                                  every file is put back if a test fails
  traits doctor                   The drift and freshness checks, the content's checks
  traits doc                      Write docs/agents/traits.md's register part from the register

Exit codes: 0 done, 1 failed or refused (nothing changed), 2 a command line not understood.`;

/** Where a command writes. */
export interface Io {
  out(text: string): void;
  err(text: string): void;
}

/** What a command is given besides its line: the test run "Finish" waits on (`npm test` by default). */
export interface Deps {
  runTests: TestRunner;
}

export class UsageError extends Error {}

export interface Parsed {
  kind: string;
  command: string;
  args: string[];
  json: boolean;
  root: string;
  port: number;
  fields: Record<string, unknown>;
}

function parseJson(flag: string, text: string): unknown {
  const source = text.startsWith('@') ? readFileSync(path.resolve(text.slice(1)), 'utf8') : text;
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new UsageError(`${flag} wants JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parse(argv: readonly string[]): Parsed {
  const parsed: Parsed = { kind: '', command: '', args: [], json: false, root: repositoryRoot, port: 4180, fields: {} };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`${flag} wants a value`);
    return next;
  };
  let row: Record<string, unknown> = {};
  const flags: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--json') parsed.json = true;
    else if (arg === '--root') parsed.root = path.resolve(value(arg, index++));
    else if (arg === '--port') {
      parsed.port = Number(value(arg, index++));
      if (!Number.isInteger(parsed.port) || parsed.port < 0 || parsed.port > 65535) throw new UsageError('--port wants a port number');
    } else if (arg === '--name') flags.name = value(arg, index++);
    else if (arg === '--cost') {
      const cost = Number(value(arg, index++));
      if (!Number.isInteger(cost)) throw new UsageError('--cost wants a whole number');
      flags.cost = cost;
    } else if (arg === '--excludes') {
      flags.excludes = value(arg, index++)
        .split(',')
        .map((each) => each.trim())
        .filter((each) => each !== '');
    } else if (arg === '--no-excludes') flags.excludes = [];
    else if (arg === '--effects') flags.effects = parseJson(arg, value(arg, index++));
    else if (arg === '--row') {
      const given = parseJson(arg, value(arg, index++));
      if (typeof given !== 'object' || given === null || Array.isArray(given)) throw new UsageError('--row wants a JSON object of fields');
      row = given as Record<string, unknown>;
    } else if (arg.startsWith('--')) throw new UsageError(`${arg} is not a flag the editor knows`);
    else if (parsed.kind === '') parsed.kind = arg;
    else if (parsed.command === '') parsed.command = arg;
    else parsed.args.push(arg);
  }
  parsed.fields = { ...row, ...flags };
  if (!existsSync(parsed.root)) throw new UsageError(`--root ${parsed.root} does not exist`);
  return parsed;
}

function arg(options: Parsed, index: number, what: string): string {
  const value = options.args[index];
  if (value === undefined) throw new UsageError(`traits ${options.command} wants ${what}`);
  return value;
}

function rowLine(view: RowView): string {
  const cost = typeof view.row.cost === 'number' ? `, cost ${view.row.cost}` : '';
  const excludes = Array.isArray(view.row.excludes) && view.row.excludes.length > 0 ? `; excludes ${view.row.excludes.join(', ')}` : '';
  const pending = view.pending === null ? '' : ` (${view.pending}, pending)`;
  return `${view.key} — ${String(view.row.name)}${cost}: ${view.effects.join(', ') || 'no effect'}${excludes}; ${view.uses.length} ${view.uses.length === 1 ? 'use' : 'uses'}${pending}`;
}

function useLines(uses: readonly Use[]): string[] {
  return uses.length === 0 ? ['  No use in content'] : uses.map((use) => `  ${use.at}${use.blocksRemoval ? '' : ' (taken out by the editor on removal)'}`);
}

type Result = { code: number; json: unknown; text: string[] };

async function dispatch(options: Parsed, deps: Deps, io: Io): Promise<Result> {
  if (options.kind !== 'traits') throw new UsageError(options.kind === '' ? 'a kind is wanted: traits' : `${options.kind} is not a kind the editor knows: traits`);
  const editor = new Editor(options.root);
  switch (options.command) {
    case 'list': {
      const rows = editor.rows();
      const text = editor.kind.lists.flatMap((list) => [`${list.title}:`, ...rows.filter((view) => view.list === list.id).map((view) => `  ${rowLine(view)}`)]);
      return { code: 0, json: { rows, pending: editor.edits().length }, text };
    }
    case 'show': {
      const view = editor.show(arg(options, 0, 'a key'));
      const text = [rowLine(view), 'Uses:', ...useLines(view.uses), 'Read by:', ...view.rules.map((rule) => `  ${rule.id}: ${rule.title}`)];
      return { code: 0, json: view, text };
    }
    case 'find': {
      const text = options.args.join(' ');
      if (text === '') throw new UsageError('traits find wants some text');
      const found = editor.find(text);
      return { code: 0, json: { text, found }, text: found.length === 0 ? [`No Trait holds "${text}"`] : found.map((each) => `${each.key} (${each.list}) — ${String(each.name)}: ${each.matched.join(', ')}`) };
    }
    case 'uses': {
      const found = editor.uses(arg(options, 0, 'a key'));
      return { code: 0, json: found, text: [`${found.key} (${found.list}):`, ...useLines(found.uses), 'Read by:', ...found.rules.map((rule) => `  ${rule.id}: ${rule.title}`)] };
    }
    case 'add': {
      const view = editor.add(arg(options, 0, 'a list, guildmaster or hero'), arg(options, 1, 'a key'), options.fields);
      return { code: 0, json: { ok: true, row: view, pending: editor.edits().length }, text: [`Added, pending: ${rowLine(view)}`] };
    }
    case 'change': {
      if (Object.keys(options.fields).length === 0) throw new UsageError('traits change wants a field to change: --name, --cost, --excludes, --effects or --row');
      const view = editor.change(arg(options, 0, 'a key'), options.fields);
      return { code: 0, json: { ok: true, row: view, pending: editor.edits().length }, text: [`Changed, pending: ${rowLine(view)}`] };
    }
    case 'remove': {
      const removed = editor.remove(arg(options, 0, 'a key'));
      return {
        code: 0,
        json: { ok: true, ...removed, pending: editor.edits().length },
        text: [`Removed, pending: ${removed.key}`, ...removed.stripped.map((use) => `  Taken out of ${use.at}`)],
      };
    }
    case 'pending': {
      const edits = editor.edits();
      return { code: 0, json: { edits }, text: edits.length === 0 ? ['No pending edits'] : edits.map((edit, index) => `${index + 1}. ${edit.op} ${edit.list} ${edit.key}`) };
    }
    case 'discard': {
      const result = editor.discard(options.args[0]);
      return { code: 0, json: { ok: true, ...result }, text: [`Discarded ${result.discarded}; ${result.left} pending`] };
    }
    case 'finish': {
      const finished = await editor.finish(deps.runTests, options.json ? () => {} : (line) => io.err(line));
      const text =
        finished.edits === 0
          ? ['No pending edits: nothing to finish']
          : [
              `Finished ${finished.edits} ${finished.edits === 1 ? 'edit' : 'edits'}: ${finished.changed.join(', ')}`,
              ...(finished.contentVersion === null ? [] : [`Content version ${finished.contentVersion.from} → ${finished.contentVersion.to}`]),
              'The tests passed. Nothing is committed: read `git diff`, and commit it yourself.',
            ];
      return { code: 0, json: finished, text };
    }
    case 'doctor': {
      const report = doctor(options.root);
      return { code: report.ok ? 0 : 1, json: report, text: doctorText(report) };
    }
    case 'doc': {
      const written = writeTraitsDoc(options.root);
      return { code: 0, json: { ok: true, ...written }, text: [written.changed ? `Wrote ${written.file}` : `${written.file} is fresh already`] };
    }
    case '':
      throw new UsageError('traits wants a command');
    default:
      throw new UsageError(`${options.command} is not a command the editor knows`);
  }
}

/** Runs a command line, writing to `io`, and gives the exit code. */
export async function run(argv: readonly string[], io: Io, deps: Deps = { runTests: npmTest }): Promise<number> {
  let options: Parsed | null = null;
  try {
    options = parse(argv);
    if (options.kind === 'help' || argv.includes('--help')) {
      io.out(usage);
      return 0;
    }
    const result = await dispatch(options, deps, io);
    if (options.json) io.out(JSON.stringify(result.json, null, 2));
    else for (const line of result.text) (result.code === 0 ? io.out : io.err)(line);
    return result.code;
  } catch (error) {
    const json = options?.json ?? argv.includes('--json');
    const code = error instanceof UsageError ? 2 : 1;
    const problems =
      error instanceof Refused || error instanceof Undone
        ? [...error.problems]
        : error instanceof NotUndone
          ? [...error.problems, ...error.left.map((file) => `not put back: ${file}`)]
          : [error instanceof Error ? error.message : String(error)];
    const kind = error instanceof UsageError ? 'usage' : error instanceof Refused ? 'refused' : error instanceof Undone ? 'undone' : error instanceof NotUndone ? 'not-undone' : 'failed';
    if (json) io.out(JSON.stringify({ ok: false, kind, problems, ...(error instanceof Refused && error.uses.length > 0 ? { uses: error.uses } : {}) }, null, 2));
    else {
      for (const problem of problems) io.err(problem);
      if (code === 2) io.err(usage);
    }
    return code;
  }
}
