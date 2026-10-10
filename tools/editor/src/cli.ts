// The content editor's command line (v1.1.4-S12, DL-150 item 7), run as `npm run edit -- traits
// <command>`, the commands under its page and the Trait skills' only way to change a Trait, and as
// `npm run edit -- config <command>`, the only way to change a tuning value (v1.1.6-S18, DL-204).
// As the portrait tool's, every command takes `--root <dir>`, the repository to work on (this one by
// default), and `--json`, which prints one JSON object on stdout for a skill to read. The exit code is
// 0 for success, 1 for a check that failed or a change refused or undone, and 2 for a command line
// the editor cannot read. The commands are in this package's README.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NotUndone, Undone } from '@heroesim/content/write';
import { ConfigEditor, shownValue, type SectionView } from './config-kind.js';
import { repositoryRoot } from './content-files.js';
import { doctor, doctorText } from './doctor.js';
import { Editor, Refused, type RowView } from './editor.js';
import { Busy } from './finish-journal.js';
import type { Use } from './kind.js';
import { npmTest, type TestRunner } from './tests-run.js';
import { writeTraitsDoc } from './traits-doc.js';

export const usage = `Usage: npm run edit -- [traits <command> | config <command>] [--root <dir>] [--json]

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
  traits assign <key> <entry> [<field>=<value> ...] [--target <json or @file>]
                                  Add a use of a Trait in other content, pending, through the
                                  register's entry (docs/agents/traits-register.md names each, and its fields)
  traits unassign <key> <entry> <at>
                                  Take a use out, pending: <at> as \`traits uses\` gives it
  traits update <key> <entry> <at> [<field>=<value> ...] [--target <json or @file>]
                                  Change a use in place, pending: its chance, say, or another value
                                  its entry names (docs/agents/traits-register.md); <at> as \`traits uses\` gives it
  traits pending                  The pending edits
  traits discard [<key>]          Drop the pending edits, or one Trait's
  traits finish                   Write the pending edits, raise the content version, run npm test;
                                  every file is put back if a test fails
  traits doctor                   The drift and freshness checks, the content's checks
  traits recover [--force]        Put back the files of a "Finish" cut off (every command does first);
                                  --force where no "Finish" runs but its journal's process number is
                                  held by another process
  traits doc                      Write docs/agents/traits-register.md from the register

  config show [<section>]         The tuning values, engine/src/config.json's, by section, with the
                                  pending edits made
  config set <setting> <value>    Set a tuning value, pending, checked with the engine's checkConfig;
                                  <value> read as JSON where it is JSON, else as text
  config pending                  The pending edits
  config discard [<setting>]      Drop the pending edits, or one setting's
  config finish --reason <why>    Write the pending edits, raise the config version with a line of
                                  its changelog saying why, run npm test; the file is put back if a
                                  test fails (docs/agents/config.md)

A skill runs them as \`npm run --silent edit -- traits <command> --json\`, so that stdout is the JSON alone.

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
  /** `recover --force` (v1.1.4-S14). */
  force: boolean;
  root: string;
  port: number;
  fields: Record<string, unknown>;
  /** An assignment's target, or an update's values, from `--target`; its `<field>=<value>` words are read by the command. */
  target: Record<string, unknown>;
  /** Why `config finish` raises the config version (v1.1.6-S18); `null` where not given. */
  reason: string | null;
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
  const parsed: Parsed = { kind: '', command: '', args: [], json: false, force: false, root: repositoryRoot, port: 4180, fields: {}, target: {}, reason: null };
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
    else if (arg === '--force') parsed.force = true;
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
    } else if (arg === '--target') {
      const given = parseJson(arg, value(arg, index++));
      if (typeof given !== 'object' || given === null || Array.isArray(given)) throw new UsageError("--target wants a JSON object of the target's fields");
      parsed.target = given as Record<string, unknown>;
    } else if (arg === '--reason') parsed.reason = value(arg, index++);
    else if (arg.startsWith('--')) throw new UsageError(`${arg} is not a flag the editor knows`);
    else if (parsed.kind === '') parsed.kind = arg;
    else if (parsed.command === '') parsed.command = arg;
    else parsed.args.push(arg);
  }
  parsed.fields = { ...row, ...flags };
  if (parsed.force && parsed.command !== 'recover') throw new UsageError('--force is traits recover\'s alone');
  if (parsed.reason !== null && !(parsed.kind === 'config' && parsed.command === 'finish')) throw new UsageError("--reason is config finish's alone");
  if (!existsSync(parsed.root)) throw new UsageError(`--root ${parsed.root} does not exist`);
  // "Finish" runs `npm test` in the root, which would climb to a package.json above one without its own.
  if (!existsSync(path.join(parsed.root, 'package.json'))) throw new UsageError(`--root ${parsed.root} holds no package.json: it is not a copy of the repository`);
  return parsed;
}

function arg(options: Parsed, index: number, what: string): string {
  const value = options.args[index];
  if (value === undefined) throw new UsageError(`${options.kind} ${options.command} wants ${what}`);
  return value;
}

/** A value given on the command line: JSON where it is JSON (`25`, `0.5`, `{"female":1,"male":2}`), else text (`warm`). */
function valueOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * An assignment's target, or an update's values (v1.1.6-S4): `--target`'s fields, then each
 * `<field>=<value>` word, its value read as JSON
 * where it is JSON (`chance=0.05`, `among=["where","party",["class","mage"]]`) and as text where not
 * (`sentence={He} limps.`, `path=checks.0.score.1`).
 */
function targetOf(options: Parsed, words: readonly string[]): Record<string, unknown> {
  const target: Record<string, unknown> = { ...options.target };
  for (const word of words) {
    const split = word.indexOf('=');
    if (split <= 0) throw new UsageError(`traits ${options.command} wants each field as <field>=<value>, not "${word}"`);
    const text = word.slice(split + 1);
    let value: unknown = text;
    try {
      value = JSON.parse(text);
    } catch {
      // Text, as written.
    }
    target[word.slice(0, split)] = value;
  }
  return target;
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

function settingLine(view: SectionView['settings'][number]): string {
  return `  ${view.setting} ${shownValue(view.value)}${view.pending ? ` (pending; ${shownValue(view.was)} in the file)` : ''}`;
}

/** The config kind's commands (v1.1.6-S18, DL-186 item 15, DL-204). */
async function dispatchConfig(options: Parsed, deps: Deps, io: Io, editor: ConfigEditor): Promise<Result> {
  switch (options.command) {
    case 'show': {
      const sections = editor.show(options.args[0]);
      const pending = editor.edits().length;
      return { code: 0, json: { sections, pending }, text: sections.flatMap((view) => [`${view.section}:`, ...view.settings.map(settingLine)]) };
    }
    case 'set': {
      const setting = arg(options, 0, 'a setting');
      const text = options.args.slice(1).join(' ');
      if (text === '') throw new UsageError(`config set wants a value for ${setting}`);
      const { unchanged, ...set } = editor.set(setting, valueOf(text));
      const line = unchanged === true ? `Nothing to change, nothing held: ${setting} is ${shownValue(set.value)}` : `Set, pending: ${setting} ${shownValue(set.was)} to ${shownValue(set.value)}, in ${set.section}`;
      return { code: 0, json: { ok: true, ...set, pending: editor.edits().length, ...(unchanged === true ? { unchanged } : {}) }, text: [line] };
    }
    case 'pending': {
      const edits = editor.edits();
      return { code: 0, json: { edits }, text: edits.length === 0 ? ['No pending edits'] : edits.map((edit, index) => `${index + 1}. ${edit.setting} ${shownValue(edit.value)}`) };
    }
    case 'discard': {
      const result = editor.discard(options.args[0]);
      return { code: 0, json: { ok: true, ...result }, text: [`Discarded ${result.discarded}; ${result.left} pending`] };
    }
    case 'finish': {
      if (options.reason === null) throw new UsageError('config finish wants --reason <why>: the config version\'s changelog says why it was raised, citing its decision-log entry');
      const finished = await editor.finish(options.reason, deps.runTests, options.json ? () => {} : (line) => io.err(line));
      const text =
        finished.configVersion === null
          ? ['No pending edits: nothing to finish']
          : [
              `Finished ${finished.edits} ${finished.edits === 1 ? 'edit' : 'edits'}: ${finished.changed.join(', ')}`,
              `Config version ${finished.configVersion.from} → ${finished.configVersion.to}`,
              'The tests passed. Nothing is committed: read `git diff`, and commit it yourself.',
            ];
      return { code: 0, json: finished, text };
    }
    case '':
      throw new UsageError('config wants a command: show, set, pending, discard or finish');
    default:
      throw new UsageError(`${options.command} is not a command of config: show, set, pending, discard or finish`);
  }
}

async function dispatch(options: Parsed, deps: Deps, io: Io, editor: Editor): Promise<Result> {
  if (options.kind !== 'traits') throw new UsageError(options.kind === '' ? 'a kind is wanted: traits or config' : `${options.kind} is not a kind the editor knows: traits or config`);
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
      const { unchanged, ...view } = editor.change(arg(options, 0, 'a key'), options.fields);
      return {
        code: 0,
        json: { ok: true, row: view, pending: editor.edits().length, ...(unchanged === true ? { unchanged } : {}) },
        text: [unchanged === true ? `Nothing to change, nothing held: ${rowLine(view)}` : `Changed, pending: ${rowLine(view)}`],
      };
    }
    case 'remove': {
      const removed = editor.remove(arg(options, 0, 'a key'));
      return {
        code: 0,
        json: { ok: true, ...removed, pending: editor.edits().length },
        text: [`Removed, pending: ${removed.key}`, ...removed.stripped.map((use) => `  Taken out of ${use.at}`)],
      };
    }
    case 'assign': {
      const key = arg(options, 0, 'a key');
      const entry = arg(options, 1, `an entry of the register: ${editor.kind.useEntries().map((each) => each.id).join(', ')}`);
      const assigned = editor.assign(key, entry, targetOf(options, options.args.slice(2)));
      return {
        code: 0,
        json: { ok: true, ...assigned, pending: editor.edits().length },
        // Every add refuses a use already there (the verification of DL-163), so each names its use (v1.1.4-S14).
        text: [`Assigned, pending: ${key} in ${entry}`, ...assigned.added.map((use) => `  Now used at ${use.at}`)],
      };
    }
    case 'unassign': {
      const key = arg(options, 0, 'a key');
      const entry = arg(options, 1, 'an entry of the register');
      const at = options.args.slice(2).join(' ');
      if (at === '') throw new UsageError('traits unassign wants the place of the use, as `traits uses` gives it');
      const unassigned = editor.unassign(key, entry, at);
      return {
        code: 0,
        json: { ok: true, ...unassigned, pending: editor.edits().length },
        text: [`Unassigned, pending: ${key} no longer used at ${unassigned.at}`, `  ${unassigned.uses.length} ${unassigned.uses.length === 1 ? 'use' : 'uses'} left`],
      };
    }
    case 'update': {
      const key = arg(options, 0, 'a key');
      const entry = arg(options, 1, 'an entry of the register');
      // The place is the words before the first value: a place holds no "=", and may hold a space (`encounters/hold-the-line.json: …`).
      const words = options.args.slice(2);
      const first = words.findIndex((word) => word.includes('='));
      const at = (first < 0 ? words : words.slice(0, first)).join(' ');
      if (at === '') throw new UsageError('traits update wants the place of the use, as `traits uses` gives it');
      const values = targetOf(options, first < 0 ? [] : words.slice(first));
      if (Object.keys(values).length === 0) throw new UsageError('traits update wants a value to change, as <field>=<value> or --target');
      const { unchanged, ...updated } = editor.update(key, entry, at, values);
      return {
        code: 0,
        json: { ok: true, ...updated, pending: editor.edits().length, ...(unchanged === true ? { unchanged } : {}) },
        text: [unchanged === true ? `Nothing to change, nothing held: ${key} at ${updated.at}` : `Updated, pending: ${key} at ${updated.at}`],
      };
    }
    case 'pending': {
      const edits = editor.edits();
      return {
        code: 0,
        json: { edits },
        text: edits.length === 0 ? ['No pending edits'] : edits.map((edit, index) => `${index + 1}. ${edit.op} ${edit.list} ${edit.key}${'entry' in edit ? ` (${edit.entry})` : ''}`),
      };
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
      editor.recovered = report.finish.recovered;
      return { code: report.ok ? 0 : 1, json: report, text: doctorText(report) };
    }
    case 'recover': {
      const recovered = editor.recover({ force: options.force });
      return {
        code: 0,
        json: { ok: true, recovered },
        text: [recovered.length === 0 ? 'No "Finish" was cut off: nothing to put back' : `A "Finish" was cut off: ${recovered.length} files are put back as they were`],
      };
    }
    case 'doc': {
      // Guarded as every command is (v1.1.4-S14): refused while "Finish" runs, and one cut off put back first.
      editor.recover();
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
    const editor = options.kind === 'config' ? new ConfigEditor(options.root) : new Editor(options.root);
    const result = editor instanceof ConfigEditor ? await dispatchConfig(options, deps, io, editor) : await dispatch(options, deps, io, editor);
    // A "Finish" cut off is put back by whatever command came next, which says so.
    if (editor.recovered.length > 0 && options.command !== 'recover') {
      if (typeof result.json === 'object' && result.json !== null) result.json = { ...result.json, recovered: editor.recovered };
      result.text.unshift(`A "Finish" was cut off: ${editor.recovered.length} files are put back as they were`);
    }
    if (options.json) io.out(JSON.stringify(result.json, null, 2));
    else for (const line of result.text) (result.code === 0 ? io.out : io.err)(line);
    return result.code;
  } catch (error) {
    const json = options?.json ?? argv.includes('--json');
    const code = error instanceof UsageError ? 2 : 1;
    const problems =
      error instanceof Refused || error instanceof Undone || error instanceof Busy
        ? [...error.problems]
        : error instanceof NotUndone
          ? [...error.problems, ...error.left.map((file) => `not put back: ${file}`)]
          : [error instanceof Error ? error.message : String(error)];
    const kind = error instanceof UsageError ? 'usage' : error instanceof Busy ? 'busy' : error instanceof Refused ? 'refused' : error instanceof Undone ? 'undone' : error instanceof NotUndone ? 'not-undone' : 'failed';
    if (json) io.out(JSON.stringify({ ok: false, kind, problems, ...(error instanceof Refused && error.uses.length > 0 ? { uses: error.uses } : {}) }, null, 2));
    else {
      for (const problem of problems) io.err(problem);
      if (code === 2) io.err(usage);
    }
    return code;
  }
}
