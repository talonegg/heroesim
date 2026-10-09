import { describe, expect, test } from 'vitest';
import { parse, withJson, refusalOf, barrow, type Template } from './content.test-support.js';

// The Quest templates' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a Quest template', () => {
  // DL-193: a Quest template carries no `demands`.
  test('with demands is refused, as a field a Quest template does not have', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { demands: [['strength', 1]] });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.demands is not a field of a Quest template/);
  });

  test.each<[string, (it: Template) => void, RegExp]>([
    ['a Skill that does not exist', (it) => void it.skillKeys.push('axemanship'), /skillKeys.*"axemanship"/],
    ['a Sphere that does not exist', (it) => void it.sphereKeys.push('the-sea'), /sphereKeys.*"the-sea"/],
    ['a required Class that does not exist', (it) => (it.requires = { classKey: 'bard' }), /requires\.classKey.*"bard"/],
    ['a required Skill that does not exist', (it) => (it.requires = { skillKey: 'lute' }), /requires\.skillKey.*"lute"/],
    ['a difficulty range upside down', (it) => (it.difficultyMin = 80), /difficultyMin 80 is greater than difficultyMax 70/],
    ['a Party of no Heroes', (it) => (it.partySizeMin = 0), /partySizeMin is 0/],
    ['a tag that is not kebab-case', (it) => void it.tags.push('Dark Places'), /tags: "Dark Places"/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates.json', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parse(files));

    expect(message).toContain('questTemplates.clear-the-barrow');
    expect(message).toMatch(problem);
  });

  test('requiring anything but a Class or a Skill is refused, naming the field', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json).requires, { level: 3 });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(
      /quest-templates\.json: clear-the-barrow\.requires\.level is not a field/,
    );
  });

  test('naming a Loot table content lacks is refused, naming the template and the table', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { lootTableKey: 'barrow-hoard' });
    });
    const notAKey = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { lootTableKey: 7 });
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'questTemplates.clear-the-barrow.lootTableKey: "barrow-hoard" is not a Loot table',
    );
    expect(refusalOf(() => parse(notAKey)).message).toMatch(
      /quest-templates\.json: clear-the-barrow\.lootTableKey is 7; expected a string or null/,
    );
  });

  test('that leaves a Sphere with none is refused, naming the Sphere', () => {
    const files = withJson('quest-templates.json', (json) => {
      for (const [key, it] of Object.entries(json)) {
        if (it.sphereKeys.includes('villages')) delete json[key];
      }
    });

    expect(refusalOf(() => parse(files)).message).toContain(
      'spheres.villages: no Quest template names it in sphereKeys',
    );
  });
});

describe("a Quest template's Encounters", () => {
  test.each<[string, (it: Template) => void, RegExp]>([
    ['no Encounter kind', (it) => (it.encounterKinds = []), /encounterKinds is empty/],
    ['a kind listed twice', (it) => void it.encounterKinds.push('combat'), /encounterKinds: "combat" is listed twice/],
    ['a count range upside down', (it) => (it.encountersMin = 5), /encountersMin 5 is greater than encountersMax 4/],
    ['a count of no Encounters', (it) => (it.encountersMin = 0), /encountersMin is 0/],
  ])('with %s is refused, naming the template', (_, change, problem) => {
    const files = withJson('quest-templates.json', (json) => change(barrow(json)));

    const { message } = refusalOf(() => parse(files));

    expect(message).toContain('questTemplates.clear-the-barrow');
    expect(message).toMatch(problem);
  });

  test('with a kind that is not one of the six is refused, naming the field', () => {
    const files = withJson('quest-templates.json', (json) => {
      Object.assign(barrow(json), { encounterKinds: ['combat', 'naval'] });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/clear-the-barrow\.encounterKinds is \["combat","naval"\]/);
  });

  test('with a kind content has no Encounter of is refused, naming the kind', () => {
    const files = withJson('encounters.json', (json) => {
      for (const [key, it] of Object.entries(json)) if (it.kind === 'stealth') delete json[key];
    });

    expect(refusalOf(() => parse(files)).message).toMatch(
      /questTemplates\.clear-the-barrow\.encounterKinds: no Encounter is of kind "stealth"/,
    );
  });
});
