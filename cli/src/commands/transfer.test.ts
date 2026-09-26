// `transfer`, `accept`, `decline`, `show offers` and fast forward's Transfer Offer stop end to end
// (M6-S2, DL-57): `main` run in-process against a real save in a temporary directory, with the real
// content set, as main.test.ts runs the other commands. The Rivals of seed `demo` are dealt the core's
// four Dispositions in Guild id order (DL-56): guild-000002 ambitious, guild-000003 miserly,
// guild-000004 reckless, guild-000005 steady.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAction,
  defaultConfig,
  deserialise,
  playerGuild,
  serialise,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, main } from '../main.js';

const content = loadContent();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-transfer-'));
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

function document(): WorldDocument {
  const loaded = deserialise(readFileSync(current(), 'utf8'), { config: defaultConfig, content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

function thePlayer(world: World): Guild {
  const guild = playerGuild(world);
  if (guild === undefined) throw new Error("No player's Guild");
  return guild;
}

function guildOf(world: World, guildId: string): Guild {
  const guild = world.guilds[guildId as GuildId];
  if (guild === undefined) throw new Error(`No Guild ${guildId}`);
  return guild;
}

function heroOf(world: World, heroId: string): Hero {
  const hero = world.heroes[heroId as HeroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

const ambitious = 'guild-000002';
const miserly = 'guild-000003';
const reckless = 'guild-000004';

/** A new world from seed `demo`, changed by `edit` and saved; Negotiation pinned to 0 so fees are list prices. */
function newWorld(edit: (world: World) => void = () => {}): WorldDocument {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const edited = document();
  edited.meta.config.negotiationRange = 0;
  expect(guildOf(edited.world, ambitious).controller).toEqual({ kind: 'rival', disposition: 'ambitious' });
  expect(guildOf(edited.world, miserly).controller).toEqual({ kind: 'rival', disposition: 'miserly' });
  expect(guildOf(edited.world, reckless).controller).toEqual({ kind: 'rival', disposition: 'reckless' });
  edit(edited.world);
  writeFileSync(current(), serialise(edited));
  return edited;
}

describe('transfer (M6-S2)', () => {
  test('transfer --hero <id> --to <guildId> sends a Hero to a Rival that wants them, for the fee, and saves', () => {
    const before = newWorld((world) => {
      guildOf(world, ambitious).wealth = 1_000_000; // rich enough to hire: its appetite takes a Hero
    });
    const player = thePlayer(before.world);
    const [heroId] = player.rosterIds as [HeroId];
    const hero = heroOf(before.world, heroId);

    const run = play(['transfer', '--hero', heroId, '--to', ambitious]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const after = document();
    const moved = guildOf(after.world, ambitious);
    const fee = 1_000_000 - moved.wealth;
    expect(fee).toBeGreaterThan(0);
    expect(run.out).toContain(`${moved.name} took ${hero.name} (${heroId}) from The Test for ${fee} Wealth.`);
    expect(run.out).toContain(`The Test: Wealth ${player.wealth + fee}; ${player.rosterIds.length - 1} Heroes on the Roster.`);
    expect(heroOf(after.world, heroId).guildId).toBe(ambitious);
    expect(thePlayer(after.world).rosterIds).not.toContain(heroId);
  });

  test('a Rival that will not take the Hero, or a Guild the save lacks, is refused and nothing is written', () => {
    const before = newWorld();
    const [heroId] = thePlayer(before.world).rosterIds as [HeroId];
    const saved = readFileSync(current(), 'utf8');

    // Miserly's appetite of 0.1 takes a Hero only into a Roster of ten or more.
    const refused = play(['transfer', '--hero', heroId, '--to', miserly]);
    const size = guildOf(before.world, miserly).rosterIds.length;
    expect(refused.code).toBe(exitCodes.refused);
    expect(refused.err).toContain(`will not take ${heroOf(before.world, heroId).name} (${heroId}): its Roster of ${size} is too small for its appetite for Transfers.`);
    const nowhere = play(['transfer', '--hero', heroId, '--to', 'guild-000099']);
    expect(nowhere).toMatchObject({ code: exitCodes.refused, err: 'The save has no Guild guild-000099 (show guilds).\n' });
    expect(readFileSync(current(), 'utf8')).toBe(saved);
  });

  test("transfer --hero <id> --in takes a Hero from a Rival that will part with them, for the fee, and saves", () => {
    const before = newWorld((world) => {
      thePlayer(world).wealth = 10_000;
    });
    const [heroId] = guildOf(before.world, reckless).rosterIds as [HeroId];
    const hero = heroOf(before.world, heroId);

    const run = play(['transfer', '--hero', heroId, '--in']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const after = document();
    const fee = 10_000 - thePlayer(after.world).wealth;
    expect(run.out).toContain(`The Test took ${hero.name} (${heroId}) from ${guildOf(before.world, reckless).name} for ${fee} Wealth.`);
    expect(heroOf(after.world, heroId).guildId).toBe(thePlayer(after.world).id);
    expect(guildOf(after.world, reckless).wealth).toBe(guildOf(before.world, reckless).wealth + fee);
  });
});

describe('Transfer Offers (M6-S2)', () => {
  /** The ambitious Rival's offer for the player's first Hero, made through the engine and saved. */
  function withOffer(): { heroId: HeroId; offerId: string; fee: number } {
    const before = newWorld((world) => {
      guildOf(world, ambitious).wealth = 1_000_000;
    });
    const [heroId] = thePlayer(before.world).rosterIds as [HeroId];
    const deps = { config: { ...defaultConfig, ...before.meta.config }, content };
    const made = applyAction(before, { kind: 'offerTransfer', guildId: ambitious as GuildId, heroId }, deps);
    if (!made.ok) throw new Error(`Refused: ${JSON.stringify(made.rejection)}`);
    writeFileSync(current(), serialise(made.document));
    const [offer] = Object.values(made.document.world.offers);
    if (offer === undefined) throw new Error('No offer');
    return { heroId, offerId: offer.id, fee: offer.fee };
  }

  test('show offers lists each offer with the id accept and decline take; decline removes it', () => {
    const { heroId, offerId, fee } = withOffer();
    const name = heroOf(document().world, heroId).name;
    const rivalName = guildOf(document().world, ambitious).name;

    const shown = play(['show', 'offers']);
    expect(shown.code).toBe(exitCodes.ok);
    expect(shown.out).toContain("Transfer Offers for The Test's Heroes: 1. Answer with accept --offer <id> or decline --offer <id>.");
    expect(shown.out).toMatch(new RegExp(`${offerId}\\s+${rivalName}\\s+${name} \\(${heroId}\\)\\s+${fee}\\s+Turn 8 \\(Day 2, night`));

    const declined = play(['decline', '--offer', offerId]);
    expect(declined).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(declined.out).toContain(`The Test declined ${rivalName}'s offer for ${name} (${heroId}) (${offerId}).`);
    expect(document().world.offers).toEqual({});
    expect(play(['show', 'offers']).out).toBe("No Transfer Offer stands for The Test's Heroes.\n");
    expect(play(['decline', '--offer', offerId])).toMatchObject({
      code: exitCodes.refused,
      err: `No Transfer Offer ${offerId} stands for The Test's Heroes (show offers).\n`,
    });
  });

  test('accept transfers the Hero for the fee offered', () => {
    const { heroId, offerId, fee } = withOffer();
    const wealth = thePlayer(document().world).wealth;

    const accepted = play(['accept', '--offer', offerId]);

    expect(accepted).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(accepted.out).toContain(`from The Test for ${fee} Wealth, accepting ${offerId}.`);
    const after = document();
    expect(heroOf(after.world, heroId).guildId).toBe(ambitious);
    expect(thePlayer(after.world).wealth).toBe(wealth + fee);
    expect(after.world.offers).toEqual({});
  });

  // The story's fourth box.
  test('fast forward stops with transfer-offer, says so with the offer, and show offers lists it', () => {
    newWorld((world) => {
      // A rich ambitious Rival, and one of the player's Heroes the dearest in the world: when it
      // weighs a Transfer (three times in four, once its infirmary is built), it offers for them.
      guildOf(world, ambitious).wealth = 1_000_000;
      const [heroId] = thePlayer(world).rosterIds as [HeroId];
      const hero = heroOf(world, heroId);
      for (const key of Object.keys(hero.stats)) hero.stats[key] = 20;
    });

    let stop = '';
    for (let tries = 0; tries < 20 && !stop.includes('Transfer Offer'); tries += 1) {
      const run = play(['advance', '--until', 'party-returns', '--max', '30']);
      expect(run.code).toBe(exitCodes.ok);
      stop = run.out.split('\n').find((line) => line.startsWith('Stopped:')) ?? '';
    }

    const [offer] = Object.values(document().world.offers);
    if (offer === undefined) throw new Error('No offer was made');
    expect(stop).toMatch(new RegExp(`^Stopped: a Transfer Offer: .+ offers ${offer.fee} Wealth for .+ \\(${offer.heroId}\\) until the night of Day \\d+ \\(${offer.id}\\)\\. Answer with accept --offer <id> or decline --offer <id> \\(show offers\\)\\.$`));
    expect(play(['show', 'offers']).out).toContain(offer.id);
  });
});
