// `createWorld` (M1-S6, approach §3): a seeded World State at Turn 0 and the events that
// explain it. The order below is DL-19 item 9; changing it changes every seed's world. Since
// M2-S3 the first Board is drawn last, from the `board` stream, so a new game opens on a full
// Board rather than waiting for the first morning phase at Turn 3 (DL-25).

import type { EngineDeps } from './config.js';
import type { BackgroundKey, ContentSet, TraitKey } from './content-types.js';
import {
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  emptyDocument,
  type DescriptiveAttribute,
  type Meta,
  type Sex,
  type WorldDocument,
} from './document.js';
import type { EngineEvent, WorldCreated } from './events.js';
import { dealEvenly, sexes, sortedKeys, streamOf } from './generators/draw.js';
import { dealtDisposition, generateGuild, generateRival } from './generators/guilds.js';
import { generateHero } from './generators/heroes.js';
import { generatePatron } from './generators/patrons.js';
import { append } from './history.js';
import { ensureModules } from './modules.js';
import { boardRefresh } from './phases/board-refresh.js';
import { marketRefresh } from './phases/market-refresh.js';
import { phaseContext } from './phases/phase.js';
import { createStreams, streamNames } from './rng.js';

/**
 * What the player chooses before a game begins. Whatever of the Guildmaster is left unset is drawn
 * as a Rival's Guildmaster is (R8, DL-88 item 3, DL-100 item 3); `setupRefusal` says whether the
 * choices keep the rules.
 */
export interface WorldSetup {
  guildmasterName: string;
  guildName: string;
  /** A Background with `owner: "guild"`; drawn as a Rival's is when omitted. */
  backgroundKey?: BackgroundKey;
  /** The Guildmaster's sex; drawn when omitted (M9-S2). */
  guildmasterSex?: Sex;
  /** The Guildmaster's age, a whole number from `guildmasterStartingAgeMin` to `Max`; drawn when omitted. */
  guildmasterAge?: number;
  /**
   * The Guildmaster's Traits, in the order given: distinct Guildmaster Traits, at most
   * `guildmasterTraitsMax`, no excluded pair, costing no more than `guildmasterTraitBudget`. Drawn on
   * the budget when omitted; an empty list is no Trait.
   */
  guildmasterTraitKeys?: readonly TraitKey[];
  /**
   * The descriptive Attributes (DL-100 item 3), stored trimmed, each at most
   * `descriptiveAttributeMaxLength` characters once trimmed; none when omitted or blank.
   */
  guildmasterBirthplace?: string;
  guildmasterAppearance?: string;
  guildmasterBiography?: string;
  /** Stored in `meta` and never read by a rule: a front end's clock, or `"harness"` (D10.1). */
  createdAt: string;
}

/** The field of `WorldSetup` that holds each descriptive Attribute. */
const attributeFields = {
  birthplace: 'guildmasterBirthplace',
  appearance: 'guildmasterAppearance',
  biography: 'guildmasterBiography',
} as const satisfies Record<DescriptiveAttribute, keyof WorldSetup>;

/**
 * Why a setup breaks a rule (M9-S2, DL-100 item 3, DL-102), each reason with what a front end names
 * in its sentence. `createWorld` throws on any of them; a front end asks `setupRefusal` first.
 */
export type SetupRefusal =
  | { reason: 'guild-name-blank' }
  | { reason: 'guildmaster-name-blank' }
  /** Not a Guild Background of the content. */
  | { reason: 'unknown-background'; backgroundKey: BackgroundKey }
  /** Not a whole number from `min` to `max`, the starting ages. */
  | { reason: 'age-out-of-range'; age: number; min: number; max: number }
  /** Not a Guildmaster Trait of the content: unknown, or a Hero's. */
  | { reason: 'unknown-trait'; traitKey: TraitKey }
  | { reason: 'repeated-trait'; traitKey: TraitKey }
  /** More than `guildmasterTraitsMax`. */
  | { reason: 'too-many-traits'; count: number; max: number }
  /** Two Traits one of which excludes the other, the first such pair in the order given. */
  | { reason: 'excluded-pair'; traitKey: TraitKey; otherKey: TraitKey }
  /** The Traits' costs sum past `guildmasterTraitBudget`. */
  | { reason: 'over-budget'; cost: number; budget: number }
  /** A descriptive Attribute longer, once trimmed, than its bound, counted in characters. */
  | { reason: 'text-too-long'; attribute: DescriptiveAttribute; length: number; max: number };

/**
 * What `traitKeys` cost against the Trait budget (M9-S2, DL-100 item 3): the sum of each Trait's
 * content cost, a penalty's refund taken off; a key content does not define costs nothing. The sum
 * `setupRefusal` holds to `guildmasterTraitBudget`, for a front end to show beside the budget.
 */
export function guildmasterTraitCost(traitKeys: readonly TraitKey[], content: Pick<ContentSet, 'traits'>): number {
  return traitKeys.reduce((sum, key) => sum + (Object.hasOwn(content.traits, key) ? (content.traits[key]?.cost ?? 0) : 0), 0);
}

/** The characters of `text`, trimmed: Unicode code points, so an accented letter or an emblem counts once. */
function lengthOf(text: string): number {
  return [...text.trim()].length;
}

/**
 * Whether `setup` keeps the rules, and if not the first it breaks (M9-S2, R8, DL-100 item 3), in
 * this order: the names, the Background, the age, each Trait in turn (a Guildmaster Trait of the
 * content, given once), how many Traits, an excluded pair, their cost, then each descriptive
 * Attribute's length. `null` when it keeps them all. Reads the bounds from `deps.config` and the
 * Traits from `deps.content`, so a front end checks with the rules the game will begin under,
 * without copying them. Changes nothing.
 */
export function setupRefusal(setup: WorldSetup, deps: Pick<EngineDeps, 'config' | 'content'>): SetupRefusal | null {
  const { config, content } = deps;
  if (setup.guildName.trim() === '') return { reason: 'guild-name-blank' };
  if (setup.guildmasterName.trim() === '') return { reason: 'guildmaster-name-blank' };
  const { backgroundKey } = setup;
  if (backgroundKey !== undefined && !(Object.hasOwn(content.backgrounds, backgroundKey) && content.backgrounds[backgroundKey]?.owner === 'guild')) {
    return { reason: 'unknown-background', backgroundKey };
  }

  const age = setup.guildmasterAge;
  const [min, max] = [config.guildmasterStartingAgeMin, config.guildmasterStartingAgeMax];
  if (age !== undefined && !(Number.isSafeInteger(age) && age >= min && age <= max)) return { reason: 'age-out-of-range', age, min, max };

  const keys = setup.guildmasterTraitKeys ?? [];
  const seen = new Set<TraitKey>();
  for (const traitKey of keys) {
    const row = Object.hasOwn(content.traits, traitKey) ? content.traits[traitKey] : undefined;
    if (row?.owner !== 'guildmaster') return { reason: 'unknown-trait', traitKey };
    if (seen.has(traitKey)) return { reason: 'repeated-trait', traitKey };
    seen.add(traitKey);
  }
  if (keys.length > config.guildmasterTraitsMax) return { reason: 'too-many-traits', count: keys.length, max: config.guildmasterTraitsMax };
  const rows = keys.map((key) => content.traits[key]).filter((row) => row !== undefined);
  for (const [index, row] of rows.entries()) {
    for (const other of rows.slice(index + 1)) {
      if (row.excludes.includes(other.key) || other.excludes.includes(row.key)) {
        return { reason: 'excluded-pair', traitKey: row.key, otherKey: other.key };
      }
    }
  }
  const cost = guildmasterTraitCost(keys, content);
  if (cost > config.guildmasterTraitBudget) return { reason: 'over-budget', cost, budget: config.guildmasterTraitBudget };

  for (const attribute of descriptiveAttributes) {
    const length = lengthOf(setup[attributeFields[attribute]] ?? '');
    const bound = descriptiveAttributeMaxLength[attribute];
    if (length > bound) return { reason: 'text-too-long', attribute, length, max: bound };
  }
  return null;
}

export interface CreatedWorld {
  document: WorldDocument;
  /** Every entry the History starts with, in order: the same objects, `world.created` first. */
  events: EngineEvent[];
}

/**
 * Creates a world from `seed` and the player's `setup`, under `deps.config` and `deps.content`
 * (DL-19 item 9): `meta`, one stream per core stream name, the player's Guild first (so it is
 * `guild-000001`), its Guildmaster with what the setup chose of them and the rest drawn, every
 * draw made whatever was chosen, so a choice moves no later draw (M9-S2, DL-102); then
 * `rivalCount` Rival Guilds, `patronCount` Patrons with their Spheres dealt
 * evenly, and `unattachedPoolSize` Unattached Heroes, every draw from `generation`; then the
 * morning's Board refresh, drawing `boardSize` Quests from `board` (DL-25), and its Market
 * refresh, drawing `marketSize` stacks from `market` (DL-51). Appends
 * `world.created` and every generator's events to the new History and returns them. Last, each
 * module in `deps.modules`, none by default, gets its stream and its slice (`ensureModules`).
 *
 * Throws on a programming error: a setup `setupRefusal` refuses, naming its reason; a sex that is
 * not one; or a module list `installedModules` refuses or a module that throws making its slice
 * (`ModuleError`). A front end checks its input with `setupRefusal` before calling.
 */
export function createWorld(seed: string, setup: WorldSetup, deps: EngineDeps): CreatedWorld {
  const { config, content } = deps;
  const refusal = setupRefusal(setup, deps);
  if (refusal !== null) throw new RangeError(`The setup is refused: ${JSON.stringify(refusal)}`);
  const sex = setup.guildmasterSex;
  if (sex !== undefined && !sexes.includes(sex)) {
    throw new RangeError(`A Guildmaster's sex is one of ${sexes.join(', ')}; got ${JSON.stringify(sex)}`);
  }
  const meta: Meta = {
    version: config.schemaVersion,
    seed,
    content: { id: content.id, version: content.version },
    config: { ...config },
    createdAt: setup.createdAt,
  };
  const document = emptyDocument(meta, createStreams(seed, streamNames));
  const { world } = document;
  const generation = streamOf(world);
  const generated: EngineEvent[] = [];

  const player = generateGuild(world, deps, {
    controller: { kind: 'player' },
    rosterSize: config.startingRosterSize,
    wealth: config.startingWealth,
    name: setup.guildName,
    guildmasterName: setup.guildmasterName,
    ...(setup.backgroundKey === undefined ? {} : { backgroundKey: setup.backgroundKey }),
    guildmaster: {
      ...(sex === undefined ? {} : { sex }),
      ...(setup.guildmasterAge === undefined ? {} : { age: setup.guildmasterAge }),
      ...(setup.guildmasterTraitKeys === undefined ? {} : { traitKeys: setup.guildmasterTraitKeys }),
      birthplace: (setup.guildmasterBirthplace ?? '').trim(),
      appearance: (setup.guildmasterAppearance ?? '').trim(),
      biography: (setup.guildmasterBiography ?? '').trim(),
    },
  });
  generated.push(...player.events);

  // Each Rival draws its Roster size and Wealth before it is generated (DL-19 item 9), and is dealt
  // its Disposition round-robin, which draws nothing (M6-S1, DL-56).
  for (let rival = 0; rival < config.rivalCount; rival += 1) {
    const controller = { kind: 'rival', disposition: dealtDisposition(content, rival) } as const;
    generated.push(...generateRival(world, deps, { controller }).events);
  }

  for (const sphereKey of dealEvenly(generation, sortedKeys(content.spheres), config.patronCount)) {
    generated.push(...generatePatron(world, deps, { sphereKey }).events);
  }

  for (let hero = 0; hero < config.unattachedPoolSize; hero += 1) {
    generated.push(...generateHero(world, deps).events);
  }

  // Turn 0 is a morning whose phases never run (DL-24), so its Board is drawn here, by the same
  // refresh, from `board` alone: the world above is what it was before M2-S3.
  generated.push(...boardRefresh(world, phaseContext(world, deps)));
  // The Market likewise (M5-S4, DL-51), from `market` alone, after the Board as on every morning.
  generated.push(...marketRefresh(world, phaseContext(world, deps)));
  // Last, each installed module's stream and slice (M8-S1, DL-76): a module's stream is seeded from
  // its own name, so nothing above moves, and with no module installed nothing is added.
  ensureModules(world, seed, deps);

  const created: WorldCreated = {
    turn: world.turn,
    type: 'world.created',
    participants: [],
    labels: {},
    milestone: false,
    payload: { seed },
  };
  const events: EngineEvent[] = [created, ...generated];
  for (const event of events) append(document.history, event);
  return { document, events };
}
