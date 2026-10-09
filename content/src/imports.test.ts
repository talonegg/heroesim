import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import * as engineMain from '@heroesim/engine';
import * as engine from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import * as content from './index.js';
import { contentDir } from './node.js';

// The shape of content is the engine's; the content package imports its types and its values, and
// the engine imports nothing back, so the graph stays acyclic (ADR-0006, ADR-0007, pre-M0 review A3
// as refined by DL-186 item 6). ESLint enforces the imports (engine/src/boundary.test.ts proves its
// rules fire); these tests read the real sources and project files, so that the arrangement itself
// is checked, not only the rules.

const root = join(contentDir, '..');

/** The TypeScript files of a package's src/, tests included unless `withTests` is false. */
function sources(pkg: string, withTests = true): { file: string; ast: ts.SourceFile }[] {
  const dir = join(root, pkg, 'src');
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && (withTests || !file.endsWith('.test.ts')))
    // engine/src/boundary.test.ts writes and deletes probe files in each package's src/ while other tests run.
    .filter((file) => !/(^|[\\/])boundary-probe-/.test(file))
    .map((file) => ({
      file,
      ast: ts.createSourceFile(file, readFileSync(join(dir, file), 'utf8'), ts.ScriptTarget.Latest),
    }));
}

/** Every import and re-export in a file: where from, and whether it carries types only. */
function importsOf(ast: ts.SourceFile): { from: string; typeOnly: boolean }[] {
  const found: { from: string; typeOnly: boolean }[] = [];
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const everyNameIsAType =
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        clause?.name === undefined &&
        bindings.elements.every((element) => element.isTypeOnly);
      found.push({
        from: statement.moduleSpecifier.text,
        typeOnly: clause?.isTypeOnly === true || everyNameIsAType,
      });
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      found.push({ from: statement.moduleSpecifier.text, typeOnly: statement.isTypeOnly });
    }
  }
  return found;
}

describe('the sources these tests read', () => {
  test("leave out engine/src/boundary.test.ts's probe files, which come and go while other tests run", () => {
    // A probe as boundary.test.ts writes one: a value import from the engine, which the tests below would
    // count among the files that take the engine's values.
    const file = `boundary-probe-${randomUUID()}.ts`;
    const path = join(root, 'content', 'src', file);
    writeFileSync(path, "import { x } from '@heroesim/engine/content';\nexport { x };\n");
    try {
      const files = sources('content').map((source) => source.file);

      expect(files).toContain('node.ts');
      expect(files).not.toContain(file);
    } finally {
      rmSync(path, { force: true });
    }
  });
});

describe("content's types come from the engine's content entry, @heroesim/engine/content", () => {
  const engineTypes = ['ContentSet', 'Stat', 'Class', 'Skill', 'Trait', 'Background', 'Sphere', 'Names'];

  test('the pure and Node entries take the ContentSet type from the engine', () => {
    const fromEngine = sources('content', false).filter(({ ast }) =>
      importsOf(ast).some((it) => it.from === '@heroesim/engine/content'),
    );

    expect(fromEngine.map(({ file }) => file.replace(/\\/g, '/')).sort()).toEqual(['node.ts', 'parse.ts', 'uses/register.ts', 'validate.ts']);
  });

  // DL-243: content's view of the engine is its content entry; a test may also take the main entry.
  test("every import of another package is of the engine's content entry by name, a test's of the engine too", () => {
    for (const { file, ast } of sources('content')) {
      const allowed = file.endsWith('.test.ts') ? ['@heroesim/engine/content', '@heroesim/engine'] : ['@heroesim/engine/content'];
      for (const it of importsOf(ast).filter((each) => each.from.startsWith('@heroesim/'))) {
        expect(allowed, `${file} imports ${it.from}`).toContain(it.from);
      }
    }
  });

  // DL-186 item 6 (v1.1.6-S5): content may take the engine's values, so it repeats none of them.
  test("takes the engine's values too: the parser, the checks and the register of a Trait's uses import some", () => {
    const withValues = sources('content', false).filter(({ ast }) =>
      importsOf(ast).some((it) => it.from === '@heroesim/engine/content' && !it.typeOnly),
    );

    expect(withValues.map(({ file }) => file.replace(/\\/g, '/')).sort()).toEqual(['parse.ts', 'uses/register.ts', 'validate.ts']);
  });

  test('content declares none of those types itself', () => {
    for (const { file, ast } of sources('content')) {
      const declared = ast.statements
        .filter((it) => ts.isInterfaceDeclaration(it) || ts.isTypeAliasDeclaration(it))
        .map((it) => (it as ts.InterfaceDeclaration | ts.TypeAliasDeclaration).name.text);

      expect(declared.filter((name) => engineTypes.includes(name)), file).toEqual([]);
    }
  });
});

// The copies DL-186 item 6 retired (v1.1.6-S5): content's own sources write out none of the engine's
// lists, as an array of its members or a table keyed by them, and its entry exports no name the
// engine exports, as `descriptionBounds` and the Biography's Trait sentence counts once were.
describe("content repeats none of the engine's values", () => {
  const lists: Record<string, readonly string[]> = {
    encounterKinds: engine.encounterKinds,
    facilityKeys: engine.facilityKeys,
    gearSlotKeys: engine.gearSlotKeys,
    descriptiveAttributes: engineMain.descriptiveAttributes,
    sexes: engine.sexes,
    degrees: engine.degrees,
    purchaseSteps: engine.purchaseSteps,
  };

  /** `name: true` or `name: 60`: an entry of a table of choices or of bounds, not of data built per name. */
  const isTableEntry = (it: ts.ObjectLiteralElementLike): boolean =>
    ts.isPropertyAssignment(it) &&
    (ts.isIdentifier(it.name) || ts.isStringLiteral(it.name)) &&
    (it.initializer.kind === ts.SyntaxKind.TrueKeyword || ts.isNumericLiteral(it.initializer));

  /** The names each array of strings, or table of choices or bounds, in a file holds, with the line it starts on. */
  function literalsOf(ast: ts.SourceFile): { line: number; names: string[] }[] {
    const found: { line: number; names: string[] }[] = [];
    const visit = (node: ts.Node): void => {
      let names: string[] | null = null;
      if (ts.isArrayLiteralExpression(node) && node.elements.every((it) => ts.isStringLiteral(it))) {
        names = node.elements.map((it) => (it as ts.StringLiteral).text);
      } else if (ts.isObjectLiteralExpression(node) && node.properties.every(isTableEntry)) {
        names = node.properties.map((it) => (it.name as ts.Identifier | ts.StringLiteral).text);
      }
      if (names !== null && names.length > 0) {
        found.push({ line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, names });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    return found;
  }

  test.each(Object.keys(lists))("no source writes out the engine's %s", (name) => {
    const members = [...(lists[name] ?? [])].sort().join(' ');
    for (const { file, ast } of sources('content', false)) {
      const copies = literalsOf(ast).filter((it) => [...new Set(it.names)].sort().join(' ') === members);

      expect(copies.map((it) => `${file}:${it.line}`)).toEqual([]);
    }
  });

  test('the entry exports no name the engine exports', () => {
    expect(Object.keys(content).filter((name) => Object.hasOwn(engine, name) || Object.hasOwn(engineMain, name))).toEqual([]);
  });
});

describe('the engine imports nothing from @heroesim/content', () => {
  test('in any file of engine/src, not even a type', () => {
    for (const { file, ast } of sources('engine')) {
      const fromContent = importsOf(ast).filter((it) => it.from.startsWith('@heroesim/content'));

      expect(fromContent, file).toEqual([]);
    }
  });
});

describe('the TypeScript project references', () => {
  const referencesOf = (pkg: string): string[] | undefined => {
    const { config, error } = ts.readConfigFile(join(root, pkg, 'tsconfig.json'), ts.sys.readFile);
    if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    return (config as { references?: { path: string }[] }).references?.map((it) => it.path);
  };

  test('make content reference the engine and the engine reference nothing', () => {
    expect(referencesOf('content')).toEqual(['../engine']);
    expect(referencesOf('engine')).toBeUndefined();
  });
});

// Content's Node entry is one of the two subpaths any package exports (M1-S4, DL-14 item 7); the
// other is its register of a Trait's uses, below (v1.1.4-S12).
describe('@heroesim/content/node', { timeout: 30_000 }, () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (pkg: string, specifier: string, file = 'subpath-probe.ts') => {
    const [result] = await eslint.lintText(`import { x } from '${specifier}';\nexport { x };\n`, {
      filePath: join(root, pkg, 'src', file),
    });
    return (result?.messages ?? []).filter((message) => message.severity === 2);
  };

  test.each(['cli', 'harness'])('may be imported by %s, which runs on Node', async (pkg) => {
    expect(await lint(pkg, '@heroesim/content/node')).toEqual([]);
  });

  // M7-S1: web's tests compare the bundled content with the Node entry's (DL-64).
  test.each(['subpath-probe.test.ts', 'subpath-probe.test.tsx'])(
    "may be imported by web's tests, which run on Node (%s)",
    async (file) => {
      expect(await lint('web', '@heroesim/content/node', file)).toEqual([]);
    },
  );

  test('may not be imported by a web component, which runs in a browser', async () => {
    const errors = await lint('web', '@heroesim/content/node', 'subpath-probe.tsx');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe('@typescript-eslint/no-restricted-imports');
  });

  test.each([
    ['web, which runs in a browser', 'web', '@heroesim/content/node'],
    ['the engine', 'engine', '@heroesim/content/node'],
    ['cli, as any other subpath', 'cli', '@heroesim/content/node/extra'],
    ['harness, as a path into the source', 'harness', '@heroesim/content/src/node.ts'],
  ])('may not be imported by %s', async (_name, pkg, specifier) => {
    const errors = await lint(pkg, specifier);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe('@typescript-eslint/no-restricted-imports');
  });
});

// The register of a Trait's uses (v1.1.4-S12, DL-150 item 14), content's second subpath, is the tools':
// the game never imports it, so no byte of it is in the page's script.
describe('@heroesim/content/uses', { timeout: 30_000 }, () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (pkg: string, specifier: string) => {
    const [result] = await eslint.lintText(`import { x } from '${specifier}';\nexport { x };\n`, {
      filePath: join(root, pkg, 'src', 'subpath-probe.ts'),
    });
    return (result?.messages ?? []).filter((message) => message.severity === 2);
  };

  test.each(['tools/editor', 'tools/portraits'])('may be imported by %s', async (pkg) => {
    expect(await lint(pkg, '@heroesim/content/uses')).toEqual([]);
  });

  test.each(['web', 'cli', 'harness', 'engine'])('may not be imported by %s', async (pkg) => {
    const errors = await lint(pkg, '@heroesim/content/uses');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe('@typescript-eslint/no-restricted-imports');
  });

  test('nor may another subpath by a tool', async () => {
    expect(await lint('tools/editor', '@heroesim/content/uses/register')).toHaveLength(1);
  });
});

// The tools' write module (v1.1.6-S4, DL-186 item 14), content's third subpath: Node's, and the tools'
// alone, so no byte of it is in the page's script and no front end or the harness writes content.
describe('@heroesim/content/write', { timeout: 30_000 }, () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (pkg: string, specifier: string, file = 'subpath-probe.ts') => {
    const [result] = await eslint.lintText(`import { x } from '${specifier}';\nexport { x };\n`, {
      filePath: join(root, pkg, 'src', file),
    });
    return (result?.messages ?? []).filter((message) => message.severity === 2);
  };

  test.each(['tools/editor', 'tools/portraits'])('may be imported by %s', async (pkg) => {
    expect(await lint(pkg, '@heroesim/content/write')).toEqual([]);
  });

  test.each(['web', 'cli', 'harness', 'engine'])('may not be imported by %s', async (pkg) => {
    const errors = await lint(pkg, '@heroesim/content/write');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe('@typescript-eslint/no-restricted-imports');
  });

  test("nor by web's tests, nor may another subpath be by a tool", async () => {
    expect(await lint('web', '@heroesim/content/write', 'subpath-probe.test.ts')).toHaveLength(1);
    expect(await lint('tools/editor', '@heroesim/content/write/version')).toHaveLength(1);
  });

  test('may use Node, as the Node entry may, where the rest of content may not', async () => {
    const node = "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n";
    const [write] = await eslint.lintText(node, { filePath: join(root, 'content', 'src', 'write', 'subpath-probe.ts') });
    const [pure] = await eslint.lintText(node, { filePath: join(root, 'content', 'src', 'subpath-probe.ts') });
    expect((write?.messages ?? []).filter((message) => message.severity === 2)).toEqual([]);
    expect((pure?.messages ?? []).filter((message) => message.severity === 2)).toHaveLength(1);
  });

  test('is no export of the pure entry, which the page imports', () => {
    const entry = sources('content', false).find(({ file }) => file === 'index.ts');
    expect(entry).toBeDefined();
    expect(importsOf(entry?.ast as ts.SourceFile).filter((it) => it.from.includes('write'))).toEqual([]);
  });
});
