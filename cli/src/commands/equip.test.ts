// `equip` and `unequip` end to end (M5-S2): `main` run in-process against a real save in a temporary
// directory, with the real content set, as main.test.ts runs the other commands.

import { writeFileSync } from 'node:fs';
import {
  addStack,
  holdings,
  playerGuild,
  serialise,
  type Guild,
  type Hero,
  type ItemId,
  type StackId,
} from '@heroesim/engine';
import { count, createItem } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { exitCodes, playground } from '../play.test-support.js';

const content = loadContent();

const { play, current, saved, document } = playground('heroesim-equip-', content);

interface Stocked {
  hero: Hero;
  guild: Guild;
  /** Two Masterwork blades (Weaponry +3, Strength +2) in the Guild's holding. */
  blades: StackId;
  /** The Barrow King's blade, unique, in the Guild's holding. */
  relic: ItemId;
  /** Two Whetstones, a consumable. */
  whetstones: StackId;
}

/**
 * A new world whose player's Guild holds two Masterwork blades, the Barrow King's blade and two
 * Whetstones; its first Hero's Strength and Weaponry are 8, and its Guildmaster has no Trait.
 */
function stocked(): Stocked {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const edited = document();
  const { world } = edited;
  const guild = playerGuild(world) as Guild;
  for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
  const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
  hero.stats['strength'] = 8;
  hero.stats['weaponry'] = 8;
  const vault = { kind: 'guild', id: guild.id } as const;
  const blades = addStack(world, 'masterwork-blade', 2, vault);
  const relic = createItem(world, 'barrow-kings-blade', vault);
  const whetstones = addStack(world, 'whetstone', 2, vault);
  writeFileSync(current(), serialise(edited));
  return { hero, guild, blades, relic, whetstones };
}

/** The line of `show hero` for the Stat named `name`: its base, its effective value, its hint. */
function statRow(out: string, name: string): string[] {
  const row = out.split('\n').find((line) => new RegExp(`\\s${name}\\s`).test(line)) ?? '';
  return row.trim().split(/\s+/).slice(-3);
}

describe('equip and unequip', () => {
  test('equip --hero --stack puts one Masterwork blade on the Hero, prints what changed, and saves; show hero shows base and effective', () => {
    const { hero, guild, blades } = stocked();

    const run = play(['equip', '--hero', hero.id, '--stack', blades]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toMatch(new RegExp(`^The Test put Masterwork blade \\(stack-\\d{6}\\) in ${hero.name} \\(${hero.id}\\)'s weapon slot\\.$`, 'm'));
    expect(run.out).toContain('Effective Stats: Strength 8 to 10, Weaponry 8 to 11.');
    const { world, history } = document();
    expect(holdings(world, { kind: 'hero', id: hero.id }).stacks.map((stack) => [stack.definitionKey, stack.quantity])).toEqual([
      ['masterwork-blade', 1],
    ]);
    expect(world.stacks[blades]?.quantity).toBe(1);
    expect(count(history, 'item.equipped')).toBe(1);

    const shown = play(['show', 'hero', hero.id]);
    expect(shown.code).toBe(exitCodes.ok);
    // The base, then the effective value, side by side; never Potential.
    expect(statRow(shown.out, 'Strength').slice(0, 2)).toEqual(['8', '10']);
    expect(statRow(shown.out, 'Weaponry').slice(0, 2)).toEqual(['8', '11']);
    expect(shown.out).toMatch(/^weapon\s+Masterwork blade\s+stack-\d{6}\s+Weaponry \+3, Strength \+2$/m);
    expect(shown.out).toMatch(/^armour\s+none$/m);
    expect(shown.out).not.toMatch(/potential/i);
    expect(guild.id).toBe('guild-000001');
  });

  test('equip --hero --item puts a unique Item on; unequip --slot takes it back to the holding', () => {
    const { hero, guild, relic } = stocked();

    expect(play(['equip', '--hero', hero.id, '--item', relic]).code).toBe(exitCodes.ok);
    expect(document().world.items[relic]?.holder).toEqual({ kind: 'hero', id: hero.id, slot: 'weapon' });

    const run = play(['unequip', '--hero', hero.id, '--slot', 'weapon']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain(`The Test took The Barrow King's blade (${relic}) from ${hero.name} (${hero.id})'s weapon slot.`);
    expect(run.out).toContain('Effective Stats: Strength 10 to 8, Weaponry 12 to 8, Courage ');
    const { world, history } = document();
    expect(world.items[relic]?.holder).toEqual({ kind: 'guild', id: guild.id });
    expect(count(history, 'item.unequipped')).toBe(1);
  });

  test('show roster lists what the Guild holds, with the ids equip takes', () => {
    const { blades, relic, whetstones } = stocked();

    const run = play(['show', 'roster']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain('Held by The Test');
    expect(run.out).toMatch(new RegExp(`^${relic}\\s+The Barrow King's blade\\s+Weapon Gear\\s+1\\s+Weaponry \\+4, Strength \\+2, Courage \\+1$`, 'm'));
    expect(run.out).toMatch(new RegExp(`^${blades}\\s+Masterwork blade\\s+Weapon Gear\\s+2\\s+Weaponry \\+3, Strength \\+2$`, 'm'));
    expect(run.out).toMatch(new RegExp(`^${whetstones}\\s+Whetstone\\s+Consumable\\s+2$`, 'm'));
  });

  test('refuses what the engine refuses, in words, and writes nothing', () => {
    const { hero, blades, whetstones } = stocked();
    const before = saved();

    const notGear = play(['equip', '--hero', hero.id, '--stack', whetstones]);
    expect(notGear.code).toBe(exitCodes.refused);
    expect(notGear.err).toContain('Whetstone is not Gear, and is carried in no slot.');

    const missing = play(['equip', '--hero', hero.id, '--stack', 'stack-999999']);
    expect(missing.code).toBe(exitCodes.refused);
    expect(missing.err).toContain('The Test does not hold stack-999999: show roster lists what it holds.');

    const empty = play(['unequip', '--hero', hero.id, '--slot', 'armour']);
    expect(empty.code).toBe(exitCodes.refused);
    expect(empty.err).toContain(`${hero.name} (${hero.id})'s armour slot is empty.`);

    const stranger = play(['equip', '--hero', 'hero-999999', '--stack', blades]);
    expect(stranger.code).toBe(exitCodes.refused);
    expect(stranger.err).toContain("hero-999999 is not on The Test's Roster (show roster).");
    expect(saved()).toBe(before);

    expect(play(['equip', '--hero', hero.id, '--stack', blades]).code).toBe(exitCodes.ok);
    const occupied = play(['equip', '--hero', hero.id, '--stack', blades]);
    expect(occupied.code).toBe(exitCodes.refused);
    expect(occupied.err).toMatch(/'s weapon slot holds Masterwork blade \(stack-\d{6}\): unequip it first\.$/m);
  });

  // v1.1.6-S11 (DL-197): "their Gear", a glossary term, as the page says it; "their gear" until then.
  test('refuses to change the Gear of a Hero away on a Quest, and writes nothing', () => {
    const { hero, guild, blades } = stocked();
    expect(play(['equip', '--hero', hero.id, '--stack', blades]).code).toBe(exitCodes.ok);
    const { world } = document();
    const questId = world.board.find((id) => world.quests[id]?.templateKey === 'guard-the-caravan');
    if (questId === undefined) throw new Error('The demo Board has changed');
    expect(play(['dispatch', '--quest', questId, '--heroes', guild.rosterIds.slice(0, 2).join(',')]).code).toBe(exitCodes.ok);
    const before = saved();

    const away = `${hero.name} (${hero.id}) is away on a Quest, and their Gear is with them.`;
    for (const argv of [
      ['equip', '--hero', hero.id, '--stack', blades],
      ['unequip', '--hero', hero.id, '--slot', 'weapon'],
    ]) {
      const run = play(argv);
      expect(run.code, argv[0]).toBe(exitCodes.refused);
      expect(run.err, argv[0]).toContain(away);
    }
    expect(saved()).toBe(before);
  });

  test('refuses a bad command line as a usage error, and writes nothing', () => {
    const { hero, blades, relic } = stocked();
    const before = saved();

    for (const argv of [
      ['equip', '--hero', hero.id],
      ['equip', '--hero', hero.id, '--stack', blades, '--item', relic],
      ['equip', '--hero', hero.id, '--item', blades],
      ['equip', '--hero', 'brenna', '--stack', blades],
      ['unequip', '--hero', hero.id],
      ['unequip', '--hero', hero.id, '--slot', 'belt'],
    ]) {
      expect(play(argv).code, argv.join(' ')).toBe(exitCodes.usage);
    }
    expect(saved()).toBe(before);
  });
});
