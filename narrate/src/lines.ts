/**
 * The lines `narrate` writes itself, as opposed to the ones it fills in from a Vignette.
 * Tone: plain, specific, under-adorned, British English. No emoji and no exclamation
 * marks — the prose earns its effect from what happened, not from punctuation.
 */

import { STATS, type Career, type EngineErrorCode, type Reckoning } from '@heroesim/engine';

/** "Brenna", "Brenna and Corin", "Brenna, Corin and Ilsa". No Oxford comma. */
export function joinNames(names: readonly string[]): string {
  const last = names[names.length - 1];
  if (last === undefined) return 'nobody';
  if (names.length === 1) return last;
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** "1 Commission" / "3 Commissions". Coin is never counted this way; it is never plural. */
export function count(amount: number, singular: string, plural: string): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

/**
 * The Day as the player reads it: "Year 3, Day 47", counting from Year 1, Day 1.
 *
 * @param day the Day number on the Career, starting at 1
 * @param career the Career, for `config.daysPerYear`
 */
export function formatDay(day: number, career: Career): string {
  const perYear = career.config.daysPerYear;
  if (!Number.isFinite(perYear) || perYear <= 0) return `Day ${day}`;
  const year = Math.floor((day - 1) / perYear) + 1;
  const dayOfYear = ((day - 1) % perYear) + 1;
  return `Year ${year}, Day ${dayOfYear}`;
}

/**
 * One sentence for a rejected engine call. The switch is exhaustive, so a new
 * `EngineErrorCode` fails the type check here until somebody writes its sentence.
 *
 * @param ctx optional specifics — `commission`, `hero` or `detail` — used where they help
 */
export function errorSentence(
  code: EngineErrorCode,
  ctx?: Record<string, string | number>,
): string {
  const commission = ctx?.['commission'];
  const hero = ctx?.['hero'];
  const detail = ctx?.['detail'];
  switch (code) {
    case 'CommissionNotOnBoard':
      return commission === undefined
        ? 'That Commission is not on the Board any more.'
        : `"${String(commission)}" is not on the Board any more.`;
    case 'HeroNotAvailable':
      return hero === undefined
        ? 'That Hero cannot go: they are away on a Commission, or not on the Roster.'
        : `${String(hero)} cannot go: they are away on a Commission, or not on the Roster.`;
    case 'EmptyParty':
      return 'A Party needs at least one Hero in it.';
    case 'CareerEnded':
      return 'The Career has ended, so there is nothing further to decide.';
    case 'InternalError':
      return detail === undefined
        ? 'The engine reached a state it did not expect. Nothing was changed.'
        : `The engine reached a state it did not expect (${String(detail)}). Nothing was changed.`;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

/**
 * What the Guild became, a line at a time. The caller decides how to lay them out; the
 * CLI prints one per line and the web front end puts them in a list.
 */
export function reckoningLines(reckoning: Reckoning, career: Career): string[] {
  const { guildmaster } = career.guild;
  const lines: string[] = [
    `${career.guild.name}, under ${guildmaster.name}, after ${count(reckoning.years, 'year', 'years')}.`,
    `Commissions: ${reckoning.commissionsCompleted} finished, ${reckoning.commissionsFailed} not.`,
    `Heroes: ${reckoning.heroesOnRoster} on the Roster at the end, ` +
      `${reckoning.heroesLost} lost along the way.`,
  ];

  const favourite = reckoning.favouritePatron;
  if (favourite !== undefined) {
    lines.push(
      `Most work bought by ${favourite.name}: ` +
        `${count(favourite.count, 'Commission', 'Commissions')} finished for them.`,
    );
  } else {
    lines.push('No Patron bought more finished work than any other.');
  }

  lines.push(`Coin: ${reckoning.peakCoin} at its highest, ${reckoning.finalCoin} at the end.`);
  lines.push(`Standing: ${reckoning.standing}.`);

  const { start, end } = reckoning.guildmasterStats;
  lines.push(
    `The Guildmaster's Stats: ${STATS.map((stat) =>
      start[stat] === end[stat]
        ? `${stat} ${end[stat]}`
        : `${stat} ${start[stat]} to ${end[stat]}`,
    ).join(', ')}.`,
  );

  return lines;
}
