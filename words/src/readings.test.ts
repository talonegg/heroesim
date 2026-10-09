import { loadContent } from '@heroesim/content/node';
import {
  addStack,
  ageOf,
  availableHeroes,
  bestParties,
  createWorld,
  defaultConfig,
  descriptiveAttributeLabels,
  effectiveStats,
  estimateQuest,
  guildmasterOf,
  judgedHintBands,
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
import { createItem, nightOf, potentialHints } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { encounterReadings, shownPercent } from './query.js';
import {
  bestPartyReading,
  boardReading,
  heroReading,
  playerReading,
  poolNote,
  poolReading,
  rosterReading,
  signsWords,
  type HeroReading,
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
        const fee = transferFee(hero, buyer, deps);
        expect(read(document, hero)).toMatchObject({ transferFee: fee, signing: null, guild: { id: rival.id, name: rival.name } });
        if (transferFee(hero, guildmasterOf(rival, document.world), deps) !== fee) seller += 1;
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
        background: content.backgrounds[hero.backgroundKey]?.name,
        transferFee: null,
      });
    }
    expect(rosterReading(reading, rival).map((row) => [row.id, row.transferFee])).toEqual(
      rival.rosterIds.map((id) => [id, transferFee(document.world.heroes[id] as Hero, buyer, deps)]),
    );
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

describe("a Quest's reading", () => {
  test("gives the Quests on the Board in its order, each with its template's name, its Patron, its terms and what it requires", () => {
    const document = newGame();
    const [first] = document.world.board.map((id) => document.world.quests[id] as Quest);
    if (first === undefined) throw new Error('an empty Board');
    first.requirements = { partySizeMin: 2, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };

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
        partySizeMax: quest.requirements.partySizeMax,
        expiresOnTurn: quest.expiresOnTurn,
        encounters: encounterReadings(quest, content),
      });
    }
    expect(quests[0]).toMatchObject({ classRequired: 'Mage', skillRequired: 'Lockpicking' });
    expect(quests[1]).toMatchObject({ classRequired: null, skillRequired: null });
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

  test('gives none of the Encounters of a Quest saved before they were drawn when posted: they are drawn on the way (DL-42)', () => {
    const document = newGame();
    const quest = document.world.quests[document.world.board[0] as Quest['id']] as Quest;
    quest.encounterKeys = [];

    expect(boardReading(playerReading(document, deps))[0]?.encounters).toEqual([]);
  });

  test("gives the Best Party of the player's free Heroes, by name, with the chance it was chosen by; none when no Party meets the requirements", () => {
    const document = newGame();
    const [first, second] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest, Quest];
    first.requirements = { partySizeMin: 1, partySizeMax: 4 };
    second.requirements = { partySizeMin: 1, partySizeMax: 4, classKey: 'no-such-class' };
    // One Hero away: the Best Party is of the free Heroes only.
    const [away] = heroes(document) as [Hero];
    away.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    const guild = player(document);
    const heroIds = bestParties(document.world, guild, deps).party(first, availableHeroes(document.world, guild))?.heroIds ?? [];
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
});
