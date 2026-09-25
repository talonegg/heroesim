import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StatArea } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { contentFiles, parseContent, validateContent } from './index.js';
import { contentDir, loadContent } from './node.js';

// The core content set as the Node entry loads it from this package's directory (M1-S4).

describe('loadContent()', () => {
  const content = loadContent();
  const stats = Object.values(content.stats);
  const heroStats = stats.filter((stat) => stat.owner === 'hero');
  const guildmasterStats = stats.filter((stat) => stat.owner === 'guildmaster');

  test('is the core content set, version 4 since the Injury types (M2-S5) followed the Dispositions (M2-S9)', () => {
    expect(content.id).toBe('core');
    expect(content.version).toBe(4);
  });

  test("has one Disposition, M2's steady (INPUTS 4.12)", () => {
    expect(content.dispositions).toEqual({ steady: { key: 'steady', name: 'Steady' } });
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

  test('has six Guildmaster Traits and some Hero Traits, none with an effect yet', () => {
    const traits = Object.values(content.traits);

    expect(traits.filter((trait) => trait.owner === 'guildmaster')).toHaveLength(6);
    expect(traits.filter((trait) => trait.owner === 'hero').length).toBeGreaterThan(0);
    for (const trait of traits) expect(trait.effect).toBeNull();
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
        expect(it.lootTableKey).toBeNull();
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
