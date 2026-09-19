import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * E8-S2, and the first risk in E8 §5: the browser client must not drift into holding
 * rules React understands and the engine does not. Only `state/` and `content.ts` may
 * call into the engine; everywhere else reads types and goes through a selector.
 *
 * Written as a test rather than an ESLint rule because the boundary is a project one and
 * the root ESLint config is shared with four other packages.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** The files allowed to import engine values, relative to `web/src`. */
const ALLOWED = [`state${path.sep}`, 'content.ts'];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every `import … from '@heroesim/engine'` statement in a file, whole. Statements end at
 * a semicolon, so the match may not cross one — otherwise an earlier import of something
 * else is swallowed into the match and read as part of it.
 */
function engineImports(source: string): string[] {
  return [...source.matchAll(/import\s[^;]*?from\s*['"]@heroesim\/engine['"]/g)].map(
    (match) => match[0],
  );
}

/** True when nothing but types crosses: `import type …`, or every specifier marked. */
function typesOnly(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return true;
  const braces = /\{([\s\S]*?)\}/.exec(statement);
  if (braces === null) return false;
  const specifiers = (braces[1] ?? '')
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier.length > 0);
  return specifiers.length > 0 && specifiers.every((specifier) => /^type\s/.test(specifier));
}

describe('engine imports in web/src', () => {
  const files = sourceFiles(srcDir);

  it('finds the source to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('are types only, except under state/ and in content.ts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(srcDir, file);
      if (ALLOWED.some((allowed) => relative.startsWith(allowed))) continue;
      for (const statement of engineImports(readFileSync(file, 'utf8'))) {
        if (!typesOnly(statement)) {
          offenders.push(`${relative}: ${statement.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders, 'only state/ and content.ts may import engine values').toEqual([]);
  });

  it('nothing in web/src imports the terminal front end', () => {
    const offenders = files.filter((file) => /@heroesim\/cli/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
