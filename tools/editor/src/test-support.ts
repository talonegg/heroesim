// For the editor's tests: a scratch copy of the parts of this repository the editor reads and writes,
// made a git repository of its own, so a test can change it and read `git status` after. Its `npm
// test` is a planted script, passing or failing as the test says, so that "Finish" runs a real
// command line without running this suite inside itself; most tests read the same script in this
// process, `plantedTests`, and a few run it through npm (DL-234).

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isFolder, rowFilesIn, rowFile, type ContentSource } from '@heroesim/content';
import { readSource } from '@heroesim/content/node';
import { formatJson } from '@heroesim/content/write';
import { afterEach, inject } from 'vitest';
import { run, type Deps } from './cli.js';
import { repositoryRoot } from './content-files.js';
import { isBoundaryProbe } from './reads.js';
import { git } from './template.test-support.js';
import { failuresIn, type TestRunner } from './tests-run.js';

export { git };

export const root = repositoryRoot;

/** `git status --porcelain` of a scratch repository, untracked files named one by one. */
export function status(dir: string): string {
  return git(dir, 'status', '--porcelain', '--untracked-files=all');
}

/**
 * A scratch copy of this repository's content (its JSON, `version.json` among it, and the source of
 * its checks, which the drift check reads) and `docs/agents/traits-register.md`, committed, with a
 * planted `npm test` that passes: a copy of the run's template, `.git` and all
 * (`template.test-support.ts`); removed by the function it returns with. Its `engine/src/config.json`
 * is committed, which the config kind writes (DL-204). With `engine`, the rest of `engine/src/` too, which only the
 * drift check reads (the doctor's, `drift.ts`): copied beside the commit and ignored by git, since
 * the editor never writes it, as copying and committing its files for every test took most of the
 * editor's tests' time (DL-164).
 */
export function scratchRepository(options: { engine?: boolean } = {}): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-editor-'));
  cpSync(inject('editorTemplate'), dir, { recursive: true, preserveTimestamps: true });
  if (options.engine === true) {
    // engine/src/boundary.test.ts writes and deletes probe files in engine/src/ while other tests run.
    cpSync(path.join(root, 'engine', 'src'), path.join(dir, 'engine', 'src'), {
      recursive: true,
      filter: (source) => !isBoundaryProbe(path.relative(root, source).replace(/\\/g, '/')),
    });
  }
  // Windows may hold a file of it a moment after a child process or the server lets it go.
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});

/** A scratch copy, removed after the test; with `engine`, its engine/src/ too, for a test that runs the doctor. */
export function scratch(options: { engine?: boolean } = {}): string {
  const { dir, remove } = scratchRepository(options);
  scratches.push(remove);
  return dir;
}

/** A Trait as the commands give it in JSON. */
export type Row = { key: string; list: string; row: Record<string, unknown>; uses: { at: string; blocksRemoval: boolean }[]; rules: { id: string }[]; pending: string | null };
/** A command's refusal in JSON. */
export type Failure = { ok: false; kind: string; problems: string[]; uses?: { at: string; entry: string }[] };

/** Sets whether the scratch copy's planted `npm test` passes, committed so `git status` stays clean. */
export function plantOutcome(dir: string, outcome: 'pass' | 'fail' | 'hang'): void {
  writeFileSync(path.join(dir, 'test-outcome.txt'), `${outcome}\n`);
  git(dir, 'commit', '--quiet', '--allow-empty', '-am', `the planted tests ${outcome}`);
}

/** Reads a content source of a scratch repository as JSON: a file's, or a folder's rows' by key (DL-260). */
export function readContentJson<T = Record<string, unknown>>(dir: string, file: ContentSource): T {
  if (!isFolder(file)) return JSON.parse(readFileSync(path.join(dir, 'content', file), 'utf8')) as T;
  const texts = readSource(path.join(dir, 'content'), file);
  return Object.fromEntries(rowFilesIn(file, Object.keys(texts)).map(([key, name]) => [key, JSON.parse(texts[name] ?? '')])) as T;
}

/** Writes a content source of a scratch repository, as the portrait tool lays out a new file: a folder a file a row, the rows it no longer holds removed. */
export function writeContentJson(dir: string, file: ContentSource, value: unknown): void {
  if (!isFolder(file)) {
    writeFileSync(path.join(dir, 'content', file), formatJson(value));
    return;
  }
  const folder = path.join(dir, 'content', file);
  for (const name of readdirSync(folder)) if (name.endsWith('.json')) rmSync(path.join(folder, name));
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) writeFileSync(path.join(dir, 'content', ...rowFile(file, key).split('/')), formatJson(row));
}

/**
 * The planted `npm test` read in this process: the lines it prints, and how it ends, as
 * `test-outcome.txt` says, read through the runner's own `failuresIn`. "Finish"'s tests run it in
 * place of the process, but for the two of `cli.test.ts` that run the planted script through `npm`
 * end to end, and the cut-off "Finish" of `recovery.test.ts` (DL-234).
 */
export const plantedTests: TestRunner = async (dir, onLine) => {
  const outcome = readFileSync(path.join(dir, 'test-outcome.txt'), 'utf8').trim();
  const lines = [' RUN  the planted tests'];
  const said = (line: string): void => {
    lines.push(line);
    onLine(line);
  };
  onLine(lines[0] ?? '');
  if (outcome === 'fail') {
    said(' FAIL  |content| src/planted.test.ts > a planted test fails');
    said('   × a planted test fails');
    return { ok: false, exitCode: 1, failures: failuresIn(lines), tail: lines.slice(-30) };
  }
  if (outcome !== 'pass') throw new Error(`the planted tests ${outcome} only through npm`);
  said(' ✓ src/planted.test.ts (1 test)');
  return { ok: true, exitCode: 0, failures: [], tail: lines.slice(-30) };
};

/** One command line's run: its exit code, and what it wrote, each stream joined. "Finish" runs the planted tests in this process unless `deps` says otherwise. */
export async function command(argv: readonly string[], deps: Deps = { runTests: plantedTests }): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (text) => out.push(text), err: (text) => err.push(text) }, deps);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** One command line's run with `--json` on the scratch copy `dir`, its output read. */
export async function json<T = Record<string, unknown>>(dir: string, ...argv: string[]): Promise<{ code: number; json: T }> {
  const result = await command([...argv, '--root', dir, '--json']);
  return { code: result.code, json: JSON.parse(result.out) as T };
}

/** A planted template's Beat, drawn by `kind` alone. */
const kindBeat = (line: string, kind: string): Record<string, unknown> => ({ line, pool: { kinds: [kind] } });

/**
 * The Quest templates the commands' tests read, as they plant them: their Tiers, Beats and Finales
 * fixed here, each pool drawing by kind alone, so that a test rests on these rows and not on the
 * templates as shipped (DL-272). Each keeps its shipped key, Spheres and Patron's fields.
 */
export const plantedQuests: Readonly<Record<string, Record<string, unknown>>> = {
  'a-quiet-word': {
    tierMin: 1,
    tierMax: 2,
    beats: [kindBeat('Words to be had.', 'social'), kindBeat('Somewhere not to be seen.', 'stealth'), kindBeat('Words to be had.', 'social')],
  },
  'clear-the-barrow': {
    tierMin: 2,
    tierMax: 3,
    beats: [kindBeat('A fight on the way.', 'combat'), kindBeat('Somewhere not to be seen.', 'stealth'), kindBeat('A hard road.', 'travel')],
  },
  'escort-the-tithe': {
    tierMin: 1,
    tierMax: 1,
    beats: [kindBeat('A hard road.', 'travel'), kindBeat('A fight on the way.', 'combat'), kindBeat('Words to be had.', 'social')],
  },
  'hold-the-border-fort': {
    tierMin: 3,
    tierMax: 4,
    beats: [kindBeat('A fight on the way.', 'combat'), kindBeat('A hard road.', 'travel'), kindBeat('A fight on the way.', 'combat')],
    finale: 'the-last-assault',
    finaleLine: 'The last of it.',
  },
  'lay-the-restless-dead': {
    tierMin: 3,
    tierMax: 4,
    beats: [kindBeat('A fight on the way.', 'combat'), kindBeat('Something uncanny.', 'arcane'), kindBeat('Something to be learned.', 'lore')],
    finale: 'the-last-rite',
    finaleLine: 'The last of it.',
  },
  'the-sickness-at-the-mill': {
    tierMin: 1,
    tierMax: 1,
    beats: [kindBeat('Words to be had.', 'social'), kindBeat('Something to be learned.', 'lore')],
  },
};

/**
 * Plants `plantedQuests` in the scratch copy `dir`: each row's Tiers, Beats and Finale as given there,
 * its override and any other Finale taken out, the rest of the row as shipped; committed, so that
 * `git status` stays clean.
 */
export function plantQuests(dir: string): void {
  const templates = readContentJson<Record<string, Record<string, unknown>>>(dir, 'quest-templates/');
  for (const [key, planted] of Object.entries(plantedQuests)) {
    const row = { ...templates[key] };
    for (const field of ['finale', 'finaleLine', 'overrides']) Reflect.deleteProperty(row, field);
    writeFileSync(path.join(dir, 'content', ...rowFile('quest-templates/', key).split('/')), formatJson({ ...row, ...planted }));
  }
  git(dir, 'commit', '--quiet', '--allow-empty', '-am', 'the planted Quest templates');
}

/**
 * Puts an Encounter and a Synergy of the scratch copy in the new form, whose Queries a `has-trait` may
 * filter (DL-151, DL-152): `ambush-on-the-road` one Check scored by the strongest Warrior, and
 * `shield-wall` requiring three Warriors; committed.
 */
export function plantQueries(dir: string): void {
  const encounters = readContentJson<Record<string, Record<string, unknown>>>(dir, 'encounters/');
  const ambush = encounters['ambush-on-the-road'] ?? {};
  encounters['ambush-on-the-road'] = {
    name: ambush.name,
    kind: ambush.kind,
    checks: [{ key: 'front', name: 'The front', score: ['max', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], skills: [], difficultyFactor: 0.2 }],
    consequences: ambush.consequences,
  };
  writeContentJson(dir, 'encounters/', encounters);
  const synergies = readContentJson<Record<string, Record<string, unknown>>>(dir, 'synergies.json');
  (synergies['shield-wall'] ?? {}).requires = [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 3]];
  writeContentJson(dir, 'synergies.json', synergies);
  git(dir, 'commit', '--quiet', '-am', 'queries');
}

/**
 * The Facilities and their grades the facilities tests read, as they plant them, so that a test rests
 * on these rows and not on the values as shipped, which the tuning pass changes (DL-272, DL-297): the
 * three Facilities, each three grades, the infirmary's heal factor falling, the others' effects rising.
 */
export const plantedFacilities: Readonly<Record<string, Record<string, unknown>>> = {
  infirmary: { name: 'infirmary', plural: false, upkeep: 15, effects: { healFactor: 1 } },
  'training-yard': { name: 'training yard', plural: false, upkeep: 15, effects: { trainingXp: 0 } },
  quarters: { name: 'quarters', plural: true, upkeep: 15, effects: { moraleBaseline: 0, fatigueFall: 5 } },
};

/** The grades `plantedFacilities` has, by key: costs 200, 500 and 1000. */
export const plantedGrades: Readonly<Record<string, Record<string, unknown>>> = Object.fromEntries(
  [
    ['infirmary', ['Sickroom', 'Infirmary ward', "Physicians' wing"], [{ healFactor: 0.5 }, { healFactor: 0.3 }, { healFactor: 0.2 }]],
    ['training-yard', ['Practice yard', 'Drill ground', 'Tiltyard'], [{ trainingXp: 2 }, { trainingXp: 4 }, { trainingXp: 6 }]],
    ['quarters', ['Dormitory', 'Private rooms', 'Lodgings'], [{ moraleBaseline: 5, fatigueFall: 6 }, { moraleBaseline: 10, fatigueFall: 7 }, { moraleBaseline: 15, fatigueFall: 8 }]],
  ].flatMap(([facility, names, effects]) =>
    (names as string[]).map((name, index) => [`${String(facility)}-${index + 1}`, { facility, grade: index + 1, cost: [200, 500, 1000][index], name, effects: (effects as unknown[])[index] }]),
  ),
);

/** Plants `plantedFacilities` and `plantedGrades` in the scratch copy `dir`, in the files' own layout, committed so that `git status` stays clean. */
export function plantFacilities(dir: string): void {
  const lines = (rows: Readonly<Record<string, unknown>>): string => `{\n${Object.entries(rows).map(([key, row]) => `  ${JSON.stringify(key)}: ${JSON.stringify(row).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\}/g, ' }')}`).join(',\n')}\n}\n`;
  writeFileSync(path.join(dir, 'content', 'facilities.json'), lines(plantedFacilities));
  writeFileSync(path.join(dir, 'content', 'improvements.json'), lines(plantedGrades));
  git(dir, 'commit', '--quiet', '--allow-empty', '-am', 'the planted Facilities');
}
