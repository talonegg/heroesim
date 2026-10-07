// `npm run decisions -- <command>` (DL-215): `index` writes the decision index from the log's
// headings; `check` says whether the index is current and every cited `DL-nn` names an entry.
// Exit codes: 0 done, 1 a check failed, 2 a usage error.

import { fileURLToPath } from 'node:url';
import { unknownInRepository } from './citations.js';
import { indexFreshness, writeIndex } from './index-page.js';
import { indexPath } from './log.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

/** The repository this tool sits in. */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

const usage = [
  'Usage: npm run decisions -- <command>',
  '',
  '  index   write docs/decisions/index.md from the entries\' headings',
  '  check   the index current, and every DL-nn cited in the repository an entry',
].join('\n');

export function run(argv: readonly string[], io: Io, root: string = repositoryRoot): number {
  const [command, ...rest] = argv;
  if (rest.length > 0 || (command !== 'index' && command !== 'check')) {
    if (command === undefined || command === 'help' || command === '--help') {
      io.out(usage);
      return 0;
    }
    io.err(usage);
    return 2;
  }
  if (command === 'index') {
    const written = writeIndex(root);
    if (!written.ok) {
      for (const problem of written.problems) io.err(problem);
      return 1;
    }
    io.out(written.changed ? `Wrote ${indexPath}.` : `${indexPath} is current.`);
    return 0;
  }
  const fresh = indexFreshness(root);
  const unknown = unknownInRepository(root);
  for (const problem of fresh.problems) io.err(problem);
  for (const cited of unknown) io.err(`${cited.file}:${cited.line}: DL-${cited.number} is no entry`);
  if (fresh.ok && unknown.length === 0) {
    io.out('The index is current, and every cited DL-nn is an entry.');
    return 0;
  }
  return 1;
}
