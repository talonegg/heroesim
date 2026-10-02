// A content file changed where its value changes, and laid out as it was everywhere else (v1.1.3-S3).
// The content's JSON is laid out by hand: Features' values aligned, a sentence list opened out even
// where it would fit on a line, and a role's picture lists on one line while they fit (the Heroes'
// and Patrons') and a key to a line once they do not (the Guildmasters', since v1.1.3-S4). So
// `write-rows` and `apply` write the new value into the file's own text rather than laying it out
// afresh, and `git diff` shows only the rows, terms and sentences that changed:
// - a value that is unchanged keeps its text, byte for byte;
// - an object or list laid over several lines keeps its members' text and separators, a member added
//   being laid out as the sibling beside it (a new row as the rows, a new Feature aligned with the
//   Features), and a list's items matched to the new list's in order, so an item added or removed
//   changes its own line and its neighbour's comma alone;
// - any other value that changes is laid out as the tool lays out a new file, where it starts;
// - the file's line ends, LF or CRLF, are kept.

import { compact, format, formatJson } from './json-format.js';

interface Member {
  key: string;
  keyStart: number;
  value: Node;
}

type Node = { start: number; end: number } & ({ kind: 'scalar' } | { kind: 'array'; items: Node[] } | { kind: 'object'; members: Member[] });

const literal = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;

/** Where each value of a JSON text starts and ends. The text must be JSON. */
function parse(text: string): Node {
  let at = 0;
  const space = (): void => {
    while (at < text.length && ' \t\r\n'.includes(text.charAt(at))) at += 1;
  };
  const string = (): string => {
    const start = at;
    at += 1;
    while (text.charAt(at) !== '"') at += text.charAt(at) === '\\' ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const value = (): Node => {
    space();
    const start = at;
    const char = text.charAt(at);
    if (char === '{') {
      at += 1;
      const members: Member[] = [];
      space();
      if (text.charAt(at) !== '}') {
        for (;;) {
          space();
          const keyStart = at;
          const key = string();
          space();
          at += 1; // the colon
          members.push({ key, keyStart, value: value() });
          space();
          if (text.charAt(at) !== ',') break;
          at += 1;
        }
      }
      at += 1;
      return { kind: 'object', start, end: at, members };
    }
    if (char === '[') {
      at += 1;
      const items: Node[] = [];
      space();
      if (text.charAt(at) !== ']') {
        for (;;) {
          items.push(value());
          space();
          if (text.charAt(at) !== ',') break;
          at += 1;
        }
      }
      at += 1;
      return { kind: 'array', start, end: at, items };
    }
    if (char === '"') {
      string();
      return { kind: 'scalar', start, end: at };
    }
    literal.lastIndex = at;
    const match = literal.exec(text);
    if (match === null) throw new Error(`no JSON value at ${at}`);
    at += match[0].length;
    return { kind: 'scalar', start, end: at };
  };
  const root = value();
  space();
  if (at !== text.length) throw new Error(`text after the JSON value at ${at}`);
  return root;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): Node['kind'] {
  return Array.isArray(value) ? 'array' : isObject(value) ? 'object' : 'scalar';
}

/** For each item of `after`, the index of the item of `before` it keeps, or -1: their longest common run. */
function matched(before: readonly string[], after: readonly string[]): number[] {
  const lengths = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = lengths[i] as number[];
      row[j] = before[i] === after[j] ? (lengths[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lengths[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const match = new Array<number>(after.length).fill(-1);
  for (let i = 0, j = 0; i < before.length && j < after.length; ) {
    if (before[i] === after[j]) {
      match[j] = i;
      i += 1;
      j += 1;
    } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  return match;
}

/**
 * `value` written into `text`, a JSON file's text, keeping the text's layout wherever the value's
 * parts are unchanged, and laying out what is new as its siblings are. Text that is not JSON is
 * replaced by the value as the tool lays out a new file.
 *
 * With `keepLines` (the content editor's, v1.1.4-S12), a value written on one line stays on one line
 * however long it grows, as a Hero Trait's row is, and a member added beside such a sibling is
 * written on one line too.
 */
export function editJson(text: string, value: unknown, { keepLines = false }: { keepLines?: boolean } = {}): string {
  let root: Node;
  try {
    JSON.parse(text);
    root = parse(text);
  } catch {
    return formatJson(value);
  }

  const lineStart = (at: number): number => text.lastIndexOf('\n', at - 1) + 1;
  const column = (at: number): number => at - lineStart(at);
  const indentAt = (at: number): string => /^[ \t]*/.exec(text.slice(lineStart(at), at))?.[0] ?? '';
  const source = (node: Node): string => text.slice(node.start, node.end);
  const valueOf = (node: Node): unknown => JSON.parse(source(node));
  const fresh = (next: unknown, indent: string, at: number): string => format(next, indent, Math.max(0, at - indent.length));
  /** The last of `nodes` holding a value of the same kind as `next`, to lay `next` out like. */
  const like = (nodes: readonly Node[], next: unknown): Node | undefined =>
    kindOf(next) === 'scalar' ? undefined : [...nodes].reverse().find((node) => node.kind === kindOf(next));

  /** `next` in the place of `node`, starting at column `at`. */
  function render(node: Node, next: unknown, at: number): string {
    if (JSON.stringify(valueOf(node)) === JSON.stringify(next)) return source(node);
    const indent = indentAt(node.start);
    const opened = source(node).includes('\n');
    if (node.kind === 'object' && isObject(next) && opened && node.members.length > 0) return renderObject(node.members, node, next);
    if (node.kind === 'array' && Array.isArray(next) && opened && node.items.length > 0) return renderArray(node.items, node, next);
    if (keepLines && !opened) return compact(next);
    return fresh(next, indent, at);
  }

  function renderObject(members: readonly Member[], node: Node, next: Record<string, unknown>): string {
    const entries = Object.entries(next).filter(([, each]) => each !== undefined);
    if (entries.length === 0) return '{}';
    const first = members[0] as Member;
    const last = members.at(-1) as Member;
    const open = text.slice(node.start + 1, first.keyStart);
    const close = text.slice(last.value.end, node.end - 1);
    const separator = members.length > 1 ? text.slice(first.value.end, (members[1] as Member).keyStart) : `,${open}`;
    const memberIndent = indentAt(first.keyStart);
    // Values aligned in a column, as the Features' are, where each starts at the same column and some
    // key is followed by more than one space.
    const columns = members.map((member) => (lineStart(member.keyStart) === lineStart(member.value.start) ? column(member.value.start) : -1));
    const aligned = members.length > 1 && columns.every((each) => each >= 0 && each === columns[0]) && members.some((member) => /:\s{2,}$/.test(text.slice(member.keyStart, member.value.start)));
    const parts = entries.map(([key, each]) => {
      const had = members.find((member) => member.key === key);
      if (had !== undefined) return text.slice(had.keyStart, had.value.start) + render(had.value, each, column(had.value.start));
      const name = `${JSON.stringify(key)}:`;
      const head = aligned ? name.padEnd(Math.max(name.length + 1, (columns[0] ?? 0) - memberIndent.length), ' ') : `${name} `;
      const at = memberIndent.length + head.length;
      const template = like(
        members.map((member) => member.value),
        each,
      );
      return head + (template === undefined ? fresh(each, memberIndent, at) : render(template, each, at));
    });
    return `{${open}${parts.join(separator)}${close}}`;
  }

  function renderArray(items: readonly Node[], node: Node, next: readonly unknown[]): string {
    if (next.length === 0) return '[]';
    const first = items[0] as Node;
    const last = items.at(-1) as Node;
    const open = text.slice(node.start + 1, first.start);
    const close = text.slice(last.end, node.end - 1);
    const separator = items.length > 1 ? text.slice(first.end, (items[1] as Node).start) : `,${open}`;
    const itemIndent = indentAt(first.start);
    const at = column(first.start);
    const before = items.map((item) => JSON.stringify(valueOf(item)));
    const match = matched(
      before,
      next.map((each) => JSON.stringify(each)),
    );
    const used = new Set(match.filter((index) => index >= 0));
    let previous = -1;
    const parts = next.map((each, index) => {
      const kept = match[index] ?? -1;
      if (kept >= 0) {
        previous = kept;
        return source(items[kept] as Node);
      }
      // An item changed in place: the first old item left between this one's matched neighbours.
      const following = match.slice(index + 1).find((other) => other >= 0) ?? items.length;
      for (let old = previous + 1; old < following; old += 1) {
        const item = items[old] as Node;
        if (used.has(old)) continue;
        if (item.kind !== kindOf(each)) break;
        used.add(old);
        previous = old;
        return render(item, each, column(item.start));
      }
      const template = like(items, each);
      return template === undefined ? fresh(each, itemIndent, at) : render(template, each, at);
    });
    return `[${open}${parts.join(separator)}${close}]`;
  }

  const written = text.slice(0, root.start) + render(root, value, column(root.start)) + text.slice(root.end);
  return text.includes('\r\n') ? written.replace(/\r?\n/g, '\r\n') : written;
}
