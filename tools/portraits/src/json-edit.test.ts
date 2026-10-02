import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { editJson } from './json-edit.js';
import { formatJson } from './json-format.js';
import { root } from './test-support.js';

// `editJson` (v1.1.3-S3): the tool changes a content file where its value changes, and keeps the
// file's own layout everywhere else, so that `git diff` after `apply` or `write-rows` shows only
// the rows, terms and sentences that changed.

/** A content file as git holds it, with LF line ends, whatever the checkout's. */
function content(name: string): string {
  return readFileSync(path.join(root, 'content', name), 'utf8').replace(/\r\n/g, '\n');
}

const crlf = (text: string): string => text.replace(/\n/g, '\r\n');

type Descriptions = { biography: { temperClosings: Record<string, string[]> } };
type Appearances = { features: Record<string, unknown>; portraits: Record<string, Record<string, unknown>> };

describe('editJson()', () => {
  test.each(['descriptions.json', 'portrait-appearances.json', 'portraits.json'])('writes %s unchanged when its value is unchanged, with LF or CRLF line ends', (name) => {
    const text = content(name);
    expect(editJson(text, JSON.parse(text))).toBe(text);
    expect(editJson(crlf(text), JSON.parse(text))).toBe(crlf(text));
  });

  test('adds a sentence to a list as one line, and changes only the line before it, for its comma', () => {
    const text = content('descriptions.json');
    const value = JSON.parse(text) as Descriptions;
    const stern = value.biography.temperClosings.stern ?? [];
    const last = stern.at(-1) ?? '';
    stern.push('{He} keeps {his} word, and expects the same of everyone.');

    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(JSON.stringify(last)));
    const indent = /^ */.exec(lines[at] ?? '')?.[0] ?? '';
    const expected = [...lines.slice(0, at), `${lines[at]},`, `${indent}"{He} keeps {his} word, and expects the same of everyone."`, ...lines.slice(at + 1)];
    expect(editJson(text, value).split('\n')).toEqual(expected);
    expect(editJson(crlf(text), value)).toBe(crlf(expected.join('\n')));
  });

  test('changes a sentence in its own line alone, and removes one with its line', () => {
    const text = content('descriptions.json');
    const value = JSON.parse(text) as Descriptions;
    const composed = value.biography.temperClosings.composed ?? [];
    const old = composed[0] ?? '';
    composed[0] = 'Little shows on {his} face.';
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(JSON.stringify(old)));
    expect(editJson(text, value).split('\n')).toEqual([...lines.slice(0, at), (lines[at] ?? '').replace(JSON.stringify(old), '"Little shows on {his} face."'), ...lines.slice(at + 1)]);

    const twice = JSON.parse(text) as Descriptions;
    const stern = twice.biography.temperClosings.stern ?? [];
    stern.push('A second.', 'A third.');
    const longer = editJson(text, twice);
    const again = JSON.parse(longer) as Descriptions;
    again.biography.temperClosings.stern = (again.biography.temperClosings.stern ?? []).filter((each) => each !== 'A second.');
    const shorter = editJson(longer, again).split('\n');
    const longerLines = longer.split('\n');
    expect(shorter).toEqual(longerLines.filter((line) => !line.includes('"A second."')));
  });

  test('adds a Feature in line with the others, their values aligned', () => {
    const text = content('portrait-appearances.json');
    const value = JSON.parse(text) as Appearances;
    const last = Object.keys(value.features).at(-1) ?? '';
    value.features = { ...value.features, freckles: {} };
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(`"${last}":`));
    const column = (lines[at] ?? '').indexOf('{');
    const added = '    "freckles":'.padEnd(column, ' ') + '{}';
    expect(editJson(text, value).split('\n')).toEqual([...lines.slice(0, at), `${lines[at]},`, added, ...lines.slice(at + 1)]);
  });

  test("adds a picture's row laid out as the rows beside it, and changes nothing above it but a comma", () => {
    const text = content('portrait-appearances.json');
    const value = JSON.parse(text) as Appearances;
    const narrative = `${'A long, lined face. '.repeat(6)}The eyes are grey.`;
    // A key the content does not hold: since v1.1.3-S4 it holds gm-male-01..20.
    value.portraits['gm-male-21'] = {
      apparentAge: [34, 44],
      station: 'trade',
      callings: ['merchant'],
      temper: 'wry',
      narrative,
      hooks: ['{He} still keeps the ledger of the first shop {he} ever ran, though its door has long been shut.', '{He} was once a sailor.'],
    };
    const lines = text.split('\n');
    const end = lines.length - 4; // the last row's closing brace, above those of `portraits` and the file, and the final newline
    expect(lines[end]).toBe('    }');
    expect(editJson(text, value).split('\n')).toEqual([
      ...lines.slice(0, end),
      '    },',
      '    "gm-male-21": {',
      '      "apparentAge": [34, 44],',
      '      "station": "trade",',
      '      "callings": ["merchant"],',
      '      "temper": "wry",',
      `      "narrative": ${JSON.stringify(narrative)},`,
      '      "hooks": [',
      '        "{He} still keeps the ledger of the first shop {he} ever ran, though its door has long been shut.",',
      '        "{He} was once a sailor."',
      '      ]',
      '    }',
      ...lines.slice(end + 1),
    ]);
  });

  test("lists a new key on its role's one line", () => {
    const text = content('portraits.json');
    const value = JSON.parse(text) as Record<string, Record<string, string[]>>;
    // Since v1.1.3-S4 the Guildmasters' lists are too long for a line, and opened out; the Heroes' are on one.
    value.hero?.male?.push('hero-male-01');
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes('"hero"'));
    expect(editJson(text, value).split('\n')).toEqual([...lines.slice(0, at), (lines[at] ?? '').replace('"male": []', '"male": ["hero-male-01"]'), ...lines.slice(at + 1)]);
  });

  test('writes text it cannot read as the tool lays out a new file', () => {
    expect(editJson('not json', { a: [1] })).toBe(formatJson({ a: [1] }));
    expect(editJson('', { a: [1] })).toBe(formatJson({ a: [1] }));
  });
});
