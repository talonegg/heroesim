/**
 * E5-S4: retaliation, by exactly the same rule.
 *
 * A soured Rival poaches from you, targeting the Heroes whose Regard for the Guildmaster
 * has fallen — the same predicate you poach by, applied the other way. **Regard is what
 * defends your Roster**, and a Hero is never taken from a Regard the player has not
 * watched fall: the event carries the number that made them takeable.
 *
 * This file also pins the order the settling runs in at a Board refresh, because that
 * order is what decides whether a Hero the drift has just soured can be taken today, and
 * whether one old enough to retire leaves well or is taken first.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  commitParty,
  hasRoomForAnother,
  isPoachable,
  newCareer,
  retaliationRisks,
  serialiseCareer,
  type Career,
  type GameEvent,
} from '../src/index.js';
import {
  aged,
  allRivalsThinking,
  allThinking,
  deepFreeze,
  fixtureContent,
  holdingCoin,
  thinking,
  trimRivalRosters,
} from './fixtures.js';

const content = fixtureContent;

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/**
 * A Career whose Rivals are all soured past the retaliation threshold, whose Guild can pay
 * its Upkeep for as long as a test needs, and where every Rival has room for somebody.
 *
 * Drift and the Departure Check are put out of reach, for the reason `decay.test.ts` puts
 * the Departure thresholds out of reach: this file measures one rule, and a Hero the
 * Guildmaster talks round in the same refresh is another rule moving in the middle of the
 * count. The blocks that are *about* those interactions switch them back on by hand.
 */
function underAttack(seed: string, overrides = {}): Career {
  const opened = newCareer(seed, content, {
    regardDecayAmount: 0,
    refusalRegardThreshold: -100,
    ...overrides,
  }).career;
  return trimRivalRosters(allRivalsThinking(holdingCoin(opened, 100_000), -5), 1);
}

describe('who a soured Rival takes', () => {
  it('takes nobody at all from a Guild whose Heroes are content, however soured they are', () => {
    // The whole of the defence, stated once: souring every Rival to the floor of the scale
    // and running a year of Board refreshes costs a Guild whose Roster is happy nobody.
    const career = allThinking(underAttack('e5-no-sour'), 5);
    const run = advance(career, 400, content);
    expect(of(run.events, 'RivalPoachedHero')).toEqual([]);
    expect(run.career.ledger.heroesPoachedFromUs).toBe(0);
    expect(run.career.guild.roster.map((hero) => hero.id)).toEqual(
      career.guild.roster.map((hero) => hero.id),
    );
  });

  it('takes the worst first, and one per soured Rival per refresh', () => {
    let career = underAttack('e5-worst-first');
    const [one, two, three] = career.guild.roster.map((hero) => hero.id);
    career = thinking(career, one ?? '', -2);
    career = thinking(career, two ?? '', -4);
    career = thinking(career, three ?? '', -3);

    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const taken = of(run.events, 'RivalPoachedHero');
    // Four Rivals, all soured, three takeable Heroes: the worst three go, worst first, one
    // apiece and in the Rivals' own id order (INPUTS 6.4 - once per Board refresh, in id
    // order). The fourth Rival finds nobody left to take.
    expect(taken.map((event) => event.heroId)).toEqual([two, three, one]);
    expect(taken.map((event) => event.regardValue)).toEqual([-4, -3, -2]);
    expect(taken.map((event) => event.toRivalId)).toEqual(['r1', 'r2', 'r3']);
    expect(run.career.ledger.heroesPoachedFromUs).toBe(3);
  });

  it('takes only those the one predicate says are takeable', () => {
    const career = underAttack('e5-predicate');
    const roster = career.guild.roster.map((hero) => hero.id);
    const at = roster.map((_, index) => -1 - index); // −1, −2, −3, −4
    let arranged = career;
    roster.forEach((id, index) => {
      arranged = thinking(arranged, id, at[index] ?? 0);
    });
    const run = advance(arranged, arranged.config.boardRefreshEveryDays, content);
    const taken = new Set(of(run.events, 'RivalPoachedHero').map((event) => event.heroId));
    roster.forEach((id, index) => {
      const regard = { value: at[index] ?? 0, reason: 'x', nature: 'neutral' as const };
      expect(taken.has(id), `${id} at ${String(at[index])}`).toBe(
        isPoachable(regard, arranged.config),
      );
    });
  });

  it('moves with retaliationRegardThreshold, at a value it does not default to', () => {
    const base = allThinking(underAttack('e5-threshold'), -4);
    const lenient = allRivalsThinking(
      { ...base, config: { ...base.config, retaliationRegardThreshold: -1 } },
      -1,
    );
    const strict = allRivalsThinking(
      { ...base, config: { ...base.config, retaliationRegardThreshold: -4 } },
      -1,
    );
    expect(
      of(advance(lenient, lenient.config.boardRefreshEveryDays, content).events, 'RivalPoachedHero')
        .length,
    ).toBeGreaterThan(0);
    expect(
      of(advance(strict, strict.config.boardRefreshEveryDays, content).events, 'RivalPoachedHero'),
    ).toEqual([]);
  });

  it('has nowhere to put anybody once their own Roster is at its ceiling', () => {
    const opened = newCareer('e5-no-room', content, {
      regardDecayAmount: 0,
      refusalRegardThreshold: -100,
      rivalRosterMin: 4,
      rivalRosterMax: 4,
      rivalChurnChance: 0,
    }).career;
    const career = allThinking(allRivalsThinking(holdingCoin(opened, 100_000), -5), -4);
    for (const rival of career.rivals) expect(rival.roster).toHaveLength(4);
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    expect(of(run.events, 'RivalPoachedHero')).toEqual([]);
  });
});

describe('what the player can see coming', () => {
  /**
   * `retaliationRisks` (finding C9, DL-22 §2): who on your Roster another Guild could take
   * as things stand, and by whom. It must never promise something the next refresh then
   * contradicts, which is why it shares `retaliate`'s own three predicates rather than
   * restating them — so the tests here are all about the two agreeing.
   */
  it('is empty when nobody on the Roster is poachable', () => {
    const career = allThinking(underAttack('e5-risk-none'), 5);
    expect(retaliationRisks(career)).toEqual([]);
    // And empty for an empty Roster, which is the other way to have nobody takeable.
    expect(retaliationRisks({ ...career, guild: { ...career.guild, roster: [] } })).toEqual([]);
  });

  it('names a Hero exactly when the one predicate does, and never a Rival Hero', () => {
    const career = underAttack('e5-risk-band');
    const roster = career.guild.roster.map((hero) => hero.id);
    let arranged = career;
    roster.forEach((id, index) => {
      arranged = thinking(arranged, id, -1 - index); // −1, −2, −3, −4
    });
    const listed = new Set(retaliationRisks(arranged).map((risk) => risk.heroId));
    roster.forEach((id, index) => {
      const regard = { value: -1 - index, reason: 'x', nature: 'neutral' as const };
      expect(listed.has(id), `${id} at ${String(-1 - index)}`).toBe(
        isPoachable(regard, arranged.config),
      );
    });
    // Only your own people: a Rival's Heroes are not yours to lose.
    const theirs = new Set(arranged.rivals.flatMap((rival) => rival.roster.map((one) => one.id)));
    for (const risk of retaliationRisks(arranged)) expect(theirs.has(risk.heroId)).toBe(false);
  });

  it('lists only the Rivals both soured enough to try and with room to take somebody', () => {
    const career = allThinking(underAttack('e5-risk-who'), -4);
    expect(retaliationRisks(career)[0]?.rivalIds).toEqual(['r1', 'r2', 'r3', 'r4']);

    // One Rival made content again drops out, though the others stay.
    const oneContent = {
      ...career,
      rivals: career.rivals.map((rival) =>
        rival.id === 'r2'
          ? { ...rival, regardForGuild: { ...rival.regardForGuild, value: 0 } }
          : rival,
      ),
    };
    expect(retaliationRisks(oneContent)[0]?.rivalIds).toEqual(['r1', 'r3', 'r4']);

    // And a soured Rival with a full Roster is harmless, which is the other half of
    // `retaliate`'s own guard (DL-21 §7, finding C7).
    const full = {
      ...career,
      config: { ...career.config, rivalRosterMax: 1 },
    };
    expect(retaliationRisks(full)[0]?.rivalIds).toEqual([]);
    expect(retaliationRisks(full).length).toBeGreaterThan(0);
    for (const rival of full.rivals) expect(hasRoomForAnother(rival, full.config)).toBe(false);
  });

  it('predicts exactly who the next refresh takes, over a fleet', () => {
    /**
     * The claim the whole selector rests on: what a player reads at a Board refresh is
     * what then happens. Worst Regard first, ties by id, one per soured Rival with room,
     * and a Hero away on a Commission deferred to the Day they come home — so the
     * prediction takes the listed Heroes who are at home, in the selector's own order, and
     * pairs them off against the Rivals the selector named.
     */
    const wrong: string[] = [];
    let taken = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      const at = `seed ${seed}`;
      let career = underAttack(`e5-risk-fleet-${seed}`, { rivalChurnChance: 0.3 });
      career = allThinking(career, -1);
      for (let round = 0; round < 12; round += 1) {
        // Sour a different Hero each round, so the band under the threshold keeps moving.
        const victim = career.guild.roster[round % Math.max(1, career.guild.roster.length)];
        if (victim !== undefined) career = thinking(career, victim.id, -2 - (round % 4));

        const away = new Set(career.parties.flatMap((party) => party.heroIds));
        const risks = retaliationRisks(career);
        const rivalIds = risks[0]?.rivalIds ?? [];
        const atHome = risks.filter((risk) => !away.has(risk.heroId));
        const predicted = atHome.slice(0, rivalIds.length).map((risk) => risk.heroId);

        const run = advance(career, career.config.boardRefreshEveryDays, content);
        const took = of(run.events, 'RivalPoachedHero');
        taken += took.length;
        if (took.map((event) => event.heroId).join(',') !== predicted.join(',')) {
          wrong.push(
            `${at} round ${String(round)}: predicted ${predicted.join(',')} ` +
              `and ${took.map((event) => event.heroId).join(',')} were taken`,
          );
        }
        for (const [index, event] of took.entries()) {
          if (event.toRivalId !== rivalIds[index]) {
            wrong.push(`${at} round ${String(round)}: ${event.heroId} went to ${event.toRivalId}`);
          }
          const said = risks.find((risk) => risk.heroId === event.heroId);
          if (said?.regardValue !== event.regardValue) {
            wrong.push(`${at} round ${String(round)}: ${event.heroId} at the wrong Regard`);
          }
        }
        career = run.career;
        if (career.ended !== undefined) break;
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
    // Not vacuous: people were actually taken, and every one of them was predicted.
    expect(taken).toBeGreaterThan(100);
  }, 120_000);

  it('reads a deep-frozen Career without writing to it', () => {
    const career = allThinking(underAttack('e5-risk-pure'), -4);
    const before = serialiseCareer(career);
    const frozen = deepFreeze(career);
    expect(() => retaliationRisks(frozen)).not.toThrow();
    expect(retaliationRisks(frozen).length).toBeGreaterThan(0);
    expect(serialiseCareer(career)).toBe(before);
    // Nothing shares a mutable list with the Career either: each answer is its own.
    const one = retaliationRisks(career);
    one[0]?.rivalIds.push('r99');
    expect(retaliationRisks(career)[0]?.rivalIds).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('where the Hero ends up', () => {
  const career = underAttack('e5-lands');
  const mine = career.guild.roster[0];
  if (mine === undefined) throw new Error('the test expected a Roster');
  const soured = thinking(career, mine.id, -4);
  const run = advance(soured, soured.config.boardRefreshEveryDays, content);
  const taken = of(run.events, 'RivalPoachedHero')[0];

  it('is on that Rival’s Roster and gone from yours', () => {
    expect(taken?.heroId).toBe(mine.id);
    expect(run.career.guild.roster.map((hero) => hero.id)).not.toContain(mine.id);
    const rival = run.career.rivals.find((entry) => entry.id === taken?.toRivalId);
    expect(rival?.roster.map((hero) => hero.id)).toContain(mine.id);
  });

  it('thinks of their new employer what config.transferJoiningRegard says, and of you nothing', () => {
    const rival = run.career.rivals.find((entry) => entry.id === taken?.toRivalId);
    const there = rival?.roster.find((hero) => hero.id === mine.id);
    expect(there?.regardForRival.value).toBe(soured.config.transferJoiningRegard);
    expect(there?.regardForGuildmaster).toBeUndefined();
    expect('regardForGuildmaster' in (there ?? {})).toBe(false);
  });

  it('keeps their age, their Traits and what they thought of the people they worked with', () => {
    const rival = run.career.rivals.find((entry) => entry.id === taken?.toRivalId);
    const there = rival?.roster.find((hero) => hero.id === mine.id);
    expect(there?.age).toBe(mine.age);
    expect(there?.calibre).toBe(mine.calibre);
    expect(there?.traits).toEqual(mine.traits);
    expect(there?.regardFor).toEqual(mine.regardFor);
  });

  it('is not in the Guild’s history: they are working, not gone', () => {
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).not.toContain(mine.id);
  });

  it('is counted once in the ledger and reported in the reckoning', () => {
    expect(run.career.ledger.heroesPoachedFromUs).toBe(1);
    const short = allThinking(underAttack('e5-reckoning', { careerYears: 1, daysPerYear: 40 }), -4);
    const ended = advance(short, 100, content).career;
    expect(ended.ended).toBeDefined();
    expect(ended.ledger.heroesPoachedFromUs).toBeGreaterThan(0);
    expect(ended.ended?.reckoning.heroesPoachedFromUs).toBe(ended.ledger.heroesPoachedFromUs);
  });
});

describe('a Hero away on a Commission', () => {
  it('is not taken mid-Commission, and is settled on the Day they come home', () => {
    const career = underAttack('e5-away', { commissionSpanMin: 14, commissionSpanMax: 14 });
    const [one, two] = career.guild.roster.map((hero) => hero.id);
    const soured = thinking(career, one ?? '', -4);
    const commission = soured.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    // Sent out on a long enough Commission to be away across a Board refresh.
    const sent = commitParty(soured, commission.id, [one ?? '', two ?? ''], content);
    const away = sent.career.parties[0];
    if (away === undefined) throw new Error('the test expected a Party');
    const returnsOn = away.returnsOn;
    expect(returnsOn).toBeGreaterThan(soured.config.boardRefreshEveryDays);

    // Every Day up to and including the one before they are home: nobody is taken.
    const before = advance(sent.career, returnsOn - sent.career.day - 1, content);
    expect(of(before.events, 'RivalPoachedHero')).toEqual([]);
    expect(before.career.guild.roster.map((hero) => hero.id)).toContain(one);

    // And on the Day they walk back through the door, the attempt they were owed is taken.
    const home = advance(before.career, 1, content);
    const taken = of(home.events, 'RivalPoachedHero');
    expect(taken.map((event) => event.heroId)).toContain(one);
    expect(taken[0]?.day).toBe(returnsOn);
    // After the `PartyReturned` that closes the work, as E2's Departure is (DL-14 §4).
    const order = home.events.map((event) => event.type);
    expect(order.indexOf('PartyReturned')).toBeLessThan(order.indexOf('RivalPoachedHero'));
  });
});

describe('the order the settling runs in at a Board refresh', () => {
  it('lets a Hero old enough to retire leave well rather than be taken', () => {
    // Retirement is settled before retaliation, so somebody at the end of a working life
    // goes on their own terms even when every Rival is waiting for them (DL-16 §7).
    const career = underAttack('e5-order-retire');
    const mine = career.guild.roster[0];
    if (mine === undefined) throw new Error('the test expected a Roster');
    const old = aged(thinking(career, mine.id, -4), mine.id, career.config.heroRetirementAge);
    const run = advance(old, old.config.boardRefreshEveryDays, content);
    expect(of(run.events, 'HeroRetired').map((event) => event.heroId)).toContain(mine.id);
    expect(of(run.events, 'RivalPoachedHero').map((event) => event.heroId)).not.toContain(mine.id);
    expect(run.career.guild.formerHeroes.find((hero) => hero.id === mine.id)?.exit?.kind).toBe(
      'retirement',
    );
  });

  it('lets the drift of the same refresh be what makes somebody takeable', () => {
    // Drift runs before retaliation, so a Hero the neglect has just pushed to the
    // threshold can be taken in the very refresh that pushed them — which is the design's
    // point: the player has had the whole of the fall to watch.
    const career = underAttack('e5-order-drift', {
      regardDecayAmount: 1,
      regardDecayEveryDays: 30,
    });
    const mine = career.guild.roster[0];
    if (mine === undefined) throw new Error('the test expected a Roster');
    // One point above the threshold, and idle long enough that the next refresh drifts
    // them down onto it.
    const nearly = thinking(career, mine.id, career.config.poachRegardThreshold + 1);
    // The clock runs from `max(lastCommittedOn, regardDecayedOn)`, which is Day 1 here, so
    // the first refresh at which thirty idle Days have actually passed is Day 40.
    const quiet = advance(nearly, career.config.regardDecayEveryDays + 10, content);
    const drifted = of(quiet.events, 'HeroRegardForGuildmasterChanged').filter(
      (event) => event.heroId === mine.id,
    );
    expect(drifted.length).toBeGreaterThan(0);
    const taken = of(quiet.events, 'RivalPoachedHero').filter((event) => event.heroId === mine.id);
    expect(taken).toHaveLength(1);
    expect(taken[0]?.day).toBe(drifted[0]?.day);
    expect(taken[0]?.regardValue).toBe(career.config.poachRegardThreshold);
  });

  it('never takes somebody who has already walked out in the same refresh', () => {
    // The Departure check runs before retaliation, so a Hero the Guild has lost is lost
    // rather than taken: a Departure is the player's own failure, not a Rival's success.
    // This is the one block that leaves E2's own thresholds exactly where they are.
    const opened = newCareer('e5-order-depart', content).career;
    const career = trimRivalRosters(allRivalsThinking(holdingCoin(opened, 100_000), -5), 1);
    const all = allThinking(career, career.config.departureRegardThreshold);
    const run = advance(all, all.config.boardRefreshEveryDays * 4, content);
    const departed = new Set(of(run.events, 'HeroDeparted').map((event) => event.heroId));
    const taken = new Set(of(run.events, 'RivalPoachedHero').map((event) => event.heroId));
    expect([...departed].filter((id) => taken.has(id))).toEqual([]);
    expect(departed.size + taken.size).toBeGreaterThan(0);
  });
});

describe('Departure and poaching are one mechanism', () => {
  it('takes the Hero whose Regard had soured by the same measure that loses them', () => {
    // E5's definition of done: "the Hero who walks out is the Hero somebody else
    // approached". Both rules read the same Regard, and the one taken is the one whose
    // Regard has fallen furthest — never a Hero the player had no warning about.
    const career = underAttack('e5-one-mechanism');
    const roster = career.guild.roster.map((hero) => hero.id);
    let arranged = career;
    roster.forEach((id, index) => {
      arranged = thinking(arranged, id, index === 0 ? -4 : 2);
    });
    const run = advanceUntilAttention(arranged, content);
    const taken = of(run.events, 'RivalPoachedHero');
    expect(taken.map((event) => event.heroId)).toEqual([roster[0]]);
    // The Regard that made them takeable is on the event, so narration never has to guess.
    expect(taken[0]?.regardValue).toBe(-4);
    // And it is at or below the very threshold E2's Departure check uses as its wider band.
    expect(taken[0]?.regardValue).toBeLessThanOrEqual(arranged.config.poachRegardThreshold);
  });
});
