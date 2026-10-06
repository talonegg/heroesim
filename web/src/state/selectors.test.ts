import {
  addStack,
  advance,
  availableHeroes,
  bankruptcyCountdown,
  createWorld,
  dayOf,
  defaultConfig,
  effectiveStats,
  entriesFor,
  estimateQuest,
  guildmasterOf,
  judgedHintBands,
  milestoneTypes,
  playerGuild,
  potentialHint,
  rankingPlaces,
  rankings,
  sexes,
  signingFee,
  signingRefusal,
  skillsThatHelp,
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
import { append, createItem, nightOf, partyFor } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { chanceWords, dateOfTurn, listed, shownPercent, whenOfTurn } from '@heroesim/words';
import { content } from '../content';
import { partiesOutView } from './digest';
import { played as playedThrough, started } from './game.test-support';
import { initialGameState, type GameState } from './reducer';
import {
  bestPartyView,
  boardView,
  type BoardOrder,
  consumableChoices,
  countdownView,
  defaultHeroOrder,
  guildBackgrounds,
  guildmasterSetupChoices,
  traitBudgetView,
  headerView,
  heroPage,
  partyRows,
  previewView,
  progressView,
  orderWords,
  reverseOrderName,
  rosterColumnGroups,
  rosterSortChoices,
  rosterRows,
  sentView,
  sortedRoster,
  stopView,
  type RosterOrder,
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
  test("names the player's Guild, its Wealth and Fame, the date and time of day, and its place in the Rankings", () => {
    const document = played(4);
    const guild = player(document);
    // No Quest has come home yet: every Guild is still at Fame 0, so all five share 1st.
    expect(rankingPlaces(document.world, 'fame').map(({ value }) => value)).toEqual([0, 0, 0, 0, 0]);

    expect(headerView(document)).toEqual({
      // Whose Banner stands beside the name (DL-125 item 7).
      guildId: guild.id,
      guildName: 'The Lantern',
      // The navigation's label for the Guildmaster view (M9-F2, DL-112 item 5).
      guildmasterName: 'Ada Vell',
      wealth: guild.wealth,
      fame: guild.fame,
      // The date and the time of day, the Year shown at every width (DL-206 item 32, DL-210): Turn 4
      // is the afternoon of the second Day of the first Year.
      time: 'Year 1 Day 2, afternoon',
      // The status bar's glyph; and the place in two parts, the second left unshown on a phone (M9-S3, DL-103).
      timeOfDay: 'afternoon',
      rankings: 'Joint 1st of 5 by Fame',
      place: 'Joint 1st of 5',
      measure: 'by Fame',
      seed: 'selectors-played',
      countdown: null,
      due: null,
      ended: null,
    });
  });

  test('a new game, every Guild at Fame 0, is joint 1st of 5 by Fame; a place no Guild shares is not joint', () => {
    expect(headerView(newGame())?.rankings).toBe('Joint 1st of 5 by Fame');

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
    expect(fames(4, 9, 4, 1, 0)).toBe('Joint 2nd of 5 by Fame');
    expect(fames(1, 9, 4, 4, 0)).toBe('4th of 5 by Fame');
    expect(fames(0, 9, 4, 4, 1)).toBe('5th of 5 by Fame');
    // The engine's `rankings` gives these Guilds ranks 1 to 5, ties by Guild id; it is unchanged.
    expect(rankings(document.world, 'fame').map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test('says how the game ended, once it has', () => {
    const document = structuredClone(newGame());
    document.world.ended = { turn: 30, reason: 'bankruptcy' };

    expect(headerView(document)?.ended).toBe('The game ended on Year 1 Day 11: The Lantern went bankrupt.');
  });

  test("gives the date under the game's own turnsPerYear, the Year from 1 (DL-210)", () => {
    const document = structuredClone(newGame());
    document.world.turn = 1_084;
    expect(headerView(document)?.time).toBe('Year 2 Day 2, afternoon');

    document.meta.config = { ...document.meta.config, turnsPerYear: 21 };
    document.world.turn = 25;
    expect(headerView(document)?.time).toBe('Year 2 Day 2, afternoon');
  });

  test('counts the Guilds in play, a folded one not among them (v1.0.1-S6, DL-97)', () => {
    const document = structuredClone(newGame());
    const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player(document).id);
    if (rival === undefined) throw new Error('expected a Rival');
    rival.foldedOnTurn = 0;

    expect(headerView(document)?.rankings).toBe('Joint 1st of 4 by Fame');
  });

  test("says the player's Guild is not ranked once it has folded, with no measure to follow (M9-S3, DL-103)", () => {
    const document = structuredClone(newGame());
    player(document).foldedOnTurn = 0;

    expect(headerView(document)).toMatchObject({ rankings: 'Not ranked: the Guild has folded', place: 'Not ranked: the Guild has folded', measure: '' });
  });
});

describe('the Bankruptcy countdown: countdownView, in the header (v1.0.1-S4, DL-95)', () => {
  /** A new game whose player's Guild starts below the floor, played through the night of its first Day. */
  function belowTheFloor(config: Partial<typeof defaultConfig> = {}): WorldDocument {
    const start = structuredClone(newGame('countdown'));
    start.meta.config = { ...start.meta.config, ...config };
    player(start).wealth = start.meta.config.bankruptcyFloor - 1;
    const playDeps = { config: { ...defaultConfig, ...start.meta.config }, content };
    let document = start;
    while (document.world.turn < nightOf(0)) document = advance(document, playDeps).document;
    return document;
  }

  /** The countdown from the engine's Days, counted from 0; the words count from 1 (DL-210). */
  const sentence = (sinceDay: number, dueDay: number, floor = 0) =>
    `The Lantern has been below the Bankruptcy floor since Year 1 Day ${sinceDay + 1}: Bankruptcy on the night of Year 1 Day ${dueDay + 1} ` +
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
    expect(headerView(document)?.due).toBe(`Bankruptcy on the night of Year 1 Day ${defaultConfig.bankruptcyGraceDays + 1}`);
    expect(headerView(belowTheFloor({ bankruptcyGraceDays: 10 }))?.due).toBe('Bankruptcy on the night of Year 1 Day 11');
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
        // The Board's chip, `Until Year 1 Day 6` (DL-210); `lastDay` stays the Day it sorts by.
        until: `Until ${dateOfTurn(quest.expiresOnTurn, document.meta.config)}`,
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

  // v1.1.4-S6 (DL-148 item 16): each Encounter and what each Check reads, in place of the template's demands.
  test("gives its Encounters in order, each Check's name and what it reads, and the Skills that help as a list; no demands", () => {
    const document = board(([first]) => {
      if (first === undefined) throw new Error('an empty Board');
      first.encounterKeys = ['past-the-watch', 'ambush-on-the-road', 'the-trapped-passage', 'hold-the-line', 'the-long-march'];
    });

    const [card] = boardView(document);

    // Each Encounter's Checks' Skills, in order, each once (v1.1.4-S10's content).
    expect(card?.skills).toEqual(['Stealth', 'Swordcraft', 'Tactics', 'Trapcraft', 'Lockpicking', 'Shieldwork', 'Field surgery', 'Herbalism']);
    expect(card?.encounters.map(({ name, kind, one }) => [name, kind, one])).toEqual([
      ['Past the watch', 'stealth', false],
      ['Ambush on the road', 'combat', false],
      ['The trapped passage', 'stealth', false],
      ['Hold the line', 'combat', false],
      ['The long march', 'travel', false],
    ]);
    expect(card?.encounters[0]?.checks).toEqual([
      { key: 'quiet-feet', name: 'Quiet feet', reads: 'the lowest Dexterity in the Party' },
      { key: 'timing', name: 'Timing', reads: 'the highest (0.5 Wits + 0.5 Perception) in the Party' },
    ]);
    expect(card?.encounters[1]?.checks[0]?.reads).toBe('the (0.6 Weaponry + 0.4 Strength) of the Party, highest first, weighted 1, 0.5 and 0.25');
    expect(card?.encounters[3]?.checks[0]?.reads).toBe('the total (0.5 Constitution + 0.5 Strength) of the 3 Heroes with the highest Constitution');
    expect(Object.keys(card ?? {})).not.toContain('demands');
  });

  // v1.1.4-S6 (DL-148 items 15 and 17): the Party the engine would send from the free Heroes, and its chance.
  test("gives the best Party of the free Heroes, partyFor's, with its estimate's word, or none when no Party meets the requirements", () => {
    const document = board((quests, it) => {
      const [first, second] = quests as [Quest, Quest];
      first.requirements = { partySizeMin: 1, partySizeMax: 4 };
      second.requirements = { partySizeMin: 1, partySizeMax: 4, classKey: 'no-such-class' };
      // One Hero away: the best Party is of the free Heroes only.
      (heroes(it)[0] as Hero).injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    });
    const [first, second] = document.world.board.map((id) => document.world.quests[id] as Quest);
    const guild = player(document);
    const available = availableHeroes(document.world, guild);
    const heroIds = partyFor(document.world, guild, first as Quest, available, deps) ?? [];
    const estimate = estimateQuest(document.world, first as Quest, heroIds.map((id) => document.world.heroes[id] as Hero), deps);

    const best = bestPartyView(document);

    expect(heroIds.length).toBeGreaterThan(0);
    expect(heroIds).not.toContain(heroes(document)[0]?.id);
    expect(best.get(first?.id as QuestId)).toEqual({ chance: chanceWords[estimate?.chance ?? 'hopeless'], names: listed(heroIds.map((id) => document.world.heroes[id]?.name ?? '')) });
    expect(best.get(second?.id as QuestId)).toBeNull();
    expect([...best.keys()]).toEqual(document.world.board);
    // v1.1.4-S6's verification: only the Board asks for it; the cards the digest and the stop read carry none.
    expect(Object.keys(boardView(document)[0] ?? {})).not.toContain('best');
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
    // The best Party is named, its chance not known until its Encounters are drawn.
    expect(bestPartyView(document).get(card?.questId as QuestId)).toMatchObject({ chance: null });
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

  test('Quests that share the lowest difficulty are the joint easiest, not a joint place from the top (M9-F6, carried finding 6)', () => {
    const document = board((quests) => {
      [70, 40, 40, 55, 40, 90].forEach((difficulty, index) => ((quests[index] as Quest).difficulty = difficulty));
    });
    expect(boardView(document).map((card) => card.hardness)).toEqual([
      '2nd hardest of the 6 Quests on the Board',
      'joint easiest of the 6 Quests on the Board',
      'joint easiest of the 6 Quests on the Board',
      '3rd hardest of the 6 Quests on the Board',
      'joint easiest of the 6 Quests on the Board',
      'the hardest of the 6 Quests on the Board',
    ]);
  });

  test('names each requirement beyond the Party size, and marks a Quest whose last Day on the Board is today', () => {
    const document = board(([first, second]) => {
      if (first === undefined || second === undefined) throw new Error('expected two Quests');
      first.requirements = { partySizeMin: 2, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };
      second.requirements = { partySizeMin: 1, partySizeMax: 2 };
      // The engine's Day 0, the Day in hand: its night is Turn 2.
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

describe('the default order of Heroes (v1.1.5-S11, DL-169 item 5)', () => {
  /** A Hero of the new game's Roster made to order: only the fields the default order reads are changed. */
  function made(document: WorldDocument, id: string, fields: Partial<Pick<Hero, 'classKey' | 'level' | 'ageAtEntry' | 'name'>>): Hero {
    const [base] = heroes(document);
    if (base === undefined) throw new Error('no Hero');
    return { ...base, id: id as HeroId, classKey: 'warrior', level: 1, ageAtEntry: 25, enteredTurn: 0, name: 'Ash Tull', ...fields };
  }

  test("sorts by Class in the content's order: Warrior, Rogue, Mage, Healer", () => {
    const document = newGame();
    expect(Object.values(content.classes).map((row) => row.name)).toEqual(['Warrior', 'Rogue', 'Mage', 'Healer']);
    const healer = made(document, 'hero-000101', { classKey: 'healer', level: 9, ageAtEntry: 18, name: 'Aa' });
    const mage = made(document, 'hero-000102', { classKey: 'mage', level: 9, ageAtEntry: 18, name: 'Ab' });
    const rogue = made(document, 'hero-000103', { classKey: 'rogue', level: 2, ageAtEntry: 50, name: 'Zz' });
    const warrior = made(document, 'hero-000104', { classKey: 'warrior', level: 1, ageAtEntry: 60, name: 'Zz' });

    expect([healer, mage, rogue, warrior].sort(defaultHeroOrder(document)).map((hero) => hero.classKey)).toEqual(['warrior', 'rogue', 'mage', 'healer']);
  });

  test('within a Class, sorts Level highest first, then Age youngest first, then Name A–Z, then the id', () => {
    const document = newGame();
    const low = made(document, 'hero-000201', { level: 2, ageAtEntry: 20, name: 'Aldo' });
    const high = made(document, 'hero-000202', { level: 5, ageAtEntry: 40, name: 'Zora' });
    const older = made(document, 'hero-000203', { level: 2, ageAtEntry: 30, name: 'Abel' });
    const younger = made(document, 'hero-000204', { level: 2, ageAtEntry: 20, name: 'Zeno' });
    const twinB = made(document, 'hero-000206', { level: 2, ageAtEntry: 20, name: 'Aldo' });

    const sorted = [older, twinB, younger, low, high].sort(defaultHeroOrder(document));

    expect(sorted.map((hero) => hero.id)).toEqual(['hero-000202', 'hero-000201', 'hero-000206', 'hero-000204', 'hero-000203']);
  });

  test("reads Age as the page shows it, the years since the Hero's entry counted", () => {
    const document = structuredClone(newGame());
    document.world.turn = defaultConfig.turnsPerYear * 3;
    // Entered at 20 three years ago: 23 now, older than one who entered at 22 today.
    const early = made(document, 'hero-000301', { ageAtEntry: 20, name: 'Aa' });
    const late = { ...made(document, 'hero-000302', { ageAtEntry: 22, name: 'Zz' }), enteredTurn: document.world.turn };

    expect([early, late].sort(defaultHeroOrder(document)).map((hero) => hero.id)).toEqual(['hero-000302', 'hero-000301']);
  });

  test('is total, so any two Heroes have one order; and is for display only, the Roster and the save unchanged', () => {
    const document = newGame();
    const before = JSON.stringify(document);
    const order = defaultHeroOrder(document);
    const a = made(document, 'hero-000401', {});
    const b = made(document, 'hero-000402', {});

    expect(order(a, b)).toBeLessThan(0);
    expect(order(b, a)).toBeGreaterThan(0);
    expect(order(a, a)).toBe(0);
    [...heroes(document)].sort(order);
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe('the Party builder (M9-S4, DL-104)', () => {
  /**
   * A new game whose first Quest requires Herbalism and meets the restless dead and a hostile reeve,
   * whose Checks read Spirit, Willpower, Weaponry, Power, Courage and Resistance, then Diplomacy and
   * Charisma (v1.1.4-S10's content), and the Skills Benediction, Swordcraft and Evocation; its four Heroes are Bram (a Healer with Herbalism 1 and Benediction 2),
   * Liv (a Warrior with Swordcraft 2 and Tactics 1), Cenric (a Rogue) and Ragnvald (a Mage).
   */
  function builder(): { document: WorldDocument; quest: Quest; bram: Hero; liv: Hero; cenric: Hero; ragnvald: Hero } {
    const document = structuredClone(newGame());
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    quest.requirements = { partySizeMin: 1, partySizeMax: 3, skillKey: 'herbalism' };
    quest.encounterKeys = ['the-restless-dead', 'a-hostile-reeve'];
    const [bram, liv, cenric, ragnvald] = heroes(document);
    if (bram === undefined || liv === undefined || cenric === undefined || ragnvald === undefined) throw new Error('four Heroes');
    expect([bram.name, liv.name, cenric.name, ragnvald.name]).toEqual(['Bram Netherby', 'Liv Coldharbour', 'Cenric Yarrow', 'Ragnvald Brackenridge']);
    return { document, quest, bram, liv, cenric, ragnvald };
  }

  test("gives each Hero on the Roster a row: Class and Level, the effective values of the Stats the Quest's Checks read, and its Skills they have, and no Morale (DL-148 item 12)", () => {
    const { document, quest, bram, liv } = builder();
    liv.morale = 15;
    // An arming sword lifts Liv's Weaponry by 2: the value a Check reads, not the base.
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    const rows = partyRows(document, quest.id);

    // All four can go: the default order, by Class (v1.1.5-S11, DL-169 item 5), not the order they joined.
    expect(rows?.map((row) => row.name)).toEqual(['Liv Coldharbour', 'Cenric Yarrow', 'Ragnvald Brackenridge', 'Bram Netherby']);
    expect(rows?.[3]).toEqual({
      heroId: bram.id,
      name: 'Bram Netherby',
      className: 'Healer',
      level: 1,
      why: null,
      unavailable: null,
      chip: null,
      // The Stats the Checks read, in the order the Quest meets them (v1.1.4-S6, `statsRead`), not the template's demands.
      stats: (['spirit', 'willpower', 'weaponry', 'power', 'courage', 'resistance', 'diplomacy', 'charisma'] as const).map((key) => ({
        name: content.stats[key]?.name,
        value: bram.stats[key],
      })),
      // The Skill the Quest requires first, then those that help, as the Hero has them.
      skills: [
        { name: 'Herbalism', rating: 1 },
        { name: 'Benediction', rating: 2 },
      ],
    });
    expect(rows?.[0]).toMatchObject({
      className: 'Warrior',
      stats: expect.arrayContaining([
        { name: 'Weaponry', value: (liv.stats.weaponry ?? 0) + 2 },
        { name: 'Courage', value: liv.stats.courage },
      ]),
      skills: [{ name: 'Swordcraft', rating: 2 }],
    });
    // A Rogue and a Mage have none of this Quest's Skills.
    expect(rows?.slice(1, 3).map((row) => row.className)).toEqual(['Rogue', 'Mage']);
    expect(rows?.slice(1, 3).map((row) => row.skills)).toEqual([[], []]);
    // v1.1.4-S3's verification: no row names a Hero's Morale; the Party's one line says what it does.
    for (const row of rows ?? []) expect(Object.keys(row).filter((key) => key.startsWith('morale'))).toEqual([]);
  });

  test("the values are those the Hero's page shows: its effective Stats and its Skills' ratings", () => {
    const { document, quest, liv } = builder();
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    for (const row of partyRows(document, quest.id) ?? []) {
      const page = heroPage(document, row.heroId);
      for (const stat of row.stats) expect(stat.value).toBe(page?.areas.flatMap((area) => area.stats).find((each) => each.name === stat.name)?.value);
      for (const skill of row.skills) expect(page?.skills).toContainEqual(skill);
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

    // Those who can go first; then Ragnvald, back on Year 1 Day 6, before Cenric, healed on Year 1 Day 7 (v1.1.5-S11, DL-169 item 4).
    expect(rows?.map(({ name, why, unavailable, chip }) => ({ name, why, unavailable, chip }))).toEqual([
      { name: 'Liv Coldharbour', why: null, unavailable: null, chip: null },
      { name: 'Bram Netherby', why: null, unavailable: null, chip: null },
      { name: 'Ragnvald Brackenridge', why: 'in-party', unavailable: 'Away with a Party, back on the night of Year 1 Day 6', chip: 'Away' },
      { name: 'Cenric Yarrow', why: 'injured', unavailable: 'Injured, healing on the night of Year 1 Day 7', chip: 'Injured' },
    ]);
    for (const row of rows ?? []) expect(row.why).toBe(unavailability(document.world.heroes[row.heroId] as Hero));
    // The full words as the Roster words them; only the Board's chip is short (DL-169 item 2).
    const roster = sortedRoster(rosterRows(document));
    for (const row of rows?.slice(2) ?? []) expect(row.unavailable).toBe(roster.find((each) => each.heroId === row.heroId)?.whereabouts);
  });

  test("lists the unavailable soonest free first, the Away by their Party's return and the Injured by their healing, ties in the default order", () => {
    const { document, quest, bram, liv, cenric, ragnvald } = builder();
    const away = (hero: Hero, returnsOnTurn: number, number: number): void => {
      const partyId = `party-0000${number}` as PartyId;
      document.world.parties[partyId] = {
        id: partyId,
        questId: document.world.board[1] as QuestId,
        guildId: player(document).id,
        heroIds: [hero.id],
        departedOnTurn: 0,
        returnsOnTurn,
      };
      hero.partyId = partyId;
    };
    // Liv is free on Turn 14, Ragnvald and Bram both on Turn 17, Cenric on Turn 20. Ragnvald the Mage
    // before Bram the Healer breaks their tie by the default order, against the order they joined, Bram
    // first (S11's verification: the tie had agreed with the order of joining, and tested neither).
    liv.injury = { typeKey: 'deep-cut', healsOnTurn: 14 };
    away(ragnvald, 17, 91);
    bram.injury = { typeKey: 'deep-cut', healsOnTurn: 17 };
    away(cenric, 20, 92);
    expect(player(document).rosterIds.indexOf(bram.id)).toBeLessThan(player(document).rosterIds.indexOf(ragnvald.id));

    expect(partyRows(document, quest.id)?.map((row) => row.name)).toEqual(['Liv Coldharbour', 'Ragnvald Brackenridge', 'Bram Netherby', 'Cenric Yarrow']);

    // An injured Hero who is also away reads the Injury, as the engine's `unavailability` does.
    away(bram, 23, 93);
    expect(partyRows(document, quest.id)?.[2]).toMatchObject({ name: 'Bram Netherby', why: 'injured', chip: 'Injured' });
  });

  test('lists last a Hero whose free Day cannot be read, and the Heroes who can go first, in the default order', () => {
    const { document, quest, bram, liv, cenric } = builder();
    // Liv's Party is not in the world: no Day to read, so she comes after Cenric, back on Turn 29.
    liv.partyId = 'party-000777' as PartyId;
    cenric.partyId = 'party-000098' as PartyId;
    document.world.parties[cenric.partyId] = {
      id: cenric.partyId,
      questId: document.world.board[1] as QuestId,
      guildId: player(document).id,
      heroIds: [cenric.id],
      departedOnTurn: 0,
      returnsOnTurn: 29,
    };
    // Ragnvald and Bram can go; at Level 3, Bram the Healer still follows Ragnvald the Mage.
    bram.level = 3;

    expect(partyRows(document, quest.id)?.map(({ name, chip, unavailable }) => ({ name, chip, unavailable }))).toEqual([
      { name: 'Ragnvald Brackenridge', chip: null, unavailable: null },
      { name: 'Bram Netherby', chip: null, unavailable: null },
      { name: 'Cenric Yarrow', chip: 'Away', unavailable: 'Away with a Party, back on the night of Year 1 Day 10' },
      { name: 'Liv Coldharbour', chip: 'Away', unavailable: 'Away with a Party' },
    ]);
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

  // v1.1.4-S6 (DL-148 item 15): a word for each Encounter and the Quest, and S5's estimate floored to 5% for the detail, agreeing with the word.
  test("gives each Encounter's chance and the Quest's in a word, with the estimate's percentage floored to 5%, carrying what is carried", () => {
    const document = structuredClone(newGame());
    const quest = document.world.quests[document.world.board[0] as QuestId] as Quest;
    const chosen = heroes(document).slice(0, 2);
    const carried = consumableChoices(document).slice(0, 1).map(({ definitionKey }) => ({ definitionKey, quantity: 1 }));
    const estimate = estimateQuest(document.world, quest, chosen, deps, carried);
    if (estimate === null) throw new Error('No estimate');

    const preview = previewView(document, quest.id, chosen.map((hero) => hero.id), carried);

    expect(preview?.chances).toEqual({
      encounters: estimate.encounters.map((it) => ({
        name: content.encounters[it.encounterKey]?.name,
        chance: chanceWords[it.chance],
        percent: shownPercent(it.success),
      })),
      quest: { name: 'The Quest', chance: chanceWords[estimate.chance], percent: shownPercent(estimate.success) },
    });
    for (const line of [...(preview?.chances?.encounters ?? []), preview?.chances?.quest]) expect((line?.percent ?? 1) % 5).toBe(0);
    expect(previewView(document, quest.id, [], [])?.chances).toBeNull();
  });

  // v1.1.4-S3 (DL-148 item 12): one Morale line for the Party, from its mean form, naming no Hero.
  test.each([
    [[60, 60], 'Makes no difference.'],
    [[95, 50], 'Raises the odds.'],
    [[25, 50], 'Lowers the odds a little.'],
    [[5, 5], 'Lowers the odds badly.'],
  ])('with Morale %j, gives the Party one line: %s', (morales, words) => {
    const document = structuredClone(newGame());
    const questId = document.world.board[0] as QuestId;
    const chosen = heroes(document).slice(0, 2);
    chosen.forEach((hero, index) => (hero.morale = morales[index] ?? 60));

    const preview = previewView(document, questId, chosen.map((hero) => hero.id), []);

    expect(preview?.morale).toBe(words);
    for (const hero of chosen) expect(preview?.morale).not.toContain(hero.name);
    expect(previewView(document, questId, [], [])?.morale).toBeNull();
  });
});

describe('rosterRows and sortedRoster', () => {
  test("lists the player's Roster in the default order with Level, age, Morale and whereabouts (v1.1.5-S12, DL-169 item 5)", () => {
    const document = structuredClone(newGame());
    const [first] = heroes(document);
    if (first === undefined) throw new Error('no Hero');
    first.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };

    const rows = sortedRoster(rosterRows(document));

    // Bram the Healer joined first, and comes last: by Class, as the Board's builder lists (S11).
    expect(rows.map((row) => row.heroId)).toEqual([...heroes(document)].sort(defaultHeroOrder(document)).map((hero) => hero.id));
    expect(rows.map((row) => row.className)).toEqual(['Warrior', 'Rogue', 'Mage', 'Healer']);
    expect(rows.find((row) => row.heroId === first.id)?.whereabouts).toBe('Injured, healing on the night of Year 1 Day 7');
    expect(rows[0]?.whereabouts).toBe('At the Hall');
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

    const rows = sortedRoster(rosterRows(document));
    const [first, second, third] = [injured, away, home].map((hero) => rows.find((row) => row.heroId === hero.id));

    expect(first).toMatchObject({ morale: 12, moraleBand: 'wretched', why: 'injured', whereabouts: 'Injured, healing on the night of Year 1 Day 7' });
    expect(second).toMatchObject({ morale: 80, moraleBand: 'high', why: 'in-party', whereabouts: 'Away with a Party, back on the night of Year 1 Day 5' });
    expect(third).toMatchObject({ morale: 50, moraleBand: 'steady', why: null, whereabouts: 'At the Hall' });
  });

  test('a Hero whose Party is not in the world is Away with a Party, as the builder says, and sorts last by when free (S10, the close review)', () => {
    const document = structuredClone(newGame());
    const [lost] = heroes(document);
    if (lost === undefined) throw new Error('no Hero');
    lost.partyId = 'party-000777' as PartyId;

    const row = sortedRoster(rosterRows(document)).find((each) => each.heroId === lost.id);
    const quest = document.world.board[0] as QuestId;

    expect(row).toMatchObject({ why: 'in-party', whereabouts: 'Away with a Party' });
    expect(partyRows(document, quest)?.find((each) => each.heroId === lost.id)?.unavailable).toBe(row?.whereabouts);
    expect(heroPage(document, lost.id)?.where).toEqual({ why: 'in-party', words: 'Away with a Party' });
    expect(sortedRoster(rosterRows(document), { key: 'free', direction: 'ascending' }).at(-1)?.heroId).toBe(lost.id);
  });
});

describe("the Roster's Table: each Hero's effective Stats, Traits and Items (v1.1.5-S12, DL-169 items 8 and 9)", () => {
  /** A new game whose Guildmaster holds Old soldier (+1 Weaponry to Warriors) and Mistrusts magic (-1 Arcana to Mages). */
  function table(): { document: WorldDocument; liv: Hero; ragnvald: Hero; bram: Hero } {
    const document = structuredClone(newGame());
    const [bram, liv, , ragnvald] = heroes(document);
    if (bram === undefined || liv === undefined || ragnvald === undefined) throw new Error('four Heroes');
    expect([liv.classKey, ragnvald.classKey, bram.classKey]).toEqual(['warrior', 'mage', 'healer']);
    for (const hero of heroes(document)) hero.traits = [];
    const guildmaster = guildmasterOf(player(document), document.world);
    if (guildmaster === undefined) throw new Error("no player's Guildmaster");
    guildmaster.traits = ['old-soldier', 'mistrusts-magic'];
    return { document, liv, ragnvald, bram };
  }

  /**
   * A Hero's row's Stat by its key. The rows are built once a document (v1.1.6-S13), and these tests
   * change the world in place between reads, so each read is of a new document, as each play gives the page.
   */
  function stat(document: WorldDocument, hero: Hero, key: string) {
    const found = sortedRoster(rosterRows({ ...document }))
      .find((row) => row.heroId === hero.id)
      ?.stats.find((each) => each.key === key);
    if (found === undefined) throw new Error(`no ${key} for ${hero.name}`);
    return found;
  }

  test("gives each Hero all 20 Stats in content's order, each its base and the effective value a Check reads, and every row its area", () => {
    const { document, liv } = table();
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });
    const stats = Object.values(content.stats).filter((each) => each.owner === 'hero');
    expect(stats).toHaveLength(20);

    for (const row of sortedRoster(rosterRows(document))) {
      const hero = document.world.heroes[row.heroId] as Hero;
      const effective = effectiveStats(hero, document.world, content);
      expect(row.stats.map((each) => each.key)).toEqual(stats.map((each) => each.key));
      expect(row.stats.map((each) => each.name)).toEqual(stats.map((each) => each.name));
      expect(row.stats.map((each) => each.base)).toEqual(stats.map((each) => hero.stats[each.key]));
      expect(row.stats.map((each) => each.value)).toEqual(stats.map((each) => effective[each.key]));
    }
  });

  test('names each source that changes a Stat, the Class bonus, Gear and Traits, and marks the net change up or down', () => {
    const { document, liv, ragnvald } = table();
    liv.stats['weaponry'] = 10;
    liv.stats['strength'] = 11;
    liv.stats['dexterity'] = 12;
    liv.traits = ['lame', 'one-eyed'];
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });
    ragnvald.stats['arcana'] = 14;

    // The Class bonus +1, the sword +2 and One-eyed -1: 12, raised.
    expect(stat(document, liv, 'weaponry')).toEqual({
      key: 'weaponry',
      name: 'Weaponry',
      base: 10,
      value: 12,
      change: 'up',
      sources: [
        { from: "the Guildmaster's Class bonus", change: 1 },
        { from: 'Gear', change: 2 },
        { from: 'Traits', change: -1 },
      ],
      words: "Base 10, +1 from the Guildmaster's Class bonus, +2 from Gear, -1 from Traits",
    });
    expect(stat(document, liv, 'strength')).toMatchObject({ base: 11, value: 12, change: 'up', words: 'Base 11, +1 from Gear' });
    expect(stat(document, liv, 'dexterity')).toMatchObject({ base: 12, value: 10, change: 'down', words: 'Base 12, -2 from Traits' });
    expect(stat(document, ragnvald, 'arcana')).toMatchObject({ base: 14, value: 13, change: 'down', words: "Base 14, -1 from the Guildmaster's Class bonus" });
    // Nothing changes it: plain, no words, no source.
    expect(stat(document, liv, 'charisma')).toMatchObject({ change: null, sources: [], words: null });
    // The Class bonus is the Warrior's: the Mage's Weaponry is as it is.
    expect(stat(document, ragnvald, 'weaponry')).toMatchObject({ change: null, words: null });
  });

  test("reads the net change after the Stat's bounds: plain at nothing, the sources still named, and the bound said", () => {
    const { document, liv } = table();
    // Endurance: the plate's +2 against Lame's -1 and Short-winded's -2, the Traits summed.
    liv.traits = ['lame', 'short-winded'];
    addStack(document.world, 'plate-harness', 1, { kind: 'hero', id: liv.id, slot: 'armour' });
    liv.stats['endurance'] = 10;
    // At the top: Weaponry 20, +1 from the Class bonus, held at 20.
    liv.stats['weaponry'] = 20;
    liv.stats['strength'] = 20;
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    expect(stat(document, liv, 'endurance')).toEqual({
      key: 'endurance',
      name: 'Endurance',
      base: 10,
      value: 9,
      change: 'down',
      sources: [
        { from: 'Gear', change: 2 },
        { from: 'Traits', change: -3 },
      ],
      words: 'Base 10, +2 from Gear, -3 from Traits',
    });
    expect(stat(document, liv, 'weaponry')).toMatchObject({
      base: 20,
      value: 20,
      change: null,
      words: "Base 20, +1 from the Guildmaster's Class bonus, +2 from Gear, held at 20",
    });
    // The plate's +3 Constitution against Short-winded's -1 and a base of 9: up by 2.
    liv.stats['constitution'] = 9;
    expect(stat(document, liv, 'constitution')).toMatchObject({ value: 11, change: 'up', words: 'Base 9, +3 from Gear, -1 from Traits' });
    // Sources that cancel, the ring's +1 Charisma and Scarred's -1: plain, their words kept for the tooltip.
    addStack(document.world, 'signet-ring', 1, { kind: 'hero', id: liv.id, slot: 'trinket' });
    liv.traits = ['scarred'];
    liv.stats['charisma'] = 10;
    expect(stat(document, liv, 'charisma')).toMatchObject({ value: 10, change: null, words: 'Base 10, +1 from Gear, -1 from Traits' });
  });

  test("gives each Hero's Traits with their effects, and the Gear they carry by name with its effect, and nothing of Potential", () => {
    const { document, liv } = table();
    liv.traits = ['lame', 'battle-tried'];
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });
    createItem(document.world, 'abbots-reliquary', { kind: 'hero', id: liv.id, slot: 'trinket' });
    // What the Guild holds is no Hero's.
    addStack(document.world, 'padded-jack', 1, { kind: 'guild', id: player(document).id });

    const rows = sortedRoster(rosterRows(document));
    const row = rows.find((each) => each.heroId === liv.id);

    expect(row?.traits).toEqual([
      { name: 'Lame', effect: '-2 Dexterity, -1 Endurance' },
      { name: 'Battle-tried', effect: '+2 to every Check of combat Encounters' },
    ]);
    expect(row?.items).toEqual([
      { name: 'Arming sword', effect: 'Weaponry +2, Strength +1', definitionKey: 'arming-sword', unique: false },
      { name: "The Abbot's reliquary", effect: 'Spirit +3, Willpower +2, Resistance +1', definitionKey: 'abbots-reliquary', unique: true },
    ]);
    // The same words as the Hero's page.
    expect(row?.traits).toEqual(heroPage(document, liv.id)?.traits);
    for (const other of rows.filter((each) => each.heroId !== liv.id)) expect(other.items).toEqual([]);
    expect(JSON.stringify(rows)).not.toMatch(/potential|outlook/i);
  });

  test('says which Items are Unique, with their content key, and whether the Hero carries one: Common Items alone, or none, carry none (v1.1.5-S14, DL-182 item 4)', () => {
    const { document, liv, ragnvald } = table();
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });
    createItem(document.world, 'lantern-of-stannary', { kind: 'hero', id: liv.id, slot: 'trinket' });
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: ragnvald.id, slot: 'weapon' });
    // A Unique Item the Guild holds is no Hero's.
    createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: player(document).id });

    const rows = sortedRoster(rosterRows(document));
    const row = (hero: Hero) => rows.find((each) => each.heroId === hero.id);

    expect(row(liv)?.items.map(({ definitionKey, unique }) => ({ definitionKey, unique }))).toEqual([
      { definitionKey: 'arming-sword', unique: false },
      { definitionKey: 'lantern-of-stannary', unique: true },
    ]);
    expect(row(liv)?.carriesUnique).toBe(true);
    expect(row(ragnvald)?.items.map(({ unique }) => unique)).toEqual([false]);
    expect(row(ragnvald)?.carriesUnique).toBe(false);
    for (const other of rows.filter((each) => each.heroId !== liv.id && each.heroId !== ragnvald.id)) {
      expect(other.items).toEqual([]);
      expect(other.carriesUnique).toBe(false);
    }
  });
});

describe("the Roster's sort (v1.1.5-S12, DL-169 item 10)", () => {
  /** The four Heroes of a new game, made to differ. */
  function sorted(): { document: WorldDocument; bram: Hero; liv: Hero; cenric: Hero; ragnvald: Hero } {
    const document = structuredClone(newGame());
    const [bram, liv, cenric, ragnvald] = heroes(document);
    if (bram === undefined || liv === undefined || cenric === undefined || ragnvald === undefined) throw new Error('four Heroes');
    expect([bram.name, liv.name, cenric.name, ragnvald.name]).toEqual(['Bram Netherby', 'Liv Coldharbour', 'Cenric Yarrow', 'Ragnvald Brackenridge']);
    for (const hero of heroes(document)) hero.traits = [];
    const guildmaster = guildmasterOf(player(document), document.world);
    if (guildmaster !== undefined) guildmaster.traits = [];
    return { document, bram, liv, cenric, ragnvald };
  }

  // The rows are built once a document (v1.1.6-S13), and these tests change the world in place between
  // sorts, so each sort is of a new document, as each play gives the page.
  const names = (document: WorldDocument, order: RosterOrder): string[] =>
    sortedRoster(rosterRows({ ...document }), order).map((row) => row.name.split(' ')[0] ?? '');

  test('offers Default, Name, Class, Level, Age, Morale, When free and each of the 20 Stats, each with its first direction', () => {
    const choices = rosterSortChoices();
    expect(choices.slice(0, 7).map(({ key, label, first }) => [key, label, first])).toEqual([
      ['default', 'Default', 'ascending'],
      ['name', 'Name', 'ascending'],
      ['class', 'Class', 'ascending'],
      ['level', 'Level', 'descending'],
      ['age', 'Age', 'ascending'],
      ['morale', 'Morale', 'descending'],
      ['free', 'When free', 'ascending'],
    ]);
    const stats = Object.values(content.stats).filter((each) => each.owner === 'hero');
    expect(choices.slice(7).map(({ key, label, first, area }) => [key, label, first, area])).toEqual(
      stats.map((each) => [each.key, each.name, 'descending', `${each.area.charAt(0).toUpperCase()}${each.area.slice(1)}`]),
    );
    expect(choices.slice(0, 7).every((choice) => choice.area === null)).toBe(true);
  });

  test('says each direction in words', () => {
    expect(orderWords('default', 'ascending')).toBe('Default order');
    expect(orderWords('default', 'descending')).toBe('Reversed');
    expect(orderWords('name', 'ascending')).toBe('A to Z');
    expect(orderWords('name', 'descending')).toBe('Z to A');
    expect(orderWords('class', 'ascending')).toBe('Warrior first');
    expect(orderWords('class', 'descending')).toBe('Healer first');
    expect(orderWords('level', 'descending')).toBe('Highest first');
    expect(orderWords('morale', 'ascending')).toBe('Lowest first');
    expect(orderWords('strength', 'descending')).toBe('Highest first');
    expect(orderWords('age', 'ascending')).toBe('Youngest first');
    expect(orderWords('age', 'descending')).toBe('Oldest first');
    expect(orderWords('free', 'ascending')).toBe('At the Hall first');
    expect(orderWords('free', 'descending')).toBe('At the Hall last');
  });

  test("names the direction's button by its action, then the direction it is in, the shown words inside a sentence (#52's judgement call 4, DL-185)", () => {
    expect(reverseOrderName('default', 'ascending')).toBe('Reverse the order, now default order');
    expect(reverseOrderName('default', 'descending')).toBe('Reverse the order, now reversed');
    expect(reverseOrderName('name', 'ascending')).toBe('Reverse the order, now A to Z');
    expect(reverseOrderName('name', 'descending')).toBe('Reverse the order, now Z to A');
    expect(reverseOrderName('class', 'ascending')).toBe('Reverse the order, now Warrior first');
    expect(reverseOrderName('level', 'descending')).toBe('Reverse the order, now highest first');
    expect(reverseOrderName('strength', 'ascending')).toBe('Reverse the order, now lowest first');
    expect(reverseOrderName('age', 'ascending')).toBe('Reverse the order, now youngest first');
    expect(reverseOrderName('free', 'descending')).toBe('Reverse the order, now at the Hall last');
    // The shown words are in it, whatever their case, so a voice naming what it sees finds the button.
    for (const key of ['default', 'name', 'class', 'level', 'age', 'morale', 'free', 'strength'] as const) {
      for (const direction of ['ascending', 'descending'] as const) {
        expect(reverseOrderName(key, direction).toLowerCase()).toContain(orderWords(key, direction).toLowerCase());
      }
    }
  });

  test('sorts by Name, Class, Level, Age and Morale either way, ties in the default order', () => {
    const { document, bram, liv, cenric, ragnvald } = sorted();
    expect(names(document, { key: 'default', direction: 'ascending' })).toEqual(['Liv', 'Cenric', 'Ragnvald', 'Bram']);
    expect(names(document, { key: 'default', direction: 'descending' })).toEqual(['Bram', 'Ragnvald', 'Cenric', 'Liv']);
    expect(names(document, { key: 'name', direction: 'ascending' })).toEqual(['Bram', 'Cenric', 'Liv', 'Ragnvald']);
    expect(names(document, { key: 'name', direction: 'descending' })).toEqual(['Ragnvald', 'Liv', 'Cenric', 'Bram']);
    expect(names(document, { key: 'class', direction: 'descending' })).toEqual(['Bram', 'Ragnvald', 'Cenric', 'Liv']);

    // Level 3 for Bram and Cenric, 1 for the others: the ties in the default order, whichever way.
    bram.level = 3;
    cenric.level = 3;
    expect(names(document, { key: 'level', direction: 'descending' })).toEqual(['Cenric', 'Bram', 'Liv', 'Ragnvald']);
    expect(names(document, { key: 'level', direction: 'ascending' })).toEqual(['Liv', 'Ragnvald', 'Cenric', 'Bram']);

    liv.ageAtEntry = 40;
    ragnvald.ageAtEntry = 18;
    bram.ageAtEntry = 30;
    cenric.ageAtEntry = 30;
    liv.enteredTurn = ragnvald.enteredTurn = bram.enteredTurn = cenric.enteredTurn = 0;
    expect(names(document, { key: 'age', direction: 'ascending' })).toEqual(['Ragnvald', 'Cenric', 'Bram', 'Liv']);
    expect(names(document, { key: 'age', direction: 'descending' })).toEqual(['Liv', 'Cenric', 'Bram', 'Ragnvald']);

    liv.morale = 50;
    ragnvald.morale = 50;
    bram.morale = 80;
    cenric.morale = 10;
    expect(names(document, { key: 'morale', direction: 'descending' })).toEqual(['Bram', 'Liv', 'Ragnvald', 'Cenric']);
    expect(names(document, { key: 'morale', direction: 'ascending' })).toEqual(['Cenric', 'Liv', 'Ragnvald', 'Bram']);
  });

  test("sorts by a Stat's effective value, not its base, ties in the default order", () => {
    const { document, bram, liv, cenric, ragnvald } = sorted();
    liv.stats['weaponry'] = 12;
    cenric.stats['weaponry'] = 13;
    ragnvald.stats['weaponry'] = 13;
    bram.stats['weaponry'] = 8;
    // The sword lifts Liv's to 14, above the two at 13.
    addStack(document.world, 'arming-sword', 1, { kind: 'hero', id: liv.id, slot: 'weapon' });

    expect(names(document, { key: 'weaponry', direction: 'descending' })).toEqual(['Liv', 'Cenric', 'Ragnvald', 'Bram']);
    expect(names(document, { key: 'weaponry', direction: 'ascending' })).toEqual(['Bram', 'Cenric', 'Ragnvald', 'Liv']);
  });

  test('sorts by when free: at the Hall first, then the soonest free, a Hero with no Day to read last; reversed, the other way', () => {
    const { document, bram, liv, cenric } = sorted();
    bram.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };
    const partyId = 'party-000009' as PartyId;
    document.world.parties[partyId] = { id: partyId, questId: 'quest-000001' as QuestId, guildId: player(document).id, heroIds: [cenric.id], departedOnTurn: 0, returnsOnTurn: 14 };
    cenric.partyId = partyId;
    liv.partyId = 'party-000777' as PartyId;

    expect(names(document, { key: 'free', direction: 'ascending' })).toEqual(['Ragnvald', 'Cenric', 'Bram', 'Liv']);
    expect(names(document, { key: 'free', direction: 'descending' })).toEqual(['Liv', 'Bram', 'Cenric', 'Ragnvald']);
  });

  test('changes nothing in the world: the Roster keeps the order the Heroes joined', () => {
    const document = newGame();
    const before = JSON.stringify(document);
    for (const { key, first } of rosterSortChoices()) sortedRoster(rosterRows(document), { key, direction: first });
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("the Roster's Table's columns (v1.1.5-S12, DL-169 item 7)", () => {
  test('are grouped as Hero and the four areas, each Stat in its area, each column with the sort its heading orders by', () => {
    const groups = rosterColumnGroups();
    expect(groups.map(({ key, label }) => [key, label])).toEqual([
      ['hero', 'Hero'],
      ['physical', 'Physical'],
      ['mental', 'Mental'],
      ['magical', 'Magical'],
      ['social', 'Social'],
    ]);
    expect(groups[0]?.columns).toEqual([
      { key: 'class', label: 'Class', sort: 'class', number: false },
      { key: 'level', label: 'Level', sort: 'level', number: true },
      { key: 'age', label: 'Age', sort: 'age', number: true },
      { key: 'morale', label: 'Morale', sort: 'morale', number: true },
      { key: 'where', label: 'Where', sort: 'free', number: false },
      { key: 'traits', label: 'Traits', sort: null, number: false },
      { key: 'items', label: 'Items', sort: null, number: false },
    ]);
    expect(groups.slice(1).map((group) => group.columns.length)).toEqual([5, 6, 5, 4]);
    for (const group of groups.slice(1)) {
      for (const column of group.columns) {
        expect(content.stats[column.key]?.area).toBe(group.key);
        expect(column).toEqual({ key: column.key, label: content.stats[column.key]?.name, sort: column.key, number: true });
      }
    }
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
      // The hint as its chip says it (DL-125 item 9).
      expect(rows.map((row) => row.outlookWords)).toEqual(rows.map((row) => ({ modest: 'Modest', promising: 'Promising', exceptional: 'Exceptional' })[row.outlook]));
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
    expect(page?.milestones[0]?.when).toBe(whenOfTurn(all.find((entry) => entry.milestone)?.turn ?? 0, document.meta.config));
    expect(page).not.toHaveProperty('history');
  });

  // v1.1.4-S7 (DL-148 item 27, DL-150 item 5): a Trait gained or lost is a Milestone, on the Hero's page.
  test("shows a Trait gained and a Trait lost among its Milestones, in the History's words", () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    const guildId = player(document).id;
    const questId = 'quest-000900' as QuestId;
    const at = (turn: number, type: 'hero.trait-gained' | 'hero.trait-lost', payload: object) =>
      append(document.history, { turn, type, participants: [hero.id, guildId], labels: { [hero.id]: hero.name }, milestone: milestoneTypes[type], payload } as never);
    at(document.world.turn, 'hero.trait-gained', { heroId: hero.id, traitKey: 'lame', questId, encounterIndex: 0, encounterKey: 'ambush-on-the-road' });
    at(document.world.turn, 'hero.trait-lost', { heroId: hero.id, traitKey: 'lame', replacedBy: 'one-eyed' });

    const sentences = heroPage(document, hero.id)?.milestones.map((line) => line.sentence) ?? [];

    expect(sentences).toContain(`${hero.name} lost the Trait Lame, replaced by One-eyed.`);
    expect(sentences.some((sentence) => sentence.startsWith(`${hero.name} earned the Trait Lame on `))).toBe(true);
  });

  test("gives the Hero's sex for their Portrait, and no Portrait's key: every Hero shows the Silhouette of their sex (DL-125 items 2 and 4)", () => {
    const document = newGame();
    for (const hero of Object.values(document.world.heroes)) {
      expect(heroPage(document, hero.id)).toMatchObject({ sex: hero.sex, portraitKey: null });
    }
  });

  test('is null for a Hero the world does not hold', () => {
    expect(heroPage(newGame(), 'hero-999999' as HeroId)).toBeNull();
  });

  test('says an Unattached Hero is in the pool, not at a Hall', () => {
    const document = newGame();
    const [pooled] = unattachedHeroes(document.world);
    if (pooled === undefined) throw new Error('an empty pool');

    expect(heroPage(document, pooled.id)?.where).toEqual({ why: null, words: 'In the Unattached pool' });
  });
});

describe("a Hero's page as a header line and chips (M9-S6, DL-106)", () => {
  test('says who the Hero is in one line: Class, Level, Age, Sex, Background and Guild, "Age" and the Sex capitalised (DL-111 item 9)', () => {
    const document = structuredClone(newGame());
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    hero.classKey = 'rogue';
    hero.level = 3;
    hero.sex = 'female';
    hero.backgroundKey = 'poachers-child';
    hero.ageAtEntry = 18;
    hero.enteredTurn = 0;

    expect(heroPage(document, hero.id)?.line).toEqual(['Rogue', 'Level 3', 'Age 18', 'Female', content.backgrounds['poachers-child']?.name, 'of The Lantern']);
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
      where: { why: 'injured', words: 'Injured, healing on the night of Year 1 Day 7' },
      injury: content.injuries['deep-cut']?.name,
      xp: 45,
      // v1.1.4-S7: each Trait with what it does, in `traitEffectWords`.
      traits: [{ name: content.heroTraits.scarred?.name ?? 'scarred', effect: '+1 Courage, -1 Charisma' }],
      fee: null,
    });
    expect(heroPage(document, other.id)).toMatchObject({ where: { why: null, words: 'At the Hall' }, injury: null, traits: [] });
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
    // v1.1.4-S7 (DL-148 item 24): a Hero Trait's Stat change shows where the Stat shows, as gear's does.
    hero.traits = ['lame' as never];
    const lame = heroPage(document, hero.id)?.areas.flatMap((area) => area.stats) ?? [];
    expect(lame.find((row) => row.name === 'Dexterity')).toMatchObject({ value: Math.max(1, base('dexterity') - 2), lift: { words: '-2', up: false } });
    expect(lame.find((row) => row.name === 'Strength')).toMatchObject({ value: base('strength') + 1, lift: { words: '+1', up: true } });
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

    expect(heroPage(document, hero.id)?.where).toEqual({ why: 'dead', words: 'Died on Year 1 Day 4' });
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
      { name: content.items['arming-sword']?.name, kind: 'Weapon Gear', stack: true },
    ]);
    expect(page.gear.filter((row) => row.worn).map((row) => row.slot)).toEqual(['armour']);
    expect(page.gear.map(({ slotName, item, worn }) => [slotName, item, worn])).toEqual([
      ['Weapon', 'None', false],
      ['Armour', 'Padded jack', true],
      ['Trinket', 'None', false],
    ]);
    // What is in a slot by its content key, none in an empty one; a common Item shows no picture (DL-125 item 8).
    expect(page.gear.map(({ definitionKey, unique }) => [definitionKey, unique])).toEqual([
      [null, false],
      ['padded-jack', false],
      [null, false],
    ]);
    expect(page.actions.transferTo).toEqual(
      others.map((other) => {
        const fee = transferFee(hero, guildmasterOf(other, document.world), deps);
        return { guildId: other.id, name: other.name, fee, sentence: expect.stringContaining(`${other.name} would pay ${fee} Wealth for ${hero.name}`) };
      }),
    );
  });

  test("gives a Unique Item's content key, carried or held, so its picture stands beside its name (DL-125 item 8)", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    const [hero] = heroes(document);
    if (hero === undefined) throw new Error('no Hero');
    createItem(document.world, 'barrow-kings-blade', { kind: 'hero', id: hero.id, slot: 'weapon' });
    createItem(document.world, 'lantern-of-stannary', { kind: 'guild', id: guild.id });
    addStack(document.world, 'arming-sword', 1, { kind: 'guild', id: guild.id });

    const page = heroPage(document, hero.id);

    expect(page?.gear.find((row) => row.slot === 'weapon')).toMatchObject({ definitionKey: 'barrow-kings-blade', unique: true });
    if (page?.actions?.kind !== 'own') throw new Error("not the player's Hero");
    expect(page.actions.equip.map(({ definitionKey, unique }) => ({ definitionKey, unique }))).toEqual([
      { definitionKey: 'lantern-of-stannary', unique: true },
      { definitionKey: 'arming-sword', unique: false },
    ]);
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
      `The Ashford Guild would pay ${target?.fee} Wealth for Finn Grimshaw, if it is willing to take them. Their Gear stays with your ` +
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
    expect(out?.returns).toMatch(/^the night of Year \d+ Day \d+$/);
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
    expect(progressView(between(newGame()))).toEqual({ sentence: 'Played 90 Turns so far. Now Year 1 Day 31, morning.', countdown: null });
  });

  test("gives the Year under the game's own turnsPerYear (v1.0.1-S6, DL-97)", () => {
    const document = structuredClone(newGame());
    document.meta.config = { ...document.meta.config, turnsPerYear: 30 };

    expect(progressView(between(document))?.sentence).toBe('Played 90 Turns so far. Now Year 4 Day 1, morning.');
  });

  test("gives the countdown while the player's Guild is below the floor in that game, under the game's own grace", () => {
    const document = structuredClone(newGame());
    document.meta.config = { ...document.meta.config, bankruptcyGraceDays: 60 };
    player(document).wealth = -5_000;
    const state = between(document);

    expect(state.forwarding === null ? null : countdownView(state.forwarding.document)).not.toBeNull();
    expect(progressView(state)).toEqual({
      sentence: 'Played 90 Turns so far. Now Year 1 Day 31, morning.',
      countdown:
        'The Lantern has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day 61 unless Wealth is back ' +
        'to 0 or more on a night by then, after any Upkeep due.',
    });
    // The game in hand, before the first night's check, has none.
    expect(countdownView(document)).toBeNull();
  });
});

describe("the Guildmaster's setup, for the new-game form (M9-S2)", () => {
  test("gives the age a Guildmaster retires at, the configuration's (DL-113 item 5)", () => {
    expect(guildmasterSetupChoices().retirementAge).toBe(defaultConfig.guildmasterRetirementAge);
    expect(guildmasterSetupChoices(content, { ...defaultConfig, guildmasterRetirementAge: 70 }).retirementAge).toBe(70);
  });

  test('offers the sexes, the starting ages, the budget, the most Traits, and the three descriptive Attributes with their bounds', () => {
    const choices = guildmasterSetupChoices();

    expect(choices).toMatchObject({
      sexes: ['female', 'male'],
      ageMin: defaultConfig.guildmasterStartingAgeMin,
      ageMax: defaultConfig.guildmasterStartingAgeMax,
      traitBudget: 1,
      traitsMax: 2,
    });
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
    const wider = { ...defaultConfig, guildmasterTraitBudget: 3, guildmasterTraitsMax: 3, guildmasterStartingAgeMax: 55 };
    expect(guildmasterSetupChoices(content, wider)).toMatchObject({ traitBudget: 3, traitsMax: 3, ageMax: 55 });
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
