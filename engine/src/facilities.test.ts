import { describe, expect, test } from 'vitest';
import { applyAction } from './actions/action.js';
import type { ContentSet, Facility, Improvement } from './content-types.js';
import { createWorld } from './create.js';
import type { Guild, Hero, WorldDocument } from './document.js';
import { facilityEffectsAt, foundedHall, hallEffect, topGrade } from './facilities.js';
import { moraleBaselineFor } from './morale.js';
import { healFactor, playerGuild } from './selectors.js';
import { deepFreeze, testContent, testDeps, withValid } from './world.test-support.js';

// The Hall's Facilities as content (DL-294 item 3, DL-297): each effect read by kind over the Hall's
// Facilities, each at its grade, joined by its rule, and a Facility or a grade content adds built and
// read with no change of the engine.

const content = testContent;

describe('hallEffect', () => {
  test("reads each effect at the Facility's grade: grade 0 from its row, a grade from its Improvement", () => {
    const hall = { infirmary: 2, 'training-yard': 1, quarters: 3 };

    expect(hallEffect(hall, 'healFactor', content)).toBe(0.3333333333333333);
    expect(hallEffect(hall, 'trainingXp', content)).toBe(2);
    expect(hallEffect(hall, 'moraleBaseline', content)).toBe(15);
    expect(hallEffect(hall, 'fatigueFall', content)).toBe(8);
    expect(hallEffect(foundedHall(content), 'fatigueFall', content)).toBe(5);
    expect(hallEffect(foundedHall(content), 'healFactor', content)).toBe(1);
  });

  test('a grade past the top reads the top, a grade below 0 and a Facility the Hall lacks read grade 0, and a key content lacks is read by nothing', () => {
    expect(hallEffect({ infirmary: 7 }, 'healFactor', content)).toBe(0.25);
    expect(hallEffect({ infirmary: -1 }, 'healFactor', content)).toBe(1);
    expect(hallEffect({}, 'fatigueFall', content)).toBe(5);
    expect(hallEffect({ stables: 3 }, 'moraleBaseline', content)).toBe(0);
  });

  test('a Hall with no Facility of an effect reads its neutral', () => {
    const none = deepFreeze({ ...content, facilities: {}, improvements: {} });

    expect(hallEffect({ infirmary: 3 }, 'healFactor', none)).toBe(1);
    expect(hallEffect({}, 'trainingXp', none)).toBe(0);
    expect(hallEffect({}, 'moraleBaseline', none)).toBe(0);
    expect(hallEffect({}, 'fatigueFall', none)).toBe(0);
  });

  test("two Facilities of one effect join: heal factors multiply, the others add", () => {
    const both = withFourthFacility({ healFactor: [0.5, 0.5], moraleBaseline: [2, 4], fatigueFall: [1, 1], trainingXp: [1, 3] });
    const hall = { infirmary: 1, 'training-yard': 1, quarters: 1, chapel: 1 };

    expect(hallEffect(hall, 'healFactor', both)).toBe(0.25);
    expect(hallEffect(hall, 'moraleBaseline', both)).toBe(9);
    expect(hallEffect(hall, 'fatigueFall', both)).toBe(7);
    expect(hallEffect(hall, 'trainingXp', both)).toBe(5);
  });
});

describe('foundedHall, topGrade and facilityEffectsAt', () => {
  test("a Hall is founded with every Facility content defines at grade 0, in content's order", () => {
    expect(Object.entries(foundedHall(content))).toEqual([['infirmary', 0], ['training-yard', 0], ['quarters', 0]]);
  });

  test("a Facility's top grade is its highest Improvement's, 0 with none", () => {
    expect(topGrade('quarters', content)).toBe(3);
    expect(topGrade('stables', content)).toBe(0);
  });

  test("a Facility's effects at a grade are its own row's at 0 and the Improvement's above", () => {
    const quarters = content.facilities['quarters'] as Facility;

    expect(facilityEffectsAt(quarters, 0, content)).toEqual({ moraleBaseline: 0, fatigueFall: 5 });
    expect(facilityEffectsAt(quarters, 2, content)).toEqual({ moraleBaseline: 10, fatigueFall: 7 });
    expect(facilityEffectsAt(quarters, 9, content)).toEqual({ moraleBaseline: 15, fatigueFall: 8 });
  });
});

/** The test content with a fourth Facility, the chapel, of `byKind`'s effects at grades 0 and 1, a grade 1 at 300. */
function withFourthFacility(byKind: Partial<Record<keyof Facility['effects'], [number, number]>>, base: ContentSet = content): ContentSet {
  const at = (grade: 0 | 1): Facility['effects'] => Object.fromEntries(Object.entries(byKind).map(([kind, values]) => [kind, values[grade]]));
  const chapel: Facility = { key: 'chapel', name: 'chapel', plural: false, upkeep: 15, effects: at(0) };
  const chapel1: Improvement = { key: 'chapel-1', name: 'Shrine', facility: 'chapel', grade: 1, cost: 300, effects: at(1) };
  return deepFreeze({ ...base, facilities: { ...base.facilities, chapel }, improvements: { ...base.improvements, 'chapel-1': chapel1 } });
}

/** The test content with a fourth grade of the infirmary, at 2,000, its heal factor 0.2. */
function withFourthGrade(base: ContentSet = content): ContentSet {
  const infirmary4: Improvement = { key: 'infirmary-4', name: 'Hospital', facility: 'infirmary', grade: 4, cost: 2000, effects: { healFactor: 0.2 } };
  return deepFreeze({ ...base, improvements: { ...base.improvements, 'infirmary-4': infirmary4 } });
}

// The epic's acceptance (S3): a Facility with a fourth grade, and a fourth Facility, built and read with
// no engine change: content alone adds them.
describe('a fourth grade and a fourth Facility, from content alone', () => {
  const extended = withFourthGrade(withFourthFacility({ moraleBaseline: [0, 4] }));
  const deps = testDeps({ rivalCount: 0 }, extended);

  function scene(): { document: WorldDocument; guild: Guild } {
    const { document } = createWorld('fourth', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    const guild = playerGuild(document.world) as Guild;
    guild.wealth = 10_000;
    return { document, guild };
  }

  function build(document: WorldDocument, guild: Guild, facility: string): WorldDocument {
    const result = applyAction(document, { kind: 'build', guildId: guild.id, facility }, deps);
    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    return withValid(result.document, deps);
  }

  test('every Guild is founded with the fourth Facility at grade 0', () => {
    const { document } = scene();

    for (const guild of Object.values(document.world.guilds)) expect(guild.hall).toEqual({ infirmary: 0, 'training-yard': 0, quarters: 0, chapel: 0 });
  });

  test("the infirmary's fourth grade is built for its cost and shortens an Injury by its factor", () => {
    let { document, guild } = scene();
    for (let grade = 1; grade <= 4; grade += 1) document = build(document, guild, 'infirmary');
    guild = document.world.guilds[guild.id] as Guild;

    expect(guild.hall['infirmary']).toBe(4);
    expect(guild.wealth).toBe(10_000 - 200 - 500 - 1000 - 2000);
    expect(healFactor(guild.hall, extended)).toBe(0.2);
    const refused = applyAction(document, { kind: 'build', guildId: guild.id, facility: 'infirmary' }, deps);
    expect(refused.ok ? null : refused.rejection).toMatchObject({ reason: 'max-grade', facility: 'infirmary', grade: 4 });
  });

  test('the fourth Facility is built and raises the Morale baseline by its value', () => {
    const { document, guild } = scene();
    const hero = Object.values(document.world.heroes).find((each) => each.guildId === guild.id) as Hero;
    const before = moraleBaselineFor(hero, document.world, deps.config, extended);

    const after = build(document, guild, 'chapel');

    expect(after.world.guilds[guild.id]?.hall['chapel']).toBe(1);
    expect(after.world.guilds[guild.id]?.wealth).toBe(10_000 - 300);
    expect(moraleBaselineFor(hero, after.world, deps.config, extended)).toBe(before + 4);
  });
});
