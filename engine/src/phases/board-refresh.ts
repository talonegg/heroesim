// Morning: Board refresh, drawing from Patrons (approach §2, M2-S3). Offered Quests past their
// `expiresOnTurn` expire and their rows go, the History keeping their record; then the `board`
// stream draws Quests until the Board holds `config.boardSize`. `createWorld` runs the same refresh
// at Turn 0, so a new game opens on a full Board (DL-25).

import { compareByCodeUnit, type Patron, type QuestId, type World } from '../document.js';
import type { EngineEvent } from '../events.js';
import { boardStream, generateQuest, templatesFor } from '../generators/quests.js';
import { streamOf } from '../generators/draw.js';
import { pick } from '../rng.js';
import type { PhaseContext, PhaseRun } from './phase.js';

export const boardRefresh: PhaseRun = (world, ctx) => [...expireQuests(world, ctx), ...fillBoard(world, ctx)];

/**
 * Takes off the Board every offered Quest whose `expiresOnTurn` is before this Turn, emitting
 * `quest.expired` and then removing its row (data-model rule 8). A Quest a Party has taken is off
 * the Board already and never expires. The Board keeps the order of what stays.
 */
function expireQuests(world: World, ctx: PhaseContext): EngineEvent[] {
  const events: EngineEvent[] = [];
  const kept: QuestId[] = [];
  for (const questId of world.board) {
    const quest = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    if (quest === undefined || quest.status !== 'offered' || quest.expiresOnTurn >= ctx.turn) {
      kept.push(questId);
      continue;
    }
    const { patronId, templateKey } = quest;
    const payload = { questId, patronId, templateKey };
    events.push(ctx.emit({ type: 'quest.expired', participants: [questId, patronId], payload }));
    delete world.quests[questId];
  }
  world.board = kept;
  return events;
}

/**
 * Draws Quests until the Board holds `boardSize`, never more: a Board already that full, as after
 * `boardSize` is lowered, draws nothing and loses nothing. Each Quest's Patron is drawn uniformly
 * among the Patrons whose Sphere some template serves — R22 weights Patrons by their Regard for
 * *the* Guild, but every Guild draws from one Board, so until M4 gives Regard its rules the draw is
 * uniform (DL-25). One draw for the Patron, then the Quest Generator's own, all from `board`.
 */
function fillBoard(world: World, ctx: PhaseContext): EngineEvent[] {
  const { config, content } = ctx;
  const patrons: Patron[] = Object.values(world.patrons)
    .filter((patron) => templatesFor(content, patron.sphereKey).length > 0)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  if (patrons.length === 0 || world.board.length >= config.boardSize) return [];

  const state = streamOf(world, boardStream);
  const events: EngineEvent[] = [];
  while (world.board.length < config.boardSize) {
    const patron = pick(state, patrons);
    events.push(...generateQuest(world, patron, { config, content }, { stream: boardStream }).events);
  }
  return events;
}
