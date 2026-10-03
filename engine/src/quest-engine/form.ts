// A Hero's form (v1.1.4-S3, DL-148 items 9 to 12, `CONTEXT.md` Form): how much of themselves a Hero
// brings to a Check on a Quest. It is the `moraleCheckFactor` of the band of their Morale on the
// Quest (`workingMorale`), times `hurtCheckFactor` once they are hurt on it. Each Hero's own band
// sets their own form, not the Party's mean (item 9). It scales only the Stat values a Hero adds
// into a Check's score (query.ts, item 11).
//
// The Party builder gives one line for the Party, from its mean form as it sets out (`formEffect`),
// and names no Hero's Morale (item 12). Pure: it draws nothing and reads only what it is given.

import type { GameConfig } from '../config.js';
import { moraleBand } from '../morale.js';

/** What a Hero's form reads of the configuration. */
export type FormConfig = Pick<GameConfig, 'moraleCheckFactor' | 'hurtCheckFactor' | 'moraleBands'>;

/**
 * A Hero's Morale on a Quest (DL-148 item 5): their Morale as they set out, plus the Morale
 * consequences applied so far, `delta`, held inside `moraleMin` to `moraleMax`. Their stored Morale
 * still changes only on the return.
 */
export function workingMorale(morale: number, delta: number, config: Pick<GameConfig, 'moraleMin' | 'moraleMax'>): number {
  return Math.min(config.moraleMax, Math.max(config.moraleMin, morale + delta));
}

/** The form of a Hero at `morale` on the Quest: their band's `moraleCheckFactor`, times `hurtCheckFactor` if `hurt` on it. */
export function formOf(morale: number, hurt: boolean, config: FormConfig): number {
  const factor = config.moraleCheckFactor[moraleBand(morale, config)];
  return hurt ? factor * config.hurtCheckFactor : factor;
}

/** What a Party's mean form does to its odds, as the Party builder words it (DL-148 item 12). */
export const formEffects = ['raises', 'none', 'lowers-a-little', 'lowers-badly'] as const;

export type FormEffect = (typeof formEffects)[number];

/** How near a mean form must come to a threshold to count as at it: the mean of factors is rounded. */
const formTolerance = 1e-9;

/**
 * The effect of a mean form `mean` (DL-154): above 1 it `raises` the odds; at 1 it makes `none`; down
 * to the `low` band's factor, a Party no worse on the whole than every Hero in low spirits, it
 * `lowers-a-little`; below that, `lowers-badly`.
 */
export function formEffect(mean: number, config: Pick<GameConfig, 'moraleCheckFactor'>): FormEffect {
  if (mean > 1 + formTolerance) return 'raises';
  if (mean >= 1 - formTolerance) return 'none';
  if (mean >= config.moraleCheckFactor.low - formTolerance) return 'lowers-a-little';
  return 'lowers-badly';
}

/** The mean of `forms`, each a Hero's form; 1 for no one, whose form changes nothing. */
export function meanForm(forms: readonly number[]): number {
  return forms.length === 0 ? 1 : forms.reduce((total, form) => total + form, 0) / forms.length;
}
