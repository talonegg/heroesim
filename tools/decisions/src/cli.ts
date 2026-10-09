// `npm run decisions -- <command>` (DL-215): `index` writes the decision index from the log's
// headings; `check` says whether the index is current, every cited `DL-nn` names an entry, every
// relative link in the repository's Markdown leads to a file (DL-218), the open log's entries keep
// to the lean template, and the source tells no history by a story and cites stories on no more lines
// than its baseline (DL-219).
// Exit codes: 0 done, 1 a check failed, 2 a usage error.

import { fileURLToPath } from 'node:url';
import { unknownInRepository } from './citations.js';
import { indexFreshness, writeIndex } from './index-page.js';
import { leanProblemsInLog } from './lean.js';
import { brokenLinksInRepository } from './links.js';
import { indexPath } from './log.js';
import { baselinePath, storyReport } from './stories.js';

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
  '  check   the index current, every cited DL-nn an entry, no broken link, a lean log, no story history',
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
  const broken = brokenLinksInRepository(root);
  const lean = leanProblemsInLog(root);
  const stories = storyReport(root);
  const overBaseline = stories.cited > stories.baseline;
  // A ratchet: lines freed by a rewrite are not left for new citations to fill.
  const underBaseline = stories.cited < stories.baseline;
  for (const problem of fresh.problems) io.err(problem);
  for (const cited of unknown) io.err(`${cited.file}:${cited.line}: DL-${cited.number} is no entry`);
  for (const link of broken) io.err(`${link.file}:${link.line}: ${link.target} leads to no file`);
  for (const problem of lean) io.err(problem);
  for (const told of stories.history) io.err(`${told.file}:${told.line}: tells history by a story: ${told.text}`);
  if (overBaseline) io.err(`${stories.cited} source lines cite a story, over the baseline of ${stories.baseline} (${baselinePath}): cite the DL entry instead`);
  if (underBaseline) io.err(`${stories.cited} source lines cite a story, under the baseline of ${stories.baseline} (${baselinePath}): lower it to ${stories.cited}`);
  if (fresh.ok && unknown.length === 0 && broken.length === 0 && lean.length === 0 && stories.history.length === 0 && !overBaseline && !underBaseline) {
    io.out(`The index is current, every cited DL-nn is an entry, every link leads to a file, the open log is lean, and ${stories.cited} source lines cite a story (baseline ${stories.baseline}).`);
    return 0;
  }
  return 1;
}
