// The doctor (v1.1.4-S12, DL-150 item 14): the drift check, the freshness check and the content's
// checks, and the pending edits held to the content's checks too. The Trait skills run it before they
// act, and each story that touches the engine at its close. Like every command it first puts back the
// files of a "Finish" cut off, and says so; while one runs it says that, and checks no edit.

import { contentChecks } from '@heroesim/content/write';
import { drift, type Drift } from './drift.js';
import { Editor } from './editor.js';
import { Busy } from './finish-journal.js';
import { freshness } from './traits-doc.js';

export interface Doctor {
  ok: boolean;
  drift: Drift;
  freshness: { ok: boolean; problems: string[] };
  content: { ok: boolean; problems: string[] };
  pending: { ok: boolean; edits: number; problems: string[] };
  finish: { running: boolean; recovered: string[] };
}

export function doctor(root: string): Doctor {
  const editor = new Editor(root);
  let finish: Doctor['finish'];
  let pending: Doctor['pending'];
  try {
    finish = { running: false, recovered: editor.recover() };
    let edits = 0;
    try {
      edits = editor.edits().length;
    } catch {
      // Named among the problems below.
    }
    const problems = editor.pendingProblems();
    pending = { ok: problems.length === 0, edits, problems };
  } catch (error) {
    if (!(error instanceof Busy)) throw error;
    finish = { running: true, recovered: [] };
    pending = { ok: false, edits: 0, problems: [...error.problems] };
  }
  const report = { drift: drift(root), freshness: freshness(root), content: contentChecks(root), pending, finish };
  return { ok: report.drift.ok && report.freshness.ok && report.content.ok && pending.ok, ...report };
}

/** The doctor's report in lines for a person. */
export function doctorText(report: Doctor): string[] {
  const line = (ok: boolean, passed: string, failed: string, problems: readonly string[]): string[] => (ok ? [`✓ ${passed}`] : [`✗ ${failed}`, ...problems.map((problem) => `    ${problem}`)]);
  return [
    ...(report.finish.recovered.length > 0 ? [`! A "Finish" was cut off: ${report.finish.recovered.length} files are put back as they were`] : []),
    ...line(report.drift.ok, `No drift: the register lists all ${report.drift.reads} reads of a Trait`, 'Drift: the register and the code differ', report.drift.problems),
    ...line(report.freshness.ok, 'docs/agents/traits-register.md is fresh', 'docs/agents/traits-register.md is stale', report.freshness.problems),
    ...line(report.content.ok, 'The content passes its checks', 'The content fails its checks', report.content.problems),
    ...line(
      report.pending.ok,
      report.pending.edits === 0 ? 'No pending edits' : `${report.pending.edits} pending ${report.pending.edits === 1 ? 'edit' : 'edits'}, passing the content's checks`,
      report.finish.running ? '"Finish" is running' : 'The pending edits fail',
      report.pending.problems,
    ),
  ];
}
