// Where the engine and the content's checks read a Trait (v1.1.4-S12, DL-150 item 14): the drift
// test's eyes. Each TypeScript file of `engine/src/` and `content/src/validate.ts`, tests left out,
// is parsed with TypeScript's own parser, and every read of a Trait in its code (never a comment or
// a type) is named by its file and the top-level declaration it stands in:
// - the two lists, `guildmasterTraits` and `heroTraits`, and a person's or a sentence list's
//   `.traits`, read as a property or destructured;
// - an Injury's `.leavesTrait`;
// - the `has-trait` predicate, and the two Trait events, `hero.trait-gained` and `hero.trait-lost`,
//   wherever their names stand as a value;
// - the effect kinds of both lists, and the `trait` consequence's kind, where a kind is compared, is
//   a `case`, or is a row's `kind`. Gear's `statModifiers`, a field and not a kind, is not a read.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** The properties whose read is a read of a Trait. */
const traitProperties = new Set(['guildmasterTraits', 'heroTraits', 'traits', 'leavesTrait']);
/** The names that are a read of a Trait wherever they stand as a value. */
const traitNames = new Set(['has-trait', 'hero.trait-gained', 'hero.trait-lost']);
/** The kinds that are a read of a Trait where a kind is compared or chosen: the effect kinds, and the earned Trait's consequence. */
const traitKinds = new Set(['classStatBonus', 'guildMoraleShift', 'upkeepFactor', 'statModifiers', 'encounterBonus', 'trait']);

/** Where the drift test looks, under a repository's root. */
export const scannedPlaces = ['engine/src', 'content/src/validate.ts'] as const;

/** One read of a Trait: its file (from the root, with `/`), the top-level declaration it stands in, its line and what it reads. */
export interface TraitRead {
  file: string;
  name: string;
  line: number;
  reads: string;
}

/** Whether a file is a test's, which the drift test does not read. */
function isTest(file: string): boolean {
  return /\.test\.tsx?$|test-support\.ts$/.test(file);
}

/** The scanned TypeScript files under `root`, from the root, with `/`, sorted. */
export function scannedFiles(root: string): string[] {
  const files: string[] = [];
  for (const place of scannedPlaces) {
    const full = path.join(root, place);
    if (!existsSync(full)) continue;
    if (statSync(full).isFile()) files.push(place);
    else {
      for (const entry of readdirSync(full, { recursive: true, encoding: 'utf8' })) {
        const relative = `${place}/${entry.replace(/\\/g, '/')}`;
        if (relative.endsWith('.ts') && !relative.endsWith('.d.ts') && !isTest(relative) && !/boundary-probe-/.test(relative)) files.push(relative);
      }
    }
  }
  return files.sort();
}

/** The name a top-level statement declares, or `(top level)` for one that declares none. */
function declared(statement: ts.Statement): string {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name !== undefined) {
    return statement.name.text;
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((each) => (ts.isIdentifier(each.name) ? each.name.text : each.name.getText())).join(', ');
  }
  return '(top level)';
}

/** The text of a string that stands as a value, or `null`. */
function stringText(node: ts.Node): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

/** Whether a kind's string stands where a kind is compared or chosen. */
function asKind(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isCaseClause(parent) && parent.expression === node) return true;
  if (ts.isBinaryExpression(parent)) {
    const operator = parent.operatorToken.kind;
    return [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(operator);
  }
  return ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isIdentifier(parent.name) && parent.name.text === 'kind';
}

/** What `node` reads of a Trait, or `null`. */
function readOf(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node) && traitProperties.has(node.name.text)) return `.${node.name.text}`;
  if (ts.isElementAccessExpression(node)) {
    const key = stringText(node.argumentExpression);
    if (key !== null && traitProperties.has(key)) return `.${key}`;
  }
  if (ts.isBindingElement(node)) {
    const property = node.propertyName ?? node.name;
    if (ts.isIdentifier(property) && traitProperties.has(property.text)) return `{ ${property.text} }`;
  }
  const text = stringText(node);
  if (text !== null) {
    const parent = node.parent;
    // A module's name in an import or export is no read.
    if (parent !== undefined && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))) return null;
    if (traitNames.has(text)) return `'${text}'`;
    if (traitKinds.has(text) && asKind(node)) return `'${text}'`;
  }
  return null;
}

/** Every read of a Trait in one file's text: `file` is its name from the root. */
export function readsIn(file: string, text: string): TraitRead[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: TraitRead[] = [];
  for (const statement of source.statements) {
    // A type says what a value is, and reads nothing: interfaces, type aliases and every type below.
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
    const name = declared(statement);
    const visit = (node: ts.Node): void => {
      if (ts.isTypeNode(node)) return;
      const reads = readOf(node);
      if (reads !== null) found.push({ file, name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, reads });
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }
  return found;
}

/** Every read of a Trait in the scanned files under `root`. */
export function traitReads(root: string): TraitRead[] {
  return scannedFiles(root).flatMap((file) => {
    let text: string;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      // A file gone since the folder was read, such as engine/src/boundary.test.ts's probes, which come
      // and go while other tests run, holds nothing to read.
      return [];
    }
    return readsIn(file, text);
  });
}
