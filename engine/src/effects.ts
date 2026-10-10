// A module's effects on the core's tables (M8-S2, ADR-0005 as amended 2026-09-25, DL-77): the only
// way a module changes a Hero, a Guild, a Regard or the Board. Each effect is a typed record, as an
// action is, and runs the core's own rule for the change and emits the core's own event for it, so
// the core stays the only writer of its rows and every change is explained the way the core
// explains its own:
//
//   adjustMorale  `changeMorale` (morale.ts), `hero.morale-changed` always
//   adjustWealth  the Guild's Wealth, `guild.wealth-changed` always
//   adjustRegard  `adjustRegard` (regard.ts) for a Patron, a Guildmaster or a Hero, and the holder's
//                 `*.regard-changed` only on a band crossing (data-model rule 10)
//   injure        `inflictInjury` with the infirmary's `healFactor` (injuries.ts), `hero.injured`
//   offerQuest    the Quest Generator (`generateQuest`) from the module's own stream, `quest.offered`
//
// Each event names the module (`moduleId`) and, where the event has a cause, has the cause `module`.
// An effect refuses a change its rule does not allow, as an action does (epics README §4), with a
// typed rejection and nothing changed; it throws on a programming error, such as an id the world
// does not hold. The union is meant to stay small: a real module adds what it needs, with a DL.

import type { GameConfig } from './config.js';
import type { ContentSet, InjuryTypeKey, QuestTemplateKey } from './content-types.js';
import {
  parseId,
  requireRow,
  rowOf,
  type EntityId,
  type GuildId,
  type GuildmasterId,
  type HeroId,
  type ModuleId,
  type PatronId,
  type Turn,
  type World,
} from './document.js';
import type { Emit } from './emit.js';
import type { EngineEvent } from './events.js';
import { generateQuest } from './generators/quests.js';
import { heroRegardChanged } from './hero-regard.js';
import { healDays, inflictInjury } from './injuries.js';
import { changeMorale } from './morale.js';
import { adjustRegard, guildmasterRegard, patronRegardChanged } from './regard.js';
import type { StreamName } from './rng.js';
import { healFactor } from './selectors.js';
import { writeOnce } from './world-copy.js';

// ── The effects ──────────────────────────────────────────────────────────────────────────────

/** Adds `delta`, a whole number, to a Hero's Morale, held inside the scale as every change is. */
export interface AdjustMorale {
  kind: 'adjustMorale';
  heroId: HeroId;
  delta: number;
}

/** Adds `delta`, a whole number, to a Guild's Wealth, which may go below 0 as Upkeep may take it. */
export interface AdjustWealth {
  kind: 'adjustWealth';
  guildId: GuildId;
  delta: number;
}

/**
 * Adds `delta` to the Regard `holderId` holds for `entityId`, held inside the scale, as the core's
 * holders hold it: a Patron for a Guild; a Guildmaster for a Patron, a Hero or another Guildmaster
 * (Regard for a Guild is read from its Guildmaster's, never stored); a Hero for another Hero.
 */
export interface AdjustRegard {
  kind: 'adjustRegard';
  holderId: PatronId | GuildmasterId | HeroId;
  entityId: EntityId;
  delta: number;
}

/**
 * Injures a Hero with the Injury type `typeKey` for `days` Days, a whole number from 1, before the
 * infirmary of the Hero's Guild shortens them as it shortens a Quest's Injury (`healFactor`).
 */
export interface Injure {
  kind: 'injure';
  heroId: HeroId;
  typeKey: InjuryTypeKey;
  days: number;
}

/**
 * Puts a Quest of `patronId`'s on the end of the Board, of `templateKey` or of a template drawn from
 * the Patron's, generated as the Board's refresh generates one but drawn from the module's own
 * stream, so no core stream moves. It may take the Board past its size (`boardSizeAt`), which only
 * says how far the morning's refresh fills it.
 */
export interface OfferQuest {
  kind: 'offerQuest';
  patronId: PatronId;
  templateKey?: QuestTemplateKey;
}

/** Every effect a module may apply, told apart by `kind`: the union a real module adds to. */
export type ModuleEffect = AdjustMorale | AdjustWealth | AdjustRegard | Injure | OfferQuest;

export type ModuleEffectKind = ModuleEffect['kind'];

/** Every effect's kind, in the order this file lists them. */
export const moduleEffectKinds = Object.freeze([
  'adjustMorale',
  'adjustWealth',
  'adjustRegard',
  'injure',
  'offerQuest',
] as const satisfies readonly ModuleEffectKind[]);

/**
 * Why an effect was refused, having changed nothing: the effect's `kind` and a kebab-case `reason`.
 * A Hero dead, retired or gone from the pool is `hero-gone`; a Hero away in a Party, `hero-away`;
 * one already carrying an Injury, `hero-injured`; a folded Guild, `guild-folded`; a Hero out of play,
 * a retired Guildmaster (v1.1.6-S17, DL-203) or the Guildmaster of a folded Guild holding Regard,
 * `holder-gone`.
 */
export type EffectRejection =
  | { effect: 'adjustMorale'; reason: 'hero-gone' }
  | { effect: 'adjustWealth'; reason: 'guild-folded' }
  | { effect: 'adjustRegard'; reason: 'holder-gone' }
  | { effect: 'injure'; reason: 'hero-gone' | 'hero-away' | 'hero-injured' };

/**
 * An effect's outcome: applied, with the effect and the core's events that explain it, which the
 * hook returns among its events; or refused.
 */
export type EffectResult = { ok: true; effect: ModuleEffect; events: EngineEvent[] } | { ok: false; rejection: EffectRejection };

/**
 * The effects API a hook is given as `ctx.effects`: one function a kind, taking the effect's fields
 * without its `kind`. A kind added to `ModuleEffect` adds its function here.
 */
export type ModuleEffects = {
  readonly [Kind in ModuleEffectKind]: (effect: Omit<Extract<ModuleEffect, { kind: Kind }>, 'kind'>) => EffectResult;
};

/** The functions of `ModuleEffects`, each applying its kind of effect through `apply`. */
export function effectsApi(apply: (effect: ModuleEffect) => EffectResult): ModuleEffects {
  const api = Object.fromEntries(
    moduleEffectKinds.map((kind) => [kind, (fields: object) => apply({ ...fields, kind } as ModuleEffect)]),
  );
  return Object.freeze(api) as ModuleEffects;
}

// ── Applying one ─────────────────────────────────────────────────────────────────────────────

/** What an effect is applied with: the module applying it and the Turn's rules, clock and `emit`. */
export interface EffectContext {
  moduleId: ModuleId;
  /** The module's own stream, which `offerQuest` draws from; `undefined` when it registered none. */
  streamName: string | undefined;
  config: GameConfig;
  content: ContentSet;
  turn: Turn;
  /** The core's `emit` on the Turn's world. */
  emit: Emit;
}

/**
 * Applies `effect` to `world`, the Turn's copy, for the module `ctx.moduleId` (see this file's
 * head). Throws on a programming error: an id the world does not hold or of the wrong table, a
 * `delta` or `days` that is not a number the effect takes, an Injury type content lacks, a Patron
 * with no template for the key given, or an `offerQuest` from a module with no stream.
 */
export function applyEffect(world: World, effect: ModuleEffect, ctx: EffectContext): EffectResult {
  switch (effect.kind) {
    case 'adjustMorale':
      return applyMorale(world, effect, ctx);
    case 'adjustWealth':
      return applyWealth(world, effect, ctx);
    case 'adjustRegard':
      return applyRegard(world, effect, ctx);
    case 'injure':
      return applyInjury(world, effect, ctx);
    case 'offerQuest':
      return applyOfferQuest(world, effect, ctx);
  }
}

function applyMorale(world: World, effect: AdjustMorale, ctx: EffectContext): EffectResult {
  checkWhole(effect.delta, effect.kind, 'delta');
  const hero = requireRow(world.heroes, effect.heroId, 'heroes');
  if (outOfPlay(hero)) return { ok: false, rejection: { effect: effect.kind, reason: 'hero-gone' } };
  return applied(effect, [changeMorale(hero, effect.delta, 'module', ctx.config, ctx.emit)], ctx);
}

function applyWealth(world: World, effect: AdjustWealth, ctx: EffectContext): EffectResult {
  checkWhole(effect.delta, effect.kind, 'delta');
  const guild = requireRow(world.guilds, effect.guildId, 'guilds');
  if (guild.foldedOnTurn !== null) return { ok: false, rejection: { effect: effect.kind, reason: 'guild-folded' } };
  const before = guild.wealth;
  guild.wealth = before + effect.delta;
  const payload = { guildId: guild.id, moduleId: ctx.moduleId, before, after: guild.wealth };
  return applied(effect, [ctx.emit({ type: 'guild.wealth-changed', participants: [guild.id], payload })], ctx);
}

function applyRegard(world: World, effect: AdjustRegard, ctx: EffectContext): EffectResult {
  const { holderId, entityId, delta } = effect;
  if (!Number.isFinite(delta)) throw new RangeError(`adjustRegard's delta is a finite number; got ${delta}`);
  const entity = parseId(entityId);
  if (entity === null || !Object.hasOwn(world[entity.table], entityId)) throw new RangeError(`${entityId} is not in the world`);
  if (holderId === entityId) throw new RangeError(`${holderId} holds no Regard for itself`);
  const holder = parseId(holderId);
  const refused: EffectResult = { ok: false, rejection: { effect: effect.kind, reason: 'holder-gone' } };
  const { config, turn, moduleId } = ctx;
  switch (holder?.table) {
    case 'patrons': {
      const patron = requireRow(world.patrons, holderId as PatronId, 'patrons');
      if (entity.table !== 'guilds') throw new RangeError(`A Patron holds Regard for Guilds, not ${entityId}`);
      const change = adjustRegard(patron.regard, entityId, delta, turn, moduleId, config);
      return applied(effect, patronRegardChanged(ctx, patron.id, entityId as GuildId, 'module', change), ctx);
    }
    case 'guildmasters': {
      const guildmaster = requireRow(world.guildmasters, holderId as GuildmasterId, 'guildmasters');
      if (!['patrons', 'heroes', 'guildmasters'].includes(entity.table)) {
        throw new RangeError(`A Guildmaster holds Regard for Patrons, Heroes and Guildmasters, not ${entityId}`);
      }
      // A retired Guildmaster is out of play, their row written once and shared (ADR-0011, DL-203).
      const guild = rowOf(world.guilds, guildmaster.guildId);
      if (guild === undefined || guild.foldedOnTurn !== null || writeOnce.guildmasters(guildmaster)) return refused;
      return applied(effect, guildmasterRegard(ctx, guildmaster, entityId, delta, 'module', moduleId), ctx);
    }
    case 'heroes': {
      const hero = requireRow(world.heroes, holderId as HeroId, 'heroes');
      if (entity.table !== 'heroes') throw new RangeError(`A Hero holds Regard for other Heroes, not ${entityId}`);
      if (outOfPlay(hero)) return refused;
      const change = adjustRegard(hero.regard, entityId, delta, turn, moduleId, config);
      return applied(effect, heroRegardChanged(ctx, hero.id, entityId, 'module', change), ctx);
    }
    default:
      throw new RangeError(`${holderId} holds no Regard a module may move: a Patron, a Guildmaster or a Hero does`);
  }
}

function applyInjury(world: World, effect: Injure, ctx: EffectContext): EffectResult {
  const { heroId, typeKey, days } = effect;
  checkWhole(days, effect.kind, 'days');
  if (days < 1) throw new RangeError(`injure's days is a whole number from 1; got ${days}`);
  if (!Object.hasOwn(ctx.content.injuries, typeKey)) throw new RangeError(`Content defines no Injury type ${JSON.stringify(typeKey)}`);
  const hero = requireRow(world.heroes, heroId, 'heroes');
  const refuse = (reason: 'hero-gone' | 'hero-away' | 'hero-injured'): EffectResult => ({ ok: false, rejection: { effect: effect.kind, reason } });
  if (outOfPlay(hero)) return refuse('hero-gone');
  if (hero.partyId !== null) return refuse('hero-away');
  if (hero.injury !== null) return refuse('hero-injured');
  // A Hero on no Roster has no infirmary: the factor of none, grade 0.
  const guild = hero.guildId !== null ? rowOf(world.guilds, hero.guildId) : undefined;
  const factor = healFactor(guild ?? { hall: { infirmary: 0 } }, ctx.config);
  const healsOnTurn = inflictInjury(hero, typeKey, healDays(days, factor), ctx.turn);
  const payload = { heroId, questId: null, typeKey, healsOnTurn, moduleId: ctx.moduleId };
  return applied(effect, [ctx.emit({ type: 'hero.injured', participants: [heroId], payload })], ctx);
}

function applyOfferQuest(world: World, effect: OfferQuest, ctx: EffectContext): EffectResult {
  const patron = requireRow(world.patrons, effect.patronId, 'patrons');
  if (ctx.streamName === undefined) throw new RangeError(`The ${ctx.moduleId} module registered no stream to draw a Quest from`);
  // A module's stream is kept in `world.rng` under its own name, beside the core's (modules.ts).
  const stream = ctx.streamName as StreamName;
  const { templateKey } = effect;
  const options = { stream, sequenceStream: stream, ...(templateKey === undefined ? {} : { templateKey }) };
  return applied(effect, generateQuest(world, patron, ctx, options).events, ctx);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

/** Done: `effect`, and `events` each naming the module that applied it. */
function applied(effect: ModuleEffect, events: EngineEvent[], ctx: Pick<EffectContext, 'moduleId'>): EffectResult {
  for (const event of events) (event.payload as { moduleId?: ModuleId }).moduleId = ctx.moduleId;
  return { ok: true, effect, events };
}

/** Whether `hero` is out of play: dead, retired, or gone from the pool unrecruited (DL-27); their row written once (ADR-0011). */
const outOfPlay = writeOnce.heroes;

function checkWhole(value: number, kind: ModuleEffectKind, field: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${kind}'s ${field} is a whole number; got ${value}`);
}
