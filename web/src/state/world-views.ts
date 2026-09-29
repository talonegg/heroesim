// The views of the wider world (M7-S3 part 2, DL-73): every Guild, the Rankings, another Guild's
// page (its Roster with the Transfer fee the player's Guild would pay, its Hall, its Guildmaster),
// a Hall, a Guildmaster and the Patrons. The History, and anyone in it found by name, are
// `history.ts`'s (M9-S5).
// The CLI's `show guilds`, `show rankings`, `show roster <guildId>`, `show hall`, `show guildmaster`
// and `show patrons`, in its words (`cli/src/render.ts`), less the ids a command line takes.
//
// Nothing here computes a rule (ADR-0007, principle 12): every number is a document field or an
// engine selector's answer (`rankingPlaces`, `upkeep`, `nextImprovement`, `transferFee`, `ageOf`,
// `baseStat`, `regardBand` over `regardValue`, `patronRegardFor` and `guildmasterRegardForGuild`).
// Regard is shown as its band, never its number (M4-S5); Potential not at all.

import {
  ageOf,
  baseStat,
  dayOf,
  facilityKeys,
  guildmasterOf,
  guildmasterRegardForGuild,
  nextImprovement,
  patronRegardFor,
  playerGuild,
  rankingPlaces,
  regardBand,
  regardValue,
  transferFee,
  upkeep,
  type FacilityKey,
  type Guild,
  type GuildId,
  type GuildmasterId,
  type HeroId,
  type RankingMeasure,
  type RegardBand,
  type TraitEffect,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { capitalised, controllerWords, nameIn, placeWords, rowOf, signed } from './names';
import { playDeps } from './reducer';
import { facilityNames } from './rejections';

/** The Guild named, or the player's when none is. */
function guildOf(document: WorldDocument, guildId: GuildId | undefined): Guild | undefined {
  return guildId === undefined ? playerGuild(document.world) : rowOf(document.world.guilds, guildId);
}

// ── Every Guild ──────────────────────────────────────────────────────────────────────────────

export interface GuildRow {
  guildId: GuildId;
  name: string;
  /** The player's own Guild. */
  mine: boolean;
  /** `Yours`, or `Rival (steady)`: who makes its choices. */
  controller: string;
  guildmaster: string;
  background: string;
  /** How many Heroes are on its Roster. */
  roster: number;
  wealth: number;
  fame: number;
  /** Its Upkeep, the engine's `upkeep`. */
  upkeep: number;
  /** `folded on Day 12`, or `null` for a Guild in play (DL-28, DL-33). */
  folded: string | null;
}

/** `show guilds`: every Guild in the world's order, a folded one marked with the Day it folded. */
export function guildsView(document: WorldDocument): GuildRow[] {
  const { world } = document;
  const { config } = playDeps(document);
  return Object.values(world.guilds).map((guild) => ({
    guildId: guild.id,
    name: guild.name,
    mine: guild.controller.kind === 'player',
    controller: controllerWords(guild),
    guildmaster: guildmasterOf(guild, world)?.name ?? 'none',
    background: nameIn(content.backgrounds, guild.backgroundKey),
    roster: guild.rosterIds.length,
    wealth: guild.wealth,
    fame: guild.fame,
    upkeep: upkeep(guild, world, config, content),
    folded: guild.foldedOnTurn === null ? null : `folded on Day ${dayOf(guild.foldedOnTurn)}`,
  }));
}

// ── The Rankings ─────────────────────────────────────────────────────────────────────────────

export interface RankingRow {
  /** `1st`, or `joint 2nd` for a place Guilds share: the engine's `rankingPlaces` in words (DL-95). */
  place: string;
  guildId: GuildId;
  name: string;
  controller: string;
  /** The Guild's Fame or Wealth, whichever it is ranked by. */
  value: number;
  mine: boolean;
}

/**
 * `show rankings --by <fame|wealth>`: the Guilds in play in the engine's order (R10), each at its
 * place, Guilds level on the measure sharing one (`rankingPlaces`, DL-95); a folded one is not ranked.
 */
export function rankingsView(document: WorldDocument, by: RankingMeasure): RankingRow[] {
  const { world } = document;
  return rankingPlaces(world, by).map((ranking) => {
    const guild = rowOf(world.guilds, ranking.guildId);
    return {
      place: placeWords(ranking),
      guildId: ranking.guildId,
      name: guild?.name ?? 'a Guild',
      controller: guild === undefined ? '' : controllerWords(guild),
      value: ranking.value,
      mine: guild?.controller.kind === 'player',
    };
  });
}

// ── A Hall ───────────────────────────────────────────────────────────────────────────────────

/** What each facility does, in the CLI's words (`show hall`), after its name. */
const facilityDoes: Readonly<Record<FacilityKey, string>> = Object.freeze({
  infirmary: 'shortens the Days an Injury takes to heal',
  trainingYard: 'gives every Hero on the Roster who is home and unhurt XP each night',
  quarters: 'raise the Morale the Roster settles toward',
});

export interface HallRow {
  facility: FacilityKey;
  /** `Training yard`. */
  name: string;
  grade: number;
  /** The Improvement built at its grade, or `none`. */
  built: string;
  /** `The training yard gives …`. */
  does: string;
  /** The next grade's Improvement and cost (`nextImprovement`), or `null` at the top grade. */
  next: { name: string; cost: number } | null;
}

export interface HallView {
  guildId: GuildId;
  guildName: string;
  /** The player's own Hall, where `build` can raise a grade. */
  mine: boolean;
  facilities: HallRow[];
  /** `120 Wealth every 10 Days`: the Guild's Upkeep (`upkeep`), which each grade adds to. */
  upkeep: string;
}

/** `show hall [guildId]`: the Hall of the Guild named, or of the player's; `null` for a Guild the world lacks. */
export function hallView(document: WorldDocument, guildId?: GuildId): HallView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const { world } = document;
  const { config } = playDeps(document);
  const builtAt = (facility: FacilityKey, grade: number): string =>
    Object.values(content.improvements).find((row) => row.facility === facility && row.grade === grade)?.name ?? 'none';
  return {
    guildId: guild.id,
    guildName: guild.name,
    mine: guild.controller.kind === 'player',
    facilities: facilityKeys.map((facility) => {
      const grade = guild.hall[facility];
      const next = nextImprovement(guild, facility, content);
      return {
        facility,
        name: capitalised(facilityNames[facility]),
        grade,
        built: grade === 0 ? 'none' : builtAt(facility, grade),
        does: `The ${facilityNames[facility]} ${facilityDoes[facility]}.`,
        next: next === null ? null : { name: next.name, cost: next.cost },
      };
    }),
    upkeep: `${upkeep(guild, world, config, content)} Wealth every ${config.upkeepEveryDays} Days`,
  };
}

// ── A Guildmaster ────────────────────────────────────────────────────────────────────────────

/** What each Guildmaster Stat's rule bears on (R8, M4-S5), by the Stat's content key: the CLI's words. */
const bearsOn: Readonly<Record<string, string>> = Object.freeze({
  negotiation: 'the reward agreed and the fees paid',
  inspiration: 'the Morale baseline of the Heroes',
  coaching: 'the XP of the training yard',
  influence: "the Regard a Patron's Quest earns",
  judgement: 'how sharp the Potential hints read',
});

/** A Guildmaster Trait's effect in words (the CLI's `traitEffectWords`): `+1 Weaponry to Warriors`, `Upkeep ×0.9`. */
function traitEffectWords(effect: TraitEffect | null): string {
  if (effect === null) return 'no effect';
  switch (effect.kind) {
    case 'classStatBonus':
      return `${signed(effect.delta)} ${nameIn(content.stats, effect.statKey)} to ${nameIn(content.classes, effect.classKey)}s`;
    case 'guildMoraleShift':
      return `Morale baseline ${signed(effect.delta)}`;
    case 'upkeepFactor':
      return `Upkeep ×${effect.factor}`;
  }
}

/** One entity a Guildmaster holds a Regard for: its name, a detail (a Sphere, a Class, a Guildmaster) and the band. */
export interface RegardRow {
  name: string;
  detail: string;
  regard: RegardBand;
}

export interface GuildmasterView {
  /** Whose History a Guildmaster's page opens (M9-S5). */
  guildmasterId: GuildmasterId;
  name: string;
  guildName: string;
  attributes: [label: string, value: string][];
  stats: { name: string; value: number; bearsOn: string }[];
  traits: { name: string; effect: string }[];
  patrons: RegardRow[];
  /** Each Hero on the Guild's Roster. */
  heroes: RegardRow[];
  /** Each other Guild in play, through its Guildmaster (`guildmasterRegardForGuild`). */
  guilds: RegardRow[];
}

/**
 * `show guildmaster [guildId]` (M4-S5, R8, R9): the Guildmaster of the Guild named, or of the
 * player's; `null` for a Guild the world lacks or one with no Guildmaster.
 */
export function guildmasterView(document: WorldDocument, guildId?: GuildId): GuildmasterView | null {
  const guild = guildOf(document, guildId);
  if (guild === undefined) return null;
  const { world } = document;
  const { config } = playDeps(document);
  const guildmaster = guildmasterOf(guild, world);
  if (guildmaster === undefined) return null;
  const band = (value: number): RegardBand => regardBand(value, config);

  return {
    guildmasterId: guildmaster.id,
    name: guildmaster.name,
    guildName: guild.name,
    attributes: [
      ['Sex', guildmaster.sex],
      ['Age', String(ageOf(guildmaster, world.turn, config))],
    ],
    stats: Object.values(content.stats)
      .filter((stat) => stat.owner === 'guildmaster')
      .map((stat) => ({ name: stat.name, value: baseStat(guildmaster.stats, stat), bearsOn: bearsOn[stat.key] ?? '' })),
    traits: guildmaster.traits.map((key) => ({
      name: nameIn(content.traits, key),
      effect: traitEffectWords(rowOf(content.traits, key)?.effect ?? null),
    })),
    patrons: Object.values(world.patrons).map((patron) => ({
      name: patron.name,
      detail: nameIn(content.spheres, patron.sphereKey),
      regard: band(regardValue(guildmaster.regard, patron.id)),
    })),
    heroes: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [{ name: hero.name, detail: nameIn(content.classes, hero.classKey), regard: band(regardValue(guildmaster.regard, hero.id)) }];
    }),
    guilds: Object.values(world.guilds)
      .filter((other) => other.id !== guild.id && other.foldedOnTurn === null)
      .map((other) => ({
        name: other.name,
        detail: guildmasterOf(other, world)?.name ?? 'no Guildmaster',
        regard: band(guildmasterRegardForGuild(guildmaster, other.id, world)),
      })),
  };
}

// ── The Patrons ──────────────────────────────────────────────────────────────────────────────

export interface PatronRow {
  patronId: string;
  name: string;
  sphere: string;
  /** Their Regard for the player's Guild, as a band; `null` in a save with no player's Guild. */
  regard: RegardBand | null;
}

/** `show patrons`: each Patron, their Sphere and their Regard for the player's Guild (M4-S5). */
export function patronsView(document: WorldDocument): PatronRow[] {
  const { world } = document;
  const { config } = playDeps(document);
  const guild = playerGuild(world);
  return Object.values(world.patrons).map((patron) => ({
    patronId: patron.id,
    name: patron.name,
    sphere: nameIn(content.spheres, patron.sphereKey),
    regard: guild === undefined ? null : regardBand(patronRegardFor(patron, guild.id), config),
  }));
}

// ── Another Guild ────────────────────────────────────────────────────────────────────────────

export interface OtherRosterRow {
  heroId: HeroId;
  name: string;
  className: string;
  level: number;
  age: number;
  morale: number;
  background: string;
  /** What the player's Guild would pay to take them in (`transferFee`); `null` with no player's Guild. */
  fee: number | null;
}

export interface GuildPageView {
  guildId: GuildId;
  name: string;
  controller: string;
  folded: string | null;
  roster: OtherRosterRow[];
  hall: HallView;
  guildmaster: GuildmasterView | null;
}

/**
 * Another Guild's page: `show roster <guildId>` with each Hero's Transfer fee at the player's
 * Guildmaster's Negotiation (M6-S2), shown before it is paid, and its Hall and Guildmaster.
 */
export function guildPage(document: WorldDocument, guildId: GuildId): GuildPageView | null {
  const { world } = document;
  const guild = rowOf(world.guilds, guildId);
  const hall = hallView(document, guildId);
  if (guild === undefined || hall === null) return null;
  const deps = playDeps(document);
  const player = playerGuild(world);
  const buyer = player === undefined ? undefined : guildmasterOf(player, world);
  return {
    guildId: guild.id,
    name: guild.name,
    controller: controllerWords(guild),
    folded: guild.foldedOnTurn === null ? null : `folded on Day ${dayOf(guild.foldedOnTurn)}`,
    roster: guild.rosterIds.flatMap((heroId) => {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) return [];
      return [
        {
          heroId,
          name: hero.name,
          className: nameIn(content.classes, hero.classKey),
          level: hero.level,
          age: ageOf(hero, world.turn, deps.config),
          morale: hero.morale,
          background: nameIn(content.backgrounds, hero.backgroundKey),
          fee: player === undefined || player.id === guild.id ? null : transferFee(hero, buyer, deps),
        },
      ];
    }),
    hall,
    guildmaster: guildmasterView(document, guildId),
  };
}
