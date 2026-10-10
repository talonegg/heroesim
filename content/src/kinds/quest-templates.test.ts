import { describe, expect, test } from 'vitest';
import { tierLadder, type QuestBeat } from '@heroesim/engine/content';
import { parse, withJson, refusalOf, barrow, shipped, type Template } from './content.test-support.js';

// The Quest templates' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a Quest template', () => {
  // DL-193: a Quest template carries no `demands`.
  test('with demands is refused, as a field a Quest template does not have', () => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { demands: [['strength', 1]] });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.json: demands is not a field of a Quest template/);
  });

  test.each<[string, (it: Template) => void, RegExp]>([
    ['a Skill that does not exist', (it) => void it.skillKeys.push('axemanship'), /skillKeys.*"axemanship"/],
    ['a Sphere that does not exist', (it) => void it.sphereKeys.push('the-sea'), /sphereKeys.*"the-sea"/],
    ['a required Class that does not exist', (it) => (it.requires = { classKey: 'bard' }), /requires\.classKey.*"bard"/],
    ['a required Skill that does not exist', (it) => (it.requires = { skillKey: 'lute' }), /requires\.skillKey.*"lute"/],
    ['a Party of no Heroes', (it) => (it.partySizeMin = 0), /partySizeMin is 0; it is at least 2/],
    // DL-257 item 6: every Party is two Heroes or more.
    ['a Party of one', (it) => (it.partySizeMin = 1), /partySizeMin is 1; it is at least 2/],
    ['a tag that is not kebab-case', (it) => void it.tags.push('Dark Places'), /tags: "Dark Places"/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates/', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parse(files));

    expect(message).toContain('questTemplates.clear-the-barrow');
    expect(message).toMatch(problem);
  });

  // DL-257 item 6: a Quest template has no greatest Party.
  test('with partySizeMax is refused, as a field a Quest template does not have', () => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { partySizeMax: 4 });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.json: partySizeMax is not a field of a Quest template/);
  });

  test('requiring anything but a Class or a Skill is refused, naming the field', () => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json).requires, { level: 3 });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(
      /quest-templates\/clear-the-barrow\.json: requires\.level is not a field/,
    );
  });

  test('naming a Loot table content lacks is refused, naming the template and the table', () => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { lootTableKey: 'barrow-hoard' });
    });
    const notAKey = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { lootTableKey: 7 });
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'questTemplates.clear-the-barrow.lootTableKey: "barrow-hoard" is not a Loot table',
    );
    expect(refusalOf(() => parse(notAKey)).message).toMatch(
      /quest-templates\/clear-the-barrow\.json: lootTableKey is 7; expected a string or null/,
    );
  });

  test('that leaves a Sphere with none is refused, naming the Sphere', () => {
    const files = withJson('quest-templates/', (json) => {
      for (const [key, it] of Object.entries(json)) {
        if (it.sphereKeys.includes('villages')) delete json[key];
      }
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'spheres.villages: no Quest template names it in sphereKeys',
    );
  });
});

describe("a Quest template's Tiers and Beats (DL-262)", () => {
  test('the shipped templates pass, each offering Tiers of the ladder, its Beats drawn from pools content fills', () => {
    for (const template of Object.values(shipped.questTemplates)) {
      expect(template.tierMin).toBeGreaterThanOrEqual(1);
      expect(template.tierMax).toBeLessThanOrEqual(tierLadder.length);
      expect(template.beats.length).toBeGreaterThan(0);
    }
  });

  test.each<[string, (it: Template) => void, RegExp]>([
    ['a Tier below the first', (it) => (it.tierMin = 0), /tierMin is 0; it is at least 1/],
    ['Tiers upside down', (it) => (it.tierMin = 4), /tierMin 4 is greater than tierMax 3/],
    ['a Tier past the ladder', (it) => (it.tierMax = 6), /tierMax is 6; the ladder has 5 Tiers/],
    ['a Tier that is not whole', (it) => (it.tierMax = 2.5), /clear-the-barrow\.json: tierMax is 2\.5; expected a whole number/],
    ['no Beats', (it) => (it.beats = []), /beats is empty: a Quest plays one Beat at least/],
    ['a Beat with no line', (it) => ((it.beats[0] as QuestBeat).line = ' '), /beats\.0\.line is empty/],
    ['a Beat whose pool gives no criterion', (it) => ((it.beats[0] as QuestBeat).pool = {}), /beats\.0\.pool names no kind, tag or Encounter/],
    ['a Beat whose pool gives an empty list', (it) => ((it.beats[0] as QuestBeat).pool = { kinds: ['combat'], tags: [] }), /beats\.0\.pool\.tags is empty/],
    ['a kind listed twice', (it) => ((it.beats[0] as QuestBeat).pool = { kinds: ['combat', 'combat'] }), /beats\.0\.pool\.kinds: "combat" is listed twice/],
    ['a tag no Encounter carries', (it) => ((it.beats[0] as QuestBeat).pool = { tags: ['naval'] }), /beats\.0\.pool\.tags: "naval" is no Encounter's tag/],
    ['a named Encounter content lacks', (it) => ((it.beats[0] as QuestBeat).pool = { encounters: ['the-kraken'] }), /beats\.0\.pool\.encounters: "the-kraken" is not an Encounter/],
    [
      'a named Encounter that is a Finale',
      (it) => ((it.beats[0] as QuestBeat).pool = { encounters: ['the-last-assault', 'hold-the-line'] }),
      /beats\.0\.pool\.encounters: "the-last-assault" is a Finale, which no Beat draws/,
    ],
    [
      'a Beat its pool cannot fill after the Beats before it',
      (it) => (it.beats = [{ line: 'One.', pool: { encounters: ['hold-the-line'] } }, { line: 'Two.', pool: { encounters: ['hold-the-line', 'wolves-at-dusk'] } }, { line: 'Three.', pool: { encounters: ['wolves-at-dusk'] } }]),
      /beats\.2\.pool may draw 1 Encounter, none a Finale; it needs 2, one for each Beat before it sharing its pool, and one more/,
    ],
    ['a pool with no Encounter that may be drawn', (it) => ((it.beats[0] as QuestBeat).pool = { kinds: ['combat'], tags: ['water'] }), /beats\.0\.pool may draw 0 Encounters, none a Finale; it needs 1/],
    ['a Finale without its line', (it) => (it.finale = 'the-last-assault'), /finale and finaleLine are given together or not at all/],
    ['a Finale line without its Finale', (it) => (it.finaleLine = 'The end.'), /finale and finaleLine are given together or not at all/],
    ['a Finale whose line is empty', (it) => Object.assign(it, { finale: 'the-last-assault', finaleLine: '' }), /finaleLine is empty/],
    ['a Finale content lacks', (it) => Object.assign(it, { finale: 'the-dragon', finaleLine: 'The end.' }), /finale: "the-dragon" is not an Encounter/],
    ['a Tier playing more Beats than it has', (it) => (it.beats = it.beats.slice(0, 2)), /Tier 3 plays 3 Beats, more than its 2 Beats/],
    ['a Tier playing more Beats than it has and its Finale', (it) => Object.assign(it, { beats: it.beats.slice(0, 1), finale: 'the-last-assault', finaleLine: 'The end.' }), /Tier 2 plays 3 Beats, more than its 1 Beat and its Finale/],
    ['an override of a Tier it does not offer', (it) => (it.overrides = { '4': { beats: 2 } }), /overrides\.4: Tier 4 is not one it offers, 2 to 3/],
    ['an override of no Tier', (it) => (it.overrides = { third: { beats: 2 } }), /overrides\.third: Tier third is not one it offers, 2 to 3/],
    ['an override that makes its Tier unsound', (it) => (it.overrides = { '3': { beats: 0 } }), /overrides\.3: beats is 0; it is a whole number, at least 1/],
    ['an override that turns its band upside down', (it) => (it.overrides = { '2': { difficultyMin: 50 } }), /overrides\.2: difficultyMax is 46; it is a whole number, at least difficultyMin \(50\)/],
    ['an override of a count that is not whole', (it) => (it.overrides = { '2': { daysMax: 7.5 } }), /overrides\.2: daysMax is 7\.5; it is a whole number, at least daysMin \(5\)/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates/', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parse(files));

    expect(message).toContain('clear-the-barrow');
    expect(message).toMatch(problem);
  });

  test('an override of a figure the template plays at that Tier is read, and passes', () => {
    const files = withJson('quest-templates/', (json) => {
      barrow(json).overrides = { '3': { beats: 2, rewardFactor: 3, loot: false }, '2': { daysMin: 6, daysMax: 6 } };
    });

    expect(parse(files).questTemplates['clear-the-barrow']?.overrides).toEqual({ '3': { beats: 2, rewardFactor: 3, loot: false }, '2': { daysMin: 6, daysMax: 6 } });
  });

  test('a pool by kind, by tag, by name or by all three passes where it can be filled', () => {
    const files = withJson('quest-templates/', (json) => {
      barrow(json).beats = [
        { line: 'One.', pool: { kinds: ['combat'] } },
        { line: 'Two.', pool: { tags: ['wilds'] } },
        { line: 'Three.', pool: { kinds: ['travel'], tags: ['escort'], encounters: ['the-old-shaft'] } },
      ];
    });

    expect(parse(files).questTemplates['clear-the-barrow']?.beats).toHaveLength(3);
  });

  test.each([
    ['difficultyMin', 30],
    ['durationDaysMax', 6],
    ['encounterKinds', ['combat']],
    ['encountersMin', 2],
  ])('with the old field %s is refused, as a field a Quest template does not have', (field, value) => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { [field]: value });
    });

    expect(refusalOf(() => parse(files)).message).toContain(`clear-the-barrow.json: ${field} is not a field of a Quest template`);
  });

  test("with a field a Tier's override does not have is refused, naming it", () => {
    const files = withJson('quest-templates/', (json) => {
      barrow(json).overrides = { '3': { duration: 4 } as never };
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.json: overrides\.3\.duration is not a field of a Tier's override/);
  });

  test("with a Tier's unlock Level in its override is refused, naming it: the world's, which no template overrides (DL-271)", () => {
    const files = withJson('quest-templates/', (json) => {
      barrow(json).overrides = { '3': { unlockLevel: 0 } as never };
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.json: overrides\.3\.unlockLevel is not a field of a Tier's override/);
  });

  test('with a kind that is not one of the six is refused, naming the field', () => {
    const files = withJson('quest-templates/', (json) => {
      (barrow(json).beats[0] as QuestBeat).pool = { kinds: ['naval' as never] };
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.json: beats\.0\.pool\.kinds is \["naval"\]; expected a list, each one of combat/);
  });

  test('with no Sphere, a negative reward or a negative fame is refused, each worded and named', () => {
    const files = withJson('quest-templates/', (json) => {
      Object.assign(barrow(json), { sphereKeys: [], rewardPerDifficulty: -2, fameEffect: -1 });
    });

    const { message } = refusalOf(() => parse(files));
    expect(message).toContain('questTemplates.clear-the-barrow.sphereKeys is empty: no Patron offers it');
    expect(message).toContain('questTemplates.clear-the-barrow.rewardPerDifficulty is -2; it is a number of 0 or more');
    expect(message).toContain('questTemplates.clear-the-barrow.fameEffect is -1; it is a whole number of 0 or more');
  });
});
