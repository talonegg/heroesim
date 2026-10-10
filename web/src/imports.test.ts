// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// Nothing in `web/` computes a rule (ADR-0007, principle 12), and no component calls the engine:
// components dispatch plays and read state. So only `state/`, where the reducer calls the
// engine, and `content.ts`, which parses the bundled content, import anything but types from
// `@heroesim/engine`. Every other file under `web/src`, tests included, takes its types alone.
// Checked here rather than by ESLint, as v1 did (feature/poc, E8-S2): the line is the page's own.

const srcDir = fileURLToPath(new URL('.', import.meta.url));

/** The files that may import the engine's values, relative to `web/src`, with `/` separators. */
const mayImportValues = (file: string): boolean => file.startsWith('state/') || file === 'content.ts';

/** Every TypeScript file under `web/src`, relative, with `/` separators. */
function sources(): string[] {
  return (
    readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
      .map((file) => file.replace(/\\/g, '/'))
      .filter((file) => /\.tsx?$/.test(file))
      // engine/src/boundary.test.ts writes and deletes probe files here while other tests run.
      .filter((file) => !/(^|\/)boundary-probe-/.test(file))
  );
}

/**
 * Where each import, re-export and dynamic `import()` in `source` reads from, and whether it takes
 * types alone: `import type`, `export type`, an `import('…')` type, or named imports every one of
 * which is `type`. A default, namespace or side-effect import (`import {}` counted as one),
 * `export *`, and `import()` take values.
 */
function importsOf(source: string, file = 'probe.tsx'): { from: string; typesOnly: boolean }[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { from: string; typesOnly: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const everyNameAType =
        clause !== undefined &&
        clause.name === undefined &&
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly);
      found.push({ from: node.moduleSpecifier.text, typesOnly: clause?.isTypeOnly === true || everyNameAType });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const everyNameAType =
        clause !== undefined && ts.isNamedExports(clause) && clause.elements.every((element) => element.isTypeOnly);
      found.push({ from: node.moduleSpecifier.text, typesOnly: node.isTypeOnly || everyNameAType });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      // A no-substitution template, import(`@heroesim/engine`), names its module as plainly as a quoted
      // string does, and the bundler resolves it the same (DL-74).
      found.push({ from: specifier !== undefined && ts.isStringLiteralLike(specifier) ? specifier.text : '(computed)', typesOnly: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push({ from: node.argument.literal.text, typesOnly: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

describe("the engine's values in web/src", () => {
  const files = sources();

  test('the check reads the page: the reducer, the content load and the app among its files', () => {
    expect(files).toEqual(expect.arrayContaining(['state/reducer.ts', 'content.ts', 'app.tsx', 'main.tsx']));
  });

  test('are imported only under state/ and in content.ts; everything else takes types alone', () => {
    const offenders = files
      .filter((file) => !mayImportValues(file))
      .flatMap((file) =>
        importsOf(readFileSync(path.join(srcDir, file), 'utf8'), file)
          .filter((it) => it.from === '@heroesim/engine' && !it.typesOnly)
          .map(() => file),
      );

    expect(offenders).toEqual([]);
  });

  test('are imported under state/, where the reducer calls the engine', () => {
    const reducer = importsOf(readFileSync(path.join(srcDir, 'state', 'reducer.ts'), 'utf8'));

    expect(reducer).toContainEqual({ from: '@heroesim/engine', typesOnly: false });
  });
});

describe('what the check counts as types alone', () => {
  test.each([
    ["import type { WorldDocument } from '@heroesim/engine';", true],
    ["import { type WorldDocument, type Hero } from '@heroesim/engine';", true],
    ["export type { WorldDocument } from '@heroesim/engine';", true],
    ["export { type WorldDocument } from '@heroesim/engine';", true],
    ["let a: import('@heroesim/engine').Hero;", true],
    ["import { advance } from '@heroesim/engine';", false],
    ["import { advance, type Hero } from '@heroesim/engine';", false],
    ["import * as engine from '@heroesim/engine';", false],
    ["import engine from '@heroesim/engine';", false],
    ["import '@heroesim/engine';", false],
    ["import {} from '@heroesim/engine';", false],
    ["export { advance } from '@heroesim/engine';", false],
    ["export * from '@heroesim/engine';", false],
    ["const Board = () => { void import('@heroesim/engine'); return <p />; };", false],
    ['const Board = () => { void import(`@heroesim/engine`).then((engine) => engine.advance); return <p />; };', false],
  ])('%s → types alone: %s', (source, typesOnly) => {
    expect(importsOf(source)).toEqual([{ from: '@heroesim/engine', typesOnly }]);
  });

  test('a component that calls the engine is caught', () => {
    const component = [
      "import { useState } from 'react';",
      "import { advance, type WorldDocument } from '@heroesim/engine';",
      'export function Board({ document }: { document: WorldDocument }) {',
      '  const [next] = useState(() => advance(document, deps));',
      '  return <p>{next.document.world.turn}</p>;',
      '}',
    ].join('\n');

    expect(importsOf(component).filter((it) => it.from === '@heroesim/engine')).toEqual([
      { from: '@heroesim/engine', typesOnly: false },
    ]);
  });
});
