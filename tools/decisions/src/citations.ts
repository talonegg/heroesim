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

/** The file kinds read for citations: text, never a picture or a font, and the ignore files by name. */
const textExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.yml', '.yaml', '.html', '.css', '.txt', '.gitignore', '.rgignore']);

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

/** The repository's files as git lists them: tracked, or new and not ignored, with `/`. */
function listed(root: string): string[] {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return [...new Set(files.split('\0').filter(Boolean))];
}

/** Every path in the repository as git lists it, with the folders that hold its files and the root, `.`. */
export function repositoryPaths(root: string): Set<string> {
  const paths = new Set<string>(['.']);
  for (const file of listed(root).filter((file) => existsSync(path.join(root, file)))) {
    for (let at = file; at !== '.' && !paths.has(at); at = path.posix.dirname(at)) paths.add(at);
  }
  return paths;
}

/**
 * The repository's files of the kinds `extensions` names, by extension or, for a dotfile such as
 * `.gitignore`, by name, as git lists them: tracked, or new and not ignored.
 */
export function repositoryFiles(root: string, extensions: Iterable<string>): { file: string; text: string }[] {
  const kinds = new Set(extensions);
  return listed(root)
    .filter((file) => kinds.has(path.extname(file)) || kinds.has(path.posix.basename(file)))
    .filter((file) => existsSync(path.join(root, file)) && statSync(path.join(root, file)).isFile())
    .map((file) => ({ file, text: readFileSync(path.join(root, file), 'utf8') }));
}

/** The repository's text files, as git lists them. */
export function repositoryTexts(root: string): { file: string; text: string }[] {
  return repositoryFiles(root, textExtensions);
}

/** The citations under `root` that name no entry. */
export function unknownInRepository(root: string): Citation[] {
  const known = new Set(readLog(root).entries.map((entry) => entry.number));
  return unknownCitations(repositoryTexts(root), known);
}
