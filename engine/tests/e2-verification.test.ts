/**
 * Independent verification of E2 (Refusals and Regard), written against the package's
 * public entry point rather than its modules, so that what is asserted here is the
 * contract in solution architecture §5–§7 and nothing behind it.
 *
 * These are adversarial: each one was written to try to break a rule E2 claims, and the
 * ones that survive stay as regression tests. Boundaries are pinned on both sides — one
 * point either way of every new threshold — because a threshold that is only ever tested
 * from the far side is not tested at all.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  deserialiseCareer,
  EngineError,
  newCareer,
  proposeParty,
  REASON_DRIFTED,
  REASON_INSISTED,
  REASON_TALKED_ROUND,
  serialiseCareer,
  type Career,
  type GameConfig,
  type GameEvent,
  type Hero,
} from '../src/index.js';
import { deepFreeze, fixtureContent, thinking } from './fixtures.js';

// ── Small helpers, so that `noUncheckedIndexedAccess` does not litter the tests ──

/** The id of the Hero at this place on the Roster. Throws rather than returning `''`. */
function rosterId(career: Career, index: number): string {
  const hero = career.guild.roster[index];
  if (hero === undefined) throw new Error(`the test expected a Hero at Roster place ${index}`);
  return hero.id;
}

/** The first Commission on the Board. */
function boardId(career: Career): string {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commission.id;
}

/** A Hero on the Roster or among the former Heroes, by id. */
function anyHero(career: Career, id: string): Hero {
  const found = [...career.guild.roster, ...career.guild.formerHeroes].find(
    (hero) => hero.id === id,
  );
  if (found === undefined) throw new Error(`no Hero "${id}" anywhere in the Guild`);
  return found;
}

/** The EngineError a call is expected to throw. */
function rejection(run: () => unknown): EngineError {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof EngineError) return thrown;
    throw thrown;
  }
  throw new Error('the call was expected to be rejected and was not');
}

function regardMoves(
  events: readonly GameEvent[],
  reason: string,
  heroId?: string,
): Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }>[] {
  return events.filter(
    (event): event is Extract<GameEvent, { type: 'HeroRegardForGuildmasterChanged' }> =>
      event.type === 'HeroRegardForGuildmasterChanged' &&
      event.reason === reason &&
      (heroId === undefined || event.heroId === heroId),
  );
}

function departures(events: readonly GameEvent[]): Extract<GameEvent, { type: 'HeroDeparted' }>[] {
  return events.filter(
    (event): event is Extract<GameEvent, { type: 'HeroDeparted' }> => event.type === 'HeroDeparted',
  );
}

/** Nothing moves Regard but the rule under test, and nobody runs out of coin. */
const QUIET: Partial<GameConfig> = {
  regardDecayEveryDays: 0,
  startingCoin: 100_000,
};

// ── A Party of mixed willingness ────────────────────────────────────────────

describe('a Party mixing the refusing, the willing and the away', () => {
  const opened = newCareer('e2v-mixed', fixtureContent, QUIET).career;

  it('is refused for the Hero who cannot go before it is refused for the one who will not', () => {
    const away = rosterId(opened, 0);
    const sour = rosterId(opened, 1);
    const willing = rosterId(opened, 2);

    const sent = commitParty(opened, boardId(opened), [away], fixtureContent).career;
    const soured = thinking(sent, sour, sent.config.refusalRegardThreshold);
    const commission = boardId(soured);

    // Unavailability is the stronger objection: the call names it, not the refusal.
    for (const call of [proposeParty, commitParty] as const) {
      expect(rejection(() => call(soured, commission, [sour, willing, away], fixtureContent)).code).toBe(
        'HeroNotAvailable',
      );
    }

    // Without the absent one, only the sour one is named, and only once.
    const proposal = proposeParty(soured, commission, [sour, willing], fixtureContent);
    expect(proposal.refusals.map((refusal) => refusal.heroId)).toEqual([sour]);
    expect(proposal.refusals[0]?.reason).toBe('regard');

    const step = commitParty(soured, commission, [sour, willing], fixtureContent, { insist: true });
    expect(
      step.events.filter((event) => event.type === 'InsistenceApplied').map((event) => event.heroId),
    ).toEqual([sour]);
    expect(anyHero(step.career, willing).regardForGuildmaster).toEqual(
      anyHero(soured, willing).regardForGuildmaster,
    );
    // The Hero who was already out is untouched and still out.
    expect(anyHero(step.career, away).regardForGuildmaster).toEqual(
      anyHero(soured, away).regardForGuildmaster,
    );
    expect(step.career.parties).toHaveLength(2);
  });
});

// ── Insisting against the floor ─────────────────────────────────────────────

describe('insisting on a Hero already at the Regard floor', () => {
  const opened = newCareer('e2v-floor', fixtureContent, {
    ...QUIET,
    departureDc: 100,
    departureRegardThreshold: -100,
  }).career;

  it('costs nothing, reports a delta of zero, and still records why', () => {
    const sour = rosterId(opened, 0);
    const floor = thinking(opened, sour, opened.config.regardMin, 'the business at Thurrow');
    const step = commitParty(floor, boardId(floor), [sour], fixtureContent, { insist: true });

    const applied = step.events.filter((event) => event.type === 'InsistenceApplied');
    expect(applied).toHaveLength(1);
    expect(applied[0]?.delta).toBe(0);
    expect(applied[0]?.value).toBe(opened.config.regardMin);
    expect(Object.is(applied[0]?.delta, -0)).toBe(false);

    const moved = regardMoves(step.events, REASON_INSISTED, sour);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.delta).toBe(0);
    expect(moved[0]?.value).toBe(opened.config.regardMin);

    // The value did not move, but the reason did: the Guildmaster is on record.
    const after = anyHero(step.career, sour).regardForGuildmaster;
    expect(after.value).toBe(opened.config.regardMin);
    expect(after.reason).toBe(REASON_INSISTED);
  });
});

// ── The rejections both halves of the pair share ────────────────────────────

describe('what neither asking nor deciding will accept', () => {
  const opened = newCareer('e2v-rejections', fixtureContent, QUIET).career;

  it('refuses a duplicate id, an empty Party and an id that is nobody', () => {
    const commission = boardId(opened);
    const one = rosterId(opened, 0);
    for (const call of [proposeParty, commitParty] as const) {
      expect(rejection(() => call(opened, commission, [one, one], fixtureContent)).code).toBe(
        'HeroNotAvailable',
      );
      expect(rejection(() => call(opened, commission, [], fixtureContent)).code).toBe('EmptyParty');
      expect(rejection(() => call(opened, commission, ['nobody'], fixtureContent)).code).toBe(
        'HeroNotAvailable',
      );
    }
  });

  it('never lets the Guildmaster be named to a Party (ADR-0007)', () => {
    const { guildmaster } = opened.guild;
    // The Guildmaster is not a Hero: they carry no id, so there is nothing to name.
    expect('id' in (guildmaster as unknown as Record<string, unknown>)).toBe(false);
    expect(opened.guild.roster.some((hero) => hero.name === guildmaster.name)).toBe(false);
    expect(availableHeroes(opened).some((hero) => hero.name === guildmaster.name)).toBe(false);

    const commission = boardId(opened);
    for (const call of [proposeParty, commitParty] as const) {
      expect(
        rejection(() => call(opened, commission, [guildmaster.name], fixtureContent)).code,
      ).toBe('HeroNotAvailable');
    }
  });

  it('refuses a Hero who has already walked out', () => {
    const lost = newCareer('e2v-rejections', fixtureContent, {
      ...QUIET,
      departureDc: 100,
      regardDecayEveryDays: 0,
    }).career;
    const going = rosterId(lost, 0);
    const run = advance(thinking(lost, going, lost.config.departureRegardThreshold), 10, fixtureContent);
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toEqual([going]);

    const commission = boardId(run.career);
    for (const call of [proposeParty, commitParty] as const) {
      expect(rejection(() => call(run.career, commission, [going], fixtureContent)).code).toBe(
        'HeroNotAvailable',
      );
    }
  });
});

// ── Purity ──────────────────────────────────────────────────────────────────

describe('every E2 code path over a deep-frozen Career', () => {
  it('changes nothing it was given, whether it answers, commits, refuses or advances', () => {
    const base = newCareer('e2v-frozen', fixtureContent, {
      ...QUIET,
      regardDecayEveryDays: 10,
      departureDc: 100,
      commissionSpanMin: 5,
      commissionSpanMax: 5,
    }).career;
    const sour = rosterId(base, 0);
    const sliding = rosterId(base, 1);
    const staged = thinking(
      thinking(base, sour, base.config.departureRegardThreshold),
      sliding,
      base.config.refusalRegardThreshold,
    );
    const commission = boardId(staged);

    const before = serialiseCareer(staged);
    const frozen = deepFreeze(staged);

    // Asking.
    proposeParty(frozen, commission, [sour, sliding], fixtureContent);
    // Refusing to commit.
    expect(() => commitParty(frozen, commission, [sour], fixtureContent)).toThrow(EngineError);
    // Committing, over a refusal and without one.
    commitParty(frozen, commission, [sour, sliding], fixtureContent, { insist: true });
    commitParty(frozen, commission, [rosterId(frozen, 2)], fixtureContent);
    // Drift, the Departure check and Departure itself, over several refreshes.
    advance(frozen, 45, fixtureContent);
    advanceUntilAttention(frozen, fixtureContent);

    expect(serialiseCareer(frozen)).toBe(before);
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

/** Send the strongest available Heroes at the best-paying work, insisting every time. */
function playInsisting(start: Career): { career: Career; events: GameEvent[] } {
  const strength = (hero: Hero): number =>
    hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;
  let career = start;
  const events: GameEvent[] = [];
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the insisting policy never reached the end');
    const free = [...availableHeroes(career)].sort((one, other) => strength(other) - strength(one));
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const party = left.slice(0, 2).map((hero) => hero.id);
      const proposal = proposeParty(career, commission.id, party, fixtureContent);
      const step = commitParty(career, commission.id, party, fixtureContent, {
        insist: proposal.refusals.length > 0,
      });
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }
    const step = advanceUntilAttention(career, fixtureContent);
    career = step.career;
    events.push(...step.events);
  }
  return { career, events };
}

describe('the same seed and the same decisions, twice', () => {
  it('gives identical serialised Careers and identical event streams, insisting and all', () => {
    // A refusing line the starting Roster already straddles, so the run really does
    // insist, sour, talk somebody round and lose somebody, rather than merely advancing.
    const settings: Partial<GameConfig> = { careerYears: 3, refusalRegardThreshold: 0 };
    const once = playInsisting(newCareer('e2v-determinism', fixtureContent, settings).career);
    const twice = playInsisting(newCareer('e2v-determinism', fixtureContent, settings).career);

    expect(once.events.some((event) => event.type === 'InsistenceApplied')).toBe(true);
    expect(JSON.stringify(twice.events)).toBe(JSON.stringify(once.events));
    expect(serialiseCareer(twice.career)).toBe(serialiseCareer(once.career));
  });
});

// ── Two at once, and the cadence of the check ───────────────────────────────

describe('more than one Hero at the bottom of the scale', () => {
  it('loses them both in the same refresh, in Roster order, and counts them both', () => {
    const opened = newCareer('e2v-two-out', fixtureContent, {
      ...QUIET,
      departureDc: 100,
    }).career;
    const first = rosterId(opened, 0);
    const second = rosterId(opened, 1);
    const staged = thinking(
      thinking(opened, first, opened.config.departureRegardThreshold),
      second,
      opened.config.departureRegardThreshold,
    );

    const run = advance(staged, 10, fixtureContent);
    expect(departures(run.events).map((event) => event.heroId)).toEqual([first, second]);
    expect(departures(run.events).every((event) => event.day === 10)).toBe(true);
    expect(run.career.ledger.departures).toBe(2);
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toEqual([first, second]);
    expect(run.career.guild.roster).toHaveLength(opened.guild.roster.length - 2);
    for (const id of [first, second]) {
      expect(run.career.guild.roster.some((hero) => hero.id === id)).toBe(false);
      expect(run.career.guild.formerHeroes.find((hero) => hero.id === id)?.exit?.kind).toBe(
        'departure',
      );
    }
  });
});

describe('a Party that comes home on a Board refresh Day', () => {
  /** Nobody is lost, nobody gains: the talk-round is a bare record, so it can be counted. */
  const settings: Partial<GameConfig> = {
    ...QUIET,
    departureDc: 0,
    talkedRoundRegardGain: 0,
    insistenceRegardCost: 0,
    commissionSpanMin: 9,
    commissionSpanMax: 9,
  };

  it('has its Heroes checked exactly once on that Day, not once for coming home and once for the Board', () => {
    const opened = newCareer('e2v-home-on-refresh', fixtureContent, settings).career;
    const goer = opened.guild.roster.find(
      (hero) => !hero.traits.some((held) => held.name === 'Craven'),
    );
    if (goer === undefined) throw new Error('the test expected a Hero without Craven');

    const soured = thinking(opened, goer.id, opened.config.refusalRegardThreshold - 1);
    const sent = commitParty(soured, boardId(soured), [goer.id], fixtureContent, { insist: true });
    expect(sent.career.parties[0]?.returnsOn).toBe(10);
    expect(anyHero(sent.career, goer.id).regardForGuildmaster.value).toBe(
      opened.config.refusalRegardThreshold - 1,
    );

    const run = advance(sent.career, 9, fixtureContent);
    expect(run.career.day).toBe(10);
    expect(run.events.some((event) => event.type === 'BoardRefreshed')).toBe(true);
    expect(run.events.some((event) => event.type === 'PartyReturned')).toBe(true);

    const checks = regardMoves(run.events, REASON_TALKED_ROUND, goer.id);
    expect(checks.map((event) => event.day)).toEqual([10]);
    // And the work was closed before the Guildmaster had the conversation.
    const returned = run.events.findIndex((event) => event.type === 'PartyReturned');
    const talked = run.events.findIndex(
      (event) =>
        event.type === 'HeroRegardForGuildmasterChanged' && event.reason === REASON_TALKED_ROUND,
    );
    expect(returned).toBeGreaterThanOrEqual(0);
    expect(talked).toBeGreaterThan(returned);
  });

  it('settles only the Heroes who came home when the Board is not refreshing', () => {
    const opened = newCareer('e2v-home-off-refresh', fixtureContent, {
      ...settings,
      commissionSpanMin: 4,
      commissionSpanMax: 4,
    }).career;
    const idle = rosterId(opened, 0);
    const goer = rosterId(opened, 1);
    const sullen = thinking(opened, idle, opened.config.refusalRegardThreshold);
    expect(anyHero(sullen, goer).regardForGuildmaster.value).toBeGreaterThan(
      sullen.config.refusalRegardThreshold,
    );

    const sent = commitParty(sullen, boardId(sullen), [goer], fixtureContent);
    expect(sent.career.parties[0]?.returnsOn).toBe(5);

    const run = advance(sent.career, 4, fixtureContent);
    expect(run.career.day).toBe(5);
    expect(run.events.some((event) => event.type === 'PartyReturned')).toBe(true);
    expect(run.events.some((event) => event.type === 'BoardRefreshed')).toBe(false);

    // The one who stayed at home is at the refusing line, but this is not their Day.
    expect(regardMoves(run.events, REASON_TALKED_ROUND)).toEqual([]);

    // The Board comes round on Day 10 and then they are checked, exactly once.
    const later = advance(run.career, 5, fixtureContent);
    expect(regardMoves(later.events, REASON_TALKED_ROUND, idle).map((event) => event.day)).toEqual([
      10,
    ]);
  });
});

// ── One point either side of every new threshold ────────────────────────────

describe('one point either side of every threshold E2 adds', () => {
  const opened = newCareer('e2v-boundaries', fixtureContent, {
    ...QUIET,
    departureDc: 100,
    talkedRoundRegardGain: 0,
  }).career;

  it('refuses at the refusal threshold and not a point above it', () => {
    const who = rosterId(opened, 0);
    const commission = boardId(opened);
    const at = thinking(opened, who, opened.config.refusalRegardThreshold);
    const above = thinking(opened, who, opened.config.refusalRegardThreshold + 1);
    expect(proposeParty(at, commission, [who], fixtureContent).refusals).toHaveLength(1);
    expect(proposeParty(above, commission, [who], fixtureContent).refusals).toEqual([]);
  });

  it('takes the Departure Check at the refusal threshold and not a point above it', () => {
    // A Check nobody fails, worth nothing when it is passed, so that the bare record of
    // it is the only thing the run produces and it can be counted.
    const watched = newCareer('e2v-boundaries', fixtureContent, {
      ...QUIET,
      departureDc: 0,
      talkedRoundRegardGain: 0,
    }).career;
    const who = rosterId(watched, 0);
    const at = advance(thinking(watched, who, watched.config.refusalRegardThreshold), 10, fixtureContent);
    const above = advance(
      thinking(watched, who, watched.config.refusalRegardThreshold + 1),
      10,
      fixtureContent,
    );
    expect(regardMoves(at.events, REASON_TALKED_ROUND, who)).toHaveLength(1);
    expect(regardMoves(above.events, REASON_TALKED_ROUND, who)).toEqual([]);
  });

  it('loses a Hero at the Departure threshold and not a point above it', () => {
    const who = rosterId(opened, 0);
    const at = advance(thinking(opened, who, opened.config.departureRegardThreshold), 10, fixtureContent);
    const above = advance(
      thinking(opened, who, opened.config.departureRegardThreshold + 1),
      10,
      fixtureContent,
    );
    expect(departures(at.events).map((event) => event.heroId)).toEqual([who]);
    expect(departures(above.events)).toEqual([]);
    // Between the two lines a failed Check simply leaves them sullen.
    expect(above.career.guild.roster.some((hero) => hero.id === who)).toBe(true);
    expect(anyHero(above.career, who).regardForGuildmaster.value).toBe(
      opened.config.departureRegardThreshold + 1,
    );
  });

  it('passes the Departure Check on a total that exactly reaches the DC, and not one below', () => {
    // No fixture Trait modifies Guile, so the Guildmaster's total is the die plus Guile.
    const guile = opened.guild.guildmaster.stats.Guile;
    const who = rosterId(opened, 0);
    const reachable = newCareer('e2v-boundaries', fixtureContent, {
      ...QUIET,
      talkedRoundRegardGain: 0,
      departureDc: opened.config.diceSides + guile,
    }).career;
    const unreachable = newCareer('e2v-boundaries', fixtureContent, {
      ...QUIET,
      talkedRoundRegardGain: 0,
      departureDc: opened.config.diceSides + guile + 1,
    }).career;

    const days = 600;
    const onTheNose = advance(
      thinking(reachable, who, reachable.config.refusalRegardThreshold),
      days,
      fixtureContent,
    );
    const beyond = advance(
      thinking(unreachable, who, unreachable.config.refusalRegardThreshold),
      days,
      fixtureContent,
    );
    // Only the highest roll reaches it, so `>=` shows and `>` would not.
    expect(regardMoves(onTheNose.events, REASON_TALKED_ROUND, who).length).toBeGreaterThan(0);
    expect(regardMoves(beyond.events, REASON_TALKED_ROUND, who)).toEqual([]);
  });

  it('drifts on the Day the idle stretch reaches the interval and not the Day before', () => {
    const settings: Partial<GameConfig> = {
      departureRegardThreshold: -100,
      refusalRegardThreshold: -100,
      startingCoin: 100_000,
      boardRefreshEveryDays: 1,
      regardDecayEveryDays: 12,
    };
    const idle = newCareer('e2v-drift-boundary', fixtureContent, settings).career;
    const who = rosterId(idle, 0);
    const short = advance(idle, 11, fixtureContent);
    const exact = advance(idle, 12, fixtureContent);
    expect(short.career.day).toBe(12);
    expect(regardMoves(short.events, REASON_DRIFTED, who)).toEqual([]);
    expect(regardMoves(exact.events, REASON_DRIFTED, who).map((event) => event.day)).toEqual([13]);
  });
});

// ── Saving in the middle of it ──────────────────────────────────────────────

describe('a save taken with a Hero in each E2 state', () => {
  /** Soured on the Roster, soured and away on work, and already departed. */
  function staged(): Career {
    const opened = newCareer('e2v-save', fixtureContent, {
      ...QUIET,
      departureDc: 100,
      insistenceRegardCost: 0,
      commissionSpanMin: 30,
      commissionSpanMax: 30,
    }).career;
    const going = rosterId(opened, 0);
    const sullen = rosterId(opened, 1);
    const away = rosterId(opened, 2);

    let career = thinking(opened, going, opened.config.departureRegardThreshold);
    career = thinking(career, sullen, opened.config.refusalRegardThreshold);
    career = thinking(career, away, opened.config.refusalRegardThreshold);
    career = commitParty(career, boardId(career), [away], fixtureContent, { insist: true }).career;

    const run = advance(career, 11, fixtureContent);
    expect(run.career.day).toBe(12);
    expect(run.career.guild.formerHeroes.map((hero) => hero.id)).toEqual([going]);
    expect(run.career.parties[0]?.heroIds).toEqual([away]);
    expect(run.career.guild.roster.some((hero) => hero.id === sullen)).toBe(true);
    return run.career;
  }

  it('round-trips, and continues exactly as it would have done had it never been saved', () => {
    const mid = staged();
    const loaded = deserialiseCareer(serialiseCareer(mid));
    expect(loaded).toEqual(mid);
    expect(serialiseCareer(loaded)).toBe(serialiseCareer(mid));

    const unsaved = advance(mid, 120, fixtureContent);
    const resumed = advance(loaded, 120, fixtureContent);
    expect(JSON.stringify(resumed.events)).toBe(JSON.stringify(unsaved.events));
    expect(serialiseCareer(resumed.career)).toBe(serialiseCareer(unsaved.career));

    // And the departed Hero came back out of the save whole.
    const gone = loaded.guild.formerHeroes[0];
    expect(gone?.exit?.kind).toBe('departure');
    expect(gone?.exit?.onDay).toBe(10);
    expect(gone?.regardForGuildmaster.value).toBe(mid.config.departureRegardThreshold);
  });
});

// ── A hundred Careers under a policy that sometimes insists ─────────────────

/** Every number reachable from a Career, for the shapes JSON cannot carry. */
function everyNumber(value: unknown, path: string, out: { path: string; value: number }[]): void {
  if (typeof value === 'number') {
    out.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      everyNumber(entry, `${path}[${String(index)}]`, out);
    });
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) everyNumber(entry, `${path}.${key}`, out);
  }
}

interface Tally {
  retirement: number;
  insolvency: number;
  everInsisted: number;
  everDeparted: number;
  everTalkedRound: number;
}

describe('a hundred Careers under a Guildmaster who sometimes insists', () => {
  /**
   * Play `seeds` whole Careers under a policy that insists on about half the Commissions
   * it meets a refusal on, and assert every E2 invariant on each finished Career.
   */
  function smoke(label: string, seeds: number, settings?: Partial<GameConfig>): Tally {
    const tally: Tally = {
      retirement: 0,
      insolvency: 0,
      everInsisted: 0,
      everDeparted: 0,
      everTalkedRound: 0,
    };

    for (let seed = 0; seed < seeds; seed += 1) {
      const start = newCareer(`e2v-${label}-${String(seed)}`, fixtureContent, settings).career;
      const strength = (hero: Hero): number =>
        hero.stats.Might + hero.stats.Craft + hero.stats.Nerve + hero.stats.Guile;
      let career: Career = start;
      const departed: { heroId: string; regardValue: number }[] = [];
      let insisted = 0;
      let talkedRound = 0;
      let guard = 0;

      const read = (events: readonly GameEvent[]): void => {
        for (const event of events) {
          if (event.type === 'HeroDeparted') {
            departed.push({ heroId: event.heroId, regardValue: event.regardValue });
          }
          if (event.type === 'InsistenceApplied') insisted += 1;
          if (event.type === 'HeroRegardForGuildmasterChanged') {
            if (event.reason === REASON_TALKED_ROUND) talkedRound += 1;
            expect(Math.abs(event.value)).toBeLessThanOrEqual(career.config.regardMax);
          }
        }
      };

      while (career.ended === undefined) {
        guard += 1;
        if (guard > 100_000) throw new Error(`seed ${String(seed)} never reached an ending`);
        const free = [...availableHeroes(career)].sort(
          (one, other) => strength(other) - strength(one),
        );
        const used = new Set<string>();
        for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
          const left = free.filter((hero) => !used.has(hero.id));
          if (left.length === 0) break;
          const party = left.slice(0, 2).map((hero) => hero.id);
          const proposal = proposeParty(career, commission.id, party, fixtureContent);
          // Insist on about half the Commissions: deterministic, but not on all of them,
          // so that both the refusal and the way round it are exercised.
          const willing = party.filter(
            (id) => !proposal.refusals.some((refusal) => refusal.heroId === id),
          );
          const insist = commission.difficulty % 2 === 0;
          if (!insist && willing.length === 0) continue;
          const step = commitParty(
            career,
            commission.id,
            insist ? party : willing,
            fixtureContent,
            { insist },
          );
          career = step.career;
          read(step.events);
          for (const id of (insist ? party : willing)) used.add(id);
        }
        const step = advanceUntilAttention(career, fixtureContent);
        career = step.career;
        read(step.events);
      }

      const where = `${label} seed ${String(seed)}`;
      // The Career always reaches an ending.
      expect(career.ended, where).toBeDefined();
      tally[career.ended.reason] += 1;
      if (insisted > 0) tally.everInsisted += 1;
      if (departed.length > 0) tally.everDeparted += 1;
      if (talkedRound > 0) tally.everTalkedRound += 1;

      // Nobody is on the Roster and among the former Heroes at once.
      const onRoster = new Set(career.guild.roster.map((hero) => hero.id));
      const gone = career.guild.formerHeroes.map((hero) => hero.id);
      expect(gone.filter((id) => onRoster.has(id)), where).toEqual([]);
      expect(new Set(gone).size, where).toBe(gone.length);

      // Every Hero who was reported as departing is there, with an exit that says so.
      for (const event of departed) {
        const former = career.guild.formerHeroes.find((hero) => hero.id === event.heroId);
        expect(former, `${where}: ${event.heroId}`).toBeDefined();
        expect(former?.exit?.kind, where).toBe('departure');
        expect(event.regardValue, where).toBeLessThanOrEqual(career.config.departureRegardThreshold);
      }
      expect(career.ledger.departures, where).toBe(new Set(departed.map((d) => d.heroId)).size);
      // E3-S3 makes the reckoning count Death and Departure and report Retirement apart
      // from them, because Retirement is not a loss. The two sides of this were the same
      // number for the whole of E2, when Departure was the only way out.
      expect(career.ended.reckoning.heroesLost, where).toBe(
        career.guild.formerHeroes.filter((hero) => hero.exit?.kind !== 'retirement').length,
      );
      expect(career.ended.reckoning.heroesRetired, where).toBe(
        career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'retirement').length,
      );

      // Regard stays inside its scale, everywhere it is held.
      for (const hero of [...career.guild.roster, ...career.guild.formerHeroes]) {
        for (const regard of [hero.regardForGuildmaster, ...Object.values(hero.regardFor)]) {
          expect(regard.value, `${where}: ${hero.id}`).toBeGreaterThanOrEqual(career.config.regardMin);
          expect(regard.value, `${where}: ${hero.id}`).toBeLessThanOrEqual(career.config.regardMax);
        }
      }
      for (const regard of Object.values(career.guild.guildmaster.regardFor)) {
        expect(regard.value, where).toBeGreaterThanOrEqual(career.config.regardMin);
        expect(regard.value, where).toBeLessThanOrEqual(career.config.regardMax);
      }

      // No NaN and no negative zero anywhere, so a save comes back deep-equal.
      const numbers: { path: string; value: number }[] = [];
      everyNumber(career, 'career', numbers);
      const broken = numbers.filter(
        (entry) => Number.isNaN(entry.value) || Object.is(entry.value, -0),
      );
      expect(broken.map((entry) => entry.path), where).toEqual([]);
      expect(deserialiseCareer(serialiseCareer(career)), where).toEqual(career);
    }

    expect(tally.retirement + tally.insolvency, label).toBe(seeds);
    return tally;
  }

  it('holds every E2 invariant on every one of them', { timeout: 300_000 }, () => {
    smoke('smoke', 100);
  });

  it('holds them too when the refusing line is one the Roster actually straddles', { timeout: 300_000 }, () => {
    // At the shipped thresholds a policy that sends everybody constantly never lets
    // anybody sour, so the machinery above is exercised over a world where refusal is
    // ordinary: every tunable is a named field, which is what makes this possible.
    const tally = smoke('soured', 40, { refusalRegardThreshold: 0, careerYears: 8 });
    expect(tally.everInsisted).toBeGreaterThan(0);
    expect(tally.everDeparted).toBeGreaterThan(0);
    expect(tally.everTalkedRound).toBeGreaterThan(0);
  });
});
