/**
 * E5-S5: churn, and a soured Rival on your Board.
 *
 * Two rules, and the second is where the cost of poaching is actually felt. A Rival's
 * Roster gains and loses people of its own accord at each Board refresh, staying inside
 * its bounds. And E1's "one unclaimed Commission is taken by a random Rival per refresh"
 * becomes `rivalTakesPerRefresh` plus `souredRivalExtraTakes` for each soured Rival,
 * capped at `rivalTakesMax`, with a soured Rival preferred as the taker — **and, with
 * nobody soured, it is E1's rule to the draw**, which is what lets E1's own test stand
 * unmodified.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  newCareer,
  rivalById,
  souredRivals,
  type Career,
  type GameEvent,
} from '../src/index.js';
import {
  allRivalsThinking,
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

/** A Career that can pay its Upkeep for as long as a test needs to watch the Board. */
function solvent(seed: string, overrides = {}): Career {
  return holdingCoin(newCareer(seed, content, overrides).career, 1_000_000);
}

describe('churn', () => {
  it('never pushes a Rival’s Roster outside its bounds, over a whole Career', () => {
    const career = solvent('e5-churn-bounds', { rivalChurnChance: 1 });
    const { rivalRosterMin, rivalRosterMax } = career.config;
    let running = career;
    const broken: string[] = [];
    for (let step = 0; step < 60; step += 1) {
      running = advance(running, career.config.boardRefreshEveryDays, content).career;
      for (const rival of running.rivals) {
        if (rival.roster.length < rivalRosterMin || rival.roster.length > rivalRosterMax) {
          broken.push(`Day ${running.day}: ${rival.id} holds ${rival.roster.length}`);
        }
      }
    }
    expect(broken.slice(0, 5)).toEqual([]);
  });

  it('gains where a Roster is at the floor and loses where it is at the ceiling', () => {
    const tight = solvent('e5-churn-floor', {
      rivalRosterMin: 3,
      rivalRosterMax: 3,
      rivalChurnChance: 1,
    });
    // At `min === max` a Roster can go neither way, so churn fires and changes nothing.
    const held = advance(tight, tight.config.boardRefreshEveryDays, content);
    for (const rival of held.career.rivals) expect(rival.roster, rival.id).toHaveLength(3);

    // Cut every Roster to one and the only direction left is up, however the coin lands.
    const short = { ...tight, config: { ...tight.config, rivalRosterMin: 2, rivalRosterMax: 6 } };
    const cut: Career = {
      ...short,
      rivals: short.rivals.map((rival) => ({ ...rival, roster: rival.roster.slice(0, 1) })),
    };
    const grown = advance(cut, cut.config.boardRefreshEveryDays, content);
    for (const rival of grown.career.rivals) {
      expect(rival.roster.length, rival.id).toBe(2);
    }
    const joined = of(grown.events, 'RivalRosterChanged');
    expect(joined).toHaveLength(cut.rivals.length);
    for (const event of joined) {
      expect(event.joinedHeroIds).toHaveLength(1);
      expect(event.leftHeroIds).toEqual([]);
    }
  });

  it('never fires at all at a chance of zero, and always at a chance of one', () => {
    const never = solvent('e5-churn-chance', { rivalChurnChance: 0 });
    const always = solvent('e5-churn-chance', { rivalChurnChance: 1 });
    const quiet = advance(never, never.config.boardRefreshEveryDays * 5, content);
    expect(of(quiet.events, 'RivalRosterChanged')).toEqual([]);
    const busy = advance(always, always.config.boardRefreshEveryDays, content);
    expect(of(busy.events, 'RivalRosterChanged').length).toBe(always.rivals.length);
  });

  it('moves with rivalChurnGainChance: always up at one, always down at zero', () => {
    const up = solvent('e5-churn-direction', { rivalChurnChance: 1, rivalChurnGainChance: 1 });
    const down = solvent('e5-churn-direction', { rivalChurnChance: 1, rivalChurnGainChance: 0 });
    const grew = advance(up, up.config.boardRefreshEveryDays, content);
    const shrank = advance(down, down.config.boardRefreshEveryDays, content);
    for (const event of of(grew.events, 'RivalRosterChanged')) {
      const at = rivalById(up, event.rivalId);
      // A Rival already at the ceiling cannot gain, whatever the coin says.
      if ((at?.roster.length ?? 0) >= up.config.rivalRosterMax) continue;
      expect(event.joinedHeroIds, event.rivalId).toHaveLength(1);
    }
    for (const event of of(shrank.events, 'RivalRosterChanged')) {
      const at = rivalById(down, event.rivalId);
      if ((at?.roster.length ?? 0) <= down.config.rivalRosterMin) continue;
      expect(event.leftHeroIds, event.rivalId).toHaveLength(1);
    }
  });

  it('carries the ids that joined and left, and they are real people either side of it', () => {
    const career = solvent('e5-churn-ids', { rivalChurnChance: 1 });
    const before = new Map(
      career.rivals.map((rival) => [rival.id, rival.roster.map((hero) => hero.id)]),
    );
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    for (const event of of(run.events, 'RivalRosterChanged')) {
      const was = before.get(event.rivalId) ?? [];
      const now = rivalById(run.career, event.rivalId)?.roster.map((hero) => hero.id) ?? [];
      for (const id of event.joinedHeroIds) {
        expect(was, `${id} joined`).not.toContain(id);
        expect(now, `${id} joined`).toContain(id);
      }
      for (const id of event.leftHeroIds) {
        expect(was, `${id} left`).toContain(id);
        expect(now, `${id} left`).not.toContain(id);
      }
    }
  });

  it('gives somebody churned in an id nobody has ever held', () => {
    const career = solvent('e5-churn-unique', { rivalChurnChance: 1 });
    const seen = new Set<string>();
    let running = career;
    for (const rival of running.rivals) for (const hero of rival.roster) seen.add(hero.id);
    for (let step = 0; step < 20; step += 1) {
      const run = advance(running, running.config.boardRefreshEveryDays, content);
      running = run.career;
      for (const event of of(run.events, 'RivalRosterChanged')) {
        for (const id of event.joinedHeroIds) {
          expect(seen.has(id), `${id} came round twice`).toBe(false);
          seen.add(id);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(running.rivals.length);
  });

  it('lets go of the one who thought least of the Guild paying them', () => {
    // E2's Departure, seen from the other side: the person who goes is the person whose
    // Regard had fallen furthest, which is the same thing that makes them poachable.
    const career = solvent('e5-churn-who', {
      rivalChurnChance: 1,
      rivalChurnGainChance: 0,
      rivalRosterMin: 1,
    });
    const worst = new Map(
      career.rivals.map((rival) => [
        rival.id,
        [...rival.roster].sort(
          (one, other) =>
            one.regardForRival.value - other.regardForRival.value ||
            one.id.localeCompare(other.id),
        )[0]?.id,
      ]),
    );
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    for (const event of of(run.events, 'RivalRosterChanged')) {
      if (event.leftHeroIds.length === 0) continue;
      expect(event.leftHeroIds, event.rivalId).toEqual([worst.get(event.rivalId)]);
    }
  });

  it('takes no draw from the Career’s own generator', () => {
    // Churn draws from a stream keyed on the seed and the Day, so switching it off changes
    // nothing else about how a Career unfolds (E5 §5).
    const withChurn = advance(solvent('e5-churn-stream', { rivalChurnChance: 1 }), 200, content);
    const without = advance(solvent('e5-churn-stream', { rivalChurnChance: 0 }), 200, content);
    expect(withChurn.career.rng).toEqual(without.career.rng);
    expect(withChurn.career.guild.roster).toEqual(without.career.guild.roster);
    expect(withChurn.career.board).toEqual(without.career.board);
    expect(withChurn.career.guild.coin).toBe(without.career.guild.coin);
  });
});

describe('what a Rival takes off your Board', () => {
  it('is exactly one a refresh with nobody soured, which is E1’s rule to the draw', () => {
    const career = solvent('e5-board-e1');
    expect(souredRivals(career)).toEqual([]);
    const run = advance(career, career.config.boardRefreshEveryDays * 8, content);
    const refreshes = of(run.events, 'BoardRefreshed').length;
    const taken = of(run.events, 'CommissionTakenByRival');
    expect(refreshes).toBeGreaterThan(5);
    // One per refresh, every refresh — the Board is never empty at these defaults.
    expect(taken).toHaveLength(refreshes);
    for (const event of taken) expect(event.rivalId).toMatch(/^r\d+$/);
  });

  it('costs up to three a refresh once two Rivals are soured, and is capped there', () => {
    const one = rivalThinking(solvent('e5-board-soured'), 'r1', -3);
    const two = rivalThinking(one, 'r2', -3);
    const four = allRivalsThinking(solvent('e5-board-soured'), -3);

    const perRefresh = (career: Career): number[] => {
      const run = advance(career, career.config.boardRefreshEveryDays * 6, content);
      const byDay = new Map<number, number>();
      for (const event of of(run.events, 'CommissionTakenByRival')) {
        byDay.set(event.day, (byDay.get(event.day) ?? 0) + 1);
      }
      return [...byDay.values()];
    };

    // One soured Rival: one extra take, so two a refresh.
    expect(new Set(perRefresh(one))).toEqual(new Set([2]));
    // Two soured: three a refresh, which is the cap.
    expect(new Set(perRefresh(two))).toEqual(new Set([3]));
    // Four soured: still three, because `rivalTakesMax` is where it stops.
    expect(new Set(perRefresh(four))).toEqual(new Set([3]));
  });

  it('moves with every one of the three fields, at values none of them defaults to', () => {
    const career = allRivalsThinking(
      solvent('e5-board-config', {
        souredRivalThreshold: -1,
        souredRivalExtraTakes: 2,
        rivalTakesMax: 5,
      }),
      -1,
    );
    expect(souredRivals(career)).toHaveLength(4);
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    // 1 + 2 × 4 = 9, capped at 5, and the Board never holds more than `boardSizeMax`.
    const taken = of(run.events, 'CommissionTakenByRival');
    expect(taken.length).toBe(Math.min(5, career.board.length));
  });

  it('prefers a soured Rival as the taker', () => {
    const career = rivalThinking(solvent('e5-board-preferred'), 'r3', -5);
    const run = advance(career, career.config.boardRefreshEveryDays * 6, content);
    const takers = new Set(of(run.events, 'CommissionTakenByRival').map((event) => event.rivalId));
    expect([...takers]).toEqual(['r3']);
  });

  it('still drops that Patron’s Regard for every Commission it takes', () => {
    // Poaching costs you work, which is the whole point of it (E5-S5): the take is not a
    // free extra, it is a Patron thinking less of a Guild that would not do their work.
    const career = allRivalsThinking(solvent('e5-board-patron'), -3);
    const run = advance(career, career.config.boardRefreshEveryDays, content);
    const taken = of(run.events, 'CommissionTakenByRival');
    expect(taken.length).toBe(3);
    const docked = of(run.events, 'PatronRegardChanged').filter(
      (event) => event.reason === 'you passed on their work',
    );
    expect(docked.length).toBe(taken.length);
    for (const event of docked) expect(event.delta).toBe(career.config.patronRegardOnPassedOver);
    // And the Rivals' Standing rose for it, once each.
    for (const event of taken) {
      const before = career.rivals.find((rival) => rival.id === event.rivalId)?.standing ?? 0;
      const after = rivalById(run.career, event.rivalId)?.standing ?? 0;
      expect(after).toBeGreaterThan(before);
    }
  });
});
