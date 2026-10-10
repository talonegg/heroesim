import { type Portraits } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { realFiles, parse, withJson, refusalOf, guildmasterRow, heroRow, withPicture, ownersTwo } from './content.test-support.js';

// The Portraits' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('the Portraits (DL-125 item 3)', () => {
  // A Guildmaster's and a Hero's picture has its row (DL-134 item 10); a Patron's none yet.
  test('are accepted with a picture of each role and sex', () => {
    let files = withPicture(ownersTwo(realFiles()), 'guildmaster', 'female', 'gm-female-02', guildmasterRow());
    files = withPicture(files, 'guildmaster', 'male', 'gm-male-02', guildmasterRow());
    files = withPicture(files, 'hero', 'female', 'hero-female-01', heroRow());
    files = withPicture(files, 'patron', 'male', 'patron-male-01', undefined);

    expect(parse(files).portraits.guildmaster).toEqual({ female: ['gm-female-01', 'gm-female-02'], male: ['gm-male-01', 'gm-male-02'] });
  });

  test.each([
    ['a key not in lower case and hyphens', (json: Portraits) => json.guildmaster.male.push('gm-Male-01'), /portraits\.guildmaster\.male: "gm-Male-01" is not lower case and hyphens/],
    ["a key without its role's prefix", (json: Portraits) => json.guildmaster.male.push('hero-male-01'), /portraits\.guildmaster\.male: "hero-male-01" does not begin "gm-"/],
    ['a key listed twice', (json: Portraits) => {
      json.guildmaster.male.push('gm-01');
      json.guildmaster.female.push('gm-01');
    }, /portraits: "gm-01" is listed twice/],
  ])('are refused with %s', (_, change, message) => {
    const files = withJson('portraits.json', change);

    expect(refusalOf(() => parse(files)).message).toMatch(message);
  });

  test('are refused with a role or a sex not laid out', () => {
    const files = withJson('portraits.json', (json) => {
      (json as unknown as Record<string, unknown>)['rival'] = { female: [], male: [] };
      (json.hero as unknown as Record<string, unknown>)['other'] = [];
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('portraits.json: rival is not a field of the Portraits');
    expect(message).toContain('portraits.json: hero.other is not a field of');
  });

  test('are refused with a picture given as its file, as the epic first wrote it', () => {
    const files = withJson('portraits.json', (json) => {
      (json.guildmaster.male as unknown[]).push({ key: 'gm-male-01', file: 'gm-male-01.webp' });
    });

    expect(refusalOf(() => parse(files)).message).toContain('portraits.json: guildmaster.male');
  });
});
