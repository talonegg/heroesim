import { describe, expect, test } from 'vitest';
import { createWorld } from '../create.js';
import { makeId, type Guild, type Hero, type HeroId, type WorldDocument } from '../document.js';
import { count } from '../history.js';
import { playerGuild, signingFee, unattachedHeroes } from '../selectors.js';
import { serialise } from '../serialise.js';
import { testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import type { RecruitRejection } from './recruit.js';
import type { ActionResult } from './result.js';

// Recruiting from the Unattached pool (DL-27).

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
// Negotiation still: these tests watch the fee a recruit pays, at the list price; the
// Guildmaster's Negotiation on it is tested with the other Guildmaster Stats (guildmaster.test.ts).
const deps = testDeps({ negotiationRange: 0 });

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

    const result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId: hero.id }, deps);

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

    const result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId: hero.id }, deps);

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

  test('is the same rule for a Rival (ADR-0002)', () => {
    const { document, rival, hero } = scene();
    const fee = signingFee(hero, deps);

    const result = applyAction(document, { kind: 'recruit', guildId: rival.id, heroId: hero.id }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[rival.id]?.wealth).toBe(rival.wealth - fee);
    expect(world.guilds[rival.id]?.rosterIds.at(-1)).toBe(hero.id);
  });

  test('recruits with Wealth exactly equal to the fee, leaving none', () => {
    const { document, guild, hero } = scene();
    guild.wealth = signingFee(hero, deps);

    const result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId: hero.id }, deps);

    expect(result.ok && result.document.world.guilds[guild.id]?.wealth).toBe(0);
  });

});

describe('recruit refuses, never throwing and changing nothing', () => {
  /** Recruits `heroId` for `guildId` in `document`, asserting it neither throws nor changes anything. */
  function refused(document: WorldDocument, guild: Guild, heroId: HeroId): RecruitRejection {
    const saved = serialise(document);
    const entries = document.history.entries.length;
    let result: ActionResult<RecruitRejection> | undefined;
    expect(() => (result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId }, deps))).not.toThrow();
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

describe('recruit and Fame (R10 as amended, pre-M0 review B4)', () => {
  // Pinned: the default may be tuned (INPUTS 5.6), these tests are written against 10.
  const gated = testDeps({ fameRequiredPerLevel: 10, negotiationRange: 0 });

  /** Recruits `hero` for `guild` under `gated`, asserting the document when it succeeds. */
  function sign(document: WorldDocument, guild: Guild, hero: Hero) {
    const result = applyAction(document, { kind: 'recruit', guildId: guild.id, heroId: hero.id }, gated);
    if (result.ok) withValid(result.document, gated);
    return result;
  }

  test.each(['player', 'rival'] as const)(
    "the %s's Guild at Fame 0 is refused by a Level 5 Hero and accepted by a Level 1 Hero; raising Fame past the threshold flips the refusal",
    (whose) => {
      const { document, guild: player, rival, hero } = scene(`fame-${whose}`);
      const guild = whose === 'player' ? player : rival;
      const [, other] = unattachedHeroes(document.world);
      if (other === undefined) throw new Error('A pool of one');
      guild.fame = 0;
      guild.wealth = 100_000;
      hero.level = 5;
      const saved = serialise(document);

      const refused = sign(document, guild, hero);
      expect(refused).toEqual({
        ok: false,
        rejection: { action: 'recruit', reason: 'signing-refused', heroId: hero.id, fameRequired: 40, fame: 0, shortfall: 40 },
      });
      expect(serialise(document)).toBe(saved);

      expect(other.level).toBe(1);
      expect(sign(document, guild, other).ok).toBe(true);

      guild.fame = 39;
      expect(sign(document, guild, hero)).toMatchObject({ ok: false, rejection: { reason: 'signing-refused', shortfall: 1 } });
      guild.fame = 40;
      const accepted = sign(document, guild, hero);
      if (!accepted.ok) throw new Error(`Refused: ${accepted.rejection.reason}`);
      expect(accepted.document.world.heroes[hero.id]?.guildId).toBe(guild.id);
    },
  );

  test('the Hero refuses before the fee is asked: signing-refused over insufficient-wealth, guild-folded over both', () => {
    const { document, rival, hero } = scene('fame-order');
    hero.level = 5;
    rival.fame = 0;
    rival.wealth = 0;

    expect(sign(document, rival, hero)).toMatchObject({ ok: false, rejection: { reason: 'signing-refused' } });
    rival.foldedOnTurn = 0;
    expect(sign(document, rival, hero)).toMatchObject({ ok: false, rejection: { reason: 'guild-folded' } });
  });
});

describe('recruit throws on a programming error', () => {
  test('a Guild id the world does not hold, changing nothing', () => {
    const { document, hero } = scene();
    const saved = serialise(document);

    expect(() => applyAction(document, { kind: 'recruit', guildId: makeId('guilds', 99), heroId: hero.id }, deps)).toThrow(RangeError);
    expect(serialise(document)).toBe(saved);
  });
});
