// Rival controllers (M2-S9, ADR-0002, INPUTS 4.12 and 7.5): what a Rival Guild chooses, as the same
// `Action` values a player's front end produces. The afternoon's `rivalControllers` phase applies
// them through the rules the player's actions run (`applyGuildAction`), so a Rival plays by the
// player's rules and meets the player's rejections. A Disposition is a content row of weights
// (`dispositions.json`), and one rule reads them for every Rival (M6-S1, DL-56): four named
// Dispositions are four rows, not four code paths, and a fifth row plays with no change here. The
// choices were DL-30's for `steady`; DL-56 turns them into weights.
//
// A rule reads the world and writes nothing to it but the draws it takes from the `rivals`
// stream, `world.rng.rivals`, and from no other (ADR-0009).

import type { GuildAction } from '../actions/action.js';
import { unavailability } from '../actions/dispatch.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Disposition } from '../content-types.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { gearChoices } from '../gear.js';
import { streamOf } from '../generators/draw.js';
import { pick } from '../rng.js';
import {
  affordableImprovement,
  baseStat,
  cheapestUnattached,
  dispositionOf,
  offeredQuests,
  upkeep,
} from '../selectors.js';

/**
 * The actions `guild` takes this afternoon, in the order to apply them, by the one rule every
 * Disposition shares, reading the weights of its row (M6-S1, DL-56):
 *
 * 1. put the gear its Guild holds on its Heroes with the slot empty (`gearChoices`, M5-S2, DL-49),
 *    which moves no Wealth and sends no one;
 * 2. dispatch to the Quest its `questRiskAppetite` prefers among those it can staff
 *    (`preferredQuest`), drawing from `rivals` to choose among Quests of the same difficulty;
 * 3. make one purchase: build the infirmary's next grade while its Wealth is above
 *    `buildThreshold` times that grade's cost (M3-S6), or else recruit the cheapest Unattached Hero
 *    who would sign while its Wealth is above `recruitThreshold` times its Upkeep.
 *
 * At most one dispatch and one purchase an afternoon. The dispatch and the purchase do not depend on
 * each other: a dispatch moves no Wealth and a purchase sends no one, so both are chosen on the same
 * world; one purchase, so that the second never finds the Wealth the first spent.
 *
 * None for the player's Guild, whose choices are the player's; none for a folded Guild, which has
 * left play (M2-S10); and none for a Disposition content does not define (data-model rule 5: the
 * validator warns, rules ignore it). It changes nothing in `world` but `world.rng.rivals`, which
 * advances one draw for each dispatch it chooses.
 */
export function rivalChoices(world: World, guild: Guild, deps: EngineDeps): GuildAction[] {
  if (guild.foldedOnTurn !== null) return [];
  const key = dispositionOf(guild);
  if (key === null || !Object.hasOwn(deps.content.dispositions, key)) return [];
  const disposition = deps.content.dispositions[key] as Disposition;

  const choices: GuildAction[] = [...gearChoices(world, guild, deps)];
  const quest = preferredQuest(world, guild, disposition, deps.content);
  if (quest !== null) choices.push(quest);
  const purchase = infirmaryBuild(guild, disposition, deps) ?? cheapestHire(world, guild, disposition, deps);
  if (purchase !== null) choices.push(purchase);
  return choices;
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

/**
 * The Quests on offer on the Board that `guild` could staff now, in the Board's order: those for
 * which some Party of its available Heroes (`availableHeroes`, `dispatch`'s own test) meets the
 * Quest's size and requirements, as a Rival staffs a Quest (`partyFor`). Fast forward's
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

// ── The rule's parts ────────────────────────────────────────────────────────────────────────────

/**
 * A dispatch to the Quest `disposition` prefers among those on the Board `guild` can staff now, or
 * `null` when it can staff none. The Quests it can staff are ranked by difficulty, easiest first,
 * and the one `questRiskAppetite` of the way along names the difficulty it wants: 0 the easiest
 * (DL-30's `steady`), 1 the hardest, 0.5 the middle, the place rounded to the nearest. Every Quest
 * it can staff at that difficulty is a candidate, in Quest id order, and one draw from `rivals`
 * picks among them, one draw however many there are. The Party is `partyFor`'s.
 */
function preferredQuest(world: World, guild: Guild, disposition: Disposition, content: ContentSet): GuildAction | null {
  const available = availableHeroes(world, guild);
  if (available.length === 0) return null;
  const staffable: { quest: Quest; heroIds: HeroId[] }[] = [];
  for (const quest of offeredQuests(world)) {
    const heroIds = partyFor(quest, available, content);
    if (heroIds !== null) staffable.push({ quest, heroIds });
  }
  if (staffable.length === 0) return null;
  staffable.sort((a, b) => a.quest.difficulty - b.quest.difficulty || compareByCodeUnit(a.quest.id, b.quest.id));
  const place = Math.round(disposition.questRiskAppetite * (staffable.length - 1));
  const wanted = staffable[place]?.quest.difficulty;
  const candidates = staffable.filter(({ quest }) => quest.difficulty === wanted);
  const { quest, heroIds } = pick(streamOf(world, 'rivals'), candidates);
  return { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds };
}

/**
 * A build of the infirmary's next grade when `guild`'s Wealth is above its Disposition's
 * `buildThreshold` times its cost (`affordableImprovement`); `null` otherwise, and once the
 * infirmary is at its top grade (M3-S6, DL-38). Only the infirmary until M6-S4.
 */
function infirmaryBuild(guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  const next = affordableImprovement(guild, 'infirmary', disposition.buildThreshold, deps.content);
  return next === null ? null : { kind: 'build', guildId: guild.id, facility: 'infirmary' };
}

/**
 * The Party a Rival sends on `quest` from `available`, strongest first, or `null` when no Party
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
 * (`cheapestUnattached`, M3-S5: DL-38's one statement of the cheapest, the lowest id among equal
 * fees), when `guild`'s Wealth is above its Disposition's `recruitThreshold` times its Upkeep and
 * covers the fee; `null` otherwise, and when no Hero in the pool would sign. A Hero who would refuse
 * the Guild's Fame is passed over, never asked.
 */
function cheapestHire(world: World, guild: Guild, disposition: Disposition, deps: EngineDeps): GuildAction | null {
  const threshold = disposition.recruitThreshold * upkeep(guild, world, deps.config, deps.content);
  if (!(guild.wealth > threshold)) return null;
  const cheapest = cheapestUnattached(world, deps, guild);
  if (cheapest === null || cheapest.fee > guild.wealth) return null;
  return { kind: 'recruit', guildId: guild.id, heroId: cheapest.hero.id };
}
