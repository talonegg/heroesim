// How the views name things (M7-S3): a Class's mark, an ordinal, a place in the Rankings. Words
// only; no rule. Shared by `selectors.ts`, `world-views.ts` and `trade-views.ts` (DL-73). A row of
// the world by its id, a content row's name, a list, a signed number, a capital and a Trait's effects
// are `@heroesim/words`', which the CLI reads too (DL-186 item 1, DL-241), and so is a night.

import { classIcons, isClassIcon, type ClassIcon, type ClassKey, type ContentSet, type Guild, type QuestBand } from '@heroesim/engine';
import { nameIn, rowOf } from '@heroesim/words';

/** A Quest band in words, as the History and the Quest report say it: one list for both (M9-F6). */
export const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'Failure', success: 'Success', strong: 'Strong success' };

/** The names a Class's icon may take: the engine's, handed on from here since only `state/` takes the engine's values (`imports.test.ts`), for the page's tests of its drawings. */
export { classIcons };

/**
 * A Hero's Class as a row carries it, so that their name can be shown with the Class's mark (v1.1.7-S6,
 * DL-206 items 22 and 23, DL-212): its name, its key, and its icon's name when the Class names one the
 * page draws, `null` for the plain mark. A name outside the set never reaches here: `validateContent`
 * refuses it.
 */
export interface ClassMarked {
  className: string;
  classKey: ClassKey;
  classIcon: ClassIcon | null;
}

/** A Class's `ClassMarked`, from `set`'s Classes. */
export function classMarkOf(set: Pick<ContentSet, 'classes'>, classKey: ClassKey): ClassMarked {
  const icon = rowOf(set.classes, classKey)?.icon;
  return { className: nameIn(set.classes, classKey), classKey, classIcon: icon !== undefined && isClassIcon(icon) ? icon : null };
}

/** `1st`, `2nd`, `3rd`, `11th`, `22nd`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** A place in the Rankings (`rankingPlaces`, DL-95): `4th`, or `joint 2nd` for one Guilds share. */
export function placeWords({ place, joint }: { place: number; joint: boolean }): string {
  return joint ? `joint ${ordinal(place)}` : ordinal(place);
}

/**
 * Who makes a Guild's choices (`show guilds`), the player's Guild as `Yours`, a Rival's with its
 * Disposition by name as the Guilds' table has it: `Rival (Steady)` (DL-125 item 9).
 */
export function controllerWords(guild: Pick<Guild, 'controller'>, set: Pick<ContentSet, 'dispositions'>): string {
  return guild.controller.kind === 'player' ? 'Yours' : `Rival (${nameIn(set.dispositions, guild.controller.disposition)})`;
}

/**
 * What a Transfer out costs the Guild that lets a Hero go, in the words the page has always given
 * the rule (DL-73): what a confirmation states beside the fee before the player lets one go (M9-S6,
 * the review's E4). The rule is the engine's (`makeTransfer`): gear returns to the Guild, and each
 * Hero who stays and holds the Hero in `transferRegardBand` or above loses `transferMoraleCost`.
 */
export const transferCostWords = 'Their Gear stays with your Guild, and the Heroes left behind who held them in high Regard lose Morale.';
