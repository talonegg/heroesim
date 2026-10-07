import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A scratch repository holding `files` (repository-relative path → text); `remove` deletes it. */
export function scratchRepository(files: Readonly<Record<string, string>>): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-decisions-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** An entry as the log writes one, dated on its Status line. */
export const entry = (id: string, title: string, date = '2026-09-25'): string =>
  `## ${id} — ${title}\n\n**Status:** Accepted · **Date:** ${date} · **Decided by:** the owner\n\n**Decision.** Text.\n`;

/** A small log: two archived entries, one open, and one record of each kind in `superseded/`. */
export const smallLog: Readonly<Record<string, string>> = {
  'docs/decision-log.md': `# Decision log\n\n---\n\n${entry('DL-03', 'The open one', '2026-10-08')}`,
  'docs/decisions/archive/DL-001-002-first.md': `# Archive\n\n${entry('DL-01', 'The first')}\n${entry('DL-02', 'The second | with a bar')}`,
  'docs/decisions/archive/pre-m0-review.md': '# Pre-M0 review decisions\n\n### D3 — A pre-M0 item\n',
  'docs/decisions/archive/superseded/DL-01.md': '# DL-01 — superseded items\n\n## DL-01 item 2 — superseded by DL-02\n\nText.\n\n## DL-01 item 4 — in part, by DL-03\n\nText.\n',
  'docs/decisions/archive/superseded/DL-02.md': '# DL-02 — superseded items\n\n## DL-02 — in part, by DL-03\n\nText.\n',
  'docs/decisions/archive/superseded/pre-m0.md': '# Pre-M0 — superseded items\n\n## D3 — in part, by DL-02\n\nText.\n',
};
