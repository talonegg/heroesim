/**
 * E3, attacked from outside. Everything here goes through `../src/index.js` and nothing
 * else: no internal module, no shared fixture. The world it plays in is built with the
 * engine's own `validateContent`, so the content is under this file's control and the
 * pools it exhausts are known exactly.
 *
 * Written as an independent check of the epic rather than alongside it, so the questions
 * are the awkward ones: what happens when a Hero is injured and soured and old enough to
 * retire on the same Day; when the harm pool runs dry; when the only Hero of a Party dies
 * on a Beat the Commission would otherwise have been paid for; and whether a Career that
 * is saved and reloaded mid-flight goes on exactly as one that was not.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  availableHeroes,
  commitParty,
  defaultConfig,
  deserialiseCareer,
  EngineError,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  injuredHeroes,
  injuredUntil,
  injuryOutcome,
  isInjured,
  newCareer,
  proposeParty,
  serialiseCareer,
  startingAge,
  validateContent,
  type Career,
  type Content,
  type GameConfig,
  type GameEvent,
  type Hero,
  type HeroTrait,
} from '../src/index.js';

// ── A world of this file's own ───────────────────────────────────────────────

/** Four Injuries and three Scars, so both pools can be drained and counted. */
const world: Content = validateContent({
  traits: [
    { name: 'Settled', kind: 'disposition', summary: 'Takes things as they come.', modifiers: [] },
    {
      name: 'Well connected',
      kind: 'disposition',
      summary: 'Knows somebody in most of the places the work goes.',
      modifiers: [],
      backing: 2,
    },
    { name: 'First hurt', kind: 'injury', summary: 'A shoulder that will not turn.', modifiers: [] },
    { name: 'Second hurt', kind: 'injury', summary: 'A hand strapped up.', modifiers: [] },
    { name: 'Third hurt', kind: 'injury', summary: 'A rib that catches.', modifiers: [] },
    { name: 'Fourth hurt', kind: 'injury', summary: 'A fever that will not break.', modifiers: [] },
    { name: 'First mark', kind: 'scar', summary: 'A line from the jaw down.', modifiers: [] },
    { name: 'Second mark', kind: 'scar', summary: 'A leg that set badly.', modifiers: [] },
    { name: 'Third mark', kind: 'scar', summary: 'A quiet that came back with them.', modifiers: [] },
  ],
  backgrounds: [{ name: 'The long road', summary: 'Years of walking to work.', traits: ['Settled'] }],
  spheres: [
    {
      id: 'river',
      name: 'the river towns',
      patronNames: ['Reeve Halloran', 'The Salt Factors', 'Widow Sessil', 'The Wending Ferrymen'],
      commissionTitles: [
        { title: 'The ford at Lowford', difficulty: 10, tags: ['water'] },
        { title: 'The night watch', difficulty: 12, tags: ['guard'] },
      ],
    },
    {
      id: 'hill',
      name: 'the drovers’ road',
      patronNames: ['The Drovers of Cairn Pass', 'Bailiff Skene', 'The Hill Families', 'Goodwife Merrin'],
      commissionTitles: [
        { title: 'The autumn drove', difficulty: 9, tags: ['escort'] },
        { title: 'The toll house', difficulty: 11, tags: ['guard'] },
      ],
    },
  ],
  names: {
    heroFirst: ['Brenna', 'Aldis', 'Corran', 'Maelis', 'Roskil', 'Ysolde', 'Hale', 'Thessa', 'Garrick', 'Ilse'],
    heroEpithets: ['of Ashfall', 'of Lowford', 'the Quiet'],
    guildNames: ['The Lowford Guild'],
    rivalNames: ['The Iron Weir Guild', 'The Kestrel Guild', 'The Tallow Guild', 'The Northgate Guild'],
  },
  vignettes: [
    {
      id: 'the-only-one',
      name: 'The only one',
      stat: 'Craft',
      difficulty: 11,
      weight: 1,
      tags: [],
      conditions: {},
      slots: { hero: 'any' },
      outcomes: {
        failure: { narrative: '{hero} does not manage it.', consequences: [] },
        success: { narrative: '{hero} manages it.', consequences: [] },
        critical: { narrative: '{hero} manages it very well indeed.', consequences: [] },
      },
    },
  ],
});

const INJURY_POOL = world.traits.filter((trait) => trait.kind === 'injury').length;
const SCAR_POOL = world.traits.filter((trait) => trait.kind === 'scar').length;

/** Every Check out of reach, so every Beat of a test is a failure. */
const ALWAYS_FAILS: Partial<GameConfig> = { dcMin: 40, dcMax: 40 };
/** No failure is wide enough to be a critical one. */
const NEVER_CRITICAL: Partial<GameConfig> = { criticalMargin: 100 };
/** Every failure is a critical one. */
const ALWAYS_CRITICAL: Partial<GameConfig> = { criticalMargin: 1 };

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

function rosterId(career: Career, index: number): string {
  const hero = career.guild.roster[index];
  if (hero === undefined) throw new Error(`the test expected a Hero at Roster place ${index}`);
  return hero.id;
}

function boardId(career: Career): string {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commission.id;
}

function rejection(run: () => unknown): EngineError {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof EngineError) return thrown;
    throw thrown;
  }
  throw new Error('the call was expected to be rejected and was not');
}

/** A copy of a Career with one Hero rewritten. Plain data in, plain data out. */
function rewriting(career: Career, heroId: string, patch: Partial<Hero>): Career {
  return {
    ...career,
    guild: {
      ...career.guild,
      roster: career.guild.roster.map((hero) => (hero.id === heroId ? { ...hero, ...patch } : hero)),
    },
  };
}

function withTrait(career: Career, heroId: string, trait: HeroTrait): Career {
  const hero = career.guild.roster.find((candidate) => candidate.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  return rewriting(career, heroId, {
    traits: [...hero.traits.filter((held) => held.name !== trait.name), trait],
  });
}

/** Freeze a value and everything reachable from it, so any mutation of it throws. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const held of Object.values(value as Record<string, unknown>)) deepFreeze(held);
  return Object.freeze(value);
}

/**
 * A plain automatic player of this file's own: best available Heroes to the best-paying
 * work, buying a Hall improvement when it can afford one outright. Every event of the
 * whole Career is kept, which is what the coin and ledger invariants are checked against.
 */
function play(start: Career, opening: readonly GameEvent[] = [], buyHall = true): {
  career: Career;
  events: GameEvent[];
  ages: Map<string, number[]>;
} {
  let career = start;
  const events: GameEvent[] = [...opening];
  const ages = new Map<string, number[]>();
  let guard = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 100_000) throw new Error('the policy never reached the end of the Career');

    for (const hero of career.guild.roster) {
      ages.set(hero.id, [...(ages.get(hero.id) ?? []), hero.age]);
    }

    if (buyHall) {
      for (const improvement of HALL_IMPROVEMENTS) {
        if (career.guild.hall.includes(improvement)) continue;
        if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) continue;
        const bought = improveHall(career, improvement);
        career = bought.career;
        events.push(...bought.events);
      }
    }

    const free = availableHeroes(career);
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(career, commission.id, left.map((hero) => hero.id), world).refusals.map(
          (refusal) => refusal.heroId,
        ),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, world);
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }

    const step = advanceUntilAttention(career, world);
    career = step.career;
    events.push(...step.events);
  }
  return { career, events, ages };
}

// ── The harm pools, drained ──────────────────────────────────────────────────

describe('a Hero who already holds every Trait the pool can give', () => {
  it('is given nothing further, does not crash, and does not loop', () => {
    const opened = newCareer('exhaust-injuries', world, {
      ...ALWAYS_FAILS,
      ...NEVER_CRITICAL,
      injuryChanceOnFailure: 1,
      injurySpanMin: 5000,
      injurySpanMax: 5000,
      commissionSpanMin: 10,
      commissionSpanMax: 10,
      beatsMin: 9,
      beatsMax: 9,
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    }).career;
    const hero = rosterId(opened, 0);
    const sent = commitParty(opened, boardId(opened), [hero], world).career;
    const run = advance(sent, 10, world);

    const beats = of(run.events, 'BeatResolved');
    const injuries = of(run.events, 'HeroInjured');
    expect(beats.length).toBe(9);
    // Nine certain Injuries offered into a pool of four: four land and the rest are
    // silently nothing at all. No throw, no repeat, no empty-collection pick.
    expect(injuries).toHaveLength(INJURY_POOL);
    expect(new Set(injuries.map((event) => event.trait)).size).toBe(INJURY_POOL);
    const marked = run.career.guild.roster.find((entry) => entry.id === hero);
    expect(marked?.traits.filter((held) => held.liftsOn !== undefined)).toHaveLength(INJURY_POOL);
    expect(run.career.ledger.heroesInjured).toBe(INJURY_POOL);
  });

  it('is the same for the Scar pool', () => {
    const opened = newCareer('exhaust-scars', world, {
      ...ALWAYS_FAILS,
      ...ALWAYS_CRITICAL,
      deathChanceOnCriticalFailure: 0,
      scarChanceOnCriticalFailure: 1,
      commissionSpanMin: 10,
      commissionSpanMax: 10,
      beatsMin: 9,
      beatsMax: 9,
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    }).career;
    const hero = rosterId(opened, 0);
    const sent = commitParty(opened, boardId(opened), [hero], world).career;
    const run = advance(sent, 10, world);

    const scars = of(run.events, 'HeroScarred');
    expect(of(run.events, 'BeatResolved')).toHaveLength(9);
    expect(scars).toHaveLength(SCAR_POOL);
    expect(new Set(scars.map((event) => event.trait)).size).toBe(SCAR_POOL);
    expect(run.career.ledger.heroesScarred).toBe(SCAR_POOL);
    // A drained Scar pool does not fall through to a Death.
    expect(of(run.events, 'HeroDied')).toHaveLength(0);
  });
});

// ── A Party of one that does not come back ───────────────────────────────────

describe('a Hero who dies on a Beat the Commission would otherwise have been paid for', () => {
  /**
   * Failure is worth `+5` to the score here, so the Commission's score is well past the
   * half-Beats it needs by the time the Hero is killed. The only thing standing between
   * the Guild and the fee is that nobody came back to be paid for it (DL-16 §6).
   */
  const paidForFailing: Partial<GameConfig> = {
    ...ALWAYS_FAILS,
    ...ALWAYS_CRITICAL,
    deathChanceOnCriticalFailure: 1,
    scoreFailure: 5,
    beatsMin: 5,
    beatsMax: 5,
    commissionSpanMin: 8,
    commissionSpanMax: 8,
    boardRefreshEveryDays: 1000,
    upkeepEveryDays: 1000,
  };

  it('is not paid: a Party with nobody in it has not finished the work', () => {
    const opened = newCareer('death-scored', world, paidForFailing).career;
    const hero = rosterId(opened, 0);
    const commission = opened.board.find((entry) => entry.id === boardId(opened));
    if (commission === undefined) throw new Error('the test expected a Commission');
    const fee = commission.fee;
    expect(fee).toBeGreaterThan(0);

    const sent = commitParty(opened, commission.id, [hero], world).career;
    const coinBefore = sent.guild.coin;
    const run = advance(sent, 8, world);

    const died = of(run.events, 'HeroDied');
    const home = of(run.events, 'PartyReturned');
    expect(died).toHaveLength(1);
    expect(home).toHaveLength(1);

    const returned = home[0];
    if (returned === undefined) throw new Error('the test expected a return');
    // The score alone would have carried it: one Beat at +5 against a half of five Beats.
    expect(returned.score).toBeGreaterThanOrEqual(Math.ceil(5 / 2));
    expect(returned.heroIds).toEqual([]);
    expect(returned.succeeded).toBe(false);
    expect(returned.feePaid).toBe(0);
    expect(of(run.events, 'CoinChanged').filter((event) => event.reason === 'fee')).toHaveLength(0);
    expect(run.career.guild.coin).toBe(coinBefore);
    expect(run.career.ledger.commissionsCompleted).toBe(0);
    expect(run.career.ledger.commissionsFailed).toBe(1);
  });

  it('comes home on the Day the last of them died, on Beat 1 of 5', () => {
    const opened = newCareer('death-beat-one', world, paidForFailing).career;
    const sent = commitParty(opened, boardId(opened), [rosterId(opened, 0)], world).career;
    const due = sent.parties[0]?.returnsOn;
    const run = advance(sent, 8, world);

    const died = of(run.events, 'HeroDied')[0];
    const home = of(run.events, 'PartyReturned')[0];
    if (died === undefined || home === undefined) throw new Error('the test expected both');
    expect(died.beatIndex).toBe(1);
    expect(home.day).toBe(died.day);
    expect(home.day).toBeLessThan(due ?? 0);
    // Exactly one Beat was ever resolved: the Party stops working the moment it is empty.
    expect(of(run.events, 'BeatResolved')).toHaveLength(1);
    expect(run.career.parties).toHaveLength(0);
  });
});

// ── Time: an Injury that lifts on the Day the Party walks back in ────────────

describe('an Injury whose liftsOn is the Day the Party comes home', () => {
  it('lifts first, so the Hero is home clear rather than home injured', () => {
    const opened = newCareer('lift-on-return', world, {
      dcMin: 1,
      dcMax: 1,
      commissionSpanMin: 6,
      commissionSpanMax: 6,
      beatsMin: 1,
      beatsMax: 1,
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
      injuryChanceOnFailure: 0,
    }).career;
    const hero = rosterId(opened, 0);
    const sent = commitParty(opened, boardId(opened), [hero], world).career;
    const returnsOn = sent.parties[0]?.returnsOn;
    if (returnsOn === undefined) throw new Error('the test expected a Party');

    const hurt = withTrait(sent, hero, { name: 'First hurt', since: sent.day, liftsOn: returnsOn });
    const run = advance(hurt, returnsOn - hurt.day, world);
    expect(run.career.day).toBe(returnsOn);

    const types = run.events.map((event) => event.type);
    expect(types).toContain('InjuryLifted');
    expect(types).toContain('PartyReturned');
    // The Day starts by lifting what is due, and only then brings people home (E3-S2).
    expect(types.indexOf('InjuryLifted')).toBeLessThan(types.indexOf('PartyReturned'));
    expect(of(run.events, 'InjuryLifted')[0]?.day).toBe(returnsOn);

    expect(isInjured(run.career.guild.roster.find((entry) => entry.id === hero) ?? ({} as never))).toBe(
      false,
    );
    expect(injuredHeroes(run.career)).toEqual([]);
    expect(availableHeroes(run.career).map((entry) => entry.id)).toContain(hero);
    expect(commitParty(run.career, boardId(run.career), [hero], world).career.parties).toHaveLength(1);
  });
});

// ── Injured, soured and old, all on the same Day ─────────────────────────────

describe('a Hero who is injured and soured and old enough to retire at once', () => {
  const quiet: Partial<GameConfig> = {
    boardRefreshEveryDays: 10,
    upkeepEveryDays: 1000,
    regardDecayEveryDays: 30,
  };

  it('retires: Retirement is settled before the drift and before the Departure check', () => {
    const opened = newCareer('all-at-once', world, quiet).career;
    const hero = rosterId(opened, 0);
    const loaded = withTrait(
      rewriting(opened, hero, {
        age: opened.config.heroRetirementAge,
        regardForGuildmaster: {
          value: opened.config.departureRegardThreshold,
          reason: 'the business at Thurrow',
          nature: 'neutral',
        },
      }),
      hero,
      { name: 'First hurt', since: 1, liftsOn: 400 },
    );

    const run = advance(loaded, 9, world);
    expect(run.career.day).toBe(10);

    const retired = of(run.events, 'HeroRetired').filter((event) => event.heroId === hero);
    expect(retired).toHaveLength(1);
    expect(of(run.events, 'HeroDeparted').filter((event) => event.heroId === hero)).toHaveLength(0);
    // Nothing soured them on the way out: no drift was charged to them that Day either.
    expect(
      of(run.events, 'HeroRegardForGuildmasterChanged').filter((event) => event.heroId === hero),
    ).toHaveLength(0);

    const gone = run.career.guild.formerHeroes.find((entry) => entry.id === hero);
    expect(gone?.exit?.kind).toBe('retirement');
    // They leave with the Injury still on the record, which is how a person stays readable.
    expect(gone?.traits.map((held) => held.name)).toContain('First hurt');
    expect(run.career.guild.roster.map((entry) => entry.id)).not.toContain(hero);
  });

  it('skips the retiring Hero’s Departure Check rather than consuming its draw', () => {
    // The same world twice, differing only in the sour Hero's age. If the Departure Check
    // were rolled for somebody who is already retiring, both would have advanced the
    // generator the same number of times. They do not: the draw is skipped, and skipped
    // deterministically (DL-16 §7).
    const opened = newCareer('retire-pre-empts', world, quiet).career;
    const hero = rosterId(opened, 0);
    const sour = rewriting(opened, hero, {
      regardForGuildmaster: {
        value: opened.config.departureRegardThreshold,
        reason: 'the business at Thurrow',
        nature: 'neutral',
      },
    });
    const young = advance(rewriting(sour, hero, { age: 30 }), 9, world);
    const old = advance(rewriting(sour, hero, { age: opened.config.heroRetirementAge }), 9, world);

    expect(of(young.events, 'HeroRetired')).toHaveLength(0);
    expect(of(old.events, 'HeroRetired')).toHaveLength(1);
    expect(young.career.rng).not.toEqual(old.career.rng);

    // And it is the same answer every time it is asked.
    const again = advance(rewriting(sour, hero, { age: opened.config.heroRetirementAge }), 9, world);
    expect(serialiseCareer(again.career)).toBe(serialiseCareer(old.career));
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(old.events));
  });
});

// ── Years served ─────────────────────────────────────────────────────────────

describe('HeroRetired.yearsServed', () => {
  it('rounds to the nearest year rather than down, on a part-year that goes up', () => {
    // Ten years and a bit over half: `round` says eleven and `floor` says ten, and the
    // architecture says `round((day − joinedOn) / daysPerYear)`. Every other test in the
    // suite lands on a value where the two agree, so this is the one that tells them apart.
    const opened = newCareer('years-served-rounding', world, {
      daysPerYear: 100,
      careerYears: 30,
      boardRefreshEveryDays: 10,
      upkeepEveryDays: 100_000,
      regardDecayEveryDays: 100_000,
      heroRetirementAge: 200,
    }).career;
    const hero = rosterId(opened, 0);
    const late = advance(opened, 1050, world).career;
    expect(late.day).toBe(1051);

    const retiring = rewriting(late, hero, { age: 200 });
    const run = advance(retiring, 9, world);
    expect(run.career.day).toBe(1060);

    const retired = of(run.events, 'HeroRetired').find((event) => event.heroId === hero);
    expect(retired).toBeDefined();
    // (1060 − 1) / 100 = 10.59.
    expect(retired?.yearsServed).toBe(11);
    expect(retired?.yearsServed).not.toBe(10);
  });
});

// ── E2 interplay ─────────────────────────────────────────────────────────────

describe('an injured Hero against E2’s refusals', () => {
  it('is reported as unavailable, not as refusing', () => {
    const opened = newCareer('injured-not-refusing', world, {
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    }).career;
    const hurt = rosterId(opened, 0);
    const injured = withTrait(opened, hurt, { name: 'First hurt', since: 1, liftsOn: 40 });

    const proposal = proposeParty(injured, boardId(injured), [rosterId(injured, 1)], world);
    expect(proposal.unavailable).toEqual([{ heroId: hurt, reason: 'injured' }]);
    expect(proposal.refusals).toEqual([]);
  });

  it('gives one sane answer for a Hero who is both injured and unwilling', () => {
    const opened = newCareer('hurt-and-unwilling', world, {
      boardRefreshEveryDays: 1000,
      upkeepEveryDays: 1000,
    }).career;
    const hero = rosterId(opened, 0);
    const both = withTrait(
      rewriting(opened, hero, {
        regardForGuildmaster: {
          value: opened.config.refusalRegardThreshold,
          reason: 'the business at Thurrow',
          nature: 'neutral',
        },
      }),
      hero,
      { name: 'First hurt', since: 1, liftsOn: 40 },
    );

    // Availability is settled before willingness, because it is the fact that decides the
    // question: there is no point asking somebody who cannot go whether they would.
    expect(rejection(() => proposeParty(both, boardId(both), [hero], world)).code).toBe(
      'HeroNotAvailable',
    );
    expect(rejection(() => commitParty(both, boardId(both), [hero], world)).code).toBe(
      'HeroNotAvailable',
    );
    // Insisting does not buy a way round it.
    expect(
      rejection(() => commitParty(both, boardId(both), [hero], world, { insist: true })).code,
    ).toBe('HeroNotAvailable');

    // Asked about from outside, they are named once, as unavailable.
    const proposal = proposeParty(both, boardId(both), [rosterId(both, 1)], world);
    expect(proposal.unavailable).toEqual([{ heroId: hero, reason: 'injured' }]);
    expect(proposal.refusals).toEqual([]);
    expect(injuredHeroes(both).map((entry) => entry.id)).toEqual([hero]);
    expect(availableHeroes(both).map((entry) => entry.id)).not.toContain(hero);
  });
});

// ── The Hall, at its edges ───────────────────────────────────────────────────

describe('the Hall at its edges', () => {
  it('takes all three on Day 1 when the coin is there, in one Day', () => {
    const opened = newCareer('hall-day-one', world, { startingCoin: 100_000 }).career;
    let career = opened;
    const events: GameEvent[] = [];
    for (const improvement of HALL_IMPROVEMENTS) {
      const step = improveHall(career, improvement);
      career = step.career;
      events.push(...step.events);
    }
    expect(career.day).toBe(1);
    expect(career.guild.hall).toEqual([...HALL_IMPROVEMENTS]);
    expect(new Set(career.guild.hall).size).toBe(career.guild.hall.length);
    const total = HALL_IMPROVEMENTS.reduce((sum, one) => sum + hallCost(one, career.config), 0);
    expect(career.guild.coin).toBe(100_000 - total);
    expect(of(events, 'HallImproved')).toHaveLength(3);
    expect(of(events, 'CoinChanged').every((event) => event.reason === 'hall')).toBe(true);
    expect(of(events, 'CoinChanged').reduce((sum, event) => sum + event.delta, 0)).toBe(-total);
    // And a fourth of anything is refused.
    for (const improvement of HALL_IMPROVEMENTS) {
      expect(rejection(() => improveHall(career, improvement)).code).toBe('AlreadyImproved');
    }
  });

  it('adds its Backing to the same sum a Guildmaster’s own Traits do', () => {
    // E3's training-yard term is the fourth in `backingFor`'s sum, and the third — what
    // the Guildmaster's Traits carry — turned out to be pinned by nothing: zeroing it
    // left the whole engine suite green. Guarded here because the two share an expression
    // and a clamp, so a change to one is a change to the other.
    const opened = newCareer('trait-backing', world, { backingMax: 9, startingCoin: 5000 }).career;
    const withTraits = (traits: readonly { name: string; since: number }[]): Career => ({
      ...opened,
      guild: {
        ...opened.guild,
        guildmaster: { ...opened.guild.guildmaster, traits: [...traits] },
      },
    });
    const bare = withTraits([]);
    const connected = withTraits([{ name: 'Well connected', since: 1 }]);
    const hero = [rosterId(opened, 0)];

    const before = proposeParty(bare, boardId(bare), hero, world).backing;
    const after = proposeParty(connected, boardId(connected), hero, world).backing;
    expect(after - before).toBe(2);

    // And the yard's term stacks on top of it rather than replacing it.
    const yard = improveHall(connected, 'trainingYard').career;
    expect(proposeParty(yard, boardId(yard), hero, world).backing).toBe(
      after + opened.config.trainingYardBacking,
    );
  });

  it('goes through on coin exactly equal to the cost, for all three', () => {
    for (const improvement of HALL_IMPROVEMENTS) {
      const cost = hallCost(improvement, defaultConfig);
      const exact = newCareer(`hall-exact-${improvement}`, world, { startingCoin: cost }).career;
      const step = improveHall(exact, improvement);
      expect(step.career.guild.coin).toBe(0);
      expect(of(step.events, 'HallImproved')[0]?.balance).toBe(0);

      const short = newCareer(`hall-short-${improvement}`, world, { startingCoin: cost - 1 }).career;
      expect(rejection(() => improveHall(short, improvement)).code).toBe('InsufficientCoin');
    }
  });

  it('is refused on a Career that has ended, however much coin is left', () => {
    const ended = advance(
      newCareer('hall-after-the-end', world, {
        careerYears: 1,
        daysPerYear: 10,
        startingCoin: 100_000,
      }).career,
      40,
      world,
    ).career;
    expect(ended.ended).toBeDefined();
    const before = serialiseCareer(ended);
    for (const improvement of HALL_IMPROVEMENTS) {
      expect(rejection(() => improveHall(ended, improvement)).code).toBe('CareerEnded');
    }
    expect(serialiseCareer(ended)).toBe(before);
  });
});

// ── Purity ───────────────────────────────────────────────────────────────────

describe('every E3 function is pure', () => {
  it('works on a deep-frozen Career and never writes to it', () => {
    const opened = newCareer('frozen', world, { startingCoin: 5000 }).career;
    const hero = opened.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Hero');
    const frozen = deepFreeze(opened);
    const before = serialiseCareer(frozen);

    expect(() => availableHeroes(frozen)).not.toThrow();
    expect(() => injuredHeroes(frozen)).not.toThrow();
    expect(() => isInjured(hero)).not.toThrow();
    expect(() => injuredUntil(hero)).not.toThrow();
    expect(() => injuryOutcome(3, 14, frozen.config)).not.toThrow();
    expect(() => hallCost('infirmary', frozen.config)).not.toThrow();
    expect(() => startingAge(frozen.seed, hero.id, frozen.config)).not.toThrow();
    expect(() => improveHall(frozen, 'infirmary')).not.toThrow();
    expect(() => proposeParty(frozen, boardId(frozen), [hero.id], world)).not.toThrow();
    expect(() => commitParty(frozen, boardId(frozen), [hero.id], world)).not.toThrow();
    expect(() => advance(frozen, 30, world)).not.toThrow();
    expect(() => advanceUntilAttention(frozen, world)).not.toThrow();

    expect(serialiseCareer(frozen)).toBe(before);
    // The improvement landed on the copy and nowhere near the original.
    expect(improveHall(frozen, 'infirmary').career.guild.hall).toEqual(['infirmary']);
    expect(frozen.guild.hall).toEqual([]);
  });

  it('answers the same for the same numbers, whatever else has happened', () => {
    for (const total of [-4, 0, 3, 11, 12, 13, 25]) {
      const answers = new Set<string>();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        answers.add(injuryOutcome(total, 12, defaultConfig));
      }
      expect(answers.size).toBe(1);
    }
    expect(startingAge('a', 'h1', defaultConfig)).toBe(startingAge('a', 'h1', defaultConfig));
  });
});

// ── Ages derived from the seed (DL-16 §1) ────────────────────────────────────

describe('the derived starting age', () => {
  it('covers the configured range evenly enough that a Roster does not retire together', () => {
    const counts = new Map<number, number>();
    const draws = 4000;
    for (let index = 0; index < draws; index += 1) {
      const age = startingAge('histogram', `h${index}`, defaultConfig);
      counts.set(age, (counts.get(age) ?? 0) + 1);
    }
    const values = [...counts.keys()].sort((one, other) => one - other);
    expect(values[0]).toBe(defaultConfig.heroStartingAgeMin);
    expect(values[values.length - 1]).toBe(defaultConfig.heroStartingAgeMax);

    const span = defaultConfig.heroStartingAgeMax - defaultConfig.heroStartingAgeMin + 1;
    expect(values).toHaveLength(span);
    const expected = draws / span;
    for (const age of values) {
      const seen = counts.get(age) ?? 0;
      // No bucket is less than half or more than twice what a flat draw would give.
      expect(seen, `age ${age}`).toBeGreaterThan(expected * 0.5);
      expect(seen, `age ${age}`).toBeLessThan(expected * 2);
    }
  });

  it('takes no draw from the Career’s own generator, proved by a range that draws nothing', () => {
    // DL-16 §1's load-bearing claim is that world generation's stream is exactly what it
    // was before ages existed. `rng.between(low, high)` returns `low` without drawing when
    // `high <= low`, so a Career whose age range is a single year would finish generation
    // four draws behind one with the shipped eighteen-year range — if ages came from
    // `career.rng`. They do not, and everything else about the two worlds is identical.
    const wide = newCareer('age-stream', world).career;
    const narrow = newCareer('age-stream', world, {
      heroStartingAgeMin: 30,
      heroStartingAgeMax: 30,
    }).career;

    expect(narrow.rng).toEqual(wide.rng);
    expect(narrow.guild.name).toBe(wide.guild.name);
    expect(narrow.guild.roster.map((hero) => hero.name)).toEqual(
      wide.guild.roster.map((hero) => hero.name),
    );
    expect(narrow.guild.roster.map((hero) => hero.stats)).toEqual(
      wide.guild.roster.map((hero) => hero.stats),
    );
    expect(narrow.patrons.map((patron) => patron.name)).toEqual(
      wide.patrons.map((patron) => patron.name),
    );
    expect(narrow.rivals.map((rival) => rival.name)).toEqual(wide.rivals.map((rival) => rival.name));
    expect(narrow.board.map((commission) => commission.id)).toEqual(
      wide.board.map((commission) => commission.id),
    );
    // Only the ages moved, and they moved to where the narrowed range put them.
    expect(narrow.guild.roster.map((hero) => hero.age)).toEqual([30, 30, 30, 30]);
    expect(narrow.guild.roster.map((hero) => hero.age)).not.toEqual(
      wide.guild.roster.map((hero) => hero.age),
    );
  });

  it('is pinned to exact values, so the stream cannot be changed without being seen', () => {
    // DL-16 §1 makes a Hero's age a function of `"<seed>:age:<heroId>"`. Nothing else in
    // the suite pins a number it produced, so the stream could be renamed and every test
    // would still pass while every pre-E3 save reloaded with different people in it.
    expect(startingAge('e3-age-pin', 'h1', defaultConfig)).toBe(32);
    expect(startingAge('e3-age-pin', 'h2', defaultConfig)).toBe(30);
    expect(startingAge('e3-age-pin', 'h3', defaultConfig)).toBe(24);
    expect(startingAge('e3-age-pin', 'h4', defaultConfig)).toBe(29);
    // And world generation uses that same call rather than a second one of its own.
    expect(newCareer('e3-age-pin', world).career.guild.roster.map((hero) => hero.age)).toEqual([
      32, 30, 24, 29,
    ]);
  });

  it('is a function of the seed and the id alone, and collides across neither', () => {
    // E4's Applicants and E5's Rival Heroes will want the same mechanism, so what matters
    // is that two different ids under one seed are independent draws rather than the same
    // one: a stream per id, not a stream per Career.
    const one = startingAge('same-seed', 'h1', defaultConfig);
    const two = startingAge('same-seed', 'h2', defaultConfig);
    const elsewhere = startingAge('other-seed', 'h1', defaultConfig);
    expect([one, two, elsewhere].every((age) => Number.isInteger(age))).toBe(true);
    // An id that is a prefix of another is a different stream, which is what stops an
    // `a1` Applicant and an `a10` one sharing an age by construction.
    const ages = new Set(['h1', 'h10', 'h100', 'a1', 'a10', 'r1h1'].map((id) => `${id}:${startingAge('prefixes', id, defaultConfig)}`));
    expect(ages.size).toBe(6);
  });
});

// ── Save, load, and carry on ─────────────────────────────────────────────────

describe('a Career saved and reloaded in the middle of itself', () => {
  it('continues exactly as one that was never saved, with harm and a Hall in the state', () => {
    const opened = newCareer('save-midway', world, { startingCoin: 5000 });
    // Play far enough in that the world has some history behind it, then put the four
    // things E3 adds into the state by hand: a Hero carrying an Injury, a Hero carrying a
    // Scar, a Hero who died (the shipped death rate is too rare to rely on a seed for),
    // and a Hall that is half bought.
    const midway = play(opened.career, opened.events).career;
    expect(midway.ended).toBeDefined();

    const working = advance(newCareer('save-midway-2', world, { startingCoin: 5000 }).career, 200, world)
      .career;
    expect(working.ended).toBeUndefined();
    expect(working.guild.roster.length).toBeGreaterThanOrEqual(3);

    const dead = working.guild.roster[working.guild.roster.length - 1];
    if (dead === undefined) throw new Error('the test expected a Hero to bury');
    const marked = withTrait(
      withTrait(working, rosterId(working, 0), {
        name: 'First hurt',
        since: working.day,
        liftsOn: working.day + 25,
      }),
      rosterId(working, 1),
      { name: 'First mark', since: working.day },
    );
    const loaded: Career = {
      ...marked,
      guild: { ...marked.guild, hall: ['infirmary'], coin: 900 },
    };
    const withDead: Career = {
      ...loaded,
      guild: {
        ...loaded.guild,
        roster: loaded.guild.roster.filter((hero) => hero.id !== dead.id),
        formerHeroes: [
          ...loaded.guild.formerHeroes,
          { ...dead, exit: { kind: 'death', onDay: working.day, reason: 'did not come back' } },
        ],
      },
      ledger: { ...loaded.ledger, heroesDied: loaded.ledger.heroesDied + 1 },
    };
    // The state really does hold all four things.
    expect(injuredHeroes(withDead).length).toBeGreaterThan(0);
    expect(withDead.guild.formerHeroes.some((hero) => hero.exit?.kind === 'death')).toBe(true);
    expect(withDead.guild.hall).toEqual(['infirmary']);

    const reloaded = deserialiseCareer(serialiseCareer(withDead));
    expect(reloaded).toEqual(withDead);

    const straight = play(withDead);
    const roundTripped = play(reloaded);
    expect(serialiseCareer(roundTripped.career)).toBe(serialiseCareer(straight.career));
    expect(JSON.stringify(roundTripped.events)).toBe(JSON.stringify(straight.events));
  });

  it('is deterministic: the same seed and the same decisions twice, to the last event', () => {
    for (const seed of ['determinism-1', 'determinism-2', 'determinism-3']) {
      const first = newCareer(seed, world);
      const second = newCareer(seed, world);
      const one = play(first.career, first.events);
      const other = play(second.career, second.events);
      expect(serialiseCareer(one.career), seed).toBe(serialiseCareer(other.career));
      expect(JSON.stringify(one.events), seed).toBe(JSON.stringify(other.events));
    }
    // Six twenty-year Careers, played and serialised twice over. On Vitest's five-second
    // default that is a test with no headroom: it times out on a loaded machine and says
    // "determinism is broken" when nothing of the kind has happened. Nothing it asserts
    // changed; it is given the room the work actually takes, as `save.test.ts`'s
    // corruption sweep was for the same reason (DL-21).
  }, 60_000);
});

// ── The fleet ────────────────────────────────────────────────────────────────

/** Every number reachable from a value, so NaN and −0 can be hunted for. */
function numbersIn(value: unknown, path: string, found: [string, number][]): void {
  if (typeof value === 'number') {
    found.push([path, value]);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    numbersIn(held, `${path}.${key}`, found);
  }
}

describe('one hundred and sixty Careers, checked against the invariants', () => {
  it(
    'holds every one of them, on every seed',
    () => {
      let injured = 0;
      let scarred = 0;
      let died = 0;
      let retired = 0;
      let departed = 0;

      for (let seed = 0; seed < 160; seed += 1) {
        const name = `e3-verify-${seed}`;
        const opened = newCareer(name, world);
        const run = play(opened.career, opened.events);
        const { career, events } = run;

        // 1. Every Career reaches an ending.
        expect(career.ended, name).toBeDefined();

        // 2. Nobody is on the Roster and in the Guild's history at the same time.
        const onRoster = new Set(career.guild.roster.map((hero) => hero.id));
        const gone = career.guild.formerHeroes.map((hero) => hero.id);
        expect(gone.filter((id) => onRoster.has(id)), name).toEqual([]);
        expect(new Set(gone).size, name).toBe(gone.length);

        // 3. No dead Hero is still named by a Party.
        const buried = new Set(
          career.guild.formerHeroes.filter((hero) => hero.exit?.kind === 'death').map((hero) => hero.id),
        );
        for (const party of career.parties) {
          for (const id of party.heroIds) expect(buried.has(id), `${name}: ${id}`).toBe(false);
        }

        // 4. Every HeroDied is in formerHeroes with an exit that says death.
        for (const event of of(events, 'HeroDied')) {
          const person = career.guild.formerHeroes.find((hero) => hero.id === event.heroId);
          expect(person?.exit?.kind, `${name}: ${event.heroId}`).toBe('death');
          expect(person?.exit?.onDay, `${name}: ${event.heroId}`).toBe(event.day);
        }

        // 5. Ages never go backwards, and nobody on the Roster outlives the line by more
        //    than the year they were on it.
        for (const [id, seen] of run.ages) {
          for (let index = 1; index < seen.length; index += 1) {
            const earlier = seen[index - 1] ?? 0;
            const later = seen[index] ?? 0;
            expect(later, `${name}: ${id} went from ${earlier} to ${later}`).toBeGreaterThanOrEqual(
              earlier,
            );
          }
          for (const age of seen) {
            expect(age, `${name}: ${id}`).toBeLessThanOrEqual(career.config.heroRetirementAge + 1);
            expect(age, `${name}: ${id}`).toBeGreaterThanOrEqual(career.config.heroStartingAgeMin);
          }
        }

        // 6. Nobody is left carrying a Trait whose Day has passed.
        for (const hero of [...career.guild.roster, ...career.guild.formerHeroes]) {
          for (const held of hero.traits) {
            if (held.liftsOn === undefined) continue;
            const left = hero.exit?.onDay ?? career.day;
            expect(held.liftsOn, `${name}: ${hero.id} kept ${held.name}`).toBeGreaterThan(left);
          }
        }

        // 7. The Hall holds no improvement twice.
        expect(new Set(career.guild.hall).size, name).toBe(career.guild.hall.length);
        for (const improvement of career.guild.hall) {
          expect(HALL_IMPROVEMENTS, name).toContain(improvement);
        }

        // 8. Coin never moved without a CoinChanged accounting for it, over the whole
        //    Career: the opening balance plus every reported delta is the closing one.
        const moved = of(events, 'CoinChanged').reduce((sum, event) => sum + event.delta, 0);
        expect(career.config.startingCoin + moved, `${name}: coin`).toBe(career.guild.coin);
        // And each event's own balance is the running total.
        let running = career.config.startingCoin;
        for (const event of of(events, 'CoinChanged')) {
          running += event.delta;
          expect(event.balance, `${name}: balance on Day ${event.day}`).toBe(running);
        }

        // 9. The ledger counts exactly the events it claims to count.
        expect(career.ledger.heroesInjured, name).toBe(of(events, 'HeroInjured').length);
        expect(career.ledger.heroesScarred, name).toBe(of(events, 'HeroScarred').length);
        expect(career.ledger.heroesDied, name).toBe(of(events, 'HeroDied').length);
        // Scoped to this Guild's own people from E5: a Rival's Hero retires by the same
        // rule and emits the same event (E5-S1), and `ledger.heroesRetired` has always
        // counted Heroes who retired out of the PLAYER's Roster.
        expect(career.ledger.heroesRetired, name).toBe(
          of(events, 'HeroRetired').filter((event) =>
            career.guild.formerHeroes.some(
              (hero) => hero.id === event.heroId && hero.exit?.kind === 'retirement',
            ),
          ).length,
        );
        expect(career.ledger.departures, name).toBe(of(events, 'HeroDeparted').length);
        expect(career.ended?.reckoning.heroesRetired, name).toBe(career.ledger.heroesRetired);
        expect(career.ended?.reckoning.heroesLost, name).toBe(
          career.guild.formerHeroes.filter((hero) => hero.exit?.kind !== 'retirement').length,
        );

        // 10. No NaN and no negative zero anywhere in the world state.
        const found: [string, number][] = [];
        numbersIn(career, 'career', found);
        for (const [path, value] of found) {
          expect(Number.isNaN(value), `${name}: ${path} is NaN`).toBe(false);
          expect(Object.is(value, -0), `${name}: ${path} is -0`).toBe(false);
        }

        injured += career.ledger.heroesInjured;
        scarred += career.ledger.heroesScarred;
        died += career.ledger.heroesDied;
        retired += career.ledger.heroesRetired;
        departed += career.ledger.departures;
      }

      // The fleet actually exercised what it claims to: harm and every exit are reached.
      expect(injured).toBeGreaterThan(0);
      expect(scarred).toBeGreaterThan(0);
      expect(died).toBeGreaterThan(0);
      expect(retired).toBeGreaterThan(0);
      expect(departed + died + retired).toBeGreaterThan(0);
    },
    900_000,
  );
});
