// `transfer`, `accept`, `decline`, `show offers` and fast forward's Transfer Offer stop end to end
// (DL-57): `main` run in-process against a real save in a temporary directory, with the real
// content set, as main.test.ts runs the other commands. The Rivals of seed `demo` are dealt the core's
// four Dispositions in Guild id order (DL-56): guild-000002 ambitious, guild-000003 miserly,
// guild-000004 reckless, guild-000005 steady.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  addStack,
  applyAction,
  defaultConfig,
  serialise,
  transferFee,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { coinLetters, coinWords } from '@heroesim/words';
import { describe, expect, test } from 'vitest';
import { exitCodes, playground, thePlayer } from '../play.test-support.js';

const content = loadContent();

const { play, current, document } = playground('heroesim-transfer-', content);

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

describe('transfer', () => {
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
    expect(run.out).toContain(`${moved.name} took ${hero.name} (${heroId}) from The Test for ${coinWords(fee)}.`);
    expect(run.out).toContain(`The Test: Wealth ${coinLetters(player.wealth + fee)}; ${player.rosterIds.length - 1} Heroes on the Roster.`);
    expect(heroOf(after.world, heroId).guildId).toBe(ambitious);
    expect(thePlayer(after.world).rosterIds).not.toContain(heroId);
  });

  test("show roster <guildId> and show hero give a Rival's Hero the fee the player's Guild would pay, which transfer --in then charges", () => {
    expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
    const edited = document();
    // Negotiation in play and the player's Guildmaster at its best: the fee shown is theirs, not the list price.
    edited.meta.config.negotiationRange = 0.1;
    const player = thePlayer(edited.world);
    const guildmaster = edited.world.guildmasters[player.guildmasterId];
    if (guildmaster === undefined) throw new Error('No Guildmaster');
    guildmaster.stats['negotiation'] = 20;
    player.wealth = 10_000;
    writeFileSync(current(), serialise(edited));
    const [heroId] = guildOf(edited.world, reckless).rosterIds as [HeroId];
    const [ownId] = player.rosterIds as [HeroId];
    const listPrice = transferFee(heroOf(edited.world, heroId), undefined, { config: { ...defaultConfig, ...edited.meta.config }, content });

    const roster = play(['show', 'roster', reckless]).out.split(/\r?\n/);
    // The Transfer fee column, in letters (`5g 20s`), back to Silver.
    const [, shownGold = '0', shownSilver = '0'] = /(?:(\d+)g)?(?: ?(\d+)s)?$/.exec(roster.find((line) => line.startsWith(heroId))?.trim() ?? '') ?? [];
    const shown = Number(shownGold) * 100 + Number(shownSilver);

    expect(roster.some((line) => line.endsWith('Transfer fee'))).toBe(true);
    expect(shown).toBeGreaterThan(0);
    expect(shown).not.toBe(listPrice);
    expect(play(['show', 'hero', heroId]).out).toMatch(new RegExp(`^Transfer fee +${coinLetters(shown)}$`, 'm'));
    // The player's own Heroes have no one fee: each Rival pays at its own Guildmaster's Negotiation.
    expect(play(['show', 'roster']).out).not.toContain('Transfer fee');
    expect(play(['show', 'hero', ownId]).out).not.toContain('Transfer fee');
    expect(play(['transfer', '--hero', heroId, '--in']).out).toContain(`from ${guildOf(edited.world, reckless).name} for ${coinWords(shown)}.`);
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
    expect(run.out).toContain(`The Test took ${hero.name} (${heroId}) from ${guildOf(before.world, reckless).name} for ${coinWords(fee)}.`);
    expect(heroOf(after.world, heroId).guildId).toBe(thePlayer(after.world).id);
    expect(guildOf(after.world, reckless).wealth).toBe(guildOf(before.world, reckless).wealth + fee);
  });

  test('a Hero just transferred is refused a second Transfer, the refusal saying when they may move again (DL-60)', () => {
    const before = newWorld((world) => {
      thePlayer(world).wealth = 10_000;
    });
    // The lock the test reads, pinned in the save's rules.
    const pinned = document();
    pinned.meta.config.transferLockDays = 30;
    writeFileSync(current(), serialise(pinned));
    const [heroId] = guildOf(before.world, reckless).rosterIds as [HeroId];
    expect(play(['transfer', '--hero', heroId, '--in']).code).toBe(exitCodes.ok);
    const saved = readFileSync(current(), 'utf8');

    const back = play(['transfer', '--hero', heroId, '--to', reckless]);

    expect(back.code).toBe(exitCodes.refused);
    expect(back.err).toContain(`${heroOf(before.world, heroId).name} (${heroId}) was transferred on Year 1 Day 1 and cannot be transferred again before Year 1 Day 31.`);
    expect(readFileSync(current(), 'utf8')).toBe(saved);
  });

  test("the lock's dates are the save's own calendar's, not this release's (DL-210)", () => {
    const before = newWorld((world) => {
      thePlayer(world).wealth = 10_000;
    });
    // A Year of two Days: the engine's Day 30, the lock's end, falls on the first Day of the sixteenth Year.
    const pinned = document();
    pinned.meta.config.transferLockDays = 30;
    pinned.meta.config.turnsPerYear = 6;
    writeFileSync(current(), serialise(pinned));
    const [heroId] = guildOf(before.world, reckless).rosterIds as [HeroId];
    expect(play(['transfer', '--hero', heroId, '--in']).code).toBe(exitCodes.ok);

    const back = play(['transfer', '--hero', heroId, '--to', reckless]);

    expect(back.code).toBe(exitCodes.refused);
    expect(back.err).toContain(`(${heroId}) was transferred on Year 1 Day 1 and cannot be transferred again before Year 16 Day 1.`);
  });
});

describe('Transfer Offers', () => {
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
    expect(shown.out).toMatch(new RegExp(`${offerId}\\s+${rivalName}\\s+${name} \\(${heroId}\\)\\s+${coinLetters(fee)}\\s+Turn 8 \\(Year 1 Day 3, night\\)`));

    const declined = play(['decline', '--offer', offerId]);
    expect(declined).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(declined.out).toContain(`The Test declined ${rivalName}'s Offer for ${name} (${heroId}) (${offerId}).`);
    expect(document().world.offers).toEqual({});
    expect(play(['show', 'offers']).out).toBe("No Transfer Offer stands for The Test's Heroes.\n");
    expect(play(['decline', '--offer', offerId])).toMatchObject({
      code: exitCodes.refused,
      err: `No such Transfer Offer (${offerId}) stands for The Test's Heroes (show offers).\n`,
    });
  });

  test('accept transfers the Hero for the fee offered', () => {
    const { heroId, offerId, fee } = withOffer();
    const wealth = thePlayer(document().world).wealth;

    const accepted = play(['accept', '--offer', offerId]);

    expect(accepted).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(accepted.out).toContain(`from The Test for ${coinWords(fee)}, accepting ${offerId}.`);
    const after = document();
    expect(heroOf(after.world, heroId).guildId).toBe(ambitious);
    expect(thePlayer(after.world).wealth).toBe(wealth + fee);
    expect(after.world.offers).toEqual({});
  });

  // The story's fourth box.
  test('fast forward stops with transfer-offer, says so with the offer, and show offers lists it', () => {
    newWorld((world) => {
      // A rich ambitious Rival, and one of the player's Heroes the dearest in the world: when it
      // weighs a Transfer (three times in ten, the core's `transferAppetite` 0.3 since DL-69, hence
      // the tries), it offers for them. Its Hall is built and its Heroes are outfitted, since it
      // builds and buys gear before it weighs a Transfer (DL-58).
      const rival = guildOf(world, ambitious);
      rival.wealth = 1_000_000;
      rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 3 };
      for (const heroId of rival.rosterIds) {
        for (const [slot, key] of [['weapon', 'short-sword'], ['armour', 'padded-jack'], ['trinket', 'lucky-charm']] as const) {
          addStack(world, key, 1, { kind: 'hero', id: heroId, slot });
        }
      }
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
    expect(stop).toMatch(new RegExp(`^Stopped: a Transfer Offer: .+ offers ${coinWords(offer.fee)} for .+ \\(${offer.heroId}\\) until the night of Year 1 Day \\d+ \\(${offer.id}\\)\\. Answer with accept --offer <id> or decline --offer <id> \\(show offers\\)\\.$`));
    expect(play(['show', 'offers']).out).toContain(offer.id);
  });
});
