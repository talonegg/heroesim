// The Quest Generator (M2-S3, approach §1). A Quest is drawn for a Patron from the templates of
// the Patron's Sphere, found in content at draw time and never stored on the Patron (pre-M0
// review D3), and copies from its template everything it carries, so a template may change under
// a live save without altering Quests already offered (data-model §3.2). The draw order and the
// formulas are DL-25's, with a Quest's Tier among them (DL-257 items 1 to 3, DL-262); changing them
// changes every seed's Board.

import type { EngineDeps } from '../config.js';
import type { ContentSet, QuestTemplate, QuestTemplateKey, SphereKey } from '../content-types.js';
import { takeId, type Patron, type Quest, type QuestRequirements, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import type { QuestOffered } from '../events.js';
import { beatPlan, drawBeats, encounterStream } from '../quest-engine/encounters.js';
import { int, weightedPick, type StreamName } from '../rng.js';
import { centreTier, daysAt, difficultyBand, meanLevel, offeredTiers, tierFigures, tierWeights } from '../tiers.js';
import { dayOf, nightOf, turnsPerDay } from '../time.js';
import { pickByWeight, sortedRows, streamOf, type DrawsFrom } from './draw.js';

/** The stream the Board is drawn from (pre-M0 review D7), unless the caller names another. */
export const boardStream: StreamName = 'board';

export interface QuestOptions extends DrawsFrom {
  /** One of the Patron's templates; drawn from them by their weights (`pickByWeight`, DL-202) when omitted. */
  templateKey?: QuestTemplateKey;
  /**
   * One of the Tiers `templateKey`'s template offers (`offeredTiers`), given only with it; drawn around
   * the world's centre (`tierWeights`) when omitted (DL-262).
   */
  tier?: number;
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
 * `quest.offered` event for the caller to append. In draw order (DL-25, DL-262):
 *
 * 1. the template, among the Patron's by their weights, one draw (`pickByWeight`, DL-202; none when
 *    `templateKey` is given);
 * 2. the Tier, among those the template offers (`offeredTiers`), weighted by its distance from the
 *    centre the world's mean Level sets (`centreTier`, `tierWeights`), one `weightedPick` (none when
 *    `tier` is given);
 * 3. the difficulty, `int` over the Tier's band held inside `questDifficultyMin/Max` (`difficultyBand`),
 *    the Tier's figures being the ladder's with the template's overrides (`tierFigures`).
 *
 * The Days away are the Tier's at the place the difficulty has in its band (`daysAt`), drawing nothing,
 * stored as `durationTurns`. Then, from the `encounters` stream (or `options.sequenceStream`) and no
 * other, the Quest's Encounters: one drawn from each Beat its Tier plays, none twice, and the Finale last
 * (`drawBeats`), stored as `encounterKeys` with their lines as `beatLines`.
 *
 * The reward is the difficulty times the template's `rewardPerDifficulty` times the Tier's
 * `rewardFactor`, rounded; the template's Loot table is copied when the Tier's `loot` is true, and is
 * `null` otherwise; the rest is copied. The Quest is offered on the world's Turn and stays on offer through the night of the
 * `questOfferDays`th Day, its `expiresOnTurn`: offered on Day d, the next morning's refresh after
 * the night of Day d + questOfferDays − 1 expires it.
 *
 * Throws, changing nothing, on a programming error: a Patron not in the world, a Sphere no
 * template serves, a `templateKey` that is not one of the Patron's, a `tier` given without a template
 * that offers it, a stream the world lacks, a Beat of the Patron's templates whose pool is too small to draw
 * from (`beatPlan`), or a Finale content does not define.
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
  if (options.tier !== undefined && (givenTemplate === undefined || !offeredTiers(givenTemplate, config).includes(options.tier))) {
    throw new RangeError(`A Tier is given with a template that offers it; ${given ?? 'no template'} offers no Tier ${options.tier}`);
  }
  const state = streamOf(world, options.stream ?? boardStream);
  const sequenceState = streamOf(world, options.sequenceStream ?? encounterStream);
  // Checked for every template the Patron offers before any draw, so a throw changes nothing.
  const plans = new Map(offered.map((template) => [template.key, beatPlan(template, content)]));

  const template = givenTemplate ?? pickByWeight(state, offered);
  const tiers = offeredTiers(template, config);
  const tier = options.tier ?? weightedPick(state, tiers, tierWeights(tiers, centreTier(meanLevel(world), config), config));
  const figures = tierFigures(template, tier, config);
  const difficulty = int(state, ...difficultyBand(figures, config));
  // The Encounters beside the Board's draws, from their own stream (M4-S1, DL-42).
  const plan = plans.get(template.key) ?? beatPlan(template, content);
  const { keys: encounterKeys, lines: beatLines } = drawBeats(sequenceState, plan, figures.beats, config);

  const id = takeId(world, 'quests');
  const quest: Quest = {
    id,
    templateKey: template.key,
    patronId: patron.id,
    tier,
    difficulty,
    tags: [...template.tags],
    reward: Math.round(difficulty * template.rewardPerDifficulty * figures.rewardFactor),
    fameEffect: template.fameEffect,
    durationTurns: daysAt(difficulty, figures, config) * turnsPerDay,
    skillKeys: [...template.skillKeys],
    encounterKeys,
    beatLines,
    requirements: requirementsOf(template),
    lootTableKey: figures.loot ? template.lootTableKey : null,
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
    payload: { questId: id, patronId: patron.id, templateKey: template.key, tier },
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
