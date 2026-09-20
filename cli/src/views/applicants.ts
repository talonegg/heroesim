/**
 * The people at the door (E4-S2, E4-S3). The Background summary and the Traits come
 * **first** and the Stats second, because an Applicant read as a spreadsheet row is the
 * risk E4 §5 names; and calibre is never printed at all, as stars, a grade or anything
 * else — the fee is what a calibre buys and the fee is what the player reads.
 *
 * Whether somebody can be taken on is `applicantOffers`' answer and never a rule worked
 * out here, and every reason is wrapped rather than cut.
 */

import { applicantOffers, type ApplicantOffer, type Career, type Content } from '@heroesim/engine';
import { errorSentence, noneCanBeTakenReason, returnerSentence } from '@heroesim/narrate';
import { coin, days, groupDigits, hanging, heading, wrapAt, WIDE } from '../screen.js';

/** Why an offer cannot be taken today, as one sentence rather than a greyed-out number. */
function offerState(career: Career, offer: ApplicantOffer): string {
  if (offer.refusal === undefined) return 'You can take them on.';
  switch (offer.refusal.code) {
    case 'RosterFull':
      return errorSentence('RosterFull', { detail: career.config.rosterCap });
    case 'InsufficientCoin':
      return errorSentence('InsufficientCoin', {
        detail:
          `${coin(offer.applicant.askingFee)}, and you are ` +
          `${groupDigits(offer.refusal.shortfall ?? 0)} short`,
      });
    default:
      return errorSentence(offer.refusal.code);
  }
}

/**
 * The cue on the main screen: somebody is at the door, and how long they will wait
 * (E4-S2). Where nobody waiting can be taken on it says so plainly rather than nagging
 * about people nobody can take (finding C2). Nothing is told by colour alone.
 */
export function applicantCueLines(career: Career, width: number, short = false): string[] {
  const offers = applicantOffers(career);
  if (offers.length === 0) return [];
  const who = `${offers.length} ${offers.length === 1 ? 'person is' : 'people are'} waiting`;
  const noneCanBeTaken = offers.every((offer) => offer.refusal !== undefined);
  // The shorter form the main screen falls back to when the rows run out (DL-26 §1): one
  // line, saying the same two facts and naming the key, rather than a block that goes.
  if (short) {
    return wrapAt(
      `${heading('Applicants', 'Applicants', width)}  ${who}` +
        `${noneCanBeTaken ? ', and none can be taken on' : ''}. Press a.`,
      width,
      0,
    );
  }
  // The reason only where one is true of all of them: the generic fallback this used to
  // carry made the cue read "none can be taken on: none can be taken on just now".
  const why = noneCanBeTakenReason(offers, career.config.rosterCap);
  const sentence = noneCanBeTaken
    ? `${who}, and none can be taken on${why === undefined ? '' : `: ${why}`}. ` +
      'Press a to see who they are.'
    : `${who} for an answer. The first goes in ` +
      `${days(Math.min(...offers.map((offer) => offer.daysLeft)))}. Press a to meet them.`;
  return [heading('Applicants', 'Applicants', width), ...wrapAt(sentence, width, 2)];
}

/** Everybody at the door, numbered from one. */
export function applicantLines(career: Career, width: number, content?: Content): string[] {
  const offers = applicantOffers(career);
  const lines = [heading('Applicants', 'Applicants', width)];
  if (offers.length === 0) {
    lines.push(
      ...wrapAt('Nobody is waiting. Let the Days run and see who comes.', width, 2),
    );
    return lines;
  }
  lines.push(
    ...wrapAt(
      `${coin(career.guild.coin)} in hand. ${career.guild.roster.length} of ` +
        `${career.config.rosterCap} places on the Roster taken.`,
      width,
      2,
    ),
  );

  offers.forEach((offer, index) => {
    const { applicant } = offer;
    lines.push('');
    lines.push(...hanging(`${index + 1}  `, applicant.name, width));
    if (applicant.formerHeroId !== undefined) {
      // In words, never a colour or a symbol: they were here before, and they left. The
      // sentence is `narrate`'s, word for word with the browser's (DL-27 §2).
      lines.push(...wrapAt(returnerSentence, width, 5));
    }
    const summary = content?.backgrounds.find((entry) => entry.name === applicant.background)?.summary;
    lines.push(
      ...wrapAt(
        summary === undefined ? applicant.background : `${applicant.background}: ${summary}`,
        width,
        5,
      ),
    );
    const traits = applicant.traits.map((trait) => trait.name).join(', ');
    lines.push(...wrapAt(`Traits: ${traits.length === 0 ? 'none yet' : traits}`, width, 5));
    const stats =
      `Age ${applicant.age}, Might ${applicant.stats.Might}, Craft ${applicant.stats.Craft}, ` +
      `Nerve ${applicant.stats.Nerve}, Guile ${applicant.stats.Guile}`;
    lines.push(...wrapAt(stats, width, 5));
    lines.push(
      ...wrapAt(
        width >= WIDE
          ? `Asks ${coin(applicant.askingFee)}, and waits ${days(offer.daysLeft)} longer`
          : `Asks ${coin(applicant.askingFee)}`,
        width,
        5,
      ),
    );
    if (width < WIDE) lines.push(...wrapAt(`Waits ${days(offer.daysLeft)} longer`, width, 5));
    lines.push(...wrapAt(offerState(career, offer), width, 5));
  });

  return lines;
}
