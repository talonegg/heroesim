// The Facilities' and their grades' commands (DL-297), the one core under both of their
// adapters: the command line, `npm run edit -- facilities …` (`cli.ts`), and the page's API,
// `/api/facilities/…` (`server.ts`), as the Quest templates' are (`quests-commands.ts`, DL-267). Each
// command takes its input as one object, which the command line reads from its words and flags and the
// API from its body or its query, and gives the same JSON through both, the command line's lines
// beside it. A refused change names its reason and holds nothing.

import { boundsWords, facilityEffects } from '@heroesim/content';
import { facilityEffectKinds } from '@heroesim/engine/content';
import type { Edit } from './content-files.js';
import { FacilitiesEditor, type FacilityView } from './facilities-editor.js';
import { facilitiesDoctor, facilitiesDoctorText } from './facilities-doctor.js';
import { isObject } from './facilities-kind.js';
import type { Row } from './kind.js';
import type { TestRunner } from './tests-run.js';
import { UsageError } from './usage-error.js';

export const family = 'facilities';

/** The commands, a part's two words apart (`grade add`), as the API's path takes them (`grade/add`). */
export const commands: readonly string[] = [
  'list',
  'show',
  'add',
  'change',
  'remove',
  'grade add',
  'grade change',
  'grade remove',
  'effect add',
  'effect set',
  'effect remove',
  'forms',
  'pending',
  'discard',
  'finish',
  'doctor',
  'recover',
];

/** The commands that change nothing, which the API answers to a GET. */
export const reads: readonly string[] = ['list', 'show', 'forms', 'pending', 'doctor'];

/** A part's first word: `grade`, `effect`. */
export const parts: readonly string[] = [...new Set(commands.filter((command) => command.includes(' ')).map((command) => command.split(' ')[0] ?? ''))];

/**
 * A command's input: `key` is a Facility's; `grade` a grade's number; `kind` an effect's; `amounts`
 * the values of a new effect from grade 0 up; `value` one value; `values` are a row's fields.
 */
export interface CommandInput {
  key?: unknown;
  grade?: unknown;
  kind?: unknown;
  amounts?: unknown;
  value?: unknown;
  values?: unknown;
  force?: unknown;
}

/** What a command gives: its exit code, its JSON and its lines for a person. */
export interface Result {
  code: number;
  json: unknown;
  text: string[];
}

/** What a command is given besides its input: the test run "Finish" waits on, and where its lines go. */
export interface CommandDeps {
  runTests: TestRunner;
  onLine: (line: string) => void;
}

/** The input's checks, each refusal a usage's: `facilities <command> wants …`. */
function reader(command: string, input: CommandInput) {
  const wants = (what: string): never => {
    throw new UsageError(`${family} ${command} wants ${what}`);
  };
  return {
    text(name: keyof CommandInput, what: string): string {
      const value = input[name];
      return typeof value === 'string' && value !== '' ? value : wants(what);
    },
    optionalText(name: keyof CommandInput, what: string): string | undefined {
      return input[name] === undefined ? undefined : this.text(name, what);
    },
    whole(name: keyof CommandInput, what: string): number {
      const value = input[name];
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : wants(`${what}, a whole number${value === undefined ? '' : `, not ${JSON.stringify(value)}`}`);
    },
    values(what: string): Row {
      const value = input.values ?? {};
      if (!isObject(value)) return wants(`${what} as an object of fields`);
      if (Object.keys(value).length === 0) return wants(what);
      return value;
    },
    amounts(): unknown[] {
      const value = input.amounts;
      return Array.isArray(value) && value.length > 0 ? value : wants('a value for each grade from 0 up: <facility> <effect> <value> …');
    },
  };
}

const json = (value: unknown): string => JSON.stringify(value);

/** An effects object in words: `healFactor 1, trainingXp 0`, or `no effect`. */
function effectsWords(effects: unknown): string {
  const entries = isObject(effects) ? Object.entries(effects) : [];
  return entries.length === 0 ? 'no effect' : entries.map(([kind, value]) => `${kind} ${json(value)}`).join(', ');
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A grade in a line. */
function gradeLine(key: string, grade: unknown, row: Row): string {
  return `${String(grade)} ${key} "${String(row.name)}", cost ${String(row.cost)} Silver: ${effectsWords(row.effects)}`;
}

/** A row in a line: a Facility's name, upkeep, effects at grade 0 and grades; a grade's. */
export function rowLine(view: FacilityView): string {
  const { row } = view;
  const pending = view.pending === null ? '' : ` (${view.pending}, pending)`;
  if (view.list === 'grades') return `${gradeLine(view.key, row.grade, row)}${pending}`;
  return `${view.key} — ${String(row.name)}${row.plural === true ? ' (plural)' : ''}: upkeep ${String(row.upkeep)} Silver; ${effectsWords(row.effects)}; ${count(view.grades?.length ?? 0, 'grade')}${pending}`;
}

/** A Facility as `show` gives it in lines: its line, its grades from 0, and where it is used. */
function showLines(view: FacilityView): string[] {
  if (view.list === 'grades') return [rowLine(view)];
  return [
    rowLine(view),
    'Grades:',
    `  0 (the Facility's own): ${effectsWords(view.row.effects)}`,
    ...(view.grades ?? []).map((each) => `  ${gradeLine(each.key, each.grade, each.row)}`),
    'Uses:',
    ...((view.uses ?? []).length === 0 ? ['  No grade or build order names it'] : (view.uses ?? []).map((use) => `  ${use.at}`)),
  ];
}

/** The effects' forms in lines, each with its bounds. */
function formsLines(forms: readonly { list: string; title: string; fields: readonly { name: string; type: string; choices?: readonly string[] }[]; effects: readonly { kind: string }[] }[]): string[] {
  return forms.flatMap((form) => [
    `${form.title}:`,
    ...form.fields.map((field) => `  ${field.name}: ${field.type}${field.choices === undefined ? '' : ` (${field.choices.join(', ') || 'no Facility'})`}`),
    '  effects, each a number, any one the row has:',
    ...form.effects.map((effect) => {
      const described = facilityEffects[effect.kind as keyof typeof facilityEffects];
      return `    ${effect.kind}: ${described.label}, ${boundsWords(described)}`;
    }),
  ]);
}

/** A change held, or not: its JSON and its line. */
function changed(editor: FacilitiesEditor, what: string, view: FacilityView & { unchanged?: true }): Result {
  const { unchanged, ...row } = view;
  return {
    code: 0,
    json: { ok: true, row, pending: editor.edits().length, ...(unchanged === true ? { unchanged } : {}) },
    text: [unchanged === true ? `Nothing to change, nothing held: ${rowLine(row)}` : `${what}, pending: ${rowLine(row)}`],
  };
}

function editLine(edit: Edit, index: number): string {
  return `${index + 1}. ${edit.op} ${edit.list} ${edit.key}`;
}

/** Runs `command` on `input`. A refusal is thrown: `Refused`, `Busy`, `UsageError`, or "Finish"'s `Undone` and `NotUndone`. */
export async function runCommand(command: string, input: CommandInput, editor: FacilitiesEditor, deps: CommandDeps): Promise<Result> {
  if (!commands.includes(command)) {
    const known = commands.join(', ');
    throw new UsageError(command === '' ? `${family} wants a command: ${known}` : `${command} is not a command of ${family}: ${known}`);
  }
  const read = reader(command, input);
  const key = (): string => read.text('key', 'a Facility');
  switch (command) {
    case 'list': {
      const rows = editor.rows();
      return {
        code: 0,
        json: { rows, pending: editor.edits().length },
        text: rows.length === 0 ? ['No Facility'] : rows.flatMap((view) => [rowLine(view), ...(view.grades ?? []).map((each) => `  ${gradeLine(each.key, each.grade, each.row)}`)]),
      };
    }
    case 'show': {
      const view = editor.show('facilities', key());
      return { code: 0, json: view, text: showLines(view) };
    }
    case 'add': {
      const view = editor.add(key(), read.values('the fields of the Facility, as --row <json or @file> or <field>=<value>: name, plural, upkeep, effects'));
      return { code: 0, json: { ok: true, row: view, pending: editor.edits().length }, text: [`Added, pending: ${rowLine(view)}`] };
    }
    case 'change':
      return changed(editor, 'Changed', editor.change(key(), read.values('a field to change, as --row <json or @file> or <field>=<value>')));
    case 'remove': {
      const removed = editor.remove(key());
      return { code: 0, json: { ok: true, ...removed, pending: editor.edits().length }, text: [`Removed, pending: ${removed.key}`] };
    }
    case 'grade add': {
      const view = editor.gradeAdd(key(), read.values("the grade's fields, as --row <json or @file> or <field>=<value>: name, cost, effects"));
      return { code: 0, json: { ok: true, row: view, pending: editor.edits().length }, text: [`Added, pending: ${rowLine(view)}`] };
    }
    case 'grade change':
      return changed(editor, 'Grade changed', editor.gradeChange(key(), read.whole('grade', "the grade's number"), read.values('a field to change, as --row <json or @file> or <field>=<value>')));
    case 'grade remove': {
      const removed = editor.gradeRemove(key(), read.whole('grade', "the grade's number"));
      return { code: 0, json: { ok: true, ...removed, pending: editor.edits().length }, text: [`Removed, pending: ${removed.key}`] };
    }
    case 'effect add': {
      const kind = read.text('kind', `an effect: ${facilityEffectKinds.join(', ')}`);
      const view = editor.effectAdd(key(), kind, read.amounts());
      return changed(editor, 'Effect added', view);
    }
    case 'effect set': {
      const kind = read.text('kind', `an effect: ${facilityEffectKinds.join(', ')}`);
      const grade = read.whole('grade', 'a grade, 0 for the Facility itself');
      if (input.value === undefined) throw new UsageError(`${family} ${command} wants a value`);
      return changed(editor, 'Effect set', editor.effectSet(key(), kind, grade, input.value));
    }
    case 'effect remove': {
      const kind = read.text('kind', `an effect: ${facilityEffectKinds.join(', ')}`);
      return changed(editor, 'Effect removed', editor.effectRemove(key(), kind));
    }
    case 'forms': {
      const forms = editor.forms();
      return { code: 0, json: { forms }, text: formsLines(forms) };
    }
    case 'pending': {
      const edits = editor.edits();
      return { code: 0, json: { edits }, text: edits.length === 0 ? ['No pending edits'] : edits.map(editLine) };
    }
    case 'discard': {
      const result = editor.discard(read.optionalText('key', 'a Facility, or none'));
      return { code: 0, json: { ok: true, ...result }, text: [`Discarded ${result.discarded}; ${result.left} pending`] };
    }
    case 'finish': {
      const finished = await editor.finish(deps.runTests, deps.onLine);
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
      const report = facilitiesDoctor(editor.root);
      editor.recovered = report.finish.recovered;
      return { code: report.ok ? 0 : 1, json: report, text: facilitiesDoctorText(report) };
    }
    case 'recover': {
      const recovered = editor.recover({ force: input.force === true });
      return {
        code: 0,
        json: { ok: true, recovered },
        text: [recovered.length === 0 ? 'No "Finish" was cut off: nothing to put back' : `A "Finish" was cut off: ${recovered.length} files are put back as they were`],
      };
    }
  }
  throw new UsageError(`${command} is not a command of ${family}`);
}

/** The commands that read fields: a row's. */
const withValues: readonly string[] = ['add', 'change', 'grade add', 'grade change'];

/** A value given on the command line: JSON where it is JSON (`25`, `true`, `{"healFactor":1}`), else text. */
function valueOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A positional number: a number where it reads as one, else the word, for the command to refuse naming it. */
function numberOf(word: string | undefined): unknown {
  return word !== undefined && /^-?\d+(\.\d+)?$/.test(word) ? Number(word) : word;
}

/**
 * A command's input from its command line: its words after the command (a part's command its two
 * words), `<field>=<value>` words read as JSON where they are JSON, and the row's fields from `--row`
 * and the flags.
 */
export function inputFromLine(command: string, words: readonly string[], line: { fields: Row; force: boolean }): CommandInput {
  const split = words.findIndex((word) => word.includes('='));
  const positional = split < 0 ? [...words] : words.slice(0, split);
  const values: Row = { ...line.fields };
  for (const word of split < 0 ? [] : words.slice(split)) {
    const at = word.indexOf('=');
    if (at <= 0) throw new UsageError(`${family} ${command} wants each field as <field>=<value>, not "${word}"`);
    values[word.slice(0, at)] = valueOf(word.slice(at + 1));
  }
  if (!withValues.includes(command) && Object.keys(values).length > 0) throw new UsageError(`${family} ${command} takes no field: ${Object.keys(values).join(', ')}`);
  const input: CommandInput = { values, ...(line.force ? { force: true } : {}) };
  const most = (n: number): void => {
    if (positional.length > n) throw new UsageError(`${family} ${command} takes ${n === 0 ? 'no word' : `${n} ${n === 1 ? 'word' : 'words'}`} before its fields, not "${positional.slice(n).join(' ')}"`);
  };
  const [first, second, third, fourth] = positional;
  switch (command) {
    case 'list':
    case 'forms':
    case 'pending':
    case 'finish':
    case 'doctor':
    case 'recover':
      most(0);
      return input;
    case 'show':
    case 'add':
    case 'change':
    case 'remove':
    case 'discard':
    case 'grade add':
      most(1);
      return { ...input, key: first };
    case 'grade change':
    case 'grade remove':
      most(2);
      return { ...input, key: first, grade: numberOf(second) };
    case 'effect add':
      return { ...input, key: first, kind: second, amounts: positional.slice(2).map(numberOf) };
    case 'effect set':
      most(4);
      return { ...input, key: first, kind: second, grade: numberOf(third), value: numberOf(fourth) };
    case 'effect remove':
      most(2);
      return { ...input, key: first, kind: second };
  }
  return input;
}
