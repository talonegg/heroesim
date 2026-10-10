import { existsSync } from 'node:fs';
import { sexes as engineSexes } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { isSex, keyOf, nextKey, parseKey, parseRegistry, picturePaths, readRegistry, retire, sexes, type Registry } from './registry.js';
import { fingerprintTrims, hashBits } from './fingerprint.js';
import { root } from './test-support.js';

// The register (DL-135 item 11): every key ever issued, never issued twice.

const settings = { method: 'dHash', bits: hashBits, similarWithin: 104, tuning: 'a test' };
const entry = { hash: 'ab', trimmed: [] };

function registry(portraits: Registry['portraits']): Registry {
  return { fingerprint: settings, portraits };
}

// The sexes are the engine's, read rather than repeated (DL-186 item 6).
describe('sexes', () => {
  test("are the engine's list, and isSex holds a word to it", () => {
    expect(sexes).toBe(engineSexes);
    for (const sex of engineSexes) expect(isSex(sex)).toBe(true);
    expect(isSex('other')).toBe(false);
  });
});

describe('nextKey()', () => {
  test('gives the next number of the role and sex, from 01', () => {
    const shipped = registry({ 'gm-male-01': { role: 'guildmaster', sex: 'male', status: 'live', ...entry } });
    expect(nextKey(shipped, 'guildmaster', 'male')).toBe('gm-male-02');
    expect(nextKey(shipped, 'guildmaster', 'female')).toBe('gm-female-01');
    expect(nextKey(shipped, 'hero', 'male')).toBe('hero-male-01');
  });

  test('never repeats a retired key: a key retired is still issued, so the next is past it', () => {
    let keys = registry({
      'gm-female-01': { role: 'guildmaster', sex: 'female', status: 'live', ...entry },
      'gm-female-02': { role: 'guildmaster', sex: 'female', status: 'live', ...entry },
    });
    keys = retire(keys, 'gm-female-02');
    expect(keys.portraits['gm-female-02']?.status).toBe('retired');
    expect(nextKey(keys, 'guildmaster', 'female')).toBe('gm-female-03');
    // Even the highest retired and every lower one retired: the numbers go on.
    keys = retire(keys, 'gm-female-01');
    expect(nextKey(keys, 'guildmaster', 'female')).toBe('gm-female-03');
    expect(() => retire(keys, 'gm-female-09')).toThrow(/not in the register/);
  });

  test('counts past 99 without reusing a number', () => {
    const many = registry({ 'hero-female-99': { role: 'hero', sex: 'female', status: 'retired', ...entry } });
    expect(nextKey(many, 'hero', 'female')).toBe('hero-female-100');
    expect(parseKey('hero-female-100')).toEqual({ role: 'hero', sex: 'female', number: 100 });
  });
});

describe('keys', () => {
  test('are <prefix>-<sex>-<number>, the prefix the role\'s', () => {
    expect(keyOf('guildmaster', 'female', 4)).toBe('gm-female-04');
    expect(parseKey('gm-male-01')).toEqual({ role: 'guildmaster', sex: 'male', number: 1 });
    expect(parseKey('patron-male-01')).toBeNull();
    expect(parseKey('gm-other-01')).toBeNull();
    expect(parseKey('gm-male-1')).toBeNull();
  });

  test("name a picture and its thumbnail in their role's folder of their sex", () => {
    const paths = picturePaths('/repo', 'hero', 'female', 'hero-female-01');
    expect(paths.picture.replace(/\\/g, '/')).toBe('/repo/media/portraits/heroes/female/hero-female-01.webp');
    expect(paths.thumbnail.replace(/\\/g, '/')).toBe('/repo/media/portraits/heroes/female/hero-female-01.thumb.webp');
  });
});

describe('the register as shipped', () => {
  // Properties of the register, whatever pictures it holds; its own numbers, the distance and its
  // tuning, are its data (DL-136).
  test('names each picture by a key of its role and sex, live or retired, a live one on disk, each fingerprint taken by the method it names', () => {
    const shipped = readRegistry(root);
    expect(shipped.fingerprint.bits).toBe(hashBits);
    for (const [key, each] of Object.entries(shipped.portraits)) {
      expect(parseKey(key), key).toMatchObject({ role: each.role, sex: each.sex });
      expect(['live', 'retired'], key).toContain(each.status);
      expect(each.hash, key).toMatch(new RegExp(`^[0-9a-f]{${shipped.fingerprint.bits / 4}}$`));
      expect(each.trimmed, key).toHaveLength(fingerprintTrims.length);
      if (each.status === 'live') expect(existsSync(picturePaths(root, each.role, each.sex, key).picture), key).toBe(true);
    }
    expect(Object.values(shipped.portraits).some((each) => each.status === 'live')).toBe(true);
  });

  test('refuses a register of the wrong shape, naming each problem', () => {
    expect(() =>
      parseRegistry({
        fingerprint: settings,
        portraits: { 'gm-male-01': { role: 'hero', sex: 'male', status: 'gone', hash: 'xyz', trimmed: [] }, oops: {} },
      }),
    ).toThrow(/gm-male-01: its role and sex are not its key's[\s\S]*gm-male-01\.status[\s\S]*gm-male-01\.hash[\s\S]*oops: not a key/);
    expect(() => parseRegistry({ portraits: {} })).toThrow(/fingerprint: method, bits, similarWithin and tuning are wanted/);
  });
});
