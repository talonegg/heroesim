// `show market`, `buy` and `sell` end to end (M5-S4): `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands. The
// Market is arranged by hand in the save, and the prices the tests read are pinned in its config.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addStack,
  deserialise,
  holdings,
  playerGuild,
  serialise,
  type Guild,
  type WorldDocument,
} from '@heroesim/engine';
import { count, createItem, findStack, marketHolder } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, main } from '../main.js';

const content = loadContent();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-market-'));
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

function document(): WorldDocument {
  const loaded = deserialise(saved(), { content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

function player(): Guild {
  const guild = playerGuild(document().world);
  if (guild === undefined) throw new Error("No player's Guild");
  return guild;
}

/**
 * A new world whose player's Guild holds `wealth` and 3 Healing draughts, and whose Market holds 4
 * Padded jacks and the Barrow King's blade and nothing else, under pinned prices.
 */
function newWorld(wealth: number): { guild: Guild; draughts: string; blade: string } {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const edited = document();
  Object.assign(edited.meta.config, { sellRatio: 0.5, lootOnlyPrice: 600 });
  const { world } = edited;
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error("No player's Guild");
  guild.wealth = wealth;
  for (const stack of holdings(world, marketHolder).stacks) delete world.stacks[stack.id];
  addStack(world, 'padded-jack', 4, marketHolder);
  const blade = createItem(world, 'barrow-kings-blade', marketHolder);
  const draughts = addStack(world, 'healing-draught', 3, { kind: 'guild', id: guild.id });
  writeFileSync(current(), serialise(edited));
  return { guild, draughts, blade };
}

describe('the Market', () => {
  test('show market lists what is for sale by key, with price, and what the Guild holds by id, with what each sells for', () => {
    const { draughts } = newWorld(1_000);

    const run = play(['show', 'market']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    // Four Padded jacks and the blade: five Items, of two kinds.
    expect(run.out).toContain('Market: 5 Items for sale, of 2 kinds, Turn 0 (Day 0, morning, Year 0)');
    expect(run.out).toMatch(/barrow-kings-blade +The Barrow King's blade +Weapon Gear, Unique Item +Weaponry \+4, Strength \+2, Courage \+1 +1 +600/);
    expect(run.out).toMatch(/padded-jack +Padded jack +Armour Gear +Constitution \+1 +4 +40/);
    expect(run.out).toContain('The Test has 1000 Wealth and holds:');
    expect(run.out).toMatch(new RegExp(`${draughts} +Healing draught +3 +15`));
  });

  test('buy --item <key> --quantity <n> deducts the price of each and moves them to the Guild, prints it, and saves', () => {
    const { guild } = newWorld(1_000);

    const run = play(['buy', '--item', 'padded-jack', '--quantity', '3']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain('Bought 3 × Padded jack for 120 Wealth, 40 each.');
    expect(run.out).toContain('The Test has 880 Wealth left.');
    const { world, history } = document();
    expect(player().wealth).toBe(880);
    expect(findStack(world, 'padded-jack', { kind: 'guild', id: guild.id })?.quantity).toBe(3);
    expect(findStack(world, 'padded-jack', marketHolder)?.quantity).toBe(1);
    expect(count(history, 'item.bought')).toBe(1);
  });

  test('buys the unique Item a folded Guild left at its Market price', () => {
    const { guild, blade } = newWorld(1_000);

    const run = play(['buy', '--item', 'barrow-kings-blade']);

    expect(run.out).toContain(`Bought The Barrow King's blade (${blade}) for 600 Wealth, 600 each.`);
    expect(document().world.items[blade as keyof WorldDocument['world']['items']]?.holder).toEqual({ kind: 'guild', id: guild.id });
  });

  test('sell --stack <id> --quantity <n> credits the sell price of each, prints it, and saves', () => {
    const { draughts } = newWorld(100);

    const run = play(['sell', '--stack', draughts, '--quantity', '2']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain('Sold 2 × Healing draught to the Market for 30 Wealth, 15 each.');
    expect(run.out).toContain('The Test has 130 Wealth.');
    expect(player().wealth).toBe(130);
    expect(findStack(document().world, 'healing-draught', marketHolder)?.quantity).toBe(2);
    expect(count(document().history, 'item.sold')).toBe(1);
  });

  test('sell --item <id> sells a unique Item the Guild holds', () => {
    const { blade } = newWorld(600);
    expect(play(['buy', '--item', 'barrow-kings-blade']).code).toBe(exitCodes.ok);

    const run = play(['sell', '--item', blade]);

    expect(run.out).toContain("Sold The Barrow King's blade to the Market for 300 Wealth, 300 each.");
    expect(player().wealth).toBe(300);
  });

  test.each([
    [['buy', '--item', 'whetstone'], 'The Market has no Whetstone for sale (show market).'],
    [['buy', '--item', 'padded-jack', '--quantity', '5'], 'The Market has 4 Padded jack; 5 cannot be bought.'],
    [['buy', '--item', 'padded-jack', '--quantity', '4'], 'That costs 160 Wealth; The Test has 150.'],
    [['sell', '--stack', 'stack-000999'], 'The Test holds no stack-000999 to sell (show market lists what it holds).'],
    [['sell', '--item', 'item-000999'], 'The Test holds no item-000999 to sell'],
  ])('%j is refused in words, and nothing is written', (argv, problem) => {
    newWorld(150);
    const before = saved();

    const run = play(argv);

    expect(run.code).toBe(exitCodes.refused);
    expect(run.err).toContain(problem);
    expect(saved()).toBe(before);
  });

  test('refuses selling more than a stack holds, and a bad command line, writing nothing', () => {
    const { draughts } = newWorld(150);
    const before = saved();

    const tooMany = play(['sell', '--stack', draughts, '--quantity', '4']);

    expect(tooMany.code).toBe(exitCodes.refused);
    expect(tooMany.err).toContain(`${draughts} holds 3; 4 cannot be sold from it.`);
    expect(play(['sell', '--stack', draughts, '--quantity', 'all']).code).toBe(exitCodes.usage);
    expect(play(['buy']).code).toBe(exitCodes.usage);
    expect(saved()).toBe(before);
  });
});
