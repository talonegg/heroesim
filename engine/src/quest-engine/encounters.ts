// The Encounters a Quest is drawn with (M4-S1, approach §1, DL-42), by its template's Beats (DL-257
// item 2, DL-262). A Quest of a Tier plays as many Beats as the Tier says, the template's first ones and
// then its Finale (`beatsPlayed`); each Beat draws one Encounter from its pool, none drawn twice, weighted
// by the tags it shares with the template (`encounterTagWeight`, DL-148 item 22, DL-160), and the
// Finale, named rather than drawn, is always last. An Encounter some template names as its Finale is in
// no pool, so writing one changes no other Quest's draws.
//
// Every draw is from the `encounters` stream (ADR-0009, pre-M0 review D7), never the Board's, one draw
// a Beat played. The Encounters are drawn when a Quest is generated and stored on its row as
// `encounterKeys`, one or more (DL-248), each Beat's line beside them as `beatLines`. A Quest whose
// Encounters content no longer defines draws them the same way when it resolves (`sequenceFor`,
// data-model rule 5).

import type { GameConfig } from '../config.js';
import type { ContentSet, Encounter, EncounterKey, QuestTagKey, QuestTemplate } from '../content-types.js';
import { rowOf, type Quest, type World } from '../document.js';
import { sortedRows, streamOf, type Stream } from '../generators/draw.js';
import { pick, weightedPick, type StreamName } from '../rng.js';
import { beatsDrawn, inBeatPool, shortBeats, tierFigures } from '../tiers.js';

/** The stream every Quest's Encounters are drawn from, and nothing else. */
export const encounterStream: StreamName = 'encounters';

/** What a template's Beats are drawn by. */
export type BeatTemplate = Pick<QuestTemplate, 'key' | 'beats' | 'tags' | 'finale' | 'finaleLine'>;

/**
 * What a template's Beats are drawn from (DL-262): each Beat's line and pool, the Encounters it may
 * draw in key order (DL-19 item 3), no template's Finale among them; the template's tags, which weight
 * a draw; and its own Finale, if any, met last, with its line.
 */
export interface BeatPlan {
  beats: { line: string; pool: Encounter[] }[];
  tags: readonly QuestTagKey[];
  finale: { key: EncounterKey; line: string } | null;
}

/**
 * The plan `template`'s Beats are drawn by (`BeatPlan`), for `drawBeats`. Throws when a Beat's pool is
 * too small to draw from whatever the Beats before it drew (`shortBeats`), an empty one among them, or
 * content does not define the template's Finale, which content validation refuses, so that a caller can
 * find it before it draws anything.
 */
export function beatPlan(template: BeatTemplate, content: Pick<ContentSet, 'encounters' | 'questTemplates'>): BeatPlan {
  if (template.beats.length === 0) throw new RangeError(`${template.key} has no Beat`);
  const finales = finaleKeys(content);
  const beats = template.beats.map(({ line, pool }) => ({
    line,
    pool: sortedRows(content.encounters, (encounter) => !finales.has(encounter.key) && inBeatPool(encounter, pool)),
  }));
  const [short] = shortBeats(beats.map(({ pool }) => pool.map((encounter) => encounter.key)));
  if (short !== undefined) {
    throw new RangeError(`${template.key}'s Beat ${short.beat + 1} may draw ${short.size} Encounters, none a Finale; it needs ${short.needs}`);
  }
  const key = template.finale ?? null;
  if (key !== null && !Object.hasOwn(content.encounters, key)) {
    throw new RangeError(`${template.key}'s Finale ${JSON.stringify(key)} is no Encounter content defines`);
  }
  return { beats, tags: template.tags, finale: key === null ? null : { key, line: template.finaleLine ?? '' } };
}

/** The Encounters content's templates name as their Finales (DL-148 item 23), which no pool holds. */
export function finaleKeys(content: Pick<ContentSet, 'questTemplates'>): ReadonlySet<EncounterKey> {
  return new Set(Object.values(content.questTemplates).flatMap((template) => (template.finale === undefined ? [] : [template.finale])));
}

/**
 * How much likelier `encounter` is drawn from a Beat's pool for a template of `tags` (DL-160):
 * `encounterTagWeight` to the power of the tags it shares with them; 1 when it shares none.
 */
export function tagWeight(encounter: Pick<Encounter, 'tags'>, tags: readonly QuestTagKey[], config: Pick<GameConfig, 'encounterTagWeight'>): number {
  const shared = (encounter.tags ?? []).filter((tag) => tags.includes(tag)).length;
  return config.encounterTagWeight ** shared;
}

/**
 * Draws the Encounters of a Quest of `count` Beats by `plan` (`beatPlan`, DL-262): the Beats played
 * (`beatsPlayed`) in order, each one `weightedPick` among its pool's Encounters not yet drawn, each
 * weighted by the tags it shares with the template (`tagWeight`); then the Finale, drawing nothing.
 * One draw a Beat, from `state`. Returns the keys and each one's line, in the order met.
 */
export function drawBeats(
  state: Stream,
  plan: BeatPlan,
  count: number,
  config: Pick<GameConfig, 'encounterTagWeight'>,
): { keys: EncounterKey[]; lines: string[] } {
  const played = plan.beats.slice(0, beatsDrawn(plan.beats.length, plan.finale !== null, count));
  const keys: EncounterKey[] = [];
  const lines: string[] = [];
  for (const beat of played) {
    const left = beat.pool.filter((encounter) => !keys.includes(encounter.key));
    keys.push(weightedPick(state, left, left.map((encounter) => tagWeight(encounter, plan.tags, config))).key);
    lines.push(beat.line);
  }
  if (plan.finale !== null) {
    keys.push(plan.finale.key);
    lines.push(plan.finale.line);
  }
  return { keys, lines };
}

/**
 * The Encounters of `quest`'s own `encounterKeys`, drawn when it was generated (M4-S1), in order, each
 * key content no longer defines left out (data-model rule 5). Draws nothing: what the estimate reads
 * before a Party sets out (v1.1.4-S5, estimate.ts), and what `sequenceFor` resolves through when it
 * holds any.
 */
export function storedSequence(quest: Pick<Quest, 'encounterKeys'>, content: Pick<ContentSet, 'encounters'>): Encounter[] {
  return quest.encounterKeys.flatMap((key) => rowOf(content.encounters, key) ?? []);
}

/**
 * The Encounters `quest` is resolved through, in order (M4-S2). A Quest's own `encounterKeys`, drawn
 * when it was generated, each key content no longer defines left out (data-model rule 5); a Quest
 * left with none draws its Encounters now from the `encounters` stream, as the Quest Generator would
 * have drawn them, by its template's Beats at its Tier (`drawBeats`), or, for a template content no
 * longer defines, one Encounter drawn among all of content's.
 *
 * Throws on a programming error: a world without the `encounters` stream, when it must draw, or
 * content with no Encounter at all.
 */
export function sequenceFor(
  world: World,
  quest: Pick<Quest, 'templateKey' | 'tier' | 'encounterKeys'>,
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
  const { keys } = drawBeats(state, beatPlan(template, content), tierFigures(template, quest.tier, config).beats, config);
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
  const finale = rowOf(content.questTemplates, templateKey)?.finale;
  return finale !== undefined && sequence.at(-1)?.key === finale;
}
