// The doctor (v1.1.4-S12, DL-150 item 14): the drift check, the freshness check and the content's
// checks, with whether the pending edits still apply. The Trait skills run it before they act, and
// each story that touches the engine at its close.

import { contentChecks } from '@heroesim/portraits';
import { drift, type Drift } from './drift.js';
import { Editor, Refused } from './editor.js';
import { freshness } from './traits-doc.js';

export interface Doctor {
  ok: boolean;
  drift: Drift;
  freshness: { ok: boolean; problems: string[] };
  content: { ok: boolean; problems: string[] };
  pending: { ok: boolean; edits: number; problems: string[] };
}

export function doctor(root: string): Doctor {
  const editor = new Editor(root);
  const edits = editor.edits();
  let pending = { ok: true, edits: edits.length, problems: [] as string[] };
  try {
    editor.working();
  } catch (error) {
    pending = { ok: false, edits: edits.length, problems: error instanceof Refused ? [...error.problems] : [String(error)] };
  }
  const report = { drift: drift(root), freshness: freshness(root), content: contentChecks(root), pending };
  return { ok: report.drift.ok && report.freshness.ok && report.content.ok && pending.ok, ...report };
}

/** The doctor's report in lines for a person. */
export function doctorText(report: Doctor): string[] {
  const line = (ok: boolean, passed: string, failed: string, problems: readonly string[]): string[] => (ok ? [`✓ ${passed}`] : [`✗ ${failed}`, ...problems.map((problem) => `    ${problem}`)]);
  return [
    ...line(report.drift.ok, `No drift: the register lists all ${report.drift.reads} reads of a Trait`, 'Drift: the register and the code differ', report.drift.problems),
    ...line(report.freshness.ok, 'docs/agents/traits.md is fresh', 'docs/agents/traits.md is stale', report.freshness.problems),
    ...line(report.content.ok, "The content passes its checks", "The content fails its checks", report.content.problems),
    ...line(
      report.pending.ok,
      report.pending.edits === 0 ? 'No pending edits' : `${report.pending.edits} pending ${report.pending.edits === 1 ? 'edit' : 'edits'}, each still applying`,
      'The pending edits no longer apply',
      report.pending.problems,
    ),
  ];
}
