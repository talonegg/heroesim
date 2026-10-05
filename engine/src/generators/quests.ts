// The Quest Generator (M2-S3, approach §1). A Quest is drawn for a Patron from the templates of
// the Patron's Sphere, found in content at draw time and never stored on the Patron (pre-M0
// review D3), and copies from its template everything it carries, so a template may change under
// a live save without altering Quests already offered (data-model §3.2). The draw order and the
// formulas are DL-25; changing them changes every seed's Board.

import type { EngineDeps } from '../config.js';
import type { ContentSet, QuestTemplate, QuestTemplateKey, SphereKey } from '../content-types.js';
import { takeId, type Patron, type Quest, type QuestRequirements, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import type { QuestOffered } from '../events.js';
import { drawSequence, encounterCount, encounterStream, sequencePlan } from '../quest-engine/encounters.js';
import { int, type StreamName } from '../rng.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { clamp, pickByWeight, sortedRows, streamOf, type DrawsFrom } from './draw.js';

/** The stream the Board is drawn from (pre-M0 review D7), unless the caller names another. */
export const boardStream: StreamName = 'board';

export interface QuestOptions extends DrawsFrom {
  /** One of the Patron's templates; drawn from them by their weights (`pickByWeight`, DL-202) when omitted. */
  templateKey?: QuestTemplateKey;
  /**
   * The stream the Encounter sequence is drawn from: `encounters` when omitted. A module's
   * `offerQuest` names its own stream here and as `stream`, so no core stream moves (M8-S2, DL-77).
   */
  sequenceStream?: StreamName;
}

export interface GeneratedQuest {
  quest: Quest;
  events: QuestOffered[];
}

/**
 * The templates whose `sphereKeys` hold `sphereKey`, in key order, so that a draw does not depend
 * on the order content's rows were written in (DL-19 item 3). Empty for a Sphere no template
 * serves, which content validation refuses but a save's unknown Sphere may still name (rule 5).
 */
export function templatesFor(content: Pick<ContentSet, 'questTemplates'>, sphereKey: SphereKey): QuestTemplate[] {
  return sortedRows(content.questTemplates, (template) => template.sphereKeys.includes(sphereKey));
}

/**
 * Generates a Quest offered by `patron` into `world` and onto the end of the Board, drawing from
 * `options.stream` (`board` by default) and from no other stream, and returns it with its
 * `quest.offered` event for the caller to append. In draw order (DL-25):
 *
 * 1. the template, among the Patron's by their weights, one draw (`pickByWeight`, DL-202; none when
 *    `templateKey` is given);
 * 2. the difficulty, `int` over the template's range held inside `questDifficultyMin/Max`;
 * 3. the duration in Days, `int` over the template's range, stored as `durationTurns`.
 *
 * Then, from the `encounters` stream (or `options.sequenceStream`) and no other, the Quest's
 * Encounter sequence (M4-S1, DL-42):
 * `encounterCount` Encounters at this difficulty, each a kind of the template's then an Encounter
 * of that kind weighted by the tags it shares with the template, the last the template's Finale if
 * it names one (`drawSequence`, v1.1.4-S8), stored as `encounterKeys`. The `board` stream's draws are the
 * three above, as before M4, so the Board a seed produces is unchanged.
 *
 * The reward is the difficulty times the template's `rewardPerDifficulty`, rounded; the template's
 * Loot table is copied when its `difficultyMin` is above `lootDifficultyThreshold`, and is `null`
 * otherwise (M5-S5, DL-52); the rest is copied. The Quest is offered on the world's Turn and stays on offer through the night of the
 * `questOfferDays`th Day, its `expiresOnTurn`: offered on Day d, the next morning's refresh after
 * the night of Day d + questOfferDays − 1 expires it.
 *
 * Throws, changing nothing, on a programming error: a Patron not in the world, a Sphere no
 * template serves, a `templateKey` that is not one of the Patron's, a stream the world lacks, an
 * Encounter kind of the Patron's templates that content has no Encounter of but Finales, or a Finale
 * content does not define.
 */
export function generateQuest(
  world: World,
  patron: Patron,
  deps: EngineDeps,
  options: QuestOptions = {},
): GeneratedQuest {
  const { config, content } = deps;
  if (!Object.hasOwn(world.patrons, patron.id)) throw new RangeError(`${patron.id} is not in world.patrons`);
  const offered = templatesFor(content, patron.sphereKey);
  if (offered.length === 0) {
    throw new RangeError(`No Quest template serves the Sphere ${JSON.stringify(patron.sphereKey)} of ${patron.id}`);
  }
  const given = options.templateKey;
  const givenTemplate = given === undefined ? undefined : offered.find((template) => template.key === given);
  if (given !== undefined && givenTemplate === undefined) {
    throw new RangeError(`${patron.id} offers no Quest template keyed ${JSON.stringify(given)}`);
  }
  const state = streamOf(world, options.stream ?? boardStream);
  const sequenceState = streamOf(world, options.sequenceStream ?? encounterStream);
  // Checked for every template the Patron offers before any draw, so a throw changes nothing.
  const plans = new Map(offered.map((template) => [template.key, sequencePlan(template, content)]));

  const template = givenTemplate ?? pickByWeight(state, offered);
  const scale = (value: number): number => clamp(value, config.questDifficultyMin, config.questDifficultyMax);
  const difficulty = int(state, scale(template.difficultyMin), scale(template.difficultyMax));
  const durationDays = int(state, template.durationDaysMin, template.durationDaysMax);
  // The sequence beside the Board's draws, from its own stream (M4-S1, DL-42).
  const plan = plans.get(template.key) ?? sequencePlan(template, content);
  const encounterKeys = drawSequence(sequenceState, plan, encounterCount(template, difficulty, config), config);

  const id = takeId(world, 'quests');
  const quest: Quest = {
    id,
    templateKey: template.key,
    patronId: patron.id,
    difficulty,
    tags: [...template.tags],
    reward: Math.round(difficulty * template.rewardPerDifficulty),
    fameEffect: template.fameEffect,
    durationTurns: durationDays * turnsPerDay,
    skillKeys: [...template.skillKeys],
    encounterKeys,
    requirements: requirementsOf(template),
    lootTableKey: template.difficultyMin > config.lootDifficultyThreshold ? template.lootTableKey : null,
    status: 'offered',
    offeredOnTurn: world.turn,
    expiresOnTurn: nightOf(dayOf(world.turn) + config.questOfferDays - 1),
    partyIds: [],
  };
  world.quests[id] = quest;
  world.board.push(id);

  const event = eventEmitter(world)({
    type: 'quest.offered',
    participants: [id, patron.id],
    payload: { questId: id, patronId: patron.id, templateKey: template.key },
  });
  return { quest, events: [event] };
}

/** The template's Party size and, where it has them, its required Class and Skill. */
function requirementsOf(template: QuestTemplate): QuestRequirements {
  const { classKey, skillKey } = template.requires;
  return {
    partySizeMin: template.partySizeMin,
    partySizeMax: template.partySizeMax,
    ...(classKey === undefined ? {} : { classKey }),
    ...(skillKey === undefined ? {} : { skillKey }),
  };
}
