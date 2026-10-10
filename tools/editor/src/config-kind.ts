// The editor's config kind (DL-186 item 15, DL-204): the tuning values, the defaults' settings in
// `engine/src/config.json`, read by section, set one at a time and held as pending in
// `.editor/config.json`, each checked with the engine's `checkConfig` as it is made. Its edits are the
// edit session's (`session.ts`, DL-244), through the config file's adapter (`configFile`): "Finish"
// checks them again, writes the file in its own layout with `version` raised by one and a line of its
// changelog saying why, and runs `npm test`, putting the file back if any test fails. It never
// commits. It shares the session's journal and lock, so neither kind writes while the other's tests
// run.
//
// A setting is changed here, never added or removed: a new setting is an engine change, its field
// in `GameConfig` and its rule in `configRules` beside its value in the file.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readContent } from '@heroesim/content';
import { readContentDir } from '@heroesim/content/node';
import { ladderProblems } from '@heroesim/content/write';
import { checkConfig, flattenConfig } from '@heroesim/engine';
import type { ContentSet, TierRow } from '@heroesim/engine/content';
import { EditSession, Refused, type SessionAdapter } from './session.js';
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

/**
 * `value` with its keys in `like`'s order, at every depth, where both are objects: the file's order,
 * whatever order a value is given in, so that a reordering alone is no change (DL-204).
 */
function inOrderOf(value: unknown, like: unknown): unknown {
  if (!isRecord(value) || !isRecord(like)) return value;
  const keys = [...Object.keys(like).filter((key) => Object.hasOwn(value, key)), ...Object.keys(value).filter((key) => !Object.hasOwn(like, key))];
  return Object.fromEntries(keys.map((key) => [key, inOrderOf(value[key], like[key])]));
}

/** The config file as the adapter reads it, its text and value, and its sections with the edits made. */
interface ConfigWorking {
  text: string;
  json: ConfigFile;
  sections: Sections;
}

/** The section holding `setting` in `sections`, or `undefined`. */
function sectionOf(sections: Sections, setting: string): string | undefined {
  return Object.keys(sections).find((section) => Object.hasOwn(sections[section] ?? {}, setting));
}

/**
 * The edit session's adapter for the config file (DL-244): each edit sets one setting, made on the
 * file's sections, checked with the engine's `checkConfig`; "Finish" writes the file in its own layout
 * and raises the config version, its changelog's line `<version> from <why>: <setting> <was> to
 * <value>, ….`
 */
export const configFile: SessionAdapter<ConfigEdit, ConfigWorking> = {
  name: 'config',

  replay(root, edits) {
    const { text, json } = readConfigFile(root);
    const sections = structuredClone(json.sections);
    for (const edit of edits) {
      const section = sectionOf(sections, edit.setting);
      if (section === undefined) throw new Refused([`The pending edit of ${edit.setting} no longer applies: it is not a setting of config.json; discard it with \`config discard ${edit.setting}\``]);
      (sections[section] as Record<string, unknown>)[edit.setting] = edit.value;
    }
    return { text, json, sections };
  },

  problems(root, { json, sections }) {
    let flat: Record<string, unknown>;
    try {
      flat = flattenConfig(sections);
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
    const problems = checkConfig(flat).map((problem) => problem.message);
    if (problems.length > 0) return problems;
    // A Tier ladder changed is held to the Quest templates that read it (DL-262), as the content's
    // check holds them to the ladder on disk (DL-270); content that cannot be read is the content's
    // checks' to name.
    const ladder = flat.tiers as TierRow[];
    if (JSON.stringify(ladder) === JSON.stringify(flattenConfig(json.sections).tiers)) return [];
    let templates: ContentSet['questTemplates'];
    try {
      templates = readContent(readContentDir(path.join(root, 'content'))).questTemplates;
    } catch {
      return [];
    }
    return ladderProblems(templates, ladder);
  },

  finishing(root, { text, json, sections }, edits, reason) {
    const changes = edits.map((edit) => `${edit.setting} ${shownValue(json.sections[sectionOf(json.sections, edit.setting) ?? '']?.[edit.setting])} to ${shownValue(edit.value)}`);
    const file = configPath(root);
    return {
      files: { [file]: { text, value: { ...json, sections }, keepLines: false } },
      changed: edits.map((edit) => edit.setting),
      wrote: 'engine/src/config.json',
      version: { file, name: 'config version', why: `${reason}: ${changes.join(', ')}` },
    };
  },
};

export class ConfigEditor {
  readonly #session: EditSession<ConfigEdit, ConfigWorking>;

  constructor(readonly root: string) {
    this.#session = new EditSession(root, configFile);
  }

  /** The files this editor's calls put back from a "Finish" cut off, if any. */
  get recovered(): string[] {
    return this.#session.recovered;
  }

  /** The pending edits, as made; refused, naming the way out, where the file cannot be read. */
  edits(): ConfigEdit[] {
    return this.#session.edits();
  }

  /** Every section, or the one named, its settings with the pending edits made. */
  show(section?: string): SectionView[] {
    // The edits first: a "Finish" cut off is put back before the file is read (DL-205).
    const edits = this.edits();
    const { json, sections: working } = this.#session.replay(edits, edits.length);
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
   * Sets `setting` to `value`, pending, once the settings with it pass `checkConfig`; refused, each
   * problem named by its setting, where they do not. A setting set again
   * replaces its pending edit, and one set back to its value on disk is no longer pending; a value as
   * it is already is not held.
   */
  set(setting: string, given: unknown): { setting: string; section: string; value: unknown; was: unknown; unchanged?: true } {
    // The edits first: a "Finish" cut off is put back before the file is read (DL-205).
    const edits = this.edits();
    const { json, sections: working } = this.#session.replay(edits, edits.length);
    const section = sectionOf(json.sections, setting);
    if (section === undefined) throw new Refused([`"${setting}" is not a setting of config.json; \`config show\` lists them by section`]);
    const was = json.sections[section]?.[setting];
    const value = inOrderOf(given, was);
    if (same(working[section]?.[setting], value)) return { setting, section, value, was, unchanged: true };
    const others = edits.filter((edit) => edit.setting !== setting);
    const next = same(was, value) ? others : [...others, { setting, value }];
    this.#session.hold(next, next.length);
    return { setting, section, value, was };
  }

  /** Drops the pending edit of `setting`, or every one; the settings left are checked at "Finish", not here. */
  discard(setting?: string): { discarded: number; left: number } {
    const { discarded, left } = this.#session.discard(setting === undefined ? undefined : (edit) => edit.setting === setting, { check: false });
    return { discarded, left };
  }

  /**
   * The session's "Finish": writes the pending edits into `config.json`, raises its `version` by one
   * with a line of its changelog, `<version> from <reason>: <setting> <was> to <value>, …`, and runs
   * the tests, the settings checked with `checkConfig` first. If any test fails the file is put back
   * and the edits stay pending. A reason is wanted wherever an edit is pending.
   */
  async finish(reason: string, runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<ConfigFinished> {
    const why = reason.trim().replace(/\.$/, '');
    if (why === '' && this.edits().length > 0) throw new Refused(['"Finish" raises the config version, whose changelog says why: give the reason, `--reason <why>`, citing its decision-log entry']);
    const { ok, edits, changed, version, tests } = await this.#session.finish({ runTests, onLine, reason: why });
    return { ok, edits, changed, configVersion: version, tests };
  }
}
