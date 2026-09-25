import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// No engine rule asks whether a Guild is the player's (ADR-0002), except the three the owner
// accepted on 2026-09-25 (`plan.md` §1): the player's ending ends the game while a Rival's folds it
// (M2-S10); on the Board the player's controller acts before the Rivals' (M2-S9); and the Transfer
// Generator never takes from the player's Guild (M6). The M2 epic's risk table asks for a test
// that greps for them: this one finds every read of a Guild's `controller.kind` in the engine's
// source and holds each file to the reads listed below (DL-28).
//
// A story that lands an accepted read adds its file here, with the count and the reason. A read
// outside the three exceptions needs an owner's decision first, not a line in this list.

/** Where the engine may read `controller.kind`, how many times, and why. Paths are from `src/`. */
const acceptedReads: Record<string, { reads: number; why: string }> = {
  'selectors.ts': {
    reads: 1,
    why: "`playerGuild`: how a front end and the harness find the player's Guild; no rule calls it",
  },
  'phases/endings.ts': {
    reads: 1,
    why: "plan.md §1: the player's ending ends the game, a Rival's folds that Guild (M2-S10)",
  },
};

/**
 * What counts as a read: `controller.kind` (optional chaining and spaces allowed), the bracketed
 * `controller['kind']`, destructuring `kind` out of a controller, `'…' in` a controller, and a call
 * of `playerGuild`, which reads it on the caller's behalf.
 */
const readPatterns: readonly RegExp[] = [
  /\bcontroller\s*\??\.\s*kind\b/g,
  /\bcontroller\s*(?:\?\.)?\s*\[\s*['"`]kind['"`]\s*\]/g,
  /\{[^{}]*\bkind\b[^{}]*\}\s*=\s*[\w$.?]*\bcontroller\b/g,
  /['"`]\w+['"`]\s+in\s+[\w$.?]*\bcontroller\b/g,
  /(?<!function\s+)\bplayerGuild\s*\(/g,
];

/** `source` without its comments, so that prose about `controller.kind` is not a read. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function readsIn(source: string): number {
  const code = withoutComments(source);
  return readPatterns.reduce((total, pattern) => total + (code.match(pattern)?.length ?? 0), 0);
}

const src = fileURLToPath(new URL('./', import.meta.url));

/** Every source file of the engine that is not a test or a test's support, from `src/`. */
function engineSources(): string[] {
  return readdirSync(src, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.ts') && !/\.test(?:-support)?\.ts$/.test(path))
    .sort();
}

describe('reads of controller.kind in the engine (plan.md §1)', () => {
  test('are exactly the accepted ones', () => {
    const found: Record<string, number> = {};
    for (const path of engineSources()) {
      const reads = readsIn(readFileSync(`${src}${path}`, 'utf8'));
      if (reads > 0) found[path] = reads;
    }

    const expected = Object.fromEntries(Object.entries(acceptedReads).map(([path, { reads }]) => [path, reads]));
    expect(found).toEqual(expected);
  });

  test.each([
    ["guild.controller.kind === 'player'", 1],
    ['guild.controller?.kind', 1],
    ["guild.controller['kind']", 1],
    ['const { kind } = guild.controller;', 1],
    ["'disposition' in guild.controller", 1],
    ['const player = playerGuild(world);', 1],
    ['export function playerGuild(world: World) {}', 0],
    ["const controller = { kind: 'rival', disposition: 'steady' };", 0],
    ["controller: { kind: 'player' },", 0],
    ['// the player reads guild.controller.kind here', 0],
    ['/* guild.controller.kind */ const x = 1;', 0],
  ])('the matcher counts %s as %i', (source, reads) => {
    expect(readsIn(source)).toBe(reads);
  });

  test('every accepted file exists, so the list cannot go stale', () => {
    const sources = new Set(engineSources());
    for (const path of Object.keys(acceptedReads)) expect(sources, path).toContain(path);
  });
});
