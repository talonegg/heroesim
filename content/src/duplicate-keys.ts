// Duplicate keys in raw JSON text. JSON.parse keeps the last of two equal keys in one object
// without a word, so a Stat or Class written twice would silently replace the first; once parsed,
// the evidence is gone. This scans the text itself. It assumes the text is valid JSON (the
// caller parses it first) and so needs to track only strings, nesting and commas.

/** A key that appears twice in one object. */
export interface DuplicateKey {
  key: string;
  /** The keys and array indexes leading to the object, outermost first; `[]` for the top. */
  path: string[];
  /** The 1-based line of the second occurrence. */
  line: number;
}

type Frame =
  | { kind: 'object'; path: string[]; keys: Set<string>; expectingKey: boolean; lastKey: string }
  | { kind: 'array'; path: string[]; index: number };

export function findDuplicateKeys(text: string): DuplicateKey[] {
  const found: DuplicateKey[] = [];
  const stack: Frame[] = [];
  let line = 1;

  const childPath = (): string[] => {
    const parent = stack.at(-1);
    if (parent === undefined) return [];
    return [...parent.path, parent.kind === 'object' ? parent.lastKey : String(parent.index)];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\n') {
      line += 1;
    } else if (char === '"') {
      const end = endOfString(text, i);
      const top = stack.at(-1);
      if (top?.kind === 'object' && top.expectingKey) {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (top.keys.has(key)) found.push({ key, path: top.path, line });
        top.keys.add(key);
        top.lastKey = key;
        top.expectingKey = false;
      }
      i = end;
    } else if (char === '{') {
      stack.push({ kind: 'object', path: childPath(), keys: new Set(), expectingKey: true, lastKey: '' });
    } else if (char === '[') {
      stack.push({ kind: 'array', path: childPath(), index: 0 });
    } else if (char === '}' || char === ']') {
      stack.pop();
    } else if (char === ',') {
      const top = stack.at(-1);
      if (top?.kind === 'object') top.expectingKey = true;
      else if (top?.kind === 'array') top.index += 1;
    }
  }
  return found;
}

/** The index of the quote closing the string that opens at `start`. JSON strings hold no newline. */
function endOfString(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '"') return i;
  }
  throw new Error('findDuplicateKeys: unterminated string; parse the text as JSON first');
}
