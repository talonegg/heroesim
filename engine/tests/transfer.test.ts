/**
 * E5-S2: Transfers. Above board — you pay a fee, the Rival consents if their Regard for
 * you allows it, and their Regard is untouched afterwards because you did it properly.
 *
 * The load-bearing claim of this file is that **a refusal is an event, not an exception**.
 * A Rival saying no, a full Roster and an empty purse are things that happened in the
 * world; only a programming error throws. Every refusal here is checked twice — once for
 * the event it emits, and once for the Career it leaves byte-identical.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  EngineError,
  newCareer,
  rivalHeroOffer,
  rivalOffers,
  serialiseCareer,
  startingAge,
  transferFee,
  transferHero,
  type Career,
  type GameEvent,
} from '../src/index.js';
import {
  firstRivalHero,
  fixtureContent,
  holdingCoin,
  rivalThinking,
} from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** A Career with coin enough for anything, so that only the rule under test can refuse. */
function wealthy(seed: string, overrides = {}): Career {
  return holdingCoin(newCareer(seed, content, overrides).career, 10_000);
}

describe('what a Transfer costs', () => {
  it('is transferFeeBase plus transferFeePerCalibre for each point of calibre', () => {
    const career = newCareer('e5-fee', content).career;
    const { config } = career;
    for (const calibre of [1, 2, 3] as const) {
      const hero = { ...firstRivalHero(career, 'r1'), calibre };
      expect(transferFee(hero, config)).toBe(100 + 50 * calibre);
    }
  });

  it('moves with both fields, at values neither of them defaults to', () => {
    const career = newCareer('e5-fee', content, {
      transferFeeBase: 7,
      transferFeePerCalibre: 11,
    }).career;
    for (const calibre of [1, 2, 3] as const) {
      const hero = { ...firstRivalHero(career, 'r1'), calibre };
      expect(transferFee(hero, career.config)).toBe(7 + 11 * calibre);
    }
  });
});

describe('the Rival’s consent', () => {
  it('is given at transferConsentRegard and withheld one point below it', () => {
    const base = wealthy('e5-consent');
    const hero = firstRivalHero(base, 'r1');
    const at = transferHero(rivalThinking(base, 'r1', base.config.transferConsentRegard), 'r1', hero.id);
    const below = transferHero(
      rivalThinking(base, 'r1', base.config.transferConsentRegard - 1),
      'r1',
      hero.id,
    );
    expect(of(at.events, 'HeroTransferred')).toHaveLength(1);
    expect(of(at.events, 'TransferRefused')).toHaveLength(0);
    expect(of(below.events, 'TransferRefused').map((event) => event.reason)).toEqual(['regard']);
    expect(of(below.events, 'HeroTransferred')).toHaveLength(0);
  });

  it('moves with the configured threshold and with nothing else', () => {
    const base = wealthy('e5-consent-2', { transferConsentRegard: -4 });
    const hero = firstRivalHero(base, 'r1');
    expect(of(transferHero(rivalThinking(base, 'r1', -4), 'r1', hero.id).events, 'HeroTransferred'))
      .toHaveLength(1);
    expect(
      of(transferHero(rivalThinking(base, 'r1', -5), 'r1', hero.id).events, 'TransferRefused').map(
        (event) => event.reason,
      ),
    ).toEqual(['regard']);
  });
});

describe('a refusal is an event, and the Career does not move', () => {
  const base = wealthy('e5-refusals');
  const hero = firstRivalHero(base, 'r1');

  const cases: [string, Career, GameEvent['type'] | 'regard' | 'coin' | 'rosterFull'][] = [
    ['the Rival will not deal with you', rivalThinking(base, 'r1', -1), 'regard'],
    ['the Guild cannot pay', holdingCoin(base, 0), 'coin'],
    [
      'the Roster is full',
      { ...base, config: { ...base.config, rosterCap: base.guild.roster.length } },
      'rosterFull',
    ],
  ];

  for (const [what, career, reason] of cases) {
    it(`says so, and leaves the Career byte-identical: ${what}`, () => {
      const before = serialiseCareer(career);
      const step = transferHero(career, 'r1', hero.id);
      expect(step.events).toHaveLength(1);
      expect(step.events[0]).toEqual({
        type: 'TransferRefused',
        day: career.day,
        rivalId: 'r1',
        heroId: hero.id,
        reason,
      });
      expect(serialiseCareer(step.career)).toBe(before);
      expect(serialiseCareer(career)).toBe(before);
    });
  }

  it('reports the one that is hardest to shift, where several hold at once', () => {
    // Consent first (the other Guild's decision), then the Roster (a fact about you no
    // coin fixes), then the coin (the most easily remedied). The player is never told to
    // find fifty coin for somebody who was never going to come.
    const all = holdingCoin(rivalThinking(base, 'r1', -1), 0);
    const allAndFull = { ...all, config: { ...all.config, rosterCap: all.guild.roster.length } };
    expect(of(transferHero(allAndFull, 'r1', hero.id).events, 'TransferRefused')[0]?.reason).toBe(
      'regard',
    );
    const fullAndPoor = holdingCoin(
      { ...base, config: { ...base.config, rosterCap: base.guild.roster.length } },
      0,
    );
    expect(of(transferHero(fullAndPoor, 'r1', hero.id).events, 'TransferRefused')[0]?.reason).toBe(
      'rosterFull',
    );
  });

  it('is answered by the selector before the coin is spent, with the same reason', () => {
    for (const [, career, reason] of cases) {
      const offer = rivalHeroOffer(career, 'r1', hero.id);
      expect(offer?.transferRefusal?.reason).toBe(reason);
      expect(offer?.transferFee).toBe(transferFee(hero, career.config));
    }
    const short = holdingCoin(base, 10);
    expect(rivalHeroOffer(short, 'r1', hero.id)?.transferRefusal).toEqual({
      reason: 'coin',
      shortfall: transferFee(hero, base.config) - 10,
    });
    expect(rivalHeroOffer(base, 'r1', hero.id)?.transferRefusal).toBeUndefined();
  });
});

describe('only a programming error throws', () => {
  const base = wealthy('e5-throws');
  const hero = firstRivalHero(base, 'r1');

  it('throws NoSuchRival for a Guild that is not in this Career', () => {
    expect(() => transferHero(base, 'r99', hero.id)).toThrow(EngineError);
    try {
      transferHero(base, 'r99', hero.id);
    } catch (thrown) {
      expect((thrown as EngineError).code).toBe('NoSuchRival');
    }
  });

  it('throws NoSuchHero for somebody who is not on that Rival’s Roster', () => {
    for (const id of ['nobody', base.guild.roster[0]?.id ?? '', firstRivalHero(base, 'r2').id]) {
      try {
        transferHero(base, 'r1', id);
        throw new Error(`expected a throw for "${id}"`);
      } catch (thrown) {
        expect((thrown as EngineError).code, id).toBe('NoSuchHero');
      }
    }
  });

  it('throws CareerEnded once there is no Career left to spend on', () => {
    const ended = advance(newCareer('e5-ended', content, { careerYears: 1, daysPerYear: 2 }).career, 10, content)
      .career;
    expect(ended.ended).toBeDefined();
    try {
      transferHero(ended, 'r1', firstRivalHero(ended, 'r1').id);
      throw new Error('expected a throw');
    } catch (thrown) {
      expect((thrown as EngineError).code).toBe('CareerEnded');
    }
    // And the selector answers with nobody at all rather than throwing mid-render.
    expect(rivalOffers(ended, 'r1')).toEqual([]);
  });
});

describe('a Transfer that goes through', () => {
  const base = wealthy('e5-transfer');
  const hero = firstRivalHero(base, 'r1');
  const fee = transferFee(hero, base.config);
  const step = transferHero(base, 'r1', hero.id);

  it('reports the transaction, then the coin, then the Roster gaining a person', () => {
    expect(step.events.map((event) => event.type)).toEqual([
      'HeroTransferred',
      'CoinChanged',
      'HeroJoined',
    ]);
    expect(of(step.events, 'HeroTransferred')[0]).toEqual({
      type: 'HeroTransferred',
      day: base.day,
      heroId: hero.id,
      fromRivalId: 'r1',
      fee,
      balance: base.guild.coin - fee,
    });
    expect(of(step.events, 'CoinChanged')[0]).toEqual({
      type: 'CoinChanged',
      day: base.day,
      delta: -fee,
      balance: base.guild.coin - fee,
      reason: 'transfer',
    });
    expect(of(step.events, 'HeroJoined')[0]).toEqual({
      type: 'HeroJoined',
      day: base.day,
      heroId: hero.id,
      name: hero.name,
      calibre: hero.calibre,
      age: hero.age,
    });
    for (const event of step.events) expect(event.day).toBe(base.day);
  });

  it('takes them off the Rival’s Roster and puts them on yours exactly once', () => {
    expect(step.career.rivals[0]?.roster.map((entry) => entry.id)).not.toContain(hero.id);
    expect(step.career.guild.roster.filter((entry) => entry.id === hero.id)).toHaveLength(1);
    expect(step.career.guild.roster).toHaveLength(base.guild.roster.length + 1);
    expect(step.career.guild.formerHeroes.map((entry) => entry.id)).not.toContain(hero.id);
  });

  it('carries their age across rather than deriving a new one from their id', () => {
    const moved = step.career.guild.roster.find((entry) => entry.id === hero.id);
    expect(moved?.age).toBe(hero.age);
    // The trap this guards: `startingAge` would hand them the age they would have STARTED
    // at (DL-17, DL-19 §6). Here the two happen to agree on the Day the world was made, so
    // the Career is aged first and the Transfer taken afterwards, where they cannot.
    const older = advance(base, base.config.daysPerYear * 3, content).career;
    const grown = firstRivalHero(older, 'r1');
    expect(grown.age).toBeGreaterThan(startingAge(older.seed, grown.id, older.config));
    const late = transferHero(holdingCoin(older, 10_000), 'r1', grown.id);
    const arrived = late.career.guild.roster.find((entry) => entry.id === grown.id);
    expect(arrived?.age).toBe(grown.age);
    expect(arrived?.age).not.toBe(startingAge(older.seed, grown.id, older.config));
  });

  it('keeps everything about the person that is not their employer', () => {
    const moved = step.career.guild.roster.find((entry) => entry.id === hero.id);
    expect(moved?.name).toBe(hero.name);
    expect(moved?.stats).toEqual(hero.stats);
    expect(moved?.traits).toEqual(hero.traits);
    expect(moved?.calibre).toBe(hero.calibre);
    expect(moved?.background).toBe(hero.background);
    expect(moved?.pronouns).toBe(hero.pronouns);
  });

  it('gives them the configured opinion of you, and no opinion of a Rival at all', () => {
    const moved = step.career.guild.roster.find((entry) => entry.id === hero.id);
    expect(moved?.regardForGuildmaster.value).toBe(base.config.transferJoiningRegard);
    expect(moved?.regardForGuildmaster.reason.length).toBeGreaterThan(0);
    expect(moved?.regardForRival).toBeUndefined();
    expect('regardForRival' in (moved ?? {})).toBe(false);

    const elsewhere = transferHero(
      wealthy('e5-transfer', { transferJoiningRegard: 3 }),
      'r1',
      hero.id,
    );
    expect(
      elsewhere.career.guild.roster.find((entry) => entry.id === hero.id)?.regardForGuildmaster
        .value,
    ).toBe(3);
  });

  it('sets the three Days and seeds Regard both ways, as taking an Applicant on does', () => {
    const moved = step.career.guild.roster.find((entry) => entry.id === hero.id);
    expect(moved?.joinedOn).toBe(step.career.day);
    expect(moved?.lastCommittedOn).toBe(step.career.day);
    expect(moved?.regardDecayedOn).toBe(step.career.day);
    for (const other of base.guild.roster) {
      expect(moved?.regardFor[other.id]?.value, other.id).toBe(
        base.config.joiningRegardAmongHeroes,
      );
      expect(
        step.career.guild.roster.find((entry) => entry.id === other.id)?.regardFor[hero.id]?.value,
        other.id,
      ).toBe(base.config.joiningRegardAmongHeroes);
    }
    expect(step.career.guild.guildmaster.regardFor[hero.id]).toBeDefined();
  });

  it('leaves the Rival’s Regard for you exactly where it was: you did it properly', () => {
    expect(step.career.rivals[0]?.regardForGuild).toEqual(base.rivals[0]?.regardForGuild);
  });

  it('pays the fee and counts one person in the ledger', () => {
    expect(step.career.guild.coin).toBe(base.guild.coin - fee);
    expect(step.career.ledger.heroesTransferredIn).toBe(1);
    expect(step.career.ledger.heroesPoachedIn).toBe(0);
    expect(step.career.ledger.heroesPoachedFromUs).toBe(0);
  });

  it('counts people once each, however many are brought over', () => {
    let career = wealthy('e5-count');
    const wanted = career.rivals[0]?.roster.slice(0, 3).map((entry) => entry.id) ?? [];
    expect(wanted.length).toBeGreaterThan(1);
    for (const id of wanted) career = transferHero(career, 'r1', id).career;
    expect(career.ledger.heroesTransferredIn).toBe(wanted.length);
    expect(new Set(career.guild.roster.map((entry) => entry.id)).size).toBe(
      career.guild.roster.length,
    );
  });

  it('never mutates the Career it was given', () => {
    const untouched = wealthy('e5-immutable');
    const before = serialiseCareer(untouched);
    transferHero(untouched, 'r1', firstRivalHero(untouched, 'r1').id);
    expect(serialiseCareer(untouched)).toBe(before);
  });
});

describe('the offers a front end reads', () => {
  it('lists everybody on one Rival’s Roster with both fees', () => {
    const career = wealthy('e5-offers');
    const offers = rivalOffers(career, 'r1');
    expect(offers.map((offer) => offer.hero.id)).toEqual(
      career.rivals[0]?.roster.map((hero) => hero.id),
    );
    for (const offer of offers) {
      expect(offer.rivalId).toBe('r1');
      expect(offer.transferFee).toBe(transferFee(offer.hero, career.config));
      expect(offer.poachFee).toBeLessThan(offer.transferFee);
    }
  });

  it('offers nobody for a Rival that is not in this Career', () => {
    expect(rivalOffers(wealthy('e5-offers'), 'r99')).toEqual([]);
    expect(rivalHeroOffer(wealthy('e5-offers'), 'r99', 'anybody')).toBeUndefined();
  });
});
