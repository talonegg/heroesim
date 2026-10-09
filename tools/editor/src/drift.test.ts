import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { drift } from './drift.js';
import { readContentFiles } from './content-files.js';
import { readsIn, scannedEffectKinds, scannedFiles } from './reads.js';
import { root, scratchRepository } from './test-support.js';
import { traitsKind } from './traits-kind.js';

// The drift test (v1.1.4-S12, DL-150 item 14): the engine and the content's checks read a Trait only
// where the register lists, and the register lists no place that reads none. It runs on this
// repository in CI; a planted read in a scratch copy proves it fails.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository({ engine: true });
  scratches.push(remove);
  return dir;
}

describe('the drift test', () => {
  test('finds every read of a Trait in engine/src and the content checks listed by the register', () => {
    const report = drift(root);
    expect(report.problems).toEqual([]);
    expect(report.reads).toBeGreaterThan(50);
  });

  test("reads every effect kind of the engine's, as the editor's forms offer them (v1.1.4-S14)", () => {
    // The forms are keyed by the engine's unions, so a kind added there is a form here, and a read here.
    const offered = traitsKind.forms(readContentFiles(root).values).flatMap((form) => form.effects.map((effect) => effect.kind));
    expect([...scannedEffectKinds].sort()).toEqual(offered.sort());
  });

  test('reads the engine and the content checks, tests left out', () => {
    const files = scannedFiles(root);
    expect(files).toContain('content/src/validate.ts');
    // The content kinds hold the checks (DL-243).
    expect(files).toContain('content/src/kinds/traits.ts');
    expect(files).toContain('engine/src/traits.ts');
    expect(files).toContain('engine/src/quest-engine/resolve.ts');
    expect(files.filter((file) => /\.test\.ts$|test-support/.test(file))).toEqual([]);
    expect(files.filter((file) => file.startsWith('content/') && file !== 'content/src/validate.ts' && !file.startsWith('content/src/kinds/'))).toEqual([]);
  });

  test('fails on a read planted in a new file, naming its file, line and declaration', () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'engine', 'src', 'planted.ts'), "// A rule that reads a Trait.\nexport function planted(hero: { traits: string[] }): boolean {\n  return hero.traits.includes('brave');\n}\n");

    const report = drift(dir);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual(['engine/src/planted.ts:3: planted reads .traits, which no entry of the register lists']);
  });

  test('fails on a read planted beside the listed ones in a file the register knows', () => {
    const dir = scratch();
    const file = path.join(dir, 'engine', 'src', 'morale.ts');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nexport const isBonus = (effect: { kind: string }): boolean => effect.kind === 'encounterBonus';\n`);

    expect(drift(dir).unlisted.map((read) => `${read.file}#${read.name} ${read.reads}`)).toEqual(["engine/src/morale.ts#isBonus 'encounterBonus'"]);
  });

  test('fails when a listed declaration reads no Trait, or one it runs through is gone', () => {
    const dir = scratch();
    const file = path.join(dir, 'engine', 'src', 'traits.ts');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/export function excludeEachOther/, 'export function excludeEachOtherRenamed'));
    const events = path.join(dir, 'engine', 'src', 'events.ts');
    writeFileSync(events, readFileSync(events, 'utf8').replace(/'hero\.trait-gained': true,\s*'hero\.trait-lost': true,/, ''));

    const report = drift(dir);
    expect(report.stale).toEqual([{ entry: 'trait-events', file: 'engine/src/events.ts', name: 'milestoneTypes' }]);
    expect(report.missing).toEqual([
      { entry: 'trait-lists', file: 'engine/src/traits.ts', name: 'excludeEachOther' },
      { entry: 'traitHelpers', file: 'engine/src/traits.ts', name: 'excludeEachOther' },
    ]);
  });

  // The verification of v1.1.4-S12: a rule may read a Trait through a helper, or name a kind or an
  // event in a way the first scanner missed. Each form, planted in a new file, is drift.
  test.each([
    ['a helper called', "import { traitOf } from '../traits.js';\nexport function planted(c: never, k: string): unknown {\n  return traitOf(c, k);\n}\n", 'planted traitOf()'],
    ['a helper renamed on import', "import { replacedBy as swap } from '../traits.js';\nexport const planted = (c: never): unknown =>\n  swap([], 'x', c);\n", 'planted replacedBy()'],
    ['a helper through a namespace', "import * as traits from '../traits.js';\nexport const planted = (c: never): unknown =>\n  traits.mayEarn([], 'x', c);\n", 'planted mayEarn()'],
    ['a helper passed, not called', "import { traitMoraleShift } from '../guildmaster.js';\nexport const planted = [\n  traitMoraleShift];\n", 'planted traitMoraleShift()'],
    ['a kind compared through as const', "export function planted(e: { kind: string }): boolean {\n  return e.kind === ('statModifiers' as const);\n}\n", "planted 'statModifiers'"],
    ['a kind compared through satisfies and !', "export function planted(e: { kind: string }): boolean {\n  return e.kind !== (('upkeepFactor' satisfies string)!);\n}\n", "planted 'upkeepFactor'"],
    ['a kind compared with ==', "export function planted(e: { kind: string }): boolean {\n  return e.kind == 'encounterBonus';\n}\n", "planted 'encounterBonus'"],
    ['a kind listed for includes', "export function planted(e: { kind: string }): boolean {\n  return ['classStatBonus'].includes(e.kind);\n}\n", "planted 'classStatBonus'"],
    ['a kind in a Set for has', "const kinds = new Set(\n  ['trait']);\nexport const planted = (k: string): boolean => kinds.has(k);\n", "kinds 'trait'"],
    ['an object keyed by effect kinds', "export const planted = {\n  statModifiers: 'Stats', encounterBonus: 'a bonus' };\n", 'planted { statModifiers, encounterBonus }'],
    ['an event named by a template', "export const planted = (what: string): string =>\n  `hero.trait-${what}`;\n", 'planted `hero.trait-${…}`'],
    ['an event named by its prefix', "export const planted = (type: string): boolean =>\n  type.startsWith('hero.trait-');\n", "planted 'hero.trait-'"],
  ])('fails on %s', (_name, text, reads) => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'engine', 'src', 'quest-engine', 'planted.ts'), text);

    expect(drift(dir).unlisted.map((read) => `${read.file} ${read.name} ${read.reads}`)).toEqual([`engine/src/quest-engine/planted.ts ${reads}`]);
  });

  test("reads a file named as boundary.test.ts's probes, except where that test writes them", () => {
    const dir = scratch();
    const probe = 'boundary-probe-0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d.ts';
    const text = 'export const planted = (c: { heroTraits: object }): object => c.heroTraits;\n';
    writeFileSync(path.join(dir, 'engine', 'src', probe), text);
    writeFileSync(path.join(dir, 'engine', 'src', 'quest-engine', probe), text);
    writeFileSync(path.join(dir, 'engine', 'src', 'boundary-probe-planted.ts'), text);

    expect(drift(dir).unlisted.map((read) => read.file)).toEqual(['engine/src/boundary-probe-planted.ts', `engine/src/quest-engine/${probe}`]);
  });
});

describe('a read of a Trait', () => {
  const reads = (text: string): string[] => readsIn('engine/src/x.ts', text).map((read) => `${read.name} ${read.reads}`);

  test('is a list, a person\'s Traits, an Injury\'s, has-trait or an event, read as a value', () => {
    expect(reads('export function a(c) { return c.heroTraits; }')).toEqual(['a .heroTraits']);
    expect(reads('export const b = (c) => c["guildmasterTraits"];')).toEqual(['b .guildmasterTraits']);
    expect(reads('export function d({ heroTraits }) { return heroTraits; }')).toEqual(['d { heroTraits }']);
    expect(reads('function e(i) { return i.leavesTrait; }')).toEqual(['e .leavesTrait']);
    expect(reads("const f = { 'hero.trait-lost': true };")).toEqual(["f 'hero.trait-lost'"]);
    expect(reads("function g(p) { switch (p[0]) { case 'has-trait': return 1; } }")).toEqual(["g 'has-trait'"]);
  });

  test('is an effect kind or the trait consequence where a kind is compared, a case or a kind', () => {
    expect(reads("function a(e) { return e.kind === 'statModifiers'; }")).toEqual(["a 'statModifiers'"]);
    expect(reads("function b(e) { switch (e.kind) { case 'upkeepFactor': return 1; } }")).toEqual(["b 'upkeepFactor'"]);
    expect(reads("const c = { kind: 'trait', traitKey: 'x' };")).toEqual(["c 'trait'"]);
  });

  test("is none in an object with gear's statModifiers alone, or a kind's name not standing as a kind", () => {
    expect(reads('export const a = { name: "x", statModifiers: { strength: 1 } };')).toEqual([]);
    expect(reads("export const b = (item) => item.slot === 'statModifiers ' || 'trait'.length > 0;")).toEqual([]);
  });

  test('is none in a comment, a type, an import, or gear\'s statModifiers as a field', () => {
    expect(reads('// c.heroTraits and hero.traits\n/* has-trait */\nexport const a = 1;')).toEqual([]);
    expect(reads("export type T = Pick<ContentSet, 'heroTraits'> & { traits: string[] };\ninterface U { heroTraits: object }")).toEqual([]);
    expect(reads("export function f(x: Pick<Hero, 'traits'>): ['has-trait', string] | null { return null; }")).toEqual([]);
    expect(reads("import { heroTraits } from './has-trait';\nexport { x } from 'hero.trait-lost';")).toEqual([]);
    expect(reads("function g(item) { return Reflect.has(item, 'statModifiers') || item.statModifiers; }")).toEqual([]);
  });
});
