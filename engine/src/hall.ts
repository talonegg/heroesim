/**
 * The Hall: the only thing coin buys besides Upkeep (E3-S4). Three improvements, bought
 * once each, totalling 700 coin — a milestone rather than an economy.
 *
 * Each one does exactly one thing, and each is a named `GameConfig` field:
 *
 * - **infirmary** shortens the span of every Injury given from then on, and none already
 *   borne (`state.ts`, `injurySpan`)
 * - **training yard** adds to every Party's Backing, before the clamp (`check.ts`)
 * - **quarters** multiplies the idle threshold E2's Regard drift runs against, so neglect
 *   takes longer to bite (`regard.ts`, `quartersFactor`)
 */

import { cloneCareer } from './clone.js';
import type { GameConfig } from './config.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import { changeCoin } from './state.js';
import { HALL_INFIRMARY, HALL_QUARTERS, HALL_TRAINING_YARD } from './types.js';
import type { Career, HallImprovement, Step } from './types.js';

/** What an improvement costs in this Career. */
export function hallCost(improvement: HallImprovement, config: GameConfig): number {
  switch (improvement) {
    case HALL_INFIRMARY:
      return config.hallInfirmaryCost;
    case HALL_TRAINING_YARD:
      return config.hallTrainingYardCost;
    case HALL_QUARTERS:
      return config.hallQuartersCost;
    default: {
      const unreachable: never = improvement;
      throw new EngineError('InternalError', `no cost for Hall improvement ${String(unreachable)}`);
    }
  }
}

/**
 * Buy an improvement for the Hall. Legal on any Day, including while Parties are away.
 *
 * Every rejection leaves the Career byte-identical to the one that was passed in: the copy
 * is taken after the checks, so nothing at all has moved when one of them throws.
 *
 * @throws EngineError `CareerEnded` when there is no Career left to spend on,
 * `AlreadyImproved` when the Hall already holds it, or `InsufficientCoin` when the Guild
 * cannot pay for it.
 */
export function improveHall(career: Career, improvement: HallImprovement): Step {
  if (career.ended !== undefined) {
    throw new EngineError('CareerEnded', 'the Career has ended; the Hall cannot be improved further');
  }
  if (career.guild.hall.includes(improvement)) {
    throw new EngineError('AlreadyImproved', `the Hall already has ${improvement}`);
  }
  const cost = hallCost(improvement, career.config);
  if (career.guild.coin < cost) {
    throw new EngineError(
      'InsufficientCoin',
      `${improvement} costs ${cost} coin and the Guild holds ${career.guild.coin}`,
    );
  }

  const draft = cloneCareer(career);
  const events: GameEvent[] = [];
  draft.guild.hall.push(improvement);
  events.push({
    type: 'HallImproved',
    day: draft.day,
    improvement,
    cost,
    balance: draft.guild.coin - cost,
  });
  changeCoin(draft, -cost, 'hall', events);
  return { career: draft, events };
}
