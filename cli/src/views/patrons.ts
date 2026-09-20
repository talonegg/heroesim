/**
 * The Patrons, grouped by Sphere (E7-S3): what each one thinks of the Guild, what last
 * moved it, and what they have on the Board — and, where their Regard has reached the
 * floor, that they are posting nothing at all, because silence is information.
 *
 * Whether a Patron posts is the engine's own `postingPatrons`, which is what the Board
 * itself asks; nothing here decides where the floor is (DL-25 §2).
 */

import { postingPatrons, type Career, type Content, type Patron } from '@heroesim/engine';
import { postingNothingSentence } from '@heroesim/narrate';
import { coin, heading, signedRegard, wrapAt, WIDE } from '../screen.js';

/** The Spheres in the order the content lists them, with the Patrons that belong to each. */
function bySphere(career: Career, content: Content | undefined): [string, Patron[]][] {
  const order = content?.spheres.map((sphere) => sphere.id) ?? [];
  const names = new Map(content?.spheres.map((sphere) => [sphere.id, sphere.name]) ?? []);
  const groups = new Map<string, Patron[]>();
  for (const patron of career.patrons) {
    const group = groups.get(patron.sphere) ?? [];
    group.push(patron);
    groups.set(patron.sphere, group);
  }
  const ids = [...groups.keys()].sort((left, right) => {
    const at = order.indexOf(left) - order.indexOf(right);
    return at !== 0 ? at : left.localeCompare(right);
  });
  // A Sphere whose name content does not carry is said in words: a heading is a thing the
  // player reads, and no sentence or label names an identifier (E7-S5).
  return ids.map((id) => [names.get(id) ?? 'Another Sphere', groups.get(id) ?? []]);
}

/** Every Patron, by Sphere, with their Regard, its reason and what they are posting. */
export function patronLines(career: Career, width: number, content?: Content): string[] {
  const lines = [heading('Patrons', 'Patrons', width)];
  if (career.patrons.length === 0) {
    lines.push(...wrapAt('No Patron holds an opinion of the Guild yet.', width, 2));
    return lines;
  }
  const posting = new Set(postingPatrons(career).map((patron) => patron.id));

  for (const [sphere, patrons] of bySphere(career, content)) {
    lines.push('');
    lines.push(...wrapAt(sphere, width, 2));
    for (const patron of patrons) {
      const regard = signedRegard(patron.regardForGuild.value);
      const oneLine = `    ${patron.name}, Regard ${regard}`;
      if (width >= WIDE && oneLine.length <= width) {
        lines.push(oneLine);
      } else {
        lines.push(...wrapAt(patron.name, width, 4));
        lines.push(...wrapAt(`Regard ${regard}`, width, 6));
      }
      lines.push(...wrapAt(`Regard: ${patron.regardForGuild.reason}`, width, 6));
      const theirs = career.board.filter((commission) => commission.patronId === patron.id);
      if (!posting.has(patron.id)) {
        // Explicitly, in words: a Patron this low posts nothing, and will go on posting
        // nothing until their Regard comes back up. The sentence is `narrate`'s, word for
        // word with the browser's (DL-27 §2).
        lines.push(...wrapAt(postingNothingSentence, width, 6));
      } else if (theirs.length === 0) {
        lines.push(...wrapAt('Nothing of theirs is on the Board just now.', width, 6));
      } else {
        for (const commission of theirs) {
          lines.push(
            ...wrapAt(`On the Board: ${commission.title}, ${coin(commission.fee)}`, width, 6),
          );
        }
      }
    }
  }
  return lines;
}
