// Readings (DL-241): what the player reads of a Hero, a Quest on the Board and a row of the
// Unattached pool or of a Roster, as structured rows of words and numbers with no layout, for the CLI
// to lay out as tables and the page as cards and chips. The page adds only what is its own: a
// Class's mark, the actions it offers and the Milestones. Words only; no rule: every number is a
// document field or an engine selector's answer, and every judgement the engine's.
//
// Each reading takes the player's reading (`playerReading`): the world, the rules and content it is
// read under, and what the player sees through, their Guild and its Guildmaster. The player sees what
// their Guildmaster sees and pays (R8): a Potential hint through the bands their Judgement reads, a
// fee at their Negotiation. Potential itself is never read (data-model rule 9): a Stat carries its
// hint, the word `potentialHint` gives, and no reading has a field that could hold the number.
// Regard is read as its band, never its number.

import {
  ageOf,
  bestParties,
  carriedGear,
  descriptiveAttributeLabels,
  durationDaysOf,
  fameRefusal,
  guildmasterOf,
  isDeadly,
  itemDefinition,
  judgedHintBands,
  moraleBand,
  partyPool,
  playerGuild,
  potentialHint,
  regardBand,
  regardValue,
  relationship,
  signingFee,
  signingRefusal,
  skillsThatHelp,
  statBreakdown,
  transferFee,
  unattachedHeroes,
  type BestParty,
  type BestParties,
  type ChanceBand,
  type EngineDeps,
  type FameBelowMinimum,
  type Guild,
  type GuildId,
  type Guildmaster,
  type Hero,
  type HeroId,
  type MoraleBand,
  type PartyId,
  type PatronId,
  type PotentialHint,
  type Quest,
  type QuestId,
  type RegardBand,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { gearSlotKeys, type ClassKey, type ContentSet, type ItemDefinitionKey, type Sex, type StatKey } from '@heroesim/engine/content';
import { modifierWords, traitEffectWords } from './effects.js';
import { capitalised, nameIn, rowOf } from './names.js';
import { encounterReadings, shownPercent, type EncounterReading } from './query.js';
import type { Calendar } from './calendar.js';

// ── The player's reading ─────────────────────────────────────────────────────────────────────

/**
 * What the player reads a world through: the world, the deps it plays under (its own rules and the
 * content), its calendar, the player's Guild and Guildmaster, and the Potential hint bands that
 * Guildmaster's Judgement reads. A front end opens one a document; nothing in it changes.
 */
export interface PlayerReading {
  readonly world: World;
  readonly deps: EngineDeps;
  readonly content: ContentSet;
  /** The rules' calendar, by which every date is read (DL-210). */
  readonly calendar: Calendar;
  /** The player's Guild; `undefined` in a save with none. */
  readonly guild: Guild | undefined;
  /** Its Guildmaster, whose Judgement reads the hints and whose Negotiation pays the fees (R8). */
  readonly guildmaster: Guildmaster | undefined;
  readonly hintBands: Readonly<Record<PotentialHint, number>>;
  /**
   * The Best Party of the player's pool for `quest` (`partyPool`: their free Heroes less those
   * `playerRestBand` keeps home, DL-286), and the estimate it was chosen by; `null`
   * when none meets the Quest's requirements, when the Guild may not take the Quest (`questClosed`,
   * DL-264), and with no player's Guild. Every question shares one Best Party module over the
   * reading's world, opened at the first (DL-237).
   */
  bestParty(quest: Quest): BestParty | null;
}

/** The player's reading of `document` under `deps`. */
export function playerReading(document: Pick<WorldDocument, 'world'>, deps: EngineDeps): PlayerReading {
  const { world } = document;
  const { content, config } = deps;
  const guild = playerGuild(world);
  const guildmaster = guild === undefined ? undefined : guildmasterOf(guild, world);
  let opened: { best: BestParties; available: Hero[] } | undefined;
  return {
    world,
    deps,
    content,
    calendar: config,
    guild,
    guildmaster,
    hintBands: judgedHintBands(guildmaster, content, config),
    bestParty(quest) {
      if (guild === undefined || fameRefusal(guild, quest, deps) !== null) return null;
      opened ??= { best: bestParties(world, guild, deps), available: partyPool(world, guild, deps) };
      return opened.best.party(quest, opened.available);
    },
  };
}

// ── A Hero as a row ──────────────────────────────────────────────────────────────────────────

/** A Hero as a row of a table, a Roster's or the pool's: who they are, at a glance. */
export interface HeroRow {
  id: HeroId;
  name: string;
  sex: Sex;
  /** Their Portrait's key; `null` for the Silhouette. */
  portraitKey: string | null;
  classKey: ClassKey;
  className: string;
  level: number;
  /** Their Age under the rules the world plays under. */
  age: number;
  morale: number;
  background: string;
}

function heroRow({ world, content, calendar }: PlayerReading, hero: Hero): HeroRow {
  return {
    id: hero.id,
    name: hero.name,
    sex: hero.sex,
    portraitKey: hero.portraitKey,
    classKey: hero.classKey,
    className: nameIn(content.classes, hero.classKey),
    level: hero.level,
    age: ageOf(hero, world.turn, calendar),
    morale: hero.morale,
    background: nameIn(content.backgrounds, hero.backgroundKey),
  };
}

/** A Hero on a Roster, with what the player's Guild would pay to take them from another's (`transferFee`). */
export interface RosterRowReading extends HeroRow {
  /** `null` on the player's own Roster, and with no player's Guild. */
  transferFee: number | null;
}

/** `guild`'s Roster in its own order, a Hero the world lacks left out. */
export function rosterReading(reading: PlayerReading, guild: Guild): RosterRowReading[] {
  const { world, deps, guildmaster } = reading;
  const theirs = reading.guild !== undefined && reading.guild.id !== guild.id;
  return guild.rosterIds.flatMap((id) => {
    const hero = rowOf(world.heroes, id);
    if (hero === undefined) return [];
    return [{ ...heroRow(reading, hero), transferFee: theirs ? transferFee(hero, guildmaster, deps) : null }];
  });
}

/** Whether a Hero would sign for the player's Guild (`signingRefusal`), and when not, the Fame they ask of it. */
export type Signs = { willSign: true } | { willSign: false; fameRequired: number };

/** `yes`, or `needs Fame 40`, as a sentence says it; a cell capitalises it (docs/agents/ui-text.md). */
export function signsWords(signs: Signs): string {
  return signs.willSign ? 'yes' : `needs Fame ${signs.fameRequired}`;
}

/** An Unattached Hero, with the signing fee the player's Guild would pay and whether they would sign for it. */
export interface PoolRowReading extends HeroRow {
  /** The signing fee at the player's Guildmaster's Negotiation, or the list price with no player's Guild. */
  fee: number;
  /** `null` with no player's Guild. */
  signs: Signs | null;
}

function signsOf({ guild, deps }: PlayerReading, hero: Hero): Signs | null {
  if (guild === undefined) return null;
  const refusal = signingRefusal(guild, hero, deps.config);
  return refusal === null ? { willSign: true } : { willSign: false, fameRequired: refusal.fameRequired };
}

/** The Unattached pool, in the engine's order (`unattachedHeroes`). */
export function poolReading(reading: PlayerReading): PoolRowReading[] {
  const { world, deps, guildmaster } = reading;
  return unattachedHeroes(world).map((hero) => ({ ...heroRow(reading, hero), fee: signingFee(hero, deps, guildmaster), signs: signsOf(reading, hero) }));
}

/** What the pool says of the player's Guild's Fame, which a Hero of a higher Level asks of it; `null` with no player's Guild. */
export function poolNote({ guild }: PlayerReading): string | null {
  return guild === undefined ? null : `${guild.name} has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`;
}

// ── A Hero ───────────────────────────────────────────────────────────────────────────────────

/** A Hero Stat: its base, the effective value a Check reads (`statBreakdown`), and its Potential hint. */
export interface StatReading {
  key: StatKey;
  name: string;
  /** Its area, `Physical`, as it stands alone. */
  area: string;
  base: number;
  value: number;
  outlook: PotentialHint;
}

/** A gear slot and what is in it (`carriedGear`); an Item held in a slot that is no gear slot follows them. */
export interface GearReading {
  slot: string;
  /** `null` for an empty slot. */
  item: { id: string; name: string; modifies: string; definitionKey: ItemDefinitionKey; unique: boolean } | null;
}

/** Another Hero on the Roster, the Hero's Regard for them and the Relationship between the two, as bands. */
export interface RelationshipReading {
  id: HeroId;
  name: string;
  classKey: ClassKey;
  className: string;
  regard: RegardBand;
  relationship: RegardBand;
}

export interface HeroReading extends HeroRow {
  xp: number;
  moraleBand: MoraleBand;
  /** The Guild they are of, by its id, and its name while the world holds it; `null` on no Roster. */
  guild: { id: GuildId; name: string | undefined } | null;
  /** In the Unattached pool, rather than gone from it. */
  unattached: boolean;
  /** Their Injury by name, and the Turn it heals on; `null` while they have none. */
  injury: { name: string; healsOnTurn: number } | null;
  /** Each Trait by name, with what its effects do in words. */
  traits: { name: string; effect: string }[];
  /** Their descriptive Attributes, Appearance and Biography, each a label and its words; one written empty is left out. */
  texts: { label: string; words: string }[];
  /** On another Guild's Roster: what the player's Guild would pay to take them (`transferFee`); `null` otherwise. */
  transferFee: number | null;
  /** In the Unattached pool, with a player's Guild: the signing fee it would pay and whether they would sign; `null` otherwise. */
  signing: { fee: number; signs: Signs } | null;
  partyId: PartyId | null;
  /** The Turns they died, retired and left the pool on; `null` for none. */
  died: number | null;
  retired: number | null;
  leftPool: number | null;
  stats: StatReading[];
  gear: GearReading[];
  /** Their Skills, in content's order, then any content does not define. */
  skills: { key: string; name: string; rating: number }[];
  /** Each other Hero on their Roster; `null` off a Roster. */
  relationships: RelationshipReading[] | null;
}

/** A Hero's descriptive Attributes, in the order a Guildmaster's are shown: no Birthplace. */
const heroAttributes = ['appearance', 'biography'] as const;

/** `hero` as the player reads them: their Attributes, State, Stats with their hints, gear, Skills and Relationships, and the fee to take them. */
export function heroReading(reading: PlayerReading, hero: Hero): HeroReading {
  const { world, deps, content, guildmaster } = reading;
  const guild = hero.guildId === null ? undefined : rowOf(world.guilds, hero.guildId);
  const onRoster = guild?.rosterIds.includes(hero.id) === true;
  const theirs = reading.guild !== undefined && guild !== undefined && guild.id !== reading.guild.id && onRoster;
  const signs = hero.unattachedSince === null ? null : signsOf(reading, hero);
  return {
    ...heroRow(reading, hero),
    xp: hero.xp,
    moraleBand: moraleBand(hero.morale, deps.config),
    guild: hero.guildId === null ? null : { id: hero.guildId, name: guild?.name },
    unattached: hero.unattachedSince !== null,
    injury: hero.injury === null ? null : { name: nameIn(content.injuries, hero.injury.typeKey), healsOnTurn: hero.injury.healsOnTurn },
    traits: heroTraits(content, hero),
    texts: heroAttributes.flatMap((attribute) => (hero[attribute] === '' ? [] : [{ label: descriptiveAttributeLabels[attribute], words: hero[attribute] }])),
    transferFee: theirs ? transferFee(hero, guildmaster, deps) : null,
    signing: signs === null ? null : { fee: signingFee(hero, deps, guildmaster), signs },
    partyId: hero.partyId,
    died: hero.diedOnTurn,
    retired: hero.retiredOnTurn,
    leftPool: hero.leftPoolOnTurn,
    stats: statsOf(reading, hero),
    gear: gearOf(reading, hero),
    skills: heroSkills(content, hero),
    relationships: onRoster ? relationshipsOf(reading, hero, guild) : null,
  };
}

/** Each Hero Stat in content's order: `statBreakdown`'s base and effective value, and the hint through the player's Guildmaster's bands. */
function statsOf({ world, content, hintBands }: PlayerReading, hero: Hero): StatReading[] {
  const breakdown = statBreakdown(hero, world, content);
  const bands = { potentialHintBands: hintBands };
  return Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat) => {
      const { base, effective } = rowOf(breakdown, stat.key) ?? { base: 0, effective: 0 };
      return { key: stat.key, name: stat.name, area: capitalised(stat.area), base, value: effective, outlook: potentialHint(hero, stat.key, bands) };
    });
}

/** Each gear slot (`gearSlotKeys`) and what is in it, then any Item held in a slot that is no gear slot. */
function gearOf({ world, content }: PlayerReading, hero: Hero): GearReading[] {
  const carried = carriedGear(world, hero.id).flatMap((row) => (row.holder.kind === 'hero' ? [{ row, slot: row.holder.slot }] : []));
  const read = (slot: string, row: (typeof carried)[number]['row']): GearReading => {
    const definition = itemDefinition(content, row.definitionKey);
    return {
      slot,
      item: {
        id: row.id,
        name: nameIn(content.items, row.definitionKey),
        modifies: definition?.kind === 'gear' ? modifierWords(definition, content) : '',
        definitionKey: row.definitionKey,
        unique: definition?.unique === true,
      },
    };
  };
  const slots: readonly string[] = gearSlotKeys;
  return [
    ...slots.flatMap((slot) => {
      const inSlot = carried.filter((each) => each.slot === slot);
      return inSlot.length === 0 ? [{ slot, item: null }] : inSlot.map((each) => read(slot, each.row));
    }),
    ...carried.filter((each) => !slots.includes(each.slot)).map((each) => read(each.slot, each.row)),
  ];
}

/** Each Trait `hero` holds, by name, with what its effects do in words: a Hero's reading's, and the page's Roster rows'. */
export function heroTraits(content: ContentSet, hero: Hero): HeroReading['traits'] {
  return hero.traits.map((key) => ({ name: nameIn(content.heroTraits, key), effect: traitEffectWords(rowOf(content.heroTraits, key)?.effects ?? [], content) }));
}

/** The Skills `hero` has, in content's order, then any content does not define, each with its rating: a Hero's reading's, and the page's Party rows'. */
export function heroSkills(content: ContentSet, hero: Hero): HeroReading['skills'] {
  const held = Object.keys(hero.skills);
  return [...Object.keys(content.skills).filter((key) => held.includes(key)), ...held.filter((key) => !Object.hasOwn(content.skills, key))].map((key) => ({
    key,
    name: nameIn(content.skills, key),
    rating: hero.skills[key] ?? 0,
  }));
}

/** Each other Hero on `guild`'s Roster, in its order: what the teamwork of a Party reads (DL-46). */
function relationshipsOf({ world, content, deps }: PlayerReading, hero: Hero, guild: Guild | undefined): RelationshipReading[] {
  return (guild?.rosterIds ?? []).flatMap((id) => {
    const mate = id === hero.id ? undefined : rowOf(world.heroes, id);
    if (mate === undefined) return [];
    return [
      {
        id: mate.id,
        name: mate.name,
        classKey: mate.classKey,
        className: nameIn(content.classes, mate.classKey),
        regard: regardBand(regardValue(hero.regard, mate.id), deps.config),
        relationship: regardBand(relationship(hero.id, mate.id, world, deps.config), deps.config),
      },
    ];
  });
}

// ── A Quest on the Board ─────────────────────────────────────────────────────────────────────

export interface QuestReading {
  id: QuestId;
  /** Its template's name. */
  name: string;
  patronId: PatronId;
  /** Its Patron's name; `undefined` for a Patron the world lacks. */
  patron: string | undefined;
  difficulty: number;
  days: number;
  reward: number;
  fame: number;
  /** The fewest Heroes it takes; none is the most (DL-257 item 6, DL-266). */
  partySizeMin: number;
  /** The Class and the Skill it requires beyond its Party size, by name; `null` for none. */
  classRequired: string | null;
  skillRequired: string | null;
  /** The last Turn it stays on offer. */
  expiresOnTurn: number;
  /** The Skills its Encounters' Checks read (`skillsThatHelp`, DL-70), by name. */
  skills: string[];
  /** Its Encounters, drawn when it was posted, in order: one or more (DL-248). */
  encounters: EncounterReading[];
  /** Whether it is Deadly: its Tier scales Death above 0 and one of its Encounters may kill (`isDeadly`, DL-265). No figure. */
  deadly: boolean;
  /** Its Tier, from 1 (DL-262): the card's and `show board`'s, after its name (DL-269). */
  tier: number;
  /**
   * Its narrative: its Beats' lines in the order it plays them, one for each of its Encounters, a
   * Finale's last (`Quest.beatLines`, DL-262). The Party builder's and the CLI's preview's (DL-269).
   */
  beats: string[];
}

/** A Quest's Tier as the Board names it: `Tier 3` (DL-257 item 1, DL-269). */
export function tierWords(tier: number): string {
  return `Tier ${tier}`;
}

/**
 * The Deadly mark and what it means, with no figure (DL-257 item 5, Q18 b, DL-269): the card shows the
 * mark, its title the meaning; the CLI says "Deadly: a Hero may die on this Quest."
 */
export const deadlyWords = { mark: 'Deadly', meaning: 'a Hero may die on this Quest' } as const;

/** The least Party a Quest takes, as the Party builder's checklist and the CLI's preview say it: `A Party of at least 2` (DL-266). */
export function partyFloorWords(partySizeMin: number): string {
  return `A Party of at least ${partySizeMin}`;
}

/** `quest` as the Board gives it: its terms, what it requires, the Skills that help and its Encounters (DL-148 item 16), its Tier, whether it is Deadly and its Beats' lines (DL-269). */
function questReading({ world, content, deps }: PlayerReading, quest: Quest): QuestReading {
  const { partySizeMin, classKey, skillKey } = quest.requirements;
  return {
    id: quest.id,
    name: nameIn(content.questTemplates, quest.templateKey),
    patronId: quest.patronId,
    patron: rowOf(world.patrons, quest.patronId)?.name,
    difficulty: quest.difficulty,
    days: durationDaysOf(quest),
    reward: quest.reward,
    fame: quest.fameEffect,
    partySizeMin,
    classRequired: classKey === undefined ? null : nameIn(content.classes, classKey),
    skillRequired: skillKey === undefined ? null : nameIn(content.skills, skillKey),
    expiresOnTurn: quest.expiresOnTurn,
    skills: skillsThatHelp(quest, content).map((key) => nameIn(content.skills, key)),
    encounters: encounterReadings(quest, content),
    deadly: isDeadly(quest, content, deps.config),
    tier: quest.tier,
    beats: [...quest.beatLines],
  };
}

/** The Quests on offer, in the Board's order. */
export function boardReading(reading: PlayerReading): QuestReading[] {
  const { world } = reading;
  return world.board.flatMap((id) => {
    const quest = rowOf(world.quests, id);
    return quest === undefined ? [] : [questReading(reading, quest)];
  });
}

/** The Best Party of the player's free Heroes for a Quest: who, by name in its order, and its chance if no one falls. */
export interface BestPartyReading {
  heroIds: HeroId[];
  names: string[];
  /** Its chance in a band and floored to 5% (`shownPercent`); `null` while the Quest's Encounters are drawn on the way. */
  chance: { band: ChanceBand; percent: number } | null;
}

/**
 * Why the player's Guild may not take `quest`, which offers it no Party: its Fame below the Fame
 * minimum of the Quest's Tier, as `dispatch` would refuse it (`fameRefusal`, DL-264); `null` when it
 * may, and with no player's Guild. The Board says it in the Best Party's place, in the refusals' words.
 */
export function questClosed(reading: PlayerReading, quest: Quest): FameBelowMinimum | null {
  return reading.guild === undefined ? null : fameRefusal(reading.guild, quest, reading.deps);
}

/** "Your best Party" for `quest` (`PlayerReading.bestParty`), its chance the estimate the rule chose it by; `null` for none. */
export function bestPartyReading(reading: PlayerReading, quest: Quest): BestPartyReading | null {
  const best = reading.bestParty(quest);
  if (best === null) return null;
  const { estimate } = best;
  return {
    heroIds: best.heroIds,
    names: best.heroIds.flatMap((id) => rowOf(reading.world.heroes, id)?.name ?? []),
    chance: estimate === null ? null : { band: estimate.chance, percent: shownPercent(estimate.success) },
  };
}
