// The portrait tool's command line (DL-135 item 11, v1.1.3-S2), run as `npm run portraits -- <command>`.
// Every command takes `--root <dir>`, the repository to work on (this one by default), and `--json`,
// which prints one JSON object on stdout for a skill to read. The exit code is 0 for success, 1 for
// a check that failed or a change refused or undone, and 2 for a command line the tool cannot read.
// The commands and the draft's shape are in this package's README.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataUrlOf, isPicture, withChromium, type Chromium } from './chromium.js';
import { check } from './check.js';
import { convert, Refusal } from './convert.js';
import { corpus, corpusText } from './corpus.js';
import { diffRun, diffText } from './diff.js';
import { DraftError, NotUndone, Undone } from './errors.js';
import { distance, fingerprint, type Fingerprint } from './fingerprint.js';
import { readRegistry } from './registry.js';
import { apply, writeRun } from './runs.js';
import { writeRows } from './write-rows.js';
import { Transaction } from './transaction.js';

/** This repository's root, three folders above this file. */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export const usage = `Usage: npm run portraits -- <command> [--root <dir>] [--json]

  convert <source>... [--out <dir>]    Write <name>.webp and <name>.thumb.webp beside each source
  fingerprint <file or folder>...      Each picture's hash, and the nearest pictures in the register
              [--nearest <n>]
  check                                The register, media/ and the content agree, within the limits
  corpus [--run <run> | --draft <d>]   Every picture, its files and row, counted by role, sex, band
                                       and Class; texts over bounds, unused terms, short sentence
                                       lists, similar pairs; with a run's or a write-run draft's
                                       files in place of the content's
  write-rows <draft.json> [--date d]   Take an intake draft's uploads in, as one transaction
  write-run <draft.json> [--date d]    Write an analysis run from its draft
  diff <run>                           What applying an analysis run would change, path by path
  apply <run>                          Put an analysis run's JSON in place, as one transaction

Exit codes: 0 done, 1 failed or refused (nothing changed), 2 a command line not understood.`;

/** Where a command writes. */
export interface Io {
  out(text: string): void;
  err(text: string): void;
}

class UsageError extends Error {}

interface Parsed {
  command: string;
  args: string[];
  json: boolean;
  root: string;
  out: string | null;
  date: string | null;
  run: string | null;
  draft: string | null;
  nearest: number;
}

function parse(argv: readonly string[]): Parsed {
  const parsed: Parsed = { command: '', args: [], json: false, root: repositoryRoot, out: null, date: null, run: null, draft: null, nearest: 5 };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`${flag} wants a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--json') parsed.json = true;
    else if (arg === '--root') parsed.root = path.resolve(value(arg, index++));
    else if (arg === '--out') parsed.out = path.resolve(value(arg, index++));
    else if (arg === '--date') parsed.date = value(arg, index++);
    else if (arg === '--run') parsed.run = value(arg, index++);
    else if (arg === '--draft') parsed.draft = path.resolve(value(arg, index++));
    else if (arg === '--nearest') {
      parsed.nearest = Number(value(arg, index++));
      if (!Number.isInteger(parsed.nearest) || parsed.nearest < 1) throw new UsageError('--nearest wants a whole number of 1 or more');
    } else if (arg.startsWith('--')) throw new UsageError(`${arg} is not a flag the tool knows`);
    else if (parsed.command === '') parsed.command = arg;
    else parsed.args.push(arg);
  }
  return parsed;
}

/** Every picture a command names: files as named, and every picture in a folder, deep. */
function picturesNamed(args: readonly string[]): string[] {
  const found: string[] = [];
  for (const arg of args) {
    const full = path.resolve(arg);
    if (!existsSync(full)) throw new UsageError(`${arg} does not exist`);
    if (statSync(full).isDirectory()) {
      const inside = readdirSync(full, { recursive: true, encoding: 'utf8' })
        .map((entry) => path.join(full, entry))
        .filter((file) => statSync(file).isFile() && isPicture(file) && !/\.thumb\.webp$/.test(file))
        .sort();
      found.push(...inside);
    } else found.push(full);
  }
  return found;
}

function readDraft(file: string | undefined): unknown {
  if (file === undefined) throw new UsageError('a draft.json is wanted');
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new DraftError([`${file}: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

async function commandConvert(options: Parsed, chromium: Chromium): Promise<unknown> {
  if (options.args.length === 0) throw new UsageError('convert wants a source');
  const results = [];
  const files = new Transaction();
  // A path as the filesystem may match it: Windows' and macOS's ignore case (v1.1.3-S8).
  const same = (file: string): string => path.resolve(file).toLowerCase();
  const targets = new Set<string>();
  try {
    for (const source of options.args.map((each) => path.resolve(each))) {
      if (!isPicture(source)) throw new UsageError(`${source}: a JPEG, PNG or WebP is converted`);
      const base = path.basename(source, path.extname(source));
      const dir = options.out ?? path.dirname(source);
      const [picture, thumbnail] = [path.join(dir, `${base}.webp`), path.join(dir, `${base}.thumb.webp`)];
      if (same(picture) === same(source)) throw new UsageError(`${source}: its picture would overwrite it; give --out <dir>`);
      if (targets.has(same(picture))) throw new UsageError(`${source}: another source given is converted to the same picture, ${picture}`);
      targets.add(same(picture));
      const converted = await convert(chromium, dataUrlOf(source), source);
      files.write(picture, converted.picture.bytes);
      files.write(thumbnail, converted.thumbnail.bytes);
      results.push({
        source,
        picture: { file: picture, bytes: converted.picture.bytes.length, quality: converted.picture.quality },
        thumbnail: { file: thumbnail, bytes: converted.thumbnail.bytes.length, quality: converted.thumbnail.quality },
        natural: converted.picture.natural,
      });
    }
  } catch (error) {
    files.rollback();
    throw error;
  }
  return { converted: results };
}

async function commandFingerprint(options: Parsed, chromium: Chromium): Promise<unknown> {
  const files = picturesNamed(options.args);
  if (files.length === 0) throw new UsageError('fingerprint wants a picture, or a folder holding one');
  const registry = readRegistry(options.root);
  const { similarWithin, bits } = registry.fingerprint;
  const prints: { file: string; print: Fingerprint }[] = [];
  for (const file of files) prints.push({ file, print: await fingerprint(chromium, dataUrlOf(file)) });
  return {
    bits,
    similarWithin,
    files: prints.map(({ file, print }) => {
      const nearest = Object.entries(registry.portraits)
        .map(([key, entry]) => ({ key, role: entry.role, sex: entry.sex, status: entry.status, distance: distance(print, entry) }))
        .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
        .slice(0, options.nearest)
        .map((each) => ({ ...each, similar: each.distance <= similarWithin }));
      const uploads = prints
        .filter((other) => other.file !== file)
        .map((other) => ({ file: other.file, distance: distance(print, other.print) }))
        .filter((other) => other.distance <= similarWithin);
      return {
        file,
        hash: print.hash,
        similar: nearest.filter((each) => each.similar).map((each) => each.key),
        nearest,
        similarUploads: uploads,
      };
    }),
  };
}

type Result = { code: number; json: unknown; text: string[] };

async function dispatch(options: Parsed): Promise<Result> {
  switch (options.command) {
    case 'convert': {
      const json = (await withChromium((chromium) => commandConvert(options, chromium))) as {
        converted: { source: string; picture: { file: string; bytes: number; quality: number }; thumbnail: { file: string; bytes: number; quality: number } }[];
      };
      const text = json.converted.map(
        (each) =>
          `${each.picture.file}: ${each.picture.bytes} bytes at ${each.picture.quality}; ${each.thumbnail.file}: ${each.thumbnail.bytes} bytes at ${each.thumbnail.quality}`,
      );
      return { code: 0, json, text };
    }
    case 'fingerprint': {
      const json = (await withChromium((chromium) => commandFingerprint(options, chromium))) as {
        similarWithin: number;
        files: { file: string; hash: string; similar: string[]; nearest: { key: string; distance: number; status: string }[]; similarUploads: { file: string; distance: number }[] }[];
      };
      const text = json.files.flatMap((each) => [
        `${each.file}`,
        `  Hash ${each.hash}`,
        `  ${each.similar.length > 0 ? `Similar to ${each.similar.join(', ')}` : 'Similar to no picture in the register'} (within ${json.similarWithin} bits)`,
        `  Nearest: ${each.nearest.map((near) => `${near.key}${near.status === 'retired' ? ' (retired)' : ''} ${near.distance}`).join(', ')}`,
        ...each.similarUploads.map((upload) => `  Similar to the upload ${upload.file} (${upload.distance})`),
      ]);
      return { code: 0, json, text };
    }
    case 'check': {
      const result = check(options.root);
      const text = result.ok
        ? [`Check passed: ${result.live} live pictures, each with its thumbnail, listed and with its row, within the limits`]
        : [`Check failed, ${result.failures.length} ${result.failures.length === 1 ? 'problem' : 'problems'}:`, ...result.failures.map((failure) => `  ${failure.message}`)];
      return { code: result.ok ? 0 : 1, json: result, text };
    }
    case 'corpus': {
      const json = corpus(options.root, { run: options.run, draft: options.draft });
      return { code: 0, json, text: corpusText(json) };
    }
    case 'diff': {
      const run = options.args[0];
      if (run === undefined) throw new UsageError('diff wants a run, such as 2026-10-02');
      const json = diffRun(options.root, run);
      return { code: 0, json, text: diffText(json) };
    }
    case 'write-rows': {
      const draft = readDraft(options.args[0]);
      const intake = await withChromium((chromium) => writeRows(options.root, draft, chromium, options.date === null ? {} : { date: options.date }));
      const text = [
        ...intake.pictures.map((each) => `${each.source} → ${each.key}`),
        ...(intake.contentVersion === null ? [] : [`Content version ${intake.contentVersion.from} → ${intake.contentVersion.to}`]),
        `Report: ${intake.report}`,
      ];
      return { code: 0, json: { ok: true, ...intake }, text };
    }
    case 'write-run': {
      const run = await writeRun(options.root, readDraft(options.args[0]), options.date === null ? {} : { date: options.date });
      return { code: 0, json: { ok: true, ...run }, text: [`Run ${run.run}:`, ...run.files.map((file) => `  ${file}`)] };
    }
    case 'apply': {
      const run = options.args[0];
      if (run === undefined) throw new UsageError('apply wants a run, such as 2026-10-02');
      const applied = await apply(options.root, run);
      const text =
        applied.contentVersion === null
          ? [`Run ${run}: its JSON is the content's already, and nothing changed`]
          : [`Run ${run} applied: ${applied.changed.join(', ')}`, `Content version ${applied.contentVersion.from} → ${applied.contentVersion.to}`];
      return { code: 0, json: { ok: true, ...applied }, text };
    }
    case '':
    case 'help':
      return { code: options.command === '' ? 2 : 0, json: { usage }, text: [usage] };
    default:
      throw new UsageError(`${options.command} is not a command the tool knows`);
  }
}

/** Runs a command line, writing to `io`, and gives the exit code. */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  let options: Parsed | null = null;
  try {
    options = parse(argv);
    const result = await dispatch(options);
    if (options.json) io.out(JSON.stringify(result.json, null, 2));
    else for (const line of result.text) (result.code === 0 ? io.out : io.err)(line);
    return result.code;
  } catch (error) {
    const json = options?.json ?? argv.includes('--json');
    const code = error instanceof UsageError ? 2 : 1;
    const problems =
      error instanceof DraftError || error instanceof Undone
        ? [...error.problems]
        : error instanceof NotUndone
          ? [...error.problems, ...error.left.map((file) => `not put back: ${file}`)]
        : [error instanceof Error ? error.message : String(error)];
    const kind = error instanceof UsageError ? 'usage' : error instanceof DraftError ? 'refused' : error instanceof Undone ? 'undone' : error instanceof NotUndone ? 'not-undone' : error instanceof Refusal ? 'refused' : 'failed';
    if (json) io.out(JSON.stringify({ ok: false, kind, problems }, null, 2));
    else {
      io.err(error instanceof Error ? error.message : String(error));
      if (code === 2) io.err(usage);
    }
    return code;
  }
}
