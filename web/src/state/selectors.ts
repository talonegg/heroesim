// What the views read (M7-S3, DL-66): each function takes the game in hand and returns plain rows
// of words and numbers for a component to lay out. Nothing in `web/` computes a rule (ADR-0007,
// principle 12), so every number here is a document field or the answer of an engine selector,
// the same ones the CLI's `render.ts` reads (`rankings`, `ageOf`, `baseStat`, `effectiveStats`,
// `potentialHint`, `judgedHintBands`, `carriedGear`, `regardBand`, `relationship`, `transferFee`,
// `previewDispatch`, `skillsThatHelp`, `entriesFor`); where a view needed an answer no selector
// gave, the selector went into the engine (`previewDispatch`, `skillsThatHelp`, `dispatchRefusal`),
// never here. The words are the CLI's, as its `show` views print them.
//
// Potential is never in a view (data-model rule 9, M3-S3): a Hero's page carries each Stat's hint,
// the word `potentialHint` gives through the bands the player's Guildmaster reads, and no row type
// here has a field that could hold the number.
//
// Components may import this module; it and the rest of `state/` alone import the engine's values.

import {
  ageOf,
  baseStat,
  carriedGear,
  dayOf,
  durationDaysOf,
  effectiveStats,
  entriesFor,
  guildmasterOf,
  holdings,
  itemDefinition,
  judgedHintBands,
  moraleBand,
  playerGuild,
  potentialHint,
  previewDispatch,
  rankings,
  regardBand,
  regardValue,
  relationship,
  skillsThatHelp,
  timeOfDay,
  transferFee,
  unavailability,
  yearOf,
  type ConsumableEffect,
  type ConsumableRequest,
  type ContentSet,
  type EngineEvent,
  type Entry,
  type GearDefinition,
  type Guild,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type PotentialHint,
  type Quest,
  type QuestId,
  type RegardBand,
  type Stack,
  type StopReason,
  type Synergy,
  type UniqueItem,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { listed, narrate, narrateStop, narrationFor, type Narration } from './narrate';
import { playDeps, type GameState } from './reducer';
import { endingWords, rejectionSentence } from './rejections';

// ── Names ────────────────────────────────────────────────────────────────────────────────────

function rowOf<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return rowOf(rows, key)?.name ?? key;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function none(list: readonly string[]): string {
  return list.length === 0 ? 'none' : list.join(', ');
}

/** `the night of Day 7`. */
function nightOf(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
}

/** `Day 3, afternoon`: when a Turn fell, as the log shows it. */
export function whenOf(turn: number): string {
  return `Day ${dayOf(turn)}, ${timeOfDay(turn)}`;
}

/** `1st`, `2nd`, `3rd`, `11th`, `22nd`. */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// ── The header ───────────────────────────────────────────────────────────────────────────────

export interface HeaderView {
  guildName: string;
  wealth: number;
  fame: number;
  /** `Day 3, afternoon, Year 0`: the Turn and where it falls, as the CLI's `renderTime` says it. */
  time: string;
  /** `3rd of 5 by Fame`, or that the Guild has folded and is not ranked. */
  rankings: string;
  /** The seed the world was made from: a game is reproducible from it (N1). */
  seed: string;
  /** How the game ended, when it has. */
  ended: string | null;
}

/** The player's Guild at a glance; `null` for a save with no player's Guild. */
export function headerView(document: WorldDocument): HeaderView | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const { config } = playDeps(document);
  const byFame = rankings(world, 'fame');
  const place = byFame.find((ranking) => ranking.guildId === guild.id);
  const { ended } = world;
  return {
    guildName: guild.name,
    wealth: guild.wealth,
    fame: guild.fame,
    time: `Day ${dayOf(world.turn)}, ${timeOfDay(world.turn)}, Year ${yearOf(world.turn, config)}`,
    seed: document.meta.seed,
    rankings: place === undefined ? 'not ranked: the Guild has folded' : `${ordinal(place.rank)} of ${byFame.length} by Fame`,
    ended: ended === null ? null : `The game ended on Day ${dayOf(ended.turn)}: ${guild.name} ${endingWords[ended.reason]}.`,
  };
}

// ── The Board ────────────────────────────────────────────────────────────────────────────────

export interface QuestCard {
  questId: QuestId;
  name: string;
  patron: string;
  difficulty: number;
  days: number;
  reward: number;
  fame: number;
  /** `2 to 4 Heroes`. */
  party: string;
  /** The Class and Skill it requires beyond its Party size, or `nothing more`. */
  requires: string;
  /** The last Day it stays on offer. */
  lastDay: number;
  /** `Strength 0.5, Courage 0.5`: the kind of work it is. */
  demands: string;
  /** The Skills its Encounters' Checks read (`skillsThatHelp`, DL-70). */
  skillsThatHelp: string;
  /** The kinds of its Encounters in order, or that they are drawn on the way. */
  encounters: string;
}

/** `show board`: the Quests on offer, in the Board's order. */
export function boardView(document: WorldDocument): QuestCard[] {
  const { world } = document;
  return world.board.flatMap((questId): QuestCard[] => {
    const quest = rowOf(world.quests, questId);
    if (quest === undefined) return [];
    const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
    const requires = [
      ...(classKey === undefined ? [] : [`a ${nameIn(content.classes, classKey)}`]),
      ...(skillKey === undefined ? [] : [`a Hero with ${nameIn(content.skills, skillKey)}`]),
    ];
    return [
      {
        questId: quest.id,
        name: nameIn(content.questTemplates, quest.templateKey),
        patron: rowOf(world.patrons, quest.patronId)?.name ?? 'a Patron',
        difficulty: quest.difficulty,
        days: durationDaysOf(quest),
        reward: quest.reward,
        fame: quest.fameEffect,
        party: `${partySizeMin} to ${partySizeMax} Heroes`,
        requires: requires.length === 0 ? 'nothing more' : listed(requires),
        lastDay: dayOf(quest.expiresOnTurn),
        demands: quest.demands.map(([key, weight]) => `${nameIn(content.stats, key)} ${weight}`).join(', '),
        skillsThatHelp: none(skillsThatHelp(quest, content).map((key) => nameIn(content.skills, key))),
        encounters: encounterKindsOf(quest),
      },
    ];
  });
}

function encounterKindsOf(quest: Quest): string {
  if (quest.encounterKeys.length === 0) return 'drawn on the way';
  return quest.encounterKeys.map((key) => rowOf(content.encounters, key)?.kind ?? key).join(', ');
}

// ── Choosing a Party ─────────────────────────────────────────────────────────────────────────

/** Why a Hero cannot go, after their name (the CLI's `dispatch`). */
const unavailableWords = {
  injured: 'is injured',
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away with a Party',
} as const;

export interface PartyChoice {
  heroId: HeroId;
  name: string;
  /** `Rogue, Level 2`. */
  summary: string;
  /** Why the Hero cannot go now, or `null` when they can. */
  unavailable: string | null;
}

/** The player's Roster, as the Heroes a Party may be chosen from. */
export function partyChoices(document: WorldDocument): PartyChoice[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return [];
  return guild.rosterIds.flatMap((heroId): PartyChoice[] => {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) return [];
    const because = unavailability(hero);
    return [
      {
        heroId,
        name: hero.name,
        summary: `${nameIn(content.classes, hero.classKey)}, Level ${hero.level}`,
        unavailable: because === null ? null : unavailableWords[because],
      },
    ];
  });
}

export interface ConsumableChoice {
  definitionKey: ItemDefinitionKey;
  name: string;
  /** How many the Guild holds: the most a Party can carry. */
  held: number;
  /** What one does, in words. */
  does: string;
}

/** The consumables the player's Guild holds, which a Party may carry (M5-S3). */
export function consumableChoices(document: WorldDocument): ConsumableChoice[] {
  const guild = playerGuild(document.world);
  if (guild === undefined) return [];
  return holdings(document.world, { kind: 'guild', id: guild.id }).stacks.flatMap((stack): ConsumableChoice[] => {
    const definition = itemDefinition(content, stack.definitionKey);
    if (definition?.kind !== 'consumable') return [];
    return [{ definitionKey: stack.definitionKey, name: definition.name, held: stack.quantity, does: effectWords(definition.effect) }];
  });
}

/** What a consumable does, in words (the CLI's `preview`, M5-S3). */
function effectWords(effect: ConsumableEffect): string {
  switch (effect.kind) {
    case 'bonus':
      return `+${effect.flat} to a Check on ${listed(effect.kinds)} Encounters, one a Check`;
    case 'reroll':
      return `a failed Check on ${listed(effect.kinds)} Encounters rolled again, one a Check`;
    case 'heal':
      return `an Injury taken on the Quest heals ${effect.days} Days sooner, one an Injury`;
  }
}

/** A Synergy's bonus in words: `+2`, `×1.15`, or both. */
function bonusWords({ flat, factor }: Synergy['bonus']): string {
  return listed([...(flat === undefined ? [] : [`+${flat}`]), ...(factor === undefined ? [] : [`×${factor}`])]);
}

export interface PreviewView {
  requirements: { words: string; met: boolean }[];
  /** Each Hero chosen who cannot go. */
  problems: string[];
  /** Each Synergy the Party would have, or that it has none. */
  synergies: string[];
  /** What the Party would carry. */
  consumables: string[];
  /** The reward agreed on a success and the reward offered. */
  reward: string;
  /** Whether `dispatch` would send the Party, and if not, why not: the rule's own verdict. */
  verdict: { sends: boolean; words: string };
}

/**
 * What a Party of `heroIds` carrying `consumables` would meet on `questId`: the engine's
 * `previewDispatch`, in the CLI's `preview`'s words. `null` when the Quest is no longer on the
 * Board, or the save has no player's Guild.
 */
export function previewView(
  document: WorldDocument,
  questId: QuestId,
  heroIds: readonly HeroId[],
  consumables: readonly ConsumableRequest[],
): PreviewView | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const request = { guildId: guild.id, questId, heroIds: [...heroIds], consumables: [...consumables] };
  const preview = previewDispatch(world, request, playDeps(document));
  if (preview === null) return null;
  const reach = (encounters: number | null): string =>
    encounters === null ? "this Quest's Encounters are drawn on the way" : `${encounters} of this Quest's ${preview.encounterKinds.length}`;

  return {
    requirements: preview.requirements.map((status) => {
      switch (status.requirement) {
        case 'party-size':
          return { words: `A Party of ${status.partySizeMin} to ${status.partySizeMax} (${status.size} chosen)`, met: status.met };
        case 'class':
          return { words: `A ${nameIn(content.classes, status.classKey)}`, met: status.met };
        case 'skill':
          return { words: `A Hero with ${nameIn(content.skills, status.skillKey)}`, met: status.met };
      }
    }),
    problems: preview.problems.map(({ hero, because }) =>
      because === 'not-on-roster'
        ? `${hero?.name ?? 'That Hero'} is not on the Roster of ${guild.name}.`
        : `${hero?.name ?? 'That Hero'} ${unavailableWords[because]} and cannot go.`,
    ),
    synergies:
      preview.synergies.length === 0
        ? ['None: this Party meets no Synergy.']
        : preview.synergies.map(({ synergy, encounters }) => {
            const where = synergy.kinds === undefined ? 'on every Encounter' : `on ${listed(synergy.kinds)} Encounters`;
            return `${synergy.name}: ${bonusWords(synergy.bonus)} ${where}; ${reach(encounters)}.`;
          }),
    consumables:
      preview.consumables.length === 0
        ? ['None carried.']
        : preview.consumables.map(({ definitionKey, quantity, consumable, held, encounters }) => {
            if (consumable === undefined) return `${nameIn(content.items, definitionKey)} ×${quantity}: not a consumable.`;
            const where = consumable.effect.kind === 'heal' ? '' : `; ${reach(encounters)}`;
            return `${consumable.name} ×${quantity}, of ${held} the Guild holds: ${effectWords(consumable.effect)}${where}.`;
          }),
    reward: `Reward agreed on a success: ${preview.agreedReward} Wealth, ${preview.offeredReward} offered.`,
    verdict:
      preview.refusal === null
        ? { sends: true, words: 'Dispatch would send this Party.' }
        : { sends: false, words: `Dispatch would refuse it: ${rejectionSentence(preview.refusal, world, content)}` },
  };
}

// ── The Roster ───────────────────────────────────────────────────────────────────────────────

export interface RosterRow {
  heroId: HeroId;
  name: string;
  className: string;
  level: number;
  age: number;
  /** `50, steady`: the value and its band. */
  morale: string;
  /** Where the Hero is: at the Hall, injured, or away with a Party, and until when. */
  whereabouts: string;
}

/** Where a Hero is and until when, in words. */
function whereabouts(hero: Hero, world: World): string {
  if (hero.diedOnTurn !== null) return `died on Day ${dayOf(hero.diedOnTurn)}`;
  if (hero.retiredOnTurn !== null) return `retired on Day ${dayOf(hero.retiredOnTurn)}`;
  const party = hero.partyId === null ? undefined : rowOf(world.parties, hero.partyId);
  if (party !== undefined) return `away with a Party, back on ${nightOf(party.returnsOnTurn)}`;
  if (hero.injury !== null) return `injured, healing on ${nightOf(hero.injury.healsOnTurn)}`;
  return 'at the Hall';
}

/** `show roster`: the player's Roster in its own order. */
export function rosterView(document: WorldDocument): RosterRow[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return [];
  const { config } = playDeps(document);
  return guild.rosterIds.flatMap((heroId): RosterRow[] => {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) return [];
    return [
      {
        heroId,
        name: hero.name,
        className: nameIn(content.classes, hero.classKey),
        level: hero.level,
        age: ageOf(hero, world.turn, config),
        morale: `${hero.morale}, ${moraleBand(hero.morale, config)}`,
        whereabouts: whereabouts(hero, world),
      },
    ];
  });
}

// ── What the Guild holds ──────────────────────────────────────────────────────────────────

export interface HeldRow {
  /** Unique within the list. */
  key: string;
  name: string;
  /** `weapon gear`, `consumable`. */
  kind: string;
  quantity: number;
  /** Gear's Stat modifiers in words; empty for a consumable. */
  modifies: string;
}

/** What the player's Guild holds (the CLI's `show roster`, M5-S2): each unique Item, then each stack. */
export function heldView(document: WorldDocument): HeldRow[] {
  const guild = playerGuild(document.world);
  if (guild === undefined) return [];
  const held = holdings(document.world, { kind: 'guild', id: guild.id });
  return [...held.items, ...held.stacks].map((row) => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      key: row.id,
      name: nameIn(content.items, row.definitionKey),
      kind: definition === undefined ? '' : definition.kind === 'gear' ? `${definition.slot} gear` : 'consumable',
      quantity: 'quantity' in row ? row.quantity : 1,
      modifies: definition?.kind === 'gear' ? modifierWords(definition) : '',
    };
  });
}

// ── A Hero's page ────────────────────────────────────────────────────────────────────────────

/** How many History entries a page of a Hero's History shows. A front end's choice, not a rule. */
export const historyPageSize = 20;

export interface StatRow {
  /** The Stat's area, on the first Stat of each area only. */
  area: string;
  name: string;
  base: number;
  /** What a Check reads: the Guildmaster's Class bonus and the Hero's gear applied (M5-S2). */
  effective: number;
  /** The Potential hint: a word, never the number (M3-S3). */
  outlook: PotentialHint;
}

export interface LogLine {
  /** Unique within its list. */
  key: string;
  /** `Day 3, afternoon`. */
  when: string;
  sentence: string;
  milestone: boolean;
}

export interface HeroPageView {
  heroId: HeroId;
  name: string;
  attributes: [label: string, value: string][];
  stats: StatRow[];
  gear: { slot: string; item: string; modifies: string }[];
  skills: { name: string; rating: number }[];
  /** Each other Hero on the Roster, the Hero's Regard for them and the Relationship, as bands; `null` off a Roster. */
  relationships: { name: string; className: string; regard: RegardBand; relationship: RegardBand }[] | null;
  /** The Hero's Milestones, newest first: what a Hero's page always shows first (`CONTEXT.md`). */
  milestones: LogLine[];
  /** One page of the Hero's History, newest first. */
  history: { lines: LogLine[]; page: number; pages: number; entries: number };
}

/** Gear's Stat modifiers in words, `Weaponry +2, Strength +1` (M5-S2). */
function modifierWords(gear: GearDefinition): string {
  return Object.entries(gear.statModifiers)
    .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${delta > 0 ? `+${delta}` : String(delta)}`)
    .join(', ');
}

/** History entries as lines, keyed by their place in the list. */
function linesOf(entries: readonly Entry[], narration: Narration): LogLine[] {
  return entries.map((entry, index) => ({
    key: `${entry.turn}-${index}`,
    when: whenOf(entry.turn),
    sentence: narrate(entry as EngineEvent, narration),
    milestone: entry.milestone,
  }));
}

/**
 * `show hero`: the Hero's Attributes, State, Stats with their hints, gear, Skills and, on a Roster,
 * Relationships, as the CLI prints them; then their Milestones and page `page` (from 0) of their
 * History, newest first. `null` for a Hero the world does not hold.
 */
export function heroPage(document: WorldDocument, heroId: HeroId, page = 0): HeroPageView | null {
  const { world, history } = document;
  const hero = rowOf(world.heroes, heroId);
  if (hero === undefined) return null;
  const deps = playDeps(document);
  const { config } = deps;
  const guild = hero.guildId === null ? undefined : rowOf(world.guilds, hero.guildId);
  const player = playerGuild(world);
  const reader = player === undefined ? undefined : guildmasterOf(player, world);
  const bands = { potentialHintBands: judgedHintBands(reader, content, config) };
  const onRoster = guild?.rosterIds.includes(hero.id) === true;

  const attributes: [string, string][] = [
    ['Sex', hero.sex],
    ['Age', String(ageOf(hero, world.turn, config))],
    ['Class', nameIn(content.classes, hero.classKey)],
    ['Background', nameIn(content.backgrounds, hero.backgroundKey)],
    ['Guild', hero.guildId === null ? (hero.unattachedSince === null ? 'none' : 'Unattached') : (guild?.name ?? 'a Guild')],
    ['Level', String(hero.level)],
    ['XP', String(hero.xp)],
    ['Morale', `${hero.morale}, ${moraleBand(hero.morale, config)}`],
    ['Where', whereabouts(hero, world)],
    [
      'Injury',
      hero.injury === null ? 'none' : `${nameIn(content.injuries, hero.injury.typeKey)}, healing on ${nightOf(hero.injury.healsOnTurn)}`,
    ],
    ['Traits', none(hero.traits.map((key) => nameIn(content.traits, key)))],
  ];
  // A Hero on another Guild's Roster: what the player's Guild would pay to take them (M6-S2).
  if (player !== undefined && guild !== undefined && guild.id !== player.id && onRoster) {
    attributes.push(['Transfer fee', `${transferFee(hero, reader, deps)} Wealth`]);
  }

  let lastArea = '';
  const effective = effectiveStats(hero, world, content);
  const stats = Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat): StatRow => {
      const area = stat.area === lastArea ? '' : capitalised(stat.area);
      lastArea = stat.area;
      const base = baseStat(hero.stats, stat);
      return { area, name: stat.name, base, effective: effective[stat.key] ?? base, outlook: potentialHint(hero, stat.key, bands) };
    });

  const carried: (UniqueItem | Stack)[] = carriedGear(world, hero.id);
  const slotOf = (row: UniqueItem | Stack): string => (row.holder.kind === 'hero' ? row.holder.slot : '');
  const line = (slot: string, row: UniqueItem | Stack) => {
    const definition = itemDefinition(content, row.definitionKey);
    return { slot, item: nameIn(content.items, row.definitionKey), modifies: definition?.kind === 'gear' ? modifierWords(definition) : '' };
  };
  const listedSlots: string[] = [...config.gearSlots];
  const gear = [
    ...listedSlots.flatMap((slot) => {
      const inSlot = carried.filter((row) => slotOf(row) === slot);
      return inSlot.length === 0 ? [{ slot, item: 'none', modifies: '' }] : inSlot.map((row) => line(slot, row));
    }),
    ...carried.filter((row) => !listedSlots.includes(slotOf(row))).map((row) => line(slotOf(row), row)),
  ];

  const skillKeys = Object.keys(hero.skills);
  const skills = [
    ...Object.keys(content.skills).filter((key) => skillKeys.includes(key)),
    ...skillKeys.filter((key) => !Object.hasOwn(content.skills, key)),
  ].map((key) => ({ name: nameIn(content.skills, key), rating: hero.skills[key] ?? 0 }));

  const relationships = onRoster
    ? (guild?.rosterIds ?? []).flatMap((id) => {
        const mate = id === hero.id ? undefined : rowOf(world.heroes, id);
        if (mate === undefined) return [];
        return [
          {
            name: mate.name,
            className: nameIn(content.classes, mate.classKey),
            regard: regardBand(regardValue(hero.regard, mate.id), config),
            relationship: regardBand(relationship(hero.id, mate.id, world, config), config),
          },
        ];
      })
    : null;

  const narration = narrationFor(document, content);
  const all = entriesFor(history, hero.id);
  const pages = Math.max(1, Math.ceil(all.length / historyPageSize));
  const shown = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return {
    heroId: hero.id,
    name: hero.name,
    attributes,
    stats,
    gear,
    skills,
    relationships,
    milestones: linesOf(
      all.filter((entry) => entry.milestone),
      narration,
    ),
    history: {
      lines: linesOf(entriesFor(history, hero.id, { from: shown * historyPageSize, limit: historyPageSize }), narration),
      page: shown,
      pages,
      entries: all.length,
    },
  };
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export interface StopView {
  kind: StopReason['kind'];
  sentence: string;
}

/** Why the last advance or fast forward stopped, in words; `null` when the last play was neither. */
export function stopView(state: GameState): StopView | null {
  const { document, stoppedBecause } = state;
  if (document === null || stoppedBecause === null) return null;
  const maxTurns = playDeps(document).config.turnsPerYear;
  return { kind: stoppedBecause.kind, sentence: narrateStop(stoppedBecause, document, maxTurns, narrationFor(document, content)) };
}

// ── The log ──────────────────────────────────────────────────────────────────────────────────

/**
 * The events of the last play the engine carried out, oldest first, each as a sentence: those that
 * name the player's Guild alone when `mine`. The engine lists a Hero's Guild among the participants
 * of each event naming the Hero, so the player's Heroes' events are the Guild's too.
 */
export function logView(state: GameState, mine = false): LogLine[] {
  const { document, log } = state;
  if (document === null) return [];
  const guild: Guild | undefined = playerGuild(document.world);
  const shown = mine && guild !== undefined ? log.filter((event) => event.participants.includes(guild.id)) : log;
  return linesOf(shown, narrationFor(document, content));
}

// ── A new game ───────────────────────────────────────────────────────────────────────────────

/** The Guild Backgrounds a new game may choose from (the CLI's `new --background`). */
export function guildBackgrounds(set: ContentSet = content): { key: string; name: string }[] {
  return Object.values(set.backgrounds)
    .filter((row) => row.owner === 'guild')
    .map((row) => ({ key: row.key, name: row.name }));
}
