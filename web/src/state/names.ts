// How the views name things (M7-S3): a content row by its name, a row of the world by its id, an
// ordinal, a night. Words only; no rule. Shared by `selectors.ts`, `world-views.ts` and
// `trade-views.ts` (DL-73).

import { dayOf, type ContentSet, type Guild, type QuestBand, type TraitEffect } from '@heroesim/engine';

/** A Quest band in words, as the History and the Quest report say it: one list for both (M9-F6). */
export const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'Failure', success: 'Success', strong: 'Strong success' };

/** The row of `rows` keyed by `id`, never one `Object.prototype` lends (`constructor`). */
export function rowOf<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
export function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return rowOf(rows, key)?.name ?? key;
}

export function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** `the night of Day 7`. */
export function nightOf(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
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

/** `+2`, `-1`, `0`. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * A Guildmaster Trait's effect in words (the CLI's `traitEffectWords`): `+1 Weaponry to Warriors`,
 * `Morale baseline -5`, `Upkeep ×0.9`; the Guildmaster's page's and the new-game form's (M9-S2).
 */
export function traitEffectWords(effect: TraitEffect | null, set: Pick<ContentSet, 'stats' | 'classes'>): string {
  if (effect === null) return 'No effect';
  switch (effect.kind) {
    case 'classStatBonus':
      return `${signed(effect.delta)} ${nameIn(set.stats, effect.statKey)} to ${nameIn(set.classes, effect.classKey)}s`;
    case 'guildMoraleShift':
      return `Morale baseline ${signed(effect.delta)}`;
    case 'upkeepFactor':
      return `Upkeep ×${effect.factor}`;
  }
}
