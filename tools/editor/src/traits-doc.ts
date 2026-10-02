// `docs/agents/traits.md` (v1.1.4-S12, DL-150 item 14): its guardrails written by hand, and its
// register's part written from the register (`content/src/uses/doc.ts`). The freshness check holds
// the part to what the register makes now; `traits doc` writes it.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generatedPart, register, registerDoc, withGeneratedPart, type RegisterEntry } from '@heroesim/content/uses';

/** The doc's path under a root. */
export function traitsDocPath(root: string): string {
  return path.join(root, 'docs', 'agents', 'traits.md');
}

/** Whether the doc's register part is what the register makes now, and what is wrong where it is not. */
export function freshness(root: string, entries: readonly RegisterEntry[] = register): { ok: boolean; problems: string[] } {
  const file = traitsDocPath(root);
  if (!existsSync(file)) return { ok: false, problems: ['docs/agents/traits.md is not there'] };
  const part = generatedPart(readFileSync(file, 'utf8'));
  if (part === null) return { ok: false, problems: ["docs/agents/traits.md has no register's part between its two markers"] };
  if (part !== registerDoc(entries)) {
    return { ok: false, problems: ["docs/agents/traits.md's register part is not what the register makes now: run `npm run edit -- traits doc`"] };
  }
  return { ok: true, problems: [] };
}

/** Writes the doc's register part as the register makes it now; whether that changed the file. */
export function writeTraitsDoc(root: string, entries: readonly RegisterEntry[] = register): { file: string; changed: boolean } {
  const file = traitsDocPath(root);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '# Traits\n';
  const after = withGeneratedPart(before, entries);
  if (after !== before) writeFileSync(file, after);
  return { file, changed: after !== before };
}
