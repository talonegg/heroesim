// The Quest templates' and Encounters' commands (DL-257 item 8, DL-267), the one core under both of
// their adapters: the command line, `npm run edit -- quests …` and `encounters …` (`cli.ts`), and the
// page's API, `/api/quests/…` and `/api/encounters/…` (`server.ts`). Each command takes its input as
// one object, which the command line reads from its words and flags and the API from its body or its
// query, and gives the same JSON through both, the command line's lines beside it. A refused change
// names its reason and holds nothing.

import type { Edit } from './content-files.js';
import type { Row } from './kind.js';
import { questsDoctor, questsDoctorText } from './quests-doctor.js';
import { QuestsEditor, type QuestView } from './quests-editor.js';
import {
  beatAdded,
  beatChanged,
  beatMoved,
  beatRemoved,
  checkAdded,
  checkChanged,
  checkRemoved,
  consequenceAdded,
  consequenceChanged,
  consequenceRemoved,
  finaleCleared,
  finaleSet,
  overrideCleared,
  overrideSet,
  type QuestList,
} from './quests-kind.js';
import type { TestRunner } from './tests-run.js';
import { UsageError } from './usage-error.js';

/** The two command families, each a list of the kind. */
export type Family = QuestList;

export const families: readonly Family[] = ['quests', 'encounters'];

/** Each family's commands, a part's two words apart (`beat add`), as the API's path takes them (`beat/add`). */
export const commands: Readonly<Record<Family, readonly string[]>> = {
  quests: ['list', 'show', 'add', 'change', 'remove', 'tiers', 'beat add', 'beat change', 'beat move', 'beat remove', 'override set', 'override clear', 'finale set', 'finale clear', 'pending', 'discard', 'finish', 'doctor', 'recover'],
  encounters: ['list', 'show', 'add', 'change', 'remove', 'check add', 'check change', 'check remove', 'consequence add', 'consequence change', 'consequence remove', 'pending', 'discard', 'finish', 'recover'],
};

/** The commands that change nothing, which the API answers to a GET. */
export const reads: readonly string[] = ['list', 'show', 'pending', 'doctor'];

/** A part's first word: `beat`, `override`, `finale`, `check`, `consequence`. */
export const parts: readonly string[] = [...new Set(families.flatMap((family) => commands[family].filter((command) => command.includes(' ')).map((command) => command.split(' ')[0] ?? '')))];

/**
 * A command's input: what each command reads of it is in the README. `values` are a row's, a
 * Beat's, a Check's, a consequence's or a Tier's figures, `null` taking a field out; `pass` is a
 * Check's change's pass formula, `null` taking it out.
 */
export interface CommandInput {
  key?: unknown;
  at?: unknown;
  to?: unknown;
  tier?: unknown;
  tierMin?: unknown;
  tierMax?: unknown;
  encounter?: unknown;
  line?: unknown;
  check?: unknown;
  degree?: unknown;
  values?: unknown;
  figures?: unknown;
  pass?: unknown;
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

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The input's checks, each refusal a usage's: `<family> <command> wants …`. */
function reader(family: Family, command: string, input: CommandInput) {
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
    optionalWhole(name: keyof CommandInput, what: string): number | undefined {
      return input[name] === undefined ? undefined : this.whole(name, what);
    },
    values(what: string, required = true): Row {
      const value = input.values ?? {};
      if (!isObject(value)) return wants(`${what} as an object of fields`);
      if (required && Object.keys(value).length === 0) return wants(what);
      return value;
    },
    names(): string[] {
      const value = input.figures ?? [];
      return Array.isArray(value) && value.every((each) => typeof each === 'string') ? value : wants('the figures to clear, as a list of their names');
    },
  };
}

/** A row in a line: a template's Tiers, Party, Beats and Finale; an Encounter's kind, tags, Checks and where it is used or drawn. */
export function rowLine(view: QuestView): string {
  const { row } = view;
  const pending = view.pending === null ? '' : ` (${view.pending}, pending)`;
  if (view.list === 'quests') {
    const beats = Array.isArray(row.beats) ? row.beats.length : 0;
    const finale = typeof row.finale === 'string' ? ` and the Finale ${row.finale}` : '';
    return `${view.key} — ${String(row.name)}: Tiers ${String(row.tierMin)} to ${String(row.tierMax)}; a Party of at least ${String(row.partySizeMin)}; ${beats} ${beats === 1 ? 'Beat' : 'Beats'}${finale}${pending}`;
  }
  const tags = Array.isArray(row.tags) && row.tags.length > 0 ? `, tagged ${row.tags.join(', ')}` : '';
  const checks = Array.isArray(row.checks) ? row.checks.length : 0;
  const uses = view.uses?.length ?? 0;
  const drawnBy = view.drawnBy?.length ?? 0;
  const finale = view.uses?.some((use) => use.entry === 'finale') === true;
  const drawn = finale ? 'a Finale' : drawnBy === 0 ? 'drawn by no Beat' : `drawn by ${drawnBy} ${drawnBy === 1 ? 'Beat' : 'Beats'}`;
  return `${view.key} — ${String(row.name)}: ${String(row.kind)}${tags}; ${checks} ${checks === 1 ? 'Check' : 'Checks'}; ${uses} ${uses === 1 ? 'use' : 'uses'}; ${drawn}${pending}`;
}

const json = (value: unknown): string => JSON.stringify(value);

/** A row as `show` gives it in lines. */
function showLines(view: QuestView): string[] {
  const { row } = view;
  if (view.list === 'quests') {
    const list = (value: unknown): string => (Array.isArray(value) && value.length > 0 ? value.join(', ') : 'none');
    const tiers = (view.tiers ?? []).map((tier) => {
      const { figures } = tier;
      const played = [...tier.beats.map((index) => `beats.${index}`), ...(tier.finale === null ? [] : [`the Finale ${tier.finale}`])];
      const overridden = tier.overridden.length === 0 ? '' : ` (overrides ${tier.overridden.join(', ')})`;
      return `  Tier ${tier.tier}: difficulty ${figures.difficultyMin} to ${figures.difficultyMax}, Days ${figures.daysMin} to ${figures.daysMax}, plays ${figures.beats} ${figures.beats === 1 ? 'Beat' : 'Beats'}: ${played.join(', ') || 'none'}${overridden}`;
    });
    const beats = (view.beats ?? []).map((beat) => `  ${beat.at} "${beat.line}" — pool ${json(beat.pool)}: ${beat.draws.join(', ') || 'none'}`);
    const requires = isObject(row.requires) && Object.keys(row.requires).length > 0 ? `; requires ${json(row.requires)}` : '';
    return [
      rowLine(view),
      `  Spheres ${list(row.sphereKeys)}; tags ${list(row.tags)}; reward ${String(row.rewardPerDifficulty)} a difficulty; Fame ${String(row.fameEffect)}; Skills ${list(row.skillKeys)}${requires}; Loot table ${String(row.lootTableKey ?? 'none')}${row.weight === undefined ? '' : `; weight ${String(row.weight)}`}`,
      'Tiers:',
      ...tiers,
      'Beats:',
      ...beats,
      typeof row.finale === 'string' ? `Finale: ${row.finale} "${String(row.finaleLine)}"` : 'Finale: none',
    ];
  }
  const checks = (Array.isArray(row.checks) ? row.checks : []).map((check) => {
    const each = isObject(check) ? check : {};
    const { key, name, ...rest } = each;
    return `  ${String(key)} — ${String(name)}: ${json(rest)}`;
  });
  const consequences = isObject(row.consequences)
    ? Object.entries(row.consequences).flatMap(([degree, list]) => (Array.isArray(list) ? (list.length === 0 ? [`  ${degree}: none`] : list.map((each, index) => `  ${degree}.${index} ${json(each)}`)) : []))
    : [];
  return [
    rowLine(view),
    'Checks:',
    ...checks,
    ...(row.pass === undefined ? [] : [`Pass: ${json(row.pass)}`]),
    'Consequences:',
    ...consequences,
    'Uses:',
    ...((view.uses ?? []).length === 0 ? ['  No pool or Finale names it'] : (view.uses ?? []).map((use) => `  ${use.at}`)),
    `Drawn by: ${(view.drawnBy ?? []).join(', ') || 'no Beat'}`,
  ];
}

/** A change held, or not: its JSON and its line. */
function changed(editor: QuestsEditor, what: string, view: QuestView & { unchanged?: true }): Result {
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

/** Runs `family`'s `command` on `input`. A refusal is thrown: `Refused`, `Busy`, `UsageError`, or "Finish"'s `Undone` and `NotUndone`. */
export async function runCommand(family: Family, command: string, input: CommandInput, editor: QuestsEditor, deps: CommandDeps): Promise<Result> {
  if (!commands[family].includes(command)) {
    const known = commands[family].join(', ');
    throw new UsageError(command === '' ? `${family} wants a command: ${known}` : `${command} is not a command of ${family}: ${known}${family === 'encounters' && command === 'doctor' ? ' (`quests doctor` checks both)' : ''}`);
  }
  const read = reader(family, command, input);
  const key = (): string => read.text('key', 'a key');
  switch (command) {
    case 'list': {
      const rows = editor.rows(family);
      return { code: 0, json: { rows, pending: editor.edits().length }, text: rows.length === 0 ? [`No ${family === 'quests' ? 'Quest template' : 'Encounter'}`] : rows.map(rowLine) };
    }
    case 'show': {
      const view = editor.show(family, key());
      return { code: 0, json: view, text: showLines(view) };
    }
    case 'add': {
      const view = editor.add(family, key(), read.values('the fields of the row, as --row <json or @file> or flags'));
      return { code: 0, json: { ok: true, row: view, pending: editor.edits().length }, text: [`Added, pending: ${rowLine(view)}`] };
    }
    case 'change':
      return changed(editor, 'Changed', editor.change(family, key(), read.values('a field to change, as --row <json or @file> or flags')));
    case 'remove': {
      const removed = editor.remove(family, key());
      return { code: 0, json: { ok: true, ...removed, pending: editor.edits().length }, text: [`Removed, pending: ${removed.key}`] };
    }
    case 'tiers': {
      const tierMin = read.whole('tierMin', 'the lowest Tier it offers');
      const tierMax = read.whole('tierMax', 'the highest Tier it offers');
      return changed(editor, 'Tiers set', editor.alter(family, key(), () => ({ tierMin, tierMax })));
    }
    case 'beat add': {
      const at = read.optionalWhole('at', "the Beat's place, from 0");
      const beat = read.values("the Beat's line and pool, as line=<text> pool=<json> or --row");
      return changed(editor, 'Beat added', editor.alter(family, key(), (row) => beatAdded(row, at, beat)));
    }
    case 'beat change': {
      const at = read.whole('at', "the Beat's index, from 0");
      const values = read.values('a field of the Beat to change, as line=<text> or pool=<json>');
      return changed(editor, 'Beat changed', editor.alter(family, key(), (row) => beatChanged(row, at, values)));
    }
    case 'beat move': {
      const at = read.whole('at', "the Beat's index, from 0");
      const to = read.whole('to', 'the index to move it to, from 0');
      return changed(editor, 'Beat moved', editor.alter(family, key(), (row) => beatMoved(row, at, to)));
    }
    case 'beat remove': {
      const at = read.whole('at', "the Beat's index, from 0");
      return changed(editor, 'Beat removed', editor.alter(family, key(), (row) => beatRemoved(row, at)));
    }
    case 'override set': {
      const tier = read.whole('tier', 'a Tier');
      const figures = read.values("a Tier's figure to set, as <figure>=<value>");
      return changed(editor, 'Override set', editor.alter(family, key(), (row) => overrideSet(row, tier, figures)));
    }
    case 'override clear': {
      const tier = read.whole('tier', 'a Tier');
      const names = read.names();
      return changed(editor, 'Override cleared', editor.alter(family, key(), (row) => overrideCleared(row, tier, names)));
    }
    case 'finale set': {
      const encounter = read.text('encounter', 'the Encounter played as its Finale');
      const line = read.text('line', "the Finale's line, as line=<text>");
      const others = Object.keys(read.values('', false));
      if (others.length > 0) throw new UsageError(`${family} ${command} takes line=<text> alone, not ${others.join(', ')}`);
      return changed(editor, 'Finale set', editor.alter(family, key(), () => finaleSet(encounter, line)));
    }
    case 'finale clear':
      return changed(editor, 'Finale cleared', editor.alter(family, key(), finaleCleared));
    case 'check add': {
      const check = read.values("the Check's fields, as <field>=<value> or --row");
      return changed(editor, 'Check added', editor.alter(family, key(), (row) => checkAdded(row, check, input.pass)));
    }
    case 'check change': {
      const name = read.text('check', "the Check's key");
      const values = read.values(input.pass === undefined ? 'a field of the Check to change, as <field>=<value> or --row' : 'its fields', input.pass === undefined);
      return changed(editor, 'Check changed', editor.alter(family, key(), (row) => checkChanged(row, name, values, input.pass)));
    }
    case 'check remove': {
      const name = read.text('check', "the Check's key");
      return changed(editor, 'Check removed', editor.alter(family, key(), (row) => checkRemoved(row, name, input.pass)));
    }
    case 'consequence add': {
      const degree = read.text('degree', 'a Degree: failure, setback, success or triumph');
      const at = read.optionalWhole('at', "the consequence's place, from 0");
      const consequence = read.values("the consequence's fields, as <field>=<value> or --row");
      return changed(editor, 'Consequence added', editor.alter(family, key(), (row) => consequenceAdded(row, degree, at, consequence)));
    }
    case 'consequence change': {
      const degree = read.text('degree', 'a Degree: failure, setback, success or triumph');
      const at = read.whole('at', "the consequence's index, from 0");
      const values = read.values('a field of the consequence to change, as <field>=<value> or --row');
      return changed(editor, 'Consequence changed', editor.alter(family, key(), (row) => consequenceChanged(row, degree, at, values)));
    }
    case 'consequence remove': {
      const degree = read.text('degree', 'a Degree: failure, setback, success or triumph');
      const at = read.whole('at', "the consequence's index, from 0");
      return changed(editor, 'Consequence removed', editor.alter(family, key(), (row) => consequenceRemoved(row, degree, at)));
    }
    case 'pending': {
      const edits = editor.edits();
      return { code: 0, json: { edits }, text: edits.length === 0 ? ['No pending edits'] : edits.map(editLine) };
    }
    case 'discard': {
      const result = editor.discard(family, read.optionalText('key', 'a key, or none'));
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
      const report = questsDoctor(editor.root);
      editor.recovered = report.finish.recovered;
      return { code: report.ok ? 0 : 1, json: report, text: questsDoctorText(report) };
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

/** The commands that read fields: a row's, a part's, or a Finale's line. */
const withValues: readonly string[] = ['add', 'change', 'beat add', 'beat change', 'override set', 'finale set', 'check add', 'check change', 'consequence add', 'consequence change'];

/** A value given on the command line: JSON where it is JSON (`25`, `{"kinds":["combat"]}`), else text (`Hold the gate.`). */
function valueOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A positional number: a whole number where it reads as one, else the word, for the command to refuse naming it. */
function numberOf(word: string | undefined): unknown {
  return word !== undefined && /^-?\d+$/.test(word) ? Number(word) : word;
}

/**
 * A command's input from its command line: its words after the command (a part's command its two
 * words), `<field>=<value>` words read as JSON where they are JSON, the row's fields from `--row` and
 * the flags, `--pass`, and `--force`.
 */
export function inputFromLine(family: Family, command: string, words: readonly string[], line: { fields: Row; pass: unknown; force: boolean }): CommandInput {
  const split = words.findIndex((word) => word.includes('='));
  const positional = split < 0 ? [...words] : words.slice(0, split);
  const values: Row = { ...line.fields };
  for (const word of split < 0 ? [] : words.slice(split)) {
    const at = word.indexOf('=');
    if (at <= 0) throw new UsageError(`${family} ${command} wants each field as <field>=<value>, not "${word}"`);
    values[word.slice(0, at)] = valueOf(word.slice(at + 1));
  }
  const [first, second, third] = positional;
  if (!withValues.includes(command) && Object.keys(values).length > 0) throw new UsageError(`${family} ${command} takes no field: ${Object.keys(values).join(', ')}`);
  const input: CommandInput = { values, ...(line.pass === undefined ? {} : { pass: line.pass }), ...(line.force ? { force: true } : {}) };
  const most = (count: number): void => {
    if (positional.length > count) throw new UsageError(`${family} ${command} takes ${count === 0 ? 'no word' : `${count} ${count === 1 ? 'word' : 'words'}`} before its fields, not "${positional.slice(count).join(' ')}"`);
  };
  switch (command) {
    case 'list':
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
    case 'finale clear':
      most(1);
      return { ...input, key: first };
    case 'tiers':
      most(3);
      return { ...input, key: first, tierMin: numberOf(second), tierMax: numberOf(third) };
    case 'beat add':
      most(2);
      return { ...input, key: first, at: numberOf(second) };
    case 'beat change':
    case 'beat remove':
      most(2);
      return { ...input, key: first, at: numberOf(second) };
    case 'beat move':
      most(3);
      return { ...input, key: first, at: numberOf(second), to: numberOf(third) };
    case 'override set':
      most(2);
      return { ...input, key: first, tier: numberOf(second) };
    case 'override clear':
      return { ...input, key: first, tier: numberOf(second), figures: positional.slice(2) };
    case 'finale set': {
      most(2);
      const { line: given, ...rest } = values;
      return { ...input, values: rest, key: first, encounter: second, line: given };
    }
    case 'check add':
      most(1);
      return { ...input, key: first };
    case 'check change':
    case 'check remove':
      most(2);
      return { ...input, key: first, check: second };
    case 'consequence add':
    case 'consequence change':
    case 'consequence remove':
      most(3);
      return { ...input, key: first, degree: second, at: numberOf(third) };
  }
  return input;
}
