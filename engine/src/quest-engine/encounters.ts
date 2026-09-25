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

import type { GameConfig } from '../config.js';
import type { ContentSet, Encounter, EncounterKey, EncounterKind, QuestTemplate } from '../content-types.js';
import type { Quest, World } from '../document.js';
import { clamp, sortedRows, streamOf, type Stream } from '../generators/draw.js';
import { pick, type StreamName } from '../rng.js';

/** The stream every Encounter sequence is drawn from, and nothing else. */
export const encounterStream: StreamName = 'encounters';

/** What a template's sequence is drawn by. */
export type SequenceTemplate = Pick<
  QuestTemplate,
  'key' | 'difficultyMin' | 'difficultyMax' | 'encounterKinds' | 'encountersMin' | 'encountersMax'
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
 * The Encounters of each kind `template` names, in key order (DL-19 item 3), for `drawSequence`.
 * Throws when content has none of a kind, which content validation refuses, so that a caller can
 * find it before it draws anything.
 */
export function encounterPools(template: SequenceTemplate, content: Pick<ContentSet, 'encounters'>): Encounter[][] {
  if (template.encounterKinds.length === 0) throw new RangeError(`${template.key} names no Encounter kind`);
  return template.encounterKinds.map((kind: EncounterKind) => {
    const pool = sortedRows(content.encounters, (encounter) => encounter.kind === kind);
    if (pool.length === 0) throw new RangeError(`No Encounter is of kind ${JSON.stringify(kind)}, which ${template.key} names`);
    return pool;
  });
}

/**
 * Draws `count` Encounters from `pools` (`encounterPools`): for each, a kind uniformly among the
 * template's kinds as listed, then an Encounter uniformly among that kind's. Two draws an
 * Encounter, from `state`.
 */
export function drawSequence(state: Stream, pools: readonly (readonly Encounter[])[], count: number): EncounterKey[] {
  const keys: EncounterKey[] = [];
  for (let slot = 0; slot < count; slot += 1) keys.push(pick(state, pick(state, pools)).key);
  return keys;
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
  const known = (key: EncounterKey): Encounter | undefined =>
    Object.hasOwn(content.encounters, key) ? content.encounters[key] : undefined;
  const stored = quest.encounterKeys.map(known).filter((encounter): encounter is Encounter => encounter !== undefined);
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
  const keys = drawSequence(state, encounterPools(template, content), encounterCount(template, quest.difficulty, config));
  return keys.map((key) => known(key) as Encounter);
}
