import { loadContent } from '@heroesim/content/node';
import {
  addStack,
  ageOf,
  bestParties,
  captainLock,
  createWorld,
  defaultConfig,
  descriptiveAttributeLabels,
  effectiveStats,
  estimateQuest,
  fatigueBand,
  guildmasterOf,
  isDeadly,
  judgedHintBands,
  moraleBand,
  partyPool,
  playerGuild,
  potentialHint,
  signingFee,
  signingRefusal,
  skillsThatHelp,
  transferFee,
  unattachedHeroes,
  type EngineDeps,
  type GameConfig,
  type Guild,
  type Hero,
  type HeroId,
  type Quest,
  type WorldDocument,
} from '@heroesim/engine';
import { createItem, makeId, nightOf, potentialHints } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { encounterReadings, shownPercent } from './query.js';
import {
  bestPartyReading,
  boardReading,
  captainPost,
  deadlyWords,
  fatigueBandNames,
  heroReading,
  moraleBandNames,
  namingWords,
  noBestPartyWords,
  partyFloorWords,
  playerReading,
  poolNote,
  poolReading,
  questClosed,
  rosterReading,
  signsWords,
  tierWords,
  type CaptainPostReading,
  type HeroReading,
  type HeroRow,
  type PlayerReading,
} from './readings.js';

// The readings (DL-241): what the player reads of a Hero, a Quest on the Board and a row of the pool
// or of a Roster, through the player's reading, with no layout. Each front end's layout of them has a
// test of its own: `cli/src/render.test.ts` and `web/src/state/selectors.test.ts`.

const content = loadContent();
const deps: EngineDeps = { config: defaultConfig, content };
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(seed = 'readings'): WorldDocument {
  return structuredClone(createWorld(seed, setup, deps).document);
}

function player(document: WorldDocument): Guild {
  return playerGuild(document.world) as Guild;
}

/** The player's Heroes, in the Roster's order. */
function heroes(document: WorldDocument): Hero[] {
  return player(document).rosterIds.map((id) => document.world.heroes[id] as Hero);
}

function rivalOf(document: WorldDocument): Guild {
  return Object.values(document.world.guilds).find((guild) => guild.id !== player(document).id) as Guild;
}

function read(document: WorldDocument, hero: Hero, under: EngineDeps = deps): HeroReading {
  return heroReading(playerReading(document, under), hero);
}

const heroStats = Object.values(content.stats).filter((stat) => stat.owner === 'hero');

describe("the player's reading", () => {
  test("reads through the player's Guild and its Guildmaster: the hint bands their Judgement narrows, and the deps' calendar", () => {
    const document = newGame();
    const reading = playerReading(document, deps);
    const guildmaster = guildmasterOf(player(document), document.world);

    expect(reading.guild).toBe(player(document));
    expect(reading.guildmaster).toBe(guildmaster);
    expect(reading.hintBands).toEqual(judgedHintBands(guildmaster, content, defaultConfig));
    expect(reading.calendar).toBe(deps.config);
    expect(reading.content).toBe(content);
  });

  test('takes the config it is given: Ages by its calendar, and hints by its bands', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    // Bands unlike the defaults, and Judgement still, so the hints can only come from this config.
    const config: GameConfig = { ...defaultConfig, turnsPerYear: 3, potentialHintBands: { modest: 0, promising: 2, exceptional: 4 }, judgementHintSharpening: 0 };
    document.world.turn = 30;
    const gaps = [0, 1, 2, 3, 4, 7];
    const stats = heroStats.slice(0, gaps.length);
    stats.forEach((stat, index) => {
      hero.stats[stat.key] = 5;
      hero.potential[stat.key] = 5 + (gaps[index] ?? 0);
    });

    const reading = read(document, hero, { config, content });

    expect(reading.age).toBe(hero.ageAtEntry + 10);
    expect(reading.stats.slice(0, gaps.length).map((stat) => stat.outlook)).toEqual(['modest', 'modest', 'promising', 'promising', 'exceptional', 'exceptional']);
  });

  test("a save with no player's Guild: no Guild, no Guildmaster, the bands in force for none, and no Best Party", () => {
    const document = newGame();
    player(document).controller = { kind: 'rival', disposition: 'steady' };
    const reading = playerReading(document, deps);

    expect(reading.guild).toBeUndefined();
    expect(reading.guildmaster).toBeUndefined();
    expect(reading.hintBands).toEqual(judgedHintBands(undefined, content, defaultConfig));
    const quest = document.world.quests[document.world.board[0] as Quest['id']] as Quest;
    expect(reading.bestParty(quest)).toBeNull();
  });

  // DL-264: the Board offers no Party for a Quest the player's Guild may not take.
  test("a Quest whose Tier's Fame minimum is above the player's Guild's Fame: no Best Party, and the refusal dispatch would give", () => {
    const document = newGame();
    const [open, closed] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest, Quest];
    open.tier = 1;
    closed.tier = 2;
    for (const quest of [open, closed]) quest.requirements = { partySizeMin: 1 };
    const fame = player(document).fame;
    const tiers = defaultConfig.tiers.map((row, index) => ({ ...row, fameMinimum: index === 1 ? fame + 3 : 0 }));
    const reading = playerReading(document, { config: { ...defaultConfig, tiers }, content });

    expect(reading.bestParty(open)).not.toBeNull();
    expect(questClosed(reading, open)).toBeNull();
    expect(reading.bestParty(closed)).toBeNull();
    expect(bestPartyReading(reading, closed)).toBeNull();
    expect(questClosed(reading, closed)).toEqual({
      action: 'dispatch',
      reason: 'fame-below-minimum',
      guildId: player(document).id,
      questId: closed.id,
      tier: 2,
      fameMinimum: fame + 3,
      fame,
    });
    expect(questClosed(playerReading(document, deps), closed)).toBeNull();
  });
});

describe("a Hero's reading", () => {
  test("gives each Stat's base, the effective value a Check reads and the hint through the player's Guildmaster's bands, never its Potential", () => {
    const document = newGame();
    const bands = { potentialHintBands: judgedHintBands(guildmasterOf(player(document), document.world), content, defaultConfig) };

    for (const hero of Object.values(document.world.heroes)) {
      const { stats } = read(document, hero);
      const effective = effectiveStats(hero, document.world, content);

      expect(stats.map((stat) => stat.key)).toEqual(heroStats.map((stat) => stat.key));
      expect(stats.map((stat) => stat.base)).toEqual(heroStats.map((stat) => hero.stats[stat.key]));
      expect(stats.map((stat) => stat.value)).toEqual(heroStats.map((stat) => effective[stat.key]));
      expect(stats.map((stat) => stat.outlook)).toEqual(heroStats.map((stat) => potentialHint(hero, stat.key, bands)));
      // Every Stat carries one of the three hint words (data-model rule 9).
      for (const stat of stats) expect(potentialHints, `${hero.id} ${stat.key}`).toContain(stat.outlook);
      expect(JSON.stringify(read(document, hero))).not.toMatch(/potential/i);
    }
  });

  test('never holds Potential, even as a number found nowhere else', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    Object.keys(hero.potential).forEach((key, index) => {
      hero.potential[key] = 900_001 + index;
    });

    const text = JSON.stringify(read(document, hero));

    for (let index = 0; index < Object.keys(hero.potential).length; index += 1) expect(text).not.toContain(String(900_001 + index));
    expect(text).not.toContain('9000');
  });

  test('gives each Stat its area, as it stands alone, in four areas in content’s order', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    const areas = read(document, hero).stats.map((stat) => stat.area);

    expect([...new Set(areas)]).toEqual(['Physical', 'Mental', 'Magical', 'Social']);
    expect(areas.filter((area) => area === 'Mental')).toHaveLength(6);
  });

  test('gives who the Hero is: name, Sex, Portrait, Age, Class, Background, Guild, and their Appearance and Biography as written', () => {
    const document = newGame();
    const [hero, other] = heroes(document) as [Hero, Hero];
    other.appearance = '';

    const reading = read(document, hero);

    expect(reading).toMatchObject({
      id: hero.id,
      name: hero.name,
      sex: hero.sex,
      // The core content has no Hero picture: every Hero shows the Silhouette of their sex (DL-125 items 2 and 4).
      portraitKey: null,
      age: ageOf(hero, document.world.turn, defaultConfig),
      className: content.classes[hero.classKey]?.name,
      background: content.backgrounds[hero.backgroundKey]?.name,
      guild: { id: player(document).id, name: 'The Lantern' },
      unattached: false,
    });
    expect(hero.appearance).not.toBe('');
    expect(reading.texts).toEqual([
      { label: descriptiveAttributeLabels.appearance, words: hero.appearance },
      { label: descriptiveAttributeLabels.biography, words: hero.biography },
    ]);
    // One written empty is left out.
    expect(read(document, other).texts.map((text) => text.label)).toEqual([descriptiveAttributeLabels.biography]);
  });

  test('names a content key the content does not define as it is (rule 5)', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    hero.backgroundKey = 'sea-born';
    hero.injury = { typeKey: 'frostbite-of-the-soul', healsOnTurn: nightOf(13) };
    hero.skills['no-such-skill'] = 3;

    const reading = read(document, hero);

    expect(reading.background).toBe('sea-born');
    expect(reading.injury).toEqual({ name: 'frostbite-of-the-soul', healsOnTurn: nightOf(13) });
    // A Skill content does not define comes after content's, by its key.
    expect(reading.skills.at(-1)).toEqual({ key: 'no-such-skill', name: 'no-such-skill', rating: 3 });
  });

  test('gives Morale with its band, XP, the Injury by name with the Turn it heals on, and each Trait with what it does', () => {
    const document = newGame();
    const [hero, other] = heroes(document) as [Hero, Hero];
    hero.morale = 30;
    hero.xp = 45;
    hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    hero.traits = ['scarred'];

    expect(read(document, hero)).toMatchObject({
      morale: 30,
      moraleBand: 'low',
      xp: 45,
      injury: { name: content.injuries['deep-cut']?.name, healsOnTurn: 20 },
      traits: [{ name: content.heroTraits.scarred?.name, effect: '+1 Courage, -1 Charisma' }],
      transferFee: null,
      signing: null,
    });
    expect(read(document, other)).toMatchObject({ injury: null, traits: [] });
  });

  // DL-289: Fatigue read by its band as Morale is, and whether the Hero is their Guild's Captain.
  test("gives Fatigue with its band, and whether the Hero is their Guild's Captain", () => {
    const document = newGame();
    const guild = player(document);
    const [hero, other] = heroes(document) as [Hero, Hero];
    hero.fatigue = defaultConfig.fatigueBands.tired;
    other.fatigue = 0;
    guild.captainId = hero.id;

    expect(read(document, hero)).toMatchObject({ fatigue: defaultConfig.fatigueBands.tired, fatigueBand: 'tired', captain: true });
    expect(read(document, other)).toMatchObject({ fatigue: 0, fatigueBand: 'fresh', captain: false });
  });

  test("gives the effective value a Check reads, with the Hero's gear, the Guildmaster's Traits and the Hero's own", () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    hero.classKey = 'mage';
    const guildmaster = guildmasterOf(player(document), document.world);
    if (guildmaster === undefined) throw new Error('no Guildmaster');
    guildmaster.traits = ['mistrusts-magic'];
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: hero.id, slot: 'weapon' });
    const base = (key: string): number => hero.stats[key] ?? 0;
    const value = (key: string): number | undefined => read(document, hero).stats.find((stat) => stat.key === key)?.value;

    // The arming sword: Weaponry +2 and Strength +1; Mistrusts magic: −1 Arcana to Mages.
    expect(value('weaponry')).toBe(base('weaponry') + 2);
    expect(value('strength')).toBe(base('strength') + 1);
    expect(value('arcana')).toBe(base('arcana') - 1);
    expect(value('wits')).toBe(base('wits'));
    // A Hero Trait's Stat change shows where the Stat shows, as gear's does (DL-148 item 24).
    hero.traits = ['lame'];
    expect(value('dexterity')).toBe(Math.max(1, base('dexterity') - 2));
    expect(value('strength')).toBe(base('strength') + 1);
  });

  test('gives each gear slot and what is in it, by name, with what it modifies, its content key and whether it is a Unique Item', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    const jack = addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: hero.id, slot: 'armour' });
    const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'hero', id: hero.id, slot: 'weapon' });

    expect(read(document, hero).gear).toEqual([
      { slot: 'weapon', item: { id: blade, name: content.items['barrow-kings-blade']?.name, modifies: expect.any(String), definitionKey: 'barrow-kings-blade', unique: true } },
      { slot: 'armour', item: { id: jack, name: 'Padded jack', modifies: expect.any(String), definitionKey: 'padded-jack', unique: false } },
      { slot: 'trinket', item: null },
    ]);
  });

  test("gives the Skills the Hero has in content's order, each with its rating", () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    const order = Object.keys(content.skills).filter((key) => Object.hasOwn(hero.skills, key));

    expect(read(document, hero).skills).toEqual(order.map((key) => ({ key, name: content.skills[key]?.name, rating: hero.skills[key] })));
  });

  test("gives Skills held in another order in content's, then one content does not define, by its key", () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];
    const [first, second] = Object.keys(content.skills) as [string, string];
    hero.skills = { 'sea-lore': 1, [second]: 2, [first]: 3 };

    expect(read(document, hero).skills).toEqual([
      { key: first, name: content.skills[first]?.name, rating: 3 },
      { key: second, name: content.skills[second]?.name, rating: 2 },
      { key: 'sea-lore', name: 'sea-lore', rating: 1 },
    ]);
  });

  test("gives each other Hero on the Roster with the Hero's Regard for them and their Relationship, as bands and never as numbers; none off a Roster", () => {
    const document = newGame();
    const guild = player(document);
    const [hero, close, cool, ...rest] = heroes(document) as [Hero, Hero, Hero, ...Hero[]];
    hero.regard[close.id] = { value: 17.25, since: 0, reason: 'quest.resolved' };
    close.regard[hero.id] = { value: 13.75, since: 0, reason: 'quest.resolved' };
    // One way only: the Hero's Regard is cool, and the Relationship, the mean with none held back, neutral.
    hero.regard[cool.id] = { value: -7.5, since: 0, reason: 'quest.resolved' };

    const rows = read(document, hero).relationships ?? [];
    const of = (mate: Hero) => rows.find((row) => row.id === mate.id);

    expect(rows.map((row) => row.id)).toEqual(guild.rosterIds.filter((id) => id !== hero.id));
    expect(of(close)).toMatchObject({ name: close.name, className: content.classes[close.classKey]?.name, regard: 'close', relationship: 'close' });
    expect(of(cool)).toMatchObject({ regard: 'cool', relationship: 'neutral' });
    for (const mate of rest) expect(of(mate)).toMatchObject({ regard: 'neutral', relationship: 'neutral' });
    for (const number of ['17.25', '13.75', '15.5', '7.5', '3.75']) expect(JSON.stringify(rows)).not.toContain(number);

    // Off a Roster, none.
    guild.rosterIds = guild.rosterIds.filter((id) => id !== hero.id);
    Object.assign(hero, { guildId: null, unattachedSince: document.world.turn });
    expect(read(document, hero).relationships).toBeNull();
  });

  test("reads the Hero's own Regard apart from the Relationship, which both Heroes' Regard make", () => {
    const document = newGame();
    const [hero, liked, disliked] = heroes(document) as [Hero, Hero, Hero];
    hero.regard[liked.id] = { value: 8, since: 0, reason: 'test' };
    disliked.regard[hero.id] = { value: -30, since: 0, reason: 'test' };

    const rows = read(document, hero).relationships ?? [];

    expect(rows.find((row) => row.id === liked.id)).toMatchObject({ regard: 'warm' });
    expect(rows.find((row) => row.id === disliked.id)?.regard).toBe('neutral');
    expect(rows.find((row) => row.id === disliked.id)?.relationship).not.toBe('neutral');
  });

  test("gives a Rival's Hero the Transfer fee the player's Guild would pay, at its Guildmaster's Negotiation, not the seller's", () => {
    const document = newGame();
    const buyer = guildmasterOf(player(document), document.world);
    let seller = 0;
    for (const rival of Object.values(document.world.guilds).filter((guild) => guild.id !== player(document).id)) {
      for (const heroId of rival.rosterIds) {
        const hero = document.world.heroes[heroId] as Hero;
        const fee = transferFee(hero, buyer, document.world.turn, deps);
        expect(read(document, hero)).toMatchObject({ transferFee: fee, signing: null, guild: { id: rival.id, name: rival.name } });
        if (transferFee(hero, guildmasterOf(rival, document.world), document.world.turn, deps) !== fee) seller += 1;
      }
    }
    expect(seller).toBeGreaterThan(0);
  });

  test("gives an Unattached Hero the signing fee the player's Guild would pay and whether they sign; one who needs more Fame does not", () => {
    const document = newGame();
    const guild = player(document);
    const buyer = guildmasterOf(guild, document.world);
    const [pooled] = unattachedHeroes(document.world) as [Hero];
    const refusal = signingRefusal(guild, pooled, defaultConfig);

    expect(read(document, pooled)).toMatchObject({
      guild: null,
      unattached: true,
      transferFee: null,
      signing: { fee: signingFee(pooled, deps, buyer), signs: refusal === null ? { willSign: true } : { willSign: false, fameRequired: refusal.fameRequired } },
      relationships: null,
    });
    // One who needs more Fame than the Guild has will not sign (DL-109 item 2, Q17).
    guild.fame = 0;
    pooled.level = 4;
    expect(read(document, pooled).signing?.signs).toEqual({ willSign: false, fameRequired: 30 });
  });

  test('gives the Turns a Hero died, retired and left the pool on, and the Party they are away with', () => {
    const document = newGame();
    const [hero] = heroes(document) as [Hero];

    expect(read(document, hero)).toMatchObject({ died: null, retired: null, leftPool: null, partyId: null });
    Object.assign(hero, { diedOnTurn: 2_198, retiredOnTurn: 1_079, leftPoolOnTurn: 0, partyId: 'party-000004' });
    expect(read(document, hero)).toMatchObject({ died: 2_198, retired: 1_079, leftPool: 0, partyId: 'party-000004' });
  });
});

describe('the rows of a Roster and of the pool', () => {
  test("gives a Roster's Heroes in its order, each by name, Class, Level, Age, Morale and Background; another Guild's with the Transfer fee", () => {
    const document = newGame();
    const guild = player(document);
    const rival = rivalOf(document);
    const buyer = guildmasterOf(guild, document.world);
    const reading = playerReading(document, deps);

    const rows = rosterReading(reading, guild);

    expect(rows.map((row) => row.id)).toEqual(guild.rosterIds);
    for (const row of rows) {
      const hero = document.world.heroes[row.id] as Hero;
      expect(row).toEqual({
        id: hero.id,
        name: hero.name,
        sex: hero.sex,
        portraitKey: hero.portraitKey,
        classKey: hero.classKey,
        className: content.classes[hero.classKey]?.name,
        level: hero.level,
        age: ageOf(hero, document.world.turn, defaultConfig),
        morale: hero.morale,
        moraleBand: moraleBand(hero.morale, defaultConfig),
        fatigue: hero.fatigue,
        fatigueBand: fatigueBand(hero.fatigue, defaultConfig),
        captain: guild.captainId === hero.id,
        background: content.backgrounds[hero.backgroundKey]?.name,
        // The first Day: the Days left are the end Day itself.
        contract: `${hero.contract?.endDay} Days left`,
        transferFee: null,
      });
    }
    expect(rosterReading(reading, rival).map((row) => [row.id, row.transferFee])).toEqual(
      rival.rosterIds.map((id) => [id, transferFee(document.world.heroes[id] as Hero, buyer, document.world.turn, deps)]),
    );
  });

  test("gives a Hero's Contract on their row: Out of Contract from the night its end Day falls, and Under Offer while an Offer stands for them at home (DL-323)", () => {
    const document = newGame();
    const [first, second, third] = heroes(document) as [Hero, Hero, Hero];
    const rival = rivalOf(document);
    first.contract = { ...(first.contract as NonNullable<Hero['contract']>), endDay: 0 };
    document.world.turn = nightOf(0);
    second.contract = { ...(second.contract as NonNullable<Hero['contract']>), endDay: 5 };
    const offerId = makeId('offers', 1);
    document.world.offers[offerId] = {
      id: offerId,
      kind: 'transfer',
      fromGuildId: player(document).id,
      toGuildId: rival.id,
      heroId: second.id,
      fee: 0,
      years: 1,
      offeredOnTurn: 0,
      expiresOnTurn: nightOf(2),
    };
    third.contract = null;

    const rows = rosterReading(playerReading(document, deps), player(document));

    expect(rows.map((row) => row.contract).slice(0, 3)).toEqual(['Out of Contract', '5 Days left, Under Offer', '']);
  });

  test("gives another Guild's Hero, on their row and in their reading, the fee of the wages left on the world's Turn, not at the Contract's signing (DL-318)", () => {
    const document = newGame();
    const rival = rivalOf(document);
    const buyer = guildmasterOf(player(document), document.world);
    const hero = document.world.heroes[rival.rosterIds[0] as HeroId] as Hero;
    hero.contract = { ...(hero.contract as NonNullable<Hero['contract']>), endDay: 1_080 };
    document.world.turn = nightOf(99) + 1; // the morning of Day 100, ten wage charges on
    const fee = transferFee(hero, buyer, document.world.turn, deps);
    expect(fee).toBeLessThan(transferFee(hero, buyer, 0, deps));

    expect(rosterReading(playerReading(document, deps), rival).find((row) => row.id === hero.id)?.transferFee).toBe(fee);
    expect(read(document, hero).transferFee).toBe(fee);
  });

  test('names the bands a row puts a Hero in, lowest first, so that a front end offers them without the engine', () => {
    expect(moraleBandNames).toEqual(['wretched', 'low', 'steady', 'high', 'elated']);
    expect(fatigueBandNames).toEqual(['fresh', 'weary', 'tired', 'exhausted']);
  });

  // DL-289: a row reads Morale and Fatigue each by its band, and says who is the Captain, once, for the
  // page and the CLI: neither lays out a band of its own from the engine.
  test("gives each Hero's Morale and Fatigue by their bands at the config's starts, and who is the Captain", () => {
    const document = newGame();
    const guild = player(document);
    const roster = heroes(document);
    const config: GameConfig = {
      ...defaultConfig,
      moraleBands: { wretched: 0, low: 10, steady: 20, high: 30, elated: 40 },
      fatigueBands: { fresh: 0, weary: 20, tired: 40, exhausted: 60 },
    };
    const [hero] = roster as [Hero, ...Hero[]];
    const readOne = (): HeroRow => rosterReading(playerReading(document, { config, content }), guild)[0] as HeroRow;
    const bandsOf = (morale: number, fatigue: number): [string, string] => {
      hero.morale = morale;
      hero.fatigue = fatigue;
      const row = readOne();
      expect([row.morale, row.fatigue]).toEqual([morale, fatigue]);
      return [row.moraleBand, row.fatigueBand];
    };

    expect([bandsOf(5, 0), bandsOf(15, 20), bandsOf(25, 39), bandsOf(35, 40), bandsOf(45, 99)]).toEqual([
      ['wretched', 'fresh'],
      ['low', 'weary'],
      ['steady', 'weary'],
      ['high', 'tired'],
      ['elated', 'exhausted'],
    ]);
    guild.captainId = (roster[1] as Hero).id;
    const rows = rosterReading(playerReading(document, { config, content }), guild);

    expect(rows.map((row) => row.captain)).toEqual(roster.map((hero) => hero.id === guild.captainId));
    expect(rows.filter((row) => row.captain)).toHaveLength(1);
  });

  test("a Roster with no Captain names none; a Rival's Captain is read on its Roster; an Unattached Hero is no one's", () => {
    const document = newGame();
    const rival = rivalOf(document);
    player(document).captainId = null;
    rival.captainId = rival.rosterIds[1] as HeroId;
    const reading = playerReading(document, deps);

    expect(rosterReading(reading, player(document)).some((row) => row.captain)).toBe(false);
    expect(rosterReading(reading, rival).map((row) => row.captain)).toEqual(rival.rosterIds.map((id) => id === rival.captainId));
    expect(poolReading(reading).some((row) => row.captain)).toBe(false);
    for (const hero of unattachedHeroes(document.world)) expect(read(document, hero).captain).toBe(false);
  });

  test("gives every Unattached Hero and no Hero on a Roster, each with the signing fee the player's Guild would pay and whether they sign", () => {
    const document = newGame();
    const guild = player(document);
    const buyer = guildmasterOf(guild, document.world);
    const pool = unattachedHeroes(document.world);
    pool[0]!.level = 9;

    const rows = poolReading(playerReading(document, deps));

    expect(rows.map((row) => row.id)).toEqual(pool.map((hero) => hero.id));
    expect(pool).toHaveLength(defaultConfig.unattachedPoolSize);
    for (const [index, row] of rows.entries()) {
      const hero = pool[index] as Hero;
      const refusal = signingRefusal(guild, hero, defaultConfig);
      expect(row.fee).toBe(signingFee(hero, deps, buyer));
      expect(row.signs).toEqual(refusal === null ? { willSign: true } : { willSign: false, fameRequired: refusal.fameRequired });
    }
    expect(rows[0]?.signs).toMatchObject({ willSign: false });
    expect(poolNote(playerReading(document, deps))).toBe(`The Lantern has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`);
  });

  test("with no player's Guild, the pool's fee is the list price, no Hero says whether they sign, and nothing is said of Fame", () => {
    const document = newGame();
    player(document).controller = { kind: 'rival', disposition: 'steady' };
    const reading = playerReading(document, deps);

    for (const row of poolReading(reading)) {
      expect(row.fee).toBe(signingFee(document.world.heroes[row.id] as Hero, deps));
      expect(row.signs).toBeNull();
    }
    expect(poolNote(reading)).toBeNull();
  });

  test('says whether a Hero signs as a sentence says it', () => {
    expect(signsWords({ willSign: true })).toBe('yes');
    expect(signsWords({ willSign: false, fameRequired: 30 })).toBe('needs Fame 30');
  });
});

// DL-289: the player's Guild's Captaincy as a Hero's page meets it, and what naming another says.
describe("the Guild's Captain post", () => {
  test('reads the Captain, the lock a change set, and what naming another costs and locks, from the config', () => {
    const document = newGame();
    const guild = player(document);
    const [first, second] = heroes(document) as [Hero, Hero];
    guild.captainId = first.id;
    guild.captainChangedOnTurn = null;
    const config: GameConfig = { ...defaultConfig, captainChangeMoraleCost: -12, captainChangeLockDays: 7 };

    const open = captainPost(playerReading(document, { config, content }));
    expect(open).toEqual({ captain: { id: first.id, name: first.name }, lock: null, moraleCost: 12, lockDays: 7 });

    guild.captainChangedOnTurn = document.world.turn;
    const locked = captainPost(playerReading(document, { config, content }));
    expect(locked?.lock).toEqual(captainLock(guild, document.world.turn, config));
    expect(locked?.lock).not.toBeNull();
    // A vacancy holds no lock to read, and nobody to pay.
    guild.captainId = null;
    expect(captainPost(playerReading(document, { config, content }))?.captain).toBeNull();
    expect(captainPost(playerReading(document, { config, content }))?.lock).toBeNull();
    expect(second).toBeDefined();
  });

  test("with no player's Guild there is no post to read", () => {
    const document = newGame();
    player(document).controller = { kind: 'rival', disposition: 'steady' };

    expect(captainPost(playerReading(document, deps))).toBeNull();
  });

  test('says what naming a Hero does: free to an empty post, else the outgoing Captain’s Morale and the lock', () => {
    const post: CaptainPostReading = { captain: { id: 'hero-000001' as HeroId, name: 'Brenna Ashcombe' }, lock: null, moraleCost: 10, lockDays: 30 };

    expect(namingWords({ ...post, captain: null }, 'Odo Thistle')).toBe('Naming Odo Thistle Captain is free: the post is empty.');
    expect(namingWords(post, 'Odo Thistle')).toBe('Naming Odo Thistle Captain in place of Brenna Ashcombe costs Brenna Ashcombe 10 Morale and locks the post for 30 Days.');
    expect(namingWords({ ...post, moraleCost: 0 }, 'Odo Thistle')).toBe('Naming Odo Thistle Captain in place of Brenna Ashcombe locks the post for 30 Days.');
    expect(namingWords({ ...post, lockDays: 0 }, 'Odo Thistle')).toBe('Naming Odo Thistle Captain in place of Brenna Ashcombe costs Brenna Ashcombe 10 Morale.');
    expect(namingWords({ ...post, lockDays: 1 }, 'Odo Thistle')).toBe(
      'Naming Odo Thistle Captain in place of Brenna Ashcombe costs Brenna Ashcombe 10 Morale and locks the post for 1 Day.',
    );
    expect(namingWords({ ...post, moraleCost: 0, lockDays: 0 }, 'Odo Thistle')).toBe('Naming Odo Thistle Captain in place of Brenna Ashcombe costs nothing.');
  });
});

describe("a Quest's reading", () => {
  test("gives the Quests on the Board in its order, each with its template's name, its Patron, its terms and what it requires", () => {
    const document = newGame();
    const [first] = document.world.board.map((id) => document.world.quests[id] as Quest);
    if (first === undefined) throw new Error('an empty Board');
    first.requirements = { partySizeMin: 2, classKey: 'mage', skillKey: 'lockpicking' };

    const quests = boardReading(playerReading(document, deps));

    expect(quests.map((quest) => quest.id)).toEqual(document.world.board);
    for (const reading of quests) {
      const quest = document.world.quests[reading.id] as Quest;
      expect(reading).toMatchObject({
        name: content.questTemplates[quest.templateKey]?.name,
        patronId: quest.patronId,
        patron: document.world.patrons[quest.patronId]?.name,
        difficulty: quest.difficulty,
        days: quest.durationTurns / 3,
        reward: quest.reward,
        fame: quest.fameEffect,
        partySizeMin: quest.requirements.partySizeMin,
        expiresOnTurn: quest.expiresOnTurn,
        encounters: encounterReadings(quest, content),
        tier: quest.tier,
        beats: quest.beatLines,
      });
    }
    expect(quests[0]).toMatchObject({ classRequired: 'Mage', skillRequired: 'Lockpicking' });
    expect(quests[1]).toMatchObject({ classRequired: null, skillRequired: null });
  });

  // DL-269: the Board's Tier, its Deadly mark and the least Party, worded once for the page and the CLI.
  test('words a Tier, the Deadly mark with what it means and no figure, and the least Party', () => {
    expect(tierWords(3)).toBe('Tier 3');
    expect(deadlyWords).toEqual({ mark: 'Deadly', meaning: 'a Hero may die on this Quest' });
    expect(partyFloorWords(2)).toBe('A Party of at least 2');
  });

  // DL-289: "Your best Party" is of the Heroes the rest band leaves, so the sentence for none says rested, once for both.
  test('says there is no best Party of the rested Heroes, not of the free ones a rest band keeps home from it', () => {
    expect(noBestPartyWords).toBe('No Party of your rested Heroes meets its requirements.');
  });

  test("gives a Quest's Beats' lines in the order it plays them, one for each Encounter, the Finale's last (DL-262)", () => {
    const document = newGame();
    const [first] = document.world.board.map((id) => document.world.quests[id] as Quest);
    if (first === undefined) throw new Error('an empty Board');
    Object.assign(first, { encounterKeys: ['past-the-watch', 'ambush-on-the-road'], beatLines: ['The gate at dusk.', 'The road home.'] });

    const reading = boardReading(playerReading(document, deps)).find((it) => it.id === first.id);

    expect(reading?.beats).toEqual(['The gate at dusk.', 'The road home.']);
    expect(reading?.encounters.map((it) => it.name)).toEqual(['Past the watch', 'Ambush on the road']);
  });

  test('says a Quest is Deadly when its Tier scales Death above 0 and one of its Encounters has a Death chance (DL-265)', () => {
    const document = newGame();
    const [first] = document.world.board.map((id) => document.world.quests[id] as Quest);
    if (first === undefined) throw new Error('an empty Board');
    const kills = (key: string): boolean =>
      Object.values(content.encounters[key]?.consequences ?? {}).some((list) => list?.some((it) => it.kind === 'death' && it.chance > 0) === true);
    const killer = Object.keys(content.encounters).find(kills);
    const safe = Object.keys(content.encounters).find((key) => !kills(key));
    if (killer === undefined || safe === undefined) throw new Error('No Encounter that kills, or none that does not');
    const deadlyOf = (tier: number, encounterKeys: string[], config: GameConfig = defaultConfig): boolean => {
      Object.assign(first, { tier, encounterKeys, beatLines: encounterKeys.map(() => 'A line') });
      // No template in content overrides a Tier's Death scale, so the ladder's is read.
      const reading = boardReading(playerReading(document, { config, content })).find((it) => it.id === first.id);
      return reading?.deadly as boolean;
    };

    expect([1, 2, 3, 4, 5].map((tier) => deadlyOf(tier, [safe, killer]))).toEqual([false, false, false, true, true]);
    expect(deadlyOf(5, [safe])).toBe(false);
    expect(deadlyOf(5, [safe, killer], { ...defaultConfig, deathFactor: 0 })).toBe(false);
    for (const reading of boardReading(playerReading(document, deps))) {
      expect(reading.deadly).toBe(isDeadly(document.world.quests[reading.id] as Quest, content, defaultConfig));
    }
  });

  test("gives the Skills that help as the Skills its Encounters' Checks read, not its template's (DL-70)", () => {
    const document = newGame();
    let told = 0;
    for (const reading of boardReading(playerReading(document, deps))) {
      const quest = document.world.quests[reading.id] as Quest;
      const keys = [...new Set(quest.encounterKeys.flatMap((key) => content.encounters[key]?.checks.flatMap((it) => it.skills) ?? []))];
      expect(reading.skills).toEqual(skillsThatHelp(quest, content).map((key) => content.skills[key]?.name));
      expect(reading.skills).toEqual(keys.map((key) => content.skills[key]?.name));
      if (quest.skillKeys.some((key) => !keys.includes(key))) told += 1;
    }
    // Some Quest's template names a Skill none of its Encounters reads, which the Board no longer claims helps.
    expect(told).toBeGreaterThan(0);
  });

  test("gives the Best Party of the player's free Heroes, by name, with the chance it was chosen by; none when no Party meets the requirements", () => {
    const document = newGame();
    const [first, second] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest, Quest];
    first.requirements = { partySizeMin: 1 };
    second.requirements = { partySizeMin: 1, classKey: 'no-such-class' };
    // One Hero away: the Best Party is of the pool, free Heroes only.
    const [away] = heroes(document) as [Hero];
    away.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    const guild = player(document);
    const heroIds = bestParties(document.world, guild, deps).party(first, partyPool(document.world, guild, deps))?.heroIds ?? [];
    const estimate = estimateQuest(document.world, first, heroIds.map((id) => document.world.heroes[id] as Hero), deps);
    const reading: PlayerReading = playerReading(document, deps);

    expect(heroIds.length).toBeGreaterThan(0);
    expect(heroIds).not.toContain(away.id);
    expect(bestPartyReading(reading, first)).toEqual({
      heroIds,
      names: heroIds.map((id: HeroId) => document.world.heroes[id]?.name),
      chance: { band: estimate?.chance, percent: shownPercent(estimate?.success ?? 0) },
    });
    expect(bestPartyReading(reading, second)).toBeNull();
    // Asked again, of the same reading, the same.
    expect(bestPartyReading(reading, first)?.heroIds).toEqual(heroIds);
  });

  // DL-286: the Board's best Party is of the player's pool, the Heroes `playerRestBand` keeps home left out.
  test("leaves out of the Best Party each free Hero at or past the player's rest band, and none with no rest band", () => {
    const document = newGame();
    const [first] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest];
    first.requirements = { partySizeMin: 1 };
    const resting = (playerRestBand: GameConfig['playerRestBand']): EngineDeps => ({ ...deps, config: { ...deps.config, playerRestBand, playerPartyMargin: 0 } });
    const free = heroes(document);
    // Every Hero but one tired.
    for (const hero of free.slice(1)) hero.fatigue = resting('tired').config.fatigueBands.tired;

    expect(bestPartyReading(playerReading(document, resting('tired')), first)?.heroIds).toEqual([free[0]?.id]);
    expect(bestPartyReading(playerReading(document, resting(null)), first)?.heroIds.length).toBeGreaterThan(1);
  });
});
