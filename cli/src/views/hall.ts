/**
 * The Hall (E3-S4): three improvements, each bought once, with what it costs, what it
 * does and whether the Guild can pay for it — all in words, so nothing about the state of
 * an improvement is carried by colour alone.
 */

import {
  hallCost,
  HALL_IMPROVEMENTS,
  type Career,
  type GameConfig,
  type HallImprovement,
} from '@heroesim/engine';
import { coin, hanging, heading, wrapAt, WIDE } from '../screen.js';

/** What each improvement is called, and what buying it does, in one clause each. */
const EFFECTS: Record<HallImprovement, { name: string; effect: (config: GameConfig) => string }> = {
  infirmary: {
    name: 'Infirmary',
    effect: (config) =>
      `every Injury given from now on runs ${Math.round(config.infirmaryInjuryFactor * 100)}% ` +
      'as long',
  },
  trainingYard: {
    name: 'Training yard',
    effect: (config) => `+${config.trainingYardBacking} Backing for every Party you send`,
  },
  quarters: {
    name: 'Quarters',
    effect: (config) =>
      `neglect takes ${config.regardDecayQuartersFactor} times as long to tell: ` +
      `${config.regardDecayEveryDays * config.regardDecayQuartersFactor} idle Days`,
  },
};

/** The Hall, numbered from one, with the cost, the effect and the state of each. */
export function hallLines(career: Career, width: number): string[] {
  const lines = [heading('The Hall', 'Hall', width)];
  lines.push(...wrapAt(`${coin(career.guild.coin)} in hand. Each is bought once.`, width, 2));
  HALL_IMPROVEMENTS.forEach((improvement, index) => {
    const cost = hallCost(improvement, career.config);
    const entry = EFFECTS[improvement];
    lines.push('');
    if (width >= WIDE) {
      lines.push(...hanging(`${index + 1}  `, `${entry.name}, ${coin(cost)}`, width));
    } else {
      lines.push(...hanging(`${index + 1}  `, entry.name, width));
      lines.push(...wrapAt(`Cost  ${coin(cost)}`, width, 5));
    }
    // Wrapped, never cut: the effect is the whole of why the line is printed, and E3 lost
    // the last word of this one to a clip.
    lines.push(...wrapAt(entry.effect(career.config), width, 5));
    lines.push(
      ...wrapAt(
        career.guild.hall.includes(improvement)
          ? 'Already built.'
          : career.guild.coin < cost
            ? `${coin(cost - career.guild.coin)} short.`
            : 'You can afford this.',
        width,
        5,
      ),
    );
  });
  return lines;
}
