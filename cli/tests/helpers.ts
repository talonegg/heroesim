/**
 * What every width test asserts, in one place so that no view is held to a weaker rule
 * than another.
 *
 * Three verifiers in a row (E3, E4 and E5) caught a line `clip`ped with an ellipsis
 * exactly where the content was the point — a refusal's reason, the Hall's effect, an
 * Applicant cue's instruction — and each time the test passed because it only asserted
 * that the line was short enough. So both halves are asserted together, everywhere:
 * **no line exceeds the width, and no line is cut short.**
 */

import { expect } from 'vitest';
import {
  advance,
  awaitingParties,
  commitParty,
  newCareer,
  wordOffers,
  type Career,
  type Content,
} from '@heroesim/engine';

/** The four widths every view is rendered and snapshotted at (E7-S5). */
export const WIDTHS = [40, 60, 80, 120] as const;

/** Every line fits, and nothing was truncated to make it fit. */
export function expectFits(lines: readonly string[], width: number, where: string): void {
  for (const line of lines) {
    expect(line.length, `${where} at ${width}: over width: "${line}"`).toBeLessThanOrEqual(width);
    expect(line.includes('...'), `${where} at ${width}: cut short: "${line}"`).toBe(false);
    expect(line.includes('…'), `${where} at ${width}: cut short: "${line}"`).toBe(false);
  }
}

/** The lines as one run of words, so an assertion is not defeated by where it wrapped. */
export function flow(lines: readonly string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** The longest line, for a quick assertion about a block. */
export function longest(lines: readonly string[]): number {
  return lines.reduce((most, line) => Math.max(most, line.length), 0);
}

/**
 * A Career on the Day a Party sent word, reached by play over the real content.
 *
 * It takes the first Commission on the Board **that some Decision could actually stop**
 * rather than `board[0]`: since DL-24 §A3 narrowed every Decision's `conditions.tags`, a
 * Commission tagged `['dark','guard']` admits none of them and a seed that deals one
 * first would never stop however high `decisionChancePerBeat` is set. That is the same
 * fix DL-24 §A6 applied to `narrate/tests/regard.test.ts`.
 */
export function partyWaiting(
  seed: string,
  content: Content,
  coin = 5000,
): { career: Career; partyId: string } {
  const started = newCareer(seed, content, { startingCoin: coin, decisionChancePerBeat: 1 });
  const couldStop = (tags: readonly string[]): boolean =>
    content.decisions.some((decision) => {
      const wanted = decision.conditions.tags;
      return wanted === undefined || wanted.some((tag) => tags.includes(tag));
    });
  const commission =
    started.career.board.find((entry) => couldStop(entry.tags)) ?? started.career.board[0];
  const hero = started.career.guild.roster[0];
  if (commission === undefined || hero === undefined) throw new Error('expected work and a Hero');
  let career = commitParty(started.career, commission.id, [hero.id], content).career;
  for (let day = 0; day < 60; day += 1) {
    career = advance(career, 1, content).career;
    const party = awaitingParties(career)[0];
    if (party !== undefined) return { career, partyId: party.id };
  }
  throw new Error(`no Party sent word on seed "${seed}"`);
}

/**
 * A Career on a Day when **two or more** Parties are waiting on word — the state the main
 * screen cannot hold whole at any width (DL-26 §2), where a number is refused and `w` is
 * the way in, and where the pager has to keep one Party's options together.
 *
 * @throws when the seed does not reach it inside forty Days
 */
export function severalWaiting(seed: string, content: Content, coin = 6000): Career {
  const started = newCareer(seed, content, { startingCoin: coin, decisionChancePerBeat: 1 });
  let career = started.career;
  const free = [...career.guild.roster];
  for (const [at, commission] of career.board.entries()) {
    const party = free.slice(at, at + 1).map((hero) => hero.id);
    if (party.length === 0) break;
    try {
      career = commitParty(career, commission.id, party, content, { insist: true }).career;
    } catch {
      // Away, injured or refused: the next Commission on the Board will do.
    }
  }
  for (let day = 0; day < 40; day += 1) {
    career = advance(career, 1, content).career;
    if (wordOffers(career, content).length >= 2) return career;
  }
  throw new Error(`no two Parties waited on seed "${seed}"`);
}
