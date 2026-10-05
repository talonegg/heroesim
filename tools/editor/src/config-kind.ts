// The editor's config kind (v1.1.6-S18, DL-186 item 15, DL-204): the tuning values, the defaults'
// settings in `engine/src/config.json`, read by section, set one at a time and held as pending in
// `.editor/config.json`, as the Traits' edits are, each checked with the engine's `checkConfig`
// against the content as it is made. "Finish" checks them again, writes the file in its own layout
// (`editJson`, of content's write module) with `version` raised by one and a line of its changelog
// saying why, and runs `npm test`, putting the file back if any test fails. It never commits.
//
// A setting is changed here, never added or removed: a new setting is an engine change, its field
// in `GameConfig` and its rule in `configRules` beside its value in the file. "Finish" shares the
// Traits' journal and lock (`finish-journal.ts`), so neither kind writes while the other's tests
// run.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { checkConfig, flattenConfig } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { editJson, readContentVersion, transaction, Undone, NotUndone } from '@heroesim/content/write';
import { Refused, pendingPath } from './editor.js';
import { beginJournal, Busy, busyProblems, endJournal, journalState, releaseJournal, restoreJournal, writeAtomically } from './finish-journal.js';
import { npmTest, type TestResult, type TestRunner } from './tests-run.js';

/** One pending edit: a setting and the value it is set to. */
export interface ConfigEdit {
  setting: string;
  value: unknown;
}

/** The settings by section, as `config.json` holds them. */
export type Sections = Record<string, Record<string, unknown>>;

/** What `config.json` holds. */
interface ConfigFile {
  version: number;
  changelog: string[];
  sections: Sections;
}

/** One setting as `config show` gives it: its value with the pending edits made, and, where one is pending, its value on disk. */
export interface SettingView {
  setting: string;
  value: unknown;
  pending: boolean;
  was?: unknown;
}

/** One section as `config show` gives it. */
export interface SectionView {
  section: string;
  settings: SettingView[];
}

/** How "Finish" ended. */
export interface ConfigFinished {
  ok: true;
  edits: number;
  changed: string[];
  configVersion: { from: number; to: number } | null;
  tests: TestResult | null;
}

/** The file that holds the defaults' values, under a repository's root. */
export function configPath(root: string): string {
  return path.join(root, 'engine', 'src', 'config.json');
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The config file at `root`, its text and its value; refused, naming the file, where it is not the shape the engine reads. */
function readConfigFile(root: string): { text: string; json: ConfigFile } {
  const file = configPath(root);
  const text = readFileSync(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Refused([`${file}: not JSON (${error instanceof Error ? error.message : String(error)})`]);
  }
  const { version, changelog, sections } = (isRecord(json) ? json : {}) as Partial<ConfigFile>;
  if (!Number.isInteger(version)) throw new Refused([`${file}: no whole number at "version"`]);
  if (!Array.isArray(changelog)) throw new Refused([`${file}: no list at "changelog"`]);
  if (!isRecord(sections) || !Object.values(sections).every(isRecord)) throw new Refused([`${file}: no sections of settings at "sections"`]);
  return { text, json: json as ConfigFile };
}

/** A value in a line of text: a number or a word as it reads, anything else as JSON. */
export function shownValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export class ConfigEditor {
  /** The files the last call put back from a "Finish" cut off, if any. */
  recovered: string[] = [];

  constructor(readonly root: string) {}

  /** Refuses while "Finish" runs, of either kind; puts back the files of one cut off. Every call begins here. */
  #guard(): void {
    const state = journalState(this.root);
    if (state === 'live') throw new Busy(busyProblems(this.root));
    if (state === 'cut-off') this.recovered = [...this.recovered, ...restoreJournal(this.root)];
  }

  /** The pending edits, as made; refused, naming the way out, where the file cannot be read. */
  edits(): ConfigEdit[] {
    this.#guard();
    const file = pendingPath(this.root, 'config');
    if (!existsSync(file)) return [];
    try {
      const held = JSON.parse(readFileSync(file, 'utf8')) as { edits?: unknown };
      if (!Array.isArray(held.edits)) throw new Error('it holds no list of edits');
      return held.edits as ConfigEdit[];
    } catch (error) {
      throw new Refused([`.editor/config.json cannot be read (${error instanceof Error ? error.message : String(error)}); \`config discard\` drops it`]);
    }
  }

  #save(edits: readonly ConfigEdit[]): void {
    const file = pendingPath(this.root, 'config');
    if (edits.length === 0) rmSync(file, { force: true });
    else writeAtomically(file, `${JSON.stringify({ kind: 'config', edits }, null, 2)}\n`);
  }

  /** The section holding `setting` in `sections`, or `undefined`. */
  #sectionOf(sections: Sections, setting: string): string | undefined {
    return Object.keys(sections).find((section) => Object.hasOwn(sections[section] ?? {}, setting));
  }

  /** The file's sections with `edits` made; refused, naming it, where an edit's setting is no longer in the file. */
  #working(sections: Sections, edits: readonly ConfigEdit[]): Sections {
    const working = structuredClone(sections);
    for (const edit of edits) {
      const section = this.#sectionOf(working, edit.setting);
      if (section === undefined) throw new Refused([`The pending edit of ${edit.setting} no longer applies: it is not a setting of config.json; discard it with \`config discard ${edit.setting}\``]);
      (working[section] as Record<string, unknown>)[edit.setting] = edit.value;
    }
    return working;
  }

  /** `checkConfig`'s problems with `sections`, against the content at the root: each names its setting. */
  #problems(sections: Sections): string[] {
    let flat: Record<string, unknown>;
    try {
      flat = flattenConfig(sections);
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
    return checkConfig(flat, loadContent(path.join(this.root, 'content'))).map((problem) => problem.message);
  }

  /** Every section, or the one named, its settings with the pending edits made. */
  show(section?: string): SectionView[] {
    const { json } = readConfigFile(this.root);
    const edits = this.edits();
    const working = this.#working(json.sections, edits);
    if (section !== undefined && !Object.hasOwn(working, section)) throw new Refused([`"${section}" is not a section of config.json: ${Object.keys(working).join(', ')}`]);
    return Object.entries(working)
      .filter(([name]) => section === undefined || name === section)
      .map(([name, settings]) => ({
        section: name,
        settings: Object.entries(settings).map(([setting, value]) => {
          const was = json.sections[name]?.[setting];
          return edits.some((edit) => edit.setting === setting) ? { setting, value, pending: true, was } : { setting, value, pending: false };
        }),
      }));
  }

  /**
   * Sets `setting` to `value`, pending, once the settings with it pass `checkConfig` against the
   * content; refused, each problem named by its setting, where they do not. A setting set again
   * replaces its pending edit, and one set back to its value on disk is no longer pending; a value as
   * it is already is not held.
   */
  set(setting: string, value: unknown): { setting: string; section: string; value: unknown; was: unknown; unchanged?: true } {
    const { json } = readConfigFile(this.root);
    const edits = this.edits();
    const section = this.#sectionOf(json.sections, setting);
    if (section === undefined) throw new Refused([`"${setting}" is not a setting of config.json; \`config show\` lists them by section`]);
    const was = json.sections[section]?.[setting];
    const before = this.#working(json.sections, edits)[section]?.[setting];
    if (same(before, value)) return { setting, section, value, was, unchanged: true };
    const others = edits.filter((edit) => edit.setting !== setting);
    const next = same(was, value) ? others : [...others, { setting, value }];
    const problems = this.#problems(this.#working(json.sections, next));
    if (problems.length > 0) throw new Refused(problems);
    this.#save(next);
    return { setting, section, value, was };
  }

  /** Drops the pending edit of `setting`, or every one. */
  discard(setting?: string): { discarded: number; left: number } {
    this.#guard();
    let edits: ConfigEdit[];
    try {
      edits = this.edits();
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      this.#save([]);
      return { discarded: 0, left: 0 };
    }
    const left = setting === undefined ? [] : edits.filter((edit) => edit.setting !== setting);
    this.#save(left);
    return { discarded: edits.length - left.length, left: left.length };
  }

  /**
   * Writes the pending edits into `config.json`, raises its `version` by one with a line of its
   * changelog, `<version> from <reason>: <setting> <was> to <value>, …`, and runs the tests. The
   * settings are checked with `checkConfig` first, against the content as it is now. If any test
   * fails the file is put back and the edits stay pending; on success they are cleared. Never commits.
   */
  async finish(reason: string, runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<ConfigFinished> {
    const edits = this.edits();
    if (edits.length === 0) return { ok: true, edits: 0, changed: [], configVersion: null, tests: null };
    const why = reason.trim().replace(/\.$/, '');
    if (why === '') throw new Refused(['"Finish" raises the config version, whose changelog says why: give the reason, `--reason <why>`, citing its decision-log entry']);
    const { text, json } = readConfigFile(this.root);
    const sections = this.#working(json.sections, edits);
    const problems = this.#problems(sections);
    if (problems.length > 0) throw new Refused(problems);
    const changed = edits.map((edit) => edit.setting);
    const from = json.version;
    const to = from + 1;
    const changes = edits.map((edit) => `${edit.setting} ${shownValue(json.sections[this.#sectionOf(json.sections, edit.setting) ?? '']?.[edit.setting])} to ${shownValue(edit.value)}`);
    const file = configPath(this.root);
    beginJournal(this.root, { contentVersion: readContentVersion(this.root), edits: edits.length, files: { [file]: readFileSync(file).toString('base64') } });
    try {
      const finished = await transaction(async (files) => {
        files.write(file, editJson(text, { ...json, version: to, changelog: [...json.changelog, `${to} from ${why}: ${changes.join(', ')}.`], sections }));
        onLine(`Wrote engine/src/config.json; config version ${from} → ${to}. Running the tests…`);
        const tests = await runTests(this.root, onLine);
        if (!tests.ok) {
          throw new Undone(tests.failures.length > 0 ? tests.failures : [`the tests failed, exit code ${tests.exitCode}`, ...tests.tail.slice(-10)], 'Finish');
        }
        return { ok: true as const, edits: edits.length, changed, configVersion: { from, to }, tests };
      });
      this.#save([]);
      endJournal(this.root);
      return finished;
    } catch (error) {
      // As the Traits' "Finish": a file not put back keeps the journal, for the next command.
      if (error instanceof NotUndone) releaseJournal(this.root);
      else endJournal(this.root);
      throw error;
    }
  }
}
