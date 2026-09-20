/**
 * The screens that ask for the second keypress (DL-20 §6, DL-25 §3, DL-26 §3).
 *
 * Every keypress that spends coin takes a confirming one, and the screen that asks for it
 * must never contradict the list the player has just read. In E5 it did: the Transfer
 * confirmation said "and they consent to it" for **every** Transfer, including one the
 * Rival had already refused — the line above it said "they will not deal with you at all",
 * this said the opposite, and the engine then refused. The verification that caught it
 * forced five tests in; the E7 restructure inlined the function into the loop and they had
 * no equivalent left. So every confirmation lives here instead, and every one of them is:
 *
 * - **pure**, a function from arguments to `string[]`, holding no state and reading no
 *   terminal, exactly as a view is;
 * - a function of **the engine's own selector result** — `rivalOffers`' `RivalHeroOffer`,
 *   `applicantOffers`' `ApplicantOffer`, `wordOffers`' `WordOption`, `hallCost` — so a
 *   confirmation can never reason for itself about what will happen;
 * - written in the clause the **list** uses, which for a move is `whyNotMove` and is one
 *   function, so the two can never say different things about the same move.
 *
 * The insistence confirmation (E2-S5) is the one that is not here: it is in `commit.ts`,
 * which is where [E7 §4](../../docs/planning/epics/E7-terminal-ui-and-saves.md) puts it and
 * where it has always been pure and covered.
 */

import {
  hallCost,
  type ApplicantOffer,
  type Career,
  type HallImprovement,
  type RivalHeroOffer,
  type WordOption,
} from '@heroesim/engine';
import { coin, keyHints, wrapAt } from './screen.js';
import { whyNotMove } from './views/rivals.js';

/** The two keys every confirmation offers, so no screen invents its own idiom. */
function answerHints(yes: string, no: string, width: number): string[] {
  return keyHints([`[y] ${yes}`, `[anything else] ${no}`], width);
}

/**
 * Buying an improvement for the Hall (E3-S4). The cost is `hallCost`'s, never a number
 * worked out here, and the balance is the Guild's own.
 */
export function hallConfirmLines(
  career: Career,
  improvement: HallImprovement,
  width: number,
): string[] {
  const cost = hallCost(improvement, career.config);
  return [
    '',
    ...wrapAt(
      `That costs ${coin(cost)}, and the Guild holds ${coin(career.guild.coin)}.`,
      width,
      0,
    ),
    ...answerHints('buy it', 'leave it', width),
  ];
}

/**
 * Taking somebody on at the door (E4-S3). It names the fee **and** the Upkeep their place
 * adds from now on, because a Hero is a standing cost and not a one-off purchase — which
 * is the whole reason DL-25 §3 put a second keypress on this screen.
 */
export function applicantConfirmLines(
  career: Career,
  offer: ApplicantOffer,
  width: number,
): string[] {
  const { applicant } = offer;
  return [
    '',
    ...wrapAt(
      `${applicant.name} asks ${coin(applicant.askingFee)}, and their place adds ` +
        `${coin(career.config.upkeepPerHero)} to every Upkeep from now on. The Guild holds ` +
        `${coin(career.guild.coin)}.`,
      width,
      0,
    ),
    ...answerHints('take them on', 'leave it', width),
  ];
}

/**
 * Bringing somebody over from another Guild, or taking them without asking (E5-S2).
 *
 * The fee and the refusal are both read off the offer the player has just seen listed, so
 * this can never claim a consent the Rival has refused. Asking anyway stays possible — a
 * refusal is a thing that happened and the CLI narrates it — but the player is told what
 * they are asking for, and the key says `ask anyway` rather than `do it`.
 */
export function moveConfirmLines(
  career: Career,
  what: 'Transfer' | 'Poach',
  offer: RivalHeroOffer,
  rivalName: string,
  width: number,
): string[] {
  const transferring = what === 'Transfer';
  const fee = transferring ? offer.transferFee : offer.poachFee;
  const refusal = transferring ? offer.transferRefusal : offer.poachRefusal;
  const cost = transferring
    ? `${rivalName} are asking ${coin(fee)} for ${offer.hero.name}` +
      (refusal === undefined ? ', and they consent to it.' : '.')
    : `Taking ${offer.hero.name} off ${rivalName} costs ${coin(fee)} and ` +
      `${Math.abs(career.config.poachRivalRegardCost)} of their Regard for you. At ` +
      `${career.config.souredRivalThreshold} they take more off your Board.`;
  return [
    '',
    ...wrapAt(cost, width, 0),
    ...(refusal === undefined
      ? []
      : wrapAt(`As it stands, ${whyNotMove(refusal)}, and asking will be refused.`, width, 0)),
    // Short enough to stand on one line at the forty-column floor, where a key hint is
    // given a line of its own and is not wrapped (E7-S5).
    ...answerHints(refusal === undefined ? 'do it' : 'ask anyway', 'leave them be', width),
  ];
}

/**
 * Answering a waiting Party with an option that costs coin (E6-S4, DL-25 §3). It names the
 * option by the **label content authored for it**, which is the same words the list above
 * it prints; an option's id is an identifier and no sentence names one (E7-S5).
 *
 * @param option the option as `wordOffers` returned it — the cost is the engine's
 * @param label `wordProse`'s label for that option, which is what the player read
 */
export function wordConfirmLines(option: WordOption, label: string, width: number): string[] {
  return [
    '',
    ...wrapAt(`Sending word costs ${coin(option.cost ?? 0)}: ${label}`, width, 0),
    ...answerHints('do it', 'leave them waiting', width),
  ];
}

/**
 * Leaving, from a named slot (E7-S4, DL-25 §11). The autosave is already written by the
 * time this is asked; what it asks is whether the named slot should be written over too,
 * because a named slot is never written without being asked.
 */
export function quitConfirmLines(slot: string, width: number): string[] {
  return [
    '',
    ...wrapAt(`Save to slot "${slot}" as well? The autosave is already written.`, width, 0),
    // The slot is named in the sentence above; the hint stays short enough for the floor.
    ...answerHints('write it too', 'leave it as it was', width),
  ];
}
