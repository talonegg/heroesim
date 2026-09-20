/**
 * The other Guilds, and everybody in their employ (E5-S2, E5-S3). The people are numbered
 * straight through, across every Rival, so that `t 7` and `p 7` mean one person and the
 * player never has to hold two numbers in their head at once.
 *
 * Each Hero reads the way an Applicant does — Background and Traits first, Stats second —
 * with what they make of the Guild paying them, because that is what decides whether they
 * can be approached at all. Both fees and both answers come from the engine's own
 * `rivalOffers`; nothing here decides what "they will not deal with you" means.
 */

import {
  hasRoomForAnother,
  rivalOffers,
  type Career,
  type Content,
  type MoveRefusal,
} from '@heroesim/engine';
import { wrongedRivalSentence } from '@heroesim/narrate';
import { coin, hanging, heading, signedRegard, wrapAt, WIDE } from '../screen.js';

/**
 * Why a move cannot be made today, in words. One clause, shared by the list and by the
 * confirmation, so the two can never say different things about the same move.
 */
export function whyNotMove(refusal: MoveRefusal): string {
  switch (refusal.reason) {
    case 'regard':
      return 'they will not deal with you at all';
    case 'heroRegard':
      return 'they are content enough where they are';
    case 'rosterFull':
      return 'there is no room on your Roster';
    case 'coin':
      return `the Guild is ${coin(refusal.shortfall ?? 0)} short`;
    default: {
      // A reason the engine grows and this has not been taught yet: said in words rather
      // than by printing the new identifier at the player (E7-S5).
      const unreachable: never = refusal.reason;
      void unreachable;
      return 'it cannot be done just now';
    }
  }
}

/** Whether a move can be made, and why not when it cannot, as one sentence. */
function moveState(
  what: 'Transfer' | 'Poach',
  fee: number,
  refusal: MoveRefusal | undefined,
): string {
  if (refusal === undefined) return `${what} for ${coin(fee)}: you can do this now.`;
  return `${what} for ${coin(fee)}: ${whyNotMove(refusal)}.`;
}

/** Every other Guild, everybody they employ, and what each move would cost. */
export function rivalLines(career: Career, width: number, content?: Content): string[] {
  const lines = [heading('The other Guilds', 'Guilds', width)];
  lines.push(
    ...wrapAt(
      `${coin(career.guild.coin)} in hand. ${career.guild.roster.length} of ` +
        `${career.config.rosterCap} places on the Roster taken.`,
      width,
      2,
    ),
  );

  let number = 0;
  for (const rival of career.rivals) {
    lines.push('');
    lines.push(...wrapAt(rival.name, width, 2));
    const facts =
      `Standing ${rival.standing}, ${rival.roster.length} on their Roster, ` +
      `Regard for you ${signedRegard(rival.regardForGuild.value)}`;
    lines.push(...wrapAt(facts, width, 4));
    lines.push(...wrapAt(`Regard: ${rival.regardForGuild.reason}`, width, 4));
    // A Guild you have wronged, and whether they can actually do anything about it: one
    // whose own Roster is full has nowhere to put anybody and is harmless until somebody
    // leaves it (finding C7, DL-22 §2). The engine's own predicate, not one restated here,
    // and the sentence is `narrate`'s, word for word with the browser's (DL-27 §2).
    if (rival.regardForGuild.value <= career.config.souredRivalThreshold) {
      lines.push(
        ...wrapAt(wrongedRivalSentence(hasRoomForAnother(rival, career.config)), width, 4),
      );
    }
    if (rival.roster.length === 0) {
      lines.push(...wrapAt('Nobody is on their Roster just now.', width, 4));
      continue;
    }

    for (const offer of rivalOffers(career, rival.id)) {
      number += 1;
      const { hero } = offer;
      lines.push('');
      lines.push(...hanging(`${number}  `, hero.name, width));
      const summary = content?.backgrounds.find((entry) => entry.name === hero.background)?.summary;
      lines.push(
        ...wrapAt(summary === undefined ? hero.background : `${hero.background}: ${summary}`, width, 5),
      );
      const traits = hero.traits.map((trait) => trait.name).join(', ');
      lines.push(...wrapAt(`Traits: ${traits.length === 0 ? 'none yet' : traits}`, width, 5));
      const stats =
        `Age ${hero.age}, Might ${hero.stats.Might}, Craft ${hero.stats.Craft}, ` +
        `Nerve ${hero.stats.Nerve}, Guile ${hero.stats.Guile}`;
      lines.push(...wrapAt(stats, width, 5));
      lines.push(
        ...wrapAt(
          `What they make of ${rival.name}: ${signedRegard(hero.regardForRival.value)}, ` +
            hero.regardForRival.reason,
          width,
          5,
        ),
      );
      lines.push(...wrapAt(moveState('Transfer', offer.transferFee, offer.transferRefusal), width, 5));
      lines.push(...wrapAt(moveState('Poach', offer.poachFee, offer.poachRefusal), width, 5));
    }
  }

  if (width < WIDE) lines.push('');
  return lines;
}
