/**
 * The twenty-four rows, over a fleet (E7-S1, DL-26 §1).
 *
 * E7-S1 promises "one screen, 80 columns, 24 rows, that a player can act from without
 * scrolling", and until DL-26 the test that held it to that rendered **one** fresh-Career
 * state. An independent verification then measured the real screen over 4,188 played
 * states and found 87% of the states with one Party waiting over the budget, all of the
 * states with two or more over it, and a worst case of seventy rows.
 *
 * So the promise is held to a fleet instead: forty seeded Careers played under a policy
 * that recruits, buys the Hall, lets words wait so that one, two and three Parties pile up
 * at once, and keeps a full history — measured at 80 **and** 120 columns at every state it
 * passes through. And it **asserts what it saw**, because a fleet that never reaches the
 * hard states measures a screen nobody looks at: every bucket of waiting Parties, a state
 * where a block yielded, a state where the whole word block was shown and one where the
 * summary was.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advanceUntilAttention,
  answerParty,
  applicantOffers,
  availableHeroes,
  awaitingParties,
  commitParty,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  poachHero,
  rivalOffers,
  wordOffers,
  type Career,
  type Content,
  type GameConfig,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { wordProse } from '@heroesim/narrate';
import { layOut, ROWS, type WordForm } from '../src/layout.js';
import { entriesFrom, remember } from '../src/history.js';
import { wordLines } from '../src/word.js';
import { flow } from './helpers.js';

const content: Content = loadContentFromDisk();

/** The widths the row budget runs at: 80 is the promise and 120 is "and wider". */
const BUDGETED = [80, 120] as const;

/** What the fleet is required to have seen, so that it cannot pass vacuously. */
interface Seen {
  nobodyWaiting: number;
  oneWaiting: number;
  twoWaiting: number;
  threeOrMoreWaiting: number;
  aBlockYielded: number;
  wholeWordBlock: number;
  wordSummary: number;
  fullBoard: number;
  fiveRemembered: number;
  applicantsWhileAway: number;
}

const seen: Seen = {
  nobodyWaiting: 0,
  oneWaiting: 0,
  twoWaiting: 0,
  threeOrMoreWaiting: 0,
  aBlockYielded: 0,
  wholeWordBlock: 0,
  wordSummary: 0,
  fullBoard: 0,
  fiveRemembered: 0,
  applicantsWhileAway: 0,
};

/** The worst row count reached in each bucket, reported whether or not it fails. */
const worst = new Map<string, number>();

let states = 0;

function note(what: string, rows: number): void {
  worst.set(what, Math.max(worst.get(what) ?? 0, rows));
}

/** One state, measured at both budgeted widths and counted into the buckets. */
function look(career: Career, history: readonly string[], where: string): void {
  states += 1;
  const waiting = awaitingParties(career).length;
  if (waiting === 0) seen.nobodyWaiting += 1;
  else if (waiting === 1) seen.oneWaiting += 1;
  else if (waiting === 2) seen.twoWaiting += 1;
  else seen.threeOrMoreWaiting += 1;
  if (career.board.length >= 6) seen.fullBoard += 1;
  if (history.length >= 5) seen.fiveRemembered += 1;
  if (applicantOffers(career).length > 0 && career.parties.length > 0) {
    seen.applicantsWhileAway += 1;
  }

  let form: WordForm = 'none';
  for (const width of BUDGETED) {
    const plan = layOut(career, width, content, history);
    expect(
      plan.lines.length,
      `${where} at ${width}: ${plan.lines.length} rows with ${waiting} waiting\n` +
        plan.lines.join('\n'),
    ).toBeLessThanOrEqual(ROWS);
    if (plan.yielded > 0) seen.aBlockYielded += 1;
    note(`waiting=${waiting} at ${width}`, plan.lines.length);
    if (width === 80) form = plan.word;
  }
  if (form === 'full') seen.wholeWordBlock += 1;
  if (form === 'summary') seen.wordSummary += 1;

  // Whichever form the main screen took, the Word view behind `w` says the whole of what
  // every waiting Party asks, and every option they offer (DL-26 §2).
  if (waiting > 0) {
    const said = flow(wordLines(career, 80, content));
    for (const offer of wordOffers(career, content)) {
      const prose = wordProse(offer, career, content);
      expect(said, `${where}: the Word view lost a prompt`).toContain(
        flow(prose.prompt.split('\n')),
      );
      for (const option of offer.options) {
        const label = prose.labels[option.id];
        if (label === undefined) continue;
        expect(said, `${where}: the Word view lost an option`).toContain(flow([label]));
      }
    }
  }
}

/**
 * A player who takes work with everybody free, recruits, buys the Hall, takes somebody off
 * another Guild, and **answers only one word in three** — which is what lets two and three
 * Parties stand waiting at once, the states the promise was actually broken in.
 */
function play(seed: string, config: Partial<GameConfig>, steps: number): void {
  let career = newCareer(seed, content, config).career;
  let history: string[] = [];
  const step = (events: ReturnType<typeof advanceUntilAttention>): void => {
    career = events.career;
    history = remember(history, entriesFrom(events.events, career, content));
  };

  for (let at = 0; at < steps; at += 1) {
    if (career.ended !== undefined) break;
    look(career, history, `${seed} day ${career.day}`);

    for (const [index, offer] of wordOffers(career, content).entries()) {
      if ((at + index) % 3 !== 0) continue;
      const option = offer.options.find((entry) => entry.affordable);
      if (option === undefined) continue;
      try {
        step(answerParty(career, offer.partyId, option.id, content));
      } catch {
        /* the world moved under the policy; the next step reads it again */
      }
    }

    const free = availableHeroes(career);
    for (const [index, commission] of career.board.entries()) {
      const party = free.slice(index * 2, index * 2 + 2).map((hero) => hero.id);
      if (party.length === 0) break;
      try {
        step(commitParty(career, commission.id, party, content, { insist: true }));
      } catch {
        /* away, injured, refused or gone: the policy tries the next one */
      }
    }

    for (const offer of applicantOffers(career)) {
      if (offer.refusal !== undefined) continue;
      try {
        step(acceptApplicant(career, offer.applicant.id));
      } catch {
        /* the coin moved */
      }
    }
    for (const improvement of HALL_IMPROVEMENTS) {
      if (career.guild.hall.includes(improvement)) continue;
      if (career.guild.coin < hallCost(improvement, career.config) + 200) continue;
      try {
        step(improveHall(career, improvement));
      } catch {
        /* somebody else's problem */
      }
    }
    for (const rival of career.rivals) {
      const takeable = rivalOffers(career, rival.id).find(
        (offer) => offer.poachRefusal === undefined,
      );
      if (takeable === undefined) continue;
      try {
        step(poachHero(career, rival.id, takeable.hero.id));
      } catch {
        /* no room, no coin, or they changed their mind */
      }
      break;
    }

    look(career, history, `${seed} day ${career.day} (after acting)`);
    step(advanceUntilAttention(career, content));
  }
  look(career, history, `${seed} day ${career.day} (last)`);
}

describe('the twenty-four rows, over a fleet of played Careers', () => {
  it(
    'holds every reachable state inside the budget at 80 and at 120 columns',
    () => {
      for (let index = 0; index < 40; index += 1) {
        // A high Decision chance is what piles Parties up waiting; the three floats reach
        // a Guild that can buy things, one that can just about, and one that cannot.
        const config: Partial<GameConfig> =
          index % 3 === 0
            ? { startingCoin: 2500, decisionChancePerBeat: 0.6 }
            : index % 3 === 1
              ? { startingCoin: 1200, decisionChancePerBeat: 0.35 }
              : { startingCoin: 900, decisionChancePerBeat: 0.2 };
        play(`rows-${index}`, config, 24);
      }

      expect(states).toBeGreaterThan(1000);
      // Nothing here may be zero: a fleet that never reached the hard states has measured
      // a screen nobody will ever look at, which is exactly how the promise came to be
      // broken for 87% of the one-Party states without a test noticing.
      for (const [state, count] of Object.entries(seen)) {
        expect(count, `the fleet never saw: ${state}`).toBeGreaterThan(0);
      }
      // Measured 2026-09-20 over 1,482 states from 40 Careers: nobody waiting 597, one
      // waiting 628, two 217, three or more 40; a block yielded on 2,858 of the 2,964
      // measurements; the whole word block on 116 states and the summary on 769; a Board
      // of six 51; five remembered 1,442; Applicants at the door while Heroes were away
      // 502. The worst row count reached was 24 in every bucket. The floors below are
      // well under those, so ordinary drift does not fail the suite but a state going out
      // of reach altogether does.
      expect(seen.oneWaiting).toBeGreaterThanOrEqual(100);
      expect(seen.twoWaiting).toBeGreaterThanOrEqual(20);
      expect(seen.threeOrMoreWaiting).toBeGreaterThanOrEqual(3);
      expect(seen.wholeWordBlock).toBeGreaterThanOrEqual(20);
      expect(seen.wordSummary).toBeGreaterThanOrEqual(100);
      expect(seen.fullBoard).toBeGreaterThanOrEqual(20);
      expect(seen.fiveRemembered).toBeGreaterThanOrEqual(200);
      expect(seen.applicantsWhileAway).toBeGreaterThanOrEqual(200);
    },
    30_000,
  );

  it('reports the worst row count it reached in each bucket', () => {
    // Runs after the fleet, in the same file, so the numbers are the ones just measured.
    expect(worst.size).toBeGreaterThan(0);
    for (const [bucket, rows] of [...worst.entries()].sort()) {
      expect(rows, `worst in ${bucket}`).toBeLessThanOrEqual(ROWS);
    }
  });
});
