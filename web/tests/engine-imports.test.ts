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

/**
 * The prose and the number format this client may not hold a copy of (DL-25 §15,
 * DL-27 §§1–2). A sentence about the world held here and copied into the terminal is a
 * sentence the two will come to say differently — which is what happened to the
 * wronged-Rival pair, where the terminal joined two clauses with a comma and this client
 * with a full stop, and to coin, which the terminal grouped and this client did not.
 */
describe('the words and the numbers that belong to narrate', () => {
  /** A fragment of each shared sentence, short enough to survive a reflow of the source. */
  const SHARED = [
    'Coming back: they were on your Roster before',
    'They are posting nothing at all',
    'You have wronged them',
    'They have room to take somebody off your Roster',
    'Their own Roster is full, so they can take nobody',
    // How a Hero's going is said, and why nobody at the door can be taken on. Both were
    // held here and in the terminal word for word until they moved to `narrate`.
    'reached the end of a working life',
    'did not come back',
    'the Roster is full at',
    'the Guild cannot pay any of them yet',
    'none can be taken on just now',
  ];

  /** A line end, spelled without an escape so this file can be rewritten safely. */
  const NEWLINE = String.fromCharCode(10);

  /** True of a line that is a comment: prose *about* a sentence is not a copy of it. */
  function isComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }

  it('holds no copy of a sentence narrate owns', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      for (const line of readFileSync(file, 'utf8').split(NEWLINE)) {
        if (isComment(line)) continue;
        for (const sentence of SHARED) {
          if (line.includes(sentence)) {
            offenders.push(`${path.relative(srcDir, file)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders, 'these sentences live in @heroesim/narrate').toEqual([]);
  });

  it('writes no coin figure of its own: every one goes through the one formatter', () => {
    // A `{…}` hole or a template hole followed by the word `coin` is a number printed
    // without grouping. `coin(…)` is the only way a figure may reach the screen.
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/(\}|\$\{[^}]*\})\s*coin\b/.test(line)) {
          offenders.push(`${path.relative(srcDir, file)}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "coin is printed by narrate's coin(), never by hand").toEqual([]);
  });

  it('hard-codes no plural of Day beside a hole that holds the count', () => {
    // "in 1 Days" reached a committed screenshot because the plural was a literal beside
    // a `{…}` rather than `count(n, 'Day', 'Days')` (DL-27 §4).
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/(\}|<\/b>)\s*Days\b/.test(line)) {
          offenders.push(`${path.relative(srcDir, file)}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "a span of Days is counted with narrate's count()").toEqual([]);
  });
});

/**
 * DL-27 §1 put a source scan in **each front end** forbidding a coin figure printed by
 * hand, and left this package — where every one of those sentences actually lives —
 * unscanned. It lives here rather than in `narrate/tests` because `narrate`'s own
 * tsconfig deliberately carries no node types — a package whose sentences are bundled into
 * a browser has no business reading a filesystem — and this follows DL-27 §11's precedent:
 * a check that has to hold two packages at once lives in `web/tests` and reaches the other
 * by path. The played-Career sweep above only constrains a sentence whose amount
 * happens to reach four figures on that seed: an ungrouped Hall cost, joining fee or
 * Commission fee all survived it, because those amounts are three figures at the shipped
 * config. This is the scan that does not depend on the size of the number.
 */
describe('every figure narrate prints goes through the one formatter', () => {
  const narrateSrc = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'narrate',
    'src',
  );

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  /** A read of a field that holds money — `event.balance`, `outcome.fullFee`, `reckoning.peakCoin`. */
  const MONEY_FIELD =
    /\b[A-Za-z_$][\w$]*\.(?:[\w$]+\.)*[\w$]*(?:coin|Coin|balance|Balance|fee|Fee|cost|Cost|amount|Amount|shortfall|Shortfall)[\w$]*\b/;
  /** The two ways a figure may reach a sentence. */
  const FORMATTED = /(^|\W)(coin|groupDigits)\(/;

  it('finds the source it is checking', () => {
    expect(sources(narrateSrc).length).toBeGreaterThan(2);
  });

  it('interpolates no money field that has not been through coin() or groupDigits()', () => {
    const offenders: string[] = [];
    for (const file of sources(narrateSrc)) {
      const lines = readFileSync(file, 'utf8').split(String.fromCharCode(10));
      lines.forEach((line, at) => {
        for (const hole of line.matchAll(/\$\{([^}]*)\}/g)) {
          const expression = hole[1] ?? '';
          if (MONEY_FIELD.test(expression) && !FORMATTED.test(expression)) {
            offenders.push(`${path.relative(narrateSrc, file)}:${String(at + 1)}: \${${expression}}`);
          }
        }
      });
    }
    expect(offenders, 'coin is printed by coin() or groupDigits(), never by hand').toEqual([]);
  });
});
