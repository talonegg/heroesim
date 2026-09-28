// What the views read (M7-S3, DL-66): each function takes the game in hand and returns plain rows
// of words and numbers for a component to lay out. Nothing in `web/` computes a rule (ADR-0007,
// principle 12), so every number here is a document field or the answer of an engine selector,
// the same ones the CLI's `render.ts` reads (`rankingPlaces`, `bankruptcyCountdown`, `ageOf`,
// `baseStat`, `effectiveStats`, `potentialHint`, `judgedHintBands`, `carriedGear`, `regardBand`,
// `relationship`, `transferFee`, `previewDispatch`, `skillsThatHelp`, `entriesFor`); where a view
// needed an answer no selector gave, the selector went into the engine (`previewDispatch`,
// `skillsThatHelp`, `dispatchRefusal`, `rankingPlaces`, `bankruptcyCountdown`), never here. The
// words are the CLI's, as its `show` views print them.
//
// Potential is never in a view (data-model rule 9, M3-S3): a Hero's page carries each Stat's hint,
// the word `potentialHint` gives through the bands the player's Guildmaster reads, and no row type
// here has a field that could hold the number.
//
// Components may import this module; it and the rest of `state/` alone import the engine's values.

import {
  ageOf,
  bankruptcyCountdown,
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
  rankingPlaces,
  regardBand,
  regardValue,
  relationship,
  signingFee,
  signingRefusal,
  skillsThatHelp,
  timeOfDay,
  transferFee,
  unavailability,
  yearOf,
  type ConsumableEffect,
  type ConsumableRequest,
  type ContentSet,
  type EngineDeps,
  type TurnEvent,
  type Entry,
  type GearDefinition,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type ItemId,
  type PotentialHint,
  type Quest,
  type QuestId,
  type RegardBand,
  type SlotKey,
  type Stack,
  type StackId,
  type StopCondition,
  type StopReason,
  type Synergy,
  type UniqueItem,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { capitalised, nameIn, nightOf, none, placeWords, rowOf } from './names';
import { listed, narrate, narrateStop, narrationFor, type Narration } from './narrate';
import { playDeps, type GameState } from './reducer';
import { endingWords, rejectionSentence } from './rejections';

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** `Day 3, afternoon`: when a Turn fell, as the log shows it. */
export function whenOf(turn: number): string {
  return `Day ${dayOf(turn)}, ${timeOfDay(turn)}`;
}

// ── The header ───────────────────────────────────────────────────────────────────────────────

export interface HeaderView {
  guildName: string;
  wealth: number;
  fame: number;
  /** `Day 3, afternoon, Year 0`: the Turn and where it falls, as the CLI's `renderTime` says it. */
  time: string;
  /**
   * `3rd of 5 by Fame`, `joint 1st of 5 by Fame` for a place Guilds share (`rankingPlaces`,
   * DL-95), or that the Guild has folded and is not ranked.
   */
  rankings: string;
  /** The seed the world was made from: a game is reproducible from it (N1). */
  seed: string;
  /** The Bankruptcy countdown while the Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
  /** How the game ended, when it has. */
  ended: string | null;
}

/** The player's Guild at a glance; `null` for a save with no player's Guild. */
export function headerView(document: WorldDocument): HeaderView | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const { config } = playDeps(document);
  const byFame = rankingPlaces(world, 'fame');
  const place = byFame.find((ranking) => ranking.guildId === guild.id);
  const { ended } = world;
  return {
    guildName: guild.name,
    wealth: guild.wealth,
    fame: guild.fame,
    time: `Day ${dayOf(world.turn)}, ${timeOfDay(world.turn)}, Year ${yearOf(world.turn, config)}`,
    seed: document.meta.seed,
    rankings: place === undefined ? 'not ranked: the Guild has folded' : `${placeWords(place)} of ${byFame.length} by Fame`,
    countdown: countdownView(document),
    ended: ended === null ? null : `The game ended on Day ${dayOf(ended.turn)}: ${guild.name} ${endingWords[ended.reason]}.`,
  };
}

/**
 * The Bankruptcy countdown of the player's Guild as a sentence (v1.0.1-S4, DL-95), from the
 * engine's `bankruptcyCountdown` under the game's own rules; `null` while its `belowFloorSince` is,
 * and once the game has ended. It stands after Wealth rises during a Day, until that night's check
 * clears it, as the rule does. The header shows it; v1.0.1-S5 shows it in the Time section too,
 * between the steps of a fast forward.
 */
export function countdownView(document: WorldDocument): string | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined || world.ended !== null) return null;
  const { config } = playDeps(document);
  const countdown = bankruptcyCountdown(guild, config);
  if (countdown === null) return null;
  return (
    `${guild.name} has been below the Bankruptcy floor since Day ${countdown.sinceDay}: Bankruptcy on the night of ` +
    `Day ${countdown.dueDay} unless Wealth is back to ${config.bankruptcyFloor} or more on a night by then, after any Upkeep due.`
  );
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

/** Where a Hero is and until when, in words: a Hero on no Roster is not at any Hall. */
function whereabouts(hero: Hero, world: World): string {
  if (hero.diedOnTurn !== null) return `died on Day ${dayOf(hero.diedOnTurn)}`;
  if (hero.retiredOnTurn !== null) return `retired on Day ${dayOf(hero.retiredOnTurn)}`;
  if (hero.guildId === null) return hero.unattachedSince === null ? 'on no Roster' : 'in the Unattached pool';
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
  /** Each gear slot and what is in it; `worn` when an Item is, which `unequip` can take off. */
  gear: { slot: SlotKey; item: string; modifies: string; worn: boolean }[];
  skills: { name: string; rating: number }[];
  /** Each other Hero on the Roster, the Hero's Regard for them and the Relationship, as bands; `null` off a Roster. */
  relationships: { name: string; className: string; regard: RegardBand; relationship: RegardBand }[] | null;
  /** The Hero's Milestones, newest first: what a Hero's page always shows first (`CONTEXT.md`). */
  milestones: LogLine[];
  /** One page of the Hero's History, newest first. */
  history: { lines: LogLine[]; page: number; pages: number; entries: number };
  /** What the player can do with the Hero, by where they are; `null` for none. */
  actions: HeroActions | null;
}

/** A piece of gear the player's Guild holds, which `equip` can put on one of its Heroes. */
export interface GearChoice {
  /** Unique within the list. */
  key: string;
  name: string;
  /** `weapon gear`. */
  kind: string;
  modifies: string;
  /** What `equip` takes: the unique Item's id, or the stack's. */
  gear: { itemId: ItemId } | { stackId: StackId };
}

/** Another Guild in play and the fee it would pay the player's Guild to take the Hero (`transferFee`). */
export interface TransferTarget {
  guildId: GuildId;
  name: string;
  fee: number;
}

/**
 * What the player can do with a Hero (M7-S3, DL-73): on the player's Roster, equip, unequip and
 * transfer out; on another Guild's Roster, take them in for the Transfer fee; in the Unattached
 * pool, recruit them for the signing fee. The fees are the engine's (`transferFee`, `signingFee`,
 * at the paying Guildmaster's Negotiation); whether it is done is the engine's too, which refuses
 * with a sentence.
 */
export type HeroActions =
  | { kind: 'own'; equip: GearChoice[]; transferTo: TransferTarget[] }
  | { kind: 'rival'; guildName: string; fee: number }
  | { kind: 'pool'; fee: number; signs: string };

/** Gear's Stat modifiers in words, `Weaponry +2, Strength +1` (M5-S2). */
export function modifierWords(gear: GearDefinition): string {
  return Object.entries(gear.statModifiers)
    .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${delta > 0 ? `+${delta}` : String(delta)}`)
    .join(', ');
}

/** History entries as lines, keyed by their place in the list. */
export function linesOf(entries: readonly Entry[], narration: Narration): LogLine[] {
  return entries.map((entry, index) => ({
    key: `${entry.turn}-${index}`,
    when: whenOf(entry.turn),
    sentence: narrate(entry as TurnEvent, narration),
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

  // What the Hero carries, each in the slot it is held in: `carriedGear` gives only the Hero's own rows.
  const carried = carriedGear(world, hero.id).flatMap((row: UniqueItem | Stack) =>
    row.holder.kind === 'hero' ? [{ row, slot: row.holder.slot }] : [],
  );
  const line = (slot: SlotKey, row: UniqueItem | Stack) => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      slot,
      item: nameIn(content.items, row.definitionKey),
      modifies: definition?.kind === 'gear' ? modifierWords(definition) : '',
      worn: true,
    };
  };
  const listedSlots: readonly SlotKey[] = config.gearSlots;
  const gear = [
    ...listedSlots.flatMap((slot) => {
      const inSlot = carried.filter((each) => each.slot === slot);
      return inSlot.length === 0 ? [{ slot, item: 'none', modifies: '', worn: false }] : inSlot.map((each) => line(slot, each.row));
    }),
    ...carried.filter((each) => !listedSlots.includes(each.slot)).map((each) => line(each.slot, each.row)),
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
    actions: heroActions(hero, guild, onRoster, world, deps),
  };
}

/** What the player can do with `hero`, who is on `guild`'s Roster when `onRoster`. */
function heroActions(hero: Hero, guild: Guild | undefined, onRoster: boolean, world: World, deps: EngineDeps): HeroActions | null {
  const player = playerGuild(world);
  if (player === undefined) return null;
  const buyer = guildmasterOf(player, world);
  if (hero.unattachedSince !== null) {
    const refusal = signingRefusal(player, hero, deps.config);
    return { kind: 'pool', fee: signingFee(hero, deps, buyer), signs: refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}` };
  }
  if (guild === undefined || !onRoster) return null;
  if (guild.id !== player.id) return { kind: 'rival', guildName: guild.name, fee: transferFee(hero, buyer, deps) };
  return {
    kind: 'own',
    equip: gearChoices(world, player),
    transferTo: Object.values(world.guilds)
      .filter((other) => other.id !== player.id && other.foldedOnTurn === null)
      .map((other) => ({ guildId: other.id, name: other.name, fee: transferFee(hero, guildmasterOf(other, world), deps) })),
  };
}

/** The gear `guild` holds itself, unique Items then stacks: what `equip` can put on a Hero. */
function gearChoices(world: World, guild: Guild): GearChoice[] {
  const held = holdings(world, { kind: 'guild', id: guild.id });
  const rows: { id: string; definitionKey: ItemDefinitionKey; gear: GearChoice['gear'] }[] = [
    ...held.items.map((item) => ({ id: item.id, definitionKey: item.definitionKey, gear: { itemId: item.id } })),
    ...held.stacks.map((stack) => ({ id: stack.id, definitionKey: stack.definitionKey, gear: { stackId: stack.id } })),
  ];
  return rows.flatMap(({ id, definitionKey, gear }): GearChoice[] => {
    const definition = itemDefinition(content, definitionKey);
    if (definition?.kind !== 'gear') return [];
    return [{ key: id, name: definition.name, kind: `${definition.slot} gear`, modifies: modifierWords(definition), gear }];
  });
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export interface StopView {
  /** The engine's reason, or `player` for the player's Stop, the page's own (v1.0.1-S5, DL-96). */
  kind: StopReason['kind'] | 'player';
  sentence: string;
  /** After the player's Stop, the stops the fast forward was asked for, which "Fast forward again" asks for again. */
  until?: readonly StopCondition[];
}

/**
 * Why the last advance or fast forward stopped, in words, the player's Stop among them; `null`
 * when the last play was neither, and while a fast forward is between its steps.
 */
export function stopView(state: GameState): StopView | null {
  const { document, stoppedBecause, stopped } = state;
  if (document === null) return null;
  // Between steps, so after a step's Turns: never fewer than one.
  if (stopped !== null) return { kind: 'player', sentence: `Stopped: you asked to stop, after ${stopped.turnsPlayed} Turns.`, until: stopped.until };
  if (stoppedBecause === null) return null;
  const maxTurns = playDeps(document).config.turnsPerYear;
  return { kind: stoppedBecause.kind, sentence: narrateStop(stoppedBecause, document, maxTurns, narrationFor(document, content)) };
}

export interface ProgressView {
  /** `Played 90 Turns so far. Now Day 30, morning, Year 0.`: the Turns played and the Day reached. */
  sentence: string;
  /** The Bankruptcy countdown while the player's Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
}

/**
 * How far a fast forward has come, between its steps (v1.0.1-S5, DL-96): the Turns its steps have
 * played, and from the game its last step left, which the page holds until it ends, the Day they
 * reached and the countdown while the player's Guild is below the floor; `null` while none is
 * under way.
 */
export function progressView(state: GameState): ProgressView | null {
  const { forwarding } = state;
  if (forwarding === null) return null;
  const { document } = forwarding;
  const { turn } = document.world;
  const { config } = playDeps(document);
  return {
    sentence: `Played ${forwarding.turnsPlayed} Turns so far. Now Day ${dayOf(turn)}, ${timeOfDay(turn)}, Year ${yearOf(turn, config)}.`,
    countdown: countdownView(document),
  };
}

// ── The log ──────────────────────────────────────────────────────────────────────────────────

/**
 * The events of the last play the engine carried out, oldest first, each as a sentence: those that
 * name the player's Guild alone when `mine`. The engine lists a Hero's Guild among the participants
 * of each event naming the Hero, so the player's Heroes' events are the Guild's too.
 */
export function logView(state: Pick<GameState, 'document' | 'log'>, mine = false): LogLine[] {
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
