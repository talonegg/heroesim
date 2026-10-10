// Story ids in the source (DL-219): a comment says what a thing is and why, citing the deciding DL
// entry, and the history of stories belongs in the decision log (`docs/agents/comments.md`). Two
// rules, over every source file, tests, specs and their support among them, but builds and the few
// test files whose story ids are data (DL-246):
// - none narrates history by a story: "since v1.x.y-Sn", "until M<n>-S<n>" and the like are refused;
// - the lines that still cite a story id may only fall: their count is held at or under the
//   baseline in `story-citations.json`, which is lowered as they are rewritten, never raised.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ofKinds, repositoryFiles } from './citations.js';

export interface StoryLine {
  file: string;
  line: number;
  text: string;
}

/** A story's id: a milestone's, `M<n>-S<n>`, a follow-on's, `M<n>-F<n>`, or a patch's, `v<x>.<y>.<z>-S<n>`. */
const storyId = String.raw`(?:(?:v\d+\.\d+\.\d+|M\d+)-S\d+[a-z]?|M\d+-F\d+)`;

/** A verb that tells a change, which "by" and a story then dates, within one clause: "moved there by". */
const changeVerb = String.raw`(?:moved|redesigned|filled|completed|replaced|changed|removed|renamed|retired|superseded|added|from)\b[^.;:()]{0,40}?\bby`;

/** A story cited for when something began, ended or changed, in any case and with any space. */
export const historyPattern = new RegExp(String.raw`\b(?:(?:since|from|until|before|after)|${changeVerb})\s+${storyId}\b`, 'i');

/** Any story cited. */
export const storyPattern = new RegExp(String.raw`\b${storyId}\b`);

const sourceExtensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

/**
 * The test files whose story ids are data, not citations, which the rule leaves out: the pattern's
 * own fixtures, and the harness's report, whose names and sections print a story id (DL-246).
 */
export const storyIdsAsData: ReadonlySet<string> = new Set(['tools/decisions/src/stories.test.ts', 'harness/src/report.test.ts', 'harness/src/sweep.test.ts']);

/** Whether `file` is source the rule reads: code, tests and their support alike, but a build and a file of `storyIdsAsData`. */
export function isSource(file: string): boolean {
  return !storyIdsAsData.has(file) && !/(^|\/)dist\//.test(file);
}

/** The lines of `files` that `pattern` matches. */
export function linesMatching(files: readonly { file: string; text: string }[], pattern: RegExp): StoryLine[] {
  return files.flatMap(({ file, text }) =>
    text.split(/\r?\n/).flatMap((line, at) => (pattern.test(line) ? [{ file, line: at + 1, text: line.trim() }] : [])),
  );
}

/** A comment line's text after its marker, `//`, `/**` or `*`. */
const commentText = (line: string): string => line.replace(/^\s*(?:\/\/|\/\*\*?|\*)\s?/, '');

/**
 * The lines of `files` that tell history by a story, read across a comment's line break as well, so
 * that "since" closing one line and the story opening the next is found, at the line it begins on.
 */
export function historyLines(files: readonly { file: string; text: string }[]): StoryLine[] {
  return files.flatMap(({ file, text }) => {
    const lines = text.split(/\r?\n/);
    return lines.flatMap((line, at) => {
      const next = lines[at + 1];
      const across = next !== undefined && !historyPattern.test(next) && historyPattern.test(`${line} ${commentText(next)}`);
      return historyPattern.test(line) || across ? [{ file, line: at + 1, text: line.trim() }] : [];
    });
  });
}

/** The baseline's file, beside this package's sources. */
export const baselinePath = 'tools/decisions/story-citations.json';

/** How many lines cite a story id: no more, and, once lines are rewritten, lowered to match. */
export function storyBaseline(root: string): number {
  const { lines } = JSON.parse(readFileSync(path.join(root, baselinePath), 'utf8')) as { lines?: unknown };
  if (typeof lines !== 'number' || !Number.isInteger(lines) || lines < 0) throw new Error(`${baselinePath}'s "lines" is no whole number`);
  return lines;
}

/** The repository's source files the rule reads: among `files`, its files as read, or read now. */
export function sourceFiles(root: string, files: readonly { file: string; text: string }[] = repositoryFiles(root, sourceExtensions)): { file: string; text: string }[] {
  return ofKinds(files, sourceExtensions).filter(({ file }) => isSource(file));
}

/** The source under `root`: the lines narrating history by a story, and the count citing one beside its baseline; among `read`, its files as read, if given. */
export function storyReport(root: string, read?: readonly { file: string; text: string }[]): { history: StoryLine[]; cited: number; baseline: number } {
  const files = sourceFiles(root, read);
  return { history: historyLines(files), cited: linesMatching(files, storyPattern).length, baseline: storyBaseline(root) };
}
