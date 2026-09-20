/**
 * E6's gate, and the fleet work behind it.
 *
 * The gate: **a Career in which a Party sends word, is answered "turn back", returns early
 * with a partial outcome, and a second Party's word times out and takes its default.**
 * Played end to end through the public surface on a fixed seed, with the shipped defaults
 * except for the one dial that makes the arc reachable in a test rather than in a
 * afternoon of play — `decisionChancePerBeat`, raised to 1 so that the two Commissions
 * both stop. Everything else is what ships: the timeout is five Days, turning back takes
 * one Day on the road and pays pro rata at the shipped factor.
 *
 * Beside it: the proof that no caller can deadlock, that every automatic policy written
 * before Decisions existed still reaches its ending unedited, a 200-seed smoke under two
 * policies, and the amended form of E6-S2's "no space in any event payload" box.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  advanceUntilAttention,
  answerParty,
  availableHeroes,
  awaitingParties,
  commitParty,
  proposeParty,
  serialiseCareer,
  wordOffers,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
} from '../src/index.js';
import { autoPlay, fixtureContent } from './fixtures.js';
import {
  decisionContent,
  edit,
  of,
  openRich,
  openRichStep,
  sendEverybody,
  untilWord,
  withDecisions,
} from './e6-fixtures.js';

// ── The gate ────────────────────────────────────────────────────────────────

describe('the E6 gate', () => {
  /**
   * Two Parties out at once on one seed: the first is told to turn back and comes home
   * early with a partial outcome, and the second is left alone until the timeout takes its
   * default. Both go out on Day 1, so nothing here depends on a Day that is not Day 1
   * being special.
   */
  const played = (() => {
    const opened = openRich('e6-gate', decisionContent, { decisionChancePerBeat: 1 });
    const [one, two] = opened.board;
    const [first, second] = opened.guild.roster;
    if (one === undefined || two === undefined || first === undefined || second === undefined) {
      throw new Error('the gate seed should deal two Commissions and two Heroes');
    }
    const events: GameEvent[] = [];
    let career = opened;
    for (const [commission, hero] of [
      [one, first],
      [two, second],
    ] as const) {
      const step = commitParty(career, commission.id, [hero.id], decisionContent);
      career = step.career;
      events.push(...step.events);
    }

    let turnedBackId: string | undefined;
    let timedOutId: string | undefined;
    for (let day = 0; day < 200 && career.ended === undefined; day += 1) {
      const run = advance(career, 1, decisionContent);
      career = run.career;
      events.push(...run.events);
      const waiting = awaitingParties(career);
      // The first Party to send word is told to come home. The second is left alone, and
      // the timeout settles it on the exact Day.
      for (const party of waiting) {
        if (turnedBackId === undefined) {
          turnedBackId = party.id;
          const answered = answerParty(career, party.id, 'turn-back', decisionContent);
          career = answered.career;
          events.push(...answered.events);
        } else if (party.id !== turnedBackId) {
          timedOutId = party.id;
        }
      }
      if (career.parties.length === 0 && timedOutId !== undefined && turnedBackId !== undefined) {
        break;
      }
    }
    return { career, events, turnedBackId, timedOutId };
  })();

  it('has a Party send word, and it is the one the Guildmaster answered', () => {
    const asked = of(played.events, 'PartyAwaitingWord');
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(asked.map((event) => event.partyId)).toContain(played.turnedBackId);
  });

  it('turns that Party back, and brings it home early with a partial outcome', () => {
    const told = of(played.events, 'PartyTurnedBack').find(
      (event) => event.partyId === played.turnedBackId,
    );
    expect(told).toBeDefined();
    expect(told?.beatsResolved).toBeGreaterThan(0);
    expect(told?.beatsResolved).toBeLessThan(told?.beatCount ?? 0);

    const returned = of(played.events, 'PartyReturned').find(
      (event) => event.partyId === played.turnedBackId,
    );
    expect(returned?.succeeded).toBe(false);
    expect(returned?.day).toBe((told?.day ?? 0) + played.career.config.turnBackTravelDays);
    // A partial outcome: part of the work, and part of the fee.
    expect(returned?.feePaid).toBeGreaterThanOrEqual(0);
    expect(returned?.heroIds.length).toBeGreaterThan(0);
    // And it counted as a Commission that failed, with the ledger saying what happened.
    expect(played.career.ledger.turnedBack).toBe(1);
    expect(played.career.ledger.commissionsFailed).toBeGreaterThan(0);
  });

  it('lets the second Party’s word time out, and takes its default on the exact Day', () => {
    const asked = of(played.events, 'PartyAwaitingWord').find(
      (event) => event.partyId === played.timedOutId,
    );
    const answered = of(played.events, 'PartyAnswered').find(
      (event) => event.partyId === played.timedOutId,
    );
    expect(asked).toBeDefined();
    expect(answered?.byDefault).toBe(true);
    expect(answered?.day).toBe(asked?.timesOutOn);
    expect(answered?.optionId).toBe('press-on');
  });

  it('finishes the second Commission, so beatCount is honoured either way', () => {
    const returned = of(played.events, 'PartyReturned').find(
      (event) => event.partyId === played.timedOutId,
    );
    expect(returned).toBeDefined();
    const beats = of(played.events, 'BeatResolved').filter(
      (event) => event.partyId === played.timedOutId,
    );
    const commission = played.career.recentCommissions.find(
      (entry) => entry.id === returned?.commissionId,
    );
    expect(beats.length).toBe(commission?.beatCount);
  });

  it('counts each word once, and the Career is still playable afterwards', () => {
    expect(played.career.ledger.wordsSent).toBe(of(played.events, 'PartyAwaitingWord').length);
    expect(awaitingParties(played.career)).toEqual([]);
    const onward = advance(played.career, 100, decisionContent);
    expect(onward.career.day).toBeGreaterThan(played.career.day);
  });
});

// ── A Career never deadlocks ────────────────────────────────────────────────

describe('a Career never deadlocks', () => {
  it('reaches an ending from a Career with a Party awaiting, over ten thousand Days', () => {
    const opened = openRich('e6-deadlock', decisionContent, {
      decisionChancePerBeat: 1,
      careerYears: 2,
    });
    const commission = opened.board[0];
    const hero = opened.guild.roster[0];
    if (commission === undefined || hero === undefined) throw new Error('expected work and a Hero');
    let career = commitParty(opened, commission.id, [hero.id], decisionContent).career;
    for (let day = 0; day < 40 && awaitingParties(career).length === 0; day += 1) {
      career = advance(career, 1, decisionContent).career;
    }
    expect(awaitingParties(career)).toHaveLength(1);

    const run = advance(career, 10_000, decisionContent);
    expect(run.career.ended).toBeDefined();
    expect(of(run.events, 'CareerEnded')).toHaveLength(1);
    // The default was taken for them rather than the Days simply stopping.
    expect(of(run.events, 'PartyAnswered').some((event) => event.byDefault)).toBe(true);
  }, 60_000);

  it('terminates under advanceUntilAttention called over and over, unanswered', () => {
    const opened = openRich('e6-never-answer', decisionContent, {
      decisionChancePerBeat: 1,
      careerYears: 2,
    });
    let career = opened;
    let guard = 0;
    while (career.ended === undefined) {
      guard += 1;
      if (guard > 20_000) throw new Error('a policy that never answers did not terminate');
      const free = availableHeroes(career);
      const commission = career.board[0];
      if (free.length > 0 && commission !== undefined) {
        const taking = free.slice(0, 2).map((hero: Hero) => hero.id);
        const refusing = new Set(
          proposeParty(career, commission.id, taking, decisionContent).refusals.map(
            (refusal) => refusal.heroId,
          ),
        );
        const party = taking.filter((id) => !refusing.has(id));
        if (party.length > 0) career = commitParty(career, commission.id, party, decisionContent).career;
      }
      career = advanceUntilAttention(career, decisionContent).career;
    }
    expect(career.ended).toBeDefined();
    expect(career.ledger.wordsSent).toBeGreaterThan(0);
  }, 60_000);

  it('leaves every automatic policy written before Decisions unedited and still finishing', () => {
    // `autoPlay` knows nothing about answering: it commits, advances until attention and
    // repeats. Over content that ships Decisions it stops on the word, runs on, and the
    // default is taken for it on the timeout (DL-23 §3).
    const withDecisions = autoPlay(
      openRich('e6-autoplay', decisionContent, { careerYears: 3, decisionChancePerBeat: 1 }),
      decisionContent,
    );
    expect(withDecisions.ended).toBeDefined();
    expect(withDecisions.ledger.wordsSent).toBeGreaterThan(0);
    // And over content that ships none it is the Career it always was.
    const without = autoPlay(
      openRich('e6-autoplay', fixtureContent, { careerYears: 3 }),
      fixtureContent,
    );
    expect(without.ended).toBeDefined();
    expect(without.ledger.wordsSent).toBe(0);
  }, 120_000);
});

// ── The 200-seed smoke ──────────────────────────────────────────────────────

/** What one played Career came to, under one policy. */
interface Run {
  career: Career;
  events: GameEvent[];
}

/**
 * Play a Career to its end. `answer` decides what to say to a Party that has sent word, or
 * `undefined` to say nothing at all and let the timeout have it.
 */
function play(
  seed: string,
  content: Content,
  answer: (offer: { partyId: string; options: { id: string; affordable: boolean }[] }, at: number) =>
    | string
    | undefined,
): Run {
  // The opening events are part of the stream: `CareerStarted` is the only event that
  // carries `seed` or `guildName`, and a test that never sees it cannot say whether an
  // exemption for either is live or dead (F13).
  const opened = openRichStep(seed, content, { careerYears: 4 });
  let career = opened.career;
  const events: GameEvent[] = [...opened.events];
  let guard = 0;
  let answered = 0;
  while (career.ended === undefined) {
    guard += 1;
    if (guard > 20_000) throw new Error(`the smoke policy never finished "${seed}"`);

    // Asked again after every answer: sending coin moves the balance the next Party's
    // options are weighed against, so an offer read before the coin left is out of date.
    for (let asking = 0; asking < 16; asking += 1) {
      const offer = wordOffers(career, content)[0];
      if (offer === undefined) break;
      const chosen = answer(offer, answered);
      if (chosen === undefined) break;
      answered += 1;
      const step = answerParty(career, offer.partyId, chosen, content);
      career = step.career;
      events.push(...step.events);
    }

    const free = availableHeroes(career);
    const used = new Set<string>();
    for (const commission of [...career.board].sort((one, other) => other.fee - one.fee)) {
      const left = free.filter((hero) => !used.has(hero.id));
      if (left.length === 0) break;
      const refusing = new Set(
        proposeParty(
          career,
          commission.id,
          left.map((hero) => hero.id),
          content,
        ).refusals.map((refusal) => refusal.heroId),
      );
      const party = left
        .filter((hero) => !refusing.has(hero.id))
        .slice(0, 2)
        .map((hero) => hero.id);
      if (party.length === 0) continue;
      const step = commitParty(career, commission.id, party, content);
      career = step.career;
      events.push(...step.events);
      for (const id of party) used.add(id);
    }

    const run = advanceUntilAttention(career, content);
    career = run.career;
    events.push(...run.events);
  }
  return { career, events };
}

/** A policy that answers, taking the three kinds in turn so the mix is even. */
function inTurn(
  offer: { options: { id: string; affordable: boolean }[] },
  at: number,
): string | undefined {
  const wanted = ['press-on', 'send-coin', 'turn-back'][at % 3] ?? 'press-on';
  const found = offer.options.find((option) => option.id === wanted && option.affordable);
  return (found ?? offer.options.find((option) => option.affordable))?.id;
}

describe('two hundred played Careers: a hundred seeds under each of two policies', () => {
  it('holds every invariant E6 adds, and reports what Decisions actually do', () => {
    const totals = {
      careers: 0,
      commissions: 0,
      words: 0,
      answered: 0,
      byDefault: 0,
      turnedBack: 0,
      pressOn: 0,
      sendCoin: 0,
      turnBack: 0,
    };

    for (let seed = 0; seed < 100; seed += 1) {
      for (const [name, policy] of [
        ['answers', inTurn],
        ['never answers', () => undefined],
      ] as const) {
        const where = `${name} on seed ${String(seed)}`;
        const run = play(`e6-smoke-${String(seed)}`, decisionContent, policy);
        const { career, events } = run;
        totals.careers += 1;
        totals.commissions += of(events, 'PartyCommitted').length;

        // Every Career reaches an ending.
        expect(career.ended, where).toBeDefined();

        // At most one Decision per Commission.
        const byParty = new Map<string, number>();
        for (const event of of(events, 'PartyAwaitingWord')) {
          byParty.set(event.partyId, (byParty.get(event.partyId) ?? 0) + 1);
        }
        for (const [partyId, count] of byParty) expect(count, `${where}: ${partyId}`).toBe(1);
        totals.words += byParty.size;

        // No Party is ever left waiting past the Day its word timed out.
        const timesOutOn = new Map(
          of(events, 'PartyAwaitingWord').map((event) => [event.partyId, event.timesOutOn]),
        );
        for (const answered of of(events, 'PartyAnswered')) {
          expect(answered.day, `${where}: ${answered.partyId}`).toBeLessThanOrEqual(
            timesOutOn.get(answered.partyId) ?? Infinity,
          );
          totals.answered += 1;
          if (answered.byDefault) totals.byDefault += 1;
          if (answered.optionId === 'press-on') totals.pressOn += 1;
          if (answered.optionId === 'send-coin') totals.sendCoin += 1;
          if (answered.optionId === 'turn-back') totals.turnBack += 1;
        }
        // Every word was answered one way or the other, except one the Career's own
        // ending overtook: `advance` never steps a Day of an ended Career, so a Party
        // still waiting when the Guildmaster retires or the Guild folds is never answered
        // — and is the only way `awaitingParties` is not empty at the end.
        const stillWaiting = awaitingParties(career);
        expect(of(events, 'PartyAnswered').length + stillWaiting.length, where).toBe(byParty.size);
        if (stillWaiting.length > 0) expect(career.ended, where).toBeDefined();

        // `beatCount` is honoured unless the Party turned back.
        const turnedBack = new Set(of(events, 'PartyTurnedBack').map((event) => event.partyId));
        totals.turnedBack += turnedBack.size;
        const beats = new Map<string, number>();
        for (const event of of(events, 'BeatResolved')) {
          beats.set(event.partyId, (beats.get(event.partyId) ?? 0) + 1);
        }
        const asked = new Map(
          of(events, 'PartyCommitted').map((event) => [event.partyId, event.commissionId]),
        );
        for (const returned of of(events, 'PartyReturned')) {
          const count = beats.get(returned.partyId) ?? 0;
          const commission = career.recentCommissions.find(
            (entry) => entry.id === asked.get(returned.partyId),
          );
          if (commission === undefined) continue;
          if (turnedBack.has(returned.partyId)) {
            expect(count, `${where}: ${returned.partyId} turned back`).toBeLessThan(
              commission.beatCount,
            );
          } else if (returned.heroIds.length > 0) {
            expect(count, `${where}: ${returned.partyId}`).toBe(commission.beatCount);
          }
        }

        // No Hero is harmed after their Party turned back.
        const turnedBackOn = new Map(
          of(events, 'PartyTurnedBack').map((event) => [event.partyId, event.day]),
        );
        const partyOf = new Map<string, string>();
        for (const event of of(events, 'PartyCommitted')) {
          for (const id of event.heroIds) partyOf.set(`${event.partyId}|${id}`, event.partyId);
        }
        for (const event of events) {
          if (event.type !== 'HeroInjured' && event.type !== 'HeroScarred' && event.type !== 'HeroDied') {
            continue;
          }
          const partyId = event.partyId;
          if (partyId === undefined) continue;
          const called = turnedBackOn.get(partyId);
          if (called === undefined) continue;
          expect(event.day, `${where}: harm after ${partyId} turned back`).toBeLessThan(called);
        }

        // Whole-Career coin accounting.
        const opening = career.config.startingCoin;
        const moved = of(events, 'CoinChanged').reduce((sum, event) => sum + event.delta, 0);
        expect(opening + moved, `${where}: coin`).toBe(career.guild.coin);

        // The ledger counts what the events say happened, once each.
        expect(career.ledger.wordsSent, `${where}: wordsSent`).toBe(byParty.size);
        expect(career.ledger.turnedBack, `${where}: turnedBack`).toBe(turnedBack.size);

        // No NaN and no negative zero anywhere in the world or the stream.
        const written = serialiseCareer(career);
        expect(written.includes('NaN'), `${where}: NaN`).toBe(false);
        expect(written.includes('-0,') || written.includes('-0\n'), `${where}: -0`).toBe(false);
        for (const event of events) {
          for (const value of Object.values(event)) {
            if (typeof value === 'number') {
              expect(Number.isFinite(value), `${where}: ${event.type}`).toBe(true);
              expect(Object.is(value, -0), `${where}: ${event.type}`).toBe(false);
            }
          }
        }
      }
    }

    // What the run measured, asserted rather than printed: `console` does not appear
    // under `engine/` (CLAUDE.md invariant 1), and a number nobody reads is not evidence.
    // The measured figures themselves are recorded in DL-23 and in E6's own §2, where a
    // reader can find them; what a test can say is that the run really covered the ground.
    const perCommission = totals.words / totals.commissions;
    expect(totals.careers).toBe(200);
    expect(totals.commissions).toBeGreaterThan(50_000);
    expect(totals.words).toBeGreaterThan(0);
    expect(totals.turnedBack).toBeGreaterThan(0);
    // Every word was closed one way or another, and both ways really happened.
    expect(totals.answered).toBeGreaterThan(0);
    expect(totals.answered).toBeLessThanOrEqual(totals.words);
    expect(totals.byDefault).toBeGreaterThan(0);
    expect(totals.byDefault).toBeLessThan(totals.answered);
    // All three kinds were taken across the fleet, so the mix is a mix.
    expect(totals.pressOn).toBeGreaterThan(0);
    expect(totals.sendCoin).toBeGreaterThan(0);
    expect(totals.turnBack).toBeGreaterThan(0);
    expect(totals.pressOn + totals.sendCoin + totals.turnBack).toBe(totals.answered);
    // Every Commission called off is one somebody chose to call off.
    expect(totals.turnedBack).toBe(totals.turnBack);
    // The brake E6 §5 names. Re-pinned by the balance pass, which lowered
    // `decisionChancePerBeat` from 0.2 to 0.1 because the design calls rarity a rule and
    // not a hope (DL-24 §B2): this fleet measured 0.476 words per Commission before and
    // **0.266** after, on this fixture world — whose one unconditional Decision fires more
    // often than the authored set does, so it is deliberately the harsher reading. The
    // bracket is the same relative width the 0.4–0.6 one was, around the new figure, which
    // is half the absolute width and so tighter rather than looser.
    expect(perCommission).toBeLessThanOrEqual(1);
    expect(perCommission).toBeGreaterThan(0.21);
    expect(perCommission).toBeLessThan(0.32);
  }, 600_000);
});

// ── E6-S2's "no space in any event payload", as amended ─────────────────────

describe('no event carries engine-authored English', () => {
  /**
   * The box as E6-S2 writes it cannot be met and never could: `CareerStarted.guildName`,
   * `HeroJoined.name`, `ApplicantDeclined.name`, `CareerEnded.reckoning.favouritePatron.name`
   * and every Trait-name field carry the names of things in the world, and
   * `RivalRegardChanged.reason` carries a Vignette's own words (DL-20 §7, DL-22).
   *
   * **The two known exemptions.** `HeroRegardForGuildmasterChanged.reason` (E2) and
   * `PatronRegardChanged.reason` (E1) really are engine-authored English of the kind
   * ADR-0002 forbids. Turning them into ids would change what `narrate` prints for every
   * Regard movement in the game, which is its own decision and is **not** taken in E6
   * (DL-23 §12). They are named here so that nobody mistakes their absence for an oversight.
   */
  const NAMES_OF_THINGS = new Set(['name', 'guildName', 'trait', 'seed']);
  const KNOWN_ENGINE_PROSE = new Set([
    'HeroRegardForGuildmasterChanged.reason',
    'PatronRegardChanged.reason',
  ]);
  /**
   * `title` was exempt here and **no event carries one**, so the exemption was dead and
   * pre-widened the hole: engine-authored English under a field named `title` would have
   * gone straight through it. It is removed, and every exemption left is now asserted to
   * have been **seen** over the fleet, so a dead one can never again sit here unnoticed —
   * the same guard the two engine-authored `reason` fields already had (F13).
   */
  const E6_NAMES_OF_THINGS = new Set([
    // A Trait NAME, and shipped Trait names carry spaces ("Old campaigner"). The clause
    // below holds only because no shipped Decision uses `with_trait:` or `requiresTrait`
    // yet; authoring one would have made this test block legitimate content (F14). It is
    // a name of a thing in the world, exactly as `TraitGained.trait` is.
    'PartyAwaitingWord.slots.trait',
    'PartyAnswered.slots.trait',
  ]);
  /**
   * Content-authored, from the Vignette or the Decision option that moved it.
   * `ConsequenceApplied` carries the authored Consequence itself, word for word, so its
   * `reason` is the author's and not the engine's.
   */
  const CONTENT_PROSE = new Set([
    'RivalRegardChanged.reason',
    'ConsequenceApplied.reason',
    'ConsequenceApplied.consequence.reason',
  ]);

  function strings(
    value: unknown,
    path: string,
    into: { path: string; text: string }[],
  ): void {
    if (typeof value === 'string') {
      into.push({ path, text: value });
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) strings(entry, path, into);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) strings(entry, `${path}.${key}`, into);
    }
  }

  it('over a fleet of played Careers, except the two that predate E6', () => {
    const offenders: string[] = [];
    const seenEngineProse = new Set<string>();
    const seenNames = new Set<string>();
    let e6Fields = 0;

    for (let seed = 0; seed < 12; seed += 1) {
      const run = play(`e6-prose-${String(seed)}`, decisionContent, inTurn);
      for (const event of run.events) {
        const found: { path: string; text: string }[] = [];
        strings(event, event.type, found);
        for (const entry of found) {
          const field = entry.path.split('.').slice(-1)[0] ?? '';
          const leaf = `${event.type}.${field}`;
          // `ConsequenceApplied.consequence.reason` is nested one deeper than a leaf name.
          const nested = entry.path.startsWith(`${event.type}.consequence.`)
            ? `${event.type}.consequence.${field}`
            : leaf;
          if (CONTENT_PROSE.has(nested)) continue;
          if (field === 'type') continue;
          if (NAMES_OF_THINGS.has(field)) {
            seenNames.add(field);
            continue;
          }
          if (CONTENT_PROSE.has(leaf)) continue;
          if (KNOWN_ENGINE_PROSE.has(leaf)) {
            seenEngineProse.add(leaf);
            continue;
          }
          // Everything else is an id, a kind or an enumerated reason: no spaces at all.
          if (entry.text.includes(' ')) offenders.push(`${entry.path}: "${entry.text}"`);
        }
        // E6's own three carry ids and numbers only, and are held to the letter of the box.
        if (
          event.type === 'PartyAwaitingWord' ||
          event.type === 'PartyAnswered' ||
          event.type === 'PartyTurnedBack'
        ) {
          for (const entry of found) {
            if (E6_NAMES_OF_THINGS.has(entry.path)) continue;
            e6Fields += 1;
            expect(entry.text.includes(' '), `${entry.path}: "${entry.text}"`).toBe(false);
          }
        }
        if (event.type === 'PartyAwaitingWord') {
          expect(event.decisionId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
          for (const option of event.options) {
            expect(option.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(e6Fields).toBeGreaterThan(0);
    // The exemption is a live one, not a stale comment: both fields really do appear.
    expect([...seenEngineProse].sort()).toEqual([...KNOWN_ENGINE_PROSE].sort());
    // And so is every name-of-a-thing exemption. An exemption for a field no event carries
    // is a hole held open for nothing, and `title` was exactly that until it was removed.
    expect([...seenNames].sort()).toEqual([...NAMES_OF_THINGS].sort());
  }, 120_000);

  /**
   * The clause above held only because no shipped Decision names a Trait, and a Trait name
   * carries a space by design ("Old campaigner"). A content author writing one would have
   * been told their Decision broke the gate, which is the gate blocking legitimate content
   * rather than catching a defect (F14). Here is exactly that Decision, played: the events
   * carry the Trait's **name** and still not one word of the prompt or of any label.
   */
  it('lets a Decision name a multi-word Trait, and still carries no prose', () => {
    const askTheVeteran = {
      id: 'ask-the-veteran',
      name: 'Ask the veteran',
      weight: 1,
      tags: [],
      // Both halves are required before `{trait}` may be written into the prose: the slot
      // alone falls back to anybody, and the condition alone only says somebody holds it
      // (DL-13 §6). Neither is a rule this test invents; `validateContent` enforces both.
      conditions: { minBeat: 2, requiresTrait: 'Old campaigner' },
      slots: { hero: 'with_trait:Old campaigner' },
      prompt: '{hero} has seen this before, being {trait}, and asks what the Guild wants done.',
      options: [
        { id: 'press-on', kind: 'pressOn', label: 'Trust the old campaigner.', default: true, consequences: [] },
        { id: 'turn-back', kind: 'turnBack', label: 'Bring them home.', consequences: [] },
      ],
    };
    const content = withDecisions(askTheVeteran);
    const opened = openRich('e6-multi-word-trait', content, { decisionChancePerBeat: 1 });
    // The Trait is given by hand rather than hunted for in a seed: what is under test is
    // the gate's reading of a name with a space in it, not world generation.
    const career = edit(opened, (draft) => {
      for (const hero of draft.guild.roster) {
        if (!hero.traits.some((held) => held.name === 'Old campaigner')) {
          hero.traits.push({ name: 'Old campaigner', since: draft.day, kind: 'background' });
        }
      }
    });
    const found = untilWord(sendEverybody(career, content).career, content);
    const asked = found.events.find((event) => event.type === 'PartyAwaitingWord');
    expect(asked, 'a Party should have stopped to ask').toBeDefined();
    expect(asked?.slots.trait).toBe('Old campaigner');

    // The gate's own rule, applied to this event: every string but the Trait's name is an
    // id, a kind or an enumerated reason, and none of them carries a space.
    const strung: { path: string; text: string }[] = [];
    strings(asked, 'PartyAwaitingWord', strung);
    for (const entry of strung) {
      if (E6_NAMES_OF_THINGS.has(entry.path)) continue;
      expect(entry.text.includes(' '), `${entry.path}: "${entry.text}"`).toBe(false);
    }
    // And not one word of the authored prose reached the engine's own stream.
    const everything = JSON.stringify(found.events);
    expect(everything).not.toContain('asks what the Guild wants done');
    expect(everything).not.toContain('Trust the old campaigner');
    expect(everything).not.toContain('{trait}');
  });
});
