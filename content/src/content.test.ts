import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EncounterKind, StatArea, TraitEffect } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { contentFiles, parseContent, validateContent } from './index.js';
import { contentDir, loadContent } from './node.js';

// The core content set as the Node entry loads it from this package's directory (M1-S4).

describe('loadContent()', () => {
  const content = loadContent();
  const stats = Object.values(content.stats);
  const heroStats = stats.filter((stat) => stat.owner === 'hero');
  const guildmasterStats = stats.filter((stat) => stat.owner === 'guildmaster');

  test("is the core content set, version 12 since M6-S4 retuned reckless's gearThreshold", () => {
    expect(content.id).toBe('core');
    expect(content.version).toBe(12);
  });

  test('has three grades of each Hall facility, at 200, 500 and 1,000 Wealth (INPUTS 7.3, M3-S6)', () => {
    const improvements = Object.values(content.improvements);
    for (const facility of ['infirmary', 'trainingYard', 'quarters'] as const) {
      const grades = improvements
        .filter((it) => it.facility === facility)
        .sort((a, b) => a.grade - b.grade)
        .map(({ grade, cost }) => [grade, cost]);
      expect(grades, facility).toEqual([
        [1, 200],
        [2, 500],
        [3, 1000],
      ]);
    }
    expect(improvements).toHaveLength(9);
    for (const it of improvements) expect(it.name.length).toBeGreaterThan(0);
  });

  test('has the four named Dispositions (INPUTS 7.5), their weights as DL-56 sets them and DL-58 retunes one', () => {
    const weights = (questRiskAppetite: number, recruitThreshold: number, buildThreshold: number, gearThreshold: number, transferAppetite: number) =>
      ({ questRiskAppetite, recruitThreshold, buildThreshold, gearThreshold, transferAppetite });
    expect(content.dispositions).toEqual({
      // `steady` keeps M2 to M5's rule: the easiest Quest, sixty Upkeeps to recruit (DL-41), three
      // times the cost to build (DL-38), which were config fields until the row replaced them.
      steady: { key: 'steady', name: 'Steady', ...weights(0, 60, 3, 3, 0.25) },
      ambitious: { key: 'ambitious', name: 'Ambitious', ...weights(0.6, 40, 1.5, 2, 0.75) },
      miserly: { key: 'miserly', name: 'Miserly', ...weights(0.25, 80, 20, 10, 0.1) },
      // reckless's gearThreshold was 1.5 until M6-S4 gave the weight a rule and retuned it (DL-58).
      reckless: { key: 'reckless', name: 'Reckless', ...weights(1, 30, 4, 3, 0.5) },
    });
  });

  test('has twenty Hero Stats in four areas', () => {
    const inArea = (area: StatArea) => heroStats.filter((stat) => stat.area === area).length;

    expect(heroStats).toHaveLength(20);
    expect([inArea('physical'), inArea('mental'), inArea('magical'), inArea('social')]).toEqual([
      5, 6, 5, 4,
    ]);
  });

  test('has the five Guildmaster Stats', () => {
    expect(guildmasterStats.map((stat) => stat.name)).toEqual([
      'Inspiration',
      'Influence',
      'Negotiation',
      'Coaching',
      'Judgement',
    ]);
  });

  test('has every Stat range 1 to 20 (INPUTS 3.6)', () => {
    expect(stats.filter((stat) => stat.min !== 1 || stat.max !== 20)).toEqual([]);
  });

  test('has four Classes, each gating three Skills of the twelve', () => {
    const classes = Object.values(content.classes);

    expect(classes.map((it) => it.name)).toEqual(['Warrior', 'Rogue', 'Mage', 'Healer']);
    expect(Object.keys(content.skills)).toHaveLength(12);
    for (const it of classes) expect(it.gatedSkills).toHaveLength(3);
    expect(new Set(classes.flatMap((it) => it.gatedSkills)).size).toBe(12);
  });

  test("weights each Class's growth 2:1 toward its leading Stats (INPUTS 5.3)", () => {
    for (const it of Object.values(content.classes)) {
      const leading = it.leadingStats.reduce((sum, key) => sum + (it.growth[key] ?? 0), 0);
      const rest = Object.entries(it.growth)
        .filter(([key]) => !it.leadingStats.includes(key))
        .reduce((sum, [, weight]) => sum + weight, 0);

      expect(Object.keys(it.growth).sort()).toEqual(heroStats.map((stat) => stat.key).sort());
      expect(leading / rest).toBeCloseTo(2, 1);
    }
  });

  test('has six Guildmaster Traits, three buffs and three penalties, each kind of effect among them; Hero Traits have none (M4-S5)', () => {
    const traits = Object.values(content.traits);
    const guildmaster = traits.filter((trait) => trait.owner === 'guildmaster');
    const buff = (effect: TraitEffect): boolean =>
      effect.kind === 'upkeepFactor' ? effect.factor < 1 : effect.delta > 0;

    expect(guildmaster).toHaveLength(6);
    const effects = guildmaster.map((trait) => trait.effect).filter((effect) => effect !== null);
    expect(effects).toHaveLength(6);
    expect(effects.filter(buff)).toHaveLength(3);
    expect(new Set(effects.map((effect) => effect.kind))).toEqual(new Set(['classStatBonus', 'guildMoraleShift', 'upkeepFactor']));
    expect(content.traits['old-soldier']?.effect).toEqual({ kind: 'classStatBonus', classKey: 'warrior', statKey: 'weaponry', delta: 1 });
    expect(traits.filter((trait) => trait.owner === 'hero').length).toBeGreaterThan(0);
    for (const trait of traits) if (trait.owner === 'hero') expect(trait.effect).toBeNull();
  });

  test('has eight Hero and four Guild Backgrounds, and six Spheres', () => {
    const backgrounds = Object.values(content.backgrounds);

    expect(backgrounds.filter((it) => it.owner === 'hero')).toHaveLength(8);
    expect(backgrounds.filter((it) => it.owner === 'guild')).toHaveLength(4);
    expect(Object.values(content.spheres).map((it) => it.name)).toEqual([
      'Crown',
      'Church',
      'Merchants',
      'Villages',
      'Scholars',
      'Underworld',
    ]);
  });

  test('has name lists of the sizes INPUTS 3.9 asks for', () => {
    expect(content.names.given.female.length).toBeGreaterThanOrEqual(55);
    expect(content.names.given.male.length).toBeGreaterThanOrEqual(55);
    expect(content.names.family.length).toBeGreaterThanOrEqual(55);
    expect(content.names.guild.length).toBeGreaterThanOrEqual(25);
    expect(content.names.patron.length).toBeGreaterThan(0);
  });

  describe('Quest templates (M2-S3)', () => {
    const templates = Object.values(content.questTemplates);

    test('are twelve, two for each Sphere', () => {
      expect(templates).toHaveLength(12);
      for (const sphereKey of Object.keys(content.spheres)) {
        expect(templates.filter((it) => it.sphereKeys.includes(sphereKey)), sphereKey).toHaveLength(2);
      }
    });

    test('each weigh demands on Hero Stats summing to 1, and name Skills from skills.json', () => {
      for (const it of templates) {
        const sum = it.demands.reduce((total, [, weight]) => total + weight, 0);
        expect(sum, it.key).toBeCloseTo(1, 6);
        for (const [statKey] of it.demands) expect(content.stats[statKey]?.owner, it.key).toBe('hero');
        expect(it.skillKeys.length, it.key).toBeGreaterThan(0);
        for (const skillKey of it.skillKeys) expect(content.skills[skillKey], it.key).toBeDefined();
      }
    });

    // The ranges are content, not rules: the templates hold them (DL-25).
    test('keep to INPUTS 4.2 and 4.3: 2 to 10 Days, a reward of 40 to 400, Fame 1 to 5, difficulty 10 to 100', () => {
      for (const it of templates) {
        expect(it.durationDaysMin, it.key).toBeGreaterThanOrEqual(2);
        expect(it.durationDaysMax, it.key).toBeLessThanOrEqual(10);
        expect(it.difficultyMin, it.key).toBeGreaterThanOrEqual(10);
        expect(it.difficultyMax, it.key).toBeLessThanOrEqual(100);
        expect(Math.round(it.difficultyMin * it.rewardPerDifficulty), it.key).toBeGreaterThanOrEqual(40);
        expect(Math.round(it.difficultyMax * it.rewardPerDifficulty), it.key).toBeLessThanOrEqual(400);
        expect(it.fameEffect, it.key).toBeGreaterThanOrEqual(1);
        expect(it.fameEffect, it.key).toBeLessThanOrEqual(5);
      }
    });

    test('ask for a Party the starting Roster of four can field, a few with a Class or Skill required', () => {
      for (const it of templates) expect(it.partySizeMin, it.key).toBeLessThanOrEqual(4);
      const requiring = templates.filter(
        (it) => it.requires.classKey !== undefined || it.requires.skillKey !== undefined,
      );
      expect(requiring.length).toBeGreaterThan(0);
      expect(requiring.length).toBeLessThan(templates.length / 2);
    });

    test('are drawn with 2 to 5 Encounters by difficulty (INPUTS 6.1), of kinds content has Encounters of (M4-S1)', () => {
      const kinds = new Set(Object.values(content.encounters).map((it) => it.kind));
      for (const it of templates) {
        expect(it.encountersMin, it.key).toBeGreaterThanOrEqual(2);
        expect(it.encountersMax, it.key).toBeLessThanOrEqual(5);
        expect(it.encountersMin, it.key).toBeLessThanOrEqual(it.encountersMax);
        expect(it.encounterKinds.length, it.key).toBeGreaterThan(0);
        for (const kind of it.encounterKinds) expect(kinds.has(kind), `${it.key} ${kind}`).toBe(true);
      }
      // The hardest templates are the longest: a count never falls as a template's difficulty rises.
      const byDifficulty = [...templates].sort((a, b) => a.difficultyMax - b.difficultyMax);
      expect(byDifficulty.at(-1)?.encountersMax).toBe(5);
      expect(byDifficulty[0]?.encountersMin).toBe(2);
    });
  });

  // M4-S1's third box.
  describe('Encounters (M4-S1)', () => {
    const encounters = Object.values(content.encounters);
    // The engine's union, written out: content imports only types from the engine (ADR-0006).
    const encounterKinds = ['combat', 'travel', 'social', 'arcane', 'stealth'] as const satisfies readonly EncounterKind[];

    test('are twelve, at least two of each kind', () => {
      expect(encounters).toHaveLength(12);
      for (const kind of encounterKinds) {
        expect(encounters.filter((it) => it.kind === kind).length, kind).toBeGreaterThanOrEqual(2);
      }
    });

    test('each weigh demands on Hero Stats summing to 1, name Skills from skills.json, and harm only on a failure', () => {
      for (const it of encounters) {
        const sum = it.demands.reduce((total, [, weight]) => total + weight, 0);
        expect(sum, it.key).toBeCloseTo(1, 6);
        for (const [statKey] of it.demands) expect(content.stats[statKey]?.owner, it.key).toBe('hero');
        for (const skillKey of it.skillKeys) expect(content.skills[skillKey], it.key).toBeDefined();
        expect(it.difficultyFactor, it.key).toBeGreaterThan(0);
        const harm = it.consequences.success.filter((consequence) => consequence.kind === 'injury' || consequence.kind === 'death');
        expect(harm, it.key).toEqual([]);
        for (const consequence of it.consequences.failure) {
          if (consequence.kind === 'injury') expect(content.injuries[consequence.typeKey], it.key).toBeDefined();
        }
      }
    });

    test('use both aggregates and every kind of consequence', () => {
      expect(new Set(encounters.map((it) => it.aggregate))).toEqual(new Set(['best', 'sum']));
      const used = new Set(
        encounters.flatMap((it) => [...it.consequences.success, ...it.consequences.failure].map((consequence) => consequence.kind)),
      );
      expect(used).toEqual(new Set(['injury', 'death', 'morale', 'regard', 'xp', 'wealth', 'fame']));
    });
  });

  // INPUTS 6.4: six starter Synergies, among them Warrior + Healer, Rogue + Mage and three Warriors.
  describe('Synergies (M4-S3)', () => {
    const synergies = Object.values(content.synergies);

    test('are six, among them Warrior + Healer, Rogue + Mage and three Warriors (INPUTS 6.4)', () => {
      expect(synergies).toHaveLength(6);
      const byClasses = synergies.map((it) => it.requires.classes);
      expect(byClasses).toContainEqual({ warrior: 1, healer: 1 });
      expect(byClasses).toContainEqual({ rogue: 1, mage: 1 });
      expect(byClasses).toContainEqual({ warrior: 3 });
      for (const it of synergies) expect(it.name.length, it.key).toBeGreaterThan(0);
    });

    test('require Classes or Skills content has, add a flat or a factor, some on named kinds and some on every kind', () => {
      for (const it of synergies) {
        for (const classKey of Object.keys(it.requires.classes ?? {})) expect(content.classes[classKey], it.key).toBeDefined();
        for (const skillKey of it.requires.skills ?? []) expect(content.skills[skillKey], it.key).toBeDefined();
      }
      expect(synergies.some((it) => (it.requires.skills ?? []).length > 0)).toBe(true);
      expect(synergies.some((it) => it.bonus.flat !== undefined)).toBe(true);
      expect(synergies.some((it) => it.bonus.factor !== undefined)).toBe(true);
      expect(synergies.some((it) => it.kinds === undefined)).toBe(true);
      expect(synergies.some((it) => it.kinds !== undefined)).toBe(true);
    });
  });

  // M5-S1: twenty to start, nine gear three a slot at three grades, six consumables, five unique gear
  // as Loot only (DL-48).
  describe('Item definitions (M5-S1)', () => {
    const items = Object.values(content.items);
    const gear = items.filter((it) => it.kind === 'gear');
    const consumables = items.filter((it) => it.kind === 'consumable');
    const grades = ['plain', 'fine', 'masterwork'];

    test('are twenty: nine common gear, six consumables and five unique gear', () => {
      expect(items).toHaveLength(20);
      expect(gear.filter((it) => !it.unique)).toHaveLength(9);
      expect(consumables).toHaveLength(6);
      expect(gear.filter((it) => it.unique)).toHaveLength(5);
      for (const it of items) expect(it.name.length, it.key).toBeGreaterThan(0);
    });

    test('hold three common gear to each slot, one of each grade, dearer and stronger by grade (INPUTS 7.1)', () => {
      for (const slot of ['weapon', 'armour', 'trinket'] as const) {
        const line = gear
          .filter((it) => !it.unique && it.slot === slot)
          .sort((a, b) => grades.indexOf(a.tags[0] ?? '') - grades.indexOf(b.tags[0] ?? ''));
        const strength = line.map((it) => Object.values(it.statModifiers).reduce((sum, delta) => sum + delta, 0));
        const prices = line.map((it) => it.buyPrice ?? 0);

        expect(line.map((it) => it.tags), slot).toEqual(grades.map((grade) => [grade]));
        expect(strength, slot).toEqual([...strength].sort((a, b) => a - b));
        expect(new Set(strength).size, slot).toBe(3);
        expect(prices, slot).toEqual([...prices].sort((a, b) => a - b));
        expect(new Set(prices).size, slot).toBe(3);
      }
    });

    test('give gear modifiers on Hero Stats, and every common Item a price', () => {
      for (const it of gear) {
        for (const statKey of Object.keys(it.statModifiers)) expect(content.stats[statKey]?.owner, it.key).toBe('hero');
      }
      for (const it of items.filter((item) => !item.unique)) expect(it.buyPrice, it.key).toBeGreaterThan(0);
    });

    test('make the unique gear Loot only, among them one of each slot', () => {
      const unique = gear.filter((it) => it.unique);
      for (const it of unique) expect(it.buyPrice, it.key).toBeNull();
      expect(new Set(unique.map((it) => it.slot))).toEqual(new Set(['weapon', 'armour', 'trinket']));
    });

    test('have two consumables of each effect, common, their kinds Encounter kinds content has', () => {
      const kinds = new Set(Object.values(content.encounters).map((it) => it.kind));
      for (const effect of ['reroll', 'bonus', 'heal']) {
        expect(consumables.filter((it) => it.effect.kind === effect), effect).toHaveLength(2);
      }
      for (const it of consumables) {
        expect(it.unique, it.key).toBe(false);
        if (it.effect.kind !== 'heal') for (const kind of it.effect.kinds) expect(kinds.has(kind), `${it.key} ${kind}`).toBe(true);
      }
    });
  });

  // M5-S5 (DL-52): the templates carry a Loot table chosen by difficulty band (INPUTS 7.4). Which
  // templates carry one agrees with `defaultConfig.lootDifficultyThreshold`, which content cannot
  // read: the harness's creation.test.ts holds that.
  describe('Loot tables (M5-S5)', () => {
    const templates = Object.values(content.questTemplates);
    const tables = Object.values(content.lootTables);

    test('are chosen by difficulty band: a harder template never names a lesser table than an easier one', () => {
      const rank = ['lesser-loot', 'greater-loot'];
      const named = templates
        .filter((it) => it.lootTableKey !== null)
        .sort((a, b) => a.difficultyMin - b.difficultyMin)
        .map((it) => rank.indexOf(it.lootTableKey ?? ''));

      expect(tables.map((it) => it.key).sort()).toEqual([...rank].sort());
      expect(named).not.toContain(-1);
      expect(named).toEqual([...named].sort((a, b) => a - b));
      expect(new Set(named).size).toBe(rank.length);
    });

    test('hold every unique Item between them, and each unique Item one at a time', () => {
      const unique = Object.values(content.items).filter((it) => it.unique).map((it) => it.key);
      const entries = tables.flatMap((it) => it.entries);
      const awarded = new Set(entries.filter((it) => unique.includes(it.definitionKey)).map((it) => it.definitionKey));

      expect([...awarded].sort()).toEqual([...unique].sort());
      for (const it of entries.filter((entry) => unique.includes(entry.definitionKey))) {
        expect([it.quantityMin, it.quantityMax], it.definitionKey).toEqual([1, 1]);
      }
    });
  });

  describe('Injury types (M2-S5)', () => {
    const types = Object.values(content.injuries);

    test('are a few, healing in 5 to 30 Days (INPUTS 4.5)', () => {
      expect(types.length).toBeGreaterThanOrEqual(3);
      for (const it of types) {
        expect(it.healDaysMin, it.key).toBeGreaterThanOrEqual(5);
        expect(it.healDaysMax, it.key).toBeLessThanOrEqual(30);
        expect(it.healDaysMin, it.key).toBeLessThanOrEqual(it.healDaysMax);
      }
    });

    test('leave a Hero Trait or none, and between them leave every Hero Trait', () => {
      const left = types.flatMap((it) => (it.leavesTrait === null ? [] : [it.leavesTrait]));
      const heroTraits = Object.values(content.traits).filter((trait) => trait.owner === 'hero');

      expect(types.some((it) => it.leavesTrait === null)).toBe(true);
      expect([...new Set(left)].sort()).toEqual(heroTraits.map((trait) => trait.key).sort());
    });
  });

  test('validates', () => {
    expect(validateContent(structuredClone(content))).toEqual(content);
  });
});

describe('the pure entry and the Node entry', () => {
  test('return deep-equal sets for the same files', () => {
    const files = Object.fromEntries(
      contentFiles.map((name) => [name, readFileSync(join(contentDir, name), 'utf8')]),
    );

    expect(parseContent(files)).toEqual(loadContent(contentDir));
  });

  test('ignore files that are not content, as a glob of the directory would include', () => {
    const files = Object.fromEntries(
      [...contentFiles, 'package.json', 'tsconfig.json'].map((name) => [
        name,
        readFileSync(join(contentDir, name), 'utf8'),
      ]),
    );

    expect(parseContent(files)).toEqual(loadContent());
  });
});

// Content keys must not drift from the vocabulary (M1 risks): every Stat in stats.json is named
// in CONTEXT.md's Stat entry, in the same area, and the entry names no Stat that content lacks.
describe("CONTEXT.md's Stat entry", () => {
  const context = readFileSync(join(contentDir, '..', 'CONTEXT.md'), 'utf8');
  const entry = /^\*\*Stat\*\*:\r?\n([\s\S]*?)\r?\n_Avoid_/m.exec(context)?.[1]?.replace(/\s+/g, ' ');
  const content = loadContent();
  const namesOf = (owner: string, area?: StatArea) =>
    Object.values(content.stats)
      .filter((stat) => stat.owner === owner && (area === undefined || stat.area === area))
      .map((stat) => stat.name);

  test('exists', () => {
    expect(entry).toBeDefined();
  });

  test('names every Stat in stats.json verbatim', () => {
    for (const stat of Object.values(content.stats)) {
      expect(entry, stat.name).toMatch(new RegExp(`\\b${stat.name}\\b`));
    }
  });

  test.each([
    ['Physical', 'physical'],
    ['Mental', 'mental'],
    ['Magical', 'magical'],
    ['Social', 'social'],
  ] as const)('lists the %s Hero Stats that stats.json has', (label, area) => {
    const listed = new RegExp(`${label} \\(([^)]*)\\)`).exec(entry ?? '')?.[1]?.split(/,\s*|\s+and\s+/);

    expect(listed).toEqual(namesOf('hero', area));
  });

  test("lists the Guildmaster's Stats that stats.json has", () => {
    const listed = /A Guildmaster's: ([^.]*)\./.exec(entry ?? '')?.[1]?.split(/,\s*/);

    expect(listed).toEqual(namesOf('guildmaster'));
  });
});
