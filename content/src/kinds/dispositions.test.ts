import { type Disposition } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { realFiles, parse, withJson, withText, refusalOf, type Files } from './content.test-support.js';

// The Dispositions' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

describe('a Disposition (M6-S1)', () => {
  const reckless = (json: Files['dispositions.json']) => json['reckless'] as Omit<Disposition, 'key'>;

  test.each<[string, (it: Omit<Disposition, 'key'>) => void, RegExp]>([
    ['with a questRiskAppetite above 1', (it) => (it.questRiskAppetite = 1.5), /dispositions\.reckless\.questRiskAppetite is 1\.5; it is a number from 0 to 1/],
    ['with a transferAppetite below 0', (it) => (it.transferAppetite = -0.1), /dispositions\.reckless\.transferAppetite is -0\.1; it is a number from 0 to 1/],
    ['with a partyMargin below 0', (it) => (it.partyMargin = -0.05), /dispositions\.reckless\.partyMargin is -0\.05; it is a number from 0 to 1/],
    ['with a partyMargin above 1', (it) => (it.partyMargin = 1.5), /dispositions\.reckless\.partyMargin is 1\.5; it is a number from 0 to 1/],
    ['with a negative recruitThreshold', (it) => (it.recruitThreshold = -1), /dispositions\.reckless\.recruitThreshold is -1; it is a number of 0 or more/],
    ['with a negative buildThreshold', (it) => (it.buildThreshold = -2), /dispositions\.reckless\.buildThreshold is -2; it is a number of 0 or more/],
    ['with a negative gearThreshold', (it) => (it.gearThreshold = -3), /dispositions\.reckless\.gearThreshold is -3; it is a number of 0 or more/],
  ])('%s is refused, naming the Disposition and the field', (_, change, problem) => {
    const files = withJson('dispositions.json', (json) => change(reckless(json)));

    expect(refusalOf(() => parse(files)).message).toMatch(problem);
  });

  test('without a weight, or with one that is not a number, is refused, naming it', () => {
    const missing = withJson('dispositions.json', (json) => {
      Reflect.deleteProperty(reckless(json), 'buildThreshold');
    });
    const wrong = withJson('dispositions.json', (json) => {
      Object.assign(reckless(json), { questRiskAppetite: 'high' });
    });
    const noMargin = withJson('dispositions.json', (json) => {
      Reflect.deleteProperty(reckless(json), 'partyMargin');
    });

    expect(refusalOf(() => parse(missing)).message).toMatch(/dispositions\.json: reckless\.buildThreshold is missing/);
    expect(refusalOf(() => parse(noMargin)).message).toMatch(/dispositions\.json: reckless\.partyMargin is missing/);
    expect(refusalOf(() => parse(wrong)).message).toMatch(/dispositions\.json: reckless\.questRiskAppetite is "high"/);
  });

  test('is required: a set with none is refused, since every Rival is dealt one', () => {
    expect(refusalOf(() => parse(withText('dispositions.json', '{}'))).message).toContain('dispositions is empty');
  });

  test('may be a fifth, with weights of its own, and is accepted as the four are', () => {
    const files = withJson('dispositions.json', (json) => {
      json['cautious'] = {
        name: 'Cautious',
        questRiskAppetite: 0.1,
        recruitThreshold: 100,
        buildThreshold: 0,
        gearThreshold: 0,
        transferAppetite: 0,
        partyMargin: 0,
      };
    });

    expect(Object.keys(parse(files).dispositions).sort()).toEqual(['ambitious', 'cautious', 'miserly', 'reckless', 'steady']);
  });
});

describe('a file', () => {
  test('whose Disposition has a field the schema does not know is refused, naming it (M2-S9)', () => {
    const files = withJson('dispositions.json', (json) => {
      Object.assign(json['steady'] ?? {}, { riskAppetite: 0.2 });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(/dispositions\.json: steady\.riskAppetite/);
  });
});

describe("a Disposition's orders", () => {
  const steady = (json: Files['dispositions.json']) => json['steady'] as Omit<Disposition, 'key'>;
  const written = (change: (it: Record<string, unknown>) => void) =>
    withJson('dispositions.json', (json) => change(steady(json) as unknown as Record<string, unknown>));

  test('are on no shipped Disposition, and any permutation written is read as written', () => {
    for (const disposition of Object.values(parse(realFiles()).dispositions)) {
      expect([disposition.purchaseOrder, disposition.gearSlotOrder, disposition.buildOrder]).toEqual([undefined, undefined, undefined]);
    }
    const set = parse(
      written((it) => {
        it['purchaseOrder'] = ['debt', 'recruit', 'transfer', 'gear', 'build'];
        it['gearSlotOrder'] = ['trinket', 'weapon', 'armour'];
        it['buildOrder'] = ['quarters', 'infirmary', 'trainingYard'];
      }),
    );

    expect(set.dispositions['steady']).toMatchObject({
      purchaseOrder: ['debt', 'recruit', 'transfer', 'gear', 'build'],
      gearSlotOrder: ['trinket', 'weapon', 'armour'],
      buildOrder: ['quarters', 'infirmary', 'trainingYard'],
    });
  });

  test.each<[string, string, string[], string]>([
    ['purchaseOrder', 'a step missing', ['build', 'gear', 'transfer', 'recruit'], 'dispositions.steady.purchaseOrder: "debt" is not in the order; list each of build, gear, transfer, recruit, debt once'],
    ['purchaseOrder', 'a step twice', ['build', 'gear', 'transfer', 'recruit', 'debt', 'gear'], 'dispositions.steady.purchaseOrder: "gear" is listed twice'],
    ['gearSlotOrder', 'a slot missing', ['armour', 'weapon'], 'dispositions.steady.gearSlotOrder: "trinket" is not in the order; list each of weapon, armour, trinket once'],
    ['gearSlotOrder', 'a slot twice', ['armour', 'armour', 'weapon', 'trinket'], 'dispositions.steady.gearSlotOrder: "armour" is listed twice'],
    ['buildOrder', 'a facility missing', ['infirmary', 'quarters'], 'dispositions.steady.buildOrder: "trainingYard" is not in the order'],
    ['buildOrder', 'a facility twice', ['infirmary', 'infirmary', 'trainingYard', 'quarters'], 'dispositions.steady.buildOrder: "infirmary" is listed twice'],
  ])('%s with %s is refused, naming it', (field, _what, order, problem) => {
    expect(refusalOf(() => parse(written((it) => void (it[field] = order)))).message).toContain(problem);
  });

  test.each([
    ['purchaseOrder', ['build', 'sell', 'gear', 'transfer', 'recruit', 'debt']],
    ['gearSlotOrder', ['weapon', 'armour', 'ring']],
    ['buildOrder', ['infirmary', 'trainingYard', 'quarters', 'library']],
  ])('%s naming a key it has none of is refused by the parser', (field, order) => {
    expect(refusalOf(() => parse(written((it) => void (it[field] = order)))).message).toContain(`steady.${field} is`);
  });
});
