// End to end: `main` run in-process, as `npm run play -- …` runs it, against real save files in
// a temporary directory, with the real content set, a fixed clock and a scripted random source.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addStack,
  advance,
  applyAction,
  configVersion,
  createWorld,
  dayOf,
  defaultConfig,
  estimateQuest,
  fastForward,
  guildmasterOf,
  isModuleEvent,
  probe,
  schemaVersion,
  serialise,
  upkeep,
  type EntityId,
  type Guild,
  type Hero,
  type HeroId,
  type Quest,
  type QuestId,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { count, makeId, nightOf } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { chanceWords, shownPercent, traitEffectWords } from '@heroesim/words';
import { beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, openToTwo, playground, rowOf, type Run } from './play.test-support.js';
import { narrateLine } from './namer.js';

const content = loadContent();
const clock = new Date('2026-09-26T09:30:00.000Z');
const playerId = makeId('guilds', 1);

const scratch = playground('heroesim-cli-', content);
const { current, saved, document, edit } = scratch;
/** The running test's scratch directory. */
const dir = (): string => scratch.dir();
/** The random source's draws, in order, then 0s. */
let draws: number[];
beforeEach(() => {
  draws = [];
});

/** A command line in the scratch directory, with `env`, the clock and the draws. */
function play(argv: string[], env: Record<string, string> = {}): Run {
  return scratch.play(argv, { env, now: () => clock, random: () => draws.shift() ?? 0 });
}

/** The save text with `meta.version: 999`, a schema this code has never heard of. */
function fromTheFuture(text: string): string {
  const parsed = JSON.parse(text) as { meta: { version: number } };
  parsed.meta.version = 999;
  return JSON.stringify(parsed);
}

function newDemo(...more: string[]): Run {
  return play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada', ...more]);
}

/** The first Quest on the Board the player's first Heroes can take: no Class or Skill asked, and a size they make. */
function openQuest(world: WorldDocument['world']): { questId: QuestId; heroIds: HeroId[] } {
  const roster = world.guilds[playerId]?.rosterIds ?? [];
  for (const questId of world.board) {
    const { requirements } = world.quests[questId] as Quest;
    if (requirements.classKey === undefined && requirements.skillKey === undefined) {
      return { questId, heroIds: roster.slice(0, requirements.partySizeMin) };
    }
  }
  throw new Error('No open Quest on the Board');
}

describe('new', () => {
  test('creates the world the engine makes from the seed and the clock, and saves it', () => {
    const run = newDemo();

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const expected = createWorld(
      'demo',
      { guildName: 'The Test', guildmasterName: 'Ada', createdAt: clock.toISOString() },
      { config: defaultConfig, content },
    ).document;
    expect(saved()).toBe(serialise(expected));
    expect(run.out).toContain('Created a world from seed demo');
    expect(run.out).toContain('The Test');
  });

  test('makes up a readable seed when none is given', () => {
    draws = [0, 4 / 16, 0.4821];

    const run = play(['new', '--guild', 'The Test', '--master', 'Ada']);

    expect(run.code).toBe(exitCodes.ok);
    expect(document().meta.seed).toBe('amber-fox-4821');
    expect(run.out).toContain('amber-fox-4821');
  });

  test('takes a Guild Background by key and refuses any other key, listing the choices', () => {
    expect(newDemo('--background', 'breakaway').code).toBe(exitCodes.ok);
    expect(document().world.guilds[playerId]?.backgroundKey).toBe('breakaway');

    for (const key of ['farm-born', 'no-such-background']) {
      const run = newDemo('--background', key, '--force');
      expect(run.code).toBe(exitCodes.usage);
      expect(run.err).toContain('Old charter (old-charter)');
    }
  });

  test('refuses to replace a save unless told to', () => {
    newDemo();
    const first = saved();

    const refused = play(['new', '--seed', 'other', '--guild', 'G', '--master', 'M']);
    expect(refused.code).toBe(exitCodes.refused);
    expect(refused.err).toContain('--force');
    expect(saved()).toBe(first);

    expect(play(['new', '--seed', 'other', '--guild', 'G', '--master', 'M', '--force']).code).toBe(exitCodes.ok);
    expect(document().meta.seed).toBe('other');
  });

  test('refuses a blank name', () => {
    expect(play(['new', '--guild', '  ', '--master', 'Ada']).code).toBe(exitCodes.usage);
    expect(existsSync(current())).toBe(false);
  });

  test("sets the Guildmaster's sex, age, Traits and descriptive Attributes from its flags, as the engine makes them", () => {
    const run = newDemo(
      '--sex', 'male', '--age', '44', '--traits', 'spendthrift,well-liked',
      '--birthplace', ' Harrowgate ', '--appearance', 'Grey at the temples.', '--biography', 'Once a quartermaster.',
    );

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const expected = createWorld(
      'demo',
      {
        guildName: 'The Test',
        guildmasterName: 'Ada',
        guildmasterSex: 'male',
        guildmasterAge: 44,
        guildmasterTraitKeys: ['spendthrift', 'well-liked'],
        guildmasterBirthplace: 'Harrowgate',
        guildmasterAppearance: 'Grey at the temples.',
        guildmasterBiography: 'Once a quartermaster.',
        createdAt: clock.toISOString(),
      },
      { config: defaultConfig, content },
    ).document;
    expect(saved()).toBe(serialise(expected));
    expect(guildmasterOf(document().world.guilds[playerId] as Guild, document().world)).toMatchObject({
      sex: 'male',
      ageAtEntry: 44,
      traits: ['spendthrift', 'well-liked'],
      birthplace: 'Harrowgate',
    });

    expect(newDemo('--traits', 'none', '--force').code).toBe(exitCodes.ok);
    expect(guildmasterOf(document().world.guilds[playerId] as Guild, document().world)?.traits).toEqual([]);
  });

  test('writes each descriptive Attribute left blank as the engine does, with no flag, and keeps one given', () => {
    expect(newDemo('--birthplace', 'Harrowgate').code).toBe(exitCodes.ok);
    const expected = createWorld(
      'demo',
      { guildName: 'The Test', guildmasterName: 'Ada', guildmasterBirthplace: 'Harrowgate', createdAt: clock.toISOString() },
      { config: defaultConfig, content },
    ).document;
    expect(saved()).toBe(serialise(expected));
    const written = guildmasterOf(document().world.guilds[playerId] as Guild, document().world);
    expect(written?.birthplace).toBe('Harrowgate');
    expect(written?.appearance).not.toBe('');
    expect(written?.biography).toContain('Harrowgate');

    const lines = play(['show', 'guildmaster']).out.split('\n');
    for (const label of ['Birthplace', 'Appearance', 'Biography']) expect(lines.some((line) => line.startsWith(label)), label).toBe(true);
  });

  // Traits and Portraits the refusals name are read from content, which the content editor and the
  // portrait tool change: two Traits that exclude each other, two that cost more than the budget
  // together, and the Guildmaster Portraits by sex (`portrait.test.ts` holds the rest).
  const traits = Object.values(content.guildmasterTraits);
  const pairs = traits.flatMap((one) => traits.filter((other) => other.key !== one.key).map((other) => [one, other] as const));
  const excluding = pairs.find(([one, other]) => one.excludes.includes(other.key));
  const overBudget = pairs.find(
    ([one, other]) => !one.excludes.includes(other.key) && !other.excludes.includes(one.key) && one.cost + other.cost > defaultConfig.guildmasterTraitBudget,
  );
  if (excluding === undefined || overBudget === undefined) throw new Error('The content has no such pair of Guildmaster Traits');
  const portraitChoices = (['female', 'male'] as const)
    .flatMap((sex) => content.portraits.guildmaster[sex].map((key) => `${key} (${sex})`))
    .join(', ');

  test.each<[string, string[], string]>([
    ['an age below the range', ['--age', '20'], 'A Guildmaster starts aged 21 to 50, in whole Years; --age 20 is not.'],
    ['an age above the range', ['--age', '51'], 'A Guildmaster starts aged 21 to 50, in whole Years; --age 51 is not.'],
    ['a Trait content lacks', ['--traits', 'brave'], 'No Guildmaster Trait is called "brave". Choose from:'],
    ['a Hero Trait', ['--traits', 'scarred'], `${content.heroTraits['scarred']?.name} is not a Guildmaster Trait. Choose from:`],
    ['a Trait twice', ['--traits', 'miser,miser'], 'Miser is chosen twice.'],
    ['too many Traits', ['--traits', 'miser,old-soldier,mistrusts-magic'], 'A Guildmaster holds at most 2 Traits; 3 are chosen.'],
    [
      'an excluded pair',
      ['--traits', `${excluding[0].key},${excluding[1].key}`],
      `${excluding[0].name} and ${excluding[1].name} exclude each other: a Guildmaster holds one or the other.`,
    ],
    [
      'Traits over the budget',
      ['--traits', `${overBudget[0].key},${overBudget[1].key}`],
      `Those Traits cost ${overBudget[0].cost + overBudget[1].cost} points and the budget is ${defaultConfig.guildmasterTraitBudget}: a buff costs points and a penalty refunds them.`,
    ],
    ['a Birthplace too long', ['--birthplace', 'x'.repeat(61)], 'The Birthplace is 61 characters long; it holds at most 60.'],
    ['a Biography too long', ['--biography', 'x'.repeat(1001)], 'The Biography is 1001 characters long; it holds at most 1000.'],
    ['a Portrait content lacks', ['--portrait', 'gm-male-99'], `No Guildmaster Portrait is called "gm-male-99". Choose from: ${portraitChoices}.`],
  ])('refuses %s with its own sentence as a bad command line, writing nothing', (_, flags, sentence) => {
    const run = newDemo(...flags);

    expect(run.code).toBe(exitCodes.usage);
    expect(run.err).toContain(sentence);
    expect(existsSync(current())).toBe(false);
  });

  // DL-149 item 9: the Guildmaster's Stats, every one or none, within the Stat points.
  test("--stats sets the Guildmaster's Stats, as the engine makes them; left out, they are drawn", () => {
    const stats = { inspiration: 12, influence: 8, negotiation: 15, coaching: 5, judgement: 10 };
    const run = newDemo('--stats', 'inspiration=12,influence=8,negotiation=15,coaching=5,judgement=10');

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const expected = createWorld(
      'demo',
      { guildName: 'The Test', guildmasterName: 'Ada', guildmasterStats: stats, createdAt: clock.toISOString() },
      { config: defaultConfig, content },
    ).document;
    expect(saved()).toBe(serialise(expected));
    expect(guildmasterOf(document().world.guilds[playerId] as Guild, document().world)?.stats).toEqual(stats);
    // Stat points left unspent are allowed, and lost, and `new` says so; spent in full, it says nothing of them.
    expect(run.out).not.toContain('Stat points');
    const unspent = newDemo('--stats', 'inspiration=5,influence=5,negotiation=5,coaching=5,judgement=5', '--force');
    expect(unspent.code).toBe(exitCodes.ok);
    expect(unspent.out).toContain('25 Stat points left unspent are lost.');
    // Left out, the world is the one drawn, Stats and all.
    expect(newDemo('--force').code).toBe(exitCodes.ok);
    const drawn = createWorld('demo', { guildName: 'The Test', guildmasterName: 'Ada', createdAt: clock.toISOString() }, { config: defaultConfig, content });
    expect(saved()).toBe(serialise(drawn.document));
  });

  test.each<[string, string, string]>([
    ['a Stat left out', 'inspiration=12,influence=8,negotiation=15', 'Every Guildmaster Stat is chosen, or none; Coaching and Judgement are not.'],
    [
      'a Stat out of range',
      'inspiration=16,influence=8,negotiation=10,coaching=5,judgement=10',
      "A Guildmaster's Inspiration is 5 to 15 when chosen, in whole numbers; --stats inspiration=16 is not.",
    ],
    [
      'Stats over the points',
      'inspiration=15,influence=15,negotiation=10,coaching=5,judgement=10',
      'Those Stats spend 55 points, and the Stat points are 50: lower one to raise another.',
    ],
    [
      'a Stat content lacks',
      'inspiration=10,influence=10,negotiation=10,coaching=10,judgement=5,charm=5',
      'No Guildmaster Stat is called "charm". Choose from: inspiration, influence, negotiation, coaching and judgement.',
    ],
    ['a Hero Stat', 'strength=10', 'No Guildmaster Stat is called "strength".'],
    ['a Stat named twice', 'inspiration=10,inspiration=12', '--stats names inspiration twice.\n\n'],
    ['a Stat with no number', 'inspiration=high', '--stats needs each Guildmaster Stat as key=number, such as inspiration=12, joined by commas; got "inspiration=high"'],
  ])('refuses %s with its own sentence as a bad command line, writing nothing (DL-153)', (_, stats, sentence) => {
    const run = newDemo('--stats', stats);

    expect(run.code).toBe(exitCodes.usage);
    expect(run.err).toContain(sentence);
    expect(existsSync(current())).toBe(false);
  });

  test('writes to the save --save names, in HEROESIM_SAVE_DIR when it is set', () => {
    expect(newDemo('--save', 'demo').code).toBe(exitCodes.ok);
    expect(existsSync(join(dir(), '.saves', 'demo.json'))).toBe(true);

    const run = play(['new', '--guild', 'G', '--master', 'M'], { HEROESIM_SAVE_DIR: 'elsewhere' });
    expect(run.code).toBe(exitCodes.ok);
    expect(existsSync(join(dir(), 'elsewhere', 'current.json'))).toBe(true);
    expect(play(['show'], { HEROESIM_SAVE_DIR: 'elsewhere' }).code).toBe(exitCodes.ok);
  });
});

describe('show', () => {
  beforeEach(() => {
    newDemo();
  });

  test('with no view prints the Turn, the Guilds and the counts', () => {
    const { world } = document();

    const run = play(['show']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Seed demo, Turn 0');
    for (const guild of Object.values(world.guilds)) expect(rowOf(run.out, guild.id)).toContain(guild.name);
    expect(run.out).toContain(`${defaultConfig.rivalCount + 1} Guilds`);
    expect(run.out).toContain(`(${defaultConfig.unattachedPoolSize} Unattached)`);
    expect(run.out).toContain(`${defaultConfig.patronCount} Patrons`);
  });

  test('guilds prints each Guild with its Guildmaster, Roster size, Wealth, Fame and Upkeep', () => {
    const { world } = document();

    const run = play(['show', 'guilds']);

    expect(run.code).toBe(exitCodes.ok);
    for (const guild of Object.values(world.guilds)) {
      const row = rowOf(run.out, guild.id);
      expect(row).toContain(guild.name);
      expect(row).toContain(world.guildmasters[guild.guildmasterId]?.name);
      expect(row).toContain(content.backgrounds[guild.backgroundKey]?.name);
      const due = upkeep(guild, world, defaultConfig, content);
      expect(row).toMatch(new RegExp(`\\b${guild.rosterIds.length}\\s+${guild.wealth}\\s+${guild.fame}\\s+${due}$`));
    }
    expect(rowOf(run.out, playerId)).toContain('Player');
  });

  test("show and show guilds name each Guildmaster's Portrait, its picture's key or the Silhouette", () => {
    const rivalId = makeId('guilds', 2);
    edit((edited) => {
      const rival = edited.world.guilds[rivalId] as Guild;
      Object.assign(edited.world.guildmasters[rival.guildmasterId] ?? {}, { portraitKey: null });
    });
    const { world } = document();

    for (const view of [['show'], ['show', 'guilds']]) {
      const run = play(view);
      expect(run.out.split('\n').find((line) => line.startsWith('Id'))).toMatch(/\sGuildmaster\s+Portrait\s+Background\s/);
      for (const guild of Object.values(world.guilds)) {
        const guildmaster = world.guildmasters[guild.guildmasterId];
        const words = guildmaster?.portraitKey ?? 'Silhouette';
        expect(rowOf(run.out, guild.id)).toMatch(new RegExp(`${guildmaster?.name ?? ''}\\s+${words}\\s`));
      }
      expect(rowOf(run.out, rivalId)).toMatch(/\sSilhouette\s/);
    }
  });

  test('guilds marks a folded Guild with the date it folded, and show lists only the Guilds in play (DL-28, DL-33, DL-210)', () => {
    const rivalId = makeId('guilds', 2);
    // Folded as a fold leaves a Guild: its Heroes released to the pool, its Roster empty.
    edit((edited) => {
      const rival = edited.world.guilds[rivalId] as Guild;
      for (const heroId of rival.rosterIds) {
        Object.assign(edited.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: 0 });
      }
      rival.rosterIds = [];
      rival.foldedOnTurn = 0;
    });

    const guilds = play(['show', 'guilds']);
    const summary = play(['show']);

    expect(guilds.code).toBe(exitCodes.ok);
    expect(rowOf(guilds.out, rivalId)).toMatch(/\s{2}on Year 1 Day 1$/);
    expect(rowOf(guilds.out, playerId)).not.toContain('on Year');
    expect(guilds.out.split('\n')[2]).toMatch(/\s{2}Folded$/);
    expect(summary.out.split('\n').some((line) => line.startsWith(rivalId))).toBe(false);
    expect(rowOf(summary.out, playerId)).toContain('The Test');
    expect(summary.out).toContain(`${defaultConfig.rivalCount} Guilds in play and 1 folded (show guilds lists them)`);
  });

  test("roster takes another Guild's id, and refuses one not in the save", () => {
    const { world } = document();
    const rival = world.guilds[makeId('guilds', 2)];

    const run = play(['show', 'roster', makeId('guilds', 2)]);

    expect(run.code).toBe(exitCodes.ok);
    for (const id of rival?.rosterIds ?? []) expect(run.out).toContain(id);
    const refused = play(['show', 'roster', 'guild-000999']);
    expect(refused.code).toBe(exitCodes.refused);
    expect(refused.err).toContain('guild-000999');
  });

  // DL-241: one sentence, the refusals' table's (DL-240), wherever the save has no player's Guild.
  test("says a save has no player's Guild in the refusals' words, wherever a command needs one", () => {
    edit((edited) => {
      (edited.world.guilds[playerId] as Guild).controller = { kind: 'rival', disposition: 'steady' };
    });
    const sentence = "The save has no player's Guild.";

    for (const argv of [['show', 'roster'], ['show', 'hall'], ['show', 'guildmaster'], ['recruit', '--hero', 'hero-000001'], ['advance', '--until', 'decision']]) {
      expect(play(argv), argv.join(' ')).toMatchObject({ code: exitCodes.refused, out: '', err: `${sentence}\n` });
    }
    expect(play(['show', 'offers']).out).toBe(`${sentence}\n`);
  });

  test('patrons prints each Patron with their Sex and the name of their Sphere', () => {
    const patrons = Object.values(document().world.patrons);

    const run = play(['show', 'patrons']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/^Id\s+Patron\s+Sex\s+Sphere\s/m);
    expect(new Set(patrons.map(({ sex }) => sex))).toEqual(new Set(['female', 'male']));
    for (const patron of patrons) {
      const row = rowOf(run.out, patron.id);
      expect(row).toMatch(new RegExp(`${patron.name}\\s+${patron.sex === 'female' ? 'Female' : 'Male'}\\s+${content.spheres[patron.sphereKey]?.name}`));
    }
  });

  test('board says so when the Board is empty', () => {
    edit((edited) => {
      edited.world.board = [];
      edited.world.quests = {};
    });

    const run = play(['show', 'board']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Board: 0 Quests on offer');
    expect(run.out).toContain('The Board is empty.');
  });

  test('hero never prints Potential, even as a number found nowhere else', () => {
    const id = makeId('heroes', 1);
    const sentinels: string[] = [];
    edit((edited) => {
      const hero = edited.world.heroes[id] as Hero;
      Object.keys(hero.potential).forEach((key, index) => {
        hero.potential[key] = 900_001 + index;
        sentinels.push(String(900_001 + index));
      });
    });

    const run = play(['show', 'hero', id]);

    expect(run.code).toBe(exitCodes.ok);
    for (const sentinel of sentinels) expect(run.out).not.toContain(sentinel);
    expect(run.out).not.toContain('9000');
  });

  test("hero refuses an id not in the save", () => {
    const run = play(['show', 'hero', 'hero-999999']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('hero-999999');
  });

  test('hero shows a content key the content does not define as it is, with a warning (rule 5)', () => {
    const id = makeId('heroes', 1);
    edit((edited) => {
      (edited.world.heroes[id] as Hero).backgroundKey = 'sea-born';
    });

    const run = play(['show', 'hero', id]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/^Background\s+sea-born$/m);
    expect(run.err).toContain('Warning');
  });

  test("ages a Hero under the save's own config, not the current defaults", () => {
    const id = makeId('heroes', 1);
    const hero = document().world.heroes[id] as Hero;
    edit((edited) => {
      edited.meta.config.turnsPerYear = 3;
      edited.world.turn = 30;
    });

    const run = play(['show', 'hero', id]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(new RegExp(`^Age\\s+${hero.ageAtEntry + 10}$`, 'm'));
  });

  test('history prints every entry oldest first, and one entity\'s newest first', () => {
    const { history } = document();

    const all = play(['show', 'history']);

    expect(all.code).toBe(exitCodes.ok);
    expect(all.out).toContain(`History: ${history.entries.length} entries, oldest first`);
    const lines = all.out.split('\n');
    // Each entry's Turn, then its date (DL-206 item 33, DL-210).
    expect(all.out).toMatch(/^Turn\s+Date\s+Event\s+Milestone\s+Who$/m);
    expect(lines.filter((line) => /^\s*0 {2}Year 1 Day 1, morning\s+\S+\.\S+/.test(line))).toHaveLength(history.entries.length);
    expect(lines.findIndex((line) => line.includes('world.created'))).toBeLessThan(
      lines.findIndex((line) => line.includes('guild.founded')),
    );

    const guild = play(['show', 'history', playerId]);
    expect(guild.code).toBe(exitCodes.ok);
    expect(guild.out).toContain(`History of The Test (${playerId})`);
    expect(guild.out).toMatch(/guild\.founded\s+Yes\s+The Test, Ada/);
    const guildLines = guild.out.split('\n');
    expect(guildLines.findIndex((line) => line.includes('hero.generated'))).toBeLessThan(
      guildLines.findIndex((line) => line.includes('guild.founded')),
    );
  });

  test('history refuses a word that is not an id', () => {
    expect(play(['show', 'history', 'ada']).code).toBe(exitCodes.usage);
  });

  test('history pluralises the entry count: one entry reads "1 entry", never "1 entries"', () => {
    // A Patron who offers nothing on the first Board has only their patron.generated entry
    // (DL-19 item 10); six Quests from twelve Patrons leave some such.
    const { byEntity } = document().history;
    const patronId = Object.keys(document().world.patrons).find((id) => byEntity[id as EntityId]?.length === 1);
    if (patronId === undefined) throw new Error('Every Patron offers a Quest on the first Board');

    const run = play(['show', 'history', patronId]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('1 entry, newest first');
    expect(run.out).not.toContain('1 entries');

    // Any other count still reads "entries".
    const all = play(['show', 'history']);
    const { entries } = document().history;
    expect(entries.length).toBeGreaterThan(1);
    expect(all.out).toContain(`${entries.length} entries, oldest first`);
  });
});

describe('advance', () => {
  beforeEach(() => {
    newDemo();
  });

  test('plays one Turn, saves the document the engine returns, and show reflects the Turn', () => {
    const before = document();
    const expected = advance(before, { config: { ...defaultConfig, ...before.meta.config }, content }).document;

    const run = play(['advance']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected));
    expect(run.out).toContain('Played 1 Turn. Now Turn 1 (Year 1 Day 1, afternoon).');
    expect(play(['show']).out).toContain('Seed demo, Turn 1 (Year 1 Day 1, afternoon)');
  });

  test('--turns plays that many Turns: three from a new world is the morning of Year 1 Day 2', () => {
    const run = play(['advance', '--turns', '3']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Played 3 Turns. Now Turn 3 (Year 1 Day 2, morning).');
    expect(document().world.turn).toBe(3);
    expect(play(['show']).out).toContain('Seed demo, Turn 3 (Year 1 Day 2, morning)');
  });

  test('refuses a game that has ended, writing nothing', () => {
    edit((edited) => {
      edited.world.ended = { turn: 0, reason: 'bankruptcy' };
    });
    const original = saved();

    const run = play(['advance', '--turns', '2']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('The game ended on Year 1 Day 1 (Turn 0): The Test went bankrupt. No Turn follows.');
    expect(saved()).toBe(original);
  });

  test("prints the Bankruptcy countdown after the Turns while the player's Guild is below the floor, under the save's grace (DL-95)", () => {
    const countdown = (dueDay: number) =>
      `The Test has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day ${dueDay + 1} ` +
      'unless Wealth is back to 0 or more on a night by then, after any Upkeep due.';
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, bankruptcyGraceDays: 10 };
      (edited.world.guilds[playerId] as Guild).wealth = -1;
    });

    const morning = play(['advance']);
    expect(morning.out).not.toContain('Bankruptcy floor');

    // The night of the first Day finds it below the floor: the line follows the Turns played.
    const night = play(['advance']);
    expect(night.code).toBe(exitCodes.ok);
    expect(night.out.split('\n').slice(0, 2)).toEqual(['Played 1 Turn. Now Turn 2 (Year 1 Day 1, night).', countdown(10)]);
    expect(play(['show']).out.split('\n')[1]).toBe(countdown(10));

    // Wealth back above the floor during the second Day: the countdown stands until that night's check.
    edit((edited) => {
      (edited.world.guilds[playerId] as Guild).wealth = 1_000;
    });
    // A fast forward, which stops for a decision the next morning, prints it after why it stopped.
    const risen = play(['advance', '--until', 'ended']).out.split('\n');
    expect(risen[0]).toBe('Played 1 Turn. Now Turn 3 (Year 1 Day 2, morning).');
    expect(risen[1]).toMatch(/^Stopped: a decision is needed: /);
    expect(risen[2]).toBe(countdown(10));
    expect(play(['advance']).out.split('\n')[1]).toBe(countdown(10));
    const cleared = play(['advance']);
    expect(cleared.out).toContain('Now Turn 5 (Year 1 Day 2, night).');
    expect(cleared.out).not.toContain('has been below the Bankruptcy floor');
    // That night's check is heard: the event says so, and the countdown is gone.
    expect(cleared.out).toContain(
      "The Test's Wealth, 1000, is back to the Bankruptcy floor of 0 or more, after falling below it on Year 1 Day 1: no Bankruptcy is due.",
    );
    expect(play(['show']).out).not.toContain('Bankruptcy floor');
  });
});

describe('advance --until: fast forward', () => {
  beforeEach(() => {
    newDemo();
  });

  const playDepsOf = (before: WorldDocument) => ({ config: { ...defaultConfig, ...before.meta.config }, content });

  /**
   * Sends two of the player's four Heroes on the demo Board's longest Quest any two may take
   * (`openToTwo`); the other two stay at home, and no decision is needed while the Party is out.
   */
  function sendParty(): { partyId: string; returnsOnTurn: number; questName: string } {
    const { world } = document();
    const quest = openToTwo(world);
    const roster = world.guilds[playerId]?.rosterIds ?? [];
    expect(play(['dispatch', '--quest', quest.id, '--heroes', roster.slice(0, 2).join(',')]).code).toBe(exitCodes.ok);
    const party = Object.values(document().world.parties)[0];
    if (party === undefined) throw new Error('No Party');
    return { partyId: party.id, returnsOnTurn: party.returnsOnTurn, questName: content.questTemplates[quest.templateKey]?.name ?? quest.templateKey };
  }

  test('party-returns stops on the night the Party comes home, printing why and every event since the last command', () => {
    // Unattached Heroes leave after two Days, so the pool refills on the way whether or not the
    // Rivals recruit (which the balance pass, DL-35, made rare).
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, unattachedStayDays: 2 };
    });
    const { partyId, returnsOnTurn, questName } = sendParty();
    const before = document();
    const expected = fastForward(
      before,
      { guildId: playerId, until: ['party-returned'], maxTurns: defaultConfig.turnsPerYear },
      playDepsOf(before),
    );

    const run = play(['advance', '--until', 'party-returns']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected.document));
    expect(document().world.turn).toBe(returnsOnTurn);
    expect(run.out).toContain(`Played ${returnsOnTurn} Turns. Now Turn ${returnsOnTurn} (Year 1 Day ${dayOf(returnsOnTurn) + 1}, night).`);
    expect(run.out).toContain(`Stopped: The Test's Party came home: ${partyId}.`);
    expect(run.out).toContain(`Events: ${expected.events.length}, oldest first`);
    expect(run.out).toContain(`The Test's ${partyId} came home from ${questName} (quest-`);
    // Each event's Turn, then its date (DL-206 item 33, DL-210).
    expect(run.out).toMatch(/^Turn\s+Date\s+What happened$/m);
    expect(run.out).toMatch(new RegExp(`^\\s*${returnsOnTurn} {2}Year 1 Day ${dayOf(returnsOnTurn) + 1}, night\\s+The Test's ${partyId} came home`, 'm'));
    // The pool refreshed on the way, and did not stop it: pool-refreshed is opt-in.
    expect(run.out).toContain('joined the Unattached pool.');
  });

  test('pool-refreshed stops on the first night new Heroes enter the pool, naming them, only when asked', () => {
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, unattachedStayDays: 2 };
    });
    sendParty();
    const before = document();
    const expected = fastForward(
      before,
      { guildId: playerId, until: ['pool-refreshed'], maxTurns: defaultConfig.turnsPerYear },
      playDepsOf(before),
    );
    expect(expected.stoppedBecause.kind).toBe('pool-refreshed');

    const run = play(['advance', '--until', 'pool-refreshed']);

    expect(run.code).toBe(exitCodes.ok);
    const { world } = document();
    expect(world.turn).toBe(expected.document.world.turn);
    expect(run.out).toMatch(/Stopped: new in the Unattached pool: .+ \(hero-\d{6}\).* \(show pool\)\./);
  });

  test('decision stops the morning Quests the idle Roster could take reach the Board', () => {
    const run = play(['advance', '--until', 'decision']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Now Turn 3 (Year 1 Day 2, morning).');
    expect(run.out).toMatch(/Stopped: a decision is needed: The Test has no Party out, and could send one on quest-\d{6}.* \(show board\)\./);
  });

  test('staffable stops, with a Party out, the morning a Quest the Heroes at home could take reaches the Board', () => {
    const { returnsOnTurn } = sendParty();
    const before = document();
    const expected = fastForward(
      before,
      { guildId: playerId, until: ['quest-staffable'], maxTurns: defaultConfig.turnsPerYear },
      playDepsOf(before),
    );
    expect(expected.stoppedBecause.kind).toBe('quest-staffable');

    const run = play(['advance', '--until', 'staffable']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected.document));
    expect(document().world.turn).toBeLessThan(returnsOnTurn);
    expect(run.out).toMatch(/Stopped: a Quest to staff: The Test's Heroes at home could go on quest-\d{6}.* \(show board\)\./);
    // Unasked, the Party out keeps the always-on decision quiet until it comes home.
    expect(play(['advance', '--until', 'decision']).out).toContain("Stopped: The Test's Party came home");
    expect(document().world.turn).toBe(returnsOnTurn);
  });

  test("the player's Guild falling below the floor stops it unasked, naming the night, the countdown after", () => {
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, bankruptcyGraceDays: 10 };
      (edited.world.guilds[playerId] as Guild).wealth = -1;
    });

    const run = play(['advance', '--until', 'pool-refreshed']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out.split('\n').slice(0, 3)).toEqual([
      'Played 2 Turns. Now Turn 2 (Year 1 Day 1, night).',
      'Stopped: The Test fell below the Bankruptcy floor: Bankruptcy on the night of Year 1 Day 11 unless its Wealth recovers by then.',
      'The Test has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day 11 unless Wealth is back to 0 or ' +
        'more on a night by then, after any Upkeep due.',
    ]);
    expect(run.out).toContain(
      "The Test's Wealth, -1, fell below the Bankruptcy floor of 0: Bankruptcy on the night of Year 1 Day 11 unless it is back to 0 or more on a night by then.",
    );
  });

  test('--max caps the Turns and says so', () => {
    sendParty();

    const run = play(['advance', '--max', '2']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Played 2 Turns.');
    expect(run.out).toContain('Stopped: played the most Turns allowed, 2.');
    expect(document().world.turn).toBe(2);
  });

  test("without --max the cap is one year of Turns, under the save's own rules", () => {
    // A Guild with no Roster sends no one and has nothing to decide: only the cap stops it. The
    // save's rules make a year thirty Turns, which keeps the test short.
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, turnsPerYear: 30 };
      const guild = edited.world.guilds[playerId] as Guild;
      for (const heroId of guild.rosterIds) {
        Object.assign(edited.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: edited.world.turn });
      }
      guild.rosterIds = [];
    });

    const year = play(['advance', '--until', 'ended']);

    expect(year.code, year.err).toBe(exitCodes.ok);
    expect(year.out).toContain('Played 30 Turns. Now Turn 30 (Year 2 Day 1, morning).');
    expect(year.out).toContain('Stopped: played the most Turns allowed, 30.');
  });

  test('refuses a game that has ended, writing nothing', () => {
    edit((edited) => {
      edited.world.ended = { turn: 0, reason: 'retirement' };
    });
    const original = saved();

    const run = play(['advance', '--until', 'party-returns', '--max', '5']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('The game ended on Year 1 Day 1 (Turn 0): The Test lost its Guildmaster to Retirement. No Turn follows.');
    expect(saved()).toBe(original);
  });
});

describe('dispatch', () => {
  beforeEach(() => {
    newDemo();
  });

  test('sends the Party the engine sends, saves it, and prints the Party, the return Day and the Rivals reminder', () => {
    const before = document();
    const { questId, heroIds } = openQuest(before.world);
    const expected = applyAction(
      before,
      { kind: 'dispatch', guildId: playerId, questId, heroIds },
      { config: { ...defaultConfig, ...before.meta.config }, content },
    );
    if (!expected.ok) throw new Error(`Rejected ${expected.rejection.reason}`);
    const party = Object.values(expected.document.world.parties)[0];
    if (party === undefined) throw new Error('No Party');

    const run = play(['dispatch', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected.document));
    expect(run.out).toContain(`Dispatched ${party.id} from The Test on ${questId}`);
    for (const heroId of heroIds) expect(run.out).toContain(`${before.world.heroes[heroId]?.name} (${heroId})`);
    // The night as a date, the Turn beside it (DL-206 item 33, DL-210).
    expect(run.out).toContain(`it returns on the night of Year 1 Day ${dayOf(party.returnsOnTurn) + 1} (Turn ${party.returnsOnTurn}).`);
    expect(run.out).toContain('Rivals take Quests from the Board each afternoon');
    expect(play(['show', 'board']).out).not.toContain(questId);
  });

  test('refuses it, as build and recruit, once the game has ended, writing nothing (DL-28, DL-53)', () => {
    // A game ended by the Guildmaster's Retirement keeps its Wealth, so every action could be paid for.
    const { questId, heroIds } = openQuest(document().world);
    const pooled = Object.values(document().world.heroes).find((hero) => hero.unattachedSince !== null) as Hero;
    const actions = [
      ['dispatch', '--quest', questId, '--heroes', heroIds.join(',')],
      ['build', '--facility', 'infirmary'],
      ['recruit', '--hero', pooled.id],
    ];
    edit((edited) => {
      (edited.world.guilds[playerId] as Guild).wealth = 100_000;
      edited.world.ended = { turn: 0, reason: 'retirement' };
    });
    const original = saved();

    for (const argv of actions) {
      const run = play(argv);
      expect(run.code, argv[0]).toBe(exitCodes.refused);
      expect(run.err).toContain('The game ended on Year 1 Day 1 (Turn 0): The Test lost its Guildmaster to Retirement. Nothing more can be done in it.');
      expect(saved()).toBe(original);
    }

    // The same three, on the same save with the game going on, are taken.
    edit((edited) => {
      edited.world.ended = null;
    });
    for (const argv of actions) expect(play(argv).code, argv[0]).toBe(exitCodes.ok);
  });

  test("refuses a Quest not on the Board, a Hero away and another Guild's Hero, writing nothing", () => {
    const { questId, heroIds } = openQuest(document().world);
    expect(play(['dispatch', '--quest', questId, '--heroes', heroIds.join(',')]).code).toBe(exitCodes.ok);
    const original = saved();
    const { world } = document();
    const next = openQuest(world);
    const idle = (world.guilds[playerId]?.rosterIds ?? []).filter((id) => !heroIds.includes(id));
    const rivalHero = world.guilds[makeId('guilds', 2)]?.rosterIds[0] as HeroId;

    const cases: [string[], RegExp][] = [
      [['--quest', questId, '--heroes', idle.join(',')], new RegExp(`\\(${questId}\\) is not on the Board`)],
      [['--quest', next.questId, '--heroes', heroIds.join(',')], /is away with a Party and cannot go/],
      [['--quest', next.questId, '--heroes', rivalHero], new RegExp(`\\(${rivalHero}\\) is not on the Roster of The Test`)],
    ];
    for (const [flags, problem] of cases) {
      const run = play(['dispatch', ...flags]);
      expect(run.code, flags.join(' ')).toBe(exitCodes.refused);
      expect(run.err).toMatch(problem);
      expect(saved()).toBe(original);
    }
  });

  test('refuses a Party smaller than the Quest takes, naming its least, writing nothing (DL-257 item 6)', () => {
    const { world } = document();
    const roster = world.guilds[playerId]?.rosterIds ?? [];
    const questId = world.board.find((id) => world.quests[id]?.requirements.classKey === undefined && world.quests[id]?.requirements.skillKey === undefined);
    if (questId === undefined) throw new Error('Every Quest on the Board requires a Class or a Skill');
    const { partySizeMin } = (world.quests[questId] as Quest).requirements;
    expect(partySizeMin).toBeGreaterThanOrEqual(2);
    const original = saved();

    const run = play(['dispatch', '--quest', questId, '--heroes', roster.slice(0, 1).join(',')]);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(`(${questId}) needs a Party of at least ${partySizeMin} Heroes (1 named).`);
    expect(saved()).toBe(original);
  });

  // DL-50: the player's Guild is given three healing draughts and a whetstone by hand.
  describe('with --consumables', () => {
    beforeEach(() => {
      edit((edited) => {
        addStack(edited.world, 'healing-draught', 3, { kind: 'guild', id: playerId });
        addStack(edited.world, 'whetstone', 1, { kind: 'guild', id: playerId });
      });
    });

    test("carries them from the Guild's holding, saves what the engine saves, and says what the Party carries", () => {
      const before = document();
      const { questId, heroIds } = openQuest(before.world);
      const consumables = [
        { definitionKey: 'healing-draught', quantity: 2 },
        { definitionKey: 'whetstone', quantity: 1 },
      ];
      const expected = applyAction(
        before,
        { kind: 'dispatch', guildId: playerId, questId, heroIds, consumables },
        { config: { ...defaultConfig, ...before.meta.config }, content },
      );
      if (!expected.ok) throw new Error(`Rejected ${expected.rejection.reason}`);

      const run = play(['dispatch', '--quest', questId, '--heroes', heroIds.join(','), '--consumables', 'healing-draught:2,whetstone:1']);

      expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
      expect(saved()).toBe(serialise(expected.document));
      expect(run.out).toContain('Carrying: Healing draught ×2, Whetstone ×1.');
    });

    test('refuses what the Guild does not hold, too many, and what is no consumable, writing nothing', () => {
      const { questId, heroIds } = openQuest(document().world);
      const original = saved();

      const cases: [string, string][] = [
        ['lockpicks:1', 'The Test holds no Set of lockpicks to carry.'],
        ['healing-draught:4', 'The Test holds 3 of Healing draught, not the 4 asked.'],
        ['short-sword:1', 'Short sword is Gear, not a Consumable: a Party carries Consumables only.'],
        ['barrow-draught:1', 'No Item is called "barrow-draught".'],
      ];
      for (const [value, problem] of cases) {
        const run = play(['dispatch', '--quest', questId, '--heroes', heroIds.join(','), '--consumables', value]);
        expect(run.code, value).toBe(exitCodes.refused);
        expect(run.err).toContain(problem);
        expect(saved()).toBe(original);
      }
    });

    test('preview says what the Party would carry, what each does and on how many Encounters, or what the Guild holds, and writes nothing', () => {
      const { world } = document();
      const { questId, heroIds } = openQuest(world);
      const kinds = (world.quests[questId] as Quest).encounterKeys.map((key) => content.encounters[key]?.kind);
      const combat = kinds.filter((kind) => kind === 'combat').length;
      const original = saved();

      const carrying = play(['preview', '--quest', questId, '--heroes', heroIds.join(','), '--consumables', 'whetstone:1,healing-draught:2']);
      const bare = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);
      const tooMany = play(['preview', '--quest', questId, '--heroes', heroIds.join(','), '--consumables', 'healing-draught:4']);

      expect(carrying).toMatchObject({ code: exitCodes.ok, err: '' });
      expect(carrying.out).toContain(
        [
          'Consumables',
          `  Whetstone ×1, of 1 the Guild holds: +3 to a Check on combat Encounters, one a Check; ${combat} of this Quest's ${kinds.length}.`,
          '  Healing draught ×2, of 3 the Guild holds: an Injury taken on the Quest heals 5 Days sooner, one an Injury.',
        ].join('\n'),
      );
      expect(carrying.out).toContain('Dispatch would send this Party.');
      expect(bare.out).toContain(
        [
          'Consumables',
          '  None carried.',
          '  The Guild holds Healing draught ×3 (healing-draught), Whetstone ×1 (whetstone): name them with --consumables <key:n,...>.',
        ].join('\n'),
      );
      expect(tooMany.out).toContain('Dispatch would refuse it: The Test holds 3 of Healing draught, not the 4 asked.');
      expect(saved()).toBe(original);
    });
  });
});

describe("every date under the save's own calendar, not this release's (DL-210)", () => {
  // A Year of two Days, so that a date past the second Day is in another Year than this release's
  // 1,080-Turn year would give: each line read by the default calendar instead fails.
  const turnsPerYear = 6;
  const dateIn = (turn: number): string => `Year ${Math.floor(turn / turnsPerYear) + 1} Day ${Math.floor((turn % turnsPerYear) / 3) + 1}`;

  beforeEach(() => {
    newDemo();
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, turnsPerYear };
    });
  });

  test('show: a fold, a death, an Injury and the Board', () => {
    const rivalId = makeId('guilds', 2);
    const heroId = makeId('heroes', 1);
    const pooled = (Object.values(document().world.heroes).find((hero) => hero.unattachedSince !== null) as Hero).id;
    edit((edited) => {
      const rival = edited.world.guilds[rivalId] as Guild;
      for (const id of rival.rosterIds) Object.assign(edited.world.heroes[id] as Hero, { guildId: null, unattachedSince: 0 });
      rival.rosterIds = [];
      rival.foldedOnTurn = 13;
      Object.assign(edited.world.heroes[pooled] as Hero, { unattachedSince: null, diedOnTurn: 13 });
      (edited.world.heroes[heroId] as Hero).injury = { typeKey: 'sprained-ankle', healsOnTurn: nightOf(3) };
    });

    expect(rowOf(play(['show', 'guilds']).out, rivalId)).toMatch(/\s{2}on Year 3 Day 1$/);
    expect(play(['show', 'hero', pooled]).out).toMatch(/^Died\s+Year 3 Day 1 \(Turn 13\)$/m);
    expect(play(['show', 'hero', heroId]).out).toMatch(/healing on the night of Year 2 Day 2 \(Turn 11\)$/m);
    const board = play(['show', 'board']);
    for (const questId of document().world.board) {
      const { expiresOnTurn } = document().world.quests[questId] as Quest;
      expect(expiresOnTurn).toBeGreaterThanOrEqual(turnsPerYear);
      expect(rowOf(board.out, questId)).toMatch(new RegExp(`\\s${dateIn(expiresOnTurn)}$`));
    }
  });

  test('advance: the stop, the countdown, the events with their dates and the History', () => {
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, bankruptcyGraceDays: 10 };
      (edited.world.guilds[playerId] as Guild).wealth = -1;
    });
    // The engine's Day 10, the night the Bankruptcy falls on: Turn 32, in the sixth Year of two Days.
    const due = 'the night of Year 6 Day 1';

    const stopped = play(['advance', '--until', 'pool-refreshed']);

    expect(stopped.out.split('\n').slice(0, 3)).toEqual([
      'Played 2 Turns. Now Turn 2 (Year 1 Day 1, night).',
      `Stopped: The Test fell below the Bankruptcy floor: Bankruptcy on ${due} unless its Wealth recovers by then.`,
      `The Test has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on ${due} unless Wealth is back to 0 or ` +
        'more on a night by then, after any Upkeep due.',
    ]);
    expect(stopped.out).toContain(`fell below the Bankruptcy floor of 0: Bankruptcy on ${due} unless it is back to 0 or more on a night by then.`);

    const played = play(['advance', '--turns', '5']);

    expect(played.out).toContain('Played 5 Turns. Now Turn 7 (Year 2 Day 1, afternoon).');
    expect(played.out).toMatch(/^\s*6 {2}Year 2 Day 1, morning\s+\S/m);
    expect(play(['show', 'history']).out).toMatch(/^\s*6 {2}Year 2 Day 1, morning\s+\S/m);
  });

  test('the game ended: in advance, and in the refusal after it', () => {
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, bankruptcyGraceDays: 3 };
      (edited.world.guilds[playerId] as Guild).wealth = -1_000_000;
    });

    // Played Turn by Turn, as --turns plays, past every stop: the game ends within them.
    const ended = play(['advance', '--turns', '20']);

    // Three Days' grace from the engine's Day 0: the night of its Day 3, Turn 11, the second Day of the second Year.
    expect(ended.out).toContain('The game ended on Year 2 Day 2 (Turn 11): The Test went bankrupt.');
    expect(play(['advance']).err).toContain('The game ended on Year 2 Day 2 (Turn 11): The Test went bankrupt. No Turn follows.');
  });

  test("dispatch: the Party's return", () => {
    const { questId, heroIds } = openQuest(document().world);

    const run = play(['dispatch', '--quest', questId, '--heroes', heroIds.join(',')]);

    const party = Object.values(document().world.parties)[0];
    if (party === undefined) throw new Error(`No Party: ${run.err}`);
    expect(party.returnsOnTurn).toBeGreaterThanOrEqual(turnsPerYear);
    expect(run.out).toContain(`it returns on the night of ${dateIn(party.returnsOnTurn)} (Turn ${party.returnsOnTurn}).`);
  });
});

describe('rebase', () => {
  const adopted = (): number => count(document().history, 'world.rules-adopted');

  test('refuses a save already under the current rules, writing nothing', () => {
    newDemo();
    const original = saved();

    const run = play(['rebase']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(`already plays under this release's rules, configVersion ${configVersion}`);
    expect(saved()).toBe(original);
  });

  test("a save made under older rules plays under them until rebase adopts this release's, once", () => {
    newDemo();
    // A save from a release whose rules were one version older, with a year of three Turns.
    edit((edited) => {
      edited.meta.configVersion = configVersion - 1;
      edited.meta.config.turnsPerYear = 3;
    });

    expect(play(['advance', '--turns', '3']).out).toContain('Now Turn 3 (Year 2 Day 1, morning).');
    expect(document().meta.config.turnsPerYear).toBe(3);

    const run = play(['rebase']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`configVersion ${configVersion - 1} to ${configVersion}`);
    expect(document().meta.config).toEqual(defaultConfig);
    expect(document().meta.configVersion).toBe(configVersion);
    expect(adopted()).toBe(1);
    expect(play(['show']).out).toContain('Turn 3 (Year 1 Day 2, morning)');
    expect(play(['show', 'history']).out).toMatch(/^\s*3 {2}Year 1 Day 2, morning\s+world\.rules-adopted\s+Yes/m);

    expect(play(['rebase']).code).toBe(exitCodes.refused);
    expect(adopted()).toBe(1);
  });
});

describe('save and load', () => {
  test('save --as copies the save and load brings it back, byte for byte', () => {
    newDemo();
    const original = saved();

    const copied = play(['save', '--as', 'backup']);
    expect(copied.code).toBe(exitCodes.ok);
    expect(saved(join(dir(), '.saves', 'backup.json'))).toBe(original);

    play(['new', '--seed', 'another', '--guild', 'G', '--master', 'M', '--force']);
    expect(saved()).not.toBe(original);

    const loaded = play(['load', 'backup']);
    expect(loaded.code).toBe(exitCodes.ok);
    expect(loaded.out).toContain('Seed demo');
    expect(saved()).toBe(original);
  });

  test('save --as and load take paths as well as names', () => {
    newDemo();
    const original = saved();

    expect(play(['save', '--as', 'copies/one.json']).code).toBe(exitCodes.ok);
    expect(saved(join(dir(), 'copies', 'one.json'))).toBe(original);
    expect(play(['load', 'copies/one.json', '--save', 'two']).code).toBe(exitCodes.ok);
    expect(saved(join(dir(), '.saves', 'two.json'))).toBe(original);
  });

  test.each([
    ['a corrupted file', (text: string) => text.slice(0, text.length / 2), 'not JSON'],
    [
      'a file from a newer schema',
      (text: string) => fromTheFuture(text),
      `version 999 and this engine reads version ${schemaVersion}`,
    ],
    [
      'a file the validator refuses',
      (text: string) => text.replace('"rosterIds":["hero-000001"', '"rosterIds":["hero-000999"'),
      'dangling-reference',
    ],
  ])('a refused load of %s prints the reason, exits non-zero and changes nothing', (_what, spoil, reason) => {
    newDemo();
    const original = saved();
    const bad = join(dir(), 'bad.json');
    const spoilt = spoil(original);
    expect(spoilt).not.toBe(original);
    writeFileSync(bad, spoilt);

    const run = play(['load', bad]);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('Cannot load');
    expect(run.err).toContain(reason);
    expect(run.out).toBe('');
    expect(saved()).toBe(original);
  });

  test('a save whose config breaks a rule is refused at load, naming the setting, and left as it was (DL-193)', () => {
    newDemo();
    edit((edited) => {
      edited.meta.config.boardSizeStart = -2;
    });
    const original = saved();

    for (const argv of [['show'], ['advance'], ['load', current()]]) {
      const run = play(argv);
      expect(run.code, argv.join(' ')).toBe(exitCodes.refused);
      expect(run.err).toBe(`Cannot load ${current()}: The game's config is unsound: boardSizeStart is -2; it is a whole number, at least 0.
`);
    }
    expect(saved()).toBe(original);
  });

  test('load refuses a file that is not there, and save --as a save that is not there', () => {
    expect(play(['load', 'nothing']).code).toBe(exitCodes.refused);
    const run = play(['save', '--as', 'backup']);
    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('`new`');
    expect(existsSync(join(dir(), '.saves', 'backup.json'))).toBe(false);
  });
});

describe('--modules: the test-only probe on new, advance and load', () => {
  /** A seed on which the probe fires on the eleventh Turn, the night of Year 1 Day 4: its stream's first draw below 0.02. */
  const firingSeed = 'modules';
  const withProbe = { config: defaultConfig, content, modules: [probe] };

  function newWithProbe(...more: string[]): Run {
    return play(['new', '--seed', firingSeed, '--guild', 'The Test', '--master', 'Ada', '--modules', 'probe', ...more]);
  }

  test('new installs no module unless given one: no slice and no stream of a module', () => {
    newDemo();

    expect(document().world.modules).toEqual({});
    expect(Object.keys(document().world.rng)).not.toContain('probe');
  });

  test('new --modules probe makes the world the engine makes with the probe installed', () => {
    const run = newWithProbe();
    const expected = createWorld(firingSeed, { guildmasterName: 'Ada', guildName: 'The Test', createdAt: clock.toISOString() }, withProbe);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected.document));
    expect(Object.keys(expected.document.world.modules)).toEqual(['probe']);
  });

  test("a probe.fired event is in advance's log on a seed known to fire one, with its effects' events after it", () => {
    newWithProbe();
    // The same Turns played by the engine itself, with the probe installed.
    let expected = document();
    const events: TurnEvent[] = [];
    for (let turn = 0; turn < 11; turn += 1) {
      const result = advance(expected, withProbe);
      expected = result.document;
      events.push(...result.events);
    }
    const fired = events.filter(isModuleEvent).find((event) => String(event.type) === 'probe.fired');
    if (fired === undefined) throw new Error(`The probe did not fire on seed ${firingSeed}`);

    const run = play(['advance', '--turns', '11', '--modules', 'probe']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected));
    expect(fired.turn).toBe(11);
    const line = narrateLine(fired, content, expected.meta.config);
    expect(line).toMatch(/^The probe Module recorded probe\.fired for .+ \(hero-\d{6}\), .+\.$/);
    const lines = run.out.split('\n');
    const at = lines.findIndex((text) => text.endsWith(line));
    expect(at).toBeGreaterThan(-1);
    expect(lines[at]).toMatch(/^\s*11 {2}/);
    // Its effects' events follow it, in the CLI's own words for the core's events.
    expect(lines[at + 1]).toMatch(/'s Morale went from \d+ to \d+, \w+\.$/);
    expect(lines[at + 2]).toMatch(/'s Wealth went from \d+ to \d+\.$/);
    expect(document().history.byType['probe.fired']).toHaveLength(1);
  });

  test('advance --turns stops early when the probe asks to stop, and says so (DL-77 item 6)', () => {
    newWithProbe();
    // The probe asks for a stop every `probeStopEveryDays` Days, a tunable of its slice that a game
    // keeps (its default is 30): three, so that the first stop is the afternoon of Day 4.
    const everyDays = 3;
    edit((edited) => void Object.assign(edited.world.modules['probe'] ?? {}, { probeStopEveryDays: everyDays }));
    // The engine's own Turns with the probe installed, to its first stop.
    let expected = document();
    let stoppedBecause = null;
    while (stoppedBecause === null) {
      const result = advance(expected, withProbe);
      expected = result.document;
      stoppedBecause = result.stoppedBecause;
    }
    const turn = expected.world.turn;

    const run = play(['advance', '--turns', '20', '--modules', 'probe']);

    expect(stoppedBecause).toEqual({ kind: 'module', moduleId: 'probe' });
    expect(dayOf(turn)).toBe(everyDays);
    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(saved()).toBe(serialise(expected));
    expect(run.out).toContain(`Played ${turn} Turns. Now Turn ${turn} (Year 1 Day ${everyDays + 1}, afternoon).`);
    expect(run.out).toContain('Stopped: the probe Module asked to stop.');
  });

  test('advance --until with --modules plays the probe too', () => {
    newWithProbe();
    const expected = fastForward(document(), { guildId: playerId, until: [], maxTurns: 11 }, withProbe);

    const run = play(['advance', '--max', '11', '--modules', 'probe']);

    expect(run.code).toBe(exitCodes.ok);
    expect(saved()).toBe(serialise(expected.document));
  });

  test("advance without --modules warns of the probe's slice, keeps it as it was, and plays on without the probe", () => {
    newWithProbe();
    const before = document();

    const run = play(['advance', '--turns', '11']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.err).toBe('Warning: No installed module owns the slice "probe": it is kept and never read\n');
    expect(run.out).not.toContain('probe.fired');
    expect(document().world.modules).toEqual(before.world.modules);
    const probeStream = (of: WorldDocument): unknown => (of.world.rng as Record<string, unknown>)['probe'];
    expect(probeStream(before)).toBeDefined();
    expect(probeStream(document())).toEqual(probeStream(before));
  });

  test('load --modules probe takes a save with the probe slice without a warning; without it, with one', () => {
    newWithProbe();
    play(['save', '--as', 'backup']);

    const installed = play(['load', 'backup', '--modules', 'probe']);
    const not = play(['load', 'backup']);

    expect(installed).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(not.code).toBe(exitCodes.ok);
    expect(not.err).toContain('No installed module owns the slice "probe"');
  });

  test('load --modules probe refuses a save whose probe slice the probe refuses, naming the module', () => {
    newWithProbe();
    const bad = join(dir(), 'bad.json');
    const spoilt = saved().replace('"morning":0', '"morning":-1');
    expect(spoilt).not.toBe(saved());
    writeFileSync(bad, spoilt);

    const run = play(['load', bad, '--modules', 'probe']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('The probe module refuses its slice');
  });
});

describe('show guildmaster, show patrons and preview', () => {
  beforeEach(() => {
    newDemo();
  });

  const bandWords = ['Hostile', 'Cool', 'Neutral', 'Warm', 'Close'];

  /** The rows of the section of `output` headed `heading`, up to the blank line after its table. */
  function section(output: string, heading: string): string[] {
    const lines = output.split('\n');
    const start = lines.indexOf(heading);
    if (start === -1) throw new Error(`No section ${heading} in:\n${output}`);
    const end = lines.indexOf('', start);
    return lines.slice(start + 3, end === -1 ? undefined : end);
  }

  test("show guildmaster prints the player's Guildmaster's Stats, Traits and Regard, the Regard as bands and never as numbers", () => {
    const { world } = document();
    const guild = world.guilds[playerId] as Guild;
    const guildmasterId = guild.guildmasterId;
    const [patronId] = Object.keys(world.patrons) as EntityId[];
    const [heroId] = guild.rosterIds;
    const rival = world.guilds[makeId('guilds', 2)] as Guild;
    const traitKeys = ['old-soldier', 'thrifty'];
    edit((edited) => {
      const guildmaster = edited.world.guildmasters[guildmasterId];
      if (guildmaster === undefined) throw new Error('No Guildmaster');
      guildmaster.traits = [...traitKeys];
      guildmaster.regard[patronId as EntityId] = { value: 13.25, since: 0, reason: 'quest.resolved' };
      guildmaster.regard[heroId as EntityId] = { value: -7.5, since: 0, reason: 'quest.resolved' };
      // A Transfer writes Regard between Guildmasters; the view reads it for a Guild through its Guildmaster.
      guildmaster.regard[rival.guildmasterId] = { value: 5, since: 0, reason: 'test' };
    });

    const run = play(['show', 'guildmaster']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const master = world.guildmasters[guildmasterId];
    expect(run.out).toContain(`${master?.name} (${guildmasterId}), Guildmaster of The Test (${playerId})`);
    for (const stat of Object.values(content.stats).filter((row) => row.owner === 'guildmaster')) {
      expect(run.out).toMatch(new RegExp(`^${stat.name}\\s+${master?.stats[stat.key]}\\s`, 'm'));
    }
    // The Guildmaster's Traits, each with its effects in the words the page and the CLI share.
    const rows = run.out.split('\n').map((line) => line.replace(/\s+/g, ' '));
    for (const key of traitKeys) {
      const trait = content.guildmasterTraits[key];
      expect(rows).toContain(`${trait?.name} ${traitEffectWords(trait?.effects ?? [], content)}`);
    }

    const patrons = section(run.out, 'Regard for Patrons');
    const heroes = section(run.out, 'Regard for Heroes on the Roster');
    const guilds = section(run.out, 'Regard for the other Guilds, through their Guildmasters');
    expect(patrons).toHaveLength(Object.keys(world.patrons).length);
    expect(heroes).toHaveLength(guild.rosterIds.length);
    expect(rowOf(run.out, patronId as string)).toMatch(/\sClose$/);
    expect(rowOf(run.out, heroId as string)).toMatch(/\sCool$/);
    expect(rowOf(run.out, rival.id)).toMatch(/\sWarm$/);
    for (const row of [...patrons, ...heroes, ...guilds]) {
      expect(bandWords, row).toContain(row.trim().split(/\s+/).at(-1));
      // Beyond the row's id, not a digit: Regard is shown as its band only.
      expect(row.replace(/^\S+/, ''), row).not.toMatch(/\d/);
    }
    for (const number of ['13.25', '13', '7.5', '-7.5']) expect(run.out).not.toContain(` ${number}\n`);
  });

  test('show guildmaster prints the descriptive Attributes written, after the sex and age, and none left empty', () => {
    const guildmasterId = (document().world.guilds[playerId] as Guild).guildmasterId;
    // Every Guildmaster's are written as they enter play (DL-125 item 6): an older save may hold one empty.
    edit((edited) => {
      Object.assign(edited.world.guildmasters[guildmasterId] ?? {}, {
        birthplace: 'Harrowgate',
        appearance: '',
        biography: 'Once a quartermaster of the river levies.',
      });
    });

    const mine = play(['show', 'guildmaster']).out.split('\n');
    const theirs = play(['show', 'guildmaster', makeId('guilds', 2)]).out;

    const age = mine.findIndex((line) => line.startsWith('Age'));
    expect(mine[age + 1]).toMatch(/^Birthplace\s+Harrowgate$/);
    expect(mine[age + 2]).toMatch(/^Biography\s+Once a quartermaster of the river levies\.$/);
    expect(mine.some((line) => line.startsWith('Appearance'))).toBe(false);
    // A Rival's Guildmaster is described as they enter play.
    for (const label of ['Birthplace', 'Appearance', 'Biography']) expect(theirs).toMatch(new RegExp(`^${label}\\s+\\S`, 'm'));
  });

  test("show guildmaster names the Portrait's key after the sex, or the Silhouette where there is none", () => {
    const guildmasterId = (document().world.guilds[playerId] as Guild).guildmasterId;
    const lines = (run: Run) => run.out.split('\n');

    // Chosen to fit them from the core's pictures of the sex (DL-141), or the Silhouette where none
    // fits their age: the key the engine gives a Guildmaster under the same setup.
    const bare = lines(play(['show', 'guildmaster']));
    const made = createWorld('demo', { guildName: 'The Test', guildmasterName: 'Ada', createdAt: clock.toISOString() }, { config: defaultConfig, content }).document.world;
    const held = document().world.guildmasters[guildmasterId]?.portraitKey;
    expect(held).toBe(made.guildmasters[(made.guilds[playerId] as Guild).guildmasterId]?.portraitKey);
    expect(bare[bare.findIndex((line) => line.startsWith('Sex')) + 1]).toMatch(new RegExp(`^Portrait\\s+${held ?? 'None: the Silhouette'}$`));

    edit((edited) => Object.assign(edited.world.guildmasters[guildmasterId] ?? {}, { portraitKey: null }));
    expect(play(['show', 'guildmaster']).out).toMatch(/^Portrait\s+None: the Silhouette$/m);

    // A key the core lacks still shows, with the load's warning (data-model rule 5).
    edit((edited) => Object.assign(edited.world.guildmasters[guildmasterId] ?? {}, { portraitKey: 'gm-male-99' }));
    const run = play(['show', 'guildmaster']);
    expect(run.out).toMatch(/^Portrait\s+gm-male-99$/m);
    expect(run.err).toContain('Warning:');
  });

  test("show guildmaster <guildId> prints another Guild's Guildmaster, and refuses a Guild the save lacks", () => {
    const rivalId = makeId('guilds', 2);
    const { world } = document();
    const rival = world.guilds[rivalId] as Guild;

    const run = play(['show', 'guildmaster', rivalId]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`Guildmaster of ${rival.name} (${rivalId})`);
    expect(rowOf(run.out, playerId)).toMatch(/\sNeutral$/);
    expect(play(['show', 'guildmaster', makeId('guilds', 99)]).code).toBe(exitCodes.refused);
  });

  test("show patrons prints each Patron's Regard for the player's Guild as a band", () => {
    const { world } = document();
    const [first, second] = Object.keys(world.patrons) as EntityId[];
    edit((edited) => {
      const patron = edited.world.patrons[first as keyof typeof edited.world.patrons];
      if (patron === undefined) throw new Error('No Patron');
      patron.regard[playerId] = { value: -13, since: 0, reason: 'quest.resolved' };
    });

    const run = play(['show', 'patrons']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/Regard for us/);
    expect(rowOf(run.out, first as string)).toMatch(/\sHostile$/);
    expect(rowOf(run.out, second as string)).toMatch(/\sNeutral$/);
    expect(run.out).not.toContain('-13');
  });

  test('preview says which requirement a proposed Party misses, naming the Class, and writes nothing', () => {
    const { world } = document();
    const [questId] = world.board as QuestId[];
    const roster = world.guilds[playerId]?.rosterIds ?? [];
    const heroes = roster.map((id) => world.heroes[id] as Hero);
    const healer = heroes.find((hero) => hero.classKey === 'healer');
    const others = heroes.filter((hero) => hero.classKey !== 'healer').slice(0, 2);
    if (questId === undefined || healer === undefined || others.length < 2) throw new Error('The demo world has changed');
    edit((edited) => {
      (edited.world.quests[questId] as Quest).requirements = { partySizeMin: 2, classKey: 'healer' };
    });
    const original = saved();

    const without = play(['preview', '--quest', questId, '--heroes', others.map((hero) => hero.id).join(',')]);

    expect(without).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(without.out).toMatch(/^ {2}A Party of at least 2: met \(2 named\)$/m);
    expect(without.out).toMatch(/^ {2}A Healer: missed$/m);
    expect(without.out).toContain('Dispatch would refuse it: it needs a Healer in the Party.');
    expect(saved()).toBe(original);

    const withHealer = play(['preview', '--quest', questId, '--heroes', [others[0]?.id, healer.id].join(',')]);

    expect(withHealer.code).toBe(exitCodes.ok);
    expect(withHealer.out).toMatch(/^ {2}A Healer: met$/m);
    expect(withHealer.out).toMatch(/^Reward agreed on a success: \d+ Wealth, \d+ offered\.$/m);
    expect(withHealer.out).toContain('Dispatch would send this Party.');
    expect(saved()).toBe(original);
  });

  // DL-269: the Quest's narrative, its Beats' lines in the order it plays them, before its requirements, as the page's Party builder gives it.
  test("preview gives the Quest's Beats' lines in order, under its heading and before the requirements", () => {
    const { world } = document();
    const [questId] = world.board as QuestId[];
    const heroIds = (world.guilds[playerId]?.rosterIds ?? []).slice(0, 2);
    if (questId === undefined) throw new Error('The demo world has changed');
    edit((edited) => {
      Object.assign(edited.world.quests[questId] as Quest, {
        encounterKeys: ['past-the-watch', 'ambush-on-the-road', 'the-long-march'],
        beatLines: ['Past the gate unseen.', 'Steel on the road.', 'The long way home.'],
      });
    });

    const run = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run.code).toBe(exitCodes.ok);
    const lines = run.out.split('\n');
    expect(lines.slice(2, 8)).toEqual(['', 'Beats', '  Past the gate unseen.', '  Steel on the road.', '  The long way home.', '']);
    expect(lines[8]).toBe('Requirements');
  });

  // DL-148 item 15: each Encounter's chance and the Quest's in a word, with the estimate's percentage floored to 5.
  test('preview gives the chance of each Encounter and of the Quest, a word and the estimate floored to a multiple of 5%, if no one falls', () => {
    const { world } = document();
    const [questId] = world.board as QuestId[];
    const heroIds = (world.guilds[playerId]?.rosterIds ?? []).slice(0, 2);
    const quest = world.quests[questId as QuestId] as Quest;
    const estimate = estimateQuest(world, quest, heroIds.map((id) => world.heroes[id] as Hero), { config: defaultConfig, content });
    if (estimate === null) throw new Error('No estimate');

    const run = play(['preview', '--quest', quest.id, '--heroes', heroIds.join(',')]);

    expect(run.code).toBe(exitCodes.ok);
    const lines = run.out.split('\n');
    const at = lines.indexOf('Chances, if no one falls');
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at + 1, at + 2 + estimate.encounters.length)).toEqual([
      ...estimate.encounters.map((it) => `  ${content.encounters[it.encounterKey]?.name}: ${chanceWords[it.chance]}, ${shownPercent(it.success)}%`),
      `  The Quest: ${chanceWords[estimate.chance]}, ${shownPercent(estimate.success)}%`,
    ]);
  });

  test('preview names a Hero who cannot go, and refuses a Quest not on the Board', () => {
    const { world } = document();
    const [questId] = world.board as QuestId[];
    const [first, second] = world.guilds[playerId]?.rosterIds ?? [];
    if (questId === undefined || first === undefined || second === undefined) throw new Error('The demo world has changed');
    edit((edited) => {
      (edited.world.heroes[first] as Hero).injury = { typeKey: 'deep-cut', healsOnTurn: 30 };
    });

    const run = play(['preview', '--quest', questId, '--heroes', `${first},${second}`]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(new RegExp(`\\(${first}\\) is injured and cannot go\\.`));
    expect(run.out).toMatch(/Dispatch would refuse it: .* is injured and cannot go\./);
    expect(play(['preview', '--quest', makeId('quests', 999), '--heroes', first]).code).toBe(exitCodes.refused);
  });

  // A refusal is worded once, in the refusals' table (DL-240): preview says it as dispatch does.
  test("preview refuses a Quest off the Board, and a save with no player's Guild, in dispatch's words", () => {
    const { world } = document();
    const [questId] = world.board as QuestId[];
    const [heroId] = world.guilds[playerId]?.rosterIds ?? [];
    if (questId === undefined || heroId === undefined) throw new Error('The demo world has changed');
    edit((edited) => {
      edited.world.board = edited.world.board.filter((id) => id !== questId);
    });
    const argv = ['--quest', questId, '--heroes', heroId];

    const preview = play(['preview', ...argv]);

    expect(preview).toMatchObject({ code: exitCodes.refused, err: play(['dispatch', ...argv]).err });
    expect(preview.err).toMatch(new RegExp(`\\(${questId}\\) is not on the Board`));

    edit((edited) => {
      (edited.world.guilds[playerId] as Guild).controller = { kind: 'rival', disposition: 'steady' };
    });
    expect(play(['preview', ...argv])).toMatchObject({ code: exitCodes.refused, err: play(['dispatch', ...argv]).err });
  });

  test("dispatch prints the reward agreed, the player's Guildmaster's Negotiation applied", () => {
    const { world } = document();
    const { questId, heroIds } = openQuest(world);
    const quest = world.quests[questId] as Quest;

    const run = play(['dispatch', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run.code).toBe(exitCodes.ok);
    const agreed = document().world.quests[questId]?.reward;
    expect(run.out).toContain(`Reward agreed: ${agreed} Wealth on a success, ${quest.reward} offered.`);
  });
});

// The epic's `show party` is `preview --quest --heroes` (DL-43, DL-45).
describe('preview lists the Synergies a proposed Party would have', () => {
  beforeEach(() => {
    newDemo();
  });

  /** The Board's first Quest, drawn with `encounterKeys`, and the first `classKeys.length` of the Roster made those Classes, with no Skill. */
  function proposed(encounterKeys: string[], ...classKeys: string[]): { questId: QuestId; heroIds: HeroId[] } {
    const { world } = document();
    const questId = (world.board as QuestId[])[0];
    const heroIds = (world.guilds[playerId]?.rosterIds ?? []).slice(0, classKeys.length);
    if (questId === undefined || heroIds.length < classKeys.length) throw new Error('The demo world has changed');
    edit((edited) => {
      const quest = edited.world.quests[questId] as Quest;
      quest.encounterKeys = encounterKeys;
      // A line for each, as the validator holds a Quest's Beats' lines to its Encounters (DL-262).
      quest.beatLines = encounterKeys.map(() => 'A Beat.');
      quest.requirements = { partySizeMin: 1 };
      heroIds.forEach((id, index) => {
        const hero = edited.world.heroes[id] as Hero;
        hero.classKey = classKeys[index] ?? 'warrior';
        hero.skills = {};
      });
    });
    return { questId, heroIds };
  }

  /** The lines of `output`'s Synergies section, up to the blank line after it. */
  function synergies(output: string): string[] {
    const lines = output.split('\n');
    const start = lines.indexOf('Synergies');
    if (start === -1) throw new Error(`No Synergies section in:\n${output}`);
    const end = lines.indexOf('', start);
    return lines.slice(start + 1, end === -1 ? undefined : end);
  }

  test("names each Synergy, its bonus, its kinds and how many of the Quest's Encounters it adds to, and writes nothing", () => {
    const { questId, heroIds } = proposed(['ambush-on-the-road', 'a-hostile-reeve', 'the-long-march'], 'warrior', 'healer', 'rogue', 'mage');
    const original = saved();

    const run = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(synergies(run.out)).toEqual([
      '  A full company: +1 and ×1.05 on every Encounter; 3 of this Quest\'s 3.',
      '  Shadow and spell: ×1.1 on stealth and arcane Encounters; 0 of this Quest\'s 3.',
      '  Sword and salve: +2 on combat and travel Encounters; 2 of this Quest\'s 3.',
    ]);
    expect(run.out).toContain('Dispatch would send this Party.');
    expect(saved()).toBe(original);
  });

  test('says when a Party meets none, one member short of one', () => {
    const { questId, heroIds } = proposed(['ambush-on-the-road', 'hold-the-line'], 'warrior', 'warrior', 'rogue');

    const run = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run.code).toBe(exitCodes.ok);
    expect(synergies(run.out)).toEqual(['  None: this Party meets no Synergy.']);
  });

  // Data-model rule 5: a Quest whose Encounters content no longer defines draws them when it
  // resolves (DL-42, DL-248), so neither what a Synergy reaches nor the chances are known.
  test('says a Quest whose Encounters content no longer defines has them drawn on the way, its chances not known', () => {
    const { questId, heroIds } = proposed(['no-such-encounter'], 'warrior', 'warrior', 'warrior');

    const run = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);

    expect(run.code).toBe(exitCodes.ok);
    expect(synergies(run.out)).toEqual(["  Shield wall: ×1.15 on combat Encounters; this Quest's Encounters are drawn on the way."]);
    expect(run.out).toContain("Chances\n  Not known: this Quest's Encounters are drawn on the way.\n");
  });

  // DL-148 item 12: one line for the Party's Morale, from its mean form, naming no Hero.
  test.each([
    [[defaultConfig.moraleBaseline, defaultConfig.moraleBaseline], 'Makes no difference'],
    [[80, 60], 'Raises the odds'],
    [[30, 30], 'Lowers the odds a little'],
    [[0, 10], 'Lowers the odds badly'],
  ])('with Morale %j, says once for the Party: %s', (morales, words) => {
    const { questId, heroIds } = proposed(['ambush-on-the-road'], 'warrior', 'rogue');
    edit((edited) => heroIds.forEach((id, index) => ((edited.world.heroes[id] as Hero).morale = morales[index] ?? 60)));

    const run = play(['preview', '--quest', questId, '--heroes', heroIds.join(',')]);

    const lines = run.out.split('\n');
    const start = lines.indexOf('Morale');
    expect(lines.slice(start, start + 3)).toEqual(['Morale', `  ${words}.`, '']);
    const names = heroIds.map((id) => document().world.heroes[id]?.name ?? id);
    for (const name of names) expect(lines[start + 1]).not.toContain(name);
  });
});

describe('the command line', () => {
  test('show refuses when there is no save', () => {
    const run = play(['show']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('There is no save');
  });

  test("reports the file system's refusal rather than crashing", () => {
    mkdirSync(current(), { recursive: true });

    const run = play(['show']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('EISDIR');
  });

  // `args.test.ts` holds what each bad command line is refused for; this is the wiring: the usage
  // goes to stderr and the exit is a usage error.
  test('a command line args refuses prints the usage and exits non-zero', () => {
    const run = play(['play']);

    expect(run.code).toBe(exitCodes.usage);
    expect(run.err).toContain('Usage: heroesim <command> [flags]');
    expect(run.out).toBe('');
  });

  test('help prints the usage', () => {
    const run = play(['help']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain('Usage: heroesim <command> [flags]');
    // Each section preview prints is named in its help, the Synergies, the consumables and the chances among them.
    const preview = run.out.slice(run.out.indexOf('  preview '), run.out.indexOf('  dispatch '));
    for (const part of ['requirement', 'cannot go', 'Synergies', 'Morale', 'chances', 'consumables', 'reward', 'dispatch would send']) expect(preview).toContain(part);
  });

  test("help gives new's ages as the rules do, and the age a Guildmaster retires at (DL-113 item 4)", () => {
    const { out } = play(['help']);
    const newHelp = out.slice(out.indexOf('  new '), out.indexOf('  show ')).replace(/\s+/g, ' ');
    const { guildmasterStartingAgeMin, guildmasterStartingAgeMax, guildmasterRetirementAge } = defaultConfig;

    expect(newHelp).toContain(`their age, ${guildmasterStartingAgeMin} to ${guildmasterStartingAgeMax} (a Guildmaster retires at ${guildmasterRetirementAge});`);
  });

  test("help gives new's --stats: every Guildmaster Stat or none, by key, within the rules' range and points", () => {
    const { out } = play(['help']);
    const newHelp = out.slice(out.indexOf('  new '), out.indexOf('  show ')).replace(/\s+/g, ' ');

    expect(newHelp).toContain('[--stats <stat=n,stat=n,...>]');
    const { guildmasterStatMin, guildmasterStatMax, guildmasterStatPoints } = defaultConfig;
    expect(newHelp).toContain(
      `--stats sets every Guildmaster Stat or none, by key, as inspiration=12,influence=8,...: each ${guildmasterStatMin} to ${guildmasterStatMax}, sharing ${guildmasterStatPoints} Stat points in all, and any left over are lost.`,
    );
    for (const key of ['inspiration', 'influence', 'negotiation', 'coaching', 'judgement']) expect(newHelp).toContain(key);
    // The rest of the help keeps "drawn from the seed" (DL-149 item 7).
    expect(newHelp).toContain('whatever is left out is drawn from the seed');
  });
});
