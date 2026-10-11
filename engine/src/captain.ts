// The Captain (DL-280 item 6, Q3 c; DL-287; `CONTEXT.md` Captain): one Hero of a Guild's Roster,
// named by `nameCaptain`. What the Captain brings is scaled by s, their captaincy Stat from its least,
// 0, to its most, 1 (`captaincyScale`), the Stat being the one content marks `captaincy`, so the engine
// names no Stat (ADR-0006; the architecture review's candidate 5). Three rules read it: the form of the
// Captain's Party on a Quest (form.ts, through `queryParty`), the Morale its Heroes come home with
// (`conclude`) and the Roster's Morale baseline while the Captain is at home (`moraleBaselineFor`).
//
// A change of Captain locks the post (`captainLock`), as a Transfer locks a Hero (`transferLock`,
// DL-60). A post a Hero leaves by a Death, a Retirement, a Transfer or the Guild's fold is left empty
// (`leaveRoster`), and is filled without cost or lock. A Rival, and the harness's policy, name to an
// empty post their Hero highest in the captaincy Stat (`captainChoice`). Readers, but `leaveRoster`;
// nothing here draws.

import type { NameCaptainAction } from './actions/captain.js';
import type { EngineDeps, GameConfig } from './config.js';
import type { ContentSet, StatKey } from './content-types.js';
import { rowOf, type Guild, type Hero, type HeroId, type StatValues, type Turn, type World } from './document.js';
import { effectiveStats } from './selectors.js';
import { dayOf, turnsPerDay } from './time.js';

/** Each content set's captaincy Stat, found once: content does not change while it is played. */
const marked = new WeakMap<object, StatKey | null>();

/** The key of the Stat content marks `captaincy` (DL-287); `null` where it marks none, and then no Captain scales anything. */
export function captaincyStat(content: Pick<ContentSet, 'stats'>): StatKey | null {
  let key = marked.get(content.stats);
  if (key === undefined) {
    key = Object.entries(content.stats).find(([, stat]) => stat.captaincy === true)?.[0] ?? null;
    marked.set(content.stats, key);
  }
  return key;
}

/**
 * s, a Captain's scale (DL-280 item 6, DL-287): their captaincy Stat in `stats`, their effective Stats,
 * from the Stat's least in content, 0, to its most, 1, in a line, held there beyond either; 1 for a
 * Stat whose least is its most. 0 where content marks no captaincy Stat, or `stats` lack it.
 */
export function captaincyScale(stats: Readonly<StatValues>, content: Pick<ContentSet, 'stats'>): number {
  const key = captaincyStat(content);
  const stat = key === null ? undefined : content.stats[key];
  const value = key === null ? undefined : stats[key];
  if (stat === undefined || value === undefined) return 0;
  if (stat.max <= stat.min) return value >= stat.max ? 1 : 0;
  return Math.min(1, Math.max(0, (value - stat.min) / (stat.max - stat.min)));
}

/** s of `hero` as their Guild's Captain: their effective captaincy Stat's scale (`captaincyScale`). */
export function captainScale(
  hero: Pick<Hero, 'id' | 'stats' | 'classKey' | 'guildId' | 'traits'>,
  world: Pick<World, 'guilds' | 'guildmasters' | 'items' | 'stacks'>,
  content: Pick<ContentSet, 'stats' | 'guildmasterTraits' | 'heroTraits' | 'items'>,
): number {
  return captaincyScale(effectiveStats(hero, world, content), content);
}

/** `guild`'s Captain, or `undefined` while the post is empty. */
export function captainOf(guild: Pick<Guild, 'captainId'>, world: Pick<World, 'heroes'>): Hero | undefined {
  return guild.captainId === null ? undefined : rowOf(world.heroes, guild.captainId);
}

/** The post held by a recent change of Captain: the Turn of the change, and the first Turn another may be made. */
export interface CaptainLock {
  changedOnTurn: Turn;
  untilTurn: Turn;
}

/**
 * Whether `guild`'s post is locked at `turn` by its last change of Captain (DL-287): a Captain named
 * in another's place on Day `d` is not replaced before the morning of Day `d + captainChangeLockDays`,
 * as a Transfer holds a Hero (`transferLock`, DL-60). `null` for a post never changed, or its lock run
 * out (a lock of 0 Days never holds). A vacancy is filled whatever the lock (`nameCaptain`).
 */
export function captainLock(
  guild: Pick<Guild, 'captainChangedOnTurn'>,
  turn: Turn,
  config: Pick<GameConfig, 'captainChangeLockDays'>,
): CaptainLock | null {
  const changedOnTurn = guild.captainChangedOnTurn;
  if (changedOnTurn === null) return null;
  const untilTurn = (dayOf(changedOnTurn) + config.captainChangeLockDays) * turnsPerDay;
  return turn < untilTurn ? { changedOnTurn, untilTurn } : null;
}

/**
 * Takes `heroId` off `guild`'s Roster, and empties the post when they held it (DL-280: a post left by
 * a Death, a Retirement or a departure is filled free): the one way a Hero leaves a Roster, for a
 * Death, a Retirement and a Transfer. The lock is left as it was; it never holds a vacancy.
 */
export function leaveRoster(guild: Guild, heroId: HeroId): void {
  guild.rosterIds = guild.rosterIds.filter((id) => id !== heroId);
  if (guild.captainId === heroId) guild.captainId = null;
}

/**
 * What `guild` names to its empty post (DL-280 item 6, DL-287): its Hero highest in the captaincy Stat,
 * by their effective Stats, wherever they are, the first in Roster order among those tied; a Rival's
 * controller asks it each afternoon (`rivalChoices`), and the harness's policy for the player's Guild.
 * `null` while the post is held, for a folded Guild or an empty Roster, and where content marks no
 * captaincy Stat, there being then no Hero highest in it. Draws nothing.
 */
export function captainChoice(world: World, guild: Guild, deps: Pick<EngineDeps, 'content'>): NameCaptainAction | null {
  const key = captaincyStat(deps.content);
  if (key === null || guild.captainId !== null || guild.foldedOnTurn !== null) return null;
  let best: { heroId: HeroId; value: number } | null = null;
  for (const heroId of guild.rosterIds) {
    const hero = rowOf(world.heroes, heroId);
    if (hero === undefined) continue;
    const value = effectiveStats(hero, world, deps.content)[key] ?? Number.NEGATIVE_INFINITY;
    if (best === null || value > best.value) best = { heroId, value };
  }
  return best === null ? null : { kind: 'nameCaptain', guildId: guild.id, heroId: best.heroId };
}
