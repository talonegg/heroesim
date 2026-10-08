// Every relative link in the repository's Markdown leads to a file (DL-218): documents move between
// the live folders and the archives, and a link left behind leads nowhere. The files read are git's,
// tracked or new and not ignored; a web address, a mail address and a link within the page are not
// followed.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from './citations.js';

export interface BrokenLink {
  file: string;
  line: number;
  target: string;
}

const link = /\]\(([^)\s]+)\)/g;
const notAFile = /^(https?:|mailto:|#)/;

/** The relative links in `text`, a Markdown file at `file`, whose target `exists` says is missing. */
export function brokenLinksIn(text: string, file: string, exists: (target: string) => boolean): BrokenLink[] {
  const broken: BrokenLink[] = [];
  text.split(/\r?\n/).forEach((line, at) => {
    for (const match of line.matchAll(link)) {
      const target = match[1] ?? '';
      if (notAFile.test(target)) continue;
      const resolved = path.posix.join(path.posix.dirname(file), decodeURI(target.split('#')[0] ?? ''));
      if (!exists(resolved)) broken.push({ file, line: at + 1, target });
    }
  });
  return broken;
}

/** The broken relative links in the repository's Markdown under `root`. */
export function brokenLinksInRepository(root: string): BrokenLink[] {
  return repositoryFiles(root, ['.md']).flatMap(({ file, text }) =>
    brokenLinksIn(text, file, (target) => existsSync(path.join(root, target))),
  );
}
