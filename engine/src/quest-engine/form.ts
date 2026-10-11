// A Hero's form (DL-148 items 9 to 12, DL-283, `CONTEXT.md` Form): how much of themselves a Hero
// brings to a Check on a Quest. It is Morale's factor, a line through `moraleBaseline` read at their
// Morale on the Quest (`workingMorale`), times `hurtCheckFactor` once they are hurt on it. Each Hero's
// own Morale sets their own form, not the Party's mean (DL-148 item 9). It scales only the Stat values
// a Hero adds into a Check's score (query.ts, DL-148 item 11).
//
// The Party builder gives one line for the Party, from its mean form as it sets out (`formEffect`),
// and names no Hero's Morale (DL-148 item 12). Pure: it draws nothing and reads only what it is given.

import type { GameConfig } from '../config.js';

/** What Morale's factor reads of the configuration: the scale and the baseline. */
export type MoraleFactorConfig = Pick<GameConfig, 'moraleBaseline' | 'moraleMin' | 'moraleMax'>;

/** What a Hero's form reads of the configuration. */
export type FormConfig = MoraleFactorConfig & Pick<GameConfig, 'hurtCheckFactor'>;

/**
 * A Hero's Morale on a Quest (DL-148 item 5): their Morale as they set out, plus the Morale
 * consequences applied so far, `delta`, held inside `moraleMin` to `moraleMax`. Their stored Morale
 * still changes only on the return.
 */
export function workingMorale(morale: number, delta: number, config: Pick<GameConfig, 'moraleMin' | 'moraleMax'>): number {
  return Math.min(config.moraleMax, Math.max(config.moraleMin, morale + delta));
}

/**
 * Morale's factor at `morale` (DL-280 item 3, DL-283): 1 + (m − `moraleBaseline`) ÷ (2 × (`moraleMax`
 * − `moraleMin`)), a line through 1 at the baseline, a quarter more half the scale above it and a
 * quarter less half the scale below. The same for every Guild: what a Guild adds to its Heroes' Morale
 * moves the Morale they drift to, not the line. The Morale bands' rule keeps the scale wider than 0.
 */
export function moraleFactor(morale: number, config: MoraleFactorConfig): number {
  return 1 + (morale - config.moraleBaseline) / (2 * (config.moraleMax - config.moraleMin));
}

/** The form of a Hero at `morale` on the Quest: Morale's factor there, times `hurtCheckFactor` if `hurt` on it. */
export function formOf(morale: number, hurt: boolean, config: FormConfig): number {
  const factor = moraleFactor(morale, config);
  return hurt ? factor * config.hurtCheckFactor : factor;
}

/** What a Party's mean form does to its odds, as the Party builder words it (DL-148 item 12). */
export const formEffects = ['raises', 'none', 'lowers-a-little', 'lowers-badly'] as const;

export type FormEffect = (typeof formEffects)[number];

/** How near a mean form must come to a threshold to count as at it: the mean of factors is rounded. */
const formTolerance = 1e-9;

/**
 * The effect of a mean form `mean` (DL-154, DL-283): above 1 it `raises` the odds; at 1 it makes
 * `none`; down to Morale's factor at the `low` band's start, a Party no worse on the whole than every
 * Hero in low spirits, it `lowers-a-little`; below that, `lowers-badly`.
 */
export function formEffect(mean: number, config: MoraleFactorConfig & Pick<GameConfig, 'moraleBands'>): FormEffect {
  if (mean > 1 + formTolerance) return 'raises';
  if (mean >= 1 - formTolerance) return 'none';
  if (mean >= moraleFactor(config.moraleBands.low, config) - formTolerance) return 'lowers-a-little';
  return 'lowers-badly';
}

/** The mean of `forms`, each a Hero's form; 1 for no one, whose form changes nothing. */
export function meanForm(forms: readonly number[]): number {
  return forms.length === 0 ? 1 : forms.reduce((total, form) => total + form, 0) / forms.length;
}
