// Every `DL-nn` the repository cites names an entry (DL-215): code comments, docs, the config's
// changelog and commit-ready files cite entries by id alone, so an id with no entry is a citation that
// leads nowhere. The files read are git's, tracked or new and not ignored.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readLog } from './log.js';

export interface Citation {
  number: number;
  file: string;
  line: number;
}

/** The file kinds read for citations: text, never a picture or a font. */
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.yml', '.yaml', '.html', '.css', '.txt']);

const citation = /\bDL-(\d+)\b/g;

/** The citations in `text`, by line. */
export function citationsIn(text: string, file: string): Citation[] {
  const found: Citation[] = [];
  text.split(/\r?\n/).forEach((line, at) => {
    for (const match of line.matchAll(citation)) found.push({ number: Number(match[1]), file, line: at + 1 });
  });
  return found;
}

/** The citations among `files` of an id that is no entry's. */
export function unknownCitations(files: readonly { file: string; text: string }[], known: ReadonlySet<number>): Citation[] {
  return files.flatMap(({ file, text }) => citationsIn(text, file)).filter((cited) => !known.has(cited.number));
}

/** The repository's text files, as git lists them: tracked, or new and not ignored. */
export function repositoryTexts(root: string): { file: string; text: string }[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return [...new Set(listed.split('\0').filter(Boolean))]
    .filter((file) => textExtensions.has(path.extname(file)))
    .filter((file) => existsSync(path.join(root, file)) && statSync(path.join(root, file)).isFile())
    .map((file) => ({ file, text: readFileSync(path.join(root, file), 'utf8') }));
}

/** The citations under `root` that name no entry. */
export function unknownInRepository(root: string): Citation[] {
  const known = new Set(readLog(root).entries.map((entry) => entry.number));
  return unknownCitations(repositoryTexts(root), known);
}
