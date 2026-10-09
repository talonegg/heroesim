import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as contentTypes from './content-types.js';
import * as events from './events.js';
import * as engine from './index.js';
import * as testing from './testing.js';

// v1.1.6-S8 (DL-186 item 9): the engine's interface narrowed to what its callers use. The entry
// exports the values the other packages' production code imports, the module seam's error and
// tables, and the values of its modules of types (events, content's types); the mutators and the
// engine's own helpers are not exported. What only tests take is `@heroesim/engine/testing`, which
// no production code imports: ESLint bars it (boundary.test.ts proves the rule fires), and these
// tests read the packages' sources.

const root = fileURLToPath(new URL('../../', import.meta.url));

/** The packages' TypeScript sources outside the engine, as paths from the repository's root; the words' from v1.1.6-S11. */
function sources(): string[] {
  const dirs = ['cli/src', 'content/src', 'words/src', 'harness/src', 'web/src', 'web/e2e', 'tools/editor/src', 'tools/portraits/src'];
  return dirs.flatMap((dir) =>
    readdirSync(`${root}${dir}`, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/(^|[\\/])boundary-probe-/.test(file))
      .map((file) => `${dir}/${file.replaceAll('\\', '/')}`),
  );
}

/** A test, a test's support file or setup, or a Playwright spec: the files ESLint lets take /testing. */
const isTest = (file: string): boolean =>
  /\.test\.tsx?$/.test(file) || /test-support\.tsx?$/.test(file) || /(^|\/)test-setup\.ts$/.test(file) || file.startsWith('web/e2e/');

/** The names each file imports from `from`, by its named imports. */
function importedNames(file: string, from: string): string[] {
  const text = readFileSync(`${root}${file}`, 'utf8');
  const pattern = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'${from.replace('/', '\\/')}'`, 'g');
  return [...text.matchAll(pattern)].flatMap((match) =>
    (match[1] ?? '')
      .split(',')
      .map((name) => name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '')
      .filter((name) => name !== ''),
  );
}

const files = sources();
const production = files.filter((file) => !isTest(file));
const tests = files.filter(isTest);
const usedBy = (group: readonly string[], from: string): Set<string> => new Set(group.flatMap((file) => importedNames(file, from)));

/** The mutators and engine-internal helpers the plan names, and the twelve document-level actions. */
const hidden = [
  'takeId',
  'createItem',
  'moveItem',
  'moveStack',
  'removeFromStack',
  'adjustRegard',
  'applyToCopy',
  'applyGuildAction',
  'applyGuildActions',
  'applyBuild',
  'applyBuy',
  'applyDispatch',
  'applyEquip',
  'applyUnequip',
  'applyRecruit',
  'applySell',
  'applyTransferIn',
  'applyTransferOut',
  'applyOfferTransfer',
  'applyAcceptTransfer',
  'applyDeclineTransfer',
  'createHistory',
  'append',
  'emptyDocument',
  'generateGuild',
  'generateRival',
  'generatePatron',
  'rivalChoices',
  'rowOf',
  'requireRow',
  'activeRosterHeroes',
  'build',
  'buy',
  'dispatch',
  'equip',
  'unequip',
  'recruit',
  'sell',
  'transferIn',
  'transferOut',
  'offerTransfer',
  'acceptTransfer',
  'declineTransfer',
];

describe("the engine's entry", () => {
  test('reads the packages it is held to', () => {
    expect(production).toContain('cli/src/main.ts');
    expect(production).toContain('web/src/state/reducer.ts');
    expect(production).toContain('words/src/query.ts');
    expect(tests).toContain('cli/src/main.test.ts');
    expect(tests).toContain('web/src/state/game.test-support.ts');
  });

  test('exports none of the mutators, the engine-internal helpers or the document-level actions', () => {
    const exported = new Set(Object.keys(engine));
    expect(hidden.filter((name) => exported.has(name))).toEqual([]);
    expect(exported).toContain('applyAction');
  });

  test("exports only values production code takes, the module seam's, and those of its modules of types", () => {
    const taken = usedBy(production, '@heroesim/engine');
    const ofTypes = new Set([...Object.keys(events), ...Object.keys(contentTypes)]);
    const seam = new Set(['ModuleError', 'hookNames', 'moduleEffectKinds']);
    const unused = Object.keys(engine).filter((name) => !taken.has(name) && !ofTypes.has(name) && !seam.has(name));

    expect(unused).toEqual([]);
  });
});

describe('@heroesim/engine/testing', () => {
  test('production code imports nothing from it', () => {
    // Either quote: ESLint's rule reads the specifier, whatever quotes it.
    const offenders = production.filter((file) => /(['"])@heroesim\/engine\/testing\1/.test(readFileSync(`${root}${file}`, 'utf8')));

    expect(offenders).toEqual([]);
  });

  test('holds only what tests take and the entry does not export', () => {
    const taken = usedBy(tests, '@heroesim/engine/testing');
    const exported = new Set(Object.keys(engine));

    expect(Object.keys(testing).filter((name) => !taken.has(name))).toEqual([]);
    expect(Object.keys(testing).filter((name) => exported.has(name))).toEqual([]);
    expect([...taken].filter((name) => !(name in testing))).toEqual([]);
  });
});
