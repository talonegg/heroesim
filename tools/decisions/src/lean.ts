// The lean entry (DL-219): from DL-215 on, an entry of the open log keeps to the template its header
// gives, a decision and its reasons with a short Evidence, at most `leanBytes`. A build journal, test
// counts, mutation runs, doctor readings and sweep figures go to the commit message and the harness's
// reports, which the Evidence names.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { logPath } from './log.js';

/** The first entry held to the template. */
export const leanFrom = 215;

/** The most bytes an entry holds, its heading included. */
export const leanBytes = 6 * 1024;

/** The paragraphs every entry has, in its own words' bold. */
export const leanSections = ['**Context.**', '**Decision.**', '**Consequences.**', '**Evidence.**'] as const;

const heading = /^## DL-(\d+) — /;
const statusLine = /^\*\*Status:\*\* .+ · \*\*Date:\*\* \d{4}-\d{2}-\d{2} · \*\*Decided by:\*\* /;

/** Each entry of `text` from its heading to the next, by number. */
export function entryBlocks(text: string): { number: number; text: string }[] {
  const blocks: { number: number; text: string }[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const found = heading.exec(line);
    if (found) blocks.push({ number: Number(found[1]), text: line });
    else if (line.startsWith('## ')) blocks.push({ number: -1, text: line });
    else if (blocks.length > 0) blocks[blocks.length - 1]!.text += `\n${line}`;
  }
  return blocks.filter((block) => block.number >= 0).map((block) => ({ ...block, text: block.text.replace(/\n+$/, '\n') }));
}

/** What keeps the entries of `text` from `leanFrom` on from the template, each problem naming its entry. */
export function leanProblems(text: string): string[] {
  return entryBlocks(text)
    .filter((block) => block.number >= leanFrom)
    .flatMap(({ number, text: entry }) => {
      const problems: string[] = [];
      const bytes = Buffer.byteLength(entry);
      if (bytes > leanBytes) problems.push(`DL-${number} is ${bytes} bytes; an entry holds at most ${leanBytes}`);
      // The Status line may wrap: read it joined, from the line after the heading to the first blank.
      const status = entry.split('\n\n')[1]?.replace(/\n/g, ' ') ?? '';
      if (!statusLine.test(status)) problems.push(`DL-${number} has no **Status:** · **Date:** · **Decided by:** line under its heading`);
      for (const section of leanSections) if (!entry.includes(section)) problems.push(`DL-${number} has no ${section} paragraph`);
      return problems;
    });
}

/** The open log's problems under `root`. */
export function leanProblemsInLog(root: string): string[] {
  return leanProblems(readFileSync(path.join(root, logPath), 'utf8'));
}
