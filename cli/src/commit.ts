/**
 * Putting a Party together and sending it (E2-S5): the Commission, who is free, who would
 * refuse and why, and what insisting would cost — stated before the keypress that accepts
 * it, and never sent on that first Enter.
 *
 * Every refusal is `proposeParty`'s own answer, asked of the engine after each keypress
 * rather than worked out here, so a screen can never say something the commit then
 * contradicts (E7-S5).
 */

import {
  availableHeroes,
  type Career,
  type Commission,
  type Content,
  type Refusal,
} from '@heroesim/engine';
import { difficultyWord } from '@heroesim/narrate';
import { coin, days, hanging, heading, keyHints, signedRegard, wrapAt, WIDE } from './screen.js';
import { heroStatuses, statsOf, traitNames } from './views/shared.js';

/** The letters the Roster is labelled with, a to l. */
export const ROSTER_LETTERS = 'abcdefghijkl';

/** The terms of one Commission, in the order a player weighs them. */
export function commissionTerms(commission: Commission, career: Career): string {
  return (
    `${coin(commission.fee)}, ${difficultyWord(commission.difficulty, career.config)}, ` +
    `${days(commission.spanDays)}, ${commission.beatCount} Beats`
  );
}

/** The Patron who posted a Commission, by name. */
export function patronName(career: Career, patronId: string): string {
  return career.patrons.find((patron) => patron.id === patronId)?.name ?? 'an unknown Patron';
}

/** The screen shown while a Party is being put together. */
export function selectionLines(
  career: Career,
  commission: Commission,
  chosen: readonly string[],
  width: number,
): string[] {
  // The work itself is the heading, in the words the Patron posted it under.
  const lines = wrapAt(commission.title, width, 0);
  lines.push(...wrapAt(`For ${patronName(career, commission.patronId)}`, width, 2));
  lines.push(...wrapAt(commissionTerms(commission, career), width, 2));
  lines.push('');
  const free = new Set(availableHeroes(career).map((hero) => hero.id));
  const statuses = heroStatuses(career);
  career.guild.roster.forEach((hero, index) => {
    const letter = ROSTER_LETTERS[index] ?? '-';
    const mark = chosen.includes(hero.id) ? '*' : ' ';
    const head =
      width >= WIDE
        ? `${hero.name}, ${hero.age}, ${statsOf(hero)}, ` +
          `Regard ${signedRegard(hero.regardForGuildmaster.value)}`
        : hero.name;
    lines.push(...hanging(`${letter}${mark} `, head, width));
    if (width < WIDE) {
      lines.push(
        ...wrapAt(
          `${hero.age}, ${statsOf(hero)}, Regard ${signedRegard(hero.regardForGuildmaster.value)}`,
          width,
          5,
        ),
      );
    }
    lines.push(...wrapAt(`Traits: ${traitNames(hero)}`, width, 5));
    // Why a name cannot be picked, in words: away on work, or still injured (E3-S2).
    if (!free.has(hero.id)) {
      lines.push(...wrapAt(statuses.get(hero.id)?.text ?? 'not available', width, 5));
    }
  });
  return lines;
}

/**
 * Who would refuse the work, and why, shown under the Party as it is put together (E2).
 * A refusal over Regard blames the relationship; a refusal over a Trait quotes that
 * Trait's own summary, so the player is reading the character rather than a rule.
 *
 * @param refusals what `proposeParty` answered. An empty list produces no lines at all.
 */
export function refusalLines(
  career: Career,
  refusals: readonly Refusal[],
  width: number,
  content?: Content,
): string[] {
  if (refusals.length === 0) return [];
  const lines = ['', heading('Who will not go', 'Refusing', width)];
  for (const refusal of refusals) {
    const hero = career.guild.roster.find((candidate) => candidate.id === refusal.heroId);
    // Somebody who is no longer on the Roster is said in words, never by identifier.
    const name = hero?.name ?? 'Somebody you chose';
    const reason =
      refusal.reason === 'regard' || refusal.trait === undefined
        ? `Regard for you stands at ${signedRegard(refusal.regardValue)}.`
        : refusal.trait;
    // Wrapped rather than cut: the reason is the whole of the point.
    lines.push(...wrapAt(`${name}: ${reason}`, width, 2));
    if (refusal.reason === 'regard' || refusal.trait === undefined) continue;
    const summary = content?.traits.find((trait) => trait.name === refusal.trait)?.summary;
    if (summary !== undefined) lines.push(...wrapAt(summary, width, 4));
  }
  return lines;
}

/**
 * What insisting would cost, printed before the keypress that accepts it. Never shown
 * unless somebody is actually refusing.
 */
export function insistenceLines(
  career: Career,
  refusals: readonly Refusal[],
  width: number,
): string[] {
  if (refusals.length === 0) return [];
  const cost = Math.abs(career.config.insistenceRegardCost);
  return [
    '',
    ...wrapAt(
      `${refusals.length === 1 ? 'One Hero' : `${refusals.length} Heroes`} will not go. ` +
        `Insisting costs each of them ${cost} Regard, and at ` +
        `${signedRegard(career.config.departureRegardThreshold)} a Hero may walk out.`,
      width,
      0,
    ),
    ...keyHints(['[i] insist and send them', '[anything else] go back'], width),
  ];
}
