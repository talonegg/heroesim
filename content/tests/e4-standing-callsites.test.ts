import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * E4-S1's last acceptance box, and the first row of E4's risk table: **no Commission, fee
 * or Board decision reads `standing` anywhere in the engine.** Standing has exactly one
 * job — gating the calibre of an Applicant — and the moment somebody gates a fee, a
 * posting or a difficulty on it, this test fails and says where (CONTEXT · Standing).
 *
 * **Why it lives here.** ESLint forbids `node:*`, `fs` and `path` under `engine/**`,
 * which covers `engine/tests` as well as `engine/src`, so the one test in E4 that has to
 * read the engine's own source cannot sit beside the code it guards. `content/tests` is a
 * Node-environment Vitest project that already opens the repository's files, and
 * `web/tests/engine-imports.test.ts` is the precedent for a static source scan living in
 * whichever test project is allowed to open one (DL-19 §11).
 */

const engineSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'engine',
  'src',
);

/**
 * A *call* of the Guild's Standing: `standingOf(…)`, or `standing(…)` where it is not a
 * property access. `rival.standing` is a stored field on a Rival — Rivals are not
 * simulated, so theirs is data rather than a derivation — and is deliberately not matched.
 */
const CALLS = /(?:^|[^.\w])(standingOf|standing)\s*\(/gm;

function engineFiles(): string[] {
  return readdirSync(engineSrc)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

/** The lines in one engine source file that call Standing, trimmed. */
function callSites(file: string): string[] {
  const source = readFileSync(path.join(engineSrc, file), 'utf8');
  const out: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    CALLS.lastIndex = 0;
    if (CALLS.test(line)) out.push(line.trim());
  }
  return out;
}

/**
 * Where the engine is allowed to read the Guild's Standing, and how many times. Adding a
 * read anywhere — or adding one to a file that is allowed a read already — fails this,
 * which is the point: it is a list of call sites, not a list of files.
 */
const ALLOWED: Readonly<Record<string, number>> = {
  // The derivation itself, and the reckoning that reports it at the end of a Career.
  'state.ts': 2,
  // The exported reader, unchanged from E1: `standing(career)` calls `standingOf`.
  'career.ts': 2,
  // A Rival's starting Standing is set near the player's, once, at world generation.
  'world.ts': 1,
  // The one thing it buys: the calibre ceiling a batch of Applicants is drawn against.
  'applicant.ts': 1,
  // E5's League is a **view** of something already modelled: the player's Standing is
  // derived from Patron Regard and a Rival's is stored, and `league` reads both and
  // orders them. It writes nothing, gates nothing, and decides no Commission, fee or
  // Board question — which is exactly what this map exists to keep true.
  'rival.ts': 1,
};

/**
 * The files where a read would mean Standing had become something other than the calibre
 * gate: the Board and its fees, the Check, harm, the Hall, refusals and Regard.
 */
const MUST_BE_SILENT = [
  'board.ts',
  'beat.ts',
  'check.ts',
  'harm.ts',
  'hall.ts',
  'refusal.ts',
  'regard.ts',
  'vignette.ts',
  'save.ts',
  'clone.ts',
  'config.ts',
  'content.ts',
  'events.ts',
  'types.ts',
  'rng.ts',
  'errors.ts',
  'age.ts',
  'index.ts',
  // E5. `people.ts` prices a person's calibre from a Stat total and from a Standing it is
  // *handed* — never one it reads — and `transfer.ts` prices and refuses a move on the
  // Hero's calibre, the Rival's Regard, the Roster cap and the coin. Standing gets you
  // people; it has nothing to say about what one of them costs.
  'people.ts',
  'transfer.ts',
  // E6. A Decision reads the Commission, the Party and the Beat it displaces. What the
  // Guild's Standing has earned it has nothing to say about whether a Party stops to ask,
  // which option it is offered, or what turning back pays.
  'decision.ts',
];

describe('who reads the Guild’s Standing', () => {
  const files = engineFiles();

  it('finds the engine source to scan', () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('board.ts');
    expect(files).toContain('applicant.ts');
    // The two lists together account for every file, so a new one cannot be added to the
    // engine and quietly escape the scan.
    expect([...Object.keys(ALLOWED), ...MUST_BE_SILENT].sort()).toEqual(files);
  });

  it('is exactly the four places that derive it, report it or gate calibre on it', () => {
    const found: Record<string, number> = {};
    for (const file of files) {
      const sites = callSites(file);
      if (sites.length > 0) found[file] = sites.length;
    }
    expect(found).toEqual(ALLOWED);
  });

  it('is nobody in the Board, the fee, the Check or anything else that decides work', () => {
    const offenders: string[] = [];
    for (const file of MUST_BE_SILENT) {
      for (const line of callSites(file)) offenders.push(`${file}: ${line}`);
    }
    expect(
      offenders,
      'Commissions are never gated on Standing: Regard gets you work, Standing gets you people',
    ).toEqual([]);
  });

  it('reads a call and not a Rival’s own stored Standing', () => {
    // The scan has to tell `standingOf(career)` from `rival.standing += 1`, which
    // `board.ts` does at every refresh. If it could not, the test above would be failing
    // for a reason that has nothing to do with the rule it guards.
    const board = readFileSync(path.join(engineSrc, 'board.ts'), 'utf8');
    expect(board).toContain('rival.standing');
    expect(callSites('board.ts')).toEqual([]);
    // And it does find a genuine call, so it is not vacuous.
    expect(callSites('applicant.ts')).toEqual(['const standing = standingOf(career);']);
  });
});
