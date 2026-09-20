/**
 * The other half of E7's promise that `config.startingDebt` is inert at its default
 * (DL-25 §1): it is read in **exactly one place** in the whole engine, and that place is
 * the opening float.
 *
 * A behaviour test can show that one seed is unmoved; a static scan shows that there is
 * nowhere else it could move anything from. This is the same shape of guard
 * `content/tests/e5-one-move.test.ts` uses, and it lives here rather than under
 * `engine/tests` because ESLint forbids `node:fs` there (DL-19 §11).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const engineSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'engine',
  'src',
);

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('the starting debt', () => {
  const files = sources(engineSrc);

  it('finds the engine source it is checking', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('is read in exactly one file, and that file is world generation', () => {
    const reads = new Map<string, number>();
    for (const file of files) {
      const count = (readFileSync(file, 'utf8').match(/startingDebt/g) ?? []).length;
      if (count > 0) reads.set(path.basename(file), count);
    }
    // `config.ts` declares it and defaults it; `save.ts` fills it on a document written
    // before it was named; `world.ts` is the one place that reads it for anything.
    expect([...reads.keys()].sort()).toEqual(['config.ts', 'save.ts', 'world.ts']);
    expect(reads.get('world.ts')).toBe(1);
  });

  it('is subtracted from the opening float and from nothing else', () => {
    const world = readFileSync(path.join(engineSrc, 'world.ts'), 'utf8');
    expect(world).toContain('settings.startingCoin - settings.startingDebt');
    // Nowhere in the Day loop, the Upkeep, a fee or a Consequence.
    for (const file of ['career.ts', 'board.ts', 'beat.ts', 'hall.ts', 'applicant.ts']) {
      expect(readFileSync(path.join(engineSrc, file), 'utf8')).not.toContain('startingDebt');
    }
  });
});
