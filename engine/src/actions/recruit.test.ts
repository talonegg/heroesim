import { describe, expect, test } from 'vitest';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type HeroId, type WorldDocument } from '../document.js';
import { count } from '../history.js';
import { playerGuild, signingFee, unattachedHeroes } from '../selectors.js';
import { serialise } from '../serialise.js';
import { testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import { recruit, type RecruitRejection } from './recruit.js';

// M2-S8: recruiting from the Unattached pool (DL-27).

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const deps = testDeps();

interface Scene {
  document: WorldDocument;
  guild: Guild;
  rival: Guild;
  hero: Hero;
}

/** A new world, its player's and first Rival's Guilds, and the first Hero in the pool. */
function scene(seed = 'recruit'): Scene {
  const { document } = createWorld(seed, setup, deps);
  const guild = playerGuild(document.world);
  const rival = Object.values(document.world.guilds).find((each) => each.controller.kind === 'rival');
  const [hero] = unattachedHeroes(document.world);
  if (guild === undefined || rival === undefined || hero === undefined) throw new Error('The world is incomplete');
  return { document, guild, rival, hero };
}

describe('recruit', () => {
  test('deducts exactly the signing fee and moves the Hero from the pool to the Roster; the validator accepts', () => {
    const { document, guild, hero } = scene();
    const fee = signingFee(hero, deps);
    const wealth = guild.wealth;
    const roster = [...guild.rosterIds];

    const result = recruit(document, { guildId: guild.id, heroId: hero.id }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(fee).toBeGreaterThan(0);
    expect(world.guilds[guild.id]?.wealth).toBe(wealth - fee);
    expect(world.guilds[guild.id]?.rosterIds).toEqual([...roster, hero.id]);
    expect(world.heroes[hero.id]).toMatchObject({ guildId: guild.id, unattachedSince: null, leftPoolOnTurn: null });
    expect(unattachedHeroes(world).map((each) => each.id)).not.toContain(hero.id);
    // Nothing else moves: every other Guild's Wealth and Roster, every other Hero.
    const others = (w: WorldDocument['world']) => ({
      guilds: Object.values(w.guilds).filter((each) => each.id !== guild.id),
      heroes: Object.values(w.heroes).filter((each) => each.id !== hero.id),
    });
    expect(others(world)).toEqual(others(document.world));
  });

  test('emits hero.recruited, a Milestone naming the Hero and the Guild, and appends it to the History', () => {
    const { document, guild, hero } = scene();
    const fee = signingFee(hero, deps);

    const result = recruit(document, { guildId: guild.id, heroId: hero.id }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: 'hero.recruited',
        participants: [hero.id, guild.id],
        labels: { [hero.id]: hero.name, [guild.id]: guild.name },
        milestone: true,
        payload: { heroId: hero.id, guildId: guild.id, fee },
      },
    ]);
    const { history } = result.document;
    expect(history.entries.at(-1)).toBe(result.events[0]);
    expect(history.milestones.at(-1)).toBe(history.entries.length - 1);
    expect(count(history, 'hero.recruited')).toBe(1);
  });

  test("gives a new world and leaves the input's as it was, sharing meta and the History", () => {
    const { document, guild, hero } = scene();
    const before = structuredClone(document.world);

    const result = recruit(document, { guildId: guild.id, heroId: hero.id }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    expect(result.document.world).not.toBe(document.world);
    expect(document.world).toEqual(before);
    expect(result.document.meta).toBe(document.meta);
    expect(result.document.history).toBe(document.history);
  });

  test('is the same rule for a Rival (ADR-0002)', () => {
    const { document, rival, hero } = scene();
    const fee = signingFee(hero, deps);

    const result = recruit(document, { guildId: rival.id, heroId: hero.id }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[rival.id]?.wealth).toBe(rival.wealth - fee);
    expect(world.guilds[rival.id]?.rosterIds.at(-1)).toBe(hero.id);
  });

  test('recruits with Wealth exactly equal to the fee, leaving none', () => {
    const { document, guild, hero } = scene();
    guild.wealth = signingFee(hero, deps);

    const result = recruit(document, { guildId: guild.id, heroId: hero.id }, deps);

    expect(result.ok && result.document.world.guilds[guild.id]?.wealth).toBe(0);
  });

  test('is what applyAction does with a recruit action', () => {
    const one = scene('apply');
    const two = scene('apply');

    const direct = recruit(one.document, { guildId: one.guild.id, heroId: one.hero.id }, deps);
    const applied = applyAction(two.document, { kind: 'recruit', guildId: two.guild.id, heroId: two.hero.id }, deps);

    expect(applied.ok && serialise(applied.document)).toBe(direct.ok && serialise(direct.document));
  });
});

describe('recruit refuses, never throwing and changing nothing', () => {
  /** Recruits `heroId` for `guildId` in `document`, asserting it neither throws nor changes anything. */
  function refused(document: WorldDocument, guild: Guild, heroId: HeroId): RecruitRejection {
    const saved = serialise(document);
    const entries = document.history.entries.length;
    let result: ReturnType<typeof recruit> | undefined;
    expect(() => (result = recruit(document, { guildId: guild.id, heroId }, deps))).not.toThrow();
    expect(serialise(document)).toBe(saved);
    expect(document.history.entries).toHaveLength(entries);
    if (result === undefined || result.ok) throw new Error('Recruited, where a refusal was expected');
    return result.rejection;
  }

  test('hero-not-unattached: a Hero on a Roster', () => {
    const { document, guild, rival } = scene();
    const onRoster = rival.rosterIds[0] as HeroId;

    expect(refused(document, guild, onRoster)).toEqual({ action: 'recruit', reason: 'hero-not-unattached', heroId: onRoster });
  });

  test('hero-not-unattached: a Hero who left the pool and whose row stayed', () => {
    const { document, guild, hero } = scene();
    Object.assign(hero, { unattachedSince: null, leftPoolOnTurn: 0 });

    expect(refused(document, guild, hero.id)).toEqual({ action: 'recruit', reason: 'hero-not-unattached', heroId: hero.id });
  });

  test('hero-not-unattached: a Hero with no row, gone from the pool or never there', () => {
    const { document, guild } = scene();
    const nobody = makeId('heroes', 999);

    expect(refused(document, guild, nobody)).toEqual({ action: 'recruit', reason: 'hero-not-unattached', heroId: nobody });
  });

  test('insufficient-wealth: Wealth one below the fee, naming both', () => {
    const { document, guild, hero } = scene();
    const fee = signingFee(hero, deps);
    guild.wealth = fee - 1;

    expect(refused(document, guild, hero.id)).toEqual({
      action: 'recruit',
      reason: 'insufficient-wealth',
      fee,
      wealth: fee - 1,
    });
  });

  test('insufficient-wealth: Wealth below zero', () => {
    const { document, guild, hero } = scene();
    guild.wealth = -20;

    expect(refused(document, guild, hero.id)).toMatchObject({ reason: 'insufficient-wealth', wealth: -20 });
  });

  test('guild-folded: a Guild that has folded signs no one, whatever its Wealth', () => {
    const { document, rival, hero } = scene();
    rival.foldedOnTurn = 0;
    rival.wealth = 10_000;

    expect(refused(document, rival, hero.id)).toEqual({ action: 'recruit', reason: 'guild-folded', guildId: rival.id });
  });
});

describe('recruit throws on a programming error', () => {
  test('a Guild id the world does not hold, changing nothing', () => {
    const { document, hero } = scene();
    const saved = serialise(document);

    expect(() => recruit(document, { guildId: makeId('guilds', 99), heroId: hero.id }, deps)).toThrow(RangeError);
    expect(serialise(document)).toBe(saved);
  });
});
