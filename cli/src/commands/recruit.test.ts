// `recruit --hero <id>` end to end: `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import {
  guildmasterOf,
  playDeps,
  playerGuild,
  rankings,
  signingFee,
  unattachedHeroes,
  type EngineDeps,
  type Guild,
  type Hero,
  type WorldDocument,
} from '@heroesim/engine';
import { makeId } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { exitCodes, playground, rowOf } from '../play.test-support.js';

const content = loadContent();

/** The deps a game plays under: the engine's `playDeps` over its own config (DL-193). */
function depsOf(document: WorldDocument): EngineDeps {
  const played = playDeps(document, content);
  if (!played.ok) throw new Error(played.refusal.message);
  return played.deps;
}

const { play, saved, document, edit } = playground('heroesim-recruit-', content);

/**
 * A new world, its player's Guild and the first Hero in its pool, with the fee the player's Guild
 * pays for them: its Guildmaster's Negotiation applied.
 */
function newWorld(): { guild: Guild; hero: Hero; fee: number } {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const created = document();
  const guild = playerGuild(created.world);
  const [hero] = unattachedHeroes(created.world);
  if (guild === undefined || hero === undefined) throw new Error('The world is incomplete');
  return { guild, hero, fee: signingFee(hero, depsOf(created), guildmasterOf(guild, created.world)) };
}

describe('recruit', () => {
  test("signs a pool Hero to the player's Guild for the fee, prints it and the new Roster size, and saves", () => {
    const { guild, hero, fee } = newWorld();

    const run = play(['recruit', '--hero', hero.id]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain(`${hero.name} (${hero.id})`);
    expect(run.out).toContain(`signing fee of ${fee} Wealth`);
    expect(run.out).toContain(`Roster now holds ${guild.rosterIds.length + 1} Heroes`);
    const { world } = document();
    expect(world.guilds[guild.id]?.wealth).toBe(guild.wealth - fee);
    expect(world.guilds[guild.id]?.rosterIds.at(-1)).toBe(hero.id);
    expect(world.heroes[hero.id]?.guildId).toBe(guild.id);
    expect(play(['show', 'pool']).out).not.toContain(hero.id);
  });

  test('refuses a Hero not in the pool, or one whose fee is above the Wealth, writing nothing', () => {
    const { guild, hero, fee } = newWorld();
    const onRoster = guild.rosterIds[0] ?? makeId('heroes', 1);
    const before = saved();

    const taken = play(['recruit', '--hero', onRoster]);
    expect(taken.code).toBe(exitCodes.refused);
    expect(taken.err).toContain('not in the Unattached pool');

    edit((edited) => {
      const player = edited.world.guilds[guild.id];
      if (player !== undefined) player.wealth = fee - 1;
    });
    const edited = saved();
    const dear = play(['recruit', '--hero', hero.id]);
    expect(dear.code).toBe(exitCodes.refused);
    expect(dear.err).toContain(`signing fee is ${fee} Wealth`);
    expect(saved()).toBe(edited);
    expect(before).not.toBe(edited);
  });

  test('refuses an id not in the save, and a word that is not a Hero id as a bad command line', () => {
    newWorld();
    const before = saved();

    const missing = play(['recruit', '--hero', 'hero-000999']);
    expect(missing.code).toBe(exitCodes.refused);
    expect(missing.err).toContain('hero-000999');
    expect(play(['recruit', '--hero', 'guild-000001']).code).toBe(exitCodes.usage);
    expect(play(['recruit', '--hero', 'Brenna']).code).toBe(exitCodes.usage);
    expect(saved()).toBe(before);
  });
});

/** Pins the save's `fameRequiredPerLevel` at 10, the value these tests are written against. */
function pinFame(): void {
  edit((edited) => {
    edited.meta.config.fameRequiredPerLevel = 10;
  });
}

describe('recruit and Fame', () => {
  test("refuses a Hero who will not sign for the player's Guild's Fame, naming the Fame asked, and writes nothing", () => {
    const { guild, hero } = newWorld();
    pinFame();
    edit((edited) => {
      const row = edited.world.heroes[hero.id];
      if (row !== undefined) row.level = 5;
    });
    const before = saved();

    const refused = play(['recruit', '--hero', hero.id]);

    expect(refused.code).toBe(exitCodes.refused);
    expect(refused.err).toContain(`${hero.name} (${hero.id}) will not sign for a Guild with less than 40 Fame`);
    expect(refused.err).toContain(`${guild.name} has 0, 40 short`);
    expect(saved()).toBe(before);

    edit((edited) => {
      const player = edited.world.guilds[guild.id];
      if (player !== undefined) player.fame = 40;
    });
    expect(play(['recruit', '--hero', hero.id]).code).toBe(exitCodes.ok);
  });
});

describe('the views', () => {
  test("show pool prints each Hero's signing fee from the engine's selector", () => {
    newWorld();
    const created = document();
    const deps = depsOf(created);
    // The fee the player's Guild pays: its Guildmaster's Negotiation applied.
    const buyer = guildmasterOf(playerGuild(created.world) as Guild, created.world);

    const run = play(['show', 'pool']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/\sFee\s+Signs\n/);
    for (const hero of unattachedHeroes(created.world)) {
      expect(rowOf(run.out, hero.id)).toMatch(new RegExp(`\\s${signingFee(hero, deps, buyer)}\\s+Yes$`));
    }
  });

  test("show pool marks the Heroes who will not yet sign for the player's Guild with the Fame they ask", () => {
    const { guild, hero } = newWorld();
    pinFame();
    edit((edited) => {
      const row = edited.world.heroes[hero.id];
      if (row !== undefined) row.level = 5;
    });

    const run = play(['show', 'pool']);

    expect(run.code).toBe(exitCodes.ok);
    expect(rowOf(run.out, hero.id)).toMatch(/\sNeeds Fame 40$/);
    const others = unattachedHeroes(document().world).filter((each) => each.id !== hero.id);
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(rowOf(run.out, other.id)).toMatch(/\sYes$/);
    expect(run.out).toContain(`${guild.name} has 0 Fame.`);
  });

  test('show rankings orders every Guild in play by Fame, and by Wealth with --by wealth, as the engine ranks them', () => {
    newWorld();
    edit((edited) => {
      Object.values(edited.world.guilds).forEach((each, index) => {
        each.fame = 10 * index;
        each.wealth = 1_000 - 10 * index;
      });
    });
    const { world } = document();

    for (const [argv, by, heading] of [
      [['show', 'rankings'], 'fame', 'Rankings by Fame'],
      [['show', 'rankings', '--by', 'wealth'], 'wealth', 'Rankings by Wealth'],
    ] as const) {
      const run = play([...argv]);
      expect(run.code).toBe(exitCodes.ok);
      expect(run.out).toContain(heading);
      const ranked = rankings(world, by);
      expect(ranked).toHaveLength(Object.keys(world.guilds).length);
      const lines = run.out.split('\n');
      const order = ranked.map((ranking) => lines.findIndex((line) => line.includes(ranking.guildId)));
      expect(order.every((index) => index > 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      for (const ranking of ranked) {
        expect(lines[order[ranking.rank - 1] ?? 0]).toMatch(new RegExp(`^\\s*${ranking.rank}\\s+${ranking.guildId}\\s.*\\s${ranking.value}$`));
      }
    }
    // The two orders differ on this save: the player's Guild, first created, is last by Fame and first by Wealth.
    expect(rankings(world, 'fame').at(-1)?.guildId).toBe(rankings(world, 'wealth')[0]?.guildId);
  });
});
