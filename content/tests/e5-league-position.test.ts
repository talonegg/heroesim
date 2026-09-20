import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * E5-S6's last acceptance box, and the fourth row of E5's risk table: **the League must
 * never become a score.** It is a derived view with no setter, and this is the guard —
 * a static scan of every state type the engine declares, looking for a field that would
 * let a position be stored.
 *
 * **Why it lives here.** ESLint forbids `node:*`, `fs` and `path` under `engine/**`, which
 * covers `engine/tests` as well as `engine/src`, so a test that has to read the engine's
 * own source cannot sit beside the code it guards. `content/tests` is the Node-environment
 * project that already opens the repository's files, exactly as
 * `e4-standing-callsites.test.ts` does (DL-19 §11).
 *
 * `engine/tests/league.test.ts` holds the other half: no such key exists anywhere in a
 * Career that has actually been played.
 */

const engineSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'engine',
  'src',
);

/** A field declaration in an interface or a type literal: `position: number`, `rank?: number`. */
const FIELD = /^\s*(?:readonly\s+)?(position|rank|ranking|standingPosition|leaguePosition)\??\s*:/gm;

function engineFiles(): string[] {
  return readdirSync(engineSrc)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

describe('the League is derived and is never written', () => {
  it('finds the engine source to scan', () => {
    const files = engineFiles();
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('types.ts');
    expect(files).toContain('rival.ts');
  });

  it('declares no field named position or rank on any state type', () => {
    const offenders: string[] = [];
    for (const file of engineFiles()) {
      const source = readFileSync(path.join(engineSrc, file), 'utf8');
      FIELD.lastIndex = 0;
      for (const match of source.matchAll(FIELD)) offenders.push(`${file}: ${match[0].trim()}`);
    }
    expect(
      offenders,
      'the League is a view of Standing; the only way to climb it is to earn Patrons’ Regard',
    ).toEqual([]);
  });

  it('is not vacuous: it finds the field it is looking for when one is there', () => {
    const pretend = 'interface LeagueRow {\n  rank: number;\n}\n';
    FIELD.lastIndex = 0;
    expect([...pretend.matchAll(FIELD)]).toHaveLength(1);
  });

  it('exports a League row that carries a Standing and a Roster size, and no position', () => {
    const types = readFileSync(path.join(engineSrc, 'types.ts'), 'utf8');
    const row = /export interface LeagueRow \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
    expect(row).toContain('standing');
    expect(row).toContain('rosterSize');
    expect(row).toContain('isPlayer');
    expect(row).not.toContain('rank');
    expect(row).not.toContain('position');
  });
});
