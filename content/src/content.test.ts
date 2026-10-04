import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EncounterKind, GuildmasterTraitEffect, StatArea } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { contentFiles, contentWarnings, descriptionBounds, longestDescriptions, parseContent, validateContent } from './index.js';
import { contentDir, loadContent } from './node.js';

// The core content set as the Node entry loads it from this package's directory (M1-S4).

describe('loadContent()', () => {
  const content = loadContent();
  const stats = Object.values(content.stats);
  const heroStats = stats.filter((stat) => stat.owner === 'hero');
  const guildmasterStats = stats.filter((stat) => stat.owner === 'guildmaster');
  /** A Guildmaster Trait's effect that helps the Guild: DL-100 item 3's buff. */
  const buff = (effect: GuildmasterTraitEffect): boolean => (effect.kind === 'upkeepFactor' ? effect.factor < 1 : effect.delta > 0);

  test("is the core content set, at the version its last change raised it to (parse.ts's comment says why)", () => {
    expect(content.id).toBe('core');
    expect(content.version).toBe(32);
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

  test("lists the pictures by role and sex: the owner's two Guildmasters since v1.1.2-S4, 38 more since v1.1.3-S4, and no Hero's or Patron's (DL-125 items 3, 4 and 12)", () => {
    const twenty = (sex: string) => Array.from({ length: 20 }, (_, index) => `gm-${sex}-${String(index + 1).padStart(2, '0')}`);
    expect(content.portraits).toEqual({
      guildmaster: { female: twenty('female'), male: twenty('male') },
      hero: { female: [], male: [] },
      patron: { female: [], male: [] },
    });
  });

  test("gives each of the owner's two pictures DL-134 item 8's row, its narrative as DL-127 item 5 wrote it (v1.1.3-S1)", () => {
    const { features, portraits } = content.portraitAppearances;
    expect(features).toEqual({
      beard: { maleOnly: true, shows: [] },
      scar: { maleOnly: false, shows: ['scarred'] },
      eyepatch: { maleOnly: false, shows: ['one-eyed'] },
      braids: { maleOnly: false, shows: [] },
      'long-hair': { maleOnly: false, shows: [] },
      'curly-hair': { maleOnly: false, shows: [] },
      'grey-hair': { maleOnly: false, shows: [] },
      bald: { maleOnly: false, shows: [] },
    });
    // The owner's two first; v1.1.3-S4 took in 38 more, and its analysis gave these two hooks.
    expect(Object.keys(portraits).slice(0, 2)).toEqual(['gm-male-01', 'gm-female-01']);
    expect(Object.keys(portraits)).toHaveLength(40);
    expect(portraits['gm-male-01']).toEqual({
      apparentAge: [45, 55],
      station: 'common',
      callings: ['soldier', 'adventurer'],
      temper: 'stern',
      features: ['beard', 'scar', 'curly-hair'],
      narrative: expect.stringMatching(/^A weathered, deeply lined face, .* before a word is spoken\.$/) as unknown,
      hooks: ['{He} still wears the scuffed, stained leather coat of {his} road years, and has sent away every tailor the Guild has found for {him}.'],
    });
    expect(portraits['gm-female-01']).toEqual({
      apparentAge: [22, 30],
      station: 'gentry',
      callings: ['soldier'],
      temper: 'composed',
      features: ['braids', 'long-hair'],
      narrative: expect.stringMatching(/^A strong-boned face with high cheekbones .* what she is thinking\.$/) as unknown,
      hooks: [
        "{He} grew up in a vaulted stone house with {his} family's arms carved above the fire, and still sleeps poorly under a low roof.",
        '{He} has pinned {his} braids with the same worked clasp since {his} first muster, and is never seen without it.',
      ],
    });
    // DL-127 item 5 counts them: 243 and 241 characters, within a narrative's 260; v1.1.3-S4's
    // analysis read gm-female-01's eyes as pale, and made it 255.
    expect([...(portraits['gm-male-01']?.narrative ?? '')]).toHaveLength(243);
    expect([...(portraits['gm-female-01']?.narrative ?? '')]).toHaveLength(255);
  });

  test("warns of every sex and band of Guildmaster pictures, and every Class and sex of Hero pictures, short of three (DL-134 item 10)", () => {
    // Since v1.1.3-S4 every sex and band of Guildmaster pictures holds three or more.
    expect(contentWarnings(content)).toEqual([
      'portraits.hero.female: 0 pictures of the Class warrior, fewer than 3',
      'portraits.hero.female: 0 pictures of the Class rogue, fewer than 3',
      'portraits.hero.female: 0 pictures of the Class mage, fewer than 3',
      'portraits.hero.female: 0 pictures of the Class healer, fewer than 3',
      'portraits.hero.male: 0 pictures of the Class warrior, fewer than 3',
      'portraits.hero.male: 0 pictures of the Class rogue, fewer than 3',
      'portraits.hero.male: 0 pictures of the Class mage, fewer than 3',
      'portraits.hero.male: 0 pictures of the Class healer, fewer than 3',
    ]);
  });

  test("gives each Hero Background its Station: Fallen gentry gentry, Town apprentice trade, the other six common (DL-135 item 5)", () => {
    const stations = Object.fromEntries(Object.values(content.backgrounds).map((row) => [row.key, row.station ?? null]));
    expect(stations).toEqual({
      'farm-born': 'common',
      'levy-soldier': 'common',
      'temple-ward': 'common',
      'river-folk': 'common',
      'pit-village': 'common',
      'town-apprentice': 'trade',
      'poachers-child': 'common',
      'fallen-gentry': 'gentry',
      'old-charter': null,
      breakaway: null,
      'newly-founded': null,
      inherited: null,
    });
  });

  describe("what a Guildmaster's descriptive Attributes are written from (v1.1.2-S5, DL-125 item 6)", () => {
    const { descriptions } = content;
    const bands = descriptions.ageBands.map((band) => band.key);
    const guildBackgrounds = Object.values(content.backgrounds).filter((row) => row.owner === 'guild').map((row) => row.key);
    const guildmasterTraits = Object.keys(content.guildmasterTraits);

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

    // v1.1.3-S1: the structure proved with a first sentence in every list; the first `analyse` run fills
    // them to three or more (v1.1.3-S4, DL-135 item 11).
    test("has DL-134 item 8's three Stations, six Tempers and seven Callings, lawyer apart from merchant (DL-135 item 1), and v1.1.3-S4's genial", () => {
      expect(descriptions.stations).toEqual(['common', 'trade', 'gentry']);
      expect(descriptions.tempers).toEqual(['stern', 'composed', 'intense', 'calculating', 'wry', 'steady', 'genial']);
      expect(descriptions.callings).toEqual({
        soldier: { suits: ['old-soldier'], clashes: [] },
        adventurer: { suits: ['old-soldier'], clashes: [] },
        scholar: { suits: [], clashes: ['mistrusts-magic'] },
        mage: { suits: [], clashes: ['mistrusts-magic'] },
        explorer: { suits: [], clashes: [] },
        merchant: { suits: ['thrifty', 'miser'], clashes: ['spendthrift'] },
        lawyer: { suits: ['thrifty'], clashes: [] },
      });
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
      expect(lists).toHaveLength(3 + 7 * 3 + 7 + 8 + 4 * 3 + heroTraits.length + 3);
      for (const [where, list] of lists) expect(list?.length ?? 0, where).toBeGreaterThanOrEqual(1);
    });

    test("proves the longest Birthplace, Appearance and Biography, a Guildmaster's and a Hero's, within 60, 280 and 1,000 characters", () => {
      const longest = longestDescriptions(content);
      expect(longest.birthplace).toBeLessThanOrEqual(descriptionBounds.birthplace);
      expect(longest.appearance).toBeLessThanOrEqual(descriptionBounds.appearance);
      expect(longest.biography).toBeLessThanOrEqual(descriptionBounds.biography);
      expect(longest.heroBiography).toBeLessThanOrEqual(descriptionBounds.biography);
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

    test('writes each standalone text with a capital: every Birthplace, phrase and sentence begins with one', () => {
      const texts = [
        ...descriptions.birthplaces,
        ...Object.values(descriptions.appearance).flatMap((byBand) => Object.values(byBand).flatMap((slots) => Object.values(slots).flat())),
        ...biographySentences().map((sentence) => sentence.replace(/^\{(\w+)\}/, (_, slot: string) => descriptions.pronouns.female[slot] ?? slot)),
      ];
      for (const text of texts) expect(text, text).toMatch(/^\p{Lu}/u);
    });
  });

  // The Traits are the owner's to add, change and remove through the content editor (DL-150 items 7
  // to 12), so these tests hold the rules a Trait keeps, not the Traits shipped (the verification of
  // v1.1.4-S13); the content's checks hold the rest, an exclusion both ways among them.
  test("costs a Guildmaster Trait as DL-100 item 3 says: a buff costs, and a penalty refunds (M9-S2)", () => {
    const traits = Object.values(content.guildmasterTraits);
    expect(traits.length).toBeGreaterThan(0);
    for (const trait of traits) {
      const effects = trait.effects.map(buff);
      if (effects.length > 0 && effects.every(Boolean)) expect(trait.cost, trait.key).toBeGreaterThan(0);
      if (effects.length > 0 && !effects.some(Boolean)) expect(trait.cost, trait.key).toBeLessThan(0);
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

  test('has the four named Dispositions (INPUTS 7.5), their weights as the M6 close retuned them (DL-69), and their partyMargins (DL-157)', () => {
    const weights = (
      questRiskAppetite: number,
      recruitThreshold: number,
      buildThreshold: number,
      gearThreshold: number,
      transferAppetite: number,
      partyMargin: number,
    ) => ({ questRiskAppetite, recruitThreshold, buildThreshold, gearThreshold, transferAppetite, partyMargin });
    expect(content.dispositions).toEqual({
      // DL-56 set the rows, DL-58 gave reckless a gearThreshold of 3; the M6 close's balance pass
      // (DL-69) moved steady to the middle of the Quests it can staff, every transferAppetite below a
      // third, so that no Rival sells itself below rivalRosterMin, and the hiring and building bars.
      // v1.1.4-S6 gave each its partyMargin, 0.05 and reckless's 0.10, first values S10 tunes (DL-148).
      steady: { key: 'steady', name: 'Steady', ...weights(0.5, 60, 12, 3, 0.2, 0.05) },
      ambitious: { key: 'ambitious', name: 'Ambitious', ...weights(0.7, 45, 1.5, 2, 0.3, 0.05) },
      miserly: { key: 'miserly', name: 'Miserly', ...weights(0.35, 60, 40, 10, 0.1, 0.05) },
      reckless: { key: 'reckless', name: 'Reckless', ...weights(1, 30, 4, 3, 0.25, 0.1) },
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

  test("gives each Guildmaster Trait an effect, and the four Injury Traits DL-148 item 24's Stat changes (M4-S5, v1.1.4-S7)", () => {
    for (const trait of Object.values(content.guildmasterTraits)) expect(trait.effects.length, trait.key).toBeGreaterThan(0);
    const modifiers = (it: Record<string, number>) => ({ effects: [{ kind: 'statModifiers', modifiers: it }] });
    expect(content.heroTraits).toMatchObject({
      lame: modifiers({ dexterity: -2, endurance: -1 }),
      'one-eyed': modifiers({ perception: -2, weaponry: -1 }),
      'short-winded': modifiers({ endurance: -2, constitution: -1 }),
      scarred: modifiers({ courage: 1, charisma: -1 }),
    });
  });

  test('keys every Trait in one of the two lists, Guildmaster and Hero, never both (v1.1.4-S7, DL-150 item 1)', () => {
    const both = Object.keys(content.heroTraits).filter((key) => Object.hasOwn(content.guildmasterTraits, key));
    expect(both).toEqual([]);
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

  // M4-S1's third box; the Encounters as v1.1.4-S10 wrote them from the drafts the owner approved
  // (DL-162, DL-165): each in Checks scored by Queries over the Party, with a pass formula.
  describe('Encounters (M4-S1, v1.1.4-S10)', () => {
    const encounters = Object.values(content.encounters);
    /** Each Encounter as `encounters.json` writes it: the new form (v1.1.4-S2). */
    const written = JSON.parse(readFileSync(join(contentDir, 'encounters.json'), 'utf8')) as Record<
      string,
      { checks: Record<string, unknown>[]; pass?: unknown; consequences: Record<string, unknown[]> }
    >;
    // The engine's union, written out: content imports only types from the engine (ADR-0006).
    const encounterKinds = ['combat', 'travel', 'social', 'arcane', 'stealth', 'lore'] as const satisfies readonly EncounterKind[];
    const finales = new Set(Object.values(content.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [it.finale])));

    test('are twenty-nine of the six kinds, four of them lore and four Finales (DL-162)', () => {
      const byKind = (list: typeof encounters) => Object.fromEntries(encounterKinds.map((kind) => [kind, list.filter((it) => it.kind === kind).length]));
      expect(encounters).toHaveLength(29);
      expect(byKind(encounters)).toEqual({ combat: 5, travel: 5, social: 4, arcane: 6, stealth: 5, lore: 4 });
      // Drawn in their places: every kind has at least two that are no template's Finale.
      for (const [kind, count] of Object.entries(byKind(encounters.filter((it) => !finales.has(it.key))))) expect(count, kind).toBeGreaterThanOrEqual(2);
    });

    // v1.1.4-S8 (DL-148 item 22, DL-160): the tags that weight the draw, matched to the templates'.
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

    test('four templates name a Finale, each an Encounter of its own (DL-148 item 22)', () => {
      const named = Object.fromEntries(Object.values(content.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [[it.key, it.finale]])));
      expect(named).toEqual({
        'hold-the-border-fort': 'the-last-assault',
        'lay-the-restless-dead': 'the-last-rite',
        'break-the-sealed-vault': 'the-wardens-seal',
        'the-counting-house-job': 'the-strongroom',
      });
      expect(finales.size).toBe(4);
    });

    test('each is written in two to four named Checks, combined by a pass formula, with consequences for all four Degrees', () => {
      for (const it of encounters) {
        const row = written[it.key] ?? expect.fail(it.key);
        expect(row.checks.length, it.key).toBeGreaterThanOrEqual(2);
        expect(row.checks.length, it.key).toBeLessThanOrEqual(4);
        expect(row.pass, it.key).toBeDefined();
        expect(Object.keys(row.consequences).sort(), it.key).toEqual(['failure', 'setback', 'success', 'triumph']);
        for (const check of it.checks) {
          expect(check.name.length, `${it.key}/${check.key}`).toBeGreaterThan(0);
          expect(check.difficultyFactor, `${it.key}/${check.key}`).toBeGreaterThan(0);
          for (const skillKey of check.skills) expect(content.skills[skillKey], `${it.key}/${check.key}`).toBeDefined();
        }
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

    test('use every kind of consequence the old form used', () => {
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

    // v1.1.4-S10's coverage (DL-148 item 21, the epic's gate): no Hero Stat goes unread by the Quests.
    test('read every Hero Stat by three Checks at least, across two kinds at least', () => {
      const short = heroStats.flatMap((stat) => {
        const kinds = encounters.flatMap((it) => it.checks.filter((check) => statsAdded(check.score).includes(stat.key)).map(() => it.kind));
        return kinds.length >= 3 && new Set(kinds).size >= 2 ? [] : [`${stat.key}: ${kinds.length} Checks across ${new Set(kinds).size} kinds`];
      });
      expect(heroStats).toHaveLength(20);
      expect(short).toEqual([]);
    });

    test('count, for the coverage, a Stat a score adds, and not one that only chooses the Hero or the Set', () => {
      expect(statsAdded(['of', ['worst', 'party', ['stat', 'dexterity']], ['stat', 'wits']])).toEqual(['wits']);
      expect(statsAdded(['sum', ['top', 'party', 3, ['stat', 'constitution']], ['weighted', [['strength', 0.5], ['wits', 0]]]])).toEqual(['strength']);
      expect(statsAdded(['+', ['*', 0.5, ['max', ['where', 'party', ['class', 'mage']], ['stat', 'arcana']]], ['count', 'party']])).toEqual(['arcana']);
      expect(statsAdded(['ranked', 'party', ['+', ['stat', 'courage'], ['stat', 'willpower']], [1, 0.5]])).toEqual(['courage', 'willpower']);
    });
  });

  // INPUTS 6.4: six starter Synergies, among them Warrior + Healer, Rogue + Mage and three Warriors;
  // v1.1.4-S10 writes them as Queries over the Party, and three more that read Stats and Levels (DL-162).
  describe('Synergies (M4-S3, v1.1.4-S10)', () => {
    const synergies = Object.values(content.synergies);
    /** Each Synergy's requirement as `synergies.json` writes it: conditions on the Party. */
    const written = JSON.parse(readFileSync(join(contentDir, 'synergies.json'), 'utf8')) as Record<string, { requires: unknown }>;
    const classCount = (classKey: string, count: number) => ['>=', ['count', ['where', 'party', ['class', classKey]]], count];

    test('are nine, among them Warrior + Healer, Rogue + Mage and three Warriors (INPUTS 6.4)', () => {
      expect(synergies).toHaveLength(9);
      const requirements = synergies.map((it) => it.requires);
      expect(requirements).toContainEqual([classCount('warrior', 1), classCount('healer', 1)]);
      expect(requirements).toContainEqual([classCount('rogue', 1), classCount('mage', 1)]);
      expect(requirements).toContainEqual([classCount('warrior', 3)]);
      for (const it of synergies) expect(it.name.length, it.key).toBeGreaterThan(0);
    });

    test('are each written as conditions on the Party, and load as written', () => {
      for (const it of synergies) {
        const { requires } = written[it.key] ?? expect.fail(it.key);
        expect(Array.isArray(requires), it.key).toBe(true);
        expect(it.requires, it.key).toEqual(requires);
      }
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

  // M5-S1: twenty to start, nine gear three a slot at three grades, six consumables, five unique gear
  // as Loot only (DL-48); v1.1.4-S10 adds six trinkets for the Mental and Social Stats (DL-162).
  describe('Item definitions (M5-S1, v1.1.4-S10)', () => {
    const items = Object.values(content.items);
    const gear = items.filter((it) => it.kind === 'gear');
    const consumables = items.filter((it) => it.kind === 'consumable');
    const grades = ['plain', 'fine', 'masterwork'];
    /** v1.1.4-S10's trinkets for the Mental and Social Stats, beside each slot's line of three. */
    const mentalAndSocial = ['commonplace-book', 'reading-glass', 'signet-ring', 'officers-sash', 'courtiers-brooch', 'scholars-almanac'];
    const lines = gear.filter((it) => !it.unique && !mentalAndSocial.includes(it.key));

    test('are twenty-six: fifteen common gear, six consumables and five unique gear', () => {
      expect(items).toHaveLength(26);
      expect(gear.filter((it) => !it.unique)).toHaveLength(15);
      expect(consumables).toHaveLength(6);
      expect(gear.filter((it) => it.unique)).toHaveLength(5);
      for (const it of items) expect(it.name.length, it.key).toBeGreaterThan(0);
    });

    test('hold a line of three common gear to each slot, one of each grade, dearer and stronger by grade (INPUTS 7.1)', () => {
      for (const slot of ['weapon', 'armour', 'trinket'] as const) {
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

    // A Trait earned on a Quest is left by no Injury (DL-148 item 25), so not every Hero Trait is one.
    test("leave a Hero Trait or none, some none, and each `leavesTrait` names a Hero Trait", () => {
      expect(types.some((it) => it.leavesTrait === null)).toBe(true);
      for (const it of types) if (it.leavesTrait !== null) expect(Object.keys(content.heroTraits), it.key).toContain(it.leavesTrait);
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
