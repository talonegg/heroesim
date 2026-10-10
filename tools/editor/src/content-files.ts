// The content's files as the editor reads and writes them: each file's text, and each source's JSON
// value, under a repository's root. A folder's value is its rows' by key, and a change to it is written
// to each row's own file, a row added making its file and a row removed deleting it (DL-260). A change
// is written into the file's own text (`editJson`, the portrait tool's), so `git diff` shows only what
// changed. And the edit session's adapter for a content kind's rows and their uses in other content
// (`contentFiles`, DL-244).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSources, isFolder, rowFile, sourceFiles } from '@heroesim/content';
import { readContentDir } from '@heroesim/content/node';
import type { ContentJson } from '@heroesim/content/uses';
import { editJson, textChecks, versionPath } from '@heroesim/content/write';
import type { Kind, Row, UseKind } from './kind.js';
import { Refused, type SessionAdapter, type Written } from './session.js';

/** This repository's root, three folders above this file. */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** A content file's path under a root, from its path in the content directory (`items/short-sword.json`). */
export function contentPath(root: string, file: string): string {
  return path.join(root, 'content', ...file.split('/'));
}

/**
 * The content at `root`, as it is on disk: each file's text, by its path in the content directory, and
 * each source's value, a folder's its rows' by key. A source with a file that is not JSON is left out
 * of the values, so that no edit is written to it: the content's checks name the file.
 */
export interface ContentOnDisk {
  texts: Readonly<Record<string, string>>;
  values: ContentJson;
}

export function readContentFiles(root: string): ContentOnDisk {
  const texts = readContentDir(path.join(root, 'content'));
  const values: Record<string, unknown> = {};
  for (const source of contentSources) {
    const files = sourceFiles(source, texts);
    if (files.length === 0) {
      if (isFolder(source)) values[source] = {};
      continue;
    }
    try {
      const parsed = files.map(([name, text]): [string, unknown] => [name.slice(source.length, -'.json'.length), JSON.parse(text)]);
      values[source] = isFolder(source) ? Object.fromEntries(parsed) : parsed[0]?.[1];
    } catch {
      // Left out: the content's checks name a file that is not JSON.
    }
  }
  return { texts, values };
}

/**
 * The files of `values` that differ from `disk`'s, by their path in the content directory: each with its
 * new text in its old text's layout, a new row's laid out as the tool lays out a new file, or `null`
 * for the file of a row removed, which goes (DL-260).
 */
export function changedTexts(disk: ContentOnDisk, values: ContentJson): Record<string, string | null> {
  const changed: Record<string, string | null> = {};
  const write = (file: string, value: unknown): void => {
    changed[file] = editJson(disk.texts[file] ?? '', value, { keepLines: true });
  };
  for (const source of contentSources) {
    const value = values[source];
    const was = disk.values[source];
    if (value === undefined || JSON.stringify(value) === JSON.stringify(was)) continue;
    if (!isFolder(source)) {
      write(source, value);
      continue;
    }
    const before = (was ?? {}) as Record<string, unknown>;
    const after = value as Record<string, unknown>;
    for (const [key, row] of Object.entries(after)) {
      if (!Object.hasOwn(before, key) || JSON.stringify(row) !== JSON.stringify(before[key])) write(rowFile(source, key), row);
    }
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) changed[rowFile(source, key)] = null;
  }
  return changed;
}

/** Every content file's text, those of `changed` in place of their own and those it removes gone: what the content's checks read. */
export function textsWith(disk: ContentOnDisk, changed: Readonly<Record<string, string | null>>): Record<string, string> {
  const texts: Record<string, string> = { ...disk.texts };
  for (const [file, text] of Object.entries(changed)) {
    if (text === null) delete texts[file];
    else texts[file] = text;
  }
  return texts;
}

/** The value of the file `file`, by its path in the content directory, in `content`: a source's, or a folder's row's; `undefined` where it has none. */
function valueOf(content: ContentJson, file: string): unknown {
  for (const source of contentSources) {
    if (file === source) return content[source];
    if (isFolder(source) && file.startsWith(source)) {
      const rows = content[source] as Readonly<Record<string, unknown>> | undefined;
      const key = file.slice(source.length, -'.json'.length);
      return rows !== undefined && Object.hasOwn(rows, key) ? rows[key] : undefined;
    }
  }
  return undefined;
}

// ── The content files' adapter ──────────────────────────────────────────────────────────────────

/**
 * An edit of a kind's rows, held until "Finish" (DL-150 item 12): a row added whole, the fields a
 * change gave (so it never carries an exclusion another edit wrote beside them), or a row removed.
 */
export type RowEdit =
  | { op: 'add'; list: string; key: string; row: Row }
  | { op: 'change'; list: string; key: string; fields: Row }
  | { op: 'remove'; list: string; key: string };

/**
 * An edit of a use of a row's key in other content, the uses extension's: added through the
 * register's entry at its target, taken out at its place (DL-150 item 13), or changed in place to the
 * values given (DL-186 item 14).
 */
export type UseEdit =
  | { op: 'assign'; list: string; key: string; entry: string; target: Row }
  | { op: 'unassign'; list: string; key: string; entry: string; at: string }
  | { op: 'update'; list: string; key: string; entry: string; at: string; values: Row };

/** An edit the content files' adapter holds. */
export type Edit = RowEdit | UseEdit;

/** The list of `kind` holding `key` in `content`, or `null`. */
export function listOf(kind: Kind, content: ContentJson, key: string): string | null {
  for (const list of kind.lists) {
    const rows = content[list.file];
    if (typeof rows === 'object' && rows !== null && Object.hasOwn(rows, key)) return list.id;
  }
  return null;
}

/** The row of `key` in the list `list` of `kind`, or `undefined`. */
export function rowOf(kind: Kind, content: ContentJson, list: string, key: string): Row | undefined {
  const file = kind.lists.find((each) => each.id === list)?.file;
  const rows = file === undefined ? undefined : (content[file] as Record<string, Row> | undefined);
  return rows !== undefined && Object.hasOwn(rows, key) ? rows[key] : undefined;
}

/**
 * The pending edits in a few words, for the content version's changelog: the rows added, changed and
 * removed by key, and the uses assigned, unassigned and updated counted, with their keys (DL-163).
 */
export function summary(edits: readonly Edit[]): string {
  const keys = (op: Edit['op']): string[] => [...new Set(edits.filter((edit) => edit.op === op).map((edit) => edit.key))];
  const rows = (['add', 'change', 'remove'] as const).flatMap((op) => (keys(op).length === 0 ? [] : [`${{ add: 'added', change: 'changed', remove: 'removed' }[op]} ${keys(op).join(', ')}`]));
  const uses = (['assign', 'unassign', 'update'] as const).flatMap((op) => {
    const count = edits.filter((edit) => edit.op === op).length;
    return count === 0 ? [] : [`${count} ${count === 1 ? 'use' : 'uses'} ${{ assign: 'assigned', unassign: 'unassigned', update: 'updated' }[op]}, of ${keys(op).join(', ')}`];
  });
  return [...rows, ...uses].join('; ');
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The edit session's adapter for a content kind (DL-244): its edits are made on the content's files
 * as JSON, checked with the content's own checks (`@heroesim/content`), and "Finish" writes each
 * changed file in its own layout, a row on one line kept on one line, and raises the content version.
 * `uses`, the kind's extension, makes the edits of a use of a row's key in other content; without it
 * such an edit is refused.
 */
export function contentFiles(kind: Kind, uses: UseKind | null = null): SessionAdapter<Edit, ContentJson> {
  /** `edit` made on `content`, or a refusal naming why. */
  function apply(content: ContentJson, edit: Edit): ContentJson {
    const held = listOf(kind, content, edit.key);
    switch (edit.op) {
      case 'add':
        if (held !== null) throw new Refused([`"${edit.key}" is a key already, in ${held}`]);
        return kind.put(content, edit.list, edit.key, edit.row);
      case 'change': {
        const previous = held === edit.list ? rowOf(kind, content, edit.list, edit.key) : undefined;
        if (previous === undefined) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const { row, problems } = kind.rowFrom(edit.list, edit.fields, previous);
        if (problems.length > 0) throw new Refused(problems);
        return kind.put(content, edit.list, edit.key, row);
      }
      case 'remove': {
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const blocking = kind.uses(content, edit.key).filter((use) => use.blocksRemoval);
        if (blocking.length > 0) {
          throw new Refused([`"${edit.key}" is used, and is not removed while it is: change or unassign each use first`, ...blocking.map((use) => `used at ${use.at}`)], blocking);
        }
        return kind.put(content, edit.list, edit.key, null);
      }
      case 'assign':
      case 'unassign':
      case 'update': {
        if (uses === null) throw new Refused([`${kind.title} have no uses in other content to ${edit.op}`]);
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const made =
          edit.op === 'assign'
            ? uses.assign(content, edit.key, edit.entry, edit.target)
            : edit.op === 'unassign'
              ? uses.unassign(content, edit.key, edit.entry, edit.at)
              : uses.update(content, edit.key, edit.entry, edit.at, edit.values);
        if (made.content === null) throw new Refused(made.problems);
        return made.content;
      }
    }
  }

  return {
    name: kind.name,

    replay(root, edits, held) {
      let content = readContentFiles(root).values;
      for (const [index, edit] of edits.entries()) {
        try {
          content = apply(content, edit);
        } catch (error) {
          if (index < held && error instanceof Refused) {
            throw new Refused([`The pending edit ${index + 1} (${edit.op} ${edit.key}) no longer applies; discard it with \`${kind.name} discard ${edit.key}\``, ...error.problems], error.uses);
          }
          throw error;
        }
      }
      return content;
    },

    problems(root, content) {
      const disk = readContentFiles(root);
      const checks = textChecks(textsWith(disk, changedTexts(disk, content)));
      return checks.ok ? [] : checks.problems;
    },

    finishing(root, content, edits) {
      const disk = readContentFiles(root);
      const changed = Object.keys(changedTexts(disk, content));
      const written = (file: string): Written | null => {
        const value = valueOf(content, file);
        return value === undefined ? null : { text: disk.texts[file] ?? '', value, keepLines: true };
      };
      return {
        files: Object.fromEntries(changed.map((file) => [contentPath(root, file), written(file)])),
        changed,
        wrote: changed.join(', ') || 'nothing',
        version: changed.length === 0 ? null : { file: versionPath(root), name: 'content version', why: `the content editor's Finish of ${today()} (${summary(edits)})` },
      };
    },
  };
}
