import {
  addStack,
  advance,
  bankruptcyCountdown,
  createWorld,
  dayOf,
  defaultConfig,
  entriesFor,
  guildmasterOf,
  judgedHintBands,
  nightOf,
  playerGuild,
  potentialHint,
  rankingPlaces,
  rankings,
  sexes,
  signingFee,
  signingRefusal,
  skillsThatHelp,
  timeOfDay,
  transferFee,
  unattachedHeroes,
  unavailability,
  type Guild,
  type Hero,
  type HeroId,
  type PartyId,
  type Quest,
  type QuestId,
  type StopReason,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { partiesOutView } from './digest';
import { played as playedThrough, started } from './game.test-support';
import { initialGameState, type GameState } from './reducer';
import {
  boardView,
  type BoardOrder,
  consumableChoices,
  countdownView,
  guildBackgrounds,
  guildmasterSetupChoices,
  traitBudgetView,
  headerView,
  heroPage,
  partyRows,
  previewView,
  progressView,
  rosterView,
  sentView,
  stopView,
} from './selectors';

// The views' rows (M7-S3): every number is a document field or an engine selector's answer, read
// here beside the selector that gives it, and no row carries a Hero's Potential.

const deps = { config: defaultConfig, content };
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(seed = 'selectors'): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

function played(turns: number, seed = 'selectors-played'): WorldDocument {
  let document = newGame(seed);
  for (let turn = 0; turn < turns; turn += 1) document = advance(document, deps).document;
  return document;
}

function player(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('no player');
  return guild;
}

function heroes(document: WorldDocument): Hero[] {
  return player(document).rosterIds.map((id) => document.world.heroes[id] as Hero);
}

describe('headerView', () => {
  test("names the player's Guild, its Wealth and Fame, the Day and time of day, and its place in the Rankings", () => {
    const document = played(4);
    const guild = player(document);
    // No Quest has come home yet: every Guild is still at Fame 0, so all five share 1st.
    expect(rankingPlaces(document.world, 'fame').map(({ value }) => value)).toEqual([0, 0, 0, 0, 0]);

    expect(headerView(document)).toEqual({
      guildName: 'The Lantern',
      wealth: guild.wealth,
      fame: guild.fame,
      time: `Day ${dayOf(4)}, ${timeOfDay(4)}, Year 0`,
      // The status bar's glyph: Turn 4 is an afternoon; and the time and the place in two parts,
      // the second of each left unshown on a phone (M9-S3, DL-103).
      timeOfDay: 'afternoon',
      when: `Day ${dayOf(4)}, ${timeOfDay(4)}`,
      year: 'Year 0',
      rankings: 'joint 1st of 5 by Fame',
      place: 'joint 1st of 5',
      measure: 'by Fame',
      seed: 'selectors-played',
      countdown: null,
      due: null,
      ended: null,
    });
  });

  test('a new game, every Guild at Fame 0, is joint 1st of 5 by Fame; a place no Guild shares is not joint', () => {
    expect(headerView(newGame())?.rankings).toBe('joint 1st of 5 by Fame');

    const document = structuredClone(newGame());
    const [mine, ...rivals] = Object.values(document.world.guilds);
    if (mine === undefined || mine.id !== player(document).id) throw new Error("the player's Guild is made first");
    const fames = (ours: number, ...others: number[]) => {
      mine.fame = ours;
      rivals.forEach((guild, index) => (guild.fame = others[index] ?? 0));
      return headerView(document)?.rankings;
    };

    expect(fames(9, 4, 4, 1, 0)).toBe('1st of 5 by Fame');
    expect(headerView(document)?.place).toBe('1st of 5');
    expect(fames(4, 9, 4, 1, 0)).toBe('joint 2nd of 5 by Fame');
    expect(fames(1, 9, 4, 4, 0)).toBe('4th of 5 by Fame');
    expect(fames(0, 9, 4, 4, 1)).toBe('5th of 5 by Fame');
    // The engine's `rankings` gives these Guilds ranks 1 to 5, ties by Guild id; it is unchanged.
    expect(rankings(document.world, 'fame').map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test('says how the game ended, once it has', () => {
    const document = structuredClone(newGame());
    document.world.ended = { turn: 30, reason: 'bankruptcy' };

    expect(headerView(document)?.ended).toBe('The game ended on Day 10: The Lantern went bankrupt.');
  });

  test('counts the Guilds in play, a folded one not among them (v1.0.1-S6, DL-97)', () => {
    const document = structuredClone(newGame());
    const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player(document).id);
    if (rival === undefined) throw new Error('expected a Rival');
    rival.foldedOnTurn = 0;

    expect(headerView(document)?.rankings).toBe('joint 1st of 4 by Fame');
  });

  test("says the player's Guild is not ranked once it has folded, with no measure to follow (M9-S3, DL-103)", () => {
    const document = structuredClone(newGame());
    player(document).foldedOnTurn = 0;

    expect(headerView(document)).toMatchObject({ rankings: 'not ranked: the Guild has folded', place: 'not ranked: the Guild has folded', measure: '' });
  });
});

describe('the Bankruptcy countdown: countdownView, in the header (v1.0.1-S4, DL-95)', () => {
  /** A new game whose player's Guild starts below the floor, played through the night of Day 0. */
  function belowTheFloor(config: Partial<typeof defaultConfig> = {}): WorldDocument {
    const start = structuredClone(newGame('countdown'));
    start.meta.config = { ...start.meta.config, ...config };
    player(start).wealth = start.meta.config.bankruptcyFloor - 1;
    const playDeps = { config: { ...defaultConfig, ...start.meta.config }, content };
    let document = start;
    while (document.world.turn < nightOf(0)) document = advance(document, playDeps).document;
    return document;
  }

  const sentence = (sinceDay: number, dueDay: number, floor = 0) =>
    `The Lantern has been below the Bankruptcy floor since Day ${sinceDay}: Bankruptcy on the night of Day ${dueDay} ` +
    `unless Wealth is back to ${floor} or more on a night by then, after any Upkeep due.`;

  test("is none while the player's Guild's belowFloorSince is null", () => {
    const document = played(6);
    expect(player(document).belowFloorSince).toBeNull();

    expect(countdownView(document)).toBeNull();
    expect(headerView(document)?.countdown).toBeNull();
    expect(headerView(document)?.due).toBeNull();
  });

  test("while it is set, says since which Day and on which Day's night Bankruptcy falls, under the game's own grace", () => {
    const document = belowTheFloor();
    expect(player(document).belowFloorSince).toBe(nightOf(0));
    const due = bankruptcyCountdown(player(document), document.meta.config)?.dueDay;
    expect(due).toBe(defaultConfig.bankruptcyGraceDays);

    expect(countdownView(document)).toBe(sentence(0, defaultConfig.bankruptcyGraceDays));
    expect(headerView(document)?.countdown).toBe(sentence(0, defaultConfig.bankruptcyGraceDays));
    // The status bar's pill says when, in a few words (M9-S3, DL-103).
    expect(headerView(document)?.due).toBe(`Bankruptcy on the night of Day ${defaultConfig.bankruptcyGraceDays}`);
    expect(headerView(belowTheFloor({ bankruptcyGraceDays: 10 }))?.due).toBe('Bankruptcy on the night of Day 10');
    // The game's own rules, not this release's defaults: a save playing under a grace of 10 Days.
    expect(countdownView(belowTheFloor({ bankruptcyGraceDays: 10 }))).toBe(sentence(0, 10));
    expect(countdownView(belowTheFloor({ bankruptcyGraceDays: 10, bankruptcyFloor: 50 }))).toBe(sentence(0, 10, 50));
  });

  test("still stands after Wealth rises during a Day, until that night's check clears it; none once the game has ended", () => {
    const document = belowTheFloor({ bankruptcyGraceDays: 10 });
    player(document).wealth = 1_000;
    expect(countdownView(document)).toBe(sentence(0, 10));

    const deps10 = { config: { ...defaultConfig, ...document.meta.config }, content };
    let later = document;
    while (later.world.turn < nightOf(1)) later = advance(later, deps10).document;
    expect(countdownView(later)).toBeNull();

    const ended = structuredClone(belowTheFloor());
    ended.world.ended = { turn: ended.world.turn, reason: 'bankruptcy' };
    expect(countdownView(ended)).toBeNull();
  });
});

describe('boardView', () => {
  test('gives each Quest on the Board in its order, with its terms from its row and the Skills that help from the engine', () => {
    const document = newGame();
    const cards = boardView(document);

    expect(cards.map((card) => card.questId)).toEqual(document.world.board);
    for (const card of cards) {
      const quest = document.world.quests[card.questId];
      if (quest === undefined) throw new Error('no Quest');
      expect(card).toMatchObject({
        name: content.questTemplates[quest.templateKey]?.name,
        difficulty: quest.difficulty,
        reward: quest.reward,
        fame: quest.fameEffect,
        lastDay: dayOf(quest.expiresOnTurn),
        party: `${quest.requirements.partySizeMin} to ${quest.requirements.partySizeMax} Heroes`,
      });
      expect(card.skills).toEqual(skillsThatHelp(quest, content).map((key) => content.skills[key]?.name));
    }
  });
});

describe("the Board's Quest cards (M9-S4, DL-104)", () => {
  /** A new game whose Board's Quests are changed by `change`, in the Board's order. */
  function board(change: (quests: Quest[], document: WorldDocument) => void): WorldDocument {
    const document = structuredClone(newGame());
    change(
      document.world.board.map((id) => document.world.quests[id] as Quest),
      document,
    );
    return document;
  }

  test('gives its Demands as bars of their weights with the Stats named, the Skills that help as a list, and its Encounters counted by kind', () => {
    const document = board(([first]) => {
      if (first === undefined) throw new Error('an empty Board');
      first.demands = [
        ['dexterity', 0.4],
        ['wits', 0.35],
        ['adaptability', 0.25],
      ];
      // stealth, combat, stealth, combat, travel: counted in the order each kind is first met.
      first.encounterKeys = ['past-the-watch', 'ambush-on-the-road', 'the-trapped-passage', 'hold-the-line', 'the-long-march'];
    });

    const [card] = boardView(document);

    expect(card?.demands).toEqual([
      { stat: 'Dexterity', percent: 40 },
      { stat: 'Wits', percent: 35 },
      { stat: 'Adaptability', percent: 25 },
    ]);
    expect(card?.skills).toEqual(['Stealth', 'Lockpicking', 'Swordcraft', 'Tactics', 'Trapcraft', 'Shieldwork', 'Field surgery', 'Herbalism']);
    expect(card?.encounters).toEqual([
      { kind: 'stealth', count: 2, words: 'stealth ×2' },
      { kind: 'combat', count: 2, words: 'combat ×2' },
      { kind: 'travel', count: 1, words: 'travel ×1' },
    ]);
  });

  test('a Quest whose Encounters are drawn on the way counts none, and its Skills are its own', () => {
    const document = board(([first]) => {
      if (first === undefined) throw new Error('an empty Board');
      first.encounterKeys = [];
      first.skillKeys = ['herbalism', 'field-surgery'];
    });

    const [card] = boardView(document);

    expect(card?.encounters).toEqual([]);
    expect(card?.skills).toEqual(['Herbalism', 'Field surgery']);
  });

  test('places its difficulty against the Quests on the Board now, from the easiest to the hardest, as display only', () => {
    const document = board((quests) => {
      expect(quests).toHaveLength(6);
      [54, 19, 89, 40, 40, 70].forEach((difficulty, index) => ((quests[index] as Quest).difficulty = difficulty));
    });

    const cards = boardView(document);
    const meters = cards.map((card) => card.meter);

    // From 19 to 89: 54 sits halfway, 40 three tenths along.
    expect(meters.map(({ lowest, highest }) => [lowest, highest])).toEqual(Array.from({ length: 6 }, () => [19, 89]));
    expect(meters.map((meter) => meter.at)).toEqual([0.5, 0, 1, 0.3, 0.3, 51 / 70].map((at) => expect.closeTo(at, 9)));
    // Each card's others are the rest of the Board, in its order.
    expect(meters[0]?.others).toEqual([0, 1, 0.3, 0.3, 51 / 70].map((at) => expect.closeTo(at, 9)));
    expect(cards.map((card) => card.hardness)).toEqual([
      '3rd hardest of the 6 Quests on the Board',
      'the easiest of the 6 Quests on the Board',
      'the hardest of the 6 Quests on the Board',
      'joint 4th hardest of the 6 Quests on the Board',
      'joint 4th hardest of the 6 Quests on the Board',
      '2nd hardest of the 6 Quests on the Board',
    ]);
  });

  test('a Quest alone on the Board, or of one difficulty with the rest, sits in the middle', () => {
    const alone = board(([first], document) => {
      if (first === undefined) throw new Error('an empty Board');
      first.difficulty = 54;
      document.world.board = [first.id];
    });
    const alike = board((quests) => {
      for (const quest of quests) quest.difficulty = 40;
    });

    expect(boardView(alone)[0]?.meter).toEqual({ lowest: 54, highest: 54, at: 0.5, others: [] });
    expect(boardView(alone)[0]?.hardness).toBe('the only Quest on the Board');
    expect(boardView(alike)[0]?.meter).toEqual({ lowest: 40, highest: 40, at: 0.5, others: [0.5, 0.5, 0.5, 0.5, 0.5] });
    expect(boardView(alike)[0]?.hardness).toBe('joint hardest of the 6 Quests on the Board');
  });

  test('names each requirement beyond the Party size, and marks a Quest whose last Day on the Board is today', () => {
    const document = board(([first, second]) => {
      if (first === undefined || second === undefined) throw new Error('expected two Quests');
      first.requirements = { partySizeMin: 2, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };
      second.requirements = { partySizeMin: 1, partySizeMax: 2 };
      // Day 0, the Day in hand: its night is Turn 2.
      second.expiresOnTurn = 2;
      first.expiresOnTurn = 8;
    });

    const [first, second] = boardView(document);

    expect(first).toMatchObject({ needs: ['a Mage', 'a Hero with Lockpicking'], lastDay: 2, leavesToday: false });
    expect(second).toMatchObject({ needs: [], lastDay: 0, leavesToday: true });
  });

  test('orders the Board by reward, highest first; by difficulty, easiest first; or by the Day each leaves, soonest first; ties as the Board has them', () => {
    const document = board((quests) => {
      const set = (field: 'reward' | 'difficulty' | 'expiresOnTurn', values: number[]) =>
        values.forEach((value, index) => ((quests[index] as Quest)[field] = value));
      set('reward', [96, 188, 207, 216, 207, 378]);
      set('difficulty', [24, 47, 46, 54, 23, 84]);
      // Days 2, 1, 2, 0, 3 and 1.
      set('expiresOnTurn', [8, 5, 8, 2, 11, 5]);
    });
    const posted = document.world.board;
    const nth = (...places: number[]) => places.map((place) => posted[place - 1]);
    const order = (by: BoardOrder) => boardView(document, by).map((card) => card.questId);

    expect(order('posted')).toEqual(posted);
    expect(boardView(document).map((card) => card.questId)).toEqual(posted);
    expect(order('reward')).toEqual(nth(6, 4, 3, 5, 2, 1));
    expect(order('difficulty')).toEqual(nth(5, 1, 3, 2, 4, 6));
    expect(order('leaves')).toEqual(nth(4, 2, 6, 1, 3, 5));
    // The order is display only: each card is the card the Board's order gives.
    expect(boardView(document, 'reward').find((card) => card.questId === posted[0])).toEqual(boardView(document)[0]);
  });
});

describe('the Party builder (M9-S4, DL-104)', () => {
  /**
   * A new game whose first Quest demands Strength, Willpower and Courage, requires Herbalism, and
   * meets the restless dead and a hostile reeve, whose Checks read Benediction and Swordcraft; its
   * four Heroes are Bram (a Healer with Herbalism 1 and Benediction 2), Liv (a Warrior with
   * Swordcraft 2 and Tactics 1), Cenric (a Rogue) and Ragnvald (a Mage).
   */
  function builder(): { document: WorldDocument; quest: Quest; bram: Hero; liv: Hero; cenric: Hero; ragnvald: Hero } {
    const document = structuredClone(newGame());
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    quest.demands = [
      ['strength', 0.4],
      ['willpower', 0.3],
      ['courage', 0.3],
    ];
    quest.requirements = { partySizeMin: 1, partySizeMax: 3, skillKey: 'herbalism' };
    quest.encounterKeys = ['the-restless-dead', 'a-hostile-reeve'];
    const [bram, liv, cenric, ragnvald] = heroes(document);
    if (bram === undefined || liv === undefined || cenric === undefined || ragnvald === undefined) throw new Error('four Heroes');
    expect([bram.name, liv.name, cenric.name, ragnvald.name]).toEqual(['Bram Netherby', 'Liv Coldharbour', 'Cenric Yarrow', 'Ragnvald Brackenridge']);
    return { document, quest, bram, liv, cenric, ragnvald };
  }

  test("gives each Hero on the Roster a row: Class and Level, Morale and its band, the effective values of the Stats the Quest demands, and its Skills they have", () => {
    const { document, quest, bram, liv } = builder();
    liv.morale = 15;
    // An arming sword lifts Liv's Strength by 1: the value a Check reads, not the base.
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    const rows = partyRows(document, quest.id);

    expect(rows?.map((row) => row.heroId)).toEqual(player(document).rosterIds);
    expect(rows?.[0]).toEqual({
      heroId: bram.id,
      name: 'Bram Netherby',
      className: 'Healer',
      level: 1,
      morale: 60,
      moraleBand: 'steady',
      why: null,
      unavailable: null,
      stats: [
        { name: 'Strength', value: bram.stats.strength },
        { name: 'Willpower', value: bram.stats.willpower },
        { name: 'Courage', value: bram.stats.courage },
      ],
      // The Skill the Quest requires first, then those that help, as the Hero has them.
      skills: [
        { name: 'Herbalism', rating: 1 },
        { name: 'Benediction', rating: 2 },
      ],
    });
    expect(rows?.[1]).toMatchObject({
      className: 'Warrior',
      morale: 15,
      moraleBand: 'wretched',
      stats: [
        { name: 'Strength', value: (liv.stats.strength ?? 0) + 1 },
        { name: 'Willpower', value: liv.stats.willpower },
        { name: 'Courage', value: liv.stats.courage },
      ],
      skills: [{ name: 'Swordcraft', rating: 2 }],
    });
    // A Rogue and a Mage have none of this Quest's Skills.
    expect(rows?.slice(2).map((row) => row.skills)).toEqual([[], []]);
  });

  test("the values are those the Hero's page shows: its effective Stats and its Skills' ratings", () => {
    const { document, quest, liv } = builder();
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    for (const row of partyRows(document, quest.id) ?? []) {
      const page = heroPage(document, row.heroId);
      for (const stat of row.stats) expect(stat.value).toBe(page?.areas.flatMap((area) => area.stats).find((each) => each.name === stat.name)?.value);
      for (const skill of row.skills) expect(page?.skills).toContainEqual(skill);
      const card = rosterView(document).find((each) => each.heroId === row.heroId);
      expect([row.morale, row.moraleBand]).toEqual([card?.morale, card?.moraleBand]);
      expect([row.morale, row.moraleBand]).toEqual([page?.morale.value, page?.morale.band]);
    }
  });

  test('says why a Hero cannot go and until when: the engine’s unavailability, with the night the Injury heals or the Party returns', () => {
    const { document, quest, cenric, ragnvald } = builder();
    cenric.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    const partyId = 'party-000099' as PartyId;
    document.world.parties[partyId] = {
      id: partyId,
      questId: document.world.board[1] as QuestId,
      guildId: player(document).id,
      heroIds: [ragnvald.id],
      departedOnTurn: 0,
      returnsOnTurn: 17,
    };
    ragnvald.partyId = partyId;

    const rows = partyRows(document, quest.id);

    expect(rows?.map(({ why, unavailable }) => ({ why, unavailable }))).toEqual([
      { why: null, unavailable: null },
      { why: null, unavailable: null },
      { why: 'injured', unavailable: 'injured, healing on the night of Day 6' },
      { why: 'in-party', unavailable: 'away with a Party, back on the night of Day 5' },
    ]);
    for (const row of rows ?? []) expect(row.why).toBe(unavailability(document.world.heroes[row.heroId] as Hero));
    // As the Roster words it.
    expect(rows?.slice(2).map((row) => row.unavailable)).toEqual(rosterView(document).slice(2).map((row) => row.whereabouts));
  });

  test('is null for a Quest not on the Board', () => {
    expect(partyRows(newGame(), 'quest-999999' as QuestId)).toBeNull();
  });
});

describe('choosing a Party', () => {
  test('offers the consumables the Guild holds, how many and what each does', () => {
    const document = newGame();
    const choices = consumableChoices(document);

    for (const choice of choices) {
      expect(content.items[choice.definitionKey]?.kind).toBe('consumable');
      expect(choice.held).toBeGreaterThan(0);
      expect(choice.does).toMatch(/Check|Injury/);
    }
  });

  test("previews a Party through the engine's preview: requirements, Synergies, the reward agreed and dispatch's verdict", () => {
    const document = newGame();
    const quest = document.world.quests[document.world.board[0] as QuestId];
    if (quest === undefined) throw new Error('no Quest');
    const party = heroes(document).slice(0, quest.requirements.partySizeMax).map((hero) => hero.id);

    const preview = previewView(document, quest.id, party, []);
    const nobody = previewView(document, quest.id, [], []);

    expect(preview?.requirements[0]).toEqual({
      words: `A Party of ${quest.requirements.partySizeMin} to ${quest.requirements.partySizeMax} (${party.length} chosen)`,
      met: party.length >= quest.requirements.partySizeMin,
    });
    expect(preview?.synergies.length).toBeGreaterThan(0);
    expect(preview?.reward).toMatch(new RegExp(`^Reward agreed on a success: \\d+ Wealth, ${quest.reward} offered\\.$`));
    expect(nobody?.verdict).toEqual({ sends: false, words: expect.stringMatching(/^Dispatch would refuse it: .+ needs a Party of/) });
    expect(nobody?.requirements[0]?.met).toBe(false);
    expect(previewView(document, 'quest-999999' as QuestId, party, [])).toBeNull();
  });
});

describe('rosterView', () => {
  test("lists the player's Roster in its order with Level, age, Morale and whereabouts", () => {
    const document = structuredClone(newGame());
    const [first] = heroes(document);
    if (first === undefined) throw new Error('no Hero');
    first.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };

    const rows = rosterView(document);

    expect(rows.map((row) => row.heroId)).toEqual(player(document).rosterIds);
    expect(rows[0]?.whereabouts).toBe('injured, healing on the night of Day 6');
    expect(rows[1]?.whereabouts).toBe('at the Hall');
  });

  test("gives each card its Morale and band apart, and why a Hero is not at the Hall, for the icon beside its words (M9-S6, DL-106)", () => {
    const document = structuredClone(newGame());
    const [injured, away, home] = heroes(document);
    if (injured === undefined || away === undefined || home === undefined) throw new Error('three Heroes wanted');
    injured.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    injured.morale = 12;
    away.partyId = 'party-000009' as PartyId;
    document.world.parties['party-000009' as PartyId] = {
      id: 'party-000009' as PartyId,
      questId: 'quest-000001' as QuestId,
      guildId: player(document).id,
      heroIds: [away.id],
      departedOnTurn: 0,
      returnsOnTurn: 14,
    };
    away.morale = 80;
    home.morale = 50;

    const [first, second, third] = rosterView(document);

    expect(first).toMatchObject({ morale: 12, moraleBand: 'wretched', why: 'injured', whereabouts: 'injured, healing on the night of Day 6' });
    expect(second).toMatchObject({ morale: 80, moraleBand: 'high', why: 'in-party', whereabouts: 'away with a Party, back on the night of Day 4' });
    expect(third).toMatchObject({ morale: 50, moraleBand: 'steady', why: null, whereabouts: 'at the Hall' });
  });
});

describe('heroPage', () => {
  test("shows each Stat's base, effective value and hint, never its Potential", () => {
    const document = newGame();
    const guild = player(document);
    const bands = { potentialHintBands: judgedHintBands(guildmasterOf(guild, document.world), content, defaultConfig) };

    for (const hero of Object.values(document.world.heroes)) {
      const page = heroPage(document, hero.id);
      const stats = Object.values(content.stats).filter((stat) => stat.owner === 'hero');

      const rows = page?.areas.flatMap((area) => area.stats) ?? [];
      expect(rows.map((row) => row.outlook)).toEqual(stats.map((stat) => potentialHint(hero, stat.key, bands)));
      expect(rows.map((row) => row.base)).toEqual(stats.map((stat) => hero.stats[stat.key]));
      expect(JSON.stringify(page)).not.toMatch(/potential/i);
    }
  });

  test('shows its Milestones first, newest first; its History, a page at a time, is the History view\'s (M9-S5)', () => {
    const document = played(240);
    // The busiest Hero of the world: a Rival's, whose Guild sends Parties while the player's rests.
    const hero = Object.values(document.world.heroes).reduce((most, each) =>
      entriesFor(document.history, each.id).length > entriesFor(document.history, most.id).length ? each : most,
    );
    const all = entriesFor(document.history, hero.id);
    const page = heroPage(document, hero.id);

    expect(page?.milestones.every((line) => line.milestone)).toBe(true);
    expect(page?.milestones).toHaveLength(all.filter((entry) => entry.milestone).length);
    expect(page?.milestones[0]?.when).toBe(`Day ${dayOf(all.find((entry) => entry.milestone)?.turn ?? 0)}, ${timeOfDay(all.find((entry) => entry.milestone)?.turn ?? 0)}`);
    expect(page).not.toHaveProperty('history');
  });

  test('is null for a Hero the world does not hold', () => {
    expect(heroPage(newGame(), 'hero-999999' as HeroId)).toBeNull();
  });

  test('says an Unattached Hero is in the pool, not at a Hall', () => {
    const document = newGame();
    const [pooled] = unattachedHeroes(document.world);
    if (pooled === undefined) throw new Error('an empty pool');

    expect(heroPage(document, pooled.id)?.where).toEqual({ why: null, words: 'in the Unattached pool' });
  });
});

describe("a Hero's page as a header line and chips (M9-S6, DL-106)", () => {
  test('says who the Hero is in one line: Class, Level, age, sex, Background and Guild', () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    hero.classKey = 'rogue';
    hero.level = 3;
    hero.sex = 'female';
    hero.backgroundKey = 'poachers-child';
    hero.ageAtEntry = 18;
    hero.enteredTurn = 0;

    expect(heroPage(document, hero.id)?.line).toEqual(['Rogue', 'Level 3', 'age 18', 'female', content.backgrounds['poachers-child']?.name, 'of The Lantern']);
  });

  test('gives Morale with its band, where the Hero is and why they cannot go, the Injury, XP and Traits as chips', () => {
    const document = structuredClone(newGame());
    const [hero, other] = heroes(document);
    if (hero === undefined || other === undefined) throw new Error('two Heroes wanted');
    hero.morale = 30;
    hero.xp = 45;
    hero.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    hero.traits = ['scarred' as never];

    const page = heroPage(document, hero.id);

    expect(page).toMatchObject({
      morale: { value: 30, band: 'low' },
      where: { why: 'injured', words: 'injured, healing on the night of Day 6' },
      injury: content.injuries['deep-cut']?.name,
      xp: 45,
      traits: [content.traits.scarred?.name ?? 'scarred'],
      fee: null,
    });
    expect(heroPage(document, other.id)).toMatchObject({ where: { why: null, words: 'at the Hall' }, injury: null, traits: [] });
  });

  test('gives the Stats in four area blocks, in content’s order, each with the value a Check reads and what gear and the Guildmaster’s Traits add', () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    hero.classKey = 'mage';
    const guildmaster = guildmasterOf(player(document), document.world);
    if (guildmaster === undefined) throw new Error('no Guildmaster');
    guildmaster.traits = ['mistrusts-magic' as never];
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: hero.id, slot: 'weapon' });

    const areas = heroPage(document, hero.id)?.areas ?? [];

    expect(areas.map((area) => [area.name, area.stats.length])).toEqual([
      ['Physical', 5],
      ['Mental', 6],
      ['Magical', 5],
      ['Social', 4],
    ]);
    const stat = (name: string) => areas.flatMap((area) => area.stats).find((row) => row.name === name);
    const base = (key: string): number => hero.stats[key] ?? 0;
    // The arming sword: Weaponry +2 and Strength +1; Mistrusts magic: −1 Arcana to Mages.
    expect(stat('Weaponry')).toMatchObject({ value: base('weaponry') + 2, lift: { words: '+2', up: true } });
    expect(stat('Strength')).toMatchObject({ value: base('strength') + 1, lift: { words: '+1', up: true } });
    expect(stat('Arcana')).toMatchObject({ value: base('arcana') - 1, lift: { words: '-1', up: false } });
    expect(stat('Wits')).toMatchObject({ value: base('wits'), lift: null });
    expect(JSON.stringify(areas)).not.toMatch(/potential/i);
  });

  test('gives each other Hero on the Roster as a Relationship, marked neutral when both bands are, for the page to fold', () => {
    const document = structuredClone(newGame());
    const [hero, liked, disliked, stranger] = heroes(document);
    if (hero === undefined || liked === undefined || disliked === undefined || stranger === undefined) throw new Error('four Heroes wanted');
    hero.regard[liked.id] = { value: 8, since: 0, reason: 'test' };
    disliked.regard[hero.id] = { value: -30, since: 0, reason: 'test' };

    const rows = heroPage(document, hero.id)?.relationships ?? [];

    expect(rows.find((row) => row.name === liked.name)).toMatchObject({ regard: 'warm', neutral: false });
    expect(rows.find((row) => row.name === disliked.name)).toMatchObject({ regard: 'neutral', neutral: false });
    expect(rows.find((row) => row.name === stranger.name)).toMatchObject({ regard: 'neutral', relationship: 'neutral', neutral: true });
  });

  test("a dead Hero's whereabouts say when they died, and why they cannot go", () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    hero.diedOnTurn = 9;

    expect(heroPage(document, hero.id)?.where).toEqual({ why: 'dead', words: 'died on Day 3' });
  });
});

describe("a Hero's page offers what can be done with the Hero", () => {
  test("for the player's Hero: the Guild's gear to equip, what they carry to unequip, and every other Guild in play with the fee it would pay", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    addStack(document.world, 'arming-sword', 1, { kind: 'guild', id: guild.id });
    addStack(document.world, 'healing-draught', 2, { kind: 'guild', id: guild.id });
    addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: hero.id, slot: 'armour' });
    const [folded, ...others] = Object.values(document.world.guilds).filter((each) => each.id !== guild.id);
    if (folded === undefined) throw new Error('no Rival');
    folded.foldedOnTurn = 0;

    const page = heroPage(document, hero.id);

    expect(page?.actions).toMatchObject({ kind: 'own' });
    if (page?.actions?.kind !== 'own') throw new Error("not the player's Hero");
    expect(page.actions.equip.map(({ name, kind, gear }) => ({ name, kind, stack: 'stackId' in gear }))).toEqual([
      { name: content.items['arming-sword']?.name, kind: 'weapon gear', stack: true },
    ]);
    expect(page.gear.filter((row) => row.worn).map((row) => row.slot)).toEqual(['armour']);
    expect(page.gear.map(({ slotName, item, worn }) => [slotName, item, worn])).toEqual([
      ['Weapon', 'none', false],
      ['Armour', 'Padded jack', true],
      ['Trinket', 'none', false],
    ]);
    expect(page.actions.transferTo).toEqual(
      others.map((other) => {
        const fee = transferFee(hero, guildmasterOf(other, document.world), deps);
        return { guildId: other.id, name: other.name, fee, sentence: expect.stringContaining(`${other.name} would pay ${fee} Wealth for ${hero.name}`) };
      }),
    );
  });

  test("asks before a Transfer out, stating the fee and the Morale it costs in the words the page gives them (M9-S6, the review's E4)", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    hero.name = 'Finn Grimshaw';
    const other = Object.values(document.world.guilds).find((each) => each.id !== guild.id);
    if (other === undefined) throw new Error('no Rival');
    other.name = 'The Ashford Guild';

    const page = heroPage(document, hero.id);
    if (page?.actions?.kind !== 'own') throw new Error("not the player's Hero");
    const target = page.actions.transferTo.find((each) => each.guildId === other.id);

    expect(target?.sentence).toBe(
      `The Ashford Guild would pay ${target?.fee} Wealth for Finn Grimshaw, if it is willing to take them. Their gear stays with your ` +
        'Guild, and the Heroes left behind who held them in high Regard lose Morale.',
    );
  });

  test("for a Rival's Hero, the fee the player's Guild would pay to take them in; for an Unattached one, the signing fee and whether they sign, in words and as a verdict", () => {
    const document = newGame();
    const guild = player(document);
    const buyer = guildmasterOf(guild, document.world);
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id);
    const theirs = document.world.heroes[rival?.rosterIds[0] ?? ('' as HeroId)];
    const [pooled] = unattachedHeroes(document.world);
    if (theirs === undefined || pooled === undefined) throw new Error('no Hero');

    expect(heroPage(document, theirs.id)?.actions).toEqual({ kind: 'rival', guildName: rival?.name, fee: transferFee(theirs, buyer, deps) });
    const refusal = signingRefusal(guild, pooled, defaultConfig);
    expect(heroPage(document, pooled.id)?.actions).toEqual({
      kind: 'pool',
      fee: signingFee(pooled, deps, buyer),
      signs: refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}`,
      willSign: refusal === null,
    });
    // One who needs more Fame than the Guild has will not sign (DL-109 item 2, Q17).
    guild.fame = 0;
    pooled.level = 4;
    expect(heroPage(document, pooled.id)?.actions).toMatchObject({ kind: 'pool', signs: 'needs Fame 30', willSign: false });
  });

  test("shows on every Rival Hero's page, among its chips, the Transfer fee the player's Guild would pay: its actions' fee (DL-74)", () => {
    const document = newGame();
    const buyer = guildmasterOf(player(document), document.world);
    const rivals = Object.values(document.world.guilds).filter((each) => each.id !== player(document).id);
    let seller = 0;
    for (const rival of rivals) {
      for (const heroId of rival.rosterIds) {
        const hero = document.world.heroes[heroId] as Hero;
        const page = heroPage(document, heroId);
        const fee = transferFee(hero, buyer, deps);

        expect(page?.fee).toBe(fee);
        expect(page?.actions).toMatchObject({ kind: 'rival', fee });
        // The fee at the selling Guild's own Guildmaster's Negotiation is another number for most.
        if (transferFee(hero, guildmasterOf(rival, document.world), deps) !== fee) seller += 1;
      }
    }
    expect(seller).toBeGreaterThan(0);
  });

  test('for a Hero who has died, nothing', () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    player(document).rosterIds = player(document).rosterIds.filter((id) => id !== hero.id);
    hero.diedOnTurn = 3;

    expect(heroPage(document, hero.id)?.actions).toBeNull();
  });
});

describe('after a send (M9-S4, DL-104)', () => {
  test("names the Quest the player's Party was sent on by the last play, who went and the night they return, as the home view's Parties out does", () => {
    const state = started('selectors');
    const document = state.document as WorldDocument;
    const [quest] = boardView(document);
    const [first, second] = heroes(document);
    if (quest === undefined || first === undefined || second === undefined) throw new Error('a Quest and two Heroes');

    const sent = playedThrough(state, { kind: 'dispatch', questId: quest.questId, heroIds: [first.id, second.id] });

    expect(sent.rejection).toBeNull();
    const [out] = partiesOutView(sent.document as WorldDocument);
    expect(sentView(sent)).toEqual({
      questId: quest.questId,
      quest: quest.name,
      heroes: `${first.name} and ${second.name}`,
      returns: out?.returns,
    });
    expect(out?.returns).toMatch(/^the night of Day \d+$/);
  });

  test('is none after a play that sent no Party of the player’s, a Rival’s among them, and before a game', () => {
    const state = started('selectors');
    expect(sentView(state)).toBeNull();
    // A month of Turns: the Rivals send Parties in the afternoons.
    const month = playedThrough(state, { kind: 'advance', turns: 90 });
    expect(month.log.some((event) => event.type === 'quest.taken')).toBe(true);
    expect(sentView(month)).toBeNull();
    expect(sentView(initialGameState)).toBeNull();
  });
});

describe('the log and why time stopped', () => {
  test('says why a fast forward stopped, and nothing after a play that was not one', () => {
    const document = newGame();
    const state: GameState = { ...initialGameState, document, stoppedBecause: { kind: 'max-turns' } };

    expect(stopView(state)).toEqual({ kind: 'max-turns', sentence: `Stopped: played the most Turns allowed, ${defaultConfig.turnsPerYear}.` });
    expect(stopView({ ...state, stoppedBecause: null })).toBeNull();
  });

  test('names each Quest a decision-needed stop names that is still on the Board, as the Board names it (M9-S3, DL-103)', () => {
    const document = newGame();
    const [first, second] = boardView(document);
    if (first === undefined || second === undefined) throw new Error('expected two Quests on the Board');
    const gone = 'quest-999999' as QuestId;
    const stoppedBecause: StopReason = { kind: 'decision-needed', guildId: player(document).id, questIds: [second.questId, gone, first.questId] };
    const state: GameState = { ...initialGameState, document, stoppedBecause };

    expect(stopView(state)?.quests).toEqual([
      { questId: second.questId, name: second.name, patron: second.patron, reward: second.reward },
      { questId: first.questId, name: first.name, patron: first.patron, reward: first.reward },
    ]);
    // Any other stop names none.
    expect(stopView({ ...state, stoppedBecause: { kind: 'max-turns' } })?.quests).toBeUndefined();
  });

  test("says the player's Stop in the page's own words, with the stops it was asked for (v1.0.1-S5, DL-96)", () => {
    const document = newGame();
    const state: GameState = { ...initialGameState, document, stopped: { until: ['pool-refreshed'], turnsPlayed: 90 } };

    expect(stopView(state)).toEqual({ kind: 'player', sentence: 'Stopped: you asked to stop, after 90 Turns.', until: ['pool-refreshed'] });
  });
});

describe('the progress of a fast forward between its steps (v1.0.1-S5, DL-96)', () => {
  /** A fast forward between steps: the game held 90 Turns on from `document`, played under its own rules. */
  function between(document: WorldDocument): GameState {
    const own = { config: { ...defaultConfig, ...document.meta.config }, content };
    let played = document;
    for (let turn = 0; turn < 90; turn += 1) played = advance(played, own).document;
    return { ...initialGameState, document, busy: true, forwarding: { until: [], turnsPlayed: 90, document: played, events: [] } };
  }

  test('is none while no fast forward is between its steps', () => {
    expect(progressView(initialGameState)).toBeNull();
    expect(progressView({ ...initialGameState, document: newGame() })).toBeNull();
  });

  test('gives the Turns played and the Day reached from the game the last step left, not the game in hand', () => {
    expect(progressView(between(newGame()))).toEqual({ sentence: 'Played 90 Turns so far. Now Day 30, morning, Year 0.', countdown: null });
  });

  test("gives the Year under the game's own turnsPerYear (v1.0.1-S6, DL-97)", () => {
    const document = structuredClone(newGame());
    document.meta.config = { ...document.meta.config, turnsPerYear: 30 };

    expect(progressView(between(document))?.sentence).toBe('Played 90 Turns so far. Now Day 30, morning, Year 3.');
  });

  test("gives the countdown while the player's Guild is below the floor in that game, under the game's own grace", () => {
    const document = structuredClone(newGame());
    document.meta.config = { ...document.meta.config, bankruptcyGraceDays: 60 };
    player(document).wealth = -5_000;
    const state = between(document);

    expect(state.forwarding === null ? null : countdownView(state.forwarding.document)).not.toBeNull();
    expect(progressView(state)).toEqual({
      sentence: 'Played 90 Turns so far. Now Day 30, morning, Year 0.',
      countdown:
        'The Lantern has been below the Bankruptcy floor since Day 0: Bankruptcy on the night of Day 60 unless Wealth is back ' +
        'to 0 or more on a night by then, after any Upkeep due.',
    });
    // The game in hand, before the first night's check, has none.
    expect(countdownView(document)).toBeNull();
  });
});

describe("the Guildmaster's setup, for the new-game form (M9-S2)", () => {
  test('offers the sexes, the starting ages, the budget, the most Traits, and the three descriptive Attributes with their bounds', () => {
    const choices = guildmasterSetupChoices();

    expect(choices).toMatchObject({ sexes: ['female', 'male'], ageMin: 30, ageMax: 45, traitBudget: 1, traitsMax: 2 });
    // The sexes are the engine's own, which createWorld checks a setup against (the M9 review).
    expect(choices.sexes).toBe(sexes);
    expect(choices.attributes).toEqual([
      { attribute: 'birthplace', label: 'Birthplace', maxLength: 60 },
      { attribute: 'appearance', label: 'Appearance', maxLength: 280 },
      { attribute: 'biography', label: 'Biography', maxLength: 1000 },
    ]);
  });

  test('offers each Guildmaster Trait by name, with what it does, its cost and the Traits it excludes, and no Hero Trait', () => {
    const { traits } = guildmasterSetupChoices();

    expect(traits.map(({ key }) => key).sort()).toEqual(['miser', 'mistrusts-magic', 'old-soldier', 'spendthrift', 'thrifty', 'well-liked']);
    expect(traits.find(({ key }) => key === 'miser')).toEqual({
      key: 'miser',
      name: 'Miser',
      effect: 'Morale baseline -5',
      cost: -2,
      excludes: [
        { key: 'spendthrift', name: 'Spendthrift' },
        { key: 'well-liked', name: 'Well liked' },
      ],
    });
    expect(traits.find(({ key }) => key === 'old-soldier')).toMatchObject({ effect: '+1 Weaponry to Warriors', cost: 1, excludes: [] });
    expect(traits.find(({ key }) => key === 'thrifty')).toMatchObject({ effect: 'Upkeep ×0.9', cost: 2 });
  });

  test('reads the budget and the bounds from the config it is given', () => {
    const wider = { ...defaultConfig, guildmasterTraitBudget: 3, guildmasterTraitsMax: 3, guildmasterStartingAgeMax: 50 };
    expect(guildmasterSetupChoices(content, wider)).toMatchObject({ traitBudget: 3, traitsMax: 3, ageMax: 50 });
  });

  test("says what the Traits chosen cost and how much of the budget is left, by the engine's sum", () => {
    expect(traitBudgetView([])).toEqual({ spent: 0, left: 1 });
    expect(traitBudgetView(['miser'])).toEqual({ spent: -2, left: 3 });
    expect(traitBudgetView(['miser', 'thrifty'])).toEqual({ spent: 0, left: 1 });
    expect(traitBudgetView(['well-liked'])).toEqual({ spent: 2, left: -1 });
  });
});

describe('guildBackgrounds', () => {
  test("offers the content's Guild Backgrounds and no other", () => {
    const backgrounds = guildBackgrounds();

    expect(backgrounds.length).toBeGreaterThan(0);
    for (const { key } of backgrounds) expect(content.backgrounds[key]?.owner).toBe('guild');
  });
});
