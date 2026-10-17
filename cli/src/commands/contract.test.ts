// `renew`, `release`, and the Contract in `show roster`, `show hero`, `show guilds` and `show offers` end to
// end (DL-323): `main` run in-process against a real save in a temporary directory, with the real content
// set, as transfer.test.ts runs the Transfer commands.

import { applyAction, defaultConfig, nextWagesDay, type Hero, type HeroId } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { nightOf } from '@heroesim/engine/testing';
import { coinWords } from '@heroesim/words';
import { describe, expect, test } from 'vitest';
import { exitCodes, playground, rowOf, thePlayer } from '../play.test-support.js';
import { releaseHero } from './contract.js';

const content = loadContent();

const { play, document, edit, saved } = playground('heroesim-contract-', content);

/** A new world from seed `demo`; the player's first two Heroes, and how the CLI calls one. */
function newWorld(): { first: HeroId; second: HeroId; called: (heroId: HeroId) => string } {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const [first, second] = thePlayer(document().world).rosterIds as [HeroId, HeroId];
  return { first, second, called: (heroId) => `${document().world.heroes[heroId]?.name} (${heroId})` };
}

/** The Hero `heroId` of the save. */
function heroOf(heroId: HeroId): Hero {
  return document().world.heroes[heroId] as Hero;
}

/** Ends the Contract of `heroId` on the night of Day 2, which the world then stands on; no other Contract has ended by it. */
function outOfContract(heroId: HeroId): void {
  edit((edited) => {
    for (const hero of Object.values(edited.world.heroes)) {
      if (hero.contract !== null) hero.contract = { ...hero.contract, endDay: hero.id === heroId ? 1 : Math.max(hero.contract.endDay, 5) };
    }
    edited.world.turn = nightOf(1);
  });
}

/** Leaves only `heroId` on the player's Roster, the rest in the pool. */
function onlyHero(heroId: HeroId): void {
  edit((edited) => {
    const player = thePlayer(edited.world);
    for (const id of player.rosterIds.filter((each) => each !== heroId)) {
      Object.assign(edited.world.heroes[id] as Hero, { guildId: null, unattachedSince: 0, contract: null });
    }
    player.rosterIds = [heroId];
  });
}

describe('renew', () => {
  test('signs the Hero again for the years given, at the wage the rule gives, no fee, says it as the History does, and saves', () => {
    const { first, called } = newWorld();
    const before = thePlayer(document().world).wealth;

    const run = play(['renew', '--hero', first, '--years', '3']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    const { contract } = heroOf(first);
    expect(contract).toMatchObject({ years: 3, signedOnTurn: 0, endDay: 1080 });
    expect(run.out).toContain(`The Test signed ${called(first)} again, on a Contract at ${coinWords(contract?.wage ?? 0)} to Year 4 Day 1.`);
    expect(thePlayer(document().world).wealth).toBe(before);
  });

  test('withdraws a free Offer for a Hero Out of Contract, saying so, after show offers has marked it Free', () => {
    const { first } = newWorld();
    outOfContract(first);
    edit((edited) => {
      const rival = Object.values(edited.world.guilds).find((guild) => guild.id !== thePlayer(edited.world).id);
      if (rival === undefined) throw new Error('no Rival');
      rival.wealth = 100_000;
      const offered = applyAction(edited, { kind: 'offerTransfer', guildId: rival.id, heroId: first, years: 2 }, { config: { ...defaultConfig, ...edited.meta.config }, content });
      if (!offered.ok) throw new Error(offered.rejection.reason);
      Object.assign(edited, { world: offered.document.world, history: offered.document.history });
    });
    expect(play(['show', 'offers']).out).toMatch(/\bFree\b/);

    const run = play(['renew', '--hero', first, '--years', '1']);

    expect(run.code).toBe(exitCodes.ok);
    expect(run.out).toContain("was withdrawn: the Hero's Contract was renewed.");
    expect(play(['show', 'offers']).out).toContain("No Transfer Offer stands for The Test's Heroes.");
  });

  test('refuses a length the rules do not offer and a Hero not on the Roster, in the refusals’ words, writing nothing', () => {
    const { first } = newWorld();
    const before = saved();

    expect(play(['renew', '--hero', first, '--years', '7'])).toMatchObject({ code: exitCodes.refused, err: expect.stringContaining('1, 2 or 3') });
    const theirs = Object.values(document().world.guilds).find((guild) => guild.id !== thePlayer(document().world).id)?.rosterIds[0] as string;
    expect(play(['renew', '--hero', theirs, '--years', '1']).err).toMatch(/is not on The Test's Roster \(show roster\)\.\n$/);
    expect(saved()).toBe(before);
  });
});

describe('transfer --to of a Hero Out of Contract (DL-325)', () => {
  test('is refused in the refusal’s words with no free Offer, writing nothing; to the Guild whose Offer stands, the Hero goes for no fee', () => {
    const { first, called } = newWorld();
    outOfContract(first);
    const [bidder, other] = Object.values(document().world.guilds).filter((guild) => guild.id !== thePlayer(document().world).id);
    if (bidder === undefined || other === undefined) throw new Error('two Rivals are needed');
    edit((edited) => {
      const offered = applyAction(edited, { kind: 'offerTransfer', guildId: bidder.id, heroId: first, years: 2 }, { config: { ...defaultConfig, ...edited.meta.config }, content });
      if (!offered.ok) throw new Error(offered.rejection.reason);
      Object.assign(edited, { world: offered.document.world, history: offered.document.history });
    });
    const before = saved();
    const wealth = thePlayer(document().world).wealth;

    expect(play(['transfer', '--hero', first, '--to', other.id])).toMatchObject({
      code: exitCodes.refused,
      err: `${other.name} has no Offer standing for ${called(first)}, who is Out of Contract: they go to another Guild only on its Offer, for no fee, or are released to the Unattached pool (show offers).\n`,
    });
    expect(saved()).toBe(before);

    const run = play(['transfer', '--hero', first, '--to', bidder.id]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain(`took ${called(first)} from The Test for 0 Silver, accepting `);
    expect(heroOf(first).guildId).toBe(bidder.id);
    expect(thePlayer(document().world).wealth).toBe(wealth);
    expect(play(['show', 'offers']).out).toContain("No Transfer Offer stands for The Test's Heroes.");
  });
});

describe('release', () => {
  test('lets the Hero go, the Guild paying its share of the wages left, and saves', () => {
    const { first, called } = newWorld();
    const before = thePlayer(document().world).wealth;
    const { wage, endDay } = heroOf(first).contract as NonNullable<Hero['contract']>;
    // The wage charges still to come before the end Day, counted from the first.
    const charges = Math.floor((endDay - 1 - nextWagesDay(0, defaultConfig)) / defaultConfig.upkeepEveryDays) + 1;
    const payout = Math.floor(defaultConfig.releasePayoutFactor * wage * charges);

    const run = play(['release', '--hero', first]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain(`The Test released ${called(first)}, paying ${coinWords(payout)}.`);
    expect(thePlayer(document().world).wealth).toBe(before - payout);
    expect(thePlayer(document().world).rosterIds).not.toContain(first);
    expect(heroOf(first).guildId).toBeNull();
  });

  test('pays nothing once the Contract has ended', () => {
    const { first, called } = newWorld();
    outOfContract(first);
    const before = thePlayer(document().world).wealth;

    const run = play(['release', '--hero', first]);

    expect(run.out).toContain(`The Test released ${called(first)}, with no payout.`);
    expect(thePlayer(document().world).wealth).toBe(before);
  });

  test("the Guild's last Hero is warned for, as an estimate, and released only with --confirm; nothing is written without it", () => {
    const { first, called } = newWorld();
    onlyHero(first);
    const before = saved();

    const warned = play(['release', '--hero', first]);

    expect(warned.code).toBe(exitCodes.refused);
    expect(warned.err).toContain(`${called(first)} is your Guild's last Hero. Releasing them pays `);
    expect(warned.err).toMatch(/(short of|which covers) the cheapest signing fee, /);
    expect(warned.err).toContain('Add --confirm to release them.');
    expect(saved()).toBe(before);

    const done = play(['release', '--hero', first, '--confirm']);
    expect(done).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(thePlayer(document().world).rosterIds).toEqual([]);
  });

  test("the Guild's last Hero away is refused as away, with no warning asking for --confirm", () => {
    const { first } = newWorld();
    onlyHero(first);
    const away = structuredClone(document());
    (away.world.heroes[first] as Hero).partyId = 'party-000001' as never;

    const outcome = releaseHero({ name: 'release', save: 'current', hero: first, confirm: false }, away, { config: { ...defaultConfig, ...away.meta.config }, content });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.problem).toMatch(/is away with a Party \(party-000001\); a Hero is released only in the Hall\.$/);
  });

  test('--confirm is harmless where there is no warning, and a Hero of no Roster is refused in the refusals’ words', () => {
    const { first } = newWorld();
    expect(play(['release', '--hero', first, '--confirm']).code).toBe(exitCodes.ok);

    const again = play(['release', '--hero', first]);

    expect(again.code).toBe(exitCodes.refused);
    expect(again.err).toMatch(/is not on The Test's Roster \(show roster\)\.\n$/);
  });
});

describe('the Contract in show', () => {
  test('show roster gives each Hero the Days left, or Out of Contract', () => {
    const { first, second } = newWorld();
    outOfContract(first);
    const endDay = (heroOf(second).contract as NonNullable<Hero['contract']>).endDay;

    const roster = play(['show', 'roster']).out;

    expect(roster.split('\n').find((line) => line.startsWith('Id'))).toMatch(/\bContract\b/);
    expect(rowOf(roster, first)).toContain('Out of Contract');
    // The world stands on the night of Day 2, so one Day of its Contract has gone.
    expect(rowOf(roster, second)).toContain(`${endDay - 1} Days left`);
  });

  test('show hero gives the Contract', () => {
    const { first } = newWorld();
    expect(play(['show', 'hero', first]).out).toMatch(/^Contract +\d+ Days left$/m);
  });

  test("show guilds gives each Guild's Heroes Out of Contract as its last column", () => {
    const { first } = newWorld();
    outOfContract(first);

    const guilds = play(['show', 'guilds']).out.split('\n');
    const header = guilds.find((line) => line.startsWith('Id')) ?? '';
    const rows = guilds.filter((line) => /^guild-/.test(line));

    expect(header.trimEnd().endsWith('Out of Contract')).toBe(true);
    expect(rows.filter((line) => line.includes('The Test')).map((line) => line.trimEnd().slice(-1))).toEqual(['1']);
    expect(rows.filter((line) => !line.includes('The Test')).every((line) => line.trimEnd().endsWith('0'))).toBe(true);
  });

  test('show keeps its two charge lines, the wages those of the Contracts', () => {
    newWorld();

    const out = play(['show']).out;

    expect(out).toMatch(/^Wages .+ every 10 Days, next paid on /m);
    expect(out).toMatch(/^Hall upkeep .+ every \d+ Days, next paid on /m);
    expect(out).not.toContain('Treasury');
  });
});
