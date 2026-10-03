// The dispatch preview (M4-S5's `preview`, pre-M0 review E6; M4-S3's Synergies, M5-S3's
// consumables): what a proposed Party of a Guild's Heroes would meet on a Quest from the Board,
// and what it would carry, before it is sent. A selector: it changes nothing.
//
// The CLI's `preview` assembled it from the engine's selectors until M7-S3 moved it here (DL-66),
// so that the CLI and the browser show one statement of it and the browser computes no rule: each
// requirement met or missed is `unmetRequirements`', each Hero who cannot go `unavailability`'s,
// the Synergies `synergiesFor`'s and where each applies `appliesOn`'s, the reward the Guildmaster's
// `negotiatedReward`, and the verdict `dispatch`'s own checks (`dispatchRefusal`). From v1.1.4-S3,
// what the Party's form as it sets out does to its odds, for the Party as a whole (`formEffect`); from
// v1.1.4-S6, how likely it is to come through each Encounter and the Quest (`estimateQuest`), and
// which Stats the Quest's Checks read (`statsRead`).

import {
  dispatchRefusal,
  unavailability,
  unmetRequirements,
  type DispatchRejection,
  type DispatchRequest,
  type RequirementKind,
  type Unavailability,
} from './actions/dispatch.js';
import type { EngineDeps } from './config.js';
import type {
  ClassKey,
  ConsumableDefinition,
  ContentSet,
  EncounterKind,
  ItemDefinitionKey,
  SkillKey,
  StatKey,
  Synergy,
} from './content-types.js';
import type { Guild, Hero, HeroId, Quest, Stack, World } from './document.js';
import { guildmasterOf, negotiatedReward } from './guildmaster.js';
import { holdings, itemDefinition } from './items.js';
import { describeQuery, statsIn } from './quest-engine/describe.js';
import { estimateQuest, type QuestEstimate } from './quest-engine/estimate.js';
import { formEffect, meanForm, type FormEffect } from './quest-engine/form.js';
import { queryParty } from './quest-engine/query.js';
import { appliesOn, synergiesFor } from './quest-engine/synergy.js';

/** One of a Quest's requirements, and whether the proposed Party meets it. */
export type RequirementStatus =
  | { requirement: 'party-size'; met: boolean; size: number; partySizeMin: number; partySizeMax: number }
  | { requirement: 'class'; met: boolean; classKey: ClassKey }
  | { requirement: 'skill'; met: boolean; skillKey: SkillKey };

/** A Hero named who cannot go: not on the Guild's Roster, or on it and unavailable. */
export interface PartyProblem {
  heroId: HeroId;
  /** The Hero's row, when the world holds one. */
  hero: Hero | undefined;
  because: Unavailability | 'not-on-roster';
}

/** A Synergy the Party would have, and on how many of the Quest's Encounters it applies. */
export interface SynergyReach {
  synergy: Synergy;
  /** `null` for a Quest whose Encounters are drawn on the way (a Quest drawn before M4, DL-42). */
  encounters: number | null;
}

/** A consumable the Party is to carry, how many the Guild holds, and where it would help. */
export interface ConsumableReach {
  definitionKey: ItemDefinitionKey;
  quantity: number;
  /** Content's consumable of the key; `undefined` for gear or a key content lacks. */
  consumable: ConsumableDefinition | undefined;
  /** How many of it the Guild holds. */
  held: number;
  /**
   * For a bonus or a reroll, how many of the Quest's Encounters are of its kinds; `null` for a heal,
   * which is not spent on an Encounter, for a key that is no consumable, and while the Quest's
   * Encounters are drawn on the way.
   */
  encounters: number | null;
}

export interface DispatchPreview {
  quest: Quest;
  /** The Heroes named that the world holds, in the order named. */
  heroes: Hero[];
  /** The Party's size against the Quest's bounds, then its Class and its Skill when it names them. */
  requirements: RequirementStatus[];
  /** Each Hero named who cannot go, in the order named. */
  problems: PartyProblem[];
  /** The kinds of the Quest's Encounters, in the order it meets them; none while they are drawn on the way. */
  encounterKinds: EncounterKind[];
  synergies: SynergyReach[];
  consumables: ConsumableReach[];
  /** The consumables the Guild holds, which it could carry. */
  held: Stack[];
  /**
   * What the Party's form as it sets out does to its odds (v1.1.4-S3, DL-148 item 12): the mean of its
   * Heroes' forms, and its `formEffect`. One line for the Party, naming no Hero's Morale; `null` for a
   * Party of no one.
   */
  form: { mean: number; effect: FormEffect } | null;
  /**
   * How likely the Party, carrying what it would carry, is to come through each of the Quest's
   * Encounters and the Quest (v1.1.4-S6, DL-148 item 15): `estimateQuest`'s, if no one falls. `null`
   * for a Party of no one, and for a Quest whose Encounters are drawn on the way.
   */
  chances: QuestEstimate | null;
  /** The reward the Patron offers. */
  offeredReward: number;
  /** The reward the Guild's Guildmaster would agree on a success (`negotiatedReward`, M4-S5). */
  agreedReward: number;
  /** `null` when `dispatch` would send the Party; otherwise the rejection it would return. */
  refusal: DispatchRejection | null;
}

/**
 * What `request` would meet, before it is sent: `null` when its Quest is not on the Board, since
 * there is nothing to preview. Changes nothing. Throws on the programming errors `dispatch` throws
 * on: a Guild not in the world, a Hero or a consumable named twice, a quantity not a whole number
 * from 1.
 */
export function previewDispatch(world: World, request: DispatchRequest, deps: EngineDeps): DispatchPreview | null {
  const refusal = dispatchRefusal(world, request, deps);
  const { content, config } = deps;
  const guild = world.guilds[request.guildId] as Guild;
  const quest = own(world.quests, request.questId);
  if (quest === undefined || quest.status !== 'offered' || !world.board.includes(quest.id)) return null;

  const heroes = request.heroIds.flatMap((heroId) => own(world.heroes, heroId) ?? []);
  const encounterKinds = quest.encounterKeys.flatMap((key) => own(content.encounters, key)?.kind ?? []);
  const kindsReached = (applies: (kind: EncounterKind) => boolean): number | null =>
    encounterKinds.length === 0 ? null : encounterKinds.filter(applies).length;

  const held = holdings(world, { kind: 'guild', id: guild.id }).stacks.filter(
    (stack) => itemDefinition(content, stack.definitionKey)?.kind === 'consumable',
  );
  const consumables = (request.consumables ?? []).map(({ definitionKey, quantity }): ConsumableReach => {
    const definition = itemDefinition(content, definitionKey);
    const consumable = definition?.kind === 'consumable' ? definition : undefined;
    const { effect } = consumable ?? {};
    return {
      definitionKey,
      quantity,
      consumable,
      held: held.find((stack) => stack.definitionKey === definitionKey)?.quantity ?? 0,
      encounters: effect === undefined || effect.kind === 'heal' ? null : kindsReached((kind) => effect.kinds.includes(kind)),
    };
  });

  const party = queryParty(heroes, world, deps);
  const mean = meanForm(party.members.map((member) => member.form));
  return {
    quest,
    heroes,
    requirements: requirementsOf(quest, heroes),
    problems: problemsOf(guild, request.heroIds, world),
    encounterKinds,
    synergies: synergiesFor(party, content).map((synergy) => ({
      synergy,
      encounters: kindsReached((kind) => appliesOn(synergy, kind)),
    })),
    consumables,
    held,
    form: heroes.length === 0 ? null : { mean, effect: formEffect(mean, config) },
    chances: heroes.length === 0 ? null : estimateQuest(world, quest, heroes, deps, request.consumables ?? []),
    offeredReward: quest.reward,
    agreedReward: negotiatedReward(quest.reward, guildmasterOf(guild, world), content, config),
    refusal,
  };
}

/** Each requirement the Quest has, met unless `unmetRequirements` names it. */
function requirementsOf(quest: Quest, heroes: readonly Hero[]): RequirementStatus[] {
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const unmet = unmetRequirements(quest, heroes);
  const met = (kind: RequirementKind): boolean => !unmet.some((it) => it.requirement === kind);
  return [
    { requirement: 'party-size', met: met('party-size'), size: heroes.length, partySizeMin, partySizeMax },
    ...(classKey === undefined ? [] : [{ requirement: 'class' as const, met: met('class'), classKey }]),
    ...(skillKey === undefined ? [] : [{ requirement: 'skill' as const, met: met('skill'), skillKey }]),
  ];
}

/**
 * Each Hero named who cannot go: one the world lacks or whose `guildId` is another's is not on the
 * Roster; one of the Guild's, a dead or retired Hero among them (DL-20 item 3), is unavailable for
 * the reason `unavailability` gives.
 */
function problemsOf(guild: Guild, heroIds: readonly HeroId[], world: World): PartyProblem[] {
  return heroIds.flatMap((heroId): PartyProblem[] => {
    const hero = own(world.heroes, heroId);
    if (hero === undefined || hero.guildId !== guild.id) return [{ heroId, hero, because: 'not-on-roster' }];
    const because = unavailability(hero);
    return because === null ? [] : [{ heroId, hero, because }];
  });
}

/**
 * The Skills that help on a Quest (DL-70): from M4 the Checks read its Encounters' Skills and not
 * the template's (DL-42), so each Skill any of its Encounters' Checks names, once, in the order the
 * Quest meets them. A Quest drawn before M4, whose Encounters are drawn on the way, gives its own Skills,
 * the kind of work it is. A key content lacks is left out (data-model rule 5).
 */
export function skillsThatHelp(
  quest: Pick<Quest, 'encounterKeys' | 'skillKeys'>,
  content: Pick<ContentSet, 'encounters' | 'skills'>,
): SkillKey[] {
  const keys =
    quest.encounterKeys.length === 0
      ? quest.skillKeys
      : [...new Set(quest.encounterKeys.flatMap((key) => own(content.encounters, key)?.checks.flatMap((it) => it.skills) ?? []))];
  return keys.filter((key) => Object.hasOwn(content.skills, key));
}

/**
 * The Hero Stats a Quest's Checks read (v1.1.4-S6, DL-148 item 16): each Stat any of its Encounters'
 * Checks' scores names (`statsIn`), once, in the order the Quest meets them; none while its Encounters
 * are drawn on the way. A key content lacks is left out (data-model rule 5). The Party builder shows
 * each Hero's value of them, where it showed the template's demands, which no view shows now.
 */
export function statsRead(quest: Pick<Quest, 'encounterKeys'>, content: Pick<ContentSet, 'encounters' | 'stats'>): StatKey[] {
  const keys = quest.encounterKeys.flatMap((key) => own(content.encounters, key)?.checks.flatMap((it) => statsIn(describeQuery(it.score))) ?? []);
  return [...new Set(keys)].filter((key) => own(content.stats, key)?.owner === 'hero');
}

/** The row keyed `id`, looked up without falling through to `Object.prototype`. */
function own<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}
