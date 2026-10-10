import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as contentEntry from './content.js';
import * as contentTypes from './content-types.js';
import * as events from './events.js';
import * as engine from './index.js';
import * as testing from './testing.js';

// DL-186 item 9: the engine's interface narrowed to what its callers use. The entry
// exports the values the other packages' production code imports, the module seam's error and
// tables, and the values of its modules of types (events, content's types); the mutators and the
// engine's own helpers are not exported. What only tests take is `@heroesim/engine/testing`, which
// no production code imports: ESLint bars it (boundary.test.ts proves the rule fires), and these
// tests read the packages' sources.

const root = fileURLToPath(new URL('../../', import.meta.url));

/** The packages' TypeScript sources outside the engine, as paths from the repository's root; the words' too (DL-197). */
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

  test("exports only values production code takes, the module seam's, and the events'", () => {
    const taken = usedBy(production, '@heroesim/engine');
    const ofTypes = new Set(Object.keys(events));
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

// DL-243: content's own entry, `@heroesim/engine/content` (content.ts): content's types and lists, the
// bounds content checks its text against, and `queryProblems`. Content, the words and the content
// editor take content's vocabulary from it; the main entry names a content type or list only where a
// front end, the harness or the portrait tool takes it.
describe("the engine's content entry", () => {
  /** Every name a module of the engine declares as exported: its types and interfaces, constants and functions. */
  const declaredIn = (file: string): string[] =>
    [...readFileSync(`${root}engine/src/${file}`, 'utf8').matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map((match) => match[1] ?? '');
  /** The names `index.ts` or `content.ts` re-exports by name from `module`. */
  const namedFrom = (entry: string, module: string): string[] => {
    const text = readFileSync(`${root}engine/src/${entry}`, 'utf8');
    const block = new RegExp(`export (?:type )?\\{([^}]*)\\} from '\\./${module.replace('.', '\\.')}'`).exec(text)?.[1] ?? '';
    return block.split(',').map((name) => name.trim().replace(/^type\s+/, '')).filter((name) => name !== '');
  };
  const contentNames = new Set([
    ...declaredIn('content-types.ts'),
    ...namedFrom('content.ts', 'descriptions.js'),
    ...namedFrom('content.ts', 'document.js'),
    ...namedFrom('content.ts', 'generators/draw.js'),
    ...namedFrom('content.ts', 'quest-engine/query/problems.js'),
    ...namedFrom('content.ts', 'config.js'),
    ...namedFrom('content.ts', 'config-check.js'),
    ...namedFrom('content.ts', 'tiers.js'),
  ]);
  /** The production sources of content, the words and the content editor: content's readers. */
  const readers = production.filter((file) => /^(content|words|tools\/editor)\//.test(file));
  /** The other packages, tests and all, that take the engine by its main entry. */
  const others = files.filter((file) => !/^(content|words|tools\/editor)\//.test(file));

  test("exports every value of content's types, its lists and queryProblems", () => {
    expect(Object.keys(contentTypes).filter((name) => !Object.hasOwn(contentEntry, name))).toEqual([]);
    for (const name of ['queryProblems', 'tierLadder', 'tierFields', 'tierRowProblems', 'inBeatPool', 'shortBeats', 'facilityKeys', 'sexes', 'descriptiveAttributeMaxLength', 'biographyTraitSentences', 'heroBiographyTraitSentences']) {
      expect(contentEntry).toHaveProperty(name);
    }
    expect(contentNames.has('ContentSet') && contentNames.has('QueryKeys') && contentNames.has('Sex')).toBe(true);
  });

  test("is where content, the words and the content editor take content's names from", () => {
    const fromMain = readers.flatMap((file) => importedNames(file, '@heroesim/engine').filter((name) => contentNames.has(name)).map((name) => `${file}: ${name}`));

    expect(readers).toContain('content/src/parse.ts');
    expect(readers).toContain('tools/editor/src/traits-kind.ts');
    expect(fromMain).toEqual([]);
  });

  test('leaves the main entry naming only the content names a front end, the harness or a tool takes from it', () => {
    const taken = usedBy(others, '@heroesim/engine');
    const named = namedFrom('index.ts', 'content-types.js');

    expect(named).toContain('ContentSet');
    expect(named.filter((name) => !taken.has(name))).toEqual([]);
    expect(['queryProblems', 'biographyTraitSentences', 'heroBiographyTraitSentences', 'purchaseSteps'].filter((name) => Object.hasOwn(engine, name))).toEqual([]);
  });
});
