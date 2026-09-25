// Regard (M4-S5, R9, R22, data-model §3.2 and rule 10, pre-M0 review B3, B5, DL-43): the opinion
// one entity holds of another, a `RegardEntry` in the holder's `regard` map, absent for neutral.
// One scale, `regardMin` to `regardMax`, and one set of named bands, `regardBands`, for every
// holder. A change, discrete or drift, emits its event only when it takes a value from one band
// into another, so the History is not flooded (rule 10).
//
// Two holders get their first writers here, both on Quest outcomes, for every Guild alike
// (ADR-0002):
//
// - **Patron Regard for a Guild**, keyed by the Guild's id: `patronRegardOnSuccess` (scaled by the
//   Guildmaster's Influence) or `patronRegardOnFailure` when the Guild's Party resolves one of the
//   Patron's Quests; `patronRegardOnExpiry` for every Guild in play when the Patron's offer
//   expires untaken, since each of them passed it over (DL-43). The Board weights Patrons by their
//   mean Regard across the Guilds in play (`patronBoardWeight`, R22), and the Patron State Engine
//   (phases/patron-state.ts) returns it toward neutral each night.
// - **Guildmaster Regard** (R9), keyed by the id of the Patron, Hero or Guildmaster it is for: for
//   the Patron whose Quest the Guild resolved, and for each Hero of the Party who came home to the
//   Roster. Regard for a Guild is a selector over Regard for its Guildmaster, never stored
//   (`guildmasterRegardForGuild`, rule 1); M6-S2 writes Regard between Guildmasters. No rule reads
//   Guildmaster Regard in the first build (pre-M0 review B3).

import { regardBandNames, type GameConfig, type RegardBand } from './config.js';
import type { ContentSet } from './content-types.js';
import {
  compareByCodeUnit,
  type EntityId,
  type Guild,
  type GuildId,
  type Guildmaster,
  type HeroId,
  type Patron,
  type PatronId,
  type RegardMap,
  type Turn,
  type World,
} from './document.js';
import type { Emit } from './emit.js';
import type { EngineEvent, GuildmasterRegardCause, PatronRegardCause } from './events.js';
import { guildmasterOf, influenceMultiplier } from './guildmaster.js';

/** What the Regard rules read of the config. */
export type RegardConfig = Pick<GameConfig, 'regardMin' | 'regardMax' | 'regardBands'>;

// ── The scale ────────────────────────────────────────────────────────────────────────────────

/** The value `map` holds for `id`: 0, neutral, when it holds none (data-model §3.2). */
export function regardValue(map: Readonly<RegardMap>, id: EntityId): number {
  return Object.hasOwn(map, id) ? (map[id]?.value ?? 0) : 0;
}

/**
 * The band `value` falls in: the highest of `regardBands` whose start it has reached, and the
 * lowest band for a value below every start. A selector, for the rules and the front ends alike.
 */
export function regardBand(value: number, config: Pick<GameConfig, 'regardBands'>): RegardBand {
  let band: RegardBand = regardBandNames[0];
  for (const name of regardBandNames) {
    if (value >= config.regardBands[name]) band = name;
  }
  return band;
}

/** The scale's reach from neutral: the larger of `regardMax` and −`regardMin`. */
export function regardReach(config: Pick<GameConfig, 'regardMin' | 'regardMax'>): number {
  return Math.max(config.regardMax, -config.regardMin);
}

/** A Regard value moved: from `before` to `after`, and their bands. */
export interface RegardChange {
  before: number;
  after: number;
  bandBefore: RegardBand;
  bandAfter: RegardBand;
}

function changeOf(before: number, after: number, config: RegardConfig): RegardChange {
  return { before, after, bandBefore: regardBand(before, config), bandAfter: regardBand(after, config) };
}

/**
 * Adds `delta` to the Regard `map` holds for `id`, held inside `regardMin` to `regardMax`, and
 * records the change's Turn and `reason`, an event type (data-model §3.2). An absent entry starts
 * from neutral. Returns the change, which a caller emits only when its band moved.
 */
export function adjustRegard(
  map: RegardMap,
  id: EntityId,
  delta: number,
  turn: Turn,
  reason: string,
  config: RegardConfig,
): RegardChange {
  const before = regardValue(map, id);
  const after = Math.min(config.regardMax, Math.max(config.regardMin, before + delta));
  map[id] = { value: after, since: turn, reason };
  return changeOf(before, after, config);
}

/**
 * Moves the Regard `map` holds for `id` toward neutral by `step`, stopping there: a drift, which
 * leaves `since` and `reason` as the last discrete change set them. An entry that reaches neutral
 * is removed, since absence means neutral. Returns the change, which a caller emits only when its
 * band moved (rule 10).
 */
export function recoverRegard(map: RegardMap, id: EntityId, step: number, config: RegardConfig): RegardChange {
  const entry = Object.hasOwn(map, id) ? map[id] : undefined;
  const before = entry?.value ?? 0;
  const after = before > 0 ? Math.max(0, before - step) : Math.min(0, before + step);
  if (entry !== undefined) {
    if (after === 0) delete map[id];
    else entry.value = after;
  }
  return changeOf(before, after, config);
}

/** Whether `change` took its value from one band into another: when a Regard event is due. */
export function crossedBand(change: RegardChange): boolean {
  return change.bandBefore !== change.bandAfter;
}

/**
 * How many of the entries `map` holds fall in each band, every band listed. What `show
 * guildmaster` summarises and the M4 harness reports for the player's Guildmaster at year 10.
 */
export function regardBandCounts(map: Readonly<RegardMap>, config: Pick<GameConfig, 'regardBands'>): Record<RegardBand, number> {
  const counts = Object.fromEntries(regardBandNames.map((band) => [band, 0])) as Record<RegardBand, number>;
  for (const entry of Object.values(map)) counts[regardBand(entry.value, config)] += 1;
  return counts;
}

// ── Patron Regard for a Guild ────────────────────────────────────────────────────────────────

/** `patron`'s Regard for the Guild `guildId`: 0, neutral, when it holds none. */
export function patronRegardFor(patron: Pick<Patron, 'regard'>, guildId: GuildId): number {
  return regardValue(patron.regard, guildId);
}

/** The Guilds in play, in id order: every Guild that has not folded. */
function guildsInPlay(world: Pick<World, 'guilds'>): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => guild.foldedOnTurn === null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/** `patron`'s mean Regard across the Guilds in play; 0 when none is. */
export function meanPatronRegard(patron: Pick<Patron, 'regard'>, world: Pick<World, 'guilds'>): number {
  const guilds = guildsInPlay(world);
  if (guilds.length === 0) return 0;
  return guilds.reduce((total, guild) => total + patronRegardFor(patron, guild.id), 0) / guilds.length;
}

/**
 * How heavily the Board's refresh draws `patron` (R22, closing DL-25's uniform draw): 1 plus
 * `boardRegardWeight` times the Patron's mean Regard across the Guilds in play, as a share of the
 * scale's reach on its side, never below 0. Every Board serves every Guild, so the Patron's
 * standing with all of them, not one, decides how often they post (DL-43). 1 for a Patron at
 * neutral with everyone.
 */
export function patronBoardWeight(
  patron: Pick<Patron, 'regard'>,
  world: Pick<World, 'guilds'>,
  config: Pick<GameConfig, 'regardMin' | 'regardMax' | 'boardRegardWeight'>,
): number {
  const mean = meanPatronRegard(patron, world);
  const side = mean >= 0 ? config.regardMax : -config.regardMin;
  const share = side > 0 ? mean / side : 0;
  return Math.max(0, 1 + config.boardRegardWeight * share);
}

// ── Guildmaster Regard ───────────────────────────────────────────────────────────────────────

/**
 * `guildmaster`'s Regard for the Guild `guildId`: their Regard for its Guildmaster, never stored
 * (M4-S5, rule 1). 0, neutral, for a Guild the world lacks.
 */
export function guildmasterRegardForGuild(
  guildmaster: Pick<Guildmaster, 'regard'>,
  guildId: GuildId,
  world: Pick<World, 'guilds'>,
): number {
  const guild = Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
  return guild === undefined ? 0 : regardValue(guildmaster.regard, guild.guildmasterId);
}

// ── The writers ──────────────────────────────────────────────────────────────────────────────

/** What a writer is given beside the world: a phase's context, or as much of it as it reads. */
export interface RegardContext {
  config: GameConfig;
  content: Pick<ContentSet, 'stats' | 'traits'>;
  turn: Turn;
  emit: Emit;
}

/** A Quest's resolution, as the Regard writers read it. */
export interface ResolvedForRegard {
  patronId: PatronId;
  guild: Guild;
  /** The Heroes of the Party who came home to the Roster, in Party order. */
  heroIds: readonly HeroId[];
  /** Whether the Quest succeeded: any band but `fail`. */
  succeeded: boolean;
}

/**
 * The Regard a resolved Quest moves (M4-S5), in this order: the Patron's Regard for the Guild, by
 * `patronRegardOnSuccess` times the Guildmaster's Influence (`influenceMultiplier`) or by
 * `patronRegardOnFailure`, unscaled; then the Guildmaster's Regard for the Patron, by
 * `guildmasterRegardOnPatronSuccess` or `…Failure`; then their Regard for each Hero of the Party
 * who came home to the Roster, by `guildmasterRegardOnHeroSuccess` or `…Failure`. Emits
 * `patron.regard-changed` and `guildmaster.regard-changed` only for a change that crosses a band.
 * `questsConclude` calls it for every Guild's Party alike (ADR-0002). A Patron the world lacks
 * holds nothing; a Guild whose Guildmaster has no row writes no Guildmaster Regard.
 */
export function regardOnQuestResolved(world: World, ctx: RegardContext, resolved: ResolvedForRegard): EngineEvent[] {
  const { config, content, turn } = ctx;
  const { patronId, guild, heroIds, succeeded } = resolved;
  const events: EngineEvent[] = [];
  const cause: PatronRegardCause & GuildmasterRegardCause = succeeded ? 'quest-success' : 'quest-failure';
  const guildmaster = guildmasterOf(guild, world);

  const patron = Object.hasOwn(world.patrons, patronId) ? world.patrons[patronId] : undefined;
  if (patron !== undefined) {
    const delta = succeeded
      ? config.patronRegardOnSuccess * influenceMultiplier(guildmaster, content, config)
      : config.patronRegardOnFailure;
    const change = adjustRegard(patron.regard, guild.id, delta, turn, 'quest.resolved', config);
    events.push(...patronRegardChanged(ctx, patronId, guild.id, cause, change));
  }

  if (guildmaster !== undefined) {
    const onPatron = succeeded ? config.guildmasterRegardOnPatronSuccess : config.guildmasterRegardOnPatronFailure;
    events.push(...guildmasterRegard(ctx, guildmaster, patronId, onPatron, cause));
    const onHero = succeeded ? config.guildmasterRegardOnHeroSuccess : config.guildmasterRegardOnHeroFailure;
    for (const heroId of heroIds) events.push(...guildmasterRegard(ctx, guildmaster, heroId, onHero, cause));
  }
  return events;
}

/**
 * An offer of `patronId`'s expired untaken (M4-S5): the Patron's Regard for every Guild in play,
 * in Guild id order, moves by `patronRegardOnExpiry`. No Guild took it, so each of them passed it
 * over and each is held to it alike; a folded Guild is out of play and is not (DL-43). The Board's
 * refresh calls it for each Quest it expires.
 */
export function regardOnOfferExpired(world: World, ctx: RegardContext, patronId: PatronId): EngineEvent[] {
  const patron = Object.hasOwn(world.patrons, patronId) ? world.patrons[patronId] : undefined;
  if (patron === undefined || ctx.config.patronRegardOnExpiry === 0) return [];
  const events: EngineEvent[] = [];
  for (const guild of guildsInPlay(world)) {
    const change = adjustRegard(patron.regard, guild.id, ctx.config.patronRegardOnExpiry, ctx.turn, 'quest.expired', ctx.config);
    events.push(...patronRegardChanged(ctx, patronId, guild.id, 'offer-expired', change));
  }
  return events;
}

/** `patron.regard-changed` for `change`, when it crossed a band; nothing otherwise. */
export function patronRegardChanged(
  ctx: Pick<RegardContext, 'emit'>,
  patronId: PatronId,
  guildId: GuildId,
  cause: PatronRegardCause,
  change: RegardChange,
): EngineEvent[] {
  if (!crossedBand(change)) return [];
  return [ctx.emit({ type: 'patron.regard-changed', participants: [patronId, guildId], payload: { patronId, guildId, cause, ...change } })];
}

/** Moves `guildmaster`'s Regard for `entityId` by `delta`; `guildmaster.regard-changed` on a band crossing. */
function guildmasterRegard(
  ctx: RegardContext,
  guildmaster: Guildmaster,
  entityId: EntityId,
  delta: number,
  cause: GuildmasterRegardCause,
): EngineEvent[] {
  const change = adjustRegard(guildmaster.regard, entityId, delta, ctx.turn, 'quest.resolved', ctx.config);
  if (!crossedBand(change)) return [];
  const { id: guildmasterId, guildId } = guildmaster;
  return [
    ctx.emit({
      type: 'guildmaster.regard-changed',
      participants: [guildmasterId, entityId, guildId],
      payload: { guildmasterId, guildId, entityId, cause, ...change },
    }),
  ];
}
