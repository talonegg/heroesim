import { type Names } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { parse, withJson, refusalOf } from './content.test-support.js';

// The name lists' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a name list', () => {
  test.each([
    ['given.female', (json: Names) => void (json.given.female = [])],
    ['given.male', (json: Names) => void (json.given.male = [])],
    ['family', (json: Names) => void (json.family = [])],
    ['guild', (json: Names) => void (json.guild = [])],
    ['patron', (json: Names) => void (json.patron = [])],
  ])('that is empty is refused, naming the list: %s', (list, change) => {
    const files = withJson('names.json', change);

    expect(refusalOf(() => parse(files)).message).toContain(`names.${list} is empty`);
  });

  test('that repeats a name is refused, naming the name', () => {
    const files = withJson('names.json', (json) => json.family.push('Wray'));

    expect(refusalOf(() => parse(files)).message).toMatch(/names\.family.*"Wray"/);
  });
});

describe("a Patron's name (v1.1.2-S3, DL-125 item 5)", () => {
  test('without its sex is refused, naming where it is', () => {
    const files = withJson('names.json', (json) => {
      json.patron[3] = { name: 'Denholm Crane' } as Names['patron'][number];
    });

    expect(refusalOf(() => parse(files)).message).toContain('names.json: patron.3.sex is missing');
  });

  test('written as a bare name, as before, is refused', () => {
    const files = withJson('names.json', (json) => {
      (json.patron as unknown[])[0] = 'Aldous Fairweather';
    });

    expect(refusalOf(() => parse(files)).message).toContain('names.json: patron.0 is "Aldous Fairweather"; expected an object');
  });

  test('with a sex that is not female or male is refused', () => {
    const files = withJson('names.json', (json) => {
      json.patron[0] = { name: 'Aldous Fairweather', sex: 'body' as Names['patron'][number]['sex'] };
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/names\.json: patron\.0\.sex is "body"; expected one of female, male/);
  });

  test('listed twice is refused, naming the name', () => {
    const files = withJson('names.json', (json) => json.patron.push({ name: 'Jocelyn Pike', sex: 'female' }));

    expect(refusalOf(() => parse(files)).message).toMatch(/names\.patron: "Jocelyn Pike" is listed twice/);
  });
});
