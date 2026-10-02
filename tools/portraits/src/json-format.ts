// The JSON the tool writes: an object or array on one line where it fits within 100 columns, as the
// content files keep short rows, and opened out two spaces deep where it does not. It ends with a
// newline. The same value is always written the same way, so a file the tool rewrites changes only
// where its value does.

const width = 100;

/** A value inline, spaced as a person would write it: `{ "a": [1, 2] }`. */
export function compact(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compact).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, each]) => each !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([key, each]) => `${JSON.stringify(key)}: ${compact(each)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

/**
 * A value as the tool writes it, starting `prefix` columns into a line indented by `indent`: on that
 * line where it fits within the width, and opened out two spaces deeper where it does not.
 */
export function format(value: unknown, indent: string, prefix: number): string {
  const flat = compact(value);
  if (indent.length + prefix + flat.length <= width || typeof value !== 'object' || value === null) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((each) => `${inner}${format(each, inner, 0)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, each]) => each !== undefined);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([key, each]) => {
    const name = `${JSON.stringify(key)}: `;
    return `${inner}${name}${format(each, inner, name.length)}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

/** A value as the tool writes it to a file. */
export function formatJson(value: unknown): string {
  return `${format(value, '', 0)}\n`;
}

