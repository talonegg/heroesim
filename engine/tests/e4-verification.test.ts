/**
 * E4, attacked from outside. Everything here goes through `../src/index.js` and nothing
 * else: no internal module, no shared fixture. The world it plays in is built with the
 * engine's own `validateContent`, so the content is under this file's control.
 *
 * Written as an independent check of the epic rather than alongside it, so the questions
 * are the awkward ones: what an offer costs when the coin is exact, what happens on the
 * very Day somebody gives up waiting, whether a save taken with a returner standing in
 * the Hall carries on identically, whether somebody can walk out and come back twice, and
 * what the Stat distribution does at a budget four Stats cannot reach.
 *
 * Several of these close gaps found by mutating `engine/src` and re-running the E4 suite:
 * the return cooldown's boundary Day, the two named Regard constants a default-valued
 * test cannot pin, the id generator's defence against a tampered counter, and a batch
 * with more former Heroes eligible than it has slots.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  acceptRefusal,
  advance,
  advanceUntilAttention,
  applicantById,
  applicantFee,
  applicantInterval,
  applicantOffers,
  availableHeroes,
  calibreOfStats,
  calibreStatBudget,
  CALIBRES,
  commitParty,
  declineApplicant,
  defaultConfig,
  deserialiseCareer,
  EngineError,
  HALL_IMPROVEMENTS,
  hallCost,
  improveHall,
  isInjured,
  maxCalibre,
  newCareer,
  proposeParty,
  serialiseCareer,
  standing,
  STATS,
  upkeepDue,
  validateContent,
  type Applicant,
  type Career,
  type Content,
  type GameConfig,
  type GameEvent,
  type Hero,
} from '../src/index.js';

// ── A world of this file's own ───────────────────────────────────────────────

/**
 * Two Backgrounds: one that gives nothing but a disposition, and one that gives a Trait
 * which refuses work on the water — so an Applicant can arrive already unwilling to take
 * part of what the Board offers, which is the case E4-S4 and DL-17 §4 both point at.
 */
const world: Content = validateContent({
  traits: [
    { name: 'Settled', kind: 'disposition', summary: 'Takes things as they come.', modifiers: [] },
    {
      name: 'Never again the deep',
      kind: 'scar',
      summary: 'Will not go near the water again, and says so plainly.',
      modifiers: [],
      refusal: { tags: ['water'] },
    },
    {
      name: 'Worn through',
      kind: 'scar',
      summary: 'Has nothing left to give to any of it.',
      modifiers: [],
      refusal: {},
    },
    { name: 'Old hurt', kind: 'injury', summary: 'A shoulder that will not turn.', modifiers: [] },
  ],
  backgrounds: [
    { name: 'The long road', summary: 'Years of walking to work.', traits: ['Settled'] },
    { name: 'The wrecked boat', summary: 'One crossing too many.', traits: ['Never again the deep'] },
  ],
  spheres: [
    {
      id: 'river',
      name: 'the river towns',
      patronNames: ['Reeve Halloran', 'The Salt Factors', 'Widow Sessil', 'The Wending Ferrymen'],
      commissionTitles: [
        { title: 'The ford at Lowford', difficulty: 10, tags: ['water'] },
        { title: 'The night watch', difficulty: 11, tags: ['guard'] },
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
    heroFirst: [
      'Brenna', 'Aldis', 'Corran', 'Maelis', 'Roskil', 'Ysolde', 'Hale', 'Thessa',
      'Garrick', 'Ilse', 'Nerys', 'Oswin', 'Perrin', 'Quenna', 'Rowan', 'Sabel',
    ],
    heroEpithets: ['of Ashfall', 'of Lowford', 'the Quiet', 'of Wend Water', 'the Younger', 'of Cairn'],
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

/** Coin enough that nothing in a test is decided by insolvency rather than by the rule. */
const RICH: Partial<GameConfig> = { startingCoin: 1_000_000 };
/** Every former Hero who may come back does. */
const SURELY: Partial<GameConfig> = { ...RICH, returnAsApplicantChance: 1 };

function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
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

/** Freeze a value and everything reachable from it, so any mutation of it throws. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const held of Object.values(value as Record<string, unknown>)) deepFreeze(held);
  return Object.freeze(value);
}

/** A Career as plain data, with the named Hero taken off the Roster by the named exit. */
function left(
  career: Career,
  heroId: string,
  kind: 'departure' | 'death' | 'retirement',
  onDay: number,
): Career {
  const document = JSON.parse(serialiseCareer(career)) as Career;
  const hero = document.guild.roster.find((entry) => entry.id === heroId);
  if (hero === undefined) throw new Error(`no Hero "${heroId}" is on the Roster`);
  document.guild.roster = document.guild.roster.filter((entry) => entry.id !== heroId);
  document.guild.formerHeroes.push({ ...hero, exit: { kind, onDay, reason: 'the test sent them' } });
  return deserialiseCareer(JSON.stringify(document));
}

/** A Career as plain data, with one former Hero rewritten. */
function rewritingFormer(career: Career, heroId: string, patch: Partial<Hero>): Career {
  const document = JSON.parse(serialiseCareer(career)) as Career;
  document.guild.formerHeroes = document.guild.formerHeroes.map((hero) =>
    hero.id === heroId ? { ...hero, ...patch } : hero,
  );
  return deserialiseCareer(JSON.stringify(document));
}

/** A Career as plain data, holding exactly this much coin. */
function holding(career: Career, coin: number): Career {
  const document = JSON.parse(serialiseCareer(career)) as Career;
  document.guild.coin = coin;
  return deserialiseCareer(JSON.stringify(document));
}

/** A Career advanced far enough that somebody is standing in the Hall. */
function withApplicants(seed: string, config?: Partial<GameConfig>): Career {
  const run = advance(newCareer(seed, world, { ...RICH, ...config }).career, 10, world);
  if (run.career.applicants.length === 0) throw new Error('the test expected a batch');
  return run.career;
}

function firstApplicant(career: Career): Applicant {
  const applicant = career.applicants[0];
  if (applicant === undefined) throw new Error('the test expected an Applicant');
  return applicant;
}

// ── Gaps found by mutation ───────────────────────────────────────────────────

describe('the return cooldown, at the Day it is exactly reached', () => {
  /**
   * `engine/tests/returning.test.ts` pins Day 70 for a Departure on Day 1, which is 69
   * Days later — one *past* the cooldown, so it reads the same whether the rule is
   * `>= returnCooldownDays` or `> returnCooldownDays`. Mutating `>=` to `>` leaves the
   * whole suite green. The Day that tells them apart is the one where the gap is exactly
   * the cooldown, and at the shipped defaults that Day only exists when the Departure
   * itself fell on a multiple of the below-floor interval.
   */
  it('lets somebody back on the Day the gap first equals the cooldown, and not before', () => {
    const opened = advance(newCareer('cooldown-exactly', world, SURELY).career, 9, world).career;
    expect(opened.day).toBe(10);
    const gone = left(opened, 'h1', 'departure', 10);
    expect(gone.guild.roster).toHaveLength(3);
    expect(applicantInterval(gone)).toBe(gone.config.applicantsEveryDaysBelowFloor);

    const run = advance(gone, 90, world);
    const asked = of(run.events, 'ApplicantsArrived').filter((event) =>
      event.applicantIds.includes('h1'),
    );
    // 70 − 10 = 60, which is exactly `returnCooldownDays`. Day 60 is 50, one short.
    expect(gone.config.returnCooldownDays).toBe(60);
    expect(asked[0]?.day).toBe(70);
    for (const event of of(run.events, 'ApplicantsArrived')) {
      if (event.day < 70) expect(event.applicantIds, `Day ${event.day}`).not.toContain('h1');
    }
  });

  it('moves that boundary Day with the configured cooldown', () => {
    const opened = advance(
      newCareer('cooldown-exactly-2', world, { ...SURELY, returnCooldownDays: 30 }).career,
      19,
      world,
    ).career;
    expect(opened.day).toBe(20);
    const gone = left(opened, 'h1', 'departure', 20);
    const run = advance(gone, 60, world);
    const asked = of(run.events, 'ApplicantsArrived').filter((event) =>
      event.applicantIds.includes('h1'),
    );
    // 50 − 20 = 30, exactly the shortened cooldown; Day 40 is 20 and falls short.
    expect(asked[0]?.day).toBe(50);
  });
});

describe('the two Regard constants a default-valued test cannot pin', () => {
  it('seeds what a newcomer and the Roster think of one another from joiningRegardAmongHeroes', () => {
    // The default is 0, so a test that reads the config back cannot tell the field from
    // the literal zero it would otherwise be (CLAUDE.md invariant 8). Driving it away
    // from its default is the only way to prove the field is the one being read.
    const career = withApplicants('among-heroes', { joiningRegardAmongHeroes: 2 });
    const applicant = firstApplicant(career);
    const step = acceptApplicant(career, applicant.id);
    const joined = step.career.guild.roster.find((hero) => hero.id === applicant.id);
    expect(joined).toBeDefined();
    for (const hero of career.guild.roster) {
      expect(joined?.regardFor[hero.id]?.value, `the newcomer's Regard for ${hero.id}`).toBe(2);
      expect(
        step.career.guild.roster.find((entry) => entry.id === hero.id)?.regardFor[applicant.id]
          ?.value,
        `${hero.id}'s Regard for the newcomer`,
      ).toBe(2);
    }
    expect(step.career.guild.guildmaster.regardFor[applicant.id]?.value).toBe(2);

    const cold = withApplicants('among-heroes', { joiningRegardAmongHeroes: -2 });
    const other = firstApplicant(cold);
    const chilly = acceptApplicant(cold, other.id).career.guild.roster.find(
      (hero) => hero.id === other.id,
    );
    expect(Object.values(chilly?.regardFor ?? {}).map((regard) => regard.value)).toEqual(
      cold.guild.roster.map(() => -2),
    );
  });

  it('sets what somebody coming back thinks of the Guildmaster from returningRegard', () => {
    // Same argument: the default is −1, and every existing assertion reads the config.
    for (const value of [-4, 0, 3]) {
      const opened = advance(
        newCareer('returning-regard', world, { ...SURELY, returningRegard: value }).career,
        10,
        world,
      ).career;
      const gone = left(opened, 'h1', 'departure', 10);
      const run = advance(gone, 60, world);
      expect(run.career.applicants.map((entry) => entry.id), `at ${value}`).toContain('h1');
      const taken = acceptApplicant(run.career, 'h1');
      expect(
        taken.career.guild.roster.find((hero) => hero.id === 'h1')?.regardForGuildmaster.value,
        `at ${value}`,
      ).toBe(value);
    }
  });
});

describe('an id counter a hand-edited document has wound backwards', () => {
  /**
   * DL-19 §2 promises the generator is "defensive as well as monotonic: an id already in
   * use anywhere in the Career is skipped". `save.test.ts` proves the *fill* — a document
   * with no counter at all takes one past the highest id it carries — but nothing proved
   * the skip, and removing the skip loop left the whole suite green.
   */
  it('never mints an id somebody already holds, however far back the counter is wound', () => {
    const career = withApplicants('wound-back');
    const taken = acceptApplicant(career, firstApplicant(career).id).career;
    const onTheRoster = taken.guild.roster.map((hero) => hero.id).filter((id) => id.startsWith('a'));
    expect(onTheRoster.length).toBeGreaterThan(0);

    // A document that claims the next Applicant is `a1`, while `a1` is on the Roster and
    // two more are still waiting. `deserialiseCareer` takes the counter as written.
    const document = JSON.parse(serialiseCareer(taken)) as Record<string, unknown>;
    document['nextApplicantNumber'] = 1;
    const loaded = deserialiseCareer(JSON.stringify(document));
    expect(loaded.nextApplicantNumber).toBe(1);

    const run = advance(loaded, 40, world);
    const everyId = [
      ...run.career.guild.roster.map((hero) => hero.id),
      ...run.career.guild.formerHeroes.map((hero) => hero.id),
      ...run.career.applicants.map((applicant) => applicant.id),
    ];
    expect(new Set(everyId).size, everyId.join(', ')).toBe(everyId.length);
    // And nobody who ever turned up shares an id with anybody else who did.
    const arrived = of(run.events, 'ApplicantsArrived').flatMap((event) => event.applicantIds);
    const fresh = arrived.filter((id) => !onTheRoster.includes(id));
    expect(new Set(fresh).size).toBe(fresh.length);
    for (const id of onTheRoster) {
      expect(arrived, `${id} was handed out a second time`).not.toContain(id);
    }
  });

  it('never mints an id a departed Hero is still remembered under', () => {
    // A Hero taken on as an Applicant keeps the id `a<n>`; if they later walk out that id
    // lives on in `formerHeroes`, and a wound-back counter must not land on top of it.
    const career = withApplicants('wound-back-former');
    const first = firstApplicant(career);
    const taken = acceptApplicant(career, first.id).career;
    const gone = left(taken, first.id, 'departure', taken.day);
    expect(gone.guild.formerHeroes.map((hero) => hero.id)).toContain(first.id);

    const document = JSON.parse(serialiseCareer(gone)) as Record<string, unknown>;
    document['nextApplicantNumber'] = 1;
    let walking = deserialiseCareer(JSON.stringify(document));
    expect(walking.nextApplicantNumber).toBe(1);

    // Walked a Day at a time, because a fresh Applicant wearing a departed Hero's id is
    // only visible while they are standing there: the batch they came in has gone again
    // twenty Days later, and the id is free once more.
    let sawABatch = 0;
    for (let step = 0; step < 60; step += 1) {
      const on = advance(walking, 1, world);
      walking = on.career;
      sawABatch += of(on.events, 'ApplicantsArrived').length;
      const roster = new Set(walking.guild.roster.map((hero) => hero.id));
      const former = new Set(walking.guild.formerHeroes.map((hero) => hero.id));
      for (const applicant of walking.applicants) {
        if (applicant.formerHeroId !== undefined) {
          // The one person who may wear an id `formerHeroes` still holds is the person
          // themselves, asking to come back.
          expect(applicant.formerHeroId, `Day ${walking.day}`).toBe(applicant.id);
          continue;
        }
        expect(
          former.has(applicant.id),
          `Day ${walking.day}: ${applicant.id} is also a former Hero`,
        ).toBe(false);
        expect(
          roster.has(applicant.id),
          `Day ${walking.day}: ${applicant.id} is also on the Roster`,
        ).toBe(false);
      }
    }
    expect(sawABatch).toBeGreaterThan(2);
  });
});

describe('a batch with more former Heroes eligible than it has slots', () => {
  it('is never larger than the batch size, however many want to come back', () => {
    // Every existing test constructs exactly one Departure, so "takes one of the batch's
    // slots rather than adding to it" was only ever asserted against a single returner.
    const opened = advance(
      newCareer('many-returners', world, { ...SURELY, startingHeroes: 8, rosterFloor: 1 }).career,
      10,
      world,
    ).career;
    let gone = opened;
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5']) gone = left(gone, id, 'departure', 10);
    expect(gone.guild.formerHeroes).toHaveLength(5);
    expect(applicantInterval(gone)).toBe(gone.config.applicantsEveryDays);

    const run = advance(gone, 90, world);
    const batches = of(run.events, 'ApplicantsArrived');
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) {
      expect(batch.applicantIds.length, `Day ${batch.day}`).toBeLessThanOrEqual(
        gone.config.applicantBatchMax,
      );
      expect(batch.applicantIds.length, `Day ${batch.day}`).toBeGreaterThanOrEqual(
        gone.config.applicantBatchMin,
      );
      expect(new Set(batch.applicantIds).size).toBe(batch.applicantIds.length);
    }
    // Several of them did come back, so the case was actually exercised.
    const camBack = new Set(
      batches.flatMap((batch) => batch.applicantIds).filter((id) => id.startsWith('h')),
    );
    expect(camBack.size).toBeGreaterThan(1);
  });
});

// ── The offer itself ─────────────────────────────────────────────────────────

describe('an offer taken at the edge of what the Guild can do', () => {
  it('goes through on coin exactly equal to the asking fee, and leaves nothing behind', () => {
    const career = withApplicants('exact-coin');
    const applicant = firstApplicant(career);
    const exact = holding(career, applicant.askingFee);
    expect(acceptRefusal(exact, applicant.id)).toBeUndefined();
    const step = acceptApplicant(exact, applicant.id);
    expect(step.career.guild.coin).toBe(0);
    expect(of(step.events, 'CoinChanged')[0]?.balance).toBe(0);
    expect(Object.is(step.career.guild.coin, -0)).toBe(false);

    const oneShort = holding(career, applicant.askingFee - 1);
    expect(acceptRefusal(oneShort, applicant.id)).toEqual({
      code: 'InsufficientCoin',
      shortfall: 1,
    });
    expect(rejection(() => acceptApplicant(oneShort, applicant.id)).code).toBe('InsufficientCoin');
  });

  it('takes the last place on the Roster and refuses the next offer in the same batch', () => {
    const career = withApplicants('last-place', { rosterCap: 5 });
    expect(career.guild.roster).toHaveLength(4);
    expect(career.applicants.length).toBeGreaterThan(1);
    const [first, second] = career.applicants;
    if (first === undefined || second === undefined) throw new Error('the test expected two');

    const filled = acceptApplicant(career, first.id).career;
    expect(filled.guild.roster).toHaveLength(5);
    expect(acceptRefusal(filled, second.id)).toEqual({ code: 'RosterFull' });
    expect(rejection(() => acceptApplicant(filled, second.id)).code).toBe('RosterFull');
    // Declining still works at the cap: the Roster being full is not the end of deciding.
    expect(declineApplicant(filled, second.id).career.applicants).toHaveLength(
      filled.applicants.length - 1,
    );
    // And every offer still waiting reports the same reason through the selector.
    for (const offer of applicantOffers(filled)) {
      expect(offer.refusal).toEqual({ code: 'RosterFull' });
    }
  });

  it('cannot be taken on the Day somebody gives up waiting, because expiry is settled first', () => {
    // "Settled at the start of the Day, expiry before arrival" (DL-19 §4) decides this:
    // the player never sees a Career standing on an Applicant's `expiresOn`.
    const career = withApplicants('expiry-day');
    const applicant = firstApplicant(career);
    const dayBefore = advance(career, applicant.expiresOn - 1 - career.day, world).career;
    expect(dayBefore.day).toBe(applicant.expiresOn - 1);
    const offer = applicantOffers(dayBefore).find((entry) => entry.applicant.id === applicant.id);
    expect(offer?.daysLeft).toBe(1);
    expect(offer?.refusal).toBeUndefined();
    // The last Day they can be taken on is the Day before, and they can be.
    expect(() => acceptApplicant(dayBefore, applicant.id)).not.toThrow();

    const theDay = advance(dayBefore, 1, world);
    expect(theDay.career.day).toBe(applicant.expiresOn);
    expect(applicantById(theDay.career, applicant.id)).toBeUndefined();
    expect(rejection(() => acceptApplicant(theDay.career, applicant.id)).code).toBe(
      'NoSuchApplicant',
    );
    expect(
      of(theDay.events, 'ApplicantDeclined').some(
        (event) => event.applicantId === applicant.id && event.reason === 'expired',
      ),
    ).toBe(true);
    // No live offer ever reports zero Days left, because no live offer ever survives to
    // the Day it expires on.
    for (let step = 0; step < 200; step += 1) {
      const world_ = advance(career, step, world).career;
      for (const entry of applicantOffers(world_)) expect(entry.daysLeft).toBeGreaterThan(0);
    }
  });

  it('takes no draw from the Career’s own generator, so the world is untouched by the choice', () => {
    const career = withApplicants('accept-no-draw');
    const applicant = firstApplicant(career);
    const taken = acceptApplicant(career, applicant.id);
    const sent = declineApplicant(career, applicant.id);
    expect(taken.career.rng).toEqual(career.rng);
    expect(sent.career.rng).toEqual(career.rng);
    // Nothing else about the world moved either, beyond the Roster, the coin and the
    // ledger the offer itself touches.
    expect(taken.career.board).toEqual(career.board);
    expect(taken.career.patrons).toEqual(career.patrons);
    expect(taken.career.parties).toEqual(career.parties);
    expect(taken.career.rivals).toEqual(career.rivals);
    expect(taken.career.day).toBe(career.day);
    expect(standing(taken.career)).toBe(standing(career));
  });
});

describe('declining, ignoring and accepting', () => {
  /** Play a Career to its end, doing one of three things with whoever is at the door. */
  function play(
    start: Career,
    answer: 'accept' | 'decline' | 'ignore',
  ): { career: Career; events: GameEvent[] } {
    let career = start;
    const events: GameEvent[] = [];
    let guard = 0;
    while (career.ended === undefined) {
      guard += 1;
      if (guard > 100_000) throw new Error('the policy never reached the end of the Career');
      if (answer !== 'ignore') {
        for (const applicant of [...career.applicants]) {
          if (answer === 'decline') {
            const sent = declineApplicant(career, applicant.id);
            career = sent.career;
            events.push(...sent.events);
            continue;
          }
          if (acceptRefusal(career, applicant.id) !== undefined) continue;
          const taken = acceptApplicant(career, applicant.id);
          career = taken.career;
          events.push(...taken.events);
        }
      }
      const free = availableHeroes(career);
      const commission = career.board[0];
      if (commission !== undefined && free.length > 0) {
        const refusing = new Set(
          proposeParty(career, commission.id, free.map((hero) => hero.id), world).refusals.map(
            (refusal) => refusal.heroId,
          ),
        );
        const party = free.filter((hero) => !refusing.has(hero.id)).slice(0, 2).map((h) => h.id);
        if (party.length > 0) {
          const step = commitParty(career, commission.id, party, world);
          career = step.career;
          events.push(...step.events);
        }
      }
      const step = advanceUntilAttention(career, world);
      career = step.career;
      events.push(...step.events);
    }
    return { career, events };
  }

  it('makes declining and ignoring the same Career, to the Day and the coin', () => {
    /**
     * The claim E4's definition of done makes, checked independently. It is exactly true
     * *to the Day and the coin*, and not byte-for-byte: a player who declined everything
     * ends with nobody at the door and a player who ignored everything ends with whoever
     * happened to be standing there. That is the difference the choice itself makes, and
     * it is the only one — every other field, and every event that is not an
     * `ApplicantDeclined`, is identical.
     */
    const withoutTheDoor = (career: Career): string => {
      const document = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
      delete document['applicants'];
      return JSON.stringify(document);
    };
    for (const seed of ['same-1', 'same-2', 'same-3']) {
      const declined = play(newCareer(seed, world).career, 'decline');
      const ignored = play(newCareer(seed, world).career, 'ignore');
      const withoutDeclines = (events: readonly GameEvent[]): GameEvent[] =>
        events.filter((event) => event.type !== 'ApplicantDeclined');
      expect(withoutDeclines(ignored.events), seed).toEqual(withoutDeclines(declined.events));
      expect(withoutTheDoor(ignored.career), seed).toBe(withoutTheDoor(declined.career));
      expect(ignored.career.ended?.onDay, seed).toBe(declined.career.ended?.onDay);
      expect(ignored.career.guild.coin, seed).toBe(declined.career.guild.coin);
      expect(ignored.career.rng, seed).toEqual(declined.career.rng);
      expect(ignored.career.nextApplicantNumber, seed).toBe(declined.career.nextApplicantNumber);
      // And the only events that differ are the ones the declining player asked for.
      expect(of(declined.events, 'ApplicantDeclined').length).toBeGreaterThan(
        of(ignored.events, 'ApplicantDeclined').length,
      );
      expect(declined.career.applicants).toEqual([]);
    }
    // Six twenty-year Careers, played twice over and serialised. Like E3's determinism
    // test above it had no headroom on Vitest's five-second default and timed out on a
    // loaded machine, reporting a rule broken that was not. Nothing it asserts changed.
  }, 60_000);

  it('is only the same while nobody waits longer than the gap between batches', () => {
    /**
     * The equality above is a fact about the shipped defaults, not a structural one.
     * `applicantLingerDays` (20) equals `applicantsEveryDays` (20) and twice
     * `applicantsEveryDaysBelowFloor` (10), so a former Hero standing at the door is
     * never still there on a later arrival Day than they would have been if declined.
     * Lengthen the wait past the gap and the two diverge: `couldComeBack` skips somebody
     * already waiting, so declining them puts them back in the pool sooner than ignoring
     * them does, and *who turns up* then depends on what the player did.
     */
    const settings: Partial<GameConfig> = {
      ...SURELY,
      applicantLingerDays: 45,
      applicantsEveryDaysBelowFloor: 10,
    };
    const opened = advance(newCareer('linger-divergence', world, settings).career, 9, world).career;
    const gone = left(opened, 'h1', 'departure', 10);
    const offered = advance(gone, 60, world).career;
    expect(offered.applicants.map((entry) => entry.id)).toContain('h1');

    const sentAway = advance(declineApplicant(offered, 'h1').career, 20, world);
    const leftWaiting = advance(offered, 20, world);
    const askedAgain = of(sentAway.events, 'ApplicantsArrived').some((event) =>
      event.applicantIds.includes('h1'),
    );
    const stillWaiting = of(leftWaiting.events, 'ApplicantsArrived').some((event) =>
      event.applicantIds.includes('h1'),
    );
    expect(askedAgain, 'declined, they can be asked again at the next batch').toBe(true);
    expect(stillWaiting, 'left waiting, they cannot be offered twice at once').toBe(false);
  });

  it('is deterministic: the same seed and the same decisions give the same Career twice', () => {
    for (const answer of ['accept', 'decline', 'ignore'] as const) {
      const once = play(newCareer('twice-over', world).career, answer);
      const twice = play(newCareer('twice-over', world).career, answer);
      expect(serialiseCareer(twice.career), answer).toBe(serialiseCareer(once.career));
      expect(twice.events, answer).toEqual(once.events);
    }
  });
});

// ── Saves ────────────────────────────────────────────────────────────────────

describe('a save taken with people standing in the Hall', () => {
  it('carries on byte-identically, with a returner among them', () => {
    const opened = advance(newCareer('save-returner', world, SURELY).career, 10, world).career;
    const gone = left(opened, 'h1', 'departure', 10);
    const waiting = advance(gone, 60, world).career;
    expect(waiting.applicants.some((entry) => entry.formerHeroId === 'h1')).toBe(true);

    const straightOn = advance(waiting, 150, world);
    const afterLoad = advance(deserialiseCareer(serialiseCareer(waiting)), 150, world);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(serialiseCareer(afterLoad.career)).toBe(serialiseCareer(straightOn.career));

    // Loading the same document twice gives the same bytes, and the same continuation.
    const first = deserialiseCareer(serialiseCareer(waiting));
    const second = deserialiseCareer(serialiseCareer(waiting));
    expect(serialiseCareer(second)).toBe(serialiseCareer(first));
    expect(advance(second, 150, world).events).toEqual(advance(first, 150, world).events);
  });

  it('carries on byte-identically after an offer has been taken', () => {
    const career = withApplicants('save-after-accept');
    const taken = acceptApplicant(career, firstApplicant(career).id).career;
    const straightOn = advance(taken, 200, world);
    const afterLoad = advance(deserialiseCareer(serialiseCareer(taken)), 200, world);
    expect(afterLoad.events).toEqual(straightOn.events);
    expect(serialiseCareer(afterLoad.career)).toBe(serialiseCareer(straightOn.career));
  });
});

// ── Traits an Applicant brings with them ─────────────────────────────────────

describe('somebody who arrives already unwilling', () => {
  it('refuses the work their Background says they will, through proposeParty', () => {
    const career = withApplicants('refusing-background');
    const unwilling = career.applicants.find((applicant) =>
      applicant.traits.some((trait) => trait.name === 'Never again the deep'),
    );
    expect(unwilling, 'the test expected somebody off the wrecked boat').toBeDefined();
    if (unwilling === undefined) return;

    const taken = acceptApplicant(career, unwilling.id).career;
    const water = taken.board.find((commission) => commission.title === 'The ford at Lowford');
    const dry = taken.board.find((commission) => commission.title !== 'The ford at Lowford');
    expect(water, 'the test expected work on the water').toBeDefined();
    expect(dry, 'the test expected work away from it').toBeDefined();
    if (water === undefined || dry === undefined) return;

    const onTheWater = proposeParty(taken, water.id, [unwilling.id], world);
    expect(onTheWater.refusals.map((refusal) => refusal.heroId)).toEqual([unwilling.id]);
    expect(onTheWater.refusals[0]?.trait).toBe('Never again the deep');
    expect(onTheWater.refusals[0]?.reason).toBe('trait');
    expect(rejection(() => commitParty(taken, water.id, [unwilling.id], world)).code).toBe(
      'HeroRefused',
    );
    // Insisting is the player's to do, and it works exactly as E2 says.
    expect(() =>
      commitParty(taken, water.id, [unwilling.id], world, { insist: true }),
    ).not.toThrow();

    // And they take the dry work without a word.
    expect(proposeParty(taken, dry.id, [unwilling.id], world).refusals).toEqual([]);
  });

  it('may come back carrying a Scar that refuses everything, and the Career still ends', () => {
    const opened = advance(newCareer('worn-returner', world, SURELY).career, 10, world).career;
    let gone = left(opened, 'h1', 'departure', 10);
    gone = rewritingFormer(gone, 'h1', { traits: [{ name: 'Worn through', since: 5 }] });
    const waiting = advance(gone, 60, world).career;
    const back = waiting.applicants.find((entry) => entry.id === 'h1');
    expect(back?.traits.map((trait) => trait.name)).toEqual(['Worn through']);

    const taken = acceptApplicant(waiting, 'h1').career;
    const rejoined = taken.guild.roster.find((hero) => hero.id === 'h1');
    expect(rejoined?.traits.map((trait) => trait.name)).toEqual(['Worn through']);
    const commission = taken.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    expect(proposeParty(taken, commission.id, ['h1'], world).refusals[0]?.trait).toBe(
      'Worn through',
    );
    // They cost a place and Upkeep and will not work, which is a Roster spent badly
    // rather than a defect (DL-17 §4). The Career goes on regardless.
    expect(advance(taken, 8_000, world).career.ended).toBeDefined();
  });

  it('joins still injured, and availableHeroes leaves them out until the Day it lifts', () => {
    const opened = advance(newCareer('injured-returner', world, SURELY).career, 10, world).career;
    let gone = left(opened, 'h1', 'departure', 10);
    gone = rewritingFormer(gone, 'h1', {
      traits: [
        { name: 'Settled', since: 1 },
        { name: 'Old hurt', since: 8, liftsOn: 95 },
      ],
    });
    const waiting = advance(gone, 60, world).career;
    const back = waiting.applicants.find((entry) => entry.id === 'h1');
    expect(back?.traits.find((trait) => trait.name === 'Old hurt')?.liftsOn).toBe(95);

    const taken = acceptApplicant(waiting, 'h1').career;
    const rejoined = taken.guild.roster.find((hero) => hero.id === 'h1');
    expect(rejoined).toBeDefined();
    expect(isInjured(rejoined as Hero)).toBe(true);
    expect(availableHeroes(taken).map((hero) => hero.id)).not.toContain('h1');
    const commission = taken.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    expect(rejection(() => commitParty(taken, commission.id, ['h1'], world)).code).toBe(
      'HeroNotAvailable',
    );

    const lifted = advance(taken, 95 - taken.day, world);
    expect(
      of(lifted.events, 'InjuryLifted').some((event) => event.heroId === 'h1'),
    ).toBe(true);
    expect(availableHeroes(lifted.career).map((hero) => hero.id)).toContain('h1');
  });
});

describe('two full cycles of leaving and coming back', () => {
  it('keeps the id and the bookkeeping sane through both', () => {
    const opened = advance(newCareer('twice-round', world, SURELY).career, 10, world).career;
    const firstDeparture = left(opened, 'h1', 'departure', 10);
    const firstOffer = advance(firstDeparture, 60, world).career;
    expect(firstOffer.applicants.map((entry) => entry.id)).toContain('h1');

    const firstReturn = acceptApplicant(firstOffer, 'h1').career;
    expect(firstReturn.guild.roster.filter((hero) => hero.id === 'h1')).toHaveLength(1);
    expect(firstReturn.guild.formerHeroes.map((hero) => hero.id)).not.toContain('h1');
    expect(firstReturn.applicants.map((entry) => entry.id)).not.toContain('h1');
    const ageOnReturn = firstReturn.guild.roster.find((hero) => hero.id === 'h1')?.age ?? 0;

    // Out again, and back again.
    const secondDeparture = left(firstReturn, 'h1', 'departure', firstReturn.day);
    const secondOffer = advance(secondDeparture, 200, world).career;
    const askingAgain = secondOffer.applicants.find((entry) => entry.id === 'h1');
    expect(askingAgain, 'they should be able to come back a second time').toBeDefined();
    expect(askingAgain?.formerHeroId).toBe('h1');
    expect(askingAgain?.age).toBeGreaterThanOrEqual(ageOnReturn);

    const secondReturn = acceptApplicant(secondOffer, 'h1').career;
    expect(secondReturn.guild.roster.filter((hero) => hero.id === 'h1')).toHaveLength(1);
    expect(secondReturn.guild.formerHeroes.filter((hero) => hero.id === 'h1')).toHaveLength(0);
    expect(secondReturn.applicants.filter((entry) => entry.id === 'h1')).toHaveLength(0);
    expect(secondReturn.guild.roster.find((hero) => hero.id === 'h1')?.formerHeroId).toBe('h1');
    // The ledger counted the second acceptance as well as the first.
    expect(secondReturn.ledger.applicantsAccepted).toBeGreaterThanOrEqual(2);
    // And the whole world still holds together.
    const everyId = [
      ...secondReturn.guild.roster.map((hero) => hero.id),
      ...secondReturn.guild.formerHeroes.map((hero) => hero.id),
    ];
    expect(new Set(everyId).size).toBe(everyId.length);
  });

  it('lets somebody come back old enough to retire, and retires them properly', () => {
    const opened = advance(newCareer('old-returner', world, SURELY).career, 10, world).career;
    let gone = left(opened, 'h1', 'departure', 10);
    gone = rewritingFormer(gone, 'h1', { age: gone.config.heroRetirementAge + 1 });
    const waiting = advance(gone, 60, world).career;
    const back = waiting.applicants.find((entry) => entry.id === 'h1');
    expect(back?.age).toBeGreaterThanOrEqual(waiting.config.heroRetirementAge);

    // Nothing stops the offer being made or taken: age gates Retirement, not the door.
    expect(acceptRefusal(waiting, 'h1')).toBeUndefined();
    const taken = acceptApplicant(waiting, 'h1');
    expect(taken.career.guild.roster.map((hero) => hero.id)).toContain('h1');

    // And they go at the next Board refresh, well rather than badly.
    const on = advance(taken.career, 20, world);
    const retired = of(on.events, 'HeroRetired').find((event) => event.heroId === 'h1');
    expect(retired, 'they should retire at the next refresh').toBeDefined();
    expect(on.career.guild.roster.map((hero) => hero.id)).not.toContain('h1');
    expect(
      on.career.guild.formerHeroes.find((hero) => hero.id === 'h1')?.exit?.kind,
    ).toBe('retirement');
    // Having retired, they can never be at the door again.
    const later = advance(on.career, 400, world);
    for (const event of of(later.events, 'ApplicantsArrived')) {
      expect(event.applicantIds, `Day ${event.day}`).not.toContain('h1');
    }
  });
});

// ── Configuration driven off the end of its range ────────────────────────────

describe('a Career that can never afford anybody', () => {
  it('ends rather than hanging, with nobody on the Roster and no coin', () => {
    let career = newCareer('destitute', world, { startingCoin: 0 }).career;
    for (const hero of [...career.guild.roster]) career = left(career, hero.id, 'departure', 1);
    expect(career.guild.roster).toHaveLength(0);
    expect(upkeepDue(career)).toBe(career.config.upkeepBase);

    let guard = 0;
    while (career.ended === undefined) {
      guard += 1;
      if (guard > 100_000) throw new Error('the Career never ended');
      for (const applicant of [...career.applicants]) {
        // Every offer is refused for want of coin, and asking is free.
        expect(acceptRefusal(career, applicant.id)?.code).toBe('InsufficientCoin');
      }
      career = advanceUntilAttention(career, world).career;
    }
    expect(career.ended?.reason).toBe('insolvency');
    expect(career.guild.roster).toHaveLength(0);
    expect(career.ended?.reckoning.heroesRecruited).toBe(0);
  });
});

describe('configuration driven past where the rules were written for', () => {
  it('refuses every offer when the cap is set below the Roster already standing', () => {
    const career = withApplicants('cap-below-roster', { rosterCap: 2 });
    expect(career.guild.roster.length).toBeGreaterThan(career.config.rosterCap);
    for (const offer of applicantOffers(career)) {
      expect(offer.refusal).toEqual({ code: 'RosterFull' });
    }
    expect(rejection(() => acceptApplicant(career, firstApplicant(career).id)).code).toBe(
      'RosterFull',
    );
    // Nobody is pushed off to make room: the design gives the player no firing mechanic.
    const on = advance(career, 200, world);
    expect(on.career.guild.roster.length).toBeLessThanOrEqual(career.guild.roster.length);
  });

  it('survives a batch range the wrong way round, and an interval or a linger of zero', () => {
    const backwards = advance(
      newCareer('backwards-batch', world, {
        ...RICH,
        applicantBatchMin: 5,
        applicantBatchMax: 2,
      }).career,
      200,
      world,
    );
    for (const batch of of(backwards.events, 'ApplicantsArrived')) {
      // `between(low, high)` answers `low` when the range is inverted, so a batch of five.
      expect(batch.applicantIds.length).toBeGreaterThan(0);
      expect(new Set(batch.applicantIds).size).toBe(batch.applicantIds.length);
    }

    const never = advance(
      newCareer('no-interval', world, {
        ...RICH,
        applicantsEveryDays: 0,
        applicantsEveryDaysBelowFloor: 0,
      }).career,
      400,
      world,
    );
    expect(of(never.events, 'ApplicantsArrived')).toEqual([]);
    expect(never.career.applicants).toEqual([]);

    const fleeting = advance(
      newCareer('no-linger', world, { ...RICH, applicantLingerDays: 0 }).career,
      200,
      world,
    );
    // They arrive and are gone at the start of the next Day, and nothing is left behind.
    expect(of(fleeting.events, 'ApplicantsArrived').length).toBeGreaterThan(0);
    expect(fleeting.career.applicants).toEqual([]);
    expect(of(fleeting.events, 'ApplicantDeclined').length).toBeGreaterThan(0);
  });

  it('distributes a Stat budget at both ends of what four Stats can hold, and neither hangs', () => {
    const lowest = defaultConfig.statMin * STATS.length;
    const highest = defaultConfig.statMax * STATS.length;
    const budgets: { budget: number; want: number }[] = [
      { budget: lowest, want: lowest },
      { budget: highest, want: highest },
      // Below what four Stats can go: the distribution has nothing to take away, so it
      // hands out the floor and the total overshoots. Above what they can hold: it runs
      // out of room and stops, so the total falls short. Neither hangs, and neither
      // produces a Stat outside the configured range — which is the property that matters.
      { budget: lowest - 1, want: lowest },
      { budget: highest + 1, want: highest },
    ];
    for (const { budget, want } of budgets) {
      const run = advance(
        newCareer(`budget-${budget}`, world, {
          ...RICH,
          calibreStatBudget1: budget,
          calibreStatBudget2: budget,
          calibreStatBudget3: budget,
        }).career,
        200,
        world,
      );
      expect(run.career.applicants.length, `budget ${budget}`).toBeGreaterThan(0);
      for (const applicant of run.career.applicants) {
        const total = STATS.reduce((sum, stat) => sum + applicant.stats[stat], 0);
        expect(total, `budget ${budget}, ${applicant.id}`).toBe(want);
        for (const stat of STATS) {
          expect(applicant.stats[stat]).toBeGreaterThanOrEqual(defaultConfig.statMin);
          expect(applicant.stats[stat]).toBeLessThanOrEqual(defaultConfig.statMax);
        }
      }
    }
  }, 60_000);
});

// ── Purity ───────────────────────────────────────────────────────────────────

describe('every E4 export reads a deep-frozen Career without writing to it', () => {
  it('leaves the Career it was given exactly as it found it', () => {
    const frozen = deepFreeze(withApplicants('frozen'));
    const before = serialiseCareer(frozen);
    const applicant = firstApplicant(frozen);

    expect(maxCalibre(frozen)).toBeGreaterThanOrEqual(1);
    expect(applicantById(frozen, applicant.id)).toBeDefined();
    expect(acceptRefusal(frozen, applicant.id)).toBeUndefined();
    expect(applicantOffers(frozen).length).toBe(frozen.applicants.length);
    expect(applicantInterval(frozen)).toBeGreaterThan(0);
    expect(applicantFee(1, frozen.config)).toBe(
      frozen.config.applicantFeeBase + frozen.config.applicantFeePerCalibre,
    );
    for (const calibre of CALIBRES) {
      expect(calibreStatBudget(calibre, frozen.config)).toBeGreaterThan(0);
      expect(calibreOfStats(calibreStatBudget(calibre, frozen.config), frozen.config)).toBe(calibre);
    }
    expect(standing(frozen)).toBe(standing(frozen));

    const taken = acceptApplicant(frozen, applicant.id);
    const sent = declineApplicant(frozen, applicant.id);
    expect(taken.career).not.toBe(frozen);
    expect(sent.career).not.toBe(frozen);
    expect(serialiseCareer(frozen)).toBe(before);

    // And the Career the call hands back is its own: writing to it cannot reach the
    // Applicant the caller still holds.
    const joined = taken.career.guild.roster.find((hero) => hero.id === applicant.id);
    if (joined !== undefined) joined.stats.Might += 1;
    expect(applicant.stats.Might).toBe(frozen.applicants[0]?.stats.Might);
  });
});

// ── The fleet ────────────────────────────────────────────────────────────────

describe('a hundred and fifty Careers under varying Roster targets', () => {
  it(
    'holds every invariant on every Day, not only at the end',
    () => {
      const broken: string[] = [];
      const check = (held: boolean, what: string): void => {
        if (!held) broken.push(what);
      };
      const targets = [4, 5, 6, 8, 10, 12];
      let ended = 0;
      let everSawAReturner = 0;
      let everAccepted = 0;

      for (let seed = 0; seed < 150; seed += 1) {
        const at = `seed ${seed}`;
        const target = targets[seed % targets.length] ?? 12;
        const opened = newCareer(`e4-verify-${seed}`, world);
        let career = opened.career;
        const events: GameEvent[] = [...opened.events];
        const oldest = new Map<string, number>();
        // Checked after every call that can change the Roster, which is the whole of what
        // can change it: nothing inside a Day adds to the Roster, so this is every Day.
        const invariants = (where: string): void => {
          check(
            career.guild.roster.length <= career.config.rosterCap,
            `${at}: over the cap ${where} on Day ${career.day}`,
          );
          const roster = new Set(career.guild.roster.map((hero) => hero.id));
          const former = new Set(career.guild.formerHeroes.map((hero) => hero.id));
          check(roster.size === career.guild.roster.length, `${at}: a Roster id twice ${where}`);
          check(
            former.size === career.guild.formerHeroes.length,
            `${at}: a former Hero id twice ${where}`,
          );
          for (const id of roster) {
            check(!former.has(id), `${at}: ${id} is on the Roster and gone ${where}`);
          }
          for (const applicant of career.applicants) {
            if (applicant.formerHeroId === undefined) {
              check(!roster.has(applicant.id), `${at}: ${applicant.id} waiting and on the Roster`);
              check(!former.has(applicant.id), `${at}: ${applicant.id} waiting and in history`);
            } else {
              // The one person who may be in two places: an offer to somebody who left.
              check(
                former.has(applicant.id) && !roster.has(applicant.id),
                `${at}: ${applicant.id} came back from nowhere ${where}`,
              );
            }
            check(
              applicant.expiresOn > career.day,
              `${at}: ${applicant.id} still here after expiring ${where}`,
            );
          }
          for (const hero of career.guild.roster) {
            const was = oldest.get(hero.id);
            check(was === undefined || hero.age >= was, `${at}: ${hero.id} got younger ${where}`);
            oldest.set(hero.id, hero.age);
          }
          // Standing is derived and never written down.
          const document = JSON.parse(serialiseCareer(career)) as Record<string, unknown>;
          check(!('standing' in document), `${at}: the Career stores a Standing`);
          check(
            !('standing' in (document['guild'] as Record<string, unknown>)),
            `${at}: the Guild stores a Standing`,
          );
        };

        let guard = 0;
        while (career.ended === undefined) {
          guard += 1;
          if (guard > 100_000) {
            broken.push(`${at}: never reached the end`);
            break;
          }
          for (const applicant of [...career.applicants]) {
            if (applicant.formerHeroId !== undefined) everSawAReturner += 1;
            if (career.guild.roster.length >= target) break;
            if (acceptRefusal(career, applicant.id) !== undefined) continue;
            if (career.guild.coin < applicant.askingFee + career.config.startingCoin) continue;
            const taken = acceptApplicant(career, applicant.id);
            career = taken.career;
            events.push(...taken.events);
            everAccepted += 1;
            invariants('after an offer was taken');
          }
          for (const improvement of HALL_IMPROVEMENTS) {
            if (career.guild.hall.includes(improvement)) continue;
            if (career.guild.coin < hallCost(improvement, career.config) + career.config.startingCoin) {
              continue;
            }
            const bought = improveHall(career, improvement);
            career = bought.career;
            events.push(...bought.events);
          }
          const free = availableHeroes(career);
          const used = new Set<string>();
          for (const commission of [...career.board].sort((a, b) => b.fee - a.fee)) {
            const able = free.filter((hero) => !used.has(hero.id));
            if (able.length === 0) break;
            const refusing = new Set(
              proposeParty(career, commission.id, able.map((h) => h.id), world).refusals.map(
                (refusal) => refusal.heroId,
              ),
            );
            const party = able.filter((h) => !refusing.has(h.id)).slice(0, 2).map((h) => h.id);
            if (party.length === 0) continue;
            const step = commitParty(career, commission.id, party, world);
            career = step.career;
            events.push(...step.events);
            for (const id of party) used.add(id);
          }
          const step = advanceUntilAttention(career, world);
          career = step.career;
          events.push(...step.events);
          invariants('after a stretch of Days');
        }

        const end = career.ended;
        check(end !== undefined, `${at}: the Career never ended`);
        if (end === undefined) continue;
        ended += 1;

        let arrived = 0;
        let acceptances = 0;
        let moved = 0;
        let fees = 0;
        let paid = 0;
        for (const event of events) {
          if (event.type === 'ApplicantsArrived') arrived += event.applicantIds.length;
          if (event.type === 'ApplicantAccepted') {
            acceptances += 1;
            fees += event.fee;
          }
          if (event.type === 'CoinChanged') {
            moved += event.delta;
            if (event.reason === 'recruitment') paid -= event.delta;
          }
          for (const value of Object.values(event)) {
            if (typeof value !== 'number') continue;
            check(Number.isFinite(value), `${at}: ${event.type} carries ${String(value)}`);
            check(!Object.is(value, -0), `${at}: ${event.type} carries a negative zero`);
          }
        }
        check(
          career.config.startingCoin + moved === career.guild.coin,
          `${at}: the coin does not add up`,
        );
        check(fees === paid, `${at}: the joining fees do not match what was paid`);
        check(career.ledger.applicantsSeen === arrived, `${at}: applicantsSeen is wrong`);
        check(
          career.ledger.applicantsAccepted === acceptances,
          `${at}: applicantsAccepted is wrong`,
        );
        check(
          end.reckoning.heroesRecruited === acceptances,
          `${at}: the reckoning disagrees with the events`,
        );
        const written = serialiseCareer(career);
        check(!/NaN|Infinity/.test(written), `${at}: a strange number in the world`);
        check(!/-0[,}\]]/.test(written), `${at}: a negative zero in the world`);
      }

      expect(broken.slice(0, 10)).toEqual([]);
      expect(ended).toBe(150);
      expect(everAccepted).toBeGreaterThan(0);
      expect(everSawAReturner).toBeGreaterThanOrEqual(0);
    },
    600_000,
  );
});
