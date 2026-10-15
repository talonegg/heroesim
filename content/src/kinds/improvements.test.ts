import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, realFiles, parse, refusalOf } from './content.test-support.js';

// The Hall Improvements' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('validateContent on a set built in memory', () => {
  // The Facilities named in the refusal's words, which are read from content's own (DL-297).
  test('refuses an Improvement of a Facility content does not define, naming the Facilities, in the file and in memory', () => {
    const files = realFiles();
    files['improvements.json'] = (files['improvements.json'] ?? '').replace('"facility": "infirmary"', '"facility": "kitchen"');
    const content = structuredClone(shipped);
    Object.assign(content.improvements['infirmary-1'] ?? {}, { facility: 'kitchen' });

    const refusal = 'improvements.infirmary-1.facility: "kitchen" is not a Facility (infirmary, training-yard, quarters)';
    expect(refusalOf(() => parse(files)).message).toContain(refusal);
    expect(refusalOf(() => validateContent(content)).message).toContain(refusal);
  });

  test('refuses a grade that is not a whole number from 1 and a cost that is not a whole number above 0, each named', () => {
    const content = structuredClone(shipped);
    Object.assign(content.improvements['infirmary-1'] ?? {}, { grade: 0, cost: 0 });

    const { message } = refusalOf(() => validateContent(content));
    expect(message).toContain('improvements.infirmary-1.grade is 0; it is a whole number from 1');
    expect(message).toContain('improvements.infirmary-1.cost is 0; it is a whole number above 0');
  });
});
