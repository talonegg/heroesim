import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, realFiles, parse, refusalOf } from './content.test-support.js';

// The Hall Improvements' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('validateContent on a set built in memory', () => {
  // The Hall's facilities named in the refusal's words, which are read from the engine (DL-191).
  test('refuses an Improvement of a facility that is not one, naming the facilities, in the file and in memory', () => {
    const files = realFiles();
    files['improvements.json'] = (files['improvements.json'] ?? '').replace('"facility": "infirmary"', '"facility": "kitchen"');
    const content = structuredClone(shipped);
    Object.assign(content.improvements['infirmary-1'] ?? {}, { facility: 'kitchen' });

    expect(refusalOf(() => parse(files)).message).toMatch(
      /improvements\.json: infirmary-1\.facility is "kitchen"; expected one of infirmary, trainingYard, quarters/,
    );
    expect(refusalOf(() => validateContent(content)).message).toMatch(
      /improvements\.infirmary-1\.facility: "kitchen" is not a Hall facility \(infirmary, trainingYard, quarters\)/,
    );
  });

  test('refuses a grade that is not a whole number from 1 and a cost that is not a whole number above 0, each named', () => {
    const content = structuredClone(shipped);
    Object.assign(content.improvements['infirmary-1'] ?? {}, { grade: 0, cost: 0 });

    const { message } = refusalOf(() => validateContent(content));
    expect(message).toContain('improvements.infirmary-1.grade is 0; it is a whole number from 1');
    expect(message).toContain('improvements.infirmary-1.cost is 0; it is a whole number above 0');
  });
});
