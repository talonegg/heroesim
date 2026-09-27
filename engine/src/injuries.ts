// Inflicting an Injury (INPUTS 4.5, M2-S5, DL-29, DL-53): how its Days become the night it heals.
// The one statement of the rule, for a Quest's outcome (the Quest Engine and `questsConclude`) and a
// module's `injure` effect alike (M8-S2, DL-77).

import type { InjuryTypeKey } from './content-types.js';
import type { Hero, Turn } from './document.js';
import { dayOf, nightOf } from './time.js';

/**
 * An Injury's Days to heal once `factor`, the infirmary's (`healFactor`), is applied: rounded to the
 * nearest Day, and at least 1.
 */
export function healDays(days: number, factor: number): number {
  return Math.max(1, Math.round(days * factor));
}

/**
 * Gives `hero` the Injury `typeKey`, healing on the night `days` Days after the Day of `turn`, and
 * returns that night, its `healsOnTurn`. The caller emits `hero.injured`.
 */
export function inflictInjury(hero: Pick<Hero, 'injury'>, typeKey: InjuryTypeKey, days: number, turn: Turn): Turn {
  const healsOnTurn = nightOf(dayOf(turn) + days);
  hero.injury = { typeKey, healsOnTurn };
  return healsOnTurn;
}
