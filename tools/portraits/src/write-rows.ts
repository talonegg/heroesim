// `write-rows <draft.json>` (DL-135 item 11, v1.1.3-S2): the rest of intake once the agents have
// read each upload and agreed its row, as one transaction, undone as a whole on any failure:
// 1. each upload is converted, to its picture and thumbnail;
// 2. it is named by `nextKey`, and registered with its fingerprint;
// 3. its key is listed in `content/portraits.json`, and its row added to
//    `content/portrait-appearances.json`;
// 4. the content version is raised;
// 5. the content's checks and `check` are run;
// 6. the intake report is written, and the uploads taken in are deleted.
// The draft's shape is in this package's README.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { contentChecks, editJson, NotUndone, raiseContentVersion, transaction, Undone } from '@heroesim/content/write';
import { capitalised } from '@heroesim/words';
import { dataUrlOf, isPicture, type Chromium } from './chromium.js';
import { check } from './check.js';
import { convert } from './convert.js';
import { fingerprint } from './fingerprint.js';
import { datePattern, intakeDir, nextRun, today } from './records.js';
import { formatRegistry, isRole, isSex, nextKey, picturePaths, readRegistry, registryPath, roles, sexes, type Role, type Sex } from './registry.js';
import { DraftError } from './errors.js';

/** One upload in a draft: where it is, its sex where the draft says it, and its drafted row. */
export interface DraftPicture {
  source: string;
  sex?: Sex;
  role?: Role;
  row: Record<string, unknown>;
}

/** The agents' draft of an intake. */
export interface Draft {
  date?: string;
  pictures: DraftPicture[];
  report: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An upload's role and sex as its inbox folders say: `media/inbox/<role>/[<sex>/]`. */
export function inboxFolders(root: string, source: string): { role: Role; sex: Sex | null } | null {
  const inbox = path.join(root, 'media', 'inbox');
  const relative = path.relative(inbox, path.resolve(root, source));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const [folder, second, ...rest] = relative.split(path.sep);
  const role = (Object.keys(roles) as Role[]).find((each) => roles[each].inbox === folder);
  if (role === undefined || second === undefined) return null;
  return { role, sex: rest.length > 0 && isSex(second) ? second : null };
}

/** Reads and checks a draft's shape, and each upload's place in the inbox. */
export function parseDraft(root: string, json: unknown): Draft & { pictures: (DraftPicture & { role: Role; sex: Sex; folderSex: Sex | null })[] } {
  const problems: string[] = [];
  if (!isObject(json)) throw new DraftError(['the draft is not an object']);
  if (json.date !== undefined && (typeof json.date !== 'string' || !datePattern.test(json.date))) problems.push('date: not YYYY-MM-DD');
  if (typeof json.report !== 'string' || json.report.trim().length === 0) problems.push('report: the report\'s text is wanted');
  if (!Array.isArray(json.pictures)) problems.push('pictures: a list is wanted');
  const pictures: (DraftPicture & { role: Role; sex: Sex; folderSex: Sex | null })[] = [];
  const seen = new Set<string>();
  for (const [index, picture] of (Array.isArray(json.pictures) ? json.pictures : []).entries()) {
    const where = `pictures[${index}]`;
    if (!isObject(picture)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    const { source, sex, role, row } = picture;
    if (typeof source !== 'string') {
      problems.push(`${where}.source: the upload's path is wanted`);
      continue;
    }
    const full = path.resolve(root, source);
    if (seen.has(full)) problems.push(`${where}.source: ${source} is named twice`);
    seen.add(full);
    if (!existsSync(full)) problems.push(`${where}.source: ${source} does not exist`);
    else if (!isPicture(full)) problems.push(`${where}.source: ${source} is not a JPEG, PNG or WebP`);
    const folders = inboxFolders(root, source);
    if (folders === null) {
      problems.push(`${where}.source: ${source} is not in media/inbox/<role>/, which says its role`);
      continue;
    }
    if (role !== undefined && role !== folders.role) problems.push(`${where}.role: ${String(role)}, and its inbox folder says ${folders.role}`);
    if (sex !== undefined && !isSex(sex)) problems.push(`${where}.sex: ${sexes.join(' or ')}`);
    const resolvedSex = isSex(sex) ? sex : folders.sex;
    if (resolvedSex === null) problems.push(`${where}.sex: wanted, since its inbox folder has no male/ or female/`);
    if (!isObject(row)) problems.push(`${where}.row: the picture's row, an object, is wanted`);
    if (resolvedSex !== null && isObject(row) && isRole(folders.role)) {
      pictures.push({ source, role: folders.role, sex: resolvedSex, folderSex: folders.sex, row });
    }
  }
  if (problems.length > 0) throw new DraftError(problems);
  return { ...(typeof json.date === 'string' ? { date: json.date } : {}), report: json.report as string, pictures };
}

/** One upload taken in. */
export interface TakenIn {
  source: string;
  key: string;
  role: Role;
  sex: Sex;
  /** The inbox folder's sex, where it has one and the draft's differs. */
  folderSex: Sex | null;
  picture: { bytes: number; quality: number | null };
  thumbnail: { bytes: number; quality: number | null };
  hash: string;
}

export interface Intake {
  run: string;
  report: string;
  contentVersion: { from: number; to: number } | null;
  pictures: TakenIn[];
}

function shown(root: string, file: string): string {
  return path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
}

/** The intake report: the draft's text, its `{{key:<n>}}` given each picture's key, and a table. */
export function intakeReport(root: string, run: string, draft: Draft, taken: readonly TakenIn[], version: Intake['contentVersion']): string {
  const text = draft.report.replace(/\{\{key:(\d+)\}\}/g, (whole, index: string) => taken[Number(index)]?.key ?? whole).trim();
  const lines = [`# Portrait intake ${run}`, '', text, '', '## Taken in', ''];
  if (taken.length === 0) lines.push('No picture was taken in, and nothing changed but this report.');
  else {
    lines.push('| Upload | Key | Role | Sex | Picture | Thumbnail |', '| --- | --- | --- | --- | --- | --- |');
    for (const each of taken) {
      const sex = each.folderSex !== null && each.folderSex !== each.sex ? `${capitalised(each.sex)} (its folder says ${each.folderSex})` : capitalised(each.sex);
      lines.push(
        `| \`${shown(root, each.source)}\` | \`${each.key}\` | ${capitalised(each.role)} | ${sex} | ` +
          `${each.picture.bytes} bytes at ${each.picture.quality} | ${each.thumbnail.bytes} bytes at ${each.thumbnail.quality} |`,
      );
    }
    if (version !== null) lines.push('', `The content version went from ${version.from} to ${version.to}.`);
  }
  lines.push('', 'Written by `npm run portraits -- write-rows` from the agents\' draft.', '');
  return lines.join('\n');
}

/**
 * Takes a draft's uploads in, as one transaction.
 *
 * @throws DraftError before anything changes, for a draft that cannot be taken
 * @throws Undone after undoing every change, naming each problem
 */
export async function writeRows(root: string, json: unknown, chromium: Chromium, options: { date?: string } = {}): Promise<Intake> {
  const draft = parseDraft(root, json);
  const date = options.date ?? draft.date ?? today();
  const run = nextRun(intakeDir(root), date);
  const reportFile = path.join(intakeDir(root), `${run}.md`);
  try {
    return await transaction(async (files) => {
      const taken: TakenIn[] = [];
      let version: Intake['contentVersion'] = null;
      if (draft.pictures.length > 0) {
        let registry = readRegistry(root);
        const portraitsFile = path.join(root, 'content', 'portraits.json');
        const appearancesFile = path.join(root, 'content', 'portrait-appearances.json');
        const portraitsText = readFileSync(portraitsFile, 'utf8');
        const appearancesText = readFileSync(appearancesFile, 'utf8');
        const portraits = JSON.parse(portraitsText) as Record<string, Record<string, string[]>>;
        const appearances = JSON.parse(appearancesText) as { portraits: Record<string, unknown> };
        for (const picture of draft.pictures) {
          const source = path.resolve(root, picture.source);
          const converted = await convert(chromium, dataUrlOf(source), shown(root, source));
          const key = nextKey(registry, picture.role, picture.sex);
          const { hash, trimmed } = await fingerprint(chromium, `data:image/webp;base64,${converted.picture.bytes.toString('base64')}`);
          const paths = picturePaths(root, picture.role, picture.sex, key);
          files.write(paths.picture, converted.picture.bytes);
          files.write(paths.thumbnail, converted.thumbnail.bytes);
          registry = { ...registry, portraits: { ...registry.portraits, [key]: { role: picture.role, sex: picture.sex, status: 'live', hash, trimmed } } };
          const bySex = (portraits[picture.role] ??= {});
          (bySex[picture.sex] ??= []).push(key);
          appearances.portraits[key] = picture.row;
          taken.push({
            source: picture.source,
            key,
            role: picture.role,
            sex: picture.sex,
            folderSex: picture.folderSex,
            picture: { bytes: converted.picture.bytes.length, quality: converted.picture.quality },
            thumbnail: { bytes: converted.thumbnail.bytes.length, quality: converted.thumbnail.quality },
            hash,
          });
        }
        files.write(registryPath(root), formatRegistry(registry));
        // Each file keeps its own layout, so its diff is the key and the row added (v1.1.3-S3).
        files.write(portraitsFile, editJson(portraitsText, portraits));
        files.write(appearancesFile, editJson(appearancesText, appearances));
        version = raiseContentVersion(root, files, `the portrait tool's intake ${run} (\`docs/portraits/intake/${run}.md\`)`);

        const content = contentChecks(root);
        const tool = check(root);
        const problems = [...content.problems, ...tool.failures.map((failure) => failure.message)];
        if (problems.length > 0) throw new Undone(problems, 'The intake');
      }
      files.write(reportFile, intakeReport(root, run, draft, taken, version));
      for (const picture of draft.pictures) files.remove(path.resolve(root, picture.source));
      return { run, report: shown(root, reportFile), contentVersion: version, pictures: taken };
    });
  } catch (error) {
    if (error instanceof Undone || error instanceof NotUndone) throw error;
    throw new Undone([error instanceof Error ? error.message : String(error)], 'The intake');
  }
}
