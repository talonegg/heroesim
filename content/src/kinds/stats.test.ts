import { describe, expect, test } from 'vitest';
import { parse, withJson, refusalOf, stat } from './content.test-support.js';

// The Stats' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a Stat', () => {
  test('with min greater than max is refused, naming the Stat', () => {
    const files = withJson('stats.json', (json) => {
      stat(json, 'strength').min = 21;
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'stats.strength: min 21 is greater than max 20',
    );
  });

  test('with its default outside its range is refused, naming the Stat', () => {
    const files = withJson('stats.json', (json) => {
      stat(json, 'wits').default = 0;
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'stats.wits: default 0 is outside 1 to 20',
    );
  });

  // v1.1.4-S1's verification: the old `best` was Math.max(0, …), and loads as `max`, which agrees
  // with it only while no effective Stat is below 0.
  test('of a Hero below 0 at its least is refused, naming the Stat; a Guildmaster Stat is not held to it', () => {
    const hero = withJson('stats.json', (json) => {
      Object.assign(stat(json, 'strength'), { min: -1, default: 10 });
    });
    const guildmaster = withJson('stats.json', (json) => {
      Object.assign(stat(json, 'judgement'), { min: -1, default: 10 });
    });

    expect(refusalOf(() => parse(hero)).message).toMatch(
      /stats\.strength\.min is -1; a Hero Stat's least value is 0 or more/,
    );
    expect(parse(guildmaster).stats['judgement']?.min).toBe(-1);
  });
});
