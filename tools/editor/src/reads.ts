// Where the engine and the content's checks read a Trait (v1.1.4-S12, DL-150 item 14): the drift
// test's eyes. Each TypeScript file of `engine/src/` and `content/src/validate.ts`, tests left out,
// is parsed with TypeScript's own parser, and every read of a Trait in its code (never a comment or
// a type) is named by its file and the top-level declaration it stands in:
// - the two lists, `guildmasterTraits` and `heroTraits`, and a person's or a sentence list's
//   `.traits`, read as a property or destructured;
// - an Injury's `.leavesTrait`;
// - the `has-trait` predicate wherever its name stands as a value, and the two Trait events,
//   `hero.trait-gained` and `hero.trait-lost`, in any string or template that names `hero.trait-`;
// - the effect kinds of both lists, and the `trait` consequence's kind, where a kind is compared
//   (`===`, `!==`, `==`, `!=`), is a `case`, is a row's `kind`, or stands in a list (as `.includes`
//   and `new Set(…).has` read them), through any `as`, `satisfies`, `!` or parentheses; and an object
//   keyed by effect kinds (one of a Guildmaster's or the Encounter bonus, or two kinds). Gear's
//   `statModifiers`, a field and not a kind, is not a read;
// - a call or other reference of a Trait helper the register lists (`traitHelpers`), imported or in
//   its own file, since a rule may read a Trait through one without naming any of the above (the
//   verification of v1.1.4-S12).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { traitHelpers, type SourcePlace } from '@heroesim/content/uses';
import ts from 'typescript';

/** The properties whose read is a read of a Trait. */
const traitProperties = new Set(['guildmasterTraits', 'heroTraits', 'traits', 'leavesTrait']);
/** The kinds that are a read of a Trait where a kind is compared, chosen or listed: the effect kinds, and the earned Trait's consequence. */
const traitKinds = new Set(['classStatBonus', 'guildMoraleShift', 'upkeepFactor', 'statModifiers', 'encounterBonus', 'trait']);
/** The effect kinds no other field shares: one of them as an object's key is a read. */
const plainEffectKinds = new Set(['classStatBonus', 'guildMoraleShift', 'upkeepFactor', 'encounterBonus']);
/** The effect kinds as an object's keys: two of them are a read. */
const effectKinds = new Set([...plainEffectKinds, 'statModifiers']);

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

/**
 * Whether a file is one of `engine/src/boundary.test.ts`'s probes, which it writes as
 * `<package>/src/boundary-probe-<uuid>.<extension>` and deletes while other tests run. A file of
 * that name anywhere else is read as any other.
 */
export function isBoundaryProbe(file: string): boolean {
  return /^[a-z]+\/src\/boundary-probe-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(test\.)?tsx?$/.test(file);
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
        if (relative.endsWith('.ts') && !relative.endsWith('.d.ts') && !isTest(relative) && !isBoundaryProbe(relative)) files.push(relative);
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

/** `node` with every `as`, `satisfies`, `!`, `<T>` and parentheses around it. */
function unwrapped(node: ts.Node): ts.Node {
  let outer = node;
  while (
    outer.parent !== undefined &&
    (ts.isParenthesizedExpression(outer.parent) ||
      ts.isAsExpression(outer.parent) ||
      ts.isSatisfiesExpression(outer.parent) ||
      ts.isNonNullExpression(outer.parent) ||
      ts.isTypeAssertionExpression(outer.parent))
  ) {
    outer = outer.parent;
  }
  return outer;
}

const comparisons = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** Whether a kind's string stands where a kind is compared, chosen or listed. */
function asKind(node: ts.Node): boolean {
  const outer = unwrapped(node);
  const parent = outer.parent;
  if (parent === undefined) return false;
  if (ts.isCaseClause(parent) && parent.expression === outer) return true;
  if (ts.isBinaryExpression(parent)) return comparisons.has(parent.operatorToken.kind);
  if (ts.isArrayLiteralExpression(parent)) return true;
  return ts.isPropertyAssignment(parent) && parent.initializer === outer && ts.isIdentifier(parent.name) && parent.name.text === 'kind';
}

/** A property's name as text, or `null` for a computed one. */
function propertyName(name: ts.PropertyName | undefined): string | null {
  if (name === undefined) return null;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}

/** The effect kinds an object is keyed by, where they make it a read. */
function kindKeys(node: ts.ObjectLiteralExpression): string[] {
  const keys = node.properties.flatMap((property) => {
    const name = propertyName(property.name);
    return name !== null && effectKinds.has(name) ? [name] : [];
  });
  return keys.some((key) => plainEffectKinds.has(key)) || new Set(keys).size >= 2 ? keys : [];
}

/** Whether an identifier stands as a value of its own, not a property's or a declaration's name. */
function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return false;
  if ((ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === node) return false;
  return !(ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent));
}

/** The module a relative specifier names, from the root, with `/` and `.ts`; `null` for a package. */
function resolved(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.js$/, '.ts');
}

/** In one file, each local name of a Trait helper, and each namespace that holds helpers. */
function helpersIn(file: string, source: ts.SourceFile, helpers: readonly SourcePlace[]): { names: Map<string, string>; namespaces: Map<string, string> } {
  const byFile = new Map(helpers.map((place) => [place.file, new Set(place.names)]));
  const names = new Map<string, string>();
  const namespaces = new Map<string, string>();
  for (const name of byFile.get(file) ?? []) names.set(name, name);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = resolved(file, statement.moduleSpecifier.text);
    const held = module === null ? undefined : byFile.get(module);
    const bindings = statement.importClause?.namedBindings;
    if (held === undefined || module === null || bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.set(bindings.name.text, module);
    else {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (held.has(imported)) names.set(element.name.text, imported);
      }
    }
  }
  return { names, namespaces };
}

/** What `node` reads of a Trait, or `null`. */
function readOf(node: ts.Node, helpers: { names: Map<string, string>; namespaces: Map<string, string> }, byFile: Map<string, Set<string>>): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    if (traitProperties.has(node.name.text)) return `.${node.name.text}`;
    if (ts.isIdentifier(node.expression)) {
      const module = helpers.namespaces.get(node.expression.text);
      if (module !== undefined && (byFile.get(module)?.has(node.name.text) ?? false)) return `${node.name.text}()`;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    const key = stringText(node.argumentExpression);
    if (key !== null && traitProperties.has(key)) return `.${key}`;
  }
  if (ts.isBindingElement(node)) {
    const property = node.propertyName ?? node.name;
    if (ts.isIdentifier(property) && traitProperties.has(property.text)) return `{ ${property.text} }`;
  }
  if (ts.isIdentifier(node) && helpers.names.has(node.text) && isReference(node)) return `${helpers.names.get(node.text)}()`;
  if (ts.isObjectLiteralExpression(node)) {
    const keys = kindKeys(node);
    if (keys.length > 0) return `{ ${keys.join(', ')} }`;
  }
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    if (parts.some((part) => part.includes('hero.trait-'))) return `\`${parts.join('${…}')}\``;
  }
  const text = stringText(node);
  if (text !== null) {
    const parent = node.parent;
    // A module's name in an import or export is no read.
    if (parent !== undefined && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))) return null;
    if (text === 'has-trait' || text.includes('hero.trait-')) return `'${text}'`;
    if (traitKinds.has(text) && asKind(node)) return `'${text}'`;
  }
  return null;
}

/** Every read of a Trait in one file's text: `file` is its name from the root. */
export function readsIn(file: string, text: string, helpers: readonly SourcePlace[] = traitHelpers): TraitRead[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const local = helpersIn(file, source, helpers);
  const byFile = new Map(helpers.map((place) => [place.file, new Set(place.names)]));
  const found: TraitRead[] = [];
  for (const statement of source.statements) {
    // A type says what a value is, and reads nothing: interfaces, type aliases and every type below.
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
    const name = declared(statement);
    const visit = (node: ts.Node): void => {
      if (ts.isTypeNode(node)) return;
      const reads = readOf(node, local, byFile);
      if (reads !== null) found.push({ file, name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, reads });
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }
  return found;
}

/** Every read of a Trait in the scanned files under `root`. */
export function traitReads(root: string, helpers: readonly SourcePlace[] = traitHelpers): TraitRead[] {
  return scannedFiles(root).flatMap((file) => {
    let text: string;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      // A file gone since the folder was read holds nothing to read.
      return [];
    }
    return readsIn(file, text, helpers);
  });
}
