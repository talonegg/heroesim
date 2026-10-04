import { longestDescriptions } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import {
  createWorld,
  defaultConfig,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  describeGuildmaster,
  describeHero,
  sexes,
  type DescriptiveAttribute,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';

// The Guildmaster described over the core (v1.1.2-S5, DL-125 item 6), where both packages meet: the
// content validator reads the engine's bounds and its count of Trait sentences (DL-186 item 6) to
// prove nothing written passes them; this holds the engine's writing to the validator's longest over
// many requests.

const content = loadContent();
const deps = { config: defaultConfig, content };
const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild').map((row) => row.key);
const guildmasterTraits = Object.keys(content.guildmasterTraits);

describe('describeGuildmaster over the core', () => {
  const longest = longestDescriptions(content);
  const seen: Record<DescriptiveAttribute, number> = { birthplace: 0, appearance: 0, biography: 0 };

  test('writes nothing past the longest the validator proves, over 2,400 requests of every sex, age, Background and Trait', () => {
    let index = 0;
    for (const sex of sexes) {
      for (let age = 21; age <= 50; age += 1) {
        for (const backgroundKey of guildBackgrounds) {
          for (const n of [0, 1, 2, 3, 4]) {
            index += 1;
            const traitKeys = [guildmasterTraits[index % guildmasterTraits.length], guildmasterTraits[(index + 3) % guildmasterTraits.length]].filter(
              (key) => key !== undefined,
            );
            const written = describeGuildmaster({ seed: `core-${index}`, n, sex, age, backgroundKey, traitKeys, portraitKey: null }, deps);
            for (const attribute of descriptiveAttributes) {
              const length = [...written[attribute]].length;
              expect(length, `${attribute} of ${JSON.stringify({ sex, age, backgroundKey, n })}`).toBeGreaterThan(0);
              expect(length).toBeLessThanOrEqual(attribute === 'birthplace' ? longest.birthplace : longest[attribute]);
              seen[attribute] = Math.max(seen[attribute], length);
            }
            expect(written.biography).not.toMatch(/[{}]/);
          }
        }
      }
    }
    expect(index).toBe(2 * 30 * guildBackgrounds.length * 5);
    // The longest proved are bounds, not the lengths met: a sample comes near them.
    expect(seen.appearance).toBeGreaterThan(longest.appearance - 60);
    expect(longest.appearance).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
    expect(longest.biography).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
  });

  test("with either of the owner's pictures, the Appearance is its narrative, as written, over many seeds (DL-127 item 4)", () => {
    for (let index = 0; index < 200; index += 1) {
      for (const [sex, portraitKey] of [['female', 'gm-female-01'], ['male', 'gm-male-01']] as const) {
        const written = describeGuildmaster(
          { seed: `picture-${index}`, n: index % 4, sex, age: 21 + (index % 30), backgroundKey: 'inherited', traitKeys: [], portraitKey },
          deps,
        );
        expect(written.appearance).toBe(content.portraitAppearances.portraits[portraitKey]?.narrative);
      }
    }
  });

  test("every Guildmaster of 100 new games over the core, each with a picture that fits or none, has three texts within their bounds", () => {
    let pictured = 0;
    for (let index = 0; index < 100; index += 1) {
      const { document } = createWorld(`world-${index}`, { guildName: 'G', guildmasterName: 'M', createdAt: 'test' }, deps);
      for (const guildmaster of Object.values(document.world.guildmasters)) {
        // A picture's narrative is the Appearance (DL-127 item 4); every Guildmaster may have one (v1.1.3-S5).
        if (guildmaster.portraitKey !== null) {
          pictured += 1;
          expect(guildmaster.appearance).toBe(content.portraitAppearances.portraits[guildmaster.portraitKey]?.narrative);
        }
        for (const attribute of descriptiveAttributes) {
          expect(guildmaster[attribute]).not.toBe('');
          expect([...guildmaster[attribute]].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength[attribute]);
        }
      }
    }
    expect(pictured).toBeGreaterThan(100);
  });
});

// A Hero described over the core (v1.1.3-S6, DL-135 item 6): the validator proves a Hero's longest
// Biography in the shape `describeHero` writes, and a Hero's Appearance is drawn as a Guildmaster's.
describe('describeHero over the core', () => {
  const longest = longestDescriptions(content);
  const heroBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'hero').map((row) => row.key);
  const heroTraits = Object.keys(content.heroTraits);

  test("writes nothing past the longest the validator proves, over every sex, age, Background and Class, with and without Traits", () => {
    let index = 0;
    const seen = { appearance: 0, biography: 0 };
    // One world's stream, drawn on from request to request, as the pool's Heroes are described.
    const state = createWorld('hero-bounds', { guildName: 'G', guildmasterName: 'M', createdAt: 'test' }, deps).document.world.rng['hero-descriptions'];
    for (const sex of sexes) {
      for (let age = 16; age <= 60; age += 4) {
        for (const backgroundKey of heroBackgrounds) {
          for (const classKey of Object.keys(content.classes)) {
            index += 1;
            const traitKeys = [heroTraits[index % heroTraits.length], heroTraits[(index + 1) % heroTraits.length]].filter((key) => key !== undefined).slice(0, index % 3);
            const { appearance, biography } = describeHero(state, content, { sex, age, backgroundKey, classKey, traitKeys, portraitKey: null });
            expect(appearance).not.toBe('');
            expect(biography).not.toBe('');
            expect(biography).not.toMatch(/[{}]/);
            expect([...appearance].length).toBeLessThanOrEqual(longest.appearance);
            expect([...biography].length).toBeLessThanOrEqual(longest.heroBiography);
            seen.appearance = Math.max(seen.appearance, [...appearance].length);
            seen.biography = Math.max(seen.biography, [...biography].length);
          }
        }
      }
    }
    expect(index).toBe(sexes.length * 12 * heroBackgrounds.length * Object.keys(content.classes).length);
    expect(longest.heroBiography).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
    expect(seen.biography).toBeGreaterThan(0);
  });

  test('every Hero of 100 new games over the core has the Silhouette, an Appearance and a Biography within their bounds (DL-135 item 8)', () => {
    for (let index = 0; index < 100; index += 1) {
      const { document } = createWorld(`heroes-${index}`, { guildName: 'G', guildmasterName: 'M', createdAt: 'test' }, deps);
      for (const hero of Object.values(document.world.heroes)) {
        expect(hero.portraitKey).toBeNull();
        expect(hero.appearance).not.toBe('');
        expect(hero.biography).not.toBe('');
        expect([...hero.appearance].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
        expect([...hero.biography].length).toBeLessThanOrEqual(longest.heroBiography);
      }
    }
  });
});
