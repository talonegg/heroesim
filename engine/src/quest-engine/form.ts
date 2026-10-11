// The form module (DL-148 items 9 to 12, DL-280 items 2 to 4, DL-283, DL-284, `CONTEXT.md` Form; the
// architecture review's candidate 1): how much of themselves a Hero brings to a Check on an
// Encounter, as their formed Stats. Each Stat a Hero adds into a Check's score is times factors that
// multiply, with no floor (Q14 c):
// - Morale's, a line through `moraleBaseline`, read at their Morale on the Quest (`workingMorale`), on
//   every Stat;
// - Fatigue's, read at their Fatigue on the Encounter's Day (the Quest clock, clock.ts): the Physical
//   and Magical Stats times 1 − FS·f ÷ `fatigueMax`, the Mental and Social times 1 − (FS ÷ 2)·f ÷
//   `fatigueMax`, FS being `fatigueScaling`;
// - the hurt's, once they are injured on the Quest: the gap 1 − `hurtCheckFactor` taken whole by the
//   Physical Stats and half by every other area, less its relief (`hurtRelief`, DL-285): a share
//   relieved by a Healer, a member of a Class content marks `relievesHurt` other than the hurt Hero
//   among the Party on the Encounter, and a share by a heal Item spent at their Injury, the two
//   multiplying on the gap.
// A Stat's area is content's (`stats.json`), and the Healer is a Class's mark (`classes.json`), so the
// engine names no Stat and no Class (ADR-0006; the architecture review's candidate 5). Each Hero's own
// state sets their own form, not the Party's mean (DL-148 item 9). query.ts reads it once for each
// member of a Party taken for an Encounter (`queryParty`), and the operators read the formed Stats
// for a Check's score alone (DL-148 item 11).
//
// Fatigue also raises the chance harm lands on a Hero on that Day (`fatigueHarm`, Q13 a): an Injury's
// times 1 + FS·f ÷ `fatigueMax`, a Death's times 1 + (FS ÷ 2)·f ÷ `fatigueMax`.
//
// The Party builder gives one line for the Party, from the mean of its Heroes' forms as it sets out
// (`formFigure`, `meanForm`, `formEffect`), and names no Hero's Morale (DL-148 item 12). Pure: it
// draws nothing and reads only what it is given.

import type { GameConfig } from '../config.js';
import type { ContentSet, StatArea } from '../content-types.js';
import type { StatValues } from '../document.js';

/** What Morale's factor reads of the configuration: the scale and the baseline. */
export type MoraleFactorConfig = Pick<GameConfig, 'moraleBaseline' | 'moraleMin' | 'moraleMax'>;

/** What Fatigue's factors read of the configuration: FS and the scale. */
export type FatigueFactorConfig = Pick<GameConfig, 'fatigueScaling' | 'fatigueMax'>;

/** What a Hero's form reads of the configuration. */
export type FormConfig = MoraleFactorConfig & FatigueFactorConfig & Pick<GameConfig, 'hurtCheckFactor'>;

/** What a Hero's form reads of content: each Stat's area. */
export type FormContent = Pick<ContentSet, 'stats'>;

/** What the form module reads: the configuration and each Stat's area. */
export interface FormDeps {
  config: FormConfig;
  content: FormContent;
}

/** What a Hero's form reads of them on an Encounter. */
export interface FormState {
  /** Their Morale on the Quest (`workingMorale`). */
  morale: number;
  /** Their Fatigue on the Encounter's Day (`questClock`'s `fatigueAt`). */
  fatigue: number;
  /** Whether they are hurt on the Quest. */
  hurt: boolean;
  /** The share of their hurt's gap relieved on the Encounter (`hurtRelief`), from 0 to 1; read only when they are hurt. */
  relief: number;
}

/** What relieves a hurt Hero on an Encounter (DL-285): a Healer among the rest of the Party, a heal Item spent at their Injury. */
export interface ReliefBy {
  healer: boolean;
  item: boolean;
}

/** The areas Fatigue takes FS from; it takes half of it from the others (DL-280 item 2). A record, so that `tsc` asks for an area `StatArea` gains. */
const wornWhole: Readonly<Record<StatArea, boolean>> = { physical: true, magical: true, mental: false, social: false };

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

/**
 * Fatigue's factor at `fatigue` on a Stat of `area` (DL-280 item 2, DL-284): 1 − FS·f ÷ `fatigueMax`
 * on the Physical and Magical Stats, 1 − (FS ÷ 2)·f ÷ `fatigueMax` on the Mental and Social; 1 at no
 * Fatigue.
 */
export function fatigueFactor(area: StatArea, fatigue: number, config: FatigueFactorConfig): number {
  const scaling = wornWhole[area] ? config.fatigueScaling : config.fatigueScaling / 2;
  return 1 - (scaling * fatigue) / config.fatigueMax;
}

/**
 * The hurt's factor on a Stat of `area` (DL-280 item 4, DL-284, DL-285): for a Hero hurt on the Quest,
 * the gap 1 − `hurtCheckFactor` less the share `relief` relieves, taken whole from the Physical Stats
 * and half from every other area; 1 for a Hero unhurt.
 */
export function hurtFactor(area: StatArea, state: Pick<FormState, 'hurt' | 'relief'>, config: Pick<GameConfig, 'hurtCheckFactor'>): number {
  if (!state.hurt) return 1;
  const gap = (1 - config.hurtCheckFactor) * (1 - state.relief);
  return area === 'physical' ? 1 - gap : 1 - gap / 2;
}

/**
 * The share of a hurt Hero's gap relieved (DL-280 item 4, Q15 a; DL-285): `healerHurtRelief` by a
 * Healer, `healItemHurtRelief` by a heal Item, multiplying on the gap, so both leave
 * (1 − `healerHurtRelief`) × (1 − `healItemHurtRelief`) of it; 0 by neither.
 */
export function hurtRelief(by: ReliefBy, config: Pick<GameConfig, 'healerHurtRelief' | 'healItemHurtRelief'>): number {
  const left = (by.healer ? 1 - config.healerHurtRelief : 1) * (by.item ? 1 - config.healItemHurtRelief : 1);
  return 1 - left;
}

/**
 * Whether a Hero of `classKey` relieves the hurt of another member of their Party (DL-285): their
 * Class's `relievesHurt` mark in content. A Class content no longer defines relieves nothing.
 */
export function relievesHurt(classKey: string, content: Pick<ContentSet, 'classes'>): boolean {
  return Object.hasOwn(content.classes, classKey) && content.classes[classKey]?.relievesHurt === true;
}

/**
 * A Hero's formed Stats on an Encounter (DL-284): each of `stats`, their effective Stats, times
 * Morale's factor at `state.morale`, Fatigue's at `state.fatigue` and the hurt's after its relief
 * (DL-285), by the Stat's area in content, the factors multiplied. A Stat content does not define, which no effective Stats hold,
 * is times Morale's alone. With every factor 1, each Stat as it is.
 */
export function formedStats(stats: StatValues, state: FormState, deps: FormDeps): StatValues {
  const { config, content } = deps;
  const morale = moraleFactor(state.morale, config);
  const byArea = new Map<StatArea, number>();
  const factorOf = (area: StatArea): number => {
    let factor = byArea.get(area);
    if (factor === undefined) {
      factor = morale * fatigueFactor(area, state.fatigue, config) * hurtFactor(area, state, config);
      byArea.set(area, factor);
    }
    return factor;
  };
  const formed: StatValues = {};
  for (const [key, value] of Object.entries(stats)) {
    const area = Object.hasOwn(content.stats, key) ? content.stats[key]?.area : undefined;
    formed[key] = value * (area === undefined ? morale : factorOf(area));
  }
  return formed;
}

/** What Fatigue does to the chance harm lands on a Hero (`fatigueHarm`). */
export interface HarmFactors {
  /** What an Injury's chance is times. */
  injury: number;
  /** What a Death's chance is times, before it is held at 1. */
  death: number;
}

/**
 * Fatigue's factors on the chance harm lands on a Hero at `fatigue` on an Encounter's Day (DL-280
 * item 2, Q13 a; DL-284): an Injury's times 1 + FS·f ÷ `fatigueMax`, a Death's times 1 + (FS ÷ 2)·f ÷
 * `fatigueMax`, so a chance of 0 stays 0. 1 and 1 at no Fatigue.
 */
export function fatigueHarm(fatigue: number, config: FatigueFactorConfig): HarmFactors {
  const worn = (config.fatigueScaling * fatigue) / config.fatigueMax;
  return { injury: 1 + worn, death: 1 + worn / 2 };
}

/**
 * A Hero's form as one figure, for the Party builder's line alone (DL-148 item 12, DL-284): Morale's
 * factor times the mean, over content's Hero Stats, of Fatigue's and the hurt's factors on each. No
 * Check reads it; a Check reads the formed Stats (`formedStats`).
 */
export function formFigure(state: FormState, deps: FormDeps): number {
  const { config, content } = deps;
  let total = 0;
  let counted = 0;
  for (const stat of Object.values(content.stats)) {
    if (stat.owner !== 'hero') continue;
    total += fatigueFactor(stat.area, state.fatigue, config) * hurtFactor(stat.area, state, config);
    counted += 1;
  }
  return moraleFactor(state.morale, config) * (counted === 0 ? 1 : total / counted);
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

/** The mean of `forms`, each a Hero's form (`formFigure`); 1 for no one, whose form changes nothing. */
export function meanForm(forms: readonly number[]): number {
  return forms.length === 0 ? 1 : forms.reduce((total, form) => total + form, 0) / forms.length;
}
