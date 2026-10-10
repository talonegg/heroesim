import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encounterKinds, facilityKeys, gearSlotKeys, type GuildmasterTraitEffect, type StatArea } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { contentSources, parseContent } from './index.js';
import { contentDir, loadContent, readContentDir, readSource } from './node.js';

// The core content set as the Node entry loads it from this package's directory.

describe('loadContent()', () => {
  const content = loadContent();
  const stats = Object.values(content.stats);
  const heroStats = stats.filter((stat) => stat.owner === 'hero');
  /** A Guildmaster Trait's effect that helps the Guild: DL-100 item 3's buff. */
  const buff = (effect: GuildmasterTraitEffect): boolean => (effect.kind === 'upkeepFactor' ? effect.factor < 1 : effect.delta > 0);

  // The content version is data, `version.json` (DL-186 item 14): the tools raise it there,
  // and this test reads its changelog, pinning no number of its own.
  test('has a changelog whose last line says why the content version was last raised', () => {
    const file = JSON.parse(readFileSync(join(contentDir, 'version.json'), 'utf8')) as { changelog: string[] };
    expect(file.changelog.at(-1)).toMatch(new RegExp(`^${content.version} from `));
  });

  test("gives each Patron's name a sex, and both sexes are among them (DL-125 item 5)", () => {
    const sexes = new Set(content.names.patron.map((patron) => patron.sex));
    expect(content.names.patron.every((patron) => patron.sex === 'female' || patron.sex === 'male')).toBe(true);
    expect([...sexes].sort()).toEqual(['female', 'male']);
  });

  describe("what a Guildmaster's descriptive Attributes are written from (DL-125 item 6)", () => {
    const { descriptions } = content;
    const bands = descriptions.ageBands.map((band) => band.key);
    const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild').map((row) => row.key);
    const guildmasterTraits = Object.keys(content.guildmasterTraits);

    test('has at least thirty Birthplaces', () => {
      expect(descriptions.birthplaces.length).toBeGreaterThanOrEqual(30);
    });

    test('has several phrases for every slot of every sex and band, and several sentences for every part, Background and Trait', () => {
      for (const sex of ['female', 'male'] as const) {
        for (const band of bands) {
          const phrases = descriptions.appearance[sex][band];
          const slots = sex === 'male' ? ['build', 'face', 'hair', 'facialHair', 'eyes', 'mark', 'bearing'] : ['build', 'face', 'hair', 'eyes', 'mark', 'bearing'];
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

    test("has a sentence at least for every Station, Calling at every band, Temper, Hero Background, Class at every band and Hero Trait, and a Hero's closing for every band", () => {
      const { stationOrigins, callingCareers, temperClosings } = descriptions.biography;
      const hero = descriptions.heroBiography;
      const heroBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'hero').map((row) => row.key);
      const heroTraits = Object.keys(content.heroTraits);
      const lists: [string, string[] | undefined][] = [
        ...descriptions.stations.map((key): [string, string[] | undefined] => [`stationOrigins.${key}`, stationOrigins[key]]),
        ...Object.keys(descriptions.callings).flatMap((key) =>
          bands.map((band): [string, string[] | undefined] => [`callingCareers.${key}.${band}`, callingCareers[key]?.[band]]),
        ),
        ...descriptions.tempers.map((key): [string, string[] | undefined] => [`temperClosings.${key}`, temperClosings[key]]),
        ...heroBackgrounds.map((key): [string, string[] | undefined] => [`heroBiography.backgrounds.${key}`, hero.backgrounds[key]]),
        ...Object.keys(content.classes).flatMap((key) =>
          bands.map((band): [string, string[] | undefined] => [`heroBiography.classes.${key}.${band}`, hero.classes[key]?.[band]]),
        ),
        ...heroTraits.map((key): [string, string[] | undefined] => [`heroBiography.traits.${key}`, hero.traits[key]]),
        ...bands.map((band): [string, string[] | undefined] => [`heroBiography.closings.${band}`, hero.closings[band]]),
      ];
      for (const [where, list] of lists) expect(list?.length ?? 0, where).toBeGreaterThanOrEqual(1);
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

    // The prose read whole, and what it showed held here.
    const biographySentences = (): string[] => {
      const { origins, careers, backgrounds, traits, closings, successors, stationOrigins, callingCareers, temperClosings } = descriptions.biography;
      const hero = descriptions.heroBiography;
      return [origins, careers, backgrounds, traits, closings, stationOrigins, temperClosings, hero.backgrounds, hero.traits, hero.closings]
        .flatMap((lists) => Object.values(lists).flat())
        .concat(successors)
        .concat([callingCareers, hero.classes].flatMap((byKey) => Object.values(byKey).flatMap((byBand) => Object.values(byBand).flat())));
    };

    test("gives a successor sentences of coming to the Guild's chair, none of founding it", () => {
      for (const sentence of descriptions.biography.successors) expect(sentence, sentence).not.toMatch(/\bfound(ed|ing|er)?\b|own making/i);
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
        ...Object.values(descriptions.biography.callingCareers).flatMap((byBand) => byBand.older ?? []),
      ];
      expect(older.filter((text) => /\bwhite\b|lifetime|longer ago|stepping down|with age|old paper/i.test(text))).toEqual([]);
    });

    // The verification of the review's fixes: what the prose, read again, showed.
    test("leaves the hair to the Appearance, so no Biography says it will turn grey beside an Appearance that says it has", () => {
      const hair = biographySentences().filter((sentence) => /\bhair\b|\bgr[ae]y(ing|s|ed)?\b|\bbald/i.test(sentence));
      expect(hair).toEqual([]);
      // The middle band's Appearance can grey, which is why.
      const middle = Object.values(descriptions.appearance).flatMap((byBand) => [...(byBand.middle?.hair ?? []), ...(byBand.middle?.facialHair ?? [])]);
      expect(middle.some((phrase) => /\bgrey\b/i.test(phrase))).toBe(true);
    });

    test('gives a thrifty Guildmaster and a miser, who may be one Guildmaster, sentences that never both speak of money', () => {
      const money = /\b(money|coins?|coppers?|pennies|penny|silver|gold)\b/i;
      const { thrifty = [], miser = [] } = descriptions.biography.traits;
      const pairs = thrifty.flatMap((one) => miser.map((other) => [one, other])).filter(([one = '', other = '']) => money.test(one) && money.test(other));
      expect(pairs).toEqual([]);
      expect(content.guildmasterTraits.thrifty?.excludes).not.toContain('miser');
      expect(content.guildmasterTraits.miser?.excludes).not.toContain('thrifty');
    });

    test("writes each Guildmaster Trait's sentences for any age, so a young career and a Trait never disagree", () => {
      const traits = Object.values(descriptions.biography.traits).flat();
      expect(traits.filter((sentence) => /\byears\b|\bold (company|days)\b|long ago/i.test(sentence))).toEqual([]);
    });

  });

  // The Traits are the owner's to add, change and remove through the content editor (DL-150 items 7
  // to 12), so these tests hold the rules a Trait keeps, not the Traits shipped (DL-163);
  // the content's checks hold the rest, an exclusion both ways among them.
  test("costs a Guildmaster Trait as DL-100 item 3 says: a buff costs, and a penalty refunds", () => {
    const traits = Object.values(content.guildmasterTraits);
    expect(traits.length).toBeGreaterThan(0);
    for (const trait of traits) {
      const effects = trait.effects.map(buff);
      if (effects.length > 0 && effects.every(Boolean)) expect(trait.cost, trait.key).toBeGreaterThan(0);
      if (effects.length > 0 && !effects.some(Boolean)) expect(trait.cost, trait.key).toBeLessThan(0);
    }
  });

  test('costs more for each grade of a Hall facility (INPUTS 7.3)', () => {
    const improvements = Object.values(content.improvements);
    for (const facility of facilityKeys) {
      const costs = improvements
        .filter((it) => it.facility === facility)
        .sort((a, b) => a.grade - b.grade)
        .map((it) => it.cost);
      expect(costs.length, facility).toBeGreaterThan(1);
      costs.slice(1).forEach((cost, index) => expect(cost, facility).toBeGreaterThan(costs[index] ?? Infinity));
    }
  });

  test('has a Hero Stat in every area', () => {
    const areas: StatArea[] = ['physical', 'mental', 'magical', 'social'];
    for (const area of areas) {
      expect(heroStats.filter((stat) => stat.area === area).length, area).toBeGreaterThan(0);
    }
  });

  test('has every Stat range 1 to 20 (INPUTS 3.6)', () => {
    expect(stats.filter((stat) => stat.min !== 1 || stat.max !== 20)).toEqual([]);
  });

  test('has every Class gate Skills, and no Skill gated by two Classes', () => {
    const classes = Object.values(content.classes);
    const gated = classes.flatMap((it) => it.gatedSkills);

    for (const it of classes) expect(it.gatedSkills.length, it.key).toBeGreaterThan(0);
    expect(new Set(gated).size).toBe(gated.length);
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

  test('has name lists of the sizes INPUTS 3.9 asks for', () => {
    expect(content.names.given.female.length).toBeGreaterThanOrEqual(55);
    expect(content.names.given.male.length).toBeGreaterThanOrEqual(55);
    expect(content.names.family.length).toBeGreaterThanOrEqual(55);
    expect(content.names.guild.length).toBeGreaterThanOrEqual(25);
    expect(content.names.patron.length).toBeGreaterThan(0);
  });

  describe('Quest templates', () => {
    const templates = Object.values(content.questTemplates);

    test('each name one Skill or more', () => {
      for (const it of templates) expect(it.skillKeys.length, it.key).toBeGreaterThan(0);
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

    test('are drawn with 2 to 5 Encounters by difficulty (INPUTS 6.1)', () => {
      for (const it of templates) {
        expect(it.encountersMin, it.key).toBeGreaterThanOrEqual(2);
        expect(it.encountersMax, it.key).toBeLessThanOrEqual(5);
        expect(it.encountersMin, it.key).toBeLessThanOrEqual(it.encountersMax);
      }
    });
  });

  // The Encounters as written from the drafts the owner approved
  // (DL-162, DL-165): each in Checks scored by Queries over the Party, with a pass formula.
  describe('Encounters', () => {
    const encounters = Object.values(content.encounters);
    /** Each Encounter as its file in `encounters/` writes it: the new form. */
    const written = Object.fromEntries(
      Object.entries(readSource(contentDir, 'encounters/')).map(([name, text]) => [name.slice('encounters/'.length, -'.json'.length), JSON.parse(text)]),
    ) as Record<string, { checks: Record<string, unknown>[]; pass?: unknown; consequences: Record<string, unknown[]> }>;
    const finales = new Set(Object.values(content.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [it.finale])));

    // Drawn in their places: every kind has at least two that are no template's Finale (DL-162).
    test('are of every kind, two or more of each that are no Finale', () => {
      const drawn = encounters.filter((it) => !finales.has(it.key));
      for (const kind of encounterKinds) expect(drawn.filter((it) => it.kind === kind).length, kind).toBeGreaterThanOrEqual(2);
    });

    // DL-148 item 22, DL-160: the tags that weight the draw, matched to the templates'.
    test("each has one to three tags, each one some template carries, so that every tag weights some Quest's draw", () => {
      const carried = new Set(Object.values(content.questTemplates).flatMap((it) => it.tags));
      for (const it of encounters) {
        expect(it.tags?.length ?? 0, it.key).toBeGreaterThanOrEqual(1);
        expect(it.tags?.length ?? 0, it.key).toBeLessThanOrEqual(3);
        for (const tag of it.tags ?? []) expect(carried.has(tag), `${it.key}: ${tag}`).toBe(true);
      }
      const tagged = new Set(encounters.flatMap((it) => it.tags ?? []));
      for (const tag of carried) expect(tagged.has(tag), tag).toBe(true);
    });

    test('each is written in two Checks or more, with consequences for all four Degrees', () => {
      for (const it of encounters) {
        const row = written[it.key] ?? expect.fail(it.key);
        expect(row.checks.length, it.key).toBeGreaterThanOrEqual(2);
        expect(Object.keys(row.consequences).sort(), it.key).toEqual(['failure', 'setback', 'success', 'triumph']);
      }
    });

    // DL-165: every Check rolls within the configuration's `checkVariance`; a Check writes its own only
    // where it truly differs from the rest.
    test('each Check rolls within checkVariance: none writes a variance of its own', () => {
      const own = Object.entries(written).flatMap(([key, it]) => it.checks.filter((check) => 'variance' in check).map((check) => `${key}/${String(check.key)}`));
      expect(own).toEqual([]);
    });

    test('harm only on a Setback or a Failure, each Injury of a type content has', () => {
      for (const it of encounters) {
        const { success, triumph = [], setback = [], failure } = it.consequences;
        const harm = [...success, ...triumph].filter((consequence) => consequence.kind === 'injury' || consequence.kind === 'death');
        expect(harm, it.key).toEqual([]);
        for (const consequence of [...setback, ...failure]) {
          if (consequence.kind === 'injury') expect(content.injuries[consequence.typeKey], it.key).toBeDefined();
        }
      }
    });

    test('use every kind of consequence Encounters once used', () => {
      const used = new Set(encounters.flatMap((it) => Object.values(it.consequences).flatMap((list) => (list ?? []).map((consequence) => consequence.kind))));
      expect([...used]).toEqual(expect.arrayContaining(['injury', 'death', 'morale', 'regard', 'xp', 'wealth', 'fame']));
    });

    /**
     * The Hero Stats a Check's score adds, as the calibration's coverage grid counts them (DL-162): a
     * Stat read as a value, in a sum, an aggregate, a weighting or a ranking, and not one that only
     * chooses a Hero, filters a Set or orders it ("Wits of the Hero with the lowest Dexterity" adds Wits).
     */
    function statsAdded(query: unknown): string[] {
      if (!Array.isArray(query)) return [];
      const [operator, ...operands] = query as [unknown, ...unknown[]];
      if (operator === 'stat') return [String(operands[0])];
      if (operator === 'weighted') return (operands[0] as [string, number][]).filter(([, weight]) => weight !== 0).map(([statKey]) => statKey);
      if (operator === 'max' || operator === 'min' || operator === 'sum' || operator === 'avg' || operator === 'ranked' || operator === 'of') return statsAdded(operands[1]);
      if (operator === '+' || operator === '-' || operator === '*' || operator === 'least' || operator === 'greatest') return operands.flatMap(statsAdded);
      return [];
    }

    // Coverage (DL-148 item 21, the epic's gate): no Hero Stat goes unread by the Quests.
    test('read every Hero Stat by three Checks at least, across two kinds at least', () => {
      const short = heroStats.flatMap((stat) => {
        const kinds = encounters.flatMap((it) => it.checks.filter((check) => statsAdded(check.score).includes(stat.key)).map(() => it.kind));
        return kinds.length >= 3 && new Set(kinds).size >= 2 ? [] : [`${stat.key}: ${kinds.length} Checks across ${new Set(kinds).size} kinds`];
      });
      expect(short).toEqual([]);
    });

    test('count, for the coverage, a Stat a score adds, and not one that only chooses the Hero or the Set', () => {
      expect(statsAdded(['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']])).toEqual(['wits']);
      expect(statsAdded(['sum', ['top', 'party', 3, ['stat', 'constitution']], ['weighted', [['strength', 0.5], ['wits', 0]]]])).toEqual(['strength']);
      expect(statsAdded(['+', ['*', 0.5, ['max', ['where', 'party', ['class', 'mage']], ['stat', 'arcana']]], ['count', 'party']])).toEqual(['arcana']);
      expect(statsAdded(['ranked', 'party', ['+', ['stat', 'courage'], ['stat', 'willpower']], [1, 0.5]])).toEqual(['courage', 'willpower']);
    });
  });

  // INPUTS 6.4: starter Synergies, among them Warrior + Healer, Rogue + Mage and three Warriors;
  // they are Queries over the Party, and some read Stats and Levels (DL-162).
  describe('Synergies', () => {
    const synergies = Object.values(content.synergies);
    const classCount = (classKey: string, count: number) => ['>=', ['count', ['where', 'party', ['class', classKey]]], count];

    test('include Warrior + Healer, Rogue + Mage and three Warriors (INPUTS 6.4)', () => {
      const requirements = synergies.map((it) => it.requires);
      expect(requirements).toContainEqual([classCount('warrior', 1), classCount('healer', 1)]);
      expect(requirements).toContainEqual([classCount('rogue', 1), classCount('mage', 1)]);
      expect(requirements).toContainEqual([classCount('warrior', 3)]);
    });

    test('read Classes, Skills, Stats and Levels, add a flat or a factor, some on named kinds and some on every kind', () => {
      const read = JSON.stringify(synergies.map((it) => it.requires));
      for (const reads of ['"class"', '"skill"', '"stat"', '"level"']) expect(read, reads).toContain(reads);
      expect(synergies.some((it) => it.bonus.flat !== undefined)).toBe(true);
      expect(synergies.some((it) => it.bonus.factor !== undefined)).toBe(true);
      expect(synergies.some((it) => it.kinds === undefined)).toBe(true);
      expect(synergies.some((it) => it.kinds !== undefined)).toBe(true);
    });
  });

  // Gear three a slot at three grades, consumables, unique gear as Loot only (DL-48), and
  // trinkets for the Mental and Social Stats (DL-162).
  describe('Item definitions', () => {
    const items = Object.values(content.items);
    const gear = items.filter((it) => it.kind === 'gear');
    const consumables = items.filter((it) => it.kind === 'consumable');
    const grades = ['plain', 'fine', 'masterwork'];
    /** The trinkets for the Mental and Social Stats, beside each slot's line of three. */
    const mentalAndSocial = ['commonplace-book', 'reading-glass', 'signet-ring', 'officers-sash', 'courtiers-brooch', 'scholars-almanac'];
    const lines = gear.filter((it) => !it.unique && !mentalAndSocial.includes(it.key));

    test('hold a line of three common gear to each slot, one of each grade, dearer and stronger by grade (INPUTS 7.1)', () => {
      for (const slot of gearSlotKeys) {
        const line = lines
          .filter((it) => it.slot === slot)
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

    // DL-162's verification, item 1: the automatic buyer takes the dearest piece a slot's Wealth covers,
    // so a new piece cheaper than its grade's core trinket never takes its place, and none ties a price.
    test('hold six trinkets for the Mental and Social Stats, each a little cheaper than the core trinket of its grade', () => {
      const core = new Map(lines.filter((it) => it.slot === 'trinket').map((it) => [it.tags[0], it.buyPrice ?? 0]));
      const prices = new Set(lines.map((it) => it.buyPrice));
      for (const key of mentalAndSocial) {
        const it = gear.find((each) => each.key === key) ?? expect.fail(key);
        expect(it.slot, key).toBe('trinket');
        expect(it.unique, key).toBe(false);
        for (const statKey of Object.keys(it.statModifiers)) expect(['mental', 'social'], `${key} ${statKey}`).toContain(content.stats[statKey]?.area);
        expect(it.buyPrice ?? 0, key).toBeLessThan(core.get(it.tags[0]) ?? 0);
        expect(prices.has(it.buyPrice), key).toBe(false);
      }
    });

    test('give every common Item a price', () => {
      for (const it of items.filter((item) => !item.unique)) expect(it.buyPrice, it.key).toBeGreaterThan(0);
    });

    test('make the unique gear Loot only, among them one of each slot', () => {
      const unique = gear.filter((it) => it.unique);
      for (const it of unique) expect(it.buyPrice, it.key).toBeNull();
      expect(new Set(unique.map((it) => it.slot))).toEqual(new Set(gearSlotKeys));
    });

    test('have a consumable of each effect, their kinds Encounter kinds content has', () => {
      const kinds = new Set(Object.values(content.encounters).map((it) => it.kind));
      for (const effect of ['reroll', 'bonus', 'heal']) {
        expect(consumables.filter((it) => it.effect.kind === effect).length, effect).toBeGreaterThan(0);
      }
      for (const it of consumables) {
        if (it.effect.kind !== 'heal') for (const kind of it.effect.kinds) expect(kinds.has(kind), `${it.key} ${kind}`).toBe(true);
      }
    });
  });

  // DL-52: the templates carry a Loot table chosen by difficulty band (INPUTS 7.4). Which
  // templates carry one agrees with `defaultConfig.lootDifficultyThreshold`, which content cannot
  // read: the harness's creation.test.ts holds that.
  describe('Loot tables', () => {
    const templates = Object.values(content.questTemplates);
    const tables = Object.values(content.lootTables);

    test('are chosen by difficulty band: a harder template never names a lesser table than an easier one', () => {
      // A table's rank is the mean worth of what one roll awards: its entries' quantity times price.
      const worth = (table: (typeof tables)[number]): number => {
        const total = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
        const value = table.entries.reduce(
          (sum, entry) => sum + entry.weight * ((entry.quantityMin + entry.quantityMax) / 2) * (content.items[entry.definitionKey]?.buyPrice ?? 0),
          0,
        );
        return value / total;
      };
      const rank = [...tables].sort((a, b) => worth(a) - worth(b)).map((it) => it.key);
      const named = templates
        .filter((it) => it.lootTableKey !== null)
        .sort((a, b) => a.difficultyMin - b.difficultyMin)
        .map((it) => rank.indexOf(it.lootTableKey ?? ''));

      expect(rank.length).toBeGreaterThan(1);
      expect(named).not.toContain(-1);
      expect(named).toEqual([...named].sort((a, b) => a - b));
      expect(new Set(named).size).toBe(rank.length);
    });

    test('hold every unique Item between them', () => {
      const unique = Object.values(content.items).filter((it) => it.unique).map((it) => it.key);
      const entries = tables.flatMap((it) => it.entries);
      const awarded = new Set(entries.filter((it) => unique.includes(it.definitionKey)).map((it) => it.definitionKey));

      expect([...awarded].sort()).toEqual([...unique].sort());
    });
  });

  describe('Injury types', () => {
    const types = Object.values(content.injuries);

    test('are a few, healing in 5 to 30 Days (INPUTS 4.5)', () => {
      expect(types.length).toBeGreaterThanOrEqual(3);
      for (const it of types) {
        expect(it.healDaysMin, it.key).toBeGreaterThanOrEqual(5);
        expect(it.healDaysMax, it.key).toBeLessThanOrEqual(30);
        expect(it.healDaysMin, it.key).toBeLessThanOrEqual(it.healDaysMax);
      }
    });

    // A Trait earned on a Quest is left by no Injury (DL-148 item 25), so not every Hero Trait is one.
    test('leave a Hero Trait or none, some none', () => {
      expect(types.some((it) => it.leavesTrait === null)).toBe(true);
    });
  });

});

describe('the pure entry and the Node entry', () => {
  test('ignore files that are not content, as a glob of the directory would include', () => {
    const files = {
      ...readContentDir(),
      ...Object.fromEntries(['package.json', 'tsconfig.json'].map((name) => [name, readFileSync(join(contentDir, name), 'utf8')])),
      'src/kinds/rows.json': '{ "not": "content" }',
      'items/nested/short-sword.json': '{ "not": "a row" }',
    };

    expect(parseContent(files)).toEqual(loadContent());
  });
});

// DL-260: Quest templates, Encounters, Items and Loot tables are each a folder of one file a row,
// named by its key, and the rest one file each, as each kind declares.
describe('the content directory', () => {
  test('holds the four folders and the other kinds as one file each', () => {
    expect(contentSources.filter((source) => source.endsWith('/'))).toEqual(['quest-templates/', 'encounters/', 'items/', 'loot-tables/']);
    for (const source of contentSources) expect(existsSync(join(contentDir, source)), source).toBe(true);
    for (const source of ['quest-templates', 'encounters', 'items', 'loot-tables']) expect(existsSync(join(contentDir, `${source}.json`)), source).toBe(false);
  });

  test("reads each folder's rows from their own files, named by their keys, in key order", () => {
    const content = loadContent();
    for (const [place, source] of [['questTemplates', 'quest-templates/'], ['encounters', 'encounters/'], ['items', 'items/'], ['lootTables', 'loot-tables/']] as const) {
      const keys = Object.keys(readSource(contentDir, source)).map((name) => name.slice(source.length, -'.json'.length));
      expect(Object.keys(content[place]), place).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(keys.length, place).toBeGreaterThan(0);
    }
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
