import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { testContent } from './world.test-support.js';

// The engine names no Class (ADR-0006): what a Class does that a rule reads, such as relieving the
// hurt (DL-285), is the Class's mark in content (the architecture review's candidate 5). This test
// holds the engine's source to it: no file but a test names a Class key, the shipped content's or the
// test content's, as a string.

const src = fileURLToPath(new URL('./', import.meta.url));
const shipped = Object.keys(JSON.parse(readFileSync(fileURLToPath(new URL('../../content/classes.json', import.meta.url)), 'utf8')) as object);
const classKeys = [...new Set([...shipped, ...Object.keys(testContent.classes)])];

/** Every source file of the engine's under `dir`, tests and their support left out, by its path from `src/`. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !/\.test\.ts$|\.test-support\.ts$/.test(entry.name) ? [path] : [];
  });
}

describe("the engine's source", () => {
  test('reads the Classes from content: the shipped content has them, and the source has files', () => {
    expect(shipped.length).toBeGreaterThan(0);
    expect(sources(src).length).toBeGreaterThan(50);
  });

  test.each(classKeys)('names no Class key as a string: %s', (classKey) => {
    const quoted = new RegExp(`['"\`]${classKey}['"\`]`);
    const naming = sources(src).filter((path) => quoted.test(readFileSync(path, 'utf8')));
    expect(naming.map((path) => path.slice(src.length))).toEqual([]);
  });
});

// The engine names no Hero Stat either (ADR-0006): the Stat a Captain is scaled by is the one content
// marks `captaincy` (DL-287), and every other rule reads a Stat by its area or a Query's key.
const heroStatKeys = Object.entries(JSON.parse(readFileSync(fileURLToPath(new URL('../../content/stats.json', import.meta.url)), 'utf8')) as Record<string, { owner: string }>)
  .filter(([, stat]) => stat.owner === 'hero')
  .map(([key]) => key);

describe("the engine's source and the Hero Stats", () => {
  test('reads the Hero Stats from content: the shipped content has them, the captaincy Stat among them', () => {
    expect(heroStatKeys).toContain('leadership');
  });

  test.each(heroStatKeys)('names no Hero Stat key as a string: %s', (statKey) => {
    const quoted = new RegExp(`['"\`]${statKey}['"\`]`);
    const naming = sources(src).filter((path) => quoted.test(readFileSync(path, 'utf8')));
    expect(naming.map((path) => path.slice(src.length))).toEqual([]);
  });
});
