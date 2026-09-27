import {
  addStack,
  advance,
  createWorld,
  dayOf,
  defaultConfig,
  entriesFor,
  guildmasterOf,
  judgedHintBands,
  playerGuild,
  potentialHint,
  rankings,
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
  type QuestId,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import { initialGameState, type GameState } from './reducer';
import {
  boardView,
  consumableChoices,
  guildBackgrounds,
  headerView,
  heldView,
  heroPage,
  historyPageSize,
  logView,
  partyChoices,
  previewView,
  rosterView,
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
    const byFame = rankings(document.world, 'fame');
    const place = byFame.find((ranking) => ranking.guildId === guild.id)?.rank;

    expect(headerView(document)).toEqual({
      guildName: 'The Lantern',
      wealth: guild.wealth,
      fame: guild.fame,
      time: `Day ${dayOf(4)}, ${timeOfDay(4)}, Year 0`,
      rankings: expect.stringMatching(new RegExp(`^${place}(st|nd|rd|th) of ${byFame.length} by Fame$`)),
      seed: 'selectors-played',
      ended: null,
    });
  });

  test('says how the game ended, once it has', () => {
    const document = structuredClone(newGame());
    document.world.ended = { turn: 30, reason: 'bankruptcy' };

    expect(headerView(document)?.ended).toBe('The game ended on Day 10: The Lantern went bankrupt.');
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
      const names = skillsThatHelp(quest, content).map((key) => content.skills[key]?.name);
      expect(card.skillsThatHelp).toBe(names.length === 0 ? 'none' : names.join(', '));
    }
  });
});

describe('choosing a Party', () => {
  test("offers the player's Roster, each Hero who cannot go saying why", () => {
    const document = structuredClone(newGame());
    const [first] = heroes(document);
    if (first === undefined) throw new Error('no Hero');
    first.injury = { typeKey: 'deep-cut', healsOnTurn: 20 };

    const choices = partyChoices(document);

    expect(choices.map((choice) => choice.heroId)).toEqual(player(document).rosterIds);
    for (const choice of choices) {
      const hero = document.world.heroes[choice.heroId] as Hero;
      expect(choice.unavailable === null).toBe(unavailability(hero) === null);
    }
    expect(choices[0]?.unavailable).toBe('is injured');
  });

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
    expect(rows[0]?.morale).toMatch(/^\d+, (wretched|low|steady|high|elated)$/);
  });
});

describe('heldView', () => {
  test('lists what the Guild holds: each Item by name, its kind, how many, and what gear modifies', () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    addStack(document.world, 'healing-draught', 3, { kind: 'guild', id: guild.id });
    addStack(document.world, 'arming-sword', 1, { kind: 'guild', id: guild.id });

    const rows = heldView(document).map(({ name, kind, quantity, modifies }) => ({ name, kind, quantity, modifies }));

    expect(rows).toEqual(
      expect.arrayContaining([
        { name: content.items['healing-draught']?.name, kind: 'consumable', quantity: 3, modifies: '' },
        { name: content.items['arming-sword']?.name, kind: 'weapon gear', quantity: 1, modifies: 'Weaponry +2, Strength +1' },
      ]),
    );
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

      expect(page?.stats.map((row) => row.outlook)).toEqual(stats.map((stat) => potentialHint(hero, stat.key, bands)));
      expect(page?.stats.map((row) => row.base)).toEqual(stats.map((stat) => hero.stats[stat.key]));
      expect(JSON.stringify(page)).not.toMatch(/potential/i);
    }
  });

  test('pages its History newest first, and shows its Milestones first', () => {
    const document = played(240);
    // The busiest Hero of the world: a Rival's, whose Guild sends Parties while the player's rests.
    const hero = Object.values(document.world.heroes).reduce((most, each) =>
      entriesFor(document.history, each.id).length > entriesFor(document.history, most.id).length ? each : most,
    );
    const all = entriesFor(document.history, hero.id);
    expect(all.length).toBeGreaterThan(historyPageSize);

    const first = heroPage(document, hero.id, 0);
    const second = heroPage(document, hero.id, 1);
    const past = heroPage(document, hero.id, 999);

    expect(first?.history).toMatchObject({ page: 0, entries: all.length, pages: Math.ceil(all.length / historyPageSize) });
    expect(first?.history.lines).toHaveLength(historyPageSize);
    expect(first?.history.lines.map((line) => line.when)[0]).toBe(`Day ${dayOf(all[0]?.turn ?? 0)}, ${timeOfDay(all[0]?.turn ?? 0)}`);
    expect(second?.history.lines[0]?.sentence).not.toBe(first?.history.lines[0]?.sentence);
    expect(past?.history.page).toBe((first?.history.pages ?? 1) - 1);
    expect(first?.milestones.every((line) => line.milestone)).toBe(true);
    expect(first?.milestones).toHaveLength(all.filter((entry) => entry.milestone).length);
  });

  test('is null for a Hero the world does not hold', () => {
    expect(heroPage(newGame(), 'hero-999999' as HeroId)).toBeNull();
  });

  test('says an Unattached Hero is in the pool, not at a Hall', () => {
    const document = newGame();
    const [pooled] = unattachedHeroes(document.world);
    if (pooled === undefined) throw new Error('an empty pool');

    expect(heroPage(document, pooled.id)?.attributes).toContainEqual(['Where', 'in the Unattached pool']);
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
    expect(page.actions.transferTo).toEqual(
      others.map((other) => ({
        guildId: other.id,
        name: other.name,
        fee: transferFee(hero, guildmasterOf(other, document.world), deps),
      })),
    );
  });

  test("for a Rival's Hero, the fee the player's Guild would pay to take them in; for an Unattached one, the signing fee and whether they sign", () => {
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
    });
  });

  test("shows on every Rival Hero's page, among the Attributes, the Transfer fee the player's Guild would pay: its actions' fee (DL-74)", () => {
    const document = newGame();
    const buyer = guildmasterOf(player(document), document.world);
    const rivals = Object.values(document.world.guilds).filter((each) => each.id !== player(document).id);
    let seller = 0;
    for (const rival of rivals) {
      for (const heroId of rival.rosterIds) {
        const hero = document.world.heroes[heroId] as Hero;
        const page = heroPage(document, heroId);
        const fee = transferFee(hero, buyer, deps);

        expect(page?.attributes).toContainEqual(['Transfer fee', `${fee} Wealth`]);
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

describe('the log and why time stopped', () => {
  test("narrates the last play's events oldest first, and those naming the player's Guild alone when asked", () => {
    const start = newGame();
    const turn = advance(start, deps);
    const state: GameState = { ...initialGameState, document: turn.document, log: turn.events, stoppedBecause: turn.stoppedBecause };
    const guild = player(turn.document);

    const all = logView(state);
    const mine = logView(state, true);

    expect(all).toHaveLength(turn.events.length);
    expect(mine).toHaveLength(turn.events.filter((event) => event.participants.includes(guild.id)).length);
    expect(logView(initialGameState)).toEqual([]);
  });

  test('says why a fast forward stopped, and nothing after a play that was not one', () => {
    const document = newGame();
    const state: GameState = { ...initialGameState, document, stoppedBecause: { kind: 'max-turns' } };

    expect(stopView(state)).toEqual({ kind: 'max-turns', sentence: `Stopped: played the most Turns allowed, ${defaultConfig.turnsPerYear}.` });
    expect(stopView({ ...state, stoppedBecause: null })).toBeNull();
  });
});

describe('guildBackgrounds', () => {
  test("offers the content's Guild Backgrounds and no other", () => {
    const backgrounds = guildBackgrounds();

    expect(backgrounds.length).toBeGreaterThan(0);
    for (const { key } of backgrounds) expect(content.backgrounds[key]?.owner).toBe('guild');
  });
});
