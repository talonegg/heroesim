// Regard between Heroes, and Relationship (M4-S4, R24, CONTEXT.md, data-model §3.2 and rules 1
// and 10, INPUTS 6.3, DL-46). A Hero's Regard for another Hero is a `RegardEntry` in the Hero's
// `regard` map keyed by the other's id, on the one scale and bands every holder shares (regard.ts,
// DL-43).
//
// - **Its writer** is a shared Quest: when a Party comes home, each Hero who came home alive gains
//   `regardPerSharedQuest` for each other who did, `regardOnSuccessBonus` more on a success, and the
//   Encounters' `regard` consequences, summed (`outcome.regardDelta`, DL-42), all in one change a
//   pair a Quest (`regardOnSharedQuest`, which `questsConclude` calls for every Guild alike). A Hero
//   killed on the Quest takes no part: their Regard stays as it stood, and nobody's for them moves.
// - **Its drift** is the nightly decay toward neutral (`decayHeroRegard`, which the Hero State
//   Engine runs for each Hero on a Roster): once a whole year has passed since two Heroes last
//   shared a Quest, the entry's `since`, it moves `regardDecayPerYear` of the scale's reach a year
//   toward neutral, and goes there. A Hero off every Roster (dead, retired, Unattached) is never
//   reached, so their own Regard stays as it stood; a living Hero's Regard for them decays as for
//   anyone they no longer quest with, so the maps shrink as well as grow.
// - Each emits `hero.regard-changed` only when it takes a value from one band into another (rule
//   10), one entry for each Hero whose Regard crossed.
// - **Relationship** is computed from the two Regards and never stored (rule 1): `relationship`,
//   the mean of the Regard each holds for the other, which the Quest Engine's teamwork scalar reads
//   for each pair of a Party (quest-engine/teamwork.ts).

import { regardBandNames, type GameConfig, type RegardBand } from './config.js';
import {
  compareByCodeUnit,
  isId,
  parseId,
  type EntityId,
  type Hero,
  type HeroId,
  type QuestId,
  type RegardEntry,
  type RegardMap,
  type Turn,
  type World,
} from './document.js';
import type { Emit } from './emit.js';
import type { EngineEvent, HeroRegardCause } from './events.js';
import { adjustRegard, crossedBand, recoverRegard, regardBand, regardReach, regardValue, type RegardChange } from './regard.js';
import { turnsPerDay } from './time.js';

/** What a writer of Regard between Heroes is given: a phase's context, or as much of it as it reads. */
export interface HeroRegardContext {
  config: GameConfig;
  turn: Turn;
  emit: Emit;
}

/** A Regard holder as Relationship reads it: its id and its map. */
type Holder = { id: EntityId; regard: Readonly<RegardMap> };

// ── The writer: a shared Quest ───────────────────────────────────────────────────────────────

/**
 * The one change a shared Quest makes to each Hero's Regard for each other Hero home with them:
 * `regardPerSharedQuest`, plus `regardOnSuccessBonus` when it `succeeded`, plus the Encounters'
 * Regard, `regardDelta`.
 */
export function sharedQuestRegardDelta(
  succeeded: boolean,
  regardDelta: number,
  config: Pick<GameConfig, 'regardPerSharedQuest' | 'regardOnSuccessBonus'>,
): number {
  return config.regardPerSharedQuest + (succeeded ? config.regardOnSuccessBonus : 0) + regardDelta;
}

/**
 * A resolved Quest's Regard between Heroes (M4-S4): each of `heroes`, the Party's members who came
 * home alive, in Party order, gains `sharedQuestRegardDelta` Regard for each other of them, in Party
 * order, held inside the scale, with `since` tonight and `reason` `quest.resolved`, even when the
 * change is 0 (they shared the Quest; the decay reads it). `hero.regard-changed` for each change
 * that crosses a band, naming the Quest `questId` (M9-F1, DL-112 item 2), and nothing else. Fewer
 * than two Heroes share nothing.
 */
export function regardOnSharedQuest(
  heroes: readonly Hero[],
  ctx: HeroRegardContext,
  { questId, succeeded, regardDelta }: { questId: QuestId; succeeded: boolean; regardDelta: number },
): EngineEvent[] {
  if (heroes.length < 2) return [];
  const delta = sharedQuestRegardDelta(succeeded, regardDelta, ctx.config);
  const events: EngineEvent[] = [];
  for (const hero of heroes) {
    for (const other of heroes) {
      if (other.id === hero.id) continue;
      const change = adjustRegard(hero.regard, other.id, delta, ctx.turn, 'quest.resolved', ctx.config);
      events.push(...heroRegardChanged(ctx, hero.id, other.id, 'shared-quest', change, questId));
    }
  }
  return events;
}

// ── The drift: decay toward neutral ──────────────────────────────────────────────────────────

/**
 * How far the nightly decay moves a Hero's Regard for another Hero toward neutral:
 * `regardDecayPerYear` of the scale's reach, spread over the year's nights.
 */
export function heroRegardDecayStep(config: Pick<GameConfig, 'regardDecayPerYear' | 'regardMin' | 'regardMax' | 'turnsPerYear'>): number {
  return (config.regardDecayPerYear * regardReach(config)) / (config.turnsPerYear / turnsPerDay);
}

/**
 * Whether `hero`'s Regard for `entityId` decays tonight: the entry is for a Hero and was last set
 * by a shared Quest (`since`) a whole year, `turnsPerYear` Turns, or more before `turn`. "Not
 * shared a Quest that year" is read as a year gone by since the last, not a calendar year, so two
 * Heroes back from a Quest on the year's last night do not start to drift on the next.
 */
export function heroRegardDecays(entry: { since: Turn }, entityId: EntityId, turn: Turn, config: Pick<GameConfig, 'turnsPerYear'>): boolean {
  return turn - entry.since >= config.turnsPerYear && isId('heroes', entityId);
}

/**
 * The nightly decay of `hero`'s Regard for other Heroes (M4-S4): each entry `heroRegardDecays`
 * moves toward neutral by `heroRegardDecayStep`, stops there, and goes there; `since` and `reason`
 * stay as the shared Quest set them. Entries for anyone but a Hero are another rule's and are left,
 * as is one for a Hero the world does not hold (the validator reports that). In id order, so a
 * loaded save, whose maps come back with sorted keys, emits what the unsaved game would.
 * `hero.regard-changed` only on a band crossing (rule 10). Draws nothing.
 */
export function decayHeroRegard(hero: Hero, world: Pick<World, 'heroes'>, ctx: HeroRegardContext): EngineEvent[] {
  const step = heroRegardDecayStep(ctx.config);
  if (!(step > 0)) return [];
  const due: HeroId[] = [];
  for (const [entityId, entry] of Object.entries(hero.regard) as [EntityId, RegardEntry][]) {
    if (heroRegardDecays(entry, entityId, ctx.turn, ctx.config) && Object.hasOwn(world.heroes, entityId)) {
      due.push(entityId as HeroId);
    }
  }
  const events: EngineEvent[] = [];
  for (const entityId of due.sort(compareByCodeUnit)) {
    const change = recoverRegard(hero.regard, entityId, step, ctx.config);
    events.push(...heroRegardChanged(ctx, hero.id, entityId, 'decay', change));
  }
  return events;
}

/**
 * `hero.regard-changed` for `change`, when it crossed a band; nothing otherwise. `questId`, given for
 * a shared Quest's change, is named in the payload and as a participant (M9-F1).
 */
export function heroRegardChanged(
  ctx: Pick<HeroRegardContext, 'emit'>,
  heroId: HeroId,
  entityId: EntityId,
  cause: HeroRegardCause,
  change: RegardChange,
  questId?: QuestId,
): EngineEvent[] {
  if (!crossedBand(change)) return [];
  return [
    ctx.emit({
      type: 'hero.regard-changed',
      participants: questId === undefined ? [heroId, entityId] : [heroId, entityId, questId],
      payload: { heroId, entityId, cause, ...(questId === undefined ? {} : { questId }), ...change },
    }),
  ];
}

// ── Relationship: computed, never stored ─────────────────────────────────────────────────────

/**
 * The Relationship between two holders in hand (CONTEXT.md, R24): the mean of `a`'s Regard for `b`
 * and `b`'s for `a`, each neutral when not held, held inside `regardMin` to `regardMax`. Symmetric
 * by construction, and computed at every read (rule 1).
 */
export function relationshipBetween(a: Holder, b: Holder, config: Pick<GameConfig, 'regardMin' | 'regardMax'>): number {
  const mean = (regardValue(a.regard, b.id) + regardValue(b.regard, a.id)) / 2;
  return Math.min(config.regardMax, Math.max(config.regardMin, mean));
}

/** The tables whose rows hold a Regard map (data-model §3.2). */
const regardTables = new Set<string>(['guilds', 'guildmasters', 'heroes', 'patrons']);

/** The row `id` names, when it is one of a table that holds Regard and the world has it. */
function holderOf(id: EntityId, world: Pick<World, 'guilds' | 'guildmasters' | 'heroes' | 'patrons'>): Holder | undefined {
  const table = parseId(id)?.table;
  if (table === undefined || !regardTables.has(table)) return undefined;
  const rows = world[table as 'guilds' | 'guildmasters' | 'heroes' | 'patrons'] as Readonly<Record<string, Holder>>;
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/**
 * The Relationship between the entities `a` and `b` in `world` (M4-S4): `relationshipBetween` their
 * rows. An entity the world lacks, or of a table that holds no Regard, holds neutral Regard for
 * everyone. In the first build the Quest Engine reads it between Heroes only.
 */
export function relationship(
  a: EntityId,
  b: EntityId,
  world: Pick<World, 'guilds' | 'guildmasters' | 'heroes' | 'patrons'>,
  config: Pick<GameConfig, 'regardMin' | 'regardMax'>,
): number {
  const none: Readonly<RegardMap> = {};
  return relationshipBetween(
    { id: a, regard: holderOf(a, world)?.regard ?? none },
    { id: b, regard: holderOf(b, world)?.regard ?? none },
    config,
  );
}

/** The mean Relationship over every pair of `heroes`; 0, neutral, for fewer than two (DL-46). */
export function meanPairwiseRelationship(heroes: readonly Holder[], config: Pick<GameConfig, 'regardMin' | 'regardMax'>): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < heroes.length; i += 1) {
    for (let j = i + 1; j < heroes.length; j += 1) {
      total += relationshipBetween(heroes[i] as Holder, heroes[j] as Holder, config);
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

/**
 * How many pairs of `heroIds` have their Relationship in each band, every band listed: each
 * unordered pair once, a Hero the world lacks left out. What the M4 harness reports for the player's
 * Roster at year 10 (M4 §2's counter).
 */
export function relationshipBandCounts(
  heroIds: readonly HeroId[],
  world: Pick<World, 'heroes'>,
  config: Pick<GameConfig, 'regardMin' | 'regardMax' | 'regardBands'>,
): Record<RegardBand, number> {
  const counts = Object.fromEntries(regardBandNames.map((band) => [band, 0])) as Record<RegardBand, number>;
  const heroes = heroIds.flatMap((id) => (Object.hasOwn(world.heroes, id) ? [world.heroes[id] as Hero] : []));
  for (let i = 0; i < heroes.length; i += 1) {
    for (let j = i + 1; j < heroes.length; j += 1) {
      counts[regardBand(relationshipBetween(heroes[i] as Hero, heroes[j] as Hero, config), config)] += 1;
    }
  }
  return counts;
}
