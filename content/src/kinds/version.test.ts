import { describe, expect, test } from 'vitest';
import { parse, withJson, withText, refusalOf, type Files } from './content.test-support.js';

// The content version's refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// The content version, as data (DL-186 item 14): read from `version.json` with the rest.
describe('the content version', () => {
  test('is read from version.json, as the tools raise it there', () => {
    const files = withJson('version.json', (json) => {
      json.version = 7;
    });

    expect(parse(files).version).toBe(7);
  });

  test.each([
    ['a version that is no whole number', (json: Files['version.json']) => void (json.version = 32.5), 'version.json: version is 32.5; expected a whole number'],
    ['a version below 1', (json: Files['version.json']) => void (json.version = 0), 'version.json: version is 0; expected a whole number of at least 1'],
    ['no changelog', (json: Files['version.json']) => void delete json.changelog, 'version.json: changelog is missing; expected a list of strings'],
    ['a field it does not know', (json: Files['version.json']) => void (json.notes = 'x'), 'version.json: notes is not a field of the content version'],
  ])('is refused with %s, naming it', (_name, change, problem) => {
    expect(refusalOf(() => parse(withJson('version.json', change))).message).toContain(problem);
  });

  test('as a file that is no object is refused, naming the file', () => {
    expect(refusalOf(() => parse(withText('version.json', '[]'))).message).toContain(
      'version.json: must be an object of the version and its changelog',
    );
  });
});
