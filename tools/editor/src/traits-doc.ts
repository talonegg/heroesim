// `docs/agents/traits-register.md` (DL-150 item 14; its own file by DL-219, the guardrails staying in
// `docs/agents/traits.md`): a heading written by hand, and the register's part written from the
// register (`content/src/uses/doc.ts`). The freshness check holds the part to what the register makes
// now; `traits doc` writes it.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generatedPart, register, registerDoc, withGeneratedPart, type RegisterEntry } from '@heroesim/content/uses';

/** The doc's path under a root. */
export function traitsDocPath(root: string): string {
  return path.join(root, 'docs', 'agents', 'traits-register.md');
}

/** The heading written by hand that a register file begins with, when it is made new. */
export const registerHeading = `# Traits: the register

Every place a Trait is used, in content and in the engine, written from \`content/src/uses/register.ts\`
by \`npm run edit -- traits doc\`. The rules for changing a Trait or a use are \`traits.md\`'s.
`;

/** Whether the doc's register part is what the register makes now, and what is wrong where it is not. */
export function freshness(root: string, entries: readonly RegisterEntry[] = register): { ok: boolean; problems: string[] } {
  const file = traitsDocPath(root);
  if (!existsSync(file)) return { ok: false, problems: ['docs/agents/traits-register.md is not there'] };
  const part = generatedPart(readFileSync(file, 'utf8'));
  if (part === null) return { ok: false, problems: ["docs/agents/traits-register.md has no register's part between its two markers"] };
  if (part !== registerDoc(entries)) {
    return { ok: false, problems: ["docs/agents/traits-register.md's register part is not what the register makes now: run `npm run edit -- traits doc`"] };
  }
  return { ok: true, problems: [] };
}

/** Writes the doc's register part as the register makes it now; whether that changed the file. */
export function writeTraitsDoc(root: string, entries: readonly RegisterEntry[] = register): { file: string; changed: boolean } {
  const file = traitsDocPath(root);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : registerHeading;
  const after = withGeneratedPart(before, entries);
  if (after !== before) writeFileSync(file, after);
  return { file, changed: after !== before };
}
