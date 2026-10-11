import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { configSections, configVersion, configChangelog, defaultConfig, flattenConfig, tierFields, type ConfigSections, type GameConfig, type TierRow } from './config.js';
import { configRules } from './config-check.js';

// DL-186 item 15, DL-204: the defaults' values are data, `config.json`, in sections,
// and the engine reads them flat, every setting once, in `GameConfig`'s order.

const file = new URL('./config.json', import.meta.url);
const text = readFileSync(file, 'utf8');

/** Each section's settings, as the type of the file gives them. */
type SectionKeys = { [Section in keyof ConfigSections]: keyof ConfigSections[Section] }[keyof ConfigSections];

describe('config.json', () => {
  test('its sections hold every setting of GameConfig and nothing else, as its type says', () => {
    expectTypeOf<SectionKeys>().toEqualTypeOf<keyof GameConfig>();
  });

  test('every setting is in one section, once, as the file is written', () => {
    const settings = Object.values(configSections).flatMap((section) => Object.keys(section));
    expect(new Set(settings).size).toBe(settings.length);
    // JSON.parse keeps the last of a key written twice in one object, so the text is read too.
    for (const setting of settings) expect(text.split(`"${setting}":`).length - 1, setting).toBe(1);
  });

  test("the flat config is one to one with the settings' rules, in GameConfig's order", () => {
    expect(Object.keys(defaultConfig)).toEqual(Object.keys(configRules));
  });

  test('the defaults are frozen all the way down', () => {
    expect(Object.isFrozen(defaultConfig)).toBe(true);
    for (const value of Object.values(defaultConfig)) if (typeof value === 'object') expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(configSections)).toBe(true);
  });

  test('the version is the file\'s, a whole number, and its changelog\'s last line says why it is that', () => {
    const written = JSON.parse(text) as { version: unknown; changelog: unknown };
    expect(configVersion).toBe(written.version);
    expect(Number.isInteger(configVersion)).toBe(true);
    expect(configChangelog).toEqual(written.changelog);
    expect(configChangelog.at(-1)).toMatch(new RegExp(`^${configVersion} from `));
  });
});

describe('the Tier ladder (DL-262)', () => {
  test("tierFields are a Tier row's fields, each once, and every Tier of the defaults holds them in that order", () => {
    expectTypeOf<(typeof tierFields)[number]>().toEqualTypeOf<keyof TierRow>();
    expect(new Set(tierFields).size).toBe(tierFields.length);
    for (const row of defaultConfig.tiers) expect(Object.keys(row)).toEqual([...tierFields]);
  });
});

describe('flattenConfig', () => {
  test('lays the sections end to end, each in its order', () => {
    expect(Object.entries(flattenConfig({ b: { z: 1, y: [2] }, a: { x: { w: 3 } } }))).toEqual([
      ['z', 1],
      ['y', [2]],
      ['x', { w: 3 }],
    ]);
  });

  test('refuses a setting in two sections, naming both', () => {
    expect(() => flattenConfig({ quest: { boardSizeMax: 6 }, board: { boardSizeMax: 7 } })).toThrow('boardSizeMax is in both quest and board');
  });
});
