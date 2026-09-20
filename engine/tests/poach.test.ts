/**
 * E5-S3: Poaching, and the bill it runs up.
 *
 * Cheaper than a Transfer, and it needs the Hero's own Regard for the Guild paying them to
 * have soured — the same predicate a soured Rival uses against your Roster, applied the
 * other way (`isPoachable`, E5-S4). The Rival is not asked, and their Regard for you falls
 * for it, which is felt on your Board rather than in your purse (E5-S5).
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  EngineError,
  isPoachable,
  newCareer,
  poachFee,
  poachHero,
  rivalHeroOffer,
  rivalOffers,
  serialiseCareer,
  transferFee,
  transferHero,
  type Career,
  type GameEvent,
} from '../src/index.js';
import {
  firstRivalHero,
  fixtureContent,
  holdingCoin,
  rivalHeroThinking,
  rivalThinking,
} from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

function wealthy(seed: string, overrides = {}): Career {
  return holdingCoin(newCareer(seed, content, overrides).career, 10_000);
}

describe('what a Poaching costs', () => {
  it('is the Transfer fee times poachFeeFactor, rounded', () => {
    const career = newCareer('e5-poach-fee', content).career;
    for (const calibre of [1, 2, 3] as const) {
      const hero = { ...firstRivalHero(career, 'r1'), calibre };
      expect(poachFee(hero, career.config)).toBe(
        Math.round(transferFee(hero, career.config) * career.config.poachFeeFactor),
      );
    }
    // At the shipped numbers: 150 / 200 / 250 becomes 75 / 100 / 125, and every one of
    // them is strictly cheaper than the Transfer it stands against.
    expect([1, 2, 3].map((calibre) =>
      poachFee({ ...firstRivalHero(career, 'r1'), calibre: calibre as 1 | 2 | 3 }, career.config),
    )).toEqual([75, 100, 125]);
    expect([1, 2, 3].map((calibre) =>
      transferFee({ ...firstRivalHero(career, 'r1'), calibre: calibre as 1 | 2 | 3 }, career.config),
    )).toEqual([150, 200, 250]);
  });

  it('is cheaper than the equivalent Transfer for every calibre, at every factor under one', () => {
    // A property test rather than three examples: the claim E5-S3 makes is about the whole
    // of the range, and the two fee fields and the factor are all config.
    //
    // Two claims, because rounding makes them different claims. At any factor below one a
    // Poaching is **never dearer**, whatever the fees are — including the degenerate ones
    // where a Transfer costs a coin or two and the rounding has nowhere below it to go
    // (`round(1 × 0.5)` is 1). At any fee the game can actually be played at it is
    // **strictly cheaper**, which is what E5-S3 means by "half fee".
    const factors = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
    const fees: [number, number][] = [
      [0, 1],
      [0, 2],
      [1, 1],
      [0, 50],
      [40, 17],
      [100, 50],
      [333, 120],
    ];
    for (const factor of factors) {
      for (const [base, perCalibre] of fees) {
        const career = newCareer('e5-property', content, {
          poachFeeFactor: factor,
          transferFeeBase: base,
          transferFeePerCalibre: perCalibre,
        }).career;
        for (const calibre of [1, 2, 3] as const) {
          const hero = { ...firstRivalHero(career, 'r1'), calibre };
          const full = transferFee(hero, career.config);
          const cheap = poachFee(hero, career.config);
          const where = `calibre ${calibre} at ${factor} × (${base} + ${perCalibre} × calibre)`;
          expect(cheap).toBe(Math.round(full * factor));
          expect(cheap, where).toBeLessThanOrEqual(full);
          // A Transfer of at least fifty coin, at a factor of nine tenths or less: the
          // whole of the space the game is balanced in, and it is strictly cheaper across
          // every point of it.
          if (full >= 50 && factor <= 0.9) expect(cheap, where).toBeLessThan(full);
        }
      }
    }
  });
});

describe('who can be approached', () => {
  const base = wealthy('e5-poachable');
  const hero = firstRivalHero(base, 'r1');

  it('cannot be poached at −1 and can be at −2, and the boundary is pinned', () => {
    const contented = poachHero(rivalHeroThinking(base, hero.id, -1), 'r1', hero.id);
    expect(of(contented.events, 'TransferRefused').map((event) => event.reason)).toEqual([
      'heroRegard',
    ]);
    expect(of(contented.events, 'HeroPoached')).toHaveLength(0);

    const soured = poachHero(rivalHeroThinking(base, hero.id, -2), 'r1', hero.id);
    expect(of(soured.events, 'HeroPoached')).toHaveLength(1);
    expect(of(soured.events, 'TransferRefused')).toHaveLength(0);
  });

  it('moves with poachRegardThreshold and with nothing else', () => {
    const strict = wealthy('e5-poachable', { poachRegardThreshold: -4 });
    expect(
      of(poachHero(rivalHeroThinking(strict, hero.id, -3), 'r1', hero.id).events, 'TransferRefused')
        .map((event) => event.reason),
    ).toEqual(['heroRegard']);
    expect(
      of(poachHero(rivalHeroThinking(strict, hero.id, -4), 'r1', hero.id).events, 'HeroPoached'),
    ).toHaveLength(1);
  });

  it('is decided by the one predicate, which gives the mirror answer with the arguments swapped', () => {
    // The whole symmetry the design rests on, in one line: `isPoachable` knows nothing
    // about which direction it is being asked in (E5-S4).
    const { config } = base;
    for (const value of [-5, -4, -3, -2, -1, 0, 1, 5]) {
      const mine = { value, reason: 'what I think of the Guildmaster', nature: 'neutral' as const };
      const theirs = { value, reason: 'what they think of their Rival', nature: 'neutral' as const };
      expect(isPoachable(mine, config), `mine at ${value}`).toBe(isPoachable(theirs, config));
      expect(isPoachable(mine, config)).toBe(value <= config.poachRegardThreshold);
    }
  });

  it('never asks the Rival: a Guild that will not deal with you can still be poached from', () => {
    const hostile = rivalHeroThinking(rivalThinking(base, 'r1', -5), hero.id, -3);
    // A Transfer is refused for want of consent...
    expect(of(transferHero(hostile, 'r1', hero.id).events, 'TransferRefused')[0]?.reason).toBe(
      'regard',
    );
    // ...and a Poaching goes through anyway, which is the whole point of it.
    expect(of(poachHero(hostile, 'r1', hero.id).events, 'HeroPoached')).toHaveLength(1);
  });

  it('still refuses for a full Roster and for want of coin, byte-identically', () => {
    const soured = rivalHeroThinking(base, hero.id, -3);
    const poor = holdingCoin(soured, 0);
    const full = { ...soured, config: { ...soured.config, rosterCap: soured.guild.roster.length } };
    for (const [career, reason] of [
      [poor, 'coin'],
      [full, 'rosterFull'],
    ] as const) {
      const before = serialiseCareer(career);
      const step = poachHero(career, 'r1', hero.id);
      expect(step.events).toHaveLength(1);
      expect(of(step.events, 'TransferRefused')[0]?.reason).toBe(reason);
      expect(serialiseCareer(step.career)).toBe(before);
    }
  });

  it('throws for an unknown Rival, an unknown Hero and an ended Career, and nothing else', () => {
    for (const [rivalId, heroId, code] of [
      ['r99', hero.id, 'NoSuchRival'],
      ['r1', 'nobody', 'NoSuchHero'],
    ] as const) {
      try {
        poachHero(base, rivalId, heroId);
        throw new Error('expected a throw');
      } catch (thrown) {
        expect((thrown as EngineError).code).toBe(code);
      }
    }

    // The third of the three the title claims, which this block did not once construct
    // (finding F9, DL-22). The Career is run past its own Retirement Day and the same call
    // is made against it, exactly as `transfer.test.ts` does for the other direction.
    const ended = advance(
      newCareer('e5-poach-ended', content, { careerYears: 1, daysPerYear: 2 }).career,
      10,
      content,
    ).career;
    expect(ended.ended).toBeDefined();
    try {
      poachHero(ended, 'r1', firstRivalHero(ended, 'r1').id);
      throw new Error('expected a throw');
    } catch (thrown) {
      expect((thrown as EngineError).code).toBe('CareerEnded');
    }
    // And the selector answers with nobody at all rather than throwing mid-render.
    expect(rivalOffers(ended, 'r1')).toEqual([]);
  });

  it('is answered by the selector before the coin is spent', () => {
    expect(rivalHeroOffer(rivalHeroThinking(base, hero.id, -1), 'r1', hero.id)?.poachRefusal)
      .toEqual({ reason: 'heroRegard' });
    expect(rivalHeroOffer(rivalHeroThinking(base, hero.id, -3), 'r1', hero.id)?.poachRefusal)
      .toBeUndefined();
    const short = holdingCoin(rivalHeroThinking(base, hero.id, -3), 10);
    expect(rivalHeroOffer(short, 'r1', hero.id)?.poachRefusal).toEqual({
      reason: 'coin',
      shortfall: poachFee(hero, base.config) - 10,
    });
  });
});

describe('a Poaching that goes through', () => {
  const base = wealthy('e5-poach');
  const hero = firstRivalHero(base, 'r1');
  const soured = rivalHeroThinking(base, hero.id, -3);
  const fee = poachFee(hero, base.config);
  const step = poachHero(soured, 'r1', hero.id);

  it('reports the transaction, then the coin, then the Roster gaining a person', () => {
    expect(step.events.map((event) => event.type)).toEqual([
      'HeroPoached',
      'CoinChanged',
      'HeroJoined',
    ]);
    expect(of(step.events, 'CoinChanged')[0]?.reason).toBe('poach');
    expect(of(step.events, 'CoinChanged')[0]?.delta).toBe(-fee);
  });

  it('carries the fee, the Regard it cost and the Regard it left behind', () => {
    const poached = of(step.events, 'HeroPoached')[0];
    expect(poached).toEqual({
      type: 'HeroPoached',
      day: soured.day,
      heroId: hero.id,
      fromRivalId: 'r1',
      fee,
      balance: soured.guild.coin - fee,
      rivalRegardDelta: -base.config.poachRivalRegardCost,
      rivalRegardValue: base.config.rivalStartingRegard - base.config.poachRivalRegardCost,
    });
  });

  it('sours the Rival by the configured cost, with the reason recorded', () => {
    expect(step.career.rivals[0]?.regardForGuild.value).toBe(
      base.config.rivalStartingRegard - base.config.poachRivalRegardCost,
    );
    expect(step.career.rivals[0]?.regardForGuild.reason).toBe('you took somebody off their Roster');
    // And nobody else is touched by it.
    for (const rival of step.career.rivals.slice(1)) {
      expect(rival.regardForGuild.value, rival.id).toBe(base.config.rivalStartingRegard);
    }
  });

  it('moves with poachRivalRegardCost, at a value it does not default to', () => {
    const dearer = wealthy('e5-poach', { poachRivalRegardCost: 1 });
    const step2 = poachHero(rivalHeroThinking(dearer, hero.id, -3), 'r1', hero.id);
    expect(step2.career.rivals[0]?.regardForGuild.value).toBe(-1);
    expect(of(step2.events, 'HeroPoached')[0]?.rivalRegardDelta).toBe(-1);
  });

  it('sours them twice over for a second one, and clamps at the bottom of the scale', () => {
    let career = wealthy('e5-poach-twice');
    const roster = career.rivals[0]?.roster.map((entry) => entry.id) ?? [];
    expect(roster.length).toBeGreaterThan(2);
    for (const id of roster) career = rivalHeroThinking(career, id, -5);

    const one = poachHero(career, 'r1', roster[0] ?? '');
    expect(one.career.rivals[0]?.regardForGuild.value).toBe(-3);
    const two = poachHero(one.career, 'r1', roster[1] ?? '');
    expect(two.career.rivals[0]?.regardForGuild.value).toBe(-5);
    expect(of(two.events, 'HeroPoached')[0]?.rivalRegardDelta).toBe(-2);

    // A third finds the scale already at its floor: nothing moves, and the move still goes
    // through. `HeroPoached` reports the delta that actually landed, which is none.
    const three = poachHero(two.career, 'r1', roster[2] ?? '');
    expect(three.career.rivals[0]?.regardForGuild.value).toBe(career.config.regardMin);
    expect(of(three.events, 'HeroPoached')[0]?.rivalRegardDelta).toBe(0);
    expect(of(three.events, 'HeroPoached')[0]?.rivalRegardValue).toBe(career.config.regardMin);
  });

  it('moves the person exactly as a Transfer does, for less coin', () => {
    const moved = step.career.guild.roster.find((entry) => entry.id === hero.id);
    expect(moved?.age).toBe(hero.age);
    expect(moved?.calibre).toBe(hero.calibre);
    expect(moved?.regardForGuildmaster.value).toBe(base.config.transferJoiningRegard);
    expect(moved?.regardForRival).toBeUndefined();
    expect(moved?.joinedOn).toBe(step.career.day);
    expect(step.career.rivals[0]?.roster.map((entry) => entry.id)).not.toContain(hero.id);
    expect(fee).toBeLessThan(transferFee(hero, base.config));
  });

  it('counts one person in the ledger, and not as a Transfer', () => {
    expect(step.career.ledger.heroesPoachedIn).toBe(1);
    expect(step.career.ledger.heroesTransferredIn).toBe(0);
  });
});
