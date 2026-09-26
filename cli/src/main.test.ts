// End to end: `main` run in-process, as `npm run play -- …` runs it, against real save files in
// a temporary directory, with the real content set, a fixed clock and a scripted random source.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advance,
  ageOf,
  count,
  createWorld,
  dayOf,
  defaultConfig,
  deserialise,
  dispatch,
  fastForward,
  makeId,
  nightOf,
  potentialHint,
  potentialHints,
  serialise,
  upkeep,
  type EntityId,
  type Guild,
  type Hero,
  type HeroId,
  type Quest,
  type QuestId,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, main } from './main.js';

const content = loadContent();
const clock = new Date('2026-09-26T09:30:00.000Z');
const playerId = makeId('guilds', 1);

let dir: string;
let draws: number[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-cli-'));
  draws = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  code: number;
  out: string;
  err: string;
}

function play(argv: string[], env: Record<string, string> = {}): Run {
  let out = '';
  let err = '';
  const code = main(argv, {
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
    cwd: dir,
    env,
    now: () => clock,
    random: () => draws.shift() ?? 0,
  });
  return { code, out, err };
}

const current = (): string => join(dir, '.saves', 'current.json');
const saved = (path = current()): string => readFileSync(path, 'utf8');

function document(path = current()): WorldDocument {
  const loaded = deserialise(saved(path), { config: defaultConfig, content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

/** Rewrites the save at `path` after `change`, bypassing the CLI, as a hand edit would. */
function edit(change: (document: WorldDocument) => void, path = current()): void {
  const edited = document(path);
  change(edited);
  writeFileSync(path, serialise(edited));
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

/** The line of `output` that starts with `id`: a row of a table keyed by id. */
function rowOf(output: string, id: string): string {
  const row = output.split('\n').find((line) => line.startsWith(id));
  if (row === undefined) throw new Error(`No row for ${id} in:\n${output}`);
  return row;
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
      expect(run.err).toContain('old-charter (Old charter)');
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

  test('writes to the save --save names, in HEROESIM_SAVE_DIR when it is set', () => {
    expect(newDemo('--save', 'demo').code).toBe(exitCodes.ok);
    expect(existsSync(join(dir, '.saves', 'demo.json'))).toBe(true);

    const run = play(['new', '--guild', 'G', '--master', 'M'], { HEROESIM_SAVE_DIR: 'elsewhere' });
    expect(run.code).toBe(exitCodes.ok);
    expect(existsSync(join(dir, 'elsewhere', 'current.json'))).toBe(true);
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
      const due = upkeep(guild, world, defaultConfig);
      expect(row).toMatch(new RegExp(`\\b${guild.rosterIds.length}\\s+${guild.wealth}\\s+${guild.fame}\\s+${due}$`));
    }
    expect(rowOf(run.out, playerId)).toContain('Player');
  });

  test('guilds marks a folded Guild with the Day it folded, and show lists only the Guilds in play (DL-28, DL-33)', () => {
    const rivalId = makeId('guilds', 2);
    // Folded as M2-S10's fold leaves a Guild: its Heroes released to the pool, its Roster empty.
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
    expect(rowOf(guilds.out, rivalId)).toMatch(/\s{2}on Day 0$/);
    expect(rowOf(guilds.out, playerId)).not.toContain('on Day');
    expect(guilds.out.split('\n')[2]).toMatch(/\s{2}Folded$/);
    expect(summary.out.split('\n').some((line) => line.startsWith(rivalId))).toBe(false);
    expect(rowOf(summary.out, playerId)).toContain('The Test');
    expect(summary.out).toContain(`${defaultConfig.rivalCount} Guilds in play and 1 folded (show guilds lists them)`);
  });

  test("roster prints the player's Roster, with ages from the engine and names from content", () => {
    const { world } = document();
    const guild = world.guilds[playerId];

    const run = play(['show', 'roster']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`Roster of The Test (${playerId})`);
    expect(guild?.rosterIds).toHaveLength(defaultConfig.startingRosterSize);
    for (const id of guild?.rosterIds ?? []) {
      const hero = world.heroes[id] as Hero;
      const row = rowOf(run.out, id);
      expect(row).toContain(hero.name);
      expect(row).toContain(content.classes[hero.classKey]?.name);
      expect(row).toContain(content.backgrounds[hero.backgroundKey]?.name);
      expect(row).toMatch(new RegExp(`\\s${hero.level}\\s+${ageOf(hero, world.turn, defaultConfig)}\\s+${hero.morale}\\s`));
    }
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

  test('pool prints every Unattached Hero and no Hero on a Roster', () => {
    const heroes = Object.values(document().world.heroes);

    const run = play(['show', 'pool']);

    expect(run.code).toBe(exitCodes.ok);
    const pool = heroes.filter((hero) => hero.guildId === null);
    expect(pool).toHaveLength(defaultConfig.unattachedPoolSize);
    for (const hero of pool) expect(rowOf(run.out, hero.id)).toContain(hero.name);
    for (const hero of heroes.filter((one) => one.guildId !== null)) expect(run.out).not.toContain(hero.id);
  });

  test('patrons prints each Patron with the name of their Sphere', () => {
    const patrons = Object.values(document().world.patrons);

    const run = play(['show', 'patrons']);

    expect(run.code).toBe(exitCodes.ok);
    expect(patrons).toHaveLength(defaultConfig.patronCount);
    for (const patron of patrons) {
      const row = rowOf(run.out, patron.id);
      expect(row).toContain(patron.name);
      expect(row).toContain(content.spheres[patron.sphereKey]?.name);
    }
  });

  test("board prints the Quests on offer in the Board's order, each with its template, Patron and terms (M2-S3)", () => {
    const { world } = document();
    expect(world.board).toHaveLength(defaultConfig.boardSize);

    const run = play(['show', 'board']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`Board: ${defaultConfig.boardSize} Quests on offer, Turn 0 (Day 0, morning, Year 0)`);
    const lines = run.out.split('\n');
    const positions = world.board.map((id) => lines.findIndex((line) => line.startsWith(id)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const id of world.board) {
      const quest = world.quests[id];
      if (quest === undefined) throw new Error(`No Quest ${id}`);
      const row = rowOf(run.out, id);
      expect(row).toContain(content.questTemplates[quest.templateKey]?.name);
      expect(row).toContain(world.patrons[quest.patronId]?.name);
      expect(row).toMatch(new RegExp(`\\s${quest.difficulty}\\s+${quest.durationTurns / 3}\\s+${quest.reward}\\s`));
      expect(row).toMatch(/Day 2$/);
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

  test("hero prints a Hero's Attributes, Stats and Skills by their content names", () => {
    const { world } = document();
    const hero = world.heroes[makeId('heroes', 1)] as Hero;

    const run = play(['show', 'hero', hero.id]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`${hero.name} (${hero.id})`);
    expect(run.out).toMatch(new RegExp(`^Age\\s+${ageOf(hero, world.turn, defaultConfig)}$`, 'm'));
    expect(run.out).toMatch(new RegExp(`^Class\\s+${content.classes[hero.classKey]?.name}$`, 'm'));
    expect(run.out).toMatch(/^Guild\s+The Test \(guild-000001\)$/m);
    for (const stat of Object.values(content.stats).filter((row) => row.owner === 'hero')) {
      const hint = potentialHint(hero, stat.key, defaultConfig);
      expect(run.out).toMatch(new RegExp(`\\s${stat.name}\\s+${hero.stats[stat.key]}\\s+${hint}$`, 'm'));
    }
    for (const [key, rating] of Object.entries(hero.skills)) {
      expect(run.out).toMatch(new RegExp(`^${content.skills[key]?.name}\\s+${rating}$`, 'm'));
    }
  });

  test('hero never prints Potential, and every Stat row carries its hint (data-model rule 9, M3-S3)', () => {
    for (const hero of Object.values(document().world.heroes)) {
      const run = play(['show', 'hero', hero.id]);
      expect(run.code).toBe(exitCodes.ok);
      expect(run.out).not.toMatch(/potential/i);

      for (const stat of Object.values(content.stats).filter((row) => row.owner === 'hero')) {
        const row = run.out.split('\n').find((line) => new RegExp(`\\s${stat.name}\\s`).test(line)) ?? '';
        // Every Stat row ends in one of the three hint words, the base before it.
        const [value, hint] = row.trim().split(/\s+/).slice(-2);
        expect(potentialHints, `${hero.id} ${stat.key}: ${row}`).toContain(hint);
        expect(value).toBe(String(hero.stats[stat.key]));
        // Where the Potential differs from the base, its number is nowhere in the row.
        const potential = hero.potential[stat.key];
        if (potential !== hero.stats[stat.key]) expect(row).not.toMatch(new RegExp(`\\b${potential}\\b`));
      }
    }
  });

  test("hero prints each Stat's hint from the save's own bands, never its Potential", () => {
    const id = makeId('heroes', 1);
    // Bands unlike the defaults, so the hints can only come from the save's config.
    const potentialHintBands = { modest: 0, promising: 2, exceptional: 4 };
    const gaps = [0, 1, 2, 3, 4, 7];
    const stats = Object.values(content.stats).filter((row) => row.owner === 'hero').slice(0, gaps.length);
    edit((edited) => {
      edited.meta.config.potentialHintBands = potentialHintBands;
      const hero = edited.world.heroes[id] as Hero;
      stats.forEach((stat, index) => {
        hero.stats[stat.key] = 5;
        hero.potential[stat.key] = 5 + (gaps[index] ?? 0);
      });
    });

    const run = play(['show', 'hero', id]);

    expect(run.code).toBe(exitCodes.ok);
    const hints = stats.map((stat) => {
      const row = run.out.split('\n').find((line) => new RegExp(`\\s${stat.name}\\s`).test(line)) ?? '';
      expect(row, stat.name).not.toMatch(/\b(6|7|8|9|12)\b/);
      return row.trim().split(/\s+/).at(-1);
    });
    expect(hints).toEqual(['modest', 'modest', 'promising', 'promising', 'exceptional', 'exceptional']);
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

  test("hero names an Injury by its content name and its healing night as the narration does, and an unknown type by its key", () => {
    const id = makeId('heroes', 1);
    edit((edited) => {
      (edited.world.heroes[id] as Hero).injury = { typeKey: 'sprained-ankle', healsOnTurn: nightOf(13) };
    });

    const run = play(['show', 'hero', id]);

    expect(run.code).toBe(exitCodes.ok);
    const name = content.injuries['sprained-ankle']?.name ?? '';
    expect(name).not.toBe('');
    expect(run.out).toMatch(new RegExp(`^Injury\\s+${name}, healing on the night of Day 13 \\(Turn ${nightOf(13)}\\)$`, 'm'));
    expect(run.out).not.toContain('sprained-ankle');

    edit((edited) => {
      (edited.world.heroes[id] as Hero).injury = { typeKey: 'frostbite-of-the-soul', healsOnTurn: nightOf(13) };
    });
    expect(play(['show', 'hero', id]).out).toMatch(/^Injury\s+frostbite-of-the-soul, healing on the night of Day 13/m);
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
    expect(lines.filter((line) => /^\s*0\s+\S+\.\S+/.test(line))).toHaveLength(history.entries.length);
    expect(lines.findIndex((line) => line.includes('world.created'))).toBeLessThan(
      lines.findIndex((line) => line.includes('guild.founded')),
    );

    const guild = play(['show', 'history', playerId]);
    expect(guild.code).toBe(exitCodes.ok);
    expect(guild.out).toContain(`History of The Test (${playerId})`);
    expect(guild.out).toMatch(/guild\.founded\s+yes\s+The Test, Ada/);
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
    expect(run.out).toContain('Played 1 Turn. Now Turn 1 (Day 0, afternoon, Year 0).');
    expect(play(['show']).out).toContain('Seed demo, Turn 1 (Day 0, afternoon, Year 0)');
  });

  test('--turns plays that many Turns: three from a new world is the morning of Day 1', () => {
    const run = play(['advance', '--turns', '3']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Played 3 Turns. Now Turn 3 (Day 1, morning, Year 0).');
    expect(document().world.turn).toBe(3);
    expect(play(['show']).out).toContain('Seed demo, Turn 3 (Day 1, morning, Year 0)');
  });

  test('refuses a game that has ended, writing nothing', () => {
    edit((edited) => {
      edited.world.ended = { turn: 0, reason: 'bankruptcy' };
    });
    const original = saved();

    const run = play(['advance', '--turns', '2']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('The game ended on Turn 0: bankruptcy');
    expect(saved()).toBe(original);
  });

  test('plays on a save made before the Board existed, filling its Board on the first morning (M2-S3)', () => {
    // An M1 save: no board stream, no Quests.
    edit((edited) => {
      Reflect.deleteProperty(edited.world.rng, 'board');
      edited.world.board = [];
      edited.world.quests = {};
      edited.meta.content.version = 1;
    });

    const run = play(['advance', '--turns', '3']);

    expect(run.code).toBe(exitCodes.ok);
    // The morning's offers, in the CLI's words (DL-33).
    expect(run.out).toMatch(/offered .+ \(quest-\d{6}\)\./);
    expect(document().world.board).toHaveLength(defaultConfig.boardSize);
    expect(Object.hasOwn(document().world.rng, 'board')).toBe(true);
  });

  test('refuses a bad --turns as a bad command line', () => {
    expect(play(['advance', '--turns', '0']).code).toBe(exitCodes.usage);
    expect(document().world.turn).toBe(0);
  });
});

describe('advance --until: fast forward (M2-S11)', () => {
  beforeEach(() => {
    newDemo();
  });

  const playDepsOf = (before: WorldDocument) => ({ config: { ...defaultConfig, ...before.meta.config }, content });

  /**
   * Sends two of the player's four Heroes on the demo Board's seven-Day Guard the caravan, open to
   * any two to four; the other two stay at home, and no decision is needed while the Party is out.
   */
  function sendParty(): { partyId: string; returnsOnTurn: number } {
    const { world } = document();
    const questId = world.board.find((id) => world.quests[id]?.templateKey === 'guard-the-caravan');
    if (questId === undefined) throw new Error('The demo Board has changed');
    const roster = world.guilds[playerId]?.rosterIds ?? [];
    expect(play(['dispatch', '--quest', questId, '--heroes', roster.slice(0, 2).join(',')]).code).toBe(exitCodes.ok);
    const party = Object.values(document().world.parties)[0];
    if (party === undefined) throw new Error('No Party');
    return { partyId: party.id, returnsOnTurn: party.returnsOnTurn };
  }

  test('party-returns stops on the night the Party comes home, printing why and every event since the last command', () => {
    // Unattached Heroes leave after two Days, so the pool refills on the way whether or not the
    // Rivals recruit (which the balance pass, DL-35, made rare).
    edit((edited) => {
      edited.meta.config = { ...edited.meta.config, unattachedStayDays: 2 };
    });
    const { partyId, returnsOnTurn } = sendParty();
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
    expect(run.out).toContain(`Played ${returnsOnTurn} Turns. Now Turn ${returnsOnTurn} (Day ${dayOf(returnsOnTurn)}, night, Year 0).`);
    expect(run.out).toContain(`Stopped: The Test's Party came home: ${partyId}.`);
    expect(run.out).toContain(`Events: ${expected.events.length}, oldest first`);
    expect(run.out).toContain(`The Test's ${partyId} came home from Guard the caravan (quest-`);
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
    expect(run.out).toContain('Now Turn 3 (Day 1, morning, Year 0).');
    expect(run.out).toMatch(/Stopped: a decision is needed: The Test has no Party out, and could send one on quest-\d{6}.* \(show board\)\./);
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
    expect(year.out).toContain('Played 30 Turns. Now Turn 30 (Day 10, morning, Year 1).');
    expect(year.out).toContain('Stopped: played the most Turns allowed, 30.');
  });

  test('refuses a game that has ended, writing nothing', () => {
    edit((edited) => {
      edited.world.ended = { turn: 0, reason: 'retirement' };
    });
    const original = saved();

    const run = play(['advance', '--until', 'party-returns', '--max', '5']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('The game ended on Turn 0: retirement');
    expect(saved()).toBe(original);
  });
});

describe('dispatch (M2-S4)', () => {
  beforeEach(() => {
    newDemo();
  });

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

  test('sends the Party the engine sends, saves it, and prints the Party, the return Day and the Rivals reminder', () => {
    const before = document();
    const { questId, heroIds } = openQuest(before.world);
    const expected = dispatch(
      before,
      { guildId: playerId, questId, heroIds },
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
    expect(run.out).toContain(`returns on the night of Day ${dayOf(party.returnsOnTurn)}, Turn ${party.returnsOnTurn} `);
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
      expect(run.err).toContain('The game ended on Turn 0: retirement. Nothing more can be done in it.');
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
      [['--quest', questId, '--heroes', idle.join(',')], new RegExp(`${questId} is not on the Board`)],
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

  test('refuses a Party larger than the Quest takes, naming its bounds, writing nothing', () => {
    const { world } = document();
    const roster = world.guilds[playerId]?.rosterIds ?? [];
    const questId = world.board.find((id) => (world.quests[id]?.requirements.partySizeMax ?? 0) < roster.length);
    if (questId === undefined) throw new Error('Every Quest on the Board takes the whole Roster');
    const { partySizeMin, partySizeMax } = (world.quests[questId] as Quest).requirements;
    const original = saved();

    const run = play(['dispatch', '--quest', questId, '--heroes', roster.join(',')]);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(
      `${questId} takes a Party of ${partySizeMin} to ${partySizeMax} Heroes; ${roster.length} were named.`,
    );
    expect(saved()).toBe(original);
  });

  test('refuses a word that is not an id as a bad command line', () => {
    expect(play(['dispatch', '--quest', 'the-barrow', '--heroes', 'hero-000001']).code).toBe(exitCodes.usage);
  });
});

describe('rebase', () => {
  const adopted = (): number => count(document().history, 'world.rules-adopted');

  test('refuses a save already under the current rules, writing nothing', () => {
    newDemo();
    const original = saved();

    const run = play(['rebase']);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(`already plays under this release's rules, configVersion ${defaultConfig.configVersion}`);
    expect(saved()).toBe(original);
  });

  test("a save made under older rules plays under them until rebase adopts this release's, once", () => {
    newDemo();
    // A save from a release whose rules were one version older, with a year of three Turns.
    edit((edited) => {
      edited.meta.config.configVersion = defaultConfig.configVersion - 1;
      edited.meta.config.turnsPerYear = 3;
    });

    expect(play(['advance', '--turns', '3']).out).toContain('Now Turn 3 (Day 1, morning, Year 1).');
    expect(document().meta.config.turnsPerYear).toBe(3);

    const run = play(['rebase']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain(`configVersion ${defaultConfig.configVersion - 1} to ${defaultConfig.configVersion}`);
    expect(document().meta.config).toEqual(defaultConfig);
    expect(adopted()).toBe(1);
    expect(play(['show']).out).toContain('Turn 3 (Day 1, morning, Year 0)');
    expect(play(['show', 'history']).out).toMatch(/^\s*3\s+world\.rules-adopted\s+yes/m);

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
    expect(saved(join(dir, '.saves', 'backup.json'))).toBe(original);

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
    expect(saved(join(dir, 'copies', 'one.json'))).toBe(original);
    expect(play(['load', 'copies/one.json', '--save', 'two']).code).toBe(exitCodes.ok);
    expect(saved(join(dir, '.saves', 'two.json'))).toBe(original);
  });

  test.each([
    ['a corrupted file', (text: string) => text.slice(0, text.length / 2), 'not JSON'],
    [
      'a file from a newer schema',
      (text: string) => fromTheFuture(text),
      'version 999',
    ],
    [
      'a file the validator refuses',
      (text: string) => text.replace('"rosterIds":["hero-000001"', '"rosterIds":["hero-000999"'),
      'dangling-reference',
    ],
  ])('a refused load of %s prints the reason, exits non-zero and changes nothing', (_what, spoil, reason) => {
    newDemo();
    const original = saved();
    const bad = join(dir, 'bad.json');
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

  test('the newer-schema refusal names both versions', () => {
    newDemo();
    const bad = join(dir, 'future.json');
    writeFileSync(bad, fromTheFuture(saved()));

    const run = play(['load', bad]);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(`version 999 and this engine reads version ${defaultConfig.schemaVersion}`);
  });

  test('load refuses a file that is not there, and save --as a save that is not there', () => {
    expect(play(['load', 'nothing']).code).toBe(exitCodes.refused);
    const run = play(['save', '--as', 'backup']);
    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain('`new`');
    expect(existsSync(join(dir, '.saves', 'backup.json'))).toBe(false);
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

  test.each([[[]], [['play']], [['show', '--verbose']], [['show', 'market']], [['new', '--seed', 'x']]])(
    '%j prints the usage and exits non-zero',
    (argv) => {
      const run = play(argv);

      expect(run.code).toBe(exitCodes.usage);
      expect(run.err).toContain('Usage: heroesim <command> [flags]');
      expect(run.out).toBe('');
    },
  );

  test('help prints the usage', () => {
    const run = play(['help']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain('Usage: heroesim <command> [flags]');
  });
});
