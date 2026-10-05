// Staging: every upload in the inbox converted once, ahead of its reading, so that a thousand
// Heroes' pictures are converted, measured and checked for near matches before a word is drafted,
// and their readers look at the 480 × 640 picture the game would show rather than the upload.
//
// The staged pictures go to `media/inbox/staged/`, each under its upload's own path in the inbox:
// a folder beside the role folders, which git ignores and the page never ships, and which no role
// is named after, so `write-rows` never takes a staged picture in. Its list, `stage.json`, holds
// each upload's role, sex and Class as its folders say (`media/inbox/hero/<sex>/<class>/`), its
// picture's and thumbnail's sizes, what was cropped or drawn up, and the pictures in the register
// and the other uploads it is near. Nothing live changes: `write-rows` converts each upload again
// from its original, so a staged picture is a copy to read, never one taken in.
//
// A run goes on where the last left off: an upload whose bytes are unchanged and whose staged files
// are there is not converted again, and an entry whose upload has left the inbox (taken in, or
// removed) is dropped with its files. An upload that cannot be converted is listed, and the rest go on.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatJson } from '@heroesim/content/write';
import { capitalised } from '@heroesim/words';
import { dataUrlOf, dataUrlOfBytes, type Chromium } from './chromium.js';
import { convert, picture as pictureSize, Refusal, thumbnail as thumbnailSize } from './convert.js';
import { fingerprint, pack, packedDistance, type Fingerprint, type PackedFingerprint } from './fingerprint.js';
import { isSex, readRegistry, roles, type Role, type Sex, type Status } from './registry.js';

/** Where staged pictures go, under a repository's root, unless `--out` says otherwise. */
export const stagedFolder = path.join('media', 'inbox', 'staged');

/** The list of a staging folder, in it. */
export const manifestName = 'stage.json';

/** How many uploads are converted between two writes of the list, so a run stopped loses little. */
const saveEvery = 25;

/** What a staged upload's folders, shape or size leave for the owner to see. */
export interface StageWarning {
  code: 'no-sex' | 'no-class' | 'not-a-class' | 'cropped' | 'drawn-up';
  message: string;
}

/** A staged picture or thumbnail: its file, relative to the root, its bytes and the quality it took. */
export interface StagedFile {
  file: string;
  bytes: number;
  quality: number;
}

/** One upload, as `stage.json` lists it. */
export interface StagedUpload {
  /** The upload, relative to the root. */
  source: string;
  /** The upload's bytes' SHA-256: a changed upload is converted again. */
  sha256: string;
  role: Role;
  /** The sex its folder says, or `null` where it has no `male/` or `female/`. */
  sex: Sex | null;
  /** A Hero's Class as its folder says, or `null`; always `null` for a Guildmaster. */
  class: string | null;
  /** `staged`; `refused`, where it cannot fit at the lowest quality; or `failed`. */
  status: 'staged' | 'refused' | 'failed';
  /** Why it was refused or failed, beginning with the upload's path; `null` where it is staged. */
  problem: string | null;
  natural: { width: number; height: number } | null;
  picture: StagedFile | null;
  thumbnail: StagedFile | null;
  warnings: StageWarning[];
  /** Its staged picture's fingerprint, as the register would hold it. */
  fingerprint: Fingerprint | null;
  /** The keys in the register within `similarWithin` bits, nearest first; a retired one has no picture. */
  similar: { key: string; status: Status; distance: number }[];
  /** The other staged uploads within `similarWithin` bits, nearest first. */
  similarUploads: { source: string; distance: number }[];
}

/** `stage.json`. */
export interface Manifest {
  /** The sizes it was staged at: a change to either stages every upload again. */
  sizes: { picture: typeof pictureSize; thumbnail: typeof thumbnailSize };
  similarWithin: number;
  uploads: StagedUpload[];
}

/** A run of `stage`: every upload the list holds after it, without the fingerprints. */
export interface StageResult {
  /** The staging folder and its list, relative to the root where they lie in it. */
  out: string;
  manifest: string;
  similarWithin: number;
  counts: { uploads: number; staged: number; refused: number; failed: number; converted: number; removed: number };
  /** The uploads whose entries were dropped, since they have left the inbox. */
  removed: string[];
  uploads: (Omit<StagedUpload, 'fingerprint'> & { converted: boolean })[];
}

function shown(root: string, file: string): string {
  return path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
}

/** A path as the filesystem may match it: Windows' and macOS's ignore case. */
function same(file: string): string {
  return path.resolve(file).toLowerCase();
}

function inside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** The Classes' keys, from `content/classes.json`. */
function classKeys(root: string): string[] {
  const file = path.join(root, 'content', 'classes.json');
  try {
    return Object.keys(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>);
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** A list of words joined as a sentence: `warrior, rogue, mage or healer`. */
function either(words: readonly string[]): string {
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}`;
}

/**
 * An upload's role, sex and Class as its folders say: `media/inbox/<role>/[<sex>/][<class>/]`, the
 * Class a Hero's only. A missing sex or Class, or a folder that is no Class, is a warning.
 */
function foldersOf(inbox: string, file: string, classes: readonly string[]): { role: Role; sex: Sex | null; class: string | null; warnings: StageWarning[] } | null {
  const [roleFolder, ...rest] = path.relative(inbox, file).split(path.sep);
  const role = (Object.keys(roles) as Role[]).find((each) => roles[each].inbox === roleFolder);
  if (role === undefined || rest.length === 0) return null;
  const folders = rest.slice(0, -1);
  const warnings: StageWarning[] = [];
  const sex = isSex(folders[0]) ? folders[0] : null;
  if (sex === null) warnings.push({ code: 'no-sex', message: 'its folders name no sex: put it in male/ or female/' });
  if (role !== 'hero') return { role, sex, class: null, warnings };
  const classFolder = (sex === null ? folders : folders.slice(1))[0];
  if (classFolder === undefined) {
    warnings.push({ code: 'no-class', message: `its folders name no Class: put it in a Class's folder, such as hero/${sex ?? 'female'}/${classes[0] ?? 'warrior'}/` });
    return { role, sex, class: null, warnings };
  }
  if (!classes.includes(classFolder)) {
    warnings.push({ code: 'not-a-class', message: `its folder ${classFolder}/ is no Class: the Classes are ${either(classes)}` });
    return { role, sex, class: null, warnings };
  }
  return { role, sex, class: classFolder, warnings };
}

/** What an upload's shape and size do to it: cropped to 3 × 4, or drawn up to 480 × 640. */
function shapeWarnings(natural: { width: number; height: number }): StageWarning[] {
  const { width, height } = natural;
  const aspect = pictureSize.width / pictureSize.height;
  const warnings: StageWarning[] = [];
  const ratio = width / height;
  if (Math.abs(ratio / aspect - 1) > 0.01) {
    const wide = ratio > aspect;
    const lost = wide ? 1 - (aspect * height) / width : 1 - width / aspect / height;
    const percent = Math.round(lost * 1000) / 10;
    warnings.push({
      code: 'cropped',
      message: wide
        ? `it is ${width} × ${height}, not 3 × 4: ${percent}% of its width is cropped, half from each side`
        : `it is ${width} × ${height}, not 3 × 4: ${percent}% of its height is cropped, half from the top and half from the bottom`,
    });
  }
  // The part kept, cropped to 3 × 4, against the picture it is drawn as.
  const kept = Math.min(width / aspect, height);
  if (kept < pictureSize.height) {
    warnings.push({
      code: 'drawn-up',
      message: `it is ${width} × ${height}, smaller than ${pictureSize.width} × ${pictureSize.height}: it is drawn up, and may look soft`,
    });
  }
  return warnings;
}

/** An upload's staged picture and thumbnail: its path in the inbox, under the staging folder. */
function stagedPaths(inbox: string, out: string, file: string): { picture: string; thumbnail: string } {
  const relative = path.relative(inbox, file);
  const base = path.join(out, path.dirname(relative), path.basename(relative, path.extname(relative)));
  return { picture: `${base}.webp`, thumbnail: `${base}.thumb.webp` };
}

/** The list a staging folder holds, by upload; empty where there is none, or it was staged at other sizes. */
function readManifest(file: string): Map<string, StagedUpload> {
  if (!existsSync(file)) return new Map();
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}; remove it to stage every upload again`, { cause: error });
  }
  const sizes = JSON.stringify({ picture: pictureSize, thumbnail: thumbnailSize });
  if (JSON.stringify(manifest.sizes) !== sizes || !Array.isArray(manifest.uploads)) return new Map();
  return new Map(manifest.uploads.map((upload) => [upload.source, upload]));
}

/** Writes the list whole, through a file beside it, so a run stopped midway never leaves half of one. */
function writeManifest(file: string, similarWithin: number, entries: ReadonlyMap<string, StagedUpload>): void {
  const manifest: Manifest = {
    sizes: { picture: pictureSize, thumbnail: thumbnailSize },
    similarWithin,
    uploads: [...entries.values()].sort((a, b) => a.source.localeCompare(b.source)),
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, formatJson(manifest));
  renameSync(`${file}.part`, file);
}

function removeStaged(paths: { picture: string; thumbnail: string }): void {
  rmSync(paths.picture, { force: true });
  rmSync(paths.thumbnail, { force: true });
}

/**
 * Stages each upload named (absolute paths, each under `media/inbox/<role>/`): converts it, as
 * `write-rows` would, into the staging folder, fingerprints its picture, and lists it in
 * `stage.json` with every upload staged before; then finds, for every upload listed, the pictures in
 * the register and the other uploads it is near. Files inside the staging folder are passed over.
 *
 * @throws Error where an upload named lies outside `media/inbox/<role>/`, before anything changes
 */
export async function stage(
  root: string,
  files: readonly string[],
  chromium: Chromium,
  options: { out?: string; progress?: (done: number, total: number) => void } = {},
): Promise<StageResult> {
  const inbox = path.join(root, 'media', 'inbox');
  const out = path.resolve(root, options.out ?? stagedFolder);
  const manifestFile = path.join(out, manifestName);
  const registry = readRegistry(root);
  const { similarWithin } = registry.fingerprint;
  const classes = classKeys(root);

  const uploads = [...new Set(files.map((file) => path.resolve(file)))].filter((file) => !inside(out, file));
  const outside = uploads.filter((file) => foldersOf(inbox, file, classes) === null);
  if (outside.length > 0) {
    throw new Error(`Only uploads in media/inbox/<role>/ are staged, and these are not:\n  ${outside.map((file) => shown(root, file)).join('\n  ')}`);
  }

  const entries = readManifest(manifestFile);
  const removed: string[] = [];
  for (const source of [...entries.keys()]) {
    if (existsSync(path.resolve(root, source))) continue;
    removeStaged(stagedPaths(inbox, out, path.resolve(root, source)));
    entries.delete(source);
    removed.push(source);
  }

  // Each staged picture's path, by the upload that has it: two uploads named alike, `a.png` and
  // `a.jpg`, would be staged as one, so the one staged first keeps it and the other fails.
  const owners = new Map<string, string>();
  for (const entry of entries.values()) {
    if (entry.status === 'staged') owners.set(same(stagedPaths(inbox, out, path.resolve(root, entry.source)).picture), entry.source);
  }

  const converted = new Set<string>();
  let done = 0;
  let drawn = 0;
  for (const file of uploads) {
    const source = shown(root, file);
    const bytes = readFileSync(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const folders = foldersOf(inbox, file, classes);
    if (folders === null) continue;
    const paths = stagedPaths(inbox, out, file);
    const base = { source, sha256, role: folders.role, sex: folders.sex, class: folders.class };
    const blank = { natural: null, picture: null, thumbnail: null, fingerprint: null };
    const near = { similar: [], similarUploads: [] };
    const owner = owners.get(same(paths.picture));
    done += 1;
    if (owner !== undefined && owner !== source) {
      entries.set(source, {
        ...base,
        ...blank,
        status: 'failed',
        problem: `${source}: its staged picture, ${shown(root, paths.picture)}, would be the same as the upload ${owner}'s: rename one`,
        warnings: folders.warnings,
        ...near,
      });
      options.progress?.(done, uploads.length);
      continue;
    }
    owners.set(same(paths.picture), source);

    const previous = entries.get(source);
    const unchanged =
      previous !== undefined &&
      previous.sha256 === sha256 &&
      (previous.status === 'refused' || (previous.status === 'staged' && existsSync(paths.picture) && existsSync(paths.thumbnail)));
    if (unchanged) {
      options.progress?.(done, uploads.length);
      continue;
    }

    drawn += 1;
    try {
      const result = await convert(chromium, dataUrlOf(file), source);
      mkdirSync(path.dirname(paths.picture), { recursive: true });
      writeFileSync(paths.picture, result.picture.bytes);
      writeFileSync(paths.thumbnail, result.thumbnail.bytes);
      const print = await fingerprint(chromium, dataUrlOfBytes(result.picture.bytes, 'image/webp'));
      entries.set(source, {
        ...base,
        status: 'staged',
        problem: null,
        natural: result.picture.natural,
        picture: { file: shown(root, paths.picture), bytes: result.picture.bytes.length, quality: result.picture.quality ?? 0 },
        thumbnail: { file: shown(root, paths.thumbnail), bytes: result.thumbnail.bytes.length, quality: result.thumbnail.quality ?? 0 },
        warnings: [...folders.warnings, ...shapeWarnings(result.picture.natural)],
        fingerprint: print,
        ...near,
      });
      converted.add(source);
    } catch (error) {
      removeStaged(paths);
      const reason = error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
      entries.set(source, {
        ...base,
        ...blank,
        status: error instanceof Refusal ? 'refused' : 'failed',
        problem: error instanceof Refusal ? reason : `${source}: it could not be drawn (${reason})`,
        warnings: folders.warnings,
        ...near,
      });
    }
    options.progress?.(done, uploads.length);
    if (drawn % saveEvery === 0) writeManifest(manifestFile, similarWithin, entries);
  }

  // Every upload listed against the register and against each other, each pair once.
  const register = Object.entries(registry.portraits).map(([key, entry]) => ({ key, status: entry.status, print: pack(entry) }));
  const printed: { entry: StagedUpload; print: PackedFingerprint }[] = [];
  for (const entry of entries.values()) {
    entry.similar = [];
    entry.similarUploads = [];
    if (entry.fingerprint !== null) printed.push({ entry, print: pack(entry.fingerprint) });
  }
  for (const [index, { entry, print }] of printed.entries()) {
    for (const { key, status, print: other } of register) {
      const bits = packedDistance(print, other);
      if (bits <= similarWithin) entry.similar.push({ key, status, distance: bits });
    }
    for (const { entry: otherEntry, print: other } of printed.slice(index + 1)) {
      const bits = packedDistance(print, other);
      if (bits > similarWithin) continue;
      entry.similarUploads.push({ source: otherEntry.source, distance: bits });
      otherEntry.similarUploads.push({ source: entry.source, distance: bits });
    }
  }
  const nearest = <T extends { distance: number }>(list: T[], name: (each: T) => string): T[] =>
    list.sort((a, b) => a.distance - b.distance || name(a).localeCompare(name(b)));
  for (const entry of entries.values()) {
    nearest(entry.similar, (each) => each.key);
    nearest(entry.similarUploads, (each) => each.source);
  }
  writeManifest(manifestFile, similarWithin, entries);

  const listed = [...entries.values()].sort((a, b) => a.source.localeCompare(b.source));
  const count = (status: StagedUpload['status']): number => listed.filter((entry) => entry.status === status).length;
  return {
    out: shown(root, out),
    manifest: shown(root, manifestFile),
    similarWithin,
    counts: {
      uploads: listed.length,
      staged: count('staged'),
      refused: count('refused'),
      failed: count('failed'),
      converted: converted.size,
      removed: removed.length,
    },
    removed: removed.sort(),
    uploads: listed.map((entry) => {
      // The fingerprints stay in stage.json: a thousand of them would fill the output.
      const shownEntry: Partial<Pick<StagedUpload, 'fingerprint'>> & Omit<StagedUpload, 'fingerprint'> = { ...entry };
      delete shownEntry.fingerprint;
      return { ...shownEntry, converted: converted.has(entry.source) };
    }),
  };
}

/** A run of `stage`, for a person: the counts, each role and sex by Class, then what wants a look. */
export function stageText(result: StageResult): string[] {
  const { counts } = result;
  const lines = [
    `Staged in ${result.out}/, listed in ${result.manifest}: ${counts.uploads} ${counts.uploads === 1 ? 'upload' : 'uploads'}`,
    `  This run: ${counts.converted} converted, ${counts.removed} removed, since their uploads have left the inbox`,
    `  Staged ${counts.staged}, refused ${counts.refused}, failed ${counts.failed}`,
  ];
  const groups = new Map<string, Map<string, number>>();
  for (const upload of result.uploads.filter((each) => each.status === 'staged')) {
    const group = `${capitalised(upload.role)}, ${upload.sex ?? 'no sex'}`;
    const classes = groups.get(group) ?? new Map<string, number>();
    const name = upload.role === 'hero' ? (upload.class ?? 'no Class') : 'all';
    classes.set(name, (classes.get(name) ?? 0) + 1);
    groups.set(group, classes);
  }
  for (const [group, classes] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${group}: ${[...classes].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name} ${count}`).join(', ')}`);
  }
  const refused = result.uploads.filter((each) => each.status === 'refused');
  if (refused.length > 0) lines.push('Refused, and left in the inbox:', ...refused.map((each) => `  ${each.problem ?? each.source}`));
  const failed = result.uploads.filter((each) => each.status === 'failed');
  if (failed.length > 0) lines.push('Failed, and left in the inbox:', ...failed.map((each) => `  ${each.problem ?? each.source}`));
  const warned = result.uploads.filter((each) => each.warnings.length > 0);
  if (warned.length > 0) lines.push('Warnings:', ...warned.flatMap((each) => each.warnings.map((warning) => `  ${each.source}: ${warning.message}`)));
  const near = result.uploads.filter((each) => each.similar.length > 0 || each.similarUploads.length > 0);
  if (near.length > 0) {
    lines.push(`Near another picture (within ${result.similarWithin} bits), for a reader to judge:`);
    for (const each of near) {
      const names = [
        ...each.similar.map((match) => `${match.key}${match.status === 'retired' ? ' (retired)' : ''} (${match.distance})`),
        ...each.similarUploads.map((match) => `the upload ${match.source} (${match.distance})`),
      ];
      lines.push(`  ${each.source}: ${names.join(', ')}`);
    }
  }
  return lines;
}
