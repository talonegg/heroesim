/**
 * The Board: what is on offer, what a Rival takes, and what falls off. Solution
 * architecture §5. A Patron whose Regard has soured posts less, and one at the floor
 * posts nothing at all.
 */

import { clamp, type GameConfig } from './config.js';
import type { Content, SphereDef } from './content.js';
import { EngineError } from './errors.js';
import type { GameEvent } from './events.js';
import type { Rng } from './rng.js';
import { changePatronRegard, nextRefreshDay, requirePatron } from './state.js';
import type { Career, Commission, Patron } from './types.js';

/** The reason a Patron's Regard moves when their work went to somebody else. */
export const REASON_PASSED_OVER = 'you passed on their work';

function sphereOf(content: Content, patron: Patron): SphereDef {
  const sphere = content.spheres.find((candidate) => candidate.id === patron.sphere);
  if (sphere === undefined) {
    throw new EngineError('InternalError', `Patron "${patron.name}" belongs to unknown Sphere "${patron.sphere}"`);
  }
  return sphere;
}

/** The fee a Commission of this difficulty pays, interpolated across the configured range. */
export function feeFor(difficulty: number, config: GameConfig): number {
  const span = config.difficultyMax - config.difficultyMin;
  const ratio = span === 0 ? 0 : (difficulty - config.difficultyMin) / span;
  return Math.round(config.feeMin + (config.feeMax - config.feeMin) * clamp(ratio, 0, 1));
}

/** Patrons willing to post: those whose Regard is strictly above the configured floor. */
export function postingPatrons(career: Career): Patron[] {
  return career.patrons.filter(
    (patron) => patron.regardForGuild.value > career.config.patronPostsAboveRegard,
  );
}

function pickPatronByRegard(patrons: readonly Patron[], config: GameConfig, rng: Rng): Patron {
  const weight = (patron: Patron): number =>
    patron.regardForGuild.value - config.patronPostsAboveRegard;
  const total = patrons.reduce((sum, patron) => sum + weight(patron), 0);
  let target = rng.float() * total;
  for (const patron of patrons) {
    target -= weight(patron);
    if (target < 0) return patron;
  }
  return rng.pick(patrons);
}

/** Draw up one Commission for a Patron, from their Sphere's titles. */
export function makeCommission(
  draft: Career,
  patron: Patron,
  content: Content,
  rng: Rng,
  ordinal: number,
): Commission {
  const { config } = draft;
  const sphere = sphereOf(content, patron);
  const onBoard = new Set(draft.board.map((commission) => commission.title));
  const fresh = sphere.commissionTitles.filter((entry) => !onBoard.has(entry.title));
  const entry = rng.pick(fresh.length > 0 ? fresh : sphere.commissionTitles);
  const difficulty = clamp(entry.difficulty, config.difficultyMin, config.difficultyMax);
  return {
    id: `c${draft.day}.${ordinal}`,
    patronId: patron.id,
    title: entry.title,
    fee: feeFor(difficulty, config),
    difficulty,
    spanDays: rng.between(config.commissionSpanMin, config.commissionSpanMax),
    beatCount: rng.between(config.beatsMin, config.beatsMax),
    tags: [...entry.tags],
    postedOn: draft.day,
    expiresOn: nextRefreshDay(draft.day, config),
  };
}

/**
 * Post `count` Commissions to the Board, drawn from the Patrons willing to post and
 * weighted towards the ones who think well of the Guild. Reports each one.
 */
export function postCommissions(
  draft: Career,
  content: Content,
  rng: Rng,
  count: number,
  events: GameEvent[],
): void {
  const willing = postingPatrons(draft);
  if (willing.length === 0) return;
  for (let index = 0; index < count; index += 1) {
    const patron = pickPatronByRegard(willing, draft.config, rng);
    const commission = makeCommission(draft, patron, content, rng, draft.board.length + 1);
    draft.board.push(commission);
    events.push({
      type: 'CommissionPosted',
      day: draft.day,
      commissionId: commission.id,
      patronId: patron.id,
    });
  }
}

/**
 * Refresh the Board: a Rival takes what was left, the rest expires, and the Board is
 * refilled to a size within the configured bounds.
 */
export function refreshBoard(draft: Career, content: Content, rng: Rng, events: GameEvent[]): void {
  const { config } = draft;

  const takeable = rng.shuffle(draft.board).slice(0, Math.max(0, config.rivalTakesPerRefresh));
  const taken = draft.rivals.length === 0 ? [] : takeable;
  for (const commission of taken) {
    const rival = rng.pick(draft.rivals);
    rival.standing += config.rivalStandingPerCommission;
    events.push({
      type: 'CommissionTakenByRival',
      day: draft.day,
      commissionId: commission.id,
      patronId: commission.patronId,
      rivalId: rival.id,
    });
    changePatronRegard(
      draft,
      requirePatron(draft, commission.patronId),
      config.patronRegardOnPassedOver,
      REASON_PASSED_OVER,
      events,
    );
  }

  const takenIds = new Set(taken.map((commission) => commission.id));
  for (const commission of draft.board) {
    if (takenIds.has(commission.id)) continue;
    events.push({
      type: 'CommissionExpired',
      day: draft.day,
      commissionId: commission.id,
      patronId: commission.patronId,
    });
  }

  draft.board = [];
  postCommissions(draft, content, rng, rng.between(config.boardSizeMin, config.boardSizeMax), events);

  events.push({
    type: 'BoardRefreshed',
    day: draft.day,
    commissionIds: draft.board.map((commission) => commission.id),
  });
}
