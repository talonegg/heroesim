/**
 * The Roster, as a whole screen (E7-S3): every Hero with their age, Stats, Traits and
 * what each Trait means, what they think of the Guildmaster and what last moved it, where
 * they are, and whether another Guild could take them.
 *
 * A pure function from a Career and a width to lines of plain text. It holds no state, it
 * reads no terminal, and it decides no rule: who is away, who is injured, when a waiting
 * Party can be home and who is takeable are all the engine's answers (E7 §4).
 */

import type { Career, Content } from '@heroesim/engine';
import { atRiskSentence } from '@heroesim/narrate';
import { heading, labelled, signedRegard, wrapAt, WIDE } from '../screen.js';
import { atRisk, heroStatuses, rosterInOrder, statsOf } from './shared.js';

/** One Hero's Traits, each with the summary content gives it, one per line. */
function traitLines(
  hero: { traits: readonly { name: string; liftsOn?: number }[] },
  content: Content | undefined,
  width: number,
): string[] {
  if (hero.traits.length === 0) return ['    Traits: none yet'];
  return hero.traits.flatMap((trait) => {
    const summary = content?.traits.find((entry) => entry.name === trait.name)?.summary;
    // Wrapped, never cut: a Trait's summary is the whole of why it is printed.
    return wrapAt(summary === undefined ? trait.name : `${trait.name} - ${summary}`, width, 4);
  });
}

/**
 * Every Hero on the Roster, sorted by where they are and then by name. A departed or dead
 * Hero appears nowhere here; they are on the former Heroes page (E7-S3).
 */
export function rosterLines(career: Career, width: number, content?: Content): string[] {
  const lines = [heading('The Roster', 'Roster', width)];
  if (career.guild.roster.length === 0) {
    lines.push(...wrapAt('Nobody is on the Roster. Take somebody on at the door.', width, 2));
    return lines;
  }
  const statuses = heroStatuses(career);
  const risks = atRisk(career);
  lines.push(
    ...wrapAt(`${career.guild.roster.length} of ${career.config.rosterCap} places taken.`, width, 2),
  );
  for (const hero of rosterInOrder(career, statuses)) {
    lines.push('');
    const oneLine = `  ${hero.name}, ${hero.age}, Might/Craft/Nerve/Guile ${statsOf(hero)}`;
    if (width >= WIDE && oneLine.length <= width) {
      lines.push(oneLine);
    } else {
      lines.push(...wrapAt(hero.name, width, 2));
      lines.push(...labelled('Age', String(hero.age), width, 4));
      lines.push(...labelled('Might/Craft/Nerve/Guile', statsOf(hero), width, 4));
    }
    lines.push(...wrapAt(statuses.get(hero.id)?.text ?? 'available', width, 4));
    // The number and the reason together: a bare number is never the whole cell (E7-S3).
    lines.push(
      ...wrapAt(
        `Regard for you ${signedRegard(hero.regardForGuildmaster.value)}: ` +
          `${hero.regardForGuildmaster.reason}`,
        width,
        4,
      ),
    );
    lines.push(...traitLines(hero, content, width));
    const minded = risks.get(hero.id);
    if (minded !== undefined) lines.push(...wrapAt(atRiskSentence(minded), width, 4));
  }
  return lines;
}
