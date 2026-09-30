import { biographyTraitSentences as contentTraitSentences, descriptionBounds, longestDescriptions } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import {
  biographyTraitSentences,
  createWorld,
  defaultConfig,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  describeGuildmaster,
  sexes,
  type DescriptiveAttribute,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';

// The Guildmaster described over the core (v1.1.2-S5, DL-125 item 6), where both packages meet: the
// content validator, which imports only the engine's types, repeats the engine's bounds and its count
// of Trait sentences to prove nothing written passes them; this holds the two to each other, and the
// engine's writing to the validator's longest over many requests.

const content = loadContent();
const deps = { config: defaultConfig, content };
const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild').map((row) => row.key);
const guildmasterTraits = Object.values(content.traits).filter((row) => row.owner === 'guildmaster').map((row) => row.key);

describe("the content validator's bounds are the engine's", () => {
  test('60, 280 and 1,000 characters, and two Trait sentences', () => {
    expect({ ...descriptionBounds }).toEqual({ ...descriptiveAttributeMaxLength });
    expect(contentTraitSentences).toBe(biographyTraitSentences);
  });
});

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
    expect(longest.appearance).toBeLessThanOrEqual(280);
    expect(longest.biography).toBeLessThanOrEqual(1000);
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
