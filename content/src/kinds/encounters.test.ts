import { type Encounter } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { realFiles, parse, withJson, changed, refusalOf, barrow, type Files, type EncounterRow, type SynergyRow, type Template } from './content.test-support.js';

// The Encounters' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// An Encounter naming an unknown Stat, Skill or Injury type is refused.
describe('an Encounter', () => {
  const ambush = (json: Files['encounters.json']) => json['ambush-on-the-road'] as EncounterRow;

  test.each<[string, (it: EncounterRow) => void, RegExp]>([
    [
      'an Injury of a type that does not exist',
      (it) => void it.consequences.failure.push({ kind: 'injury', typeKey: 'frostbite', chance: 0.1, count: 1 }),
      /encounters\.ambush-on-the-road\.consequences\.failure\.2\.typeKey: "frostbite" is not an Injury type/,
    ],
    ['a difficulty factor of 0', (it) => void Object.assign(it.checks[0]!, { flat: undefined, difficultyFactor: 0 }), /encounters\.ambush-on-the-road\.checks\.0\.difficultyFactor is 0/],
    [
      'a chance above 1',
      (it) => void it.consequences.failure.push({ kind: 'death', chance: 1.5 }),
      /ambush-on-the-road\.consequences\.failure\.2\.chance is 1\.5/,
    ],
    [
      'an Injury to no Heroes',
      (it) => void it.consequences.failure.push({ kind: 'injury', typeKey: 'deep-cut', chance: 0.1, count: 0 }),
      /ambush-on-the-road\.consequences\.failure\.2\.count is 0/,
    ],
    [
      'a negative factor',
      (it) => void it.consequences.success.push({ kind: 'wealth', factor: -1 }),
      /ambush-on-the-road\.consequences\.success\.1\.factor is -1/,
    ],
  ])('with %s is refused, naming the Encounter', (_, change, problem) => {
    const files = withJson('encounters.json', (json) => change(ambush(json)));

    expect(refusalOf(() => parse(files)).message).toMatch(problem);
  });

  test('with a consequence of an unknown kind, or a field its kind lacks, is refused, naming it', () => {
    const unknown = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { success: [{ kind: 'loot', table: 'hoard' }] });
    });
    const extra = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { success: [{ kind: 'fame', delta: 1, factor: 2 }] });
    });
    const outcome = withJson('encounters.json', (json) => {
      Object.assign(ambush(json).consequences, { draw: [] });
    });

    expect(refusalOf(() => parse(unknown)).message).toMatch(/ambush-on-the-road\.consequences\.success\.0\.kind is "loot"/);
    expect(refusalOf(() => parse(extra)).message).toMatch(
      /ambush-on-the-road\.consequences\.success\.0\.factor is not a field of a consequence of kind fame/,
    );
    expect(refusalOf(() => parse(outcome)).message).toMatch(/ambush-on-the-road\.consequences\.draw is not a field/);
  });

  // DL-192: the old form of an Encounter, `demands`, `aggregate` and `skillKeys` for one Check, is not read.
  test('in the old form is refused, as an Encounter with no Checks', () => {
    const files = withJson('encounters.json', (json) => {
      const { name, kind, consequences } = ambush(json);
      json['ambush-on-the-road'] = { name, kind, consequences, demands: [['strength', 1]], aggregate: 'sum', skillKeys: [], difficultyFactor: 1 } as unknown as EncounterRow;
    });

    const { message } = refusalOf(() => parse(files));

    expect(message).toMatch(/ambush-on-the-road\.checks is missing/);
    expect(message).toMatch(/ambush-on-the-road\.demands is not a field of an Encounter/);
  });

  test('of a kind outside the choices is refused, naming the choices', () => {
    const files = withJson('encounters.json', (json) => {
      Object.assign(ambush(json), { kind: 'naval' });
    });

    const { message } = refusalOf(() => parse(files));

    expect(message).toMatch(/ambush-on-the-road\.kind is "naval"; expected one of combat, travel, social, arcane, stealth, lore/);
  });
});

// DL-148 items 7 and 8: an Encounter written in the new form, `checks` and `pass`, with
// consequences by Degree. `encounters.json` may hold either form; the old one still loads.
describe('an Encounter in the new form', () => {
  /** A Check as the new form writes it. */
  const checkRow = (key: string, fields: Record<string, unknown> = {}): Record<string, unknown> => ({
    key,
    name: `The ${key}`,
    score: ['max', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']],
    skills: ['shieldwork'],
    difficultyFactor: 0.2,
    ...fields,
  });
  /** `ambush-on-the-road` rewritten in the new form, with `fields` in place of its own. */
  const rewritten = (fields: Record<string, unknown> = {}) =>
    withJson('encounters.json', (json) => {
      const { name, kind, consequences } = json['ambush-on-the-road'] as EncounterRow;
      (json as Record<string, unknown>)['ambush-on-the-road'] = {
        name,
        kind,
        checks: [checkRow('front'), checkRow('nerve', { score: ['min', 'party', ['stat', 'courage']], skills: [] }), checkRow('wits', { flat: 4, variance: 0 })],
        pass: ['or', ['and', 'front', 'nerve'], 'wits'],
        consequences: { ...consequences, triumph: [{ kind: 'fame', delta: 2 }], setback: [{ kind: 'morale', delta: -1 }] },
        ...fields,
      };
    });

  test('loads as written', () => {
    const content = parse(rewritten());
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;

    expect(ambush.checks.map((it) => it.key)).toEqual(['front', 'nerve', 'wits']);
    expect(ambush.checks[2]).toEqual({ ...checkRow('wits', { flat: 4, variance: 0 }) });
    expect(ambush.pass).toEqual(['or', ['and', 'front', 'nerve'], 'wits']);
    expect(ambush.consequences).toMatchObject({ triumph: [{ kind: 'fame', delta: 2 }], setback: [{ kind: 'morale', delta: -1 }] });
  });

  test('of one Check, may leave out its pass formula, and a raw gate of a flat and no difficulty factor is accepted', () => {
    const content = parse(rewritten({ checks: [checkRow('front', { difficultyFactor: 0, flat: 1, variance: 0, raw: true, skills: [] })], pass: undefined }));
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;
    expect(ambush.pass).toBeUndefined();
    expect(ambush.checks[0]).toMatchObject({ raw: true, flat: 1, variance: 0, skills: [] });
  });

  const path = (rest: string) => new RegExp(`encounters\\.ambush-on-the-road\\.${rest.replace(/[.[\]()]/g, (char) => `\\${char}`)}`);
  test.each<[string, Record<string, unknown>, RegExp]>([
    ['several Checks and no pass formula', { pass: undefined }, path('pass is missing: an Encounter of several Checks combines them by a pass formula')],
    ['a part naming no Check of the Encounter', { pass: ['or', ['and', 'front', 'nerve'], 'wits', 'luck'] }, path('pass.3: "luck" is not a Check of this Encounter')],
    ['a Check named twice', { pass: ['or', ['and', 'front', 'nerve'], 'wits', 'front'] }, path('pass: "front" is named twice; every Check is named once')],
    ['a Check not named', { pass: ['or', 'front', 'wits'] }, path('pass: "nerve" is not named; every Check is named once')],
    ['an operator no formula has', { pass: ['or', ['xor', 'front', 'nerve'], 'wits'] }, path('pass.1.0 is "xor"; a pass formula\'s operator is and, or or at-least')],
    ['an `and` of one part', { pass: ['or', ['and', 'front'], 'nerve', 'wits'] }, path('pass.1 has 1 part; and combines two or more')],
    ['an `and` of no part', { pass: ['or', ['and'], 'front', 'nerve', 'wits'] }, path('pass.1 has 0 parts; and combines two or more')],
    ['an `at-least` of 0', { pass: ['at-least', 0, 'front', 'nerve', 'wits'] }, path("pass.1 is 0; at-least's k is a whole number from 1 to the number of its parts, 3")],
    ['an `at-least` of more than its parts', { pass: ['at-least', 4, 'front', 'nerve', 'wits'] }, path("pass.1 is 4; at-least's k")],
    ['an `at-least` of a fraction', { pass: ['at-least', 1.5, 'front', 'nerve', 'wits'] }, path("pass.1 is 1.5; at-least's k")],
    ['a part that is a number', { pass: ['or', 'front', 'nerve', 'wits', 3] }, path("pass.4 is 3; a part of a pass formula is a Check's key or a list")],
    ['five Checks', { checks: ['a', 'b', 'c', 'd', 'e'].map((key) => checkRow(key)), pass: ['and', 'a', 'b', 'c', 'd', 'e'] }, path('checks has 5; an Encounter has at most 4')],
    ['a negative flat', { checks: [checkRow('front', { flat: -1 })], pass: 'front' }, path('checks.0.flat is -1; it is a number of 0 or more')],
    ['a factor of 0 with no flat', { checks: [checkRow('front', { difficultyFactor: 0 })], pass: 'front' }, path('checks.0.difficultyFactor is 0; it is a number above 0, or 0 beside a flat above 0')],
    ['a negative factor beside a flat', { checks: [checkRow('front', { difficultyFactor: -0.1, flat: 2 })], pass: 'front' }, path('checks.0.difficultyFactor is -0.1; it is a number of 0 or more')],
    ['a variance above 1', { checks: [checkRow('front', { variance: 1.5 })], pass: 'front' }, path('checks.0.variance is 1.5; it is a number from 0 to 1')],
    ['a Check with a field it lacks', { checks: [checkRow('front', { aggregate: 'sum' })], pass: 'front' }, /encounters\.json: ambush-on-the-road\.checks\.0\.aggregate is not a field of an Encounter's Check/],
    ['a Check with no score', { checks: [checkRow('front', { score: undefined })], pass: 'front' }, path('checks.0.score')],
    ['a Check with a Skill content lacks', { checks: [checkRow('front', { skills: ['axemanship'] })], pass: 'front' }, path('checks.0.skills: "axemanship" is not a Skill')],
    ['a Check with a Skill listed twice', { checks: [checkRow('front', { skills: ['tactics', 'tactics'] })], pass: 'front' }, path('checks.0.skills: "tactics" is listed twice')],
    ['the old form beside the new', { demands: [['strength', 1]] }, /encounters\.json: ambush-on-the-road\.demands is not a field of an Encounter/],
    ['a raw Check with Skills', { checks: [checkRow('front', { raw: true })], pass: 'front' }, path('checks.0.skills lists 1; a raw Check is its score alone, and lists no Skills')],
    ['a raw that is not true or false', { checks: [checkRow('front', { raw: 'yes', skills: [] })], pass: 'front' }, /ambush-on-the-road\.checks\.0\.raw is "yes"; expected true or false/],
  ])('with %s is refused, naming its path', (_, fields, problem) => {
    expect(refusalOf(() => parse(rewritten(fields))).message).toMatch(problem);
  });

  test('with consequences by Degree out of bounds, or of a field they lack, is refused, naming them', () => {
    const { consequences } = { consequences: { success: [], failure: [] } };
    const bad = rewritten({ consequences: { ...consequences, triumph: [{ kind: 'death', chance: 2 }], setback: [{ kind: 'xp', factor: -1 }] } });
    const odd = rewritten({ consequences: { ...consequences, glory: [] } });

    const { message } = refusalOf(() => parse(bad));
    expect(message).toMatch(path('consequences.triumph.0.chance is 2'));
    expect(message).toMatch(path('consequences.setback.0.factor is -1'));
    expect(refusalOf(() => parse(odd)).message).toMatch(/ambush-on-the-road\.consequences\.glory is not a field of an Encounter's consequences/);
  });
});

// DL-154: form scales the Stats a Hero adds into a Check's score, so a
// Stat subtracted would be scaled too, and a wound or low spirits would raise the score. A `-` whose
// right operand reads a Stat a Hero adds, directly, within a `weighted`, or by a Num of such a Val,
// is refused in a Check's score. A Synergy's requirement reads the Heroes as they are, and keeps it.
describe("a Check's score that subtracts a Stat", () => {
  const scored = (score: unknown) =>
    withJson('encounters.json', (json) => {
      const { name, kind, consequences } = json['ambush-on-the-road'] as EncounterRow;
      (json as Record<string, unknown>)['ambush-on-the-road'] = {
        name,
        kind,
        checks: [{ key: 'front', name: 'Front', score, skills: [], difficultyFactor: 0.2 }],
        consequences,
      };
    });
  const at = (rest: string) => new RegExp(`encounters\\.ambush-on-the-road\\.checks\\.0\\.score${rest.replace(/[.[\]()]/g, (char) => `\\${char}`)}: "-" subtracts a Stat a Hero adds`);

  // The Query's own refusals are held word for word in query-refusals.test.ts; one refused and one
  // accepted show the parse path's wiring.
  test('with a Num subtracting a sum of a Stat is refused, naming its path', () => {
    const score = ['-', 40, ['sum', 'party', ['stat', 'strength']]];

    expect(refusalOf(() => parse(scored(score))).message).toMatch(at('.2'));
  });

  test('with a Stat less a Level is accepted', () => {
    const score = ['sum', 'party', ['-', ['stat', 'strength'], ['level']]];

    expect(parse(scored(score)).encounters['ambush-on-the-road']?.checks[0]?.score).toEqual(score);
  });

  test("a Synergy's requirement, read as the Heroes are, may subtract a Stat", () => {
    const condition = ['>=', ['-', 40, ['sum', 'party', ['stat', 'strength']]], 1];
    const files = withJson('synergies.json', (json) => void ((json['sword-and-salve'] as SynergyRow).requires = [condition] as SynergyRow['requires']));
    expect(parse(files).synergies['sword-and-salve']?.requires).toEqual([condition]);
  });

  test('a raw Check, read without form, may weigh a Stat negatively', () => {
    const files = withJson('encounters.json', (json) => {
      const { name, kind, consequences } = json['ambush-on-the-road'] as EncounterRow;
      (json as Record<string, unknown>)['ambush-on-the-road'] = {
        name,
        kind,
        checks: [{ key: 'gate', name: 'Gate', score: ['+', 30, ['*', -1, ['max', 'party', ['weighted', [['wits', -1]]]]]], skills: [], difficultyFactor: 0, flat: 1, raw: true }],
        consequences,
      };
    });
    expect(parse(files).encounters['ambush-on-the-road']?.checks[0]?.raw).toBe(true);
  });
});

// DL-148 item 14, DL-155: harm that reads the Stats. An Injury's and a Death's `among`
// is a Set Query, held as a Check's score is, Sex allowed in its filters; their `exposedBy` and
// `guardedBy`, and a Morale's `steadiedBy`, list Hero Stats. Each refusal names its path.
describe('harm that reads the Stats', () => {
  /** The real files with `ambush-on-the-road`'s failure consequences as given. */
  const failing = (...failure: Record<string, unknown>[]) =>
    withJson('encounters.json', (json) => {
      const ambush = json['ambush-on-the-road'] as EncounterRow;
      (ambush.consequences as { failure: unknown[] }).failure = failure;
    });
  const injury = { kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 1 };
  const escaped = (rest: string) => rest.replace(/[.[\]()"]/g, (char) => `\\${char}`);
  /** A refusal of validation, at the path's end `rest`. */
  const at = (rest: string) => new RegExp(`encounters\\.ambush-on-the-road\\.consequences\\.failure\\.${escaped(rest)}`);
  /** A refusal as the file is read, which names the file and then the row. */
  const read = (rest: string) => new RegExp(`encounters\\.json: ambush-on-the-road\\.consequences\\.failure\\.${escaped(rest)}`);

  test('every field, at its fullest, loads as written', () => {
    const among = ['top', ['where', 'party', ['and', ['class', 'warrior'], ['sex', 'male']]], 2, ['stat', 'constitution']];
    const files = failing(
      { ...injury, among, exposedBy: ['constitution', 'endurance'], guardedBy: ['constitution'] },
      { kind: 'death', chance: 0.03, among: 'party', exposedBy: ['dexterity'], guardedBy: ['endurance'] },
      { kind: 'morale', delta: -4, steadiedBy: ['courage', 'willpower'] },
    );

    expect(parse(files).encounters['ambush-on-the-road']?.consequences.failure).toEqual([
      { ...injury, among, exposedBy: ['constitution', 'endurance'], guardedBy: ['constitution'] },
      { kind: 'death', chance: 0.03, among: 'party', exposedBy: ['dexterity'], guardedBy: ['endurance'] },
      { kind: 'morale', delta: -4, steadiedBy: ['courage', 'willpower'] },
    ]);
  });

  test.each<[string, Record<string, unknown>, RegExp]>([
    ['an among that is not a Set', { ...injury, among: ['count', 'party'] }, at('0.among: "count" makes a Num, where a Set is expected')],
    ['an among naming a Class content lacks', { kind: 'death', chance: 0.1, among: ['where', 'party', ['class', 'paladin']] }, at('0.among.2.1: "paladin" is not a Class')],
    ['an among that is a number', { ...injury, among: 3 }, at('0.among is 3; a number stands for a Val or a Num, not a Set')],
    ['an exposedBy naming a Stat content lacks', { ...injury, exposedBy: ['toughness'] }, at('0.exposedBy: "toughness" is not a Hero Stat')],
    ['an exposedBy naming a Guildmaster Stat', { ...injury, exposedBy: ['judgement'] }, at('0.exposedBy: "judgement" is not a Hero Stat')],
    ['a guardedBy naming a Stat twice', { kind: 'death', chance: 0.1, guardedBy: ['endurance', 'endurance'] }, at('0.guardedBy: "endurance" is listed twice')],
    ['an empty guardedBy', { ...injury, guardedBy: [] }, at('0.guardedBy lists no Stat')],
    ['a steadiedBy naming a Stat content lacks', { kind: 'morale', delta: -2, steadiedBy: ['nerve'] }, at('0.steadiedBy: "nerve" is not a Hero Stat')],
    ['a steadiedBy beside a gain', { kind: 'morale', delta: 2, steadiedBy: ['courage'] }, at('0.steadiedBy steadies a loss; delta is 2')],
  ])('with %s is refused, naming its path', (_, consequence, problem) => {
    expect(refusalOf(() => parse(failing(consequence))).message).toMatch(problem);
  });

  test('an among filtered by Sex is allowed, as in a Check, and one that is not a list of Stats is refused as a field of the wrong type', () => {
    const bySex = failing({ ...injury, among: ['where', 'party', ['sex', 'female']] });
    expect(parse(bySex).encounters['ambush-on-the-road']?.consequences.failure[0]).toMatchObject({ among: ['where', 'party', ['sex', 'female']] });
    expect(refusalOf(() => parse(failing({ ...injury, exposedBy: 'constitution' }))).message).toMatch(read('0.exposedBy is "constitution"; expected a list of strings'));
  });

  test("a field on a kind that lacks it is refused: an Injury's steadiedBy, a Morale's among", () => {
    expect(refusalOf(() => parse(failing({ ...injury, steadiedBy: ['courage'] }))).message).toMatch(
      read('0.steadiedBy is not a field of a consequence of kind injury'),
    );
    expect(refusalOf(() => parse(failing({ kind: 'morale', delta: -1, among: 'party' }))).message).toMatch(
      read('0.among is not a field of a consequence of kind morale'),
    );
  });
});

// DL-148 item 25, DL-159: an earned Trait, `{ kind: "trait", traitKey, chance, among }`.
// Its list says what it is: a positive Trait in an Encounter's `triumph` list, a negative one in its
// `failure` list after an Injury; it stands in no other. Each refusal names its path.
describe('an earned Trait', () => {
  type Lists = Partial<Record<'success' | 'failure' | 'triumph' | 'setback', Record<string, unknown>[]>>;
  /** The real files with `ambush-on-the-road`'s consequences as given. */
  const consequences = (lists: Lists) =>
    withJson('encounters.json', (json) => {
      const ambush = json['ambush-on-the-road'] as EncounterRow;
      ambush.consequences = { success: [], failure: [], ...lists } as never;
    });
  const injury = { kind: 'injury', typeKey: 'deep-cut', chance: 0.2, count: 1 };
  const trait = { kind: 'trait', traitKey: 'scarred', chance: 0.1 };
  const escaped = (rest: string) => rest.replace(/[.[\]()"]/g, (char) => `\\${char}`);
  const at = (rest: string) => new RegExp(`encounters\\.ambush-on-the-road\\.consequences\\.${escaped(rest)}`);

  test('loads as written, a positive one on a Triumph and a negative one after an Injury, `among` a Set Query or absent', () => {
    const among = ['where', 'party', ['class', 'warrior']];
    const files = consequences({ triumph: [{ ...trait, among }], failure: [injury, trait] });
    const ambush = parse(files).encounters['ambush-on-the-road'];
    expect(ambush?.consequences.triumph).toEqual([{ ...trait, among }]);
    expect(ambush?.consequences.failure).toEqual([injury, trait]);
  });

  test.each<[string, Lists, RegExp]>([
    ['a Trait content lacks', { triumph: [{ ...trait, traitKey: 'lucky' }] }, at('triumph.0.traitKey: "lucky" is not a Hero Trait')],
    ['a Guildmaster Trait', { triumph: [{ ...trait, traitKey: 'miser' }] }, at('triumph.0.traitKey: "miser" is not a Hero Trait')],
    ['a chance above 1', { triumph: [{ ...trait, chance: 1.5 }] }, at('triumph.0.chance is 1.5; it is a probability from 0 to 1')],
    ['an among that is not a Set', { triumph: [{ ...trait, among: ['count', 'party'] }] }, at('triumph.0.among: "count" makes a Num, where a Set is expected')],
    ['one in the success list', { success: [trait] }, at('success.0: an earned Trait stands in the triumph list, a positive one, or the failure list, a negative one; not in success')],
    ['one in the setback list', { setback: [injury, trait] }, at('setback.1: an earned Trait stands in the triumph list, a positive one, or the failure list, a negative one; not in setback')],
    [
      'a negative one with no Injury before it',
      { failure: [trait, injury] },
      at('failure.0: a negative Trait falls only among the Heroes this Encounter injured, so an Injury comes before it in the failure list'),
    ],
  ])('with %s is refused, naming its path', (_, lists, problem) => {
    expect(refusalOf(() => parse(consequences(lists))).message).toMatch(problem);
  });

  test("a field it lacks is refused as the file is read: a count, an Injury's exposedBy", () => {
    expect(refusalOf(() => parse(consequences({ triumph: [{ ...trait, count: 1 }] }))).message).toMatch(
      /encounters\.json: ambush-on-the-road\.consequences\.triumph\.0\.count is not a field of a consequence of kind trait/,
    );
    expect(refusalOf(() => parse(consequences({ triumph: [{ ...trait, exposedBy: ['dexterity'] }] }))).message).toMatch(
      /encounters\.json: ambush-on-the-road\.consequences\.triumph\.0\.exposedBy is not a field of a consequence of kind trait/,
    );
  });
});

describe('tags, a Finale and the lore kind', () => {
  /** The real files with `ambush-on-the-road` changed. */
  const ambushed = (change: (it: EncounterRow) => void) => withJson('encounters.json', (json) => change(json['ambush-on-the-road'] as EncounterRow));
  /** `files` with the barrow's template changed. */
  const barrowed = (change: (it: Template) => void, files = realFiles()) => changed(files, 'quest-templates.json', (json) => change(barrow(json)));
  /** `files` without the Encounters keyed `keys`. */
  const without = (files: Record<string, string>, keys: string[]) =>
    changed(files, 'encounters.json', (json) => keys.forEach((key) => Reflect.deleteProperty(json, key)));
  /** A lore Encounter keyed `a-riddle`, the sealed door's Check. */
  const riddle = (files: Record<string, string>) =>
    changed(files, 'encounters.json', (json) => {
      json['a-riddle'] = { ...(json['the-sealed-door'] as EncounterRow), name: 'A riddle', kind: 'lore', tags: ['delve'] };
    });

  test("loads an Encounter's tags and a template's Finale as written, and an Encounter with none has no tags", () => {
    const files = barrowed((it) => (it.finale = 'hold-the-line'), ambushed((it) => (it.tags = ['escort', 'road-side'])));
    const content = parse(files);
    expect(content.encounters['ambush-on-the-road']?.tags).toEqual(['escort', 'road-side']);
    expect(content.questTemplates['clear-the-barrow']?.finale).toBe('hold-the-line');
    const untagged = parse(ambushed((it) => delete it.tags));
    expect(untagged.encounters['ambush-on-the-road']).not.toHaveProperty('tags');
    expect(untagged.questTemplates['clear-the-barrow']).not.toHaveProperty('finale');
  });

  test.each<[string, (it: EncounterRow) => void, RegExp]>([
    ['a tag that is not kebab-case', (it) => (it.tags = ['On The Road']), /encounters\.ambush-on-the-road\.tags: "On The Road" is not kebab-case/],
    ['a tag listed twice', (it) => (it.tags = ['escort', 'escort']), /encounters\.ambush-on-the-road\.tags: "escort" is listed twice/],
    ['tags that are not a list of strings', (it) => ((it as unknown as Record<string, unknown>)['tags'] = 'escort'), /encounters\.json: ambush-on-the-road\.tags is "escort"; expected a list of strings/],
  ])("an Encounter's %s is refused, naming its path", (_, change, problem) => {
    expect(refusalOf(() => parse(ambushed(change))).message).toMatch(problem);
  });

  test.each<[string, (it: Template) => void, RegExp]>([
    ['a Finale that is not an Encounter', (it) => (it.finale = 'the-dragon'), /questTemplates\.clear-the-barrow\.finale: "the-dragon" is not an Encounter/],
    ['a Finale that is not a string', (it) => ((it as unknown as Record<string, unknown>)['finale'] = ['hold-the-line']), /quest-templates\.json: clear-the-barrow\.finale is \["hold-the-line"\]; expected a string, or no such field/],
  ])("a template's %s is refused, naming its path", (_, change, problem) => {
    expect(refusalOf(() => parse(barrowed(change))).message).toMatch(problem);
  });

  test('a kind whose every Encounter is a Finale, which is never drawn, is refused for each template that draws it', () => {
    // The four arcane Encounters that are not Finales gone: the two left are the lay's and the vault's.
    const files = without(realFiles(), ['the-sealed-door', 'a-restless-power', 'the-hungry-ward', 'the-dead-light']);
    const { message } = refusalOf(() => parse(files));
    expect(message).toMatch(/questTemplates\.lay-the-restless-dead\.encounterKinds: every Encounter of kind "arcane" is a Finale, which is never drawn/);
    expect(message).toMatch(/questTemplates\.break-the-sealed-vault\.encounterKinds: every Encounter of kind "arcane" is a Finale/);
    expect(message).not.toMatch(/clear-the-barrow\.encounterKinds/);
  });

  test("a Finale may be of any kind, one its template's places are not drawn from", () => {
    const files = barrowed((it) => (it.finale = 'a-riddle'), riddle(realFiles()));
    expect(parse(files).questTemplates['clear-the-barrow']?.finale).toBe('a-riddle');
  });

  test('lore is a kind an Encounter, a template, a Synergy, a consumable and a Hero Trait may name', () => {
    let files = riddle(realFiles());
    files = barrowed((it) => (it.encounterKinds = [...it.encounterKinds, 'lore']), files);
    files = changed(files, 'synergies.json', (json) => void ((json['sword-and-salve'] as SynergyRow).kinds = ['lore']));
    files = changed(files, 'items.json', (json) => void Object.assign(json['whetstone'] ?? {}, { effect: { kind: 'bonus', flat: 3, kinds: ['lore'] } }));
    files = changed(files, 'hero-traits.json', (json) =>
      Object.assign(json['scarred'] ?? {}, { effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['lore'], tags: ['delve'] }] }),
    );
    const content = parse(files);
    expect(content.encounters['a-riddle']?.kind).toBe('lore');
    expect(content.questTemplates['clear-the-barrow']?.encounterKinds).toContain('lore');
    expect(content.synergies['sword-and-salve']?.kinds).toEqual(['lore']);
  });

  test('a template drawing lore when content has no lore Encounter is refused, naming the kind', () => {
    const files = without(realFiles(), ['old-records', 'a-riddle-at-the-gate', 'the-cause-of-the-sickness', 'the-names-of-the-dead']);
    expect(refusalOf(() => parse(barrowed((it) => (it.encounterKinds = ['lore']), files))).message).toMatch(
      /questTemplates\.clear-the-barrow\.encounterKinds: no Encounter is of kind "lore"/,
    );
  });
});
