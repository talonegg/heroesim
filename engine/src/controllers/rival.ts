// Rival controllers (M2-S9, ADR-0002, INPUTS 4.12): what a Rival Guild chooses, as the same
// `Action` values a player's front end produces. The afternoon's `rivalControllers` phase applies
// them through the rules the player's actions run (`applyGuildAction`), so a Rival plays by the
// player's rules and meets the player's rejections. A Disposition is a content key
// (`dispositions.json`); its rule is code keyed by that key (approach §4) until M6-S1 turns the
// Dispositions into weights that one rule reads. The choices here are DL-30.
//
// A rule reads the world and never writes to it. A draw it needs comes from the `rivals` stream,
// `world.rng.rivals`, and from no other (ADR-0009); `steady` draws none.

import type { GuildAction } from '../actions/action.js';
import { unavailability } from '../actions/dispatch.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, DispositionKey } from '../content-types.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { baseStat, dispositionOf, signingFee, signingRefusal, unattachedHeroes, upkeep } from '../selectors.js';

/** A Disposition's rule: the actions its Guild takes this afternoon, on the world as it stands. */
export type DispositionRule = (world: World, guild: Guild, deps: EngineDeps) => GuildAction[];

/**
 * The rule for each Disposition the engine knows, by content key. A Disposition content defines
 * and this lacks is an engine change waiting to be made (approach §4): its Guilds choose nothing.
 */
export const dispositionRules: Readonly<Record<DispositionKey, DispositionRule>> = Object.freeze({ steady });

/**
 * The actions `guild` takes this afternoon, in the order to apply them: its Disposition's rule on
 * `world` as it stands, which reads and does not change it. None for the player's Guild, whose
 * choices are the player's; none for a folded Guild, which has left play (M2-S10); and none for a
 * Disposition content does not define (data-model rule 5: the validator warns, rules ignore it)
 * or the engine has no rule for.
 */
export function rivalChoices(world: World, guild: Guild, deps: EngineDeps): GuildAction[] {
  if (guild.foldedOnTurn !== null) return [];
  const disposition = dispositionOf(guild);
  if (disposition === null) return [];
  if (!Object.hasOwn(deps.content.dispositions, disposition) || !Object.hasOwn(dispositionRules, disposition)) {
    return [];
  }
  return (dispositionRules[disposition] as DispositionRule)(world, guild, deps);
}

/**
 * The Heroes of `guild` free to go on a Quest, in Roster order: on the Roster and neither dead,
 * retired, injured nor away in a Party, by `dispatch`'s own test (`unavailability`).
 */
export function availableHeroes(world: Pick<World, 'heroes'>, guild: Pick<Guild, 'rosterIds'>): Hero[] {
  const heroes: Hero[] = [];
  for (const heroId of guild.rosterIds) {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    if (hero !== undefined && unavailability(hero) === null) heroes.push(hero);
  }
  return heroes;
}

/** The Quests on offer on the Board, in the Board's order. */
function offeredQuests(world: Pick<World, 'board' | 'quests'>): Quest[] {
  const offered: Quest[] = [];
  for (const questId of world.board) {
    const quest = Object.hasOwn(world.quests, questId) ? world.quests[questId] : undefined;
    if (quest !== undefined && quest.status === 'offered') offered.push(quest);
  }
  return offered;
}

/**
 * The Quests on offer on the Board that `guild` could staff now, in the Board's order: those for
 * which some Party of its available Heroes (`availableHeroes`, `dispatch`'s own test) meets the
 * Quest's size and requirements, as `steady` staffs a Quest (`partyFor`). Fast forward's
 * `decision-needed` reads it (M2-S11, DL-33), so a stop and a Rival agree on what can be staffed.
 */
export function staffableQuests(
  world: Pick<World, 'board' | 'quests' | 'heroes'>,
  guild: Pick<Guild, 'rosterIds'>,
  content: ContentSet,
): Quest[] {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return [];
  return offeredQuests(world).filter((quest) => partyFor(quest, available, content) !== null);
}

// ── steady ───────────────────────────────────────────────────────────────────────────────────

/**
 * `steady` (INPUTS 4.12, DL-30): dispatch to the easiest Quest on the Board it can staff, then
 * recruit the cheapest Unattached Hero while its Wealth is above `recruitWealthMultiple` times its
 * Upkeep. At most one of each an afternoon, and no draw. The two do not depend on each other: a
 * dispatch moves no Wealth and a recruit sends no one, so both are chosen on the same world.
 */
function steady(world: World, guild: Guild, deps: EngineDeps): GuildAction[] {
  const choices: GuildAction[] = [];
  const quest = easiestStaffable(world, guild, deps.content);
  if (quest !== null) choices.push(quest);
  const hire = cheapestHire(world, guild, deps);
  if (hire !== null) choices.push(hire);
  return choices;
}

/**
 * A dispatch to the easiest Quest on the Board, lowest difficulty first and then lowest Quest id,
 * that `guild` can staff from its available Heroes, or `null` when it can staff none.
 */
function easiestStaffable(world: World, guild: Guild, content: ContentSet): GuildAction | null {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return null;
  const offered = offeredQuests(world);
  offered.sort((a, b) => a.difficulty - b.difficulty || compareByCodeUnit(a.id, b.id));
  for (const quest of offered) {
    const heroIds = partyFor(quest, available, content);
    if (heroIds !== null) return { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds };
  }
  return null;
}

/**
 * The Party `steady` sends on `quest` from `available`, strongest first, or `null` when no Party
 * of them meets the Quest's size and requirements. It is the fewest Heroes the Quest allows —
 * `partySizeMin`, or two when no one Hero has both a required Class and a required Skill — so
 * the rest stay free for tomorrow's Board. A requirement is met by the strongest Hero who meets
 * it (one who meets both when there is one); the other places go to the strongest of the rest.
 * Strength is the Hero's Stats weighted by the Quest's demands (`strengthFor`), ties by Hero id.
 * `null` exactly when no Party of `available` could go, so `staffableQuests` reads it as the test
 * of whether a Quest can be staffed.
 *
 * Exported as the one staffing rule: the harness's automatic policy (M2-S12, DL-34) sends the
 * Party it names rather than keeping a copy. It reads nothing but its arguments and draws nothing.
 */
export function partyFor(quest: Quest, available: readonly Hero[], content: ContentSet): HeroId[] | null {
  const strength = new Map(available.map((hero) => [hero.id, strengthFor(hero, quest, content)]));
  const ranked = [...available].sort(
    (a, b) => (strength.get(b.id) ?? 0) - (strength.get(a.id) ?? 0) || compareByCodeUnit(a.id, b.id),
  );
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const ofClass = (hero: Hero) => classKey === undefined || hero.classKey === classKey;
  const withSkill = (hero: Hero) => skillKey === undefined || Object.hasOwn(hero.skills, skillKey);

  const required: Hero[] = [];
  if (classKey !== undefined || skillKey !== undefined) {
    const both = ranked.find((hero) => ofClass(hero) && withSkill(hero));
    if (both !== undefined) {
      required.push(both);
    } else {
      // Only when both are required and no one Hero meets both: then two Heroes meet one each.
      const classHero = ranked.find(ofClass);
      const skillHero = ranked.find(withSkill);
      if (classHero === undefined || skillHero === undefined) return null;
      required.push(classHero, skillHero);
    }
  }

  const size = Math.max(partySizeMin, required.length);
  if (size > partySizeMax || size > ranked.length) return null;
  const party = new Set(required);
  for (const hero of ranked) {
    if (party.size >= size) break;
    party.add(hero);
  }
  return ranked.filter((hero) => party.has(hero)).map((hero) => hero.id);
}

/**
 * How much `hero` brings to `quest`: each of the Quest's demands' weight times the Hero's base
 * Stat. A Stat content no longer defines counts for nothing (data-model rule 5).
 */
function strengthFor(hero: Hero, quest: Quest, content: ContentSet): number {
  let total = 0;
  for (const [statKey, weight] of quest.demands) {
    const stat = Object.hasOwn(content.stats, statKey) ? content.stats[statKey] : undefined;
    if (stat !== undefined && stat.owner === 'hero') total += weight * baseStat(hero.stats, stat);
  }
  return total;
}

/**
 * A recruit of the cheapest Hero in the Unattached pool who would sign for `guild`
 * (`signingRefusal`, M3-S5), lowest id among equal fees, when `guild`'s Wealth is above
 * `recruitWealthMultiple` times its Upkeep and covers the fee; `null` otherwise, and when no Hero
 * in the pool would sign. A Hero who would refuse the Guild's Fame is passed over, never asked.
 */
function cheapestHire(world: World, guild: Guild, deps: EngineDeps): GuildAction | null {
  const threshold = deps.config.recruitWealthMultiple * upkeep(guild, world, deps.config);
  if (!(guild.wealth > threshold)) return null;
  let cheapest: { heroId: HeroId; fee: number } | null = null;
  for (const hero of unattachedHeroes(world)) {
    if (signingRefusal(guild, hero, deps.config) !== null) continue;
    const fee = signingFee(hero, deps);
    if (cheapest === null || fee < cheapest.fee) cheapest = { heroId: hero.id, fee };
  }
  if (cheapest === null || cheapest.fee > guild.wealth) return null;
  return { kind: 'recruit', guildId: guild.id, heroId: cheapest.heroId };
}
