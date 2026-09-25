import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { contentDir } from './node.js';

// The shape of content is the engine's; the content package imports it as types and the
// engine imports nothing back (ADR-0006, ADR-0007, pre-M0 review A3). ESLint enforces the
// imports (engine/src/boundary.test.ts proves its rules fire); these tests read the real
// sources and project files, so that the arrangement itself is checked, not only the rules.

const root = join(contentDir, '..');

/** The TypeScript files of a package's src/, tests included unless `withTests` is false. */
function sources(pkg: string, withTests = true): { file: string; ast: ts.SourceFile }[] {
  const dir = join(root, pkg, 'src');
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && (withTests || !file.endsWith('.test.ts')))
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

describe("content's types come from @heroesim/engine", () => {
  const engineTypes = ['ContentSet', 'Stat', 'Class', 'Skill', 'Trait', 'Background', 'Sphere', 'Names'];

  test('the pure and Node entries take the ContentSet type from the engine', () => {
    const fromEngine = sources('content', false).filter(({ ast }) =>
      importsOf(ast).some((it) => it.from === '@heroesim/engine'),
    );

    expect(fromEngine.map(({ file }) => file).sort()).toEqual(['node.ts', 'parse.ts', 'validate.ts']);
  });

  test('every import from the engine, tests included, is of types only', () => {
    for (const { file, ast } of sources('content')) {
      for (const it of importsOf(ast).filter((each) => each.from.startsWith('@heroesim/'))) {
        expect({ file, ...it }).toEqual({ file, from: '@heroesim/engine', typeOnly: true });
      }
    }
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

// The one subpath any package exports is content's Node entry (M1-S4, DL-14 item 7).
describe('@heroesim/content/node', { timeout: 30_000 }, () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (pkg: string, specifier: string) => {
    const [result] = await eslint.lintText(`import { x } from '${specifier}';\nexport { x };\n`, {
      filePath: join(root, pkg, 'src', 'subpath-probe.ts'),
    });
    return (result?.messages ?? []).filter((message) => message.severity === 2);
  };

  test.each(['cli', 'harness'])('may be imported by %s, which runs on Node', async (pkg) => {
    expect(await lint(pkg, '@heroesim/content/node')).toEqual([]);
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
