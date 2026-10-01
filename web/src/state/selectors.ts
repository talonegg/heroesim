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
  compareByCodeUnit,
  dayOf,
  defaultConfig,
  descriptiveAttributeLabels,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  durationDaysOf,
  effectiveStats,
  entriesFor,
  guildmasterOf,
  guildmasterTraitCost,
  guildmasterTraitsOf,
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
  sexes,
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
  type DescriptiveAttribute,
  type EncounterKind,
  type EngineEventOf,
  type EngineDeps,
  type TurnEvent,
  type Entry,
  type GameConfig,
  type GearDefinition,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type ItemId,
  type MoraleBand,
  type Party,
  type PotentialHint,
  type Quest,
  type QuestId,
  type RegardBand,
  type Sex,
  type SlotKey,
  type Stack,
  type StackId,
  type StopCondition,
  type StopReason,
  type Synergy,
  type TimeOfDay,
  type TraitKey,
  type Unavailability,
  type UniqueItem,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { capitalised, nameIn, nightOf, placeWords, rowOf, signed, traitEffectWords, transferCostWords } from './names';
import { listed, narrate, narrateStop, narrationFor, questNamer, type Narration } from './narrate';
import { playDeps, type GameState } from './reducer';
import { endingWords, rejectionSentence } from './rejections';

// ── Names ────────────────────────────────────────────────────────────────────────────────────

/** `Day 3, afternoon`: when a Turn fell, as the log shows it. */
export function whenOf(turn: number): string {
  return `Day ${dayOf(turn)}, ${timeOfDay(turn)}`;
}

// ── The header ───────────────────────────────────────────────────────────────────────────────

export interface HeaderView {
  /** The player's Guild, whose Banner stands beside its name (DL-125 item 7). */
  guildId: GuildId;
  guildName: string;
  /** The player's Guildmaster's name, the navigation's label for the Guildmaster view (M9-F2); `null` with none. */
  guildmasterName: string | null;
  wealth: number;
  fame: number;
  /** `Day 3, afternoon, Year 0`: the Turn and where it falls, as the CLI's `renderTime` says it. */
  time: string;
  /** The time of day alone, for the status bar's sun or moon (M9-S3, DL-103). */
  timeOfDay: TimeOfDay;
  /** `time` in two parts, `Day 3, afternoon` and `Year 0`: a phone's status bar shows the first. */
  when: string;
  year: string;
  /**
   * `3rd of 5 by Fame`, `Joint 1st of 5 by Fame` for a place Guilds share (`rankingPlaces`,
   * DL-95), or that the Guild has folded and is not ranked.
   */
  rankings: string;
  /**
   * `rankings` in two parts, `Joint 1st of 5` and `by Fame`, the second empty for a folded Guild: a
   * phone's status bar shows the first (M9-S3, DL-103).
   */
  place: string;
  measure: string;
  /** The seed the world was made from: a game is reproducible from it (N1). */
  seed: string;
  /** The Bankruptcy countdown while the Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
  /**
   * The same countdown in a few words for the status bar's pill, `Bankruptcy on the night of Day 30`
   * (M9-S3, DL-103); `null` exactly while `countdown` is.
   */
  due: string | null;
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
  const when = `Day ${dayOf(world.turn)}, ${timeOfDay(world.turn)}`;
  const year = `Year ${yearOf(world.turn, config)}`;
  const standing = place === undefined ? 'Not ranked: the Guild has folded' : `${capitalised(placeWords(place))} of ${byFame.length}`;
  const measure = place === undefined ? '' : 'by Fame';
  return {
    guildId: guild.id,
    guildName: guild.name,
    guildmasterName: guildmasterOf(guild, world)?.name ?? null,
    wealth: guild.wealth,
    fame: guild.fame,
    time: `${when}, ${year}`,
    timeOfDay: timeOfDay(world.turn),
    when,
    year,
    seed: document.meta.seed,
    rankings: measure === '' ? standing : `${standing} ${measure}`,
    place: standing,
    measure,
    countdown: countdownView(document),
    due: dueView(document),
    ended: ended === null ? null : `The game ended on Day ${dayOf(ended.turn)}: ${guild.name} ${endingWords[ended.reason]}.`,
  };
}

/**
 * The Bankruptcy countdown of the player's Guild as a sentence (v1.0.1-S4, DL-95), from the
 * engine's `bankruptcyCountdown` under the game's own rules; `null` while its `belowFloorSince` is,
 * and once the game has ended. It stands after Wealth rises during a Day, until that night's check
 * clears it, as the rule does. The home view says it in full, the status bar's pill gives its Day
 * (`HeaderView.due`, M9-S3), and the status bar's time controls show it between the steps of a fast
 * forward too (v1.0.1-S5).
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

/** The countdown's Day, `Bankruptcy on the night of Day 30`: when `countdownView` gives a sentence, and only then. */
function dueView(document: WorldDocument): string | null {
  const guild = playerGuild(document.world);
  if (guild === undefined || document.world.ended !== null) return null;
  const countdown = bankruptcyCountdown(guild, playDeps(document).config);
  return countdown === null ? null : `Bankruptcy on the night of Day ${countdown.dueDay}`;
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
  /** The Class and the Skill it requires beyond its Party size, `a Mage`, `a Hero with Lockpicking`: none, often. */
  needs: string[];
  /** The last Day it stays on offer. */
  lastDay: number;
  /** Whether that Day is the Day in hand: the next morning's refresh takes it off, if no Guild has (M9-S4). */
  leavesToday: boolean;
  /**
   * Its Stat demands in the Quest's order, each named, with its weight as a share of the work in
   * hundredths: a Quest's weights sum to one, so the shares sum to about 100 (M9-S4, the review's C5).
   */
  demands: DemandShare[];
  /** The Skills its Encounters' Checks read (`skillsThatHelp`, DL-70), by name. */
  skills: string[];
  /**
   * Its Encounters counted by kind, in the order each kind is first met, `Combat ×2` (M9-S4, the
   * review's B2); none when they are drawn on the way.
   */
  encounters: EncounterCount[];
  /**
   * Where its difficulty sits among the Quests on the Board now (M9-S4, the review's C6): display
   * only, and never called a band, which is how a Quest went (`CONTEXT.md`).
   */
  meter: DifficultyMeter;
  /** The same in words: `3rd hardest of the 6 Quests on the Board`, `the only Quest on the Board`. */
  hardness: string;
}

/** A Stat a Quest demands, and its weight as a share of the work in hundredths. */
export interface DemandShare {
  stat: string;
  percent: number;
}

/** How many of a Quest's Encounters are of one kind. */
export interface EncounterCount {
  /** The kind, or `null` for an Encounter content does not define, which counts under its key. */
  kind: EncounterKind | null;
  count: number;
  /** `Combat ×2`, a chip's words (DL-125 item 9). */
  words: string;
}

/** A Quest's difficulty placed against the Quests on the Board now, for a meter to draw. */
export interface DifficultyMeter {
  /** The difficulty of the easiest and of the hardest Quest on the Board now. */
  lowest: number;
  highest: number;
  /** Where this Quest's falls, from the lowest, 0, to the highest, 1; the middle when they are one. */
  at: number;
  /** Where each other Quest on the Board falls, in the Board's order. */
  others: number[];
}

/**
 * How the player may order the Board (M9-S4, the review's B2): as it was posted; by reward, highest
 * first; by difficulty, easiest first; or by the Day each leaves, soonest first. Display only: the
 * Board's own order is the World State's, which no play changes.
 */
export type BoardOrder = 'posted' | 'reward' | 'difficulty' | 'leaves';

/** Each order's key, smallest first; ties keep the Board's order. */
const orderKeys: Readonly<Record<Exclude<BoardOrder, 'posted'>, (card: QuestCard) => number>> = {
  reward: (card) => -card.reward,
  difficulty: (card) => card.difficulty,
  leaves: (card) => card.lastDay,
};

/** `show board`: the Quests on offer, in the Board's order or in `order`. */
export function boardView(document: WorldDocument, order: BoardOrder = 'posted'): QuestCard[] {
  const cards = questCards(document);
  if (order === 'posted') return cards;
  const key = orderKeys[order];
  return [...cards].sort((a, b) => key(a) - key(b));
}

/** The Quests on offer as cards, in the Board's order. */
function questCards(document: WorldDocument): QuestCard[] {
  const { world } = document;
  const today = dayOf(world.turn);
  const quests = world.board.flatMap((questId) => rowOf(world.quests, questId) ?? []);
  const difficulties = quests.map((quest) => quest.difficulty);
  const lowest = Math.min(...difficulties);
  const highest = Math.max(...difficulties);
  const along = (difficulty: number): number => (highest === lowest ? 0.5 : (difficulty - lowest) / (highest - lowest));
  return quests.map((quest, index): QuestCard => {
    const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
    return {
      questId: quest.id,
      name: nameIn(content.questTemplates, quest.templateKey),
      patron: rowOf(world.patrons, quest.patronId)?.name ?? 'a Patron',
      difficulty: quest.difficulty,
      days: durationDaysOf(quest),
      reward: quest.reward,
      fame: quest.fameEffect,
      party: `${partySizeMin} to ${partySizeMax} Heroes`,
      needs: [
        ...(classKey === undefined ? [] : [`a ${nameIn(content.classes, classKey)}`]),
        ...(skillKey === undefined ? [] : [`a Hero with ${nameIn(content.skills, skillKey)}`]),
      ],
      lastDay: dayOf(quest.expiresOnTurn),
      leavesToday: dayOf(quest.expiresOnTurn) === today,
      demands: quest.demands.map(([key, weight]) => ({ stat: nameIn(content.stats, key), percent: Math.round(weight * 100) })),
      skills: skillsThatHelp(quest, content).map((key) => nameIn(content.skills, key)),
      encounters: encounterCounts(quest),
      meter: { lowest, highest, at: along(quest.difficulty), others: difficulties.filter((_, other) => other !== index).map(along) },
      hardness: hardnessWords(quest.difficulty, difficulties),
    };
  });
}

/** A Quest's Encounters counted by kind, in the order each kind is first met. */
function encounterCounts(quest: Quest): EncounterCount[] {
  const counts = new Map<string, EncounterCount>();
  for (const key of quest.encounterKeys) {
    const kind = rowOf(content.encounters, key)?.kind ?? null;
    const label = kind ?? key;
    const counted = counts.get(label) ?? { kind, count: 0, words: '' };
    counted.count += 1;
    counted.words = `${capitalised(label)} ×${counted.count}`;
    counts.set(label, counted);
  }
  return [...counts.values()];
}

/** Where `difficulty` ranks among `difficulties`, its own among them, hardest first, in words. */
function hardnessWords(difficulty: number, difficulties: readonly number[]): string {
  const { length } = difficulties;
  if (length === 1) return 'the only Quest on the Board';
  const place = 1 + difficulties.filter((each) => each > difficulty).length;
  const joint = difficulties.filter((each) => each === difficulty).length > 1;
  const of = `of the ${length} Quests on the Board`;
  if (place === 1) return `${joint ? 'joint' : 'the'} hardest ${of}`;
  // No Quest easier: the easiest, alone or joint, where Quests share the lowest difficulty (M9-F6).
  if (difficulties.every((each) => each >= difficulty)) return `${joint ? 'joint' : 'the'} easiest ${of}`;
  return `${placeWords({ place, joint })} hardest ${of}`;
}

// ── Choosing a Party ─────────────────────────────────────────────────────────────────────────

/** Why a Hero cannot go, after their name (the CLI's `dispatch`): the preview's problems. */
const unavailableWords = {
  injured: 'is injured',
  dead: 'is dead',
  retired: 'has retired',
  'in-party': 'is away with a Party',
} as const;

/**
 * A Hero on the Roster as the Party builder shows them for one Quest (M9-S4, DL-99 item 3): whether
 * they can go, and when not why and until when; their Class and Level; their Morale and its band;
 * the effective values of the Stats the Quest demands; and the Skills the Quest names that they
 * have. Every value is one the Roster, a Hero's page and the Board already give: no fit and no odds.
 */
export interface PartyRow {
  heroId: HeroId;
  name: string;
  className: string;
  level: number;
  morale: number;
  moraleBand: MoraleBand;
  /** The engine's `unavailability`: why the Hero cannot go now, or `null` when they can. */
  why: Unavailability | null;
  /** The same with until when, as the Roster words it: `Injured, healing on the night of Day 6`. */
  unavailable: string | null;
  /** Each Stat the Quest demands, in its order, at the value a Check reads (`effectiveStats`). */
  stats: { name: string; value: number }[];
  /** The Skill the Quest requires, then those that help (`skillsThatHelp`), that the Hero has. */
  skills: { name: string; rating: number }[];
}

/** The player's Roster as the Heroes a Party for `questId` may be chosen from; `null` for a Quest not on the Board. */
export function partyRows(document: WorldDocument, questId: QuestId): PartyRow[] | null {
  const { world } = document;
  const guild = playerGuild(world);
  const quest = rowOf(world.quests, questId);
  if (guild === undefined || quest === undefined || !world.board.includes(questId)) return null;
  const { config } = playDeps(document);
  const { skillKey } = quest.requirements;
  const named = [...new Set([...(skillKey === undefined ? [] : [skillKey]), ...skillsThatHelp(quest, content)])];
  return guild.rosterIds.flatMap((heroId): PartyRow[] => {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) return [];
    const values = statValues(hero, world);
    const held = heldSkills(hero);
    return [
      {
        heroId,
        name: hero.name,
        className: nameIn(content.classes, hero.classKey),
        level: hero.level,
        morale: hero.morale,
        moraleBand: moraleBand(hero.morale, config),
        why: unavailability(hero),
        unavailable: unavailableUntil(hero, world),
        stats: quest.demands.map(([key]) => ({ name: nameIn(content.stats, key), value: values.get(key)?.effective ?? 0 })),
        skills: named.flatMap((key) => held.filter((skill) => skill.key === key).map(({ name, rating }) => ({ name, rating }))),
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
            if (consumable === undefined) return `${nameIn(content.items, definitionKey)} ×${quantity}: not a Consumable.`;
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

/** The Party the player sent by the last play, as the Board confirms it (M9-S4, the review's E1). */
export interface SentView {
  questId: QuestId;
  /** The Quest's name, as the Board named it. */
  quest: string;
  /** Who went, by name, in the Party's order: `Finn, Vigdis and Arne`. */
  heroes: string;
  /** `the night of Day 5`: when the Party comes home, as the home view's Parties out says it. */
  returns: string;
}

/**
 * The Party of the player's that the last play the engine carried out sent (its `quest.taken`),
 * or `null` when that play sent none: an advance, whose Parties are the Rivals', or before a game.
 * A dispatch sends one Party, so there is one at most. Names are the event's labels, written when
 * it was sent.
 */
export function sentView(state: Pick<GameState, 'document' | 'log'>): SentView | null {
  const { document, log } = state;
  const guild = document === null ? undefined : playerGuild(document.world);
  if (document === null || guild === undefined) return null;
  const taken = log.filter((event): event is Taken => event.type === 'quest.taken' && (event as Taken).payload.guildId === guild.id).at(-1);
  if (taken === undefined) return null;
  const { payload, labels } = taken;
  return {
    questId: payload.questId,
    quest: questNamer(document, content)(payload.questId),
    heroes: listed(payload.heroIds.map((heroId) => labels[heroId] ?? rowOf(document.world.heroes, heroId)?.name ?? 'a Hero')),
    returns: nightOf(payload.returnsOnTurn),
  };
}

type Taken = EngineEventOf<'quest.taken'>;

// ── The Roster ───────────────────────────────────────────────────────────────────────────────

export interface RosterRow {
  heroId: HeroId;
  name: string;
  /** Their sex and Portrait's key, for the thumbnail beside their name (v1.1.3-S7, DL-135 item 9). */
  sex: Sex;
  portraitKey: string | null;
  className: string;
  level: number;
  age: number;
  morale: number;
  moraleBand: MoraleBand;
  /** The engine's `unavailability`: why the Hero is not at the Hall to be sent, or `null` (M9-S6). */
  why: Unavailability | null;
  /** Where the Hero is: at the Hall, injured, or away with a Party, and until when: `At the Hall`. */
  whereabouts: string;
}

/**
 * Where a Hero is and until when, in words that stand on their own, as a chip (DL-125 item 9): a
 * Hero on no Roster is not at any Hall. The Roster, a Hero's page and the Party builder read it here.
 */
function whereabouts(hero: Hero, world: World): string {
  if (hero.diedOnTurn !== null) return `Died on Day ${dayOf(hero.diedOnTurn)}`;
  if (hero.retiredOnTurn !== null) return `Retired on Day ${dayOf(hero.retiredOnTurn)}`;
  if (hero.guildId === null) return hero.unattachedSince === null ? 'On no Roster' : 'In the Unattached pool';
  const party = hero.partyId === null ? undefined : rowOf(world.parties, hero.partyId);
  if (party !== undefined) return awayWords(party);
  if (hero.injury !== null) return healingWords(hero.injury);
  return 'At the Hall';
}

/** `Away with a Party, back on the night of Day 5`. */
function awayWords(party: Pick<Party, 'returnsOnTurn'>): string {
  return `Away with a Party, back on ${nightOf(party.returnsOnTurn)}`;
}

/** `Injured, healing on the night of Day 6`. */
function healingWords(injury: { healsOnTurn: number }): string {
  return `Injured, healing on ${nightOf(injury.healsOnTurn)}`;
}

/**
 * Why a Hero cannot go on a Quest and until when, in the Roster's words (M9-S4): the reason is the
 * engine's `unavailability`, what `dispatch` refuses by; `null` when they can go.
 */
function unavailableUntil(hero: Hero, world: World): string | null {
  switch (unavailability(hero)) {
    case null:
      return null;
    case 'injured':
      return hero.injury === null ? 'Injured' : healingWords(hero.injury);
    case 'in-party': {
      const party = hero.partyId === null ? undefined : rowOf(world.parties, hero.partyId);
      return party === undefined ? 'Away with a Party' : awayWords(party);
    }
    case 'dead':
    case 'retired':
      return whereabouts(hero, world);
  }
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
        sex: hero.sex,
        portraitKey: hero.portraitKey,
        className: nameIn(content.classes, hero.classKey),
        level: hero.level,
        age: ageOf(hero, world.turn, config),
        morale: hero.morale,
        moraleBand: moraleBand(hero.morale, config),
        why: unavailability(hero),
        whereabouts: whereabouts(hero, world),
      },
    ];
  });
}

// ── A Hero's page ────────────────────────────────────────────────────────────────────────────

/** How many History entries a page of the History shows, a Hero's among them. A front end's choice, not a rule. */
export const historyPageSize = 20;

export interface StatRow {
  name: string;
  base: number;
  /** What a Check reads: the Guildmaster's Class bonus and the Hero's gear applied (M5-S2). */
  value: number;
  /**
   * What the Hero's gear and the Guildmaster's Traits add to the base, `+2` or `-1`, and whether it
   * lifts it; `null` when the value is the base (M9-S6, the review's B7).
   */
  lift: { words: string; up: boolean } | null;
  /** The Potential hint: a word, never the number (M3-S3). */
  outlook: PotentialHint;
  /** The same as its chip says it, `Promising` (DL-125 item 9). */
  outlookWords: string;
}

/** One of the four areas of a Hero's Stats, `Physical`, and its Stats in content's order (M9-S6). */
export interface StatArea {
  name: string;
  stats: StatRow[];
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
  /**
   * The Hero's sex and Portrait's key, for their Portrait (DL-125 item 2): the key chosen as they were
   * generated (v1.1.3-S6), `null` for the Silhouette of their sex, as every Hero's is while content
   * holds no Hero picture (DL-135 item 8).
   */
  sex: Sex;
  portraitKey: string | null;
  /**
   * Their Appearance and Biography (v1.1.3-S6, DL-135 item 6), each a label and its words, shown under
   * their Portrait (v1.1.3-S7); one written empty, as no Hero's is, is left out.
   */
  texts: [label: string, words: string][];
  /**
   * Who the Hero is, in one line of parts (M9-S6, the review's B7): Class, `Level 3`, `Age 18`, `Female`,
   * Background, and `of The Lantern` while their Guild is known.
   */
  line: string[];
  morale: { value: number; band: MoraleBand };
  /** Where the Hero is, in the Roster's words, and the engine's `unavailability`: why they cannot go now. */
  where: { why: Unavailability | null; words: string };
  /** The Injury's name, while they have one; `where` says when it heals. */
  injury: string | null;
  xp: number;
  traits: string[];
  /** What the player's Guild would pay to take in a Hero on another Guild's Roster (`transferFee`); `null` otherwise. */
  fee: number | null;
  /** The Stats by area, each area a block on the page (M9-S6, the review's B7). */
  areas: StatArea[];
  /**
   * Each gear slot and what is in it; `worn` when an Item is, which `unequip` can take off. What is in
   * it by its content key, `null` in an empty slot, and whether it is a Unique Item, which shows its
   * picture (DL-125 item 8).
   */
  gear: {
    slot: SlotKey;
    slotName: string;
    item: string;
    modifies: string;
    worn: boolean;
    definitionKey: ItemDefinitionKey | null;
    unique: boolean;
  }[];
  skills: { name: string; rating: number }[];
  /**
   * Each other Hero on the Roster, the Hero's Regard for them and the Relationship, as bands; `null`
   * off a Roster. `neutral` when both bands are, which the page folds (M9-S6, the review's C8).
   */
  relationships: { name: string; className: string; regard: RegardBand; relationship: RegardBand; neutral: boolean }[] | null;
  /** The Hero's Milestones, newest first: what a Hero's page always shows first (`CONTEXT.md`). Their History is `historyView`'s (M9-S5). */
  milestones: LogLine[];
  /** What the player can do with the Hero, by where they are; `null` for none. */
  actions: HeroActions | null;
}

/** A piece of gear the player's Guild holds, which `equip` can put on one of its Heroes. */
export interface GearChoice {
  /** Unique within the list. */
  key: string;
  name: string;
  /** `Weapon Gear`, as the slot's cell says it (DL-125 item 9). */
  kind: string;
  modifies: string;
  /** The Item's content key, and whether it is a Unique Item, which shows its picture (DL-125 item 8). */
  definitionKey: ItemDefinitionKey;
  unique: boolean;
  /** What `equip` takes: the unique Item's id, or the stack's. */
  gear: { itemId: ItemId } | { stackId: StackId };
}

/** Another Guild in play and the fee it would pay the player's Guild to take the Hero (`transferFee`). */
export interface TransferTarget {
  guildId: GuildId;
  name: string;
  fee: number;
  /**
   * What the page asks before the Transfer (M9-S6, the review's E4): the fee, and what it costs in
   * the words the page gives the rule. `The Ashford Guild would pay 120 Wealth for Finn Grimshaw, …`
   */
  sentence: string;
}

/**
 * What the player can do with a Hero (M7-S3, DL-73): on the player's Roster, equip, unequip and
 * transfer out; on another Guild's Roster, take them in for the Transfer fee; in the Unattached
 * pool, recruit them for the signing fee. The fees are the engine's (`transferFee`, `signingFee`,
 * at the paying Guildmaster's Negotiation); whether it is done is the engine's too, which refuses
 * with a sentence. Whether a Hero in the pool would sign is the engine's `signingRefusal`, as the
 * pool's row reads it (`poolView`), so Recruit can be disabled for one who will not (DL-109 item 2,
 * Q17).
 */
export type HeroActions =
  | { kind: 'own'; equip: GearChoice[]; transferTo: TransferTarget[] }
  | { kind: 'rival'; guildName: string; fee: number }
  | { kind: 'pool'; fee: number; signs: string; willSign: boolean };

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
 * Relationships, as the CLI prints them; then their Milestones, newest first. Their History, a page
 * at a time, is `historyView`'s (`history.ts`, M9-S5). `null` for a Hero the world does not hold.
 */
export function heroPage(document: WorldDocument, heroId: HeroId): HeroPageView | null {
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

  // Who the Hero is in one line, and their State as chips (M9-S6, the review's B7): what were eleven
  // label and value rows. A Hero in the pool or gone from it names no Guild; `where` says where they are.
  const who = [
    nameIn(content.classes, hero.classKey),
    `Level ${hero.level}`,
    // "Age" as a label and the Sex as a word, capitalised (DL-111 item 9); an age in a sentence stays lowercase.
    `Age ${ageOf(hero, world.turn, config)}`,
    capitalised(hero.sex),
    nameIn(content.backgrounds, hero.backgroundKey),
    ...(guild === undefined ? [] : [`of ${guild.name}`]),
  ];
  // A Hero on another Guild's Roster: what the player's Guild would pay to take them (M6-S2).
  const fee = player !== undefined && guild !== undefined && guild.id !== player.id && onRoster ? transferFee(hero, reader, deps) : null;

  const values = statValues(hero, world);
  const areas: StatArea[] = [];
  for (const stat of Object.values(content.stats).filter((each) => each.owner === 'hero')) {
    const { base, effective } = values.get(stat.key) ?? { base: 0, effective: 0 };
    const outlook = potentialHint(hero, stat.key, bands);
    const row: StatRow = {
      name: stat.name,
      base,
      value: effective,
      lift: effective === base ? null : { words: signed(effective - base), up: effective > base },
      outlook,
      outlookWords: capitalised(outlook),
    };
    const name = capitalised(stat.area);
    const area = areas.at(-1);
    if (area?.name === name) area.stats.push(row);
    else areas.push({ name, stats: [row] });
  }

  // What the Hero carries, each in the slot it is held in: `carriedGear` gives only the Hero's own rows.
  const carried = carriedGear(world, hero.id).flatMap((row: UniqueItem | Stack) =>
    row.holder.kind === 'hero' ? [{ row, slot: row.holder.slot }] : [],
  );
  const line = (slot: SlotKey, row: UniqueItem | Stack): HeroPageView['gear'][number] => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      slot,
      slotName: capitalised(slot),
      item: nameIn(content.items, row.definitionKey),
      modifies: definition?.kind === 'gear' ? modifierWords(definition) : '',
      worn: true,
      definitionKey: row.definitionKey,
      unique: definition?.unique === true,
    };
  };
  const listedSlots: readonly SlotKey[] = config.gearSlots;
  const gear = [
    ...listedSlots.flatMap((slot) => {
      const inSlot = carried.filter((each) => each.slot === slot);
      return inSlot.length === 0
        ? [{ slot, slotName: capitalised(slot), item: 'None', modifies: '', worn: false, definitionKey: null, unique: false }]
        : inSlot.map((each) => line(slot, each.row));
    }),
    ...carried.filter((each) => !listedSlots.includes(each.slot)).map((each) => line(each.slot, each.row)),
  ];

  const skills = heldSkills(hero).map(({ name, rating }) => ({ name, rating }));

  const relationships = onRoster
    ? (guild?.rosterIds ?? []).flatMap((id) => {
        const mate = id === hero.id ? undefined : rowOf(world.heroes, id);
        if (mate === undefined) return [];
        const regard = regardBand(regardValue(hero.regard, mate.id), config);
        const between = regardBand(relationship(hero.id, mate.id, world, config), config);
        return [
          {
            name: mate.name,
            className: nameIn(content.classes, mate.classKey),
            regard,
            relationship: between,
            neutral: regard === 'neutral' && between === 'neutral',
          },
        ];
      })
    : null;

  const narration = narrationFor(document, content);
  const all = entriesFor(history, hero.id);
  return {
    heroId: hero.id,
    name: hero.name,
    sex: hero.sex,
    portraitKey: hero.portraitKey,
    texts: (['appearance', 'biography'] as const).flatMap((attribute): [string, string][] =>
      hero[attribute] === '' ? [] : [[descriptiveAttributeLabels[attribute], hero[attribute]]],
    ),
    line: who,
    morale: { value: hero.morale, band: moraleBand(hero.morale, config) },
    where: { why: unavailability(hero), words: whereabouts(hero, world) },
    injury: hero.injury === null ? null : nameIn(content.injuries, hero.injury.typeKey),
    xp: hero.xp,
    traits: hero.traits.map((key) => nameIn(content.traits, key)),
    fee,
    areas,
    gear,
    skills,
    relationships,
    milestones: linesOf(
      all.filter((entry) => entry.milestone),
      narration,
    ),
    actions: heroActions(hero, guild, onRoster, world, deps),
  };
}

/**
 * Each of a Hero's Stats as a Check reads it (`effectiveStats`: the Guildmaster's Class bonus and the
 * Hero's gear applied, M5-S2) beside its base, keyed by Stat: what a Hero's page and the Party
 * builder show alike.
 */
function statValues(hero: Hero, world: World): Map<string, { base: number; effective: number }> {
  const effective = effectiveStats(hero, world, content);
  return new Map(
    Object.values(content.stats)
      .filter((stat) => stat.owner === 'hero')
      .map((stat) => {
        const base = baseStat(hero.stats, stat);
        return [stat.key, { base, effective: effective[stat.key] ?? base }];
      }),
  );
}

/** The Skills a Hero has, in content's order, then any content does not define, each with its rating. */
function heldSkills(hero: Hero): { key: string; name: string; rating: number }[] {
  const skillKeys = Object.keys(hero.skills);
  return [
    ...Object.keys(content.skills).filter((key) => skillKeys.includes(key)),
    ...skillKeys.filter((key) => !Object.hasOwn(content.skills, key)),
  ].map((key) => ({ key, name: nameIn(content.skills, key), rating: hero.skills[key] ?? 0 }));
}

/** What the player can do with `hero`, who is on `guild`'s Roster when `onRoster`. */
function heroActions(hero: Hero, guild: Guild | undefined, onRoster: boolean, world: World, deps: EngineDeps): HeroActions | null {
  const player = playerGuild(world);
  if (player === undefined) return null;
  const buyer = guildmasterOf(player, world);
  if (hero.unattachedSince !== null) {
    const refusal = signingRefusal(player, hero, deps.config);
    return {
      kind: 'pool',
      fee: signingFee(hero, deps, buyer),
      signs: refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}`,
      willSign: refusal === null,
    };
  }
  if (guild === undefined || !onRoster) return null;
  if (guild.id !== player.id) return { kind: 'rival', guildName: guild.name, fee: transferFee(hero, buyer, deps) };
  return {
    kind: 'own',
    equip: gearChoices(world, player),
    transferTo: Object.values(world.guilds)
      .filter((other) => other.id !== player.id && other.foldedOnTurn === null)
      .map((other) => {
        const fee = transferFee(hero, guildmasterOf(other, world), deps);
        const sentence = `${other.name} would pay ${fee} Wealth for ${hero.name}, if it is willing to take them. ${transferCostWords}`;
        return { guildId: other.id, name: other.name, fee, sentence };
      }),
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
    return [
      {
        key: id,
        name: definition.name,
        kind: `${capitalised(definition.slot)} Gear`,
        modifies: modifierWords(definition),
        definitionKey,
        unique: definition.unique,
        gear,
      },
    ];
  });
}

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export interface StopView {
  /** The engine's reason, or `player` for the player's Stop, the page's own (v1.0.1-S5, DL-96). */
  kind: StopReason['kind'] | 'player';
  sentence: string;
  /** After the player's Stop, the stops the fast forward was asked for, which "Fast forward again" asks for again. */
  until?: readonly StopCondition[];
  /**
   * For a decision needed, each Quest the stop names that is still on the Board, in the stop's
   * order and as the Board names it: the home view makes each a button to its Party (M9-S3, DL-103).
   */
  quests?: readonly StopQuest[];
}

/** A Quest a stop names, as the Board names it, with its reward to tell two of a name apart. */
export interface StopQuest {
  questId: QuestId;
  name: string;
  patron: string;
  reward: number;
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
  const sentence = narrateStop(stoppedBecause, document, maxTurns, narrationFor(document, content));
  if (stoppedBecause.kind !== 'decision-needed' && stoppedBecause.kind !== 'quest-staffable') return { kind: stoppedBecause.kind, sentence };
  const board = boardView(document);
  const quests = stoppedBecause.questIds.flatMap((questId): StopQuest[] => {
    const card = board.find((each) => each.questId === questId);
    return card === undefined ? [] : [{ questId, name: card.name, patron: card.patron, reward: card.reward }];
  });
  return { kind: stoppedBecause.kind, sentence, quests };
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

// ── A new game ───────────────────────────────────────────────────────────────────────────────

/** The Guild Backgrounds a new game may choose from (the CLI's `new --background`). */
export function guildBackgrounds(set: ContentSet = content): { key: string; name: string }[] {
  return Object.values(set.backgrounds)
    .filter((row) => row.owner === 'guild')
    .map((row) => ({ key: row.key, name: row.name }));
}

/** A Guildmaster Trait the new-game form offers (M9-S2): what it does, its cost, and what it excludes. */
export interface TraitChoice {
  key: TraitKey;
  name: string;
  /** What it does, in the Guildmaster's page's words: `Upkeep ×0.9`. */
  effect: string;
  /** Its cost against the budget: a buff's positive, a penalty's negative, a refund. */
  cost: number;
  /** The Guildmaster Traits it cannot be held with, in key order. */
  excludes: { key: TraitKey; name: string }[];
}

/** The rules the new-game form sets the Guildmaster up within (M9-S2, R8, DL-100 item 3). */
export interface GuildmasterSetupChoices {
  sexes: readonly Sex[];
  /** The starting ages, whole years, both included. */
  ageMin: number;
  ageMax: number;
  /** `guildmasterRetirementAge`: the age a Guildmaster retires at, which the form says (DL-113 item 5). */
  retirementAge: number;
  /** `guildmasterTraitBudget`: the most the Traits chosen may cost in all. */
  traitBudget: number;
  /** `guildmasterTraitsMax`: the most Traits chosen. */
  traitsMax: number;
  /** Every Guildmaster Trait, in key order. */
  traits: TraitChoice[];
  /** The descriptive Attributes, in the order they are shown, each with its bound in characters. */
  attributes: { attribute: DescriptiveAttribute; label: string; maxLength: number }[];
}

/**
 * What the new-game form offers for the Guildmaster (M9-S2, the CLI's `new` flags): the sexes, the
 * starting ages, the Trait budget and the most Traits under `config` (the current defaults, the
 * rules a new game begins under), each Guildmaster Trait of `set` with its effect, cost and
 * exclusions, and the descriptive Attributes with their bounds. The form's check is the engine's,
 * through `newGameRefusal`; this only says what there is to choose.
 */
export function guildmasterSetupChoices(set: ContentSet = content, config: GameConfig = defaultConfig): GuildmasterSetupChoices {
  const traits = guildmasterTraitsOf(set);
  return {
    sexes,
    ageMin: config.guildmasterStartingAgeMin,
    ageMax: config.guildmasterStartingAgeMax,
    retirementAge: config.guildmasterRetirementAge,
    traitBudget: config.guildmasterTraitBudget,
    traitsMax: config.guildmasterTraitsMax,
    traits: traits.map((trait) => ({
      key: trait.key,
      name: trait.name,
      effect: traitEffectWords(trait.effect, set),
      cost: trait.cost,
      excludes: [...trait.excludes].sort(compareByCodeUnit).map((key) => ({ key, name: nameIn(set.traits, key) })),
    })),
    attributes: descriptiveAttributes.map((attribute) => ({
      attribute,
      label: descriptiveAttributeLabels[attribute],
      maxLength: descriptiveAttributeMaxLength[attribute],
    })),
  };
}

/**
 * What the Traits `chosen` cost (`guildmasterTraitCost`, the engine's sum) and how much of the
 * budget is left, negative when they pass it (M9-S2): the form's running total.
 */
export function traitBudgetView(
  chosen: readonly TraitKey[],
  set: ContentSet = content,
  config: GameConfig = defaultConfig,
): { spent: number; left: number } {
  const spent = guildmasterTraitCost(chosen, set);
  return { spent, left: config.guildmasterTraitBudget - spent };
}
