// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerGuild, type EngineEventOf, type EntityId, type Entry, type TurnEvent, type WorldDocument } from '@heroesim/engine';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { append, createHistory } from '@heroesim/engine/testing';
import { playedDocument } from './game.test-support';
import {
  appendedOf,
  awayAt,
  foundingOf,
  historyPage,
  historyPageSize,
  newestEntries,
  newestNaming,
  partOfAReturn,
  returnEntries,
  scopePositions,
  wealthChanges,
} from './history-reader';

// The page's one reader of the History (DL-242): a Quest's return, a Guild's Wealth, a scope's page,
// and the few lookups the History view makes. It reads the History shared by reference and never
// copies it (ADR-0008), and no other page module reads the History's own lists.

/** A game of `turns` Turns, its History frozen deep, as a test of a reader that never writes. */
function playedFrozen(turns: number): WorldDocument {
  const { document } = playedDocument('history-reader', turns);
  const freeze = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const each of Object.values(value)) freeze(each);
  };
  freeze(document.history);
  return document;
}

describe('the reader reads the shared History by reference and never copies it (ADR-0008)', () => {
  const document = playedFrozen(180);
  const { history } = document;
  const own = new Set<object>(history.entries);
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error("no player's Guild");
  const outcome = history.entries.find((entry): entry is EngineEventOf<'quest.resolved'> => entry.type === 'quest.resolved');
  if (outcome === undefined) throw new Error('no return in the game');

  test('every entry it gives is the History’s own, read from a frozen History', () => {
    const read = returnEntries(history, outcome.payload);
    const given: Entry[] = [
      ...(read === null ? [] : [read.outcome, ...read.ofQuest, ...read.levels, ...read.gear]),
      ...newestEntries(history, guild.id, () => true, 30),
      ...wealthChanges(history, guild.id, () => ({})).map((change) => change.entry),
      ...[newestNaming(history, guild.id), foundingOf(history, guild.id)?.entry].filter((entry): entry is Entry => entry !== undefined),
    ];
    expect(read?.outcome).toBe(outcome);
    expect(given.length).toBeGreaterThan(30);
    for (const entry of given) expect(own.has(entry)).toBe(true);
  });

  test("a scope's positions, a page of them and what the last play appended are read without a copy of the entries", () => {
    const shows = (entry: Entry): boolean => entry.type !== 'hero.xp-gained';
    const positions = scopePositions(history, guild.id, shows);
    const page = historyPage(history, { count: positions.length, at: (index) => positions[positions.length - 1 - index] ?? -1, foldsSteps: true, keepsReturns: true }, 0);
    const log = history.entries.slice(-5) as TurnEvent[];

    expect(page.positions.length).toBeGreaterThanOrEqual(Math.min(20, positions.length));
    expect(positions.length).toBeGreaterThan(0);
    expect(page.positions[0]).toBe(positions.at(-1));
    expect([...appendedOf(history, log)]).toEqual(log);
    // Asked again with the History as it was, the scope's positions are the ones read before.
    expect(scopePositions(history, guild.id, shows)).toBe(positions);
  });

  test('which entries are a part of a return, and who was away, read the History alone', () => {
    const parts = history.entries.filter((entry) => partOfAReturn(history, entry));
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) expect(['quest.encounter', 'item.expended', 'hero.levelled', 'item.returned']).toContain(part.type);
    const [heroId] = outcome.payload.heroIds;
    expect(awayAt(history, heroId as EntityId as never, history.entries.indexOf(outcome))).toBe(true);
    // Once its Party's outcome is written, the Hero is home, no longer away.
    expect(awayAt(history, heroId as EntityId as never, history.entries.indexOf(outcome) + 1)).toBe(false);
  });

  test("a Party's steps with no outcome newer than them fold under none: a page holds twenty of them, as any entries", () => {
    const step = history.entries.find((entry) => entry.type === 'quest.encounter');
    if (step === undefined) throw new Error('no step in the game');
    const steps = createHistory();
    for (let count = 0; count < historyPageSize + 5; count += 1) append(steps, structuredClone(step));
    const count = steps.entries.length;
    const scope = { count, at: (index: number) => count - 1 - index, foldsSteps: true, keepsReturns: false };

    expect(historyPage(steps, scope, 0)).toMatchObject({ page: 0, pages: 2 });
    expect(historyPage(steps, scope, 0).positions).toHaveLength(historyPageSize);
    expect(historyPage(steps, scope, 1).positions).toHaveLength(5);
  });
});

// ── The page reads the History only through the reader ──────────────────────────────────────

const srcDir = fileURLToPath(new URL('..', import.meta.url));

/** The History's own lists, which the reader alone reads. */
const lists = new Set(['entries', 'byEntity', 'byType', 'milestones']);

/** The engine's readers of the History's index, which the reader alone imports (DL-242, DL-250). */
const indexReaders = new Set(['entriesFor', 'entriesBetween']);

/**
 * Whether `node` names the History: an expression ending in `history`, as `document.history` does, or
 * a name the file gave the History (`aliases`).
 */
function namesHistory(node: ts.Expression, aliases: ReadonlySet<string> = new Set()): boolean {
  const name = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isIdentifier(node) ? node.text : '';
  return /history$/i.test(name) || (ts.isIdentifier(node) && aliases.has(name));
}

/** The names `ast` gives the History: a variable set to it, or a variable or parameter of its type. */
function historyAliasesOf(ast: ts.SourceFile): Set<string> {
  const aliases = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      const typed = node.type !== undefined && /(^|\W)History$|\[['"]history['"]\]$/.test(node.type.getText());
      if (typed || (node.initializer !== undefined && namesHistory(node.initializer))) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return aliases;
}

/**
 * Where `source` reads one of the History's lists: `byEntity` or `byType` of anything, since nothing
 * else has them; `entries` or `milestones` of the History, read, read by key or taken apart; or
 * imports one of the engine's readers of its index (`indexReaders`), under any name.
 */
function historyReadsOf(source: string, file = 'probe.ts'): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aliases = historyAliasesOf(ast);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && lists.has(node.name.text)) {
      const call = ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (node.name.text === 'byEntity' || node.name.text === 'byType' || (!call && namesHistory(node.expression, aliases))) found.push(node.getText());
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && lists.has(node.argumentExpression.text)) {
      const key = node.argumentExpression.text;
      if (key === 'byEntity' || key === 'byType' || namesHistory(node.expression, aliases)) found.push(node.getText());
    } else if (ts.isVariableDeclaration(node) && node.initializer !== undefined && ts.isObjectBindingPattern(node.name) && namesHistory(node.initializer, aliases)) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) && lists.has(key.text)) found.push(element.getText());
      }
    } else if (ts.isImportSpecifier(node) && indexReaders.has((node.propertyName ?? node.name).text)) {
      found.push(node.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

/** The page's own modules under `web/src`, relative with `/`: no test, and no test's support. */
function pageModules(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test(-support)?\.tsx?$/.test(file) && !/(^|\/)boundary-probe-/.test(file));
}

describe('the page reads the History only through the reader (DL-242)', () => {
  test('no page module but the reader reads the History’s entries or its indexes', () => {
    const files = pageModules();
    expect(files).toEqual(expect.arrayContaining(['state/history.ts', 'state/quest-return.ts', 'state/treasury.ts', 'state/digest.ts', 'state/history-reader.ts']));
    const readers = files.filter((file) => historyReadsOf(readFileSync(path.join(srcDir, file), 'utf8'), file).length > 0);

    expect(readers).toEqual(['state/history-reader.ts']);
  });

  test.each([
    ['document.history.entries.length', 1],
    ['history.entries[3]', 1],
    ['history.byEntity[id]', 1],
    ['log.byType', 1],
    ['state.document.history.milestones', 1],
    ['const { entries, byEntity } = document.history;', 2],
    ['const { entries: all } = history;', 1],
    ['const log = document.history; log.entries.length;', 1],
    ['function first(log: History): Entry | undefined { return log.entries[0]; }', 1],
    ["history['entries'].length", 1],
    ["view['byEntity']", 1],
    ["rows['entries']", 0],
    ['Object.entries(rows)', 0],
    ['rows.entries', 0],
    ['new Map().entries()', 0],
    ['history.entries()', 0],
    ['view.milestones', 0],
    ['const { entries } = view;', 0],
    ["import { entriesFor } from '@heroesim/engine';", 1],
    ["import { entriesBetween as between, type Entry } from '@heroesim/engine';", 1],
    ["import { entryAt } from './history-reader';", 0],
  ])('%s reads the History %d times', (source, times) => {
    expect(historyReadsOf(source)).toHaveLength(times);
  });
});
