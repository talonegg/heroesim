import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EncounterKind, StatArea, TraitEffect } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { contentFiles, descriptionBounds, longestDescriptions, parseContent, validateContent } from './index.js';
import { contentDir, loadContent } from './node.js';

// The core content set as the Node entry loads it from this package's directory (M1-S4).

describe('loadContent()', () => {
  const content = loadContent();
  const stats = Object.values(content.stats);
  const heroStats = stats.filter((stat) => stat.owner === 'hero');
  const guildmasterStats = stats.filter((stat) => stat.owner === 'guildmaster');

  test("is the core content set, version 16 since v1.1.2-S3's Portraits and Patrons' sexes (DL-130), which v1.1.2-S4's pictures and v1.1.2-S5's descriptions keep (DL-131, DL-132)", () => {
    expect(content.id).toBe('core');
    expect(content.version).toBe(16);
  });

  test("gives each Patron's name its sex, in the order the names had: 16 male and 14 female, Jocelyn female (DL-125 item 5)", () => {
    const patrons = content.names.patron;
    expect(patrons.map((patron) => patron.name)).toEqual([
      'Aldous Fairweather', 'Berengar Holt', 'Cecily Ashdown', 'Denholm Crane', 'Edith Marlow', 'Florian Keld',
      'Godwin Harrow', 'Hawise Brennard', 'Isolde Varney', 'Jocelyn Pike', 'Lambert Sowerby', 'Mabel Thorne',
      'Nicolas Aske', 'Orabel Quint', 'Piers Latimer', 'Rohesia Dunmore', 'Simeon Garrow', 'Petronel Swift',
      'Walter Moorby', 'Agnes Wolstan', 'Baldwin Cressy', 'Emmeline Stake', 'Geoffrey Brand', 'Juliana Cray',
      'Hamo Redvers', 'Letice Gorham', 'Ranulf Tarrant', 'Sybil Hawtrey', 'Tobias Wendle', 'Ysmay Carew',
    ]);
    const female = patrons.filter((patron) => patron.sex === 'female').map((patron) => patron.name.split(' ')[0]);
    const male = patrons.filter((patron) => patron.sex === 'male').map((patron) => patron.name.split(' ')[0]);
    expect(female).toEqual([
      'Cecily', 'Edith', 'Hawise', 'Isolde', 'Jocelyn', 'Mabel', 'Orabel', 'Rohesia', 'Agnes', 'Emmeline', 'Juliana',
      'Letice', 'Sybil', 'Ysmay',
    ]);
    expect(male).toHaveLength(16);
  });

  test("lists the pictures by role and sex: the owner's two Guildmasters since v1.1.2-S4, and no Hero's or Patron's (DL-125 items 3, 4 and 12)", () => {
    expect(content.portraits).toEqual({
      guildmaster: { female: ['gm-female-01'], male: ['gm-male-01'] },
      hero: { female: [], male: [] },
      patron: { female: [], male: [] },
    });
  });

  test("maps each of the owner's two pictures to DL-127 item 5's keywords and narrative, as written (v1.1.2-S4)", () => {
    const { keywords, portraits } = content.portraitAppearances;
    expect(Object.keys(keywords)).toEqual([
      'weathered', 'scarred', 'strong-boned', 'dark-haired', 'unruly-hair', 'long-hair', 'braided', 'bearded', 'hard-eyed',
      'shadowed-eyes', 'stern', 'composed',
    ]);
    expect(keywords['bearded']).toEqual({ slot: 'facialHair', word: 'bearded' });
    expect(keywords['shadowed-eyes']).toEqual({ slot: 'eyes', word: 'shadowed eyes' });
    expect(Object.keys(portraits)).toEqual(['gm-male-01', 'gm-female-01']);
    expect(portraits['gm-male-01']?.keywords).toEqual(['weathered', 'scarred', 'dark-haired', 'unruly-hair', 'bearded', 'hard-eyed', 'stern']);
    expect(portraits['gm-female-01']?.keywords).toEqual(['strong-boned', 'dark-haired', 'long-hair', 'braided', 'shadowed-eyes', 'composed']);
    expect(portraits['gm-male-01']?.narrative).toMatch(/^A weathered, deeply lined face, .* before a word is spoken\.$/);
    expect(portraits['gm-female-01']?.narrative).toMatch(/^A strong-boned face with high cheekbones .* what she is thinking\.$/);
    // DL-127 item 5 counts them: 243 and 241 characters.
    expect([...(portraits['gm-male-01']?.narrative ?? '')]).toHaveLength(243);
    expect([...(portraits['gm-female-01']?.narrative ?? '')]).toHaveLength(241);
  });

  describe("what a Guildmaster's descriptive Attributes are written from (v1.1.2-S5, DL-125 item 6)", () => {
    const { descriptions } = content;
    const bands = descriptions.ageBands.map((band) => band.key);
    const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild').map((row) => row.key);
    const guildmasterTraits = Object.values(content.traits).filter((row) => row.owner === 'guildmaster').map((row) => row.key);

    test('has three age bands for the Guildmasters of 21 to 50, and at least thirty Birthplaces', () => {
      expect(descriptions.ageBands).toEqual([
        { key: 'young', from: 0 },
        { key: 'middle', from: 31 },
        { key: 'older', from: 41 },
      ]);
      expect(descriptions.birthplaces.length).toBeGreaterThanOrEqual(30);
    });

    test('has several phrases for every slot of every sex and band, and several sentences for every part, Background and Trait', () => {
      for (const sex of ['female', 'male'] as const) {
        for (const band of bands) {
          const phrases = descriptions.appearance[sex][band];
          const slots = sex === 'male' ? ['build', 'face', 'hair', 'facialHair', 'eyes', 'mark', 'bearing'] : ['build', 'face', 'hair', 'eyes', 'mark', 'bearing'];
          expect(Object.keys(phrases ?? {}).sort()).toEqual([...slots].sort());
          for (const slot of slots) expect((phrases as Record<string, string[]>)[slot]?.length, `${sex} ${band} ${slot}`).toBeGreaterThanOrEqual(4);
        }
      }
      for (const part of ['origins', 'careers', 'closings'] as const) {
        for (const band of bands) expect(descriptions.biography[part][band]?.length, `${part} ${band}`).toBeGreaterThanOrEqual(4);
      }
      expect(Object.keys(descriptions.biography.backgrounds).sort()).toEqual([...guildBackgrounds].sort());
      expect(Object.keys(descriptions.biography.traits).sort()).toEqual([...guildmasterTraits].sort());
      expect(descriptions.biography.successors.length).toBeGreaterThanOrEqual(3);
      for (const texts of [...Object.values(descriptions.biography.backgrounds), ...Object.values(descriptions.biography.traits)]) {
        expect(texts.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('proves the longest Birthplace, Appearance and Biography within 60, 280 and 1,000 characters', () => {
      const longest = longestDescriptions(content);
      expect(longest.birthplace).toBeLessThanOrEqual(descriptionBounds.birthplace);
      expect(longest.appearance).toBeLessThanOrEqual(descriptionBounds.appearance);
      expect(longest.biography).toBeLessThanOrEqual(descriptionBounds.biography);
      expect(descriptionBounds).toEqual({ birthplace: 60, appearance: 280, biography: 1000 });
    });

    test('names no clothing, armour, gear or ornament in any Appearance, drawn or mapped (DL-127 item 2)', () => {
      const worn =
        /\b(coats?|cloaks?|capes?|mail|armou?r|leathers?|tunics?|shirts?|dress(es)?|gowns?|robes?|hoods?|hats?|caps?|helms?|helmets?|boots?|belts?|buckles?|straps?|rings?|earrings?|necklaces?|brooch(es)?|clasps?|pins?|chains?|jewels?|satchels?|sashe?s?|gloves?|scarf|scarves|collars?|sleeves?|aprons?|jerkins?|doublets?|bracelets?|ribbons?|circlets?|beads?|torcs?|gear|swords?|blades?|staffs?|sticks?|breeches|trousers|mantles?|cowls?|veils?|shawls?|bonnets?|tabards?|gauntlets?|spectacles|eyepatch(es)?)\b/i;
      const phrases = Object.values(descriptions.appearance).flatMap((byBand) =>
        Object.values(byBand).flatMap((slots) => Object.values(slots).flat()),
      );
      const narratives = Object.values(content.portraitAppearances.portraits).map((row) => row.narrative);
      const naming = [...phrases, ...narratives].filter((text) => worn.test(text));
      expect(naming).toEqual([]);
      expect(phrases.length).toBeGreaterThan(150);
    });

    // v1.1.2-S6, the S5 verification's findings: the prose read whole, and what it showed held here.
    const biographySentences = (): string[] => {
      const { origins, careers, backgrounds, traits, closings, successors } = descriptions.biography;
      return [origins, careers, backgrounds, traits, closings].flatMap((lists) => Object.values(lists).flat()).concat(successors);
    };

    test("gives a successor sentences of coming to the Guild's chair, none of founding it", () => {
      for (const sentence of descriptions.biography.successors) expect(sentence, sentence).not.toMatch(/\bfound(ed|ing|er)?\b|own making/i);
    });

    test('closes every Birthplace in a sentence with a comma or a full stop, since a Birthplace may hold a comma of its own', () => {
      const open = biographySentences().filter((sentence) => /\{birthplace\}(?![,.])/.test(sentence));
      expect(open).toEqual([]);
      expect(descriptions.birthplaces.some((place) => place.includes(','))).toBe(true);
    });

    test("names the Guildmaster only by a slot, so no he, his or her is anyone else's", () => {
      const bare = biographySentences().filter((sentence) => /\b(he|she|him|his|her|hers)\b/i.test(sentence.replace(/\{[^{}]*\}/g, '')));
      expect(bare).toEqual([]);
    });

    test("leaves the eyes to their own slot and freckles to the face, so a mark never says them again", () => {
      for (const byBand of Object.values(descriptions.appearance)) {
        for (const [band, phrases] of Object.entries(byBand)) {
          // A bearing may meet another's eye; a mark is of the body, drawn beside the eyes' own phrase.
          expect(phrases.mark.filter((phrase) => /\beyes?\b/i.test(phrase)), band).toEqual([]);
          if (phrases.face.some((phrase) => /freckl/i.test(phrase))) expect(phrases.mark.filter((phrase) => /freckl/i.test(phrase)), band).toEqual([]);
        }
      }
    });

    test('writes the older band for a Guildmaster of 41 as for one of 50: no white hair, no lifetime behind them, no talk of stepping down', () => {
      const older = [
        ...Object.values(descriptions.appearance).flatMap((byBand) => Object.values(byBand.older ?? {}).flat()),
        ...(['origins', 'careers', 'closings'] as const).flatMap((part) => descriptions.biography[part].older ?? []),
      ];
      expect(older.filter((text) => /\bwhite\b|lifetime|longer ago|stepping down|with age|old paper/i.test(text))).toEqual([]);
    });

    test("writes each Guildmaster Trait's sentences for any age, so a young career and a Trait never disagree", () => {
      const traits = Object.values(descriptions.biography.traits).flat();
      expect(traits.filter((sentence) => /\byears\b|\bold (company|days)\b|long ago/i.test(sentence))).toEqual([]);
    });

    test('writes each standalone text with a capital: every Birthplace, phrase and sentence begins with one', () => {
      const texts = [
        ...descriptions.birthplaces,
        ...Object.values(descriptions.appearance).flatMap((byBand) => Object.values(byBand).flatMap((slots) => Object.values(slots).flat())),
      ];
      for (const text of texts) expect(text, text).toMatch(/^\p{Lu}/u);
    });
  });

  test("gives each Guildmaster Trait DL-100 item 3's cost, a buff costing and a penalty refunding, and its three exclusions both ways; Hero Traits cost 0 and exclude nothing (M9-S2)", () => {
    const costs = Object.fromEntries(
      Object.values(content.traits)
        .filter((trait) => trait.owner === 'guildmaster')
        .map((trait) => [trait.key, trait.cost]),
    );
    expect(costs).toEqual({ 'well-liked': 2, thrifty: 2, 'old-soldier': 1, miser: -2, spendthrift: -2, 'mistrusts-magic': -1 });

    const excludes = Object.fromEntries(Object.values(content.traits).map((trait) => [trait.key, [...trait.excludes].sort()]));
    expect(excludes).toMatchObject({
      thrifty: ['spendthrift'],
      spendthrift: ['miser', 'thrifty'],
      'well-liked': ['miser'],
      miser: ['spendthrift', 'well-liked'],
      'old-soldier': [],
      'mistrusts-magic': [],
    });
    for (const trait of Object.values(content.traits)) {
      if (trait.owner === 'hero') expect([trait.key, trait.cost, trait.excludes]).toEqual([trait.key, 0, []]);
    }
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

  test('has the four named Dispositions (INPUTS 7.5), their weights as the M6 close retuned them (DL-69)', () => {
    const weights = (questRiskAppetite: number, recruitThreshold: number, buildThreshold: number, gearThreshold: number, transferAppetite: number) =>
      ({ questRiskAppetite, recruitThreshold, buildThreshold, gearThreshold, transferAppetite });
    expect(content.dispositions).toEqual({
      // DL-56 set the rows, DL-58 gave reckless a gearThreshold of 3; the M6 close's balance pass
      // (DL-69) moved steady to the middle of the Quests it can staff, every transferAppetite below a
      // third, so that no Rival sells itself below rivalRosterMin, and the hiring and building bars.
      steady: { key: 'steady', name: 'Steady', ...weights(0.5, 60, 12, 3, 0.2) },
      ambitious: { key: 'ambitious', name: 'Ambitious', ...weights(0.7, 45, 1.5, 2, 0.3) },
      miserly: { key: 'miserly', name: 'Miserly', ...weights(0.35, 60, 40, 10, 0.1) },
      reckless: { key: 'reckless', name: 'Reckless', ...weights(1, 30, 4, 3, 0.25) },
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
