/**
 * A Party that has stopped mid-Commission and sent word (E6-S4) — the loudest thing on
 * the screen while it stands, and the block that displaces the Board entirely.
 *
 * Every number here is the engine's own: `wordOffers` says what each option costs, which
 * one the Guild can take **as things stand**, which one is taken if nobody answers and how
 * many Days are left before that happens; `turnBackOutcome` says what calling them home
 * would pay, before it is chosen; `wordProse` says the words. Nothing is worked out here,
 * and no sentence about what will happen is this front end's own (E7-S5).
 */

import { commissionById, wordOffers, type Career, type Content, type WordOffer } from '@heroesim/engine';
import { joinNames, turnBackSentence, wordProse, type WordProse } from '@heroesim/narrate';
import { coin, days, hanging, heading, wrapAt } from './screen.js';
import { partyNames } from './views/shared.js';

/** Who is out on a waiting Party, by name. */
function whoIsWaiting(career: Career, offer: WordOffer): string {
  const party = career.parties.find((entry) => entry.id === offer.partyId);
  if (party === undefined) return 'The Party';
  const names = partyNames(career, party);
  return names.length === 0 ? 'The Party' : joinNames(names);
}

/**
 * One option, numbered straight through every awaiting Party so that one number is one
 * answer wherever it sits — the same rule the other Guilds' view numbers people by.
 */
function optionLines(
  offer: WordOffer,
  words: WordProse,
  first: number,
  width: number,
): string[] {
  const lines: string[] = [];
  offer.options.forEach((option, index) => {
    const number = first + index;
    const cost = option.cost === undefined ? '' : ` (${coin(option.cost)})`;
    const mark = option.id === offer.defaultOptionId ? ' [their own judgement]' : '';
    // Wrapped, never cut: the label is the whole of what is being decided, and an option
    // ending in an ellipsis is an option nobody can weigh.
    lines.push(
      ...hanging(
        `${number}  `,
        // The authored label, and never the option's identifier where there is none
        // (E7-S5): "send-coin" is not a thing anybody can weigh.
        `${words.labels[option.id] ?? 'Answer them'}${cost}${mark}`,
        width,
      ),
    );
    // What calling them home would pay, said **before** it is chosen rather than reported
    // after. The engine works it out from the very expression `answerParty` applies.
    if (option.outcome !== undefined) {
      lines.push(...wrapAt(turnBackSentence(option.outcome), width, 6));
    }
    // Colour is never load-bearing: an option that cannot be taken says so in words.
    if (!option.affordable) {
      const short = option.refusal?.shortfall ?? 0;
      lines.push(
        ...wrapAt(
          `Cannot be sent: the Guild is ${coin(short)} short of the ` +
            `${coin(option.cost ?? 0)} it would take.`,
          width,
          6,
        ),
      );
    }
  });
  return lines;
}

/** Every Party waiting on word, with its prompt, its options and both clocks. */
export function wordLines(career: Career, width: number, content?: Content): string[] {
  if (content === undefined) return [];
  const offers = wordOffers(career, content);
  if (offers.length === 0) return [];
  const lines = [heading('Waiting on your word', 'Word', width)];
  let number = 1;
  for (const offer of offers) {
    // A blank line between Parties, so that `paginate` has a boundary to break at and one
    // Party's options are never torn across two pages — an option the player cannot see
    // beside the others is an option they cannot weigh (E7-S3, E7-S5).
    if (lines.length > 1) lines.push('');
    const words = wordProse(offer, career, content);
    lines.push(
      ...wrapAt(
        `${whoIsWaiting(career, offer)}, on ` +
          `${commissionById(career, offer.commissionId)?.title ?? 'the work'}.`,
        width,
        2,
      ),
    );
    lines.push(...wrapAt(words.prompt, width, 2));
    lines.push(...optionLines(offer, words, number, width));
    number += offer.options.length;
    lines.push(
      ...wrapAt(
        `They have waited ${days(offer.daysWaited)}. With no word from you they act on ` +
          `their own judgement in ${days(offer.daysLeft)}. The Guild holds ` +
          `${coin(career.guild.coin)}.`,
        width,
        2,
      ),
    );
  }
  return lines;
}

/**
 * Every waiting Party in one line each, **soonest to act on their own judgement first**:
 * who is out, on what, how long they have waited and how long is left. This is the form
 * the top block takes when the screen has not the rows to hold the prompts and the options
 * whole — two or more Parties never can be — and it still displaces the Board and still
 * cannot be ignored (DL-26 §2). It names the key that shows the whole of it, because a
 * block that yields must leave a pointer rather than a hole (E7-S5).
 */
export function wordSummaryLines(career: Career, width: number, content?: Content): string[] {
  if (content === undefined) return [];
  const offers = [...wordOffers(career, content)].sort((one, two) => one.daysLeft - two.daysLeft);
  if (offers.length === 0) return [];
  const lines = [heading('Waiting on your word', 'Word', width)];
  for (const offer of offers) {
    lines.push(
      ...wrapAt(
        `${whoIsWaiting(career, offer)}, on ` +
          `${commissionById(career, offer.commissionId)?.title ?? 'the work'}: waited ` +
          `${days(offer.daysWaited)}, and acts on their own judgement in ` +
          `${days(offer.daysLeft)}.`,
        width,
        2,
      ),
    );
  }
  lines.push(
    ...wrapAt(
      offers.length === 1
        ? 'Press w to read what they ask, and answer.'
        : 'Press w to read what each of them asks, and answer.',
      width,
      2,
    ),
  );
  return lines;
}

/**
 * What the CLI says when the player asks for the Days to run while a Party is waiting: who
 * is waiting, how long they have waited, and how long is left. A second `n` lets the Days
 * run (DL-23 §3), which is the two-keypress idiom insisting has used since E2 — and the
 * only way a scripted session can drive a Party to its timeout.
 *
 * `advance` called twice without this guard **takes a default for the player**. The engine
 * deliberately does not throw, so the guard is this front end's to keep (DL-24).
 */
export function advanceRefusedLines(career: Career, width: number, content?: Content): string[] {
  if (content === undefined) return [];
  const lines: string[] = [];
  for (const offer of wordOffers(career, content)) {
    lines.push(
      ...wrapAt(
        `${whoIsWaiting(career, offer)}, on ` +
          `${commissionById(career, offer.commissionId)?.title ?? 'the work'}, has been ` +
          `waiting ${days(offer.daysWaited)} and acts on their own judgement in ` +
          `${days(offer.daysLeft)}.`,
        width,
        0,
      ),
    );
  }
  lines.push(
    ...wrapAt(
      'Answer them with a number, or press n again to let the Days run and leave it to them.',
      width,
      0,
    ),
  );
  return lines;
}
