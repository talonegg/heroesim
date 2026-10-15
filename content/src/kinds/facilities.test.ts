import { facilityEffectKinds, type Facility, type Improvement } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { validateContent } from '../validate.js';
import { parse, realFiles, refusalOf, shipped, withJson, type Files } from './content.test-support.js';
import { checkFacilityEffects, facilityEffects } from './facility-effects.js';

// The Facilities (`facilities.json`) and their grades, the Improvements (DL-294 item 3, DL-297): each
// Facility's key, name, upkeep and effects at grade 0 from the closed set described once; each grade
// row's Facility one content defines, its grades 1 to n with no gap, its effects exactly its Facility's.
// Each refusal is triggered by content built from the shipped files with one thing broken, and names
// the offending key.

type ImprovementRow = Omit<Improvement, 'key'>;

/** The files with `facilities.json` changed. */
const facilities = (change: (json: Files['facilities.json']) => void) => withJson('facilities.json', change);

/** The files with `improvements.json` changed. */
const improvements = (change: (json: Files['improvements.json']) => void) => withJson('improvements.json', change);

describe("the Facility effects' description", () => {
  test("describes each of the engine's kinds, in its order, each with a label and a number's bounds", () => {
    expect(Object.keys(facilityEffects)).toEqual([...facilityEffectKinds]);
    for (const described of Object.values(facilityEffects)) expect(described.label).toMatch(/^[A-Z]/);
  });

  test('holds each value to its bounds and refuses a kind it does not describe, naming the path', () => {
    const problems: string[] = [];
    checkFacilityEffects('x.effects', { healFactor: 0, trainingXp: -1, moraleBaseline: Number.NaN, fatigueFall: 2, speed: 3 } as never, problems);

    expect(problems).toEqual([
      'x.effects.healFactor is 0; it is a number above 0',
      'x.effects.trainingXp is -1; it is a number of 0 or more',
      'x.effects.moraleBaseline is NaN; it is a number of 0 or more',
      'x.effects.speed is not an effect of a Facility: it is healFactor, trainingXp, moraleBaseline or fatigueFall',
    ]);
  });
});

describe('the Facilities read', () => {
  test("keep the file's order, the order every Hall lists them and a Rival builds them in", () => {
    const files = facilities((json) => {
      const reversed = Object.entries(json).reverse();
      for (const key of Object.keys(json)) delete json[key];
      Object.assign(json, Object.fromEntries(reversed));
    });

    expect(Object.keys(parse(files).facilities)).toEqual(Object.keys(shipped.facilities).reverse());
  });
});

describe('a Facility', () => {
  test('a field it does not have, or one of the wrong type, is refused by the parser, naming the row', () => {
    const files = facilities((json) => {
      Object.assign(json['infirmary'] ?? {}, { colour: 'white', plural: 'no' });
      Object.assign((json['quarters'] ?? { effects: {} }).effects, { speed: 2 });
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('facilities.json: infirmary.colour is not a field of a Facility');
    expect(message).toContain('facilities.json: infirmary.plural is "no"; expected true or false');
    expect(message).toContain("facilities.json: quarters.effects.speed is not a field of a Facility's effects");
  });

  test('an upkeep not whole Silver of 0 or more, no effect, and an effect out of its bounds are refused, each named', () => {
    const content = structuredClone(shipped);
    Object.assign(content.facilities['infirmary'] ?? {}, { upkeep: 12.5, effects: { healFactor: -0.5 } });
    Object.assign(content.facilities['quarters'] ?? {}, { upkeep: -1, effects: {} });

    const { message } = refusalOf(() => validateContent(content));
    expect(message).toContain('facilities.infirmary.upkeep is 12.5; it is a whole number of 0 or more');
    expect(message).toContain('facilities.infirmary.effects.healFactor is -0.5; it is a number above 0');
    expect(message).toContain('facilities.quarters.upkeep is -1; it is a whole number of 0 or more');
    expect(message).toContain('facilities.quarters.effects is empty: a Facility has at least one effect');
  });

  test('a key not kebab-case is refused', () => {
    const content = structuredClone(shipped);
    const row = content.facilities['infirmary'] as Facility;
    content.facilities = { Infirmary: { ...row, key: 'Infirmary' } };
    content.improvements = {};

    expect(refusalOf(() => validateContent(content)).message).toMatch(/facilities.*Infirmary/);
  });

  test('a fourth Facility with its grades, and a fourth grade of one, are read and accepted', () => {
    const withFacility = facilities((json) => {
      json['chapel'] = { name: 'chapel', plural: false, upkeep: 10, effects: { moraleBaseline: 0 } };
    });
    const files = { ...withFacility, ...improvementsOf(withFacility) };

    const set = parse(files);
    expect(Object.keys(set.facilities)).toEqual(['infirmary', 'training-yard', 'quarters', 'chapel']);
    expect(set.improvements['chapel-1']).toMatchObject({ facility: 'chapel', grade: 1, effects: { moraleBaseline: 3 } });
    expect(set.improvements['infirmary-4']).toMatchObject({ facility: 'infirmary', grade: 4, effects: { healFactor: 0.2 } });
  });
});

/** `improvements.json`, from `files`' own, with a grade 1 of the chapel and a grade 4 of the infirmary. */
function improvementsOf(files: Record<string, string>): Record<string, string> {
  const json = JSON.parse(files['improvements.json'] ?? '{}') as Record<string, ImprovementRow>;
  json['chapel-1'] = { facility: 'chapel', grade: 1, cost: 300, name: 'Shrine', effects: { moraleBaseline: 3 } };
  json['infirmary-4'] = { facility: 'infirmary', grade: 4, cost: 2000, name: 'Hospital', effects: { healFactor: 0.2 } };
  return { 'improvements.json': JSON.stringify(json, null, 2) };
}

describe("an Improvement's Facility and effects", () => {
  test("a grade row's effects are exactly its Facility's: one missing and one it lacks are refused, each named", () => {
    const content = structuredClone(shipped);
    Object.assign(content.improvements['quarters-2'] ?? {}, { effects: { moraleBaseline: 10, healFactor: 0.5 } });

    const { message } = refusalOf(() => validateContent(content));
    expect(message).toContain('improvements.quarters-2.effects: fatigueFall, an effect of quarters, has no value at this grade');
    expect(message).toContain('improvements.quarters-2.effects.healFactor: quarters has no healFactor effect');
  });

  test("a grade row's effect out of its bounds is refused", () => {
    const content = structuredClone(shipped);
    Object.assign(content.improvements['training-yard-2'] ?? {}, { effects: { trainingXp: -4 } });

    expect(refusalOf(() => validateContent(content)).message).toContain('improvements.training-yard-2.effects.trainingXp is -4; it is a number of 0 or more');
  });

  test("a Facility's grades with a gap are refused, naming them", () => {
    const files = improvements((json) => {
      delete json['quarters-2'];
    });

    expect(refusalOf(() => parse(files)).message).toContain('improvements: the grades of quarters are 1, 3; they run 1 to 2, each once');
  });

  test('a Facility with no grade is accepted: it stays at grade 0', () => {
    const files = improvements((json) => {
      for (const key of Object.keys(json)) if (key.startsWith('quarters-')) delete json[key];
    });

    expect(Object.keys(parse(files).facilities)).toContain('quarters');
  });
});

test('the real files pass', () => {
  expect(() => parse(realFiles())).not.toThrow();
});
