// Every relative link in the repository's Markdown leads to a file (DL-218): documents move between
// the live folders and the archives, and a link left behind leads nowhere. The files read, and the
// files a link may lead to, are git's, tracked or new and not ignored, in their own case: a file on
// one disk alone, ignored or generated, is no target. A web address, a mail address and a link within
// the page are not followed, nor a link inside code.

import path from 'node:path';
import { repositoryFiles, repositoryPaths } from './citations.js';

export interface BrokenLink {
  file: string;
  line: number;
  target: string;
}

/** An inline link's target, bare or in angle brackets, before an optional title. */
const inline = /\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
/** A reference-style link's definition, `[label]: target`. */
const reference = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const codeSpan = /(`+)[^`][\s\S]*?\1|``/g;
const fence = /^ {0,3}(```|~~~)/;
const notAFile = /^(https?:|mailto:|#)/;

/** Where `target`, linked from `file`, leads: from the repository root when it begins with `/`; `null` when it is not a path. */
function resolve(target: string, file: string): string | null {
  const bare = target.replace(/^<|>$/g, '').split('#')[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURI(bare);
  } catch {
    return null;
  }
  return decoded.startsWith('/') ? path.posix.normalize(decoded.slice(1)) : path.posix.join(path.posix.dirname(file), decoded);
}

/** The relative links in `text`, a Markdown file at `file`, whose target `exists` says is missing. */
export function brokenLinksIn(text: string, file: string, exists: (target: string) => boolean): BrokenLink[] {
  const broken: BrokenLink[] = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, at) => {
    if (fence.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const prose = line.replace(codeSpan, (span) => ' '.repeat(span.length));
    const targets = [...prose.matchAll(inline)].map((match) => match[1] ?? '');
    const defined = reference.exec(prose)?.[1];
    if (defined !== undefined) targets.push(defined);
    for (const target of targets) {
      if (notAFile.test(target)) continue;
      const resolved = resolve(target, file);
      if (resolved === null || !exists(resolved)) broken.push({ file, line: at + 1, target: target.replace(/^<|>$/g, '') });
    }
  });
  return broken;
}

/** The broken relative links in the repository's Markdown under `root`. */
export function brokenLinksInRepository(root: string): BrokenLink[] {
  const present = repositoryPaths(root);
  return repositoryFiles(root, ['.md']).flatMap(({ file, text }) => brokenLinksIn(text, file, (target) => present.has(target.replace(/\/$/, ''))));
}
