// Morning: Board refresh, drawing from Patrons (approach §2, M2-S3). Offered Quests past their
// `expiresOnTurn` expire and their rows go, the History keeping their record, and each costs its
// Patron's Regard for every Guild in play (M4-S5); then the `board` stream draws Quests until the
// Board holds the Year's size (`boardSizeAt`, DL-261), each Patron weighted by their mean Regard
// across the Guilds in play (R22, M4-S5, closing DL-25's uniform draw). `createWorld` runs the same
// refresh at Turn 0, so a new game opens on a full Board (DL-25).

import { compareByCodeUnit, rowOf, type Patron, type QuestId, type Turn, type World } from '../document.js';
import type { GameConfig } from '../config.js';
import type { EngineEvent } from '../events.js';
import { boardStream, generateQuest, templatesFor } from '../generators/quests.js';
import { streamOf } from '../generators/draw.js';
import { patronBoardWeight, regardOnOfferExpired } from '../regard.js';
import { weightedPick } from '../rng.js';
import { yearOf } from '../time.js';
import type { PhaseContext, PhaseRun } from './phase.js';

export const boardRefresh: PhaseRun = (world, ctx) => [...expireQuests(world, ctx), ...fillBoard(world, ctx)];

/**
 * How many Quests the Board holds on `turn` (DL-257 item 4, DL-261): `boardSizeStart` plus
 * `boardGrowthPerYear` for each whole Year played, the Years `yearOf` counts from Turn 0, floored to
 * a whole Board and never above `boardSizeMax`. A Year begins on a morning (`turnsPerYear` is whole
 * Days, DL-210), so the Board grows at that morning's refresh.
 */
export function boardSizeAt(turn: Turn, config: Pick<GameConfig, 'turnsPerYear' | 'boardSizeStart' | 'boardGrowthPerYear' | 'boardSizeMax'>): number {
  const grown = Math.floor(config.boardSizeStart + config.boardGrowthPerYear * yearOf(turn, config));
  return Math.min(config.boardSizeMax, grown);
}

/**
 * Takes off the Board every offered Quest whose `expiresOnTurn` is before this Turn, emitting
 * `quest.expired`, then the Patron's Regard for each Guild in play falls by `patronRegardOnExpiry`
 * (`regardOnOfferExpired`, M4-S5), and the Quest's row is removed (data-model rule 8). A Quest a
 * Party has taken is off the Board already and never expires. The Board keeps the order of what
 * stays.
 */
function expireQuests(world: World, ctx: PhaseContext): EngineEvent[] {
  const events: EngineEvent[] = [];
  const kept: QuestId[] = [];
  for (const questId of world.board) {
    const quest = rowOf(world.quests, questId);
    if (quest === undefined || quest.status !== 'offered' || quest.expiresOnTurn >= ctx.turn) {
      kept.push(questId);
      continue;
    }
    const { patronId, templateKey } = quest;
    const payload = { questId, patronId, templateKey };
    events.push(ctx.emit({ type: 'quest.expired', participants: [questId, patronId], payload }));
    events.push(...regardOnOfferExpired(world, ctx, patronId));
    delete world.quests[questId];
  }
  world.board = kept;
  return events;
}

/**
 * Draws Quests until the Board holds `boardSizeAt` this Turn, never more: a Board already that full,
 * as after the size is lowered, draws nothing and loses nothing. Each Quest's Patron is drawn among the
 * Patrons whose Sphere some template serves, in proportion to `patronBoardWeight`: their mean
 * Regard across the Guilds in play, since every Guild draws from one Board (R22, M4-S5, DL-43).
 * The weights are read once, after this refresh's expiries and before its first draw: drawing moves
 * no Regard. With every Patron at neutral the draw is DL-25's uniform one, draw for draw. One draw for the Patron,
 * then the Quest Generator's own, all from `board`.
 */
function fillBoard(world: World, ctx: PhaseContext): EngineEvent[] {
  const { config, content } = ctx;
  const patrons: Patron[] = Object.values(world.patrons)
    .filter((patron) => templatesFor(content, patron.sphereKey).length > 0)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  const size = boardSizeAt(ctx.turn, config);
  if (patrons.length === 0 || world.board.length >= size) return [];

  const weights = patrons.map((patron) => patronBoardWeight(patron, world, config));
  const state = streamOf(world, boardStream);
  const events: EngineEvent[] = [];
  while (world.board.length < size) {
    const patron = weightedPick(state, patrons, weights);
    events.push(...generateQuest(world, patron, { config, content }, { stream: boardStream }).events);
  }
  return events;
}
