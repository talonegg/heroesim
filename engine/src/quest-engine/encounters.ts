// The Encounter sequence a Quest is drawn with (M4-S1, approach §1, INPUTS 6.1, DL-42). A Quest's
// template names the kinds of Encounter it is made of and how many it has, from `encountersMin` at
// the bottom of its difficulty range to `encountersMax` at the top; each Encounter is a kind drawn
// from the template's list, then an Encounter of that kind drawn from content.
//
// Every draw is from the `encounters` stream (ADR-0009 as amended, pre-M0 review D7), which is new
// in M4, so the Board a seed produces is what it was before: the Quest Generator draws the Board
// from `board` exactly as it did, and the sequence beside it from `encounters`. The sequence is
// drawn when a Quest is generated and stored on its row as `encounterKeys`. A Quest generated
// before M4 has none; it draws its sequence the same way when it resolves (`sequenceFor`).
//
// v1.1.4-S8 (DL-148 items 22 and 23): the Encounter of a kind is drawn by `weightedPick`, each weighted
// `encounterTagWeight` to the power of the tags it shares with the template, still one draw, which at
// every weight 1, no tags shared, is exactly what `pick` drew. A template may name a Finale, always the
// last of its Encounters: the count is unchanged, and the places before it are drawn as before, so a
// Quest with a Finale draws two fewer. An Encounter named as any template's Finale is never drawn into a
// place, so writing one changes no other Quest's draws.

import type { GameConfig } from '../config.js';
import type { ContentSet, Encounter, EncounterKey, EncounterKind, QuestTagKey, QuestTemplate } from '../content-types.js';
import type { Quest, World } from '../document.js';
import { clamp, sortedRows, streamOf, type Stream } from '../generators/draw.js';
import { pick, weightedPick, type StreamName } from '../rng.js';

/** The stream every Encounter sequence is drawn from, and nothing else. */
export const encounterStream: StreamName = 'encounters';

/** What a template's sequence is drawn by. */
export type SequenceTemplate = Pick<
  QuestTemplate,
  'key' | 'difficultyMin' | 'difficultyMax' | 'encounterKinds' | 'encountersMin' | 'encountersMax' | 'tags' | 'finale'
>;

/**
 * How many Encounters a Quest of `template` at `difficulty` has (INPUTS 6.1: by difficulty):
 * `encountersMin` at the bottom of the template's difficulty range, `encountersMax` at the top, and
 * in proportion between, rounded to the nearest whole number. The range is the one the difficulty
 * was drawn over, held inside `questDifficultyMin/Max` as the Quest Generator holds it; a range of
 * one value gives `encountersMin`. Draws nothing.
 */
export function encounterCount(
  template: SequenceTemplate,
  difficulty: number,
  config: Pick<GameConfig, 'questDifficultyMin' | 'questDifficultyMax'>,
): number {
  const low = clamp(template.difficultyMin, config.questDifficultyMin, config.questDifficultyMax);
  const high = clamp(template.difficultyMax, config.questDifficultyMin, config.questDifficultyMax);
  const share = high > low ? clamp((difficulty - low) / (high - low), 0, 1) : 0;
  return template.encountersMin + Math.round(share * (template.encountersMax - template.encountersMin));
}

/**
 * What a template's sequence is drawn from (v1.1.4-S8): the Encounters of each kind it names, in key
 * order (DL-19 item 3), with no template's Finale among them; the template's tags, which weight the
 * draw within a kind; and its own Finale, if any, met last.
 */
export interface SequencePlan {
  pools: Encounter[][];
  tags: readonly QuestTagKey[];
  finale: EncounterKey | null;
}

/**
 * The Encounters a sequence is drawn from (`SequencePlan`) for `template`, for `drawSequence`.
 * Throws when content has no Encounter of a kind but Finales, or does not define the template's
 * Finale, which content validation refuses, so that a caller can find it before it draws anything.
 */
export function sequencePlan(template: SequenceTemplate, content: Pick<ContentSet, 'encounters' | 'questTemplates'>): SequencePlan {
  if (template.encounterKinds.length === 0) throw new RangeError(`${template.key} names no Encounter kind`);
  const finales = finaleKeys(content);
  const pools = template.encounterKinds.map((kind: EncounterKind) => {
    const pool = sortedRows(content.encounters, (encounter) => encounter.kind === kind && !finales.has(encounter.key));
    if (pool.length === 0) {
      throw new RangeError(`No Encounter that may be drawn, none a Finale, is of kind ${JSON.stringify(kind)}, which ${template.key} names`);
    }
    return pool;
  });
  const finale = template.finale ?? null;
  if (finale !== null && !Object.hasOwn(content.encounters, finale)) {
    throw new RangeError(`${template.key}'s Finale ${JSON.stringify(finale)} is no Encounter content defines`);
  }
  return { pools, tags: template.tags, finale };
}

/** The Encounters content's templates name as their Finales (v1.1.4-S8), which no place is drawn from. */
export function finaleKeys(content: Pick<ContentSet, 'questTemplates'>): ReadonlySet<EncounterKey> {
  return new Set(Object.values(content.questTemplates).flatMap((template) => (template.finale === undefined ? [] : [template.finale])));
}

/**
 * How much likelier `encounter` is drawn within its kind for a template of `tags` (v1.1.4-S8):
 * `encounterTagWeight` to the power of the tags it shares with them; 1 when it shares none.
 */
export function tagWeight(encounter: Pick<Encounter, 'tags'>, tags: readonly QuestTagKey[], config: Pick<GameConfig, 'encounterTagWeight'>): number {
  const shared = (encounter.tags ?? []).filter((tag) => tags.includes(tag)).length;
  return config.encounterTagWeight ** shared;
}

/**
 * Draws `count` Encounters by `plan` (`sequencePlan`): for each place, a kind uniformly among the
 * template's kinds as listed (`pick`), then an Encounter of that kind, each weighted by the tags it
 * shares with the template (`tagWeight`, one `weightedPick`). Two draws a place, from `state`. With
 * a Finale, the last place is the Finale, drawing nothing, and the `count - 1` before it are drawn.
 */
export function drawSequence(
  state: Stream,
  plan: SequencePlan,
  count: number,
  config: Pick<GameConfig, 'encounterTagWeight'>,
): EncounterKey[] {
  const weights = plan.pools.map((pool) => pool.map((encounter) => tagWeight(encounter, plan.tags, config)));
  // Each kind by its place in the template's list: `pick` over them draws as it drew over the pools.
  const kinds = plan.pools.map((_, index) => index);
  const drawn = plan.finale === null ? count : count - 1;
  const keys: EncounterKey[] = [];
  for (let place = 0; place < drawn; place += 1) {
    const kind = pick(state, kinds);
    keys.push(weightedPick(state, plan.pools[kind] as Encounter[], weights[kind] as number[]).key);
  }
  if (plan.finale !== null) keys.push(plan.finale);
  return keys;
}

/**
 * The Encounters of `quest`'s own `encounterKeys`, drawn when it was generated (M4-S1), in order, each
 * key content no longer defines left out (data-model rule 5). Draws nothing: what the estimate reads
 * before a Party sets out (v1.1.4-S5, estimate.ts), and what `sequenceFor` resolves through when it
 * holds any.
 */
export function storedSequence(quest: Pick<Quest, 'encounterKeys'>, content: Pick<ContentSet, 'encounters'>): Encounter[] {
  return quest.encounterKeys.flatMap((key) => (Object.hasOwn(content.encounters, key) ? [content.encounters[key] as Encounter] : []));
}

/**
 * The Encounters `quest` is resolved through, in order (M4-S2). A Quest's own `encounterKeys`, drawn
 * when it was generated; for a Quest with none, generated before M4 (DL-42), a sequence drawn now
 * from the `encounters` stream as the Quest Generator would have drawn it, by its template's kinds
 * and count at its difficulty, or, for a template content no longer defines, one Encounter drawn
 * among all of content's (data-model rule 5). A stored key content no longer defines is left out,
 * and a Quest left with none draws its sequence now, as one generated before M4 does.
 *
 * Throws on a programming error: a world without the `encounters` stream, when it must draw, or
 * content with no Encounter at all.
 */
export function sequenceFor(
  world: World,
  quest: Pick<Quest, 'templateKey' | 'difficulty' | 'encounterKeys'>,
  deps: { config: GameConfig; content: ContentSet },
): Encounter[] {
  const { config, content } = deps;
  const stored = storedSequence(quest, content);
  if (stored.length > 0) return stored;
  const template = Object.hasOwn(content.questTemplates, quest.templateKey)
    ? content.questTemplates[quest.templateKey]
    : undefined;
  const state = streamOf(world, encounterStream);
  if (template === undefined) {
    const all = sortedRows(content.encounters);
    if (all.length === 0) throw new RangeError('Content defines no Encounter for a Quest to be resolved through');
    return [pick(state, all)];
  }
  const keys = drawSequence(state, sequencePlan(template, content), encounterCount(template, quest.difficulty, config), config);
  return keys.map((key) => content.encounters[key] as Encounter);
}

/**
 * Whether `sequence`, a Quest's of the template `templateKey`, ends with that template's Finale
 * (v1.1.4-S8): so the Quest has one, and Loot also needs it to end a Triumph (DL-148 item 23). False
 * for a template content no longer defines, or names none (data-model rule 5). Draws nothing.
 */
export function endsWithFinale(
  templateKey: Quest['templateKey'],
  sequence: readonly Pick<Encounter, 'key'>[],
  content: Pick<ContentSet, 'questTemplates'>,
): boolean {
  const finale = Object.hasOwn(content.questTemplates, templateKey) ? content.questTemplates[templateKey]?.finale : undefined;
  return finale !== undefined && sequence.at(-1)?.key === finale;
}
