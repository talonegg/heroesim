// The content's files as the editor reads and writes them: each file's text and its JSON value, under
// a repository's root. A change is written into the file's own text (`editJson`, the portrait tool's),
// so `git diff` shows only what changed. And the edit session's adapter for a content kind's rows and
// their uses in other content (`contentFiles`, DL-244).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentFiles as contentFileNames, type ContentFileName } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { editJson, textChecks, versionPath } from '@heroesim/content/write';
import type { Kind, Row, UseKind } from './kind.js';
import { Refused, type SessionAdapter } from './session.js';

/** This repository's root, three folders above this file. */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** A content file's path under a root. */
export function contentPath(root: string, file: ContentFileName): string {
  return path.join(root, 'content', file);
}

/** The content's files at `root`, as they are on disk: each one's text and its value. A file that is not there is left out. */
export interface ContentOnDisk {
  texts: Partial<Record<ContentFileName, string>>;
  values: ContentJson;
}

export function readContentFiles(root: string): ContentOnDisk {
  const texts: Partial<Record<ContentFileName, string>> = {};
  const values: Partial<Record<ContentFileName, unknown>> = {};
  for (const file of contentFileNames) {
    const full = contentPath(root, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    texts[file] = text;
    try {
      values[file] = JSON.parse(text);
    } catch {
      // Left out: the content's checks name a file that is not JSON.
    }
  }
  return { texts, values };
}

/** The files of `values` that differ from `disk`'s, each with its new text in its old text's layout. */
export function changedTexts(disk: ContentOnDisk, values: ContentJson): Partial<Record<ContentFileName, string>> {
  const changed: Partial<Record<ContentFileName, string>> = {};
  for (const file of contentFileNames) {
    const value = values[file];
    if (value === undefined || JSON.stringify(value) === JSON.stringify(disk.values[file])) continue;
    changed[file] = editJson(disk.texts[file] ?? '', value, { keepLines: true });
  }
  return changed;
}

/** Every content file's text, those of `changed` in place of their own: what the content's checks read. */
export function textsWith(disk: ContentOnDisk, changed: Partial<Record<ContentFileName, string>>): Record<string, string> {
  return { ...disk.texts, ...changed } as Record<string, string>;
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
      const changed = contentFileNames.filter((file) => content[file] !== undefined && JSON.stringify(content[file]) !== JSON.stringify(disk.values[file]));
      return {
        files: Object.fromEntries(changed.map((file) => [contentPath(root, file), { text: disk.texts[file] ?? '', value: content[file], keepLines: true }])),
        changed,
        wrote: changed.join(', ') || 'nothing',
        version: changed.length === 0 ? null : { file: versionPath(root), name: 'content version', why: `the content editor's Finish of ${today()} (${summary(edits)})` },
      };
    },
  };
}
