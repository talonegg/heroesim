// The content schema's rules across rows: what a single row's shape cannot show, the driver of
// the content kinds' rules (DL-243). `parseContent` runs this on every set it builds; a set assembled
// in memory, by a test or a later module, runs it directly. Each kind's rules are its own (`kinds/`):
// every Query, an Encounter's Checks' scores and a Synergy's requirements among them, held to its
// types, its keys and its size (ADR-0010, DL-151) through the engine's `queryProblems` (DL-186 item 6).

import type { ContentSet } from '@heroesim/engine/content';
import { ContentError } from './kinds/error.js';
import { contentRules } from './kinds/index.js';
import { knownOf, type KindRules } from './kinds/rules.js';

/**
 * Check a content set against the rules no single row can break alone. Returns the set it was
 * given when it passes.
 *
 * @throws ContentError naming every offending key
 */
export function validateContent(set: ContentSet): ContentSet {
  return validateKinds(contentRules, set);
}

/** `validateContent` with a test's rules: each kind's, in order, every problem reported at once. */
export function validateKinds(rules: readonly KindRules[], set: ContentSet): ContentSet {
  const problems: string[] = [];
  const known = knownOf(set);
  for (const kind of rules) kind.check(set, problems, known);
  if (problems.length > 0) throw new ContentError(problems);
  return set;
}
