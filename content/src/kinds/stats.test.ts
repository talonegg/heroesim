import { describe, expect, test } from 'vitest';
import { parse, realFiles, withJson, refusalOf, stat } from './content.test-support.js';

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

  // The old `best` was Math.max(0, …), and loads as `max`, which agrees
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

// DL-287 (DL-280 item 6; the architecture review's candidate 5): the Stat a Captain's effects are scaled
// by is marked in content, `captaincy` on its own row, so the engine names no Stat (ADR-0006). Exactly one
// Hero Stat carries it: none, two, or a Guildmaster's is refused, and so is a malformed or misspelt mark.
describe("the captaincy Stat's mark", () => {
  test('is on the shipped Leadership and on no other Stat, and a Stat without it reads as having none', () => {
    const set = parse(realFiles());
    expect(Object.values(set.stats).filter((it) => it.captaincy === true).map((it) => it.key)).toEqual(['leadership']);
    expect(set.stats['charisma']?.captaincy).toBeUndefined();
  });

  test('moved to another Hero Stat, or set false beside the one marked, is accepted', () => {
    const moved = withJson('stats.json', (json) => {
      delete (stat(json, 'leadership') as { captaincy?: boolean }).captaincy;
      Object.assign(stat(json, 'charisma'), { captaincy: true });
    });
    const unmarked = withJson('stats.json', (json) => void Object.assign(stat(json, 'diplomacy'), { captaincy: false }));
    expect(parse(moved).stats['charisma']?.captaincy).toBe(true);
    expect(parse(unmarked).stats['diplomacy']?.captaincy).toBe(false);
  });

  test('on no Stat is refused', () => {
    const files = withJson('stats.json', (json) => void Object.assign(stat(json, 'leadership'), { captaincy: false }));
    expect(refusalOf(() => parse(files)).message).toContain('stats: no Stat is marked captaincy; mark one Hero Stat, the one a Captain is scaled by');
  });

  test('on two Stats is refused, naming both', () => {
    const files = withJson('stats.json', (json) => void Object.assign(stat(json, 'charisma'), { captaincy: true }));
    expect(refusalOf(() => parse(files)).message).toContain('stats: leadership and charisma are both marked captaincy; mark one');
  });

  test("on a Guildmaster's Stat is refused, naming it", () => {
    const files = withJson('stats.json', (json) => {
      Object.assign(stat(json, 'leadership'), { captaincy: false });
      Object.assign(stat(json, 'inspiration'), { captaincy: true });
    });
    expect(refusalOf(() => parse(files)).message).toContain("stats.inspiration.captaincy marks a Guildmaster's Stat; a Captain is a Hero, so mark a Hero Stat");
  });

  test.each([
    ['a text', 'yes', 'leadership.captaincy is "yes"; expected true or false'],
    ['a number', 1, 'leadership.captaincy is 1; expected true or false'],
  ])('that is %s is refused, naming the Stat', (_name, captaincy, problem) => {
    const files = withJson('stats.json', (json) => void Object.assign(stat(json, 'leadership'), { captaincy }));
    expect(refusalOf(() => parse(files)).message).toContain(problem);
  });

  test('misspelt, it is a field no Stat has, refused naming the Stat', () => {
    const files = withJson('stats.json', (json) => void Object.assign(stat(json, 'leadership'), { captaincys: true }));
    expect(refusalOf(() => parse(files)).message).toMatch(/leadership.*captaincys.*not a field of a Stat/);
  });
});
