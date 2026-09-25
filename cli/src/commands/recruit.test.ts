// `recruit --hero <id>` end to end (M2-S8): `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultConfig,
  deserialise,
  makeId,
  playerGuild,
  serialise,
  signingFee,
  unattachedHeroes,
  type Guild,
  type Hero,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, main } from '../main.js';
import { playDeps } from '../saves.js';

const content = loadContent();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-recruit-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function play(argv: string[]): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  const code = main(argv, {
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
    cwd: dir,
    env: {},
    now: () => new Date('2026-09-26T09:30:00.000Z'),
    random: () => 0,
  });
  return { code, out, err };
}

const current = (): string => join(dir, '.saves', 'current.json');
const saved = (): string => readFileSync(current(), 'utf8');

/** The save, loaded and validated as the CLI loads it. */
function document(): WorldDocument {
  const loaded = deserialise(saved(), { config: defaultConfig, content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

/** Rewrites the save after `change`, bypassing the CLI, as a hand edit would. */
function edit(change: (document: WorldDocument) => void): void {
  const edited = document();
  change(edited);
  writeFileSync(current(), serialise(edited));
}

/** A new world, its player's Guild and the first Hero in its pool. */
function newWorld(): { guild: Guild; hero: Hero; fee: number } {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const created = document();
  const guild = playerGuild(created.world);
  const [hero] = unattachedHeroes(created.world);
  if (guild === undefined || hero === undefined) throw new Error('The world is incomplete');
  return { guild, hero, fee: signingFee(hero, playDeps(created, content)) };
}

/** The line of `output` that starts with `id`: a row of a table keyed by id. */
function rowOf(output: string, id: string): string {
  const row = output.split('\n').find((line) => line.startsWith(id));
  if (row === undefined) throw new Error(`No row for ${id} in:\n${output}`);
  return row;
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
    expect(play(['recruit']).code).toBe(exitCodes.usage);
    expect(saved()).toBe(before);
  });
});

describe('the views', () => {
  test("show pool prints each Hero's signing fee from the engine's selector", () => {
    newWorld();
    const created = document();
    const deps = playDeps(created, content);

    const run = play(['show', 'pool']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/\sFee\n/);
    for (const hero of unattachedHeroes(created.world)) {
      expect(rowOf(run.out, hero.id)).toMatch(new RegExp(`\\s${signingFee(hero, deps)}$`));
    }
  });

  test('show hero says when a Hero whose row stayed left the pool', () => {
    const { hero } = newWorld();
    edit((edited) => Object.assign(edited.world.heroes[hero.id] ?? {}, { unattachedSince: null, leftPoolOnTurn: 0 }));

    const run = play(['show', 'hero', hero.id]);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toMatch(/Left the pool\s+Turn 0/);
    expect(run.out).not.toContain('Unattached');
  });
});
