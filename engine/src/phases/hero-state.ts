// Night: the Hero State Engine — healing, Morale drift, Regard decay and the yearly Retirement
// check (approach §2, M2-S6, INPUTS 4.5, 4.8, 4.11, DL-29; M4-S4, DL-46). Ageing itself is derived
// (`ageOf`); the yearly decline is the `ageing` phase's, which runs next on the same nights
// (ageing.ts, M3-S4, DL-37).
//
// It covers the Heroes on a Roster of a Guild that has not folded, in Guild id order and Roster
// order, those away on a Quest included; a dead or retired Hero has left the Roster and is never
// reached. The Unattached pool is left alone: a pool Hero named by any entry but their own two
// passive ones keeps their row for good (data-model rule 8), so an Injury healing or a Morale band
// crossed in the pool would defeat the pool's bound, and a pool Hero stays too few Days to meet an
// anniversary. A Hero's State resumes when a Guild signs them.
//
// For each Hero, in this order:
//
// - **Healing.** An Injury whose `healsOnTurn` has come is cleared, and its type's `leavesTrait`
//   joins the Hero's Traits unless already there, with `hero.healed`. It replaces any Trait they
//   hold that it excludes or that excludes it, each with `hero.trait-lost` after (v1.1.4-S7, DL-150
//   item 5): the wound is a fact of the body.
// - **Morale drift.** Morale moves `moraleDrift` toward the Hero's baseline, `moraleBaselineFor`
//   (`moraleBaseline`, raised by the Guild's quarters from M3-S6 and moved by its Guildmaster's
//   Inspiration and Traits from M4-S5), and stops there. Drift emits
//   `hero.morale-changed` only on the night it takes Morale from one of `moraleBands` into
//   another (data-model rule 10); the discrete changes are `questsConclude`'s.
// - **Regard decay** (M4-S4, hero-regard.ts). The Hero's Regard for each other Hero with whom they
//   have not shared a Quest for a whole year moves toward neutral by `regardDecayPerYear` of the
//   scale's reach a year, an even share each night, and goes at neutral: a drift, emitting
//   `hero.regard-changed` only on a band crossing. A dead, retired or pool Hero is not reached, so
//   their own Regard stays as it stood; Regard for them decays like any other (DL-46).
// - **Retirement.** Once a year, on the night of the Day each anniversary of the Hero's
//   `enteredTurn` falls on, one draw from the `heroes` stream: the chance is
//   `heroRetirementChancePerYear` for each whole year of age past `heroRetirementAge`, times
//   `heroRetirementInjuredMultiplier` while injured, at most 1. A Hero away on a Quest that night
//   is checked instead on the night their Party brings them home, read from their `quest.taken`
//   entry in the History. A Hero who retires leaves the Roster, keeps their row, their Guild and
//   `retiredOnTurn`, with `hero.retired`. Every due check draws, whatever the Hero's age, so the
//   draws do not shift when the age or the chance is tuned.
//
// The `heroes` stream is the only one this phase moves.

import type { GameConfig } from '../config.js';
import { rowOf, type Hero, type HeroId, type History, type Turn, type World } from '../document.js';
import type { EngineEvent, QuestTaken } from '../events.js';
import { streamOf } from '../generators/draw.js';
import { decayHeroRegard } from '../hero-regard.js';
import { moraleBand, moraleBaselineFor, moraleChanged } from '../morale.js';
import { chance } from '../rng.js';
import { ageOf, dayOf, nightOf, turnsPerDay } from '../time.js';
import { replacedBy } from '../traits.js';
import type { PhaseContext, PhaseRun } from './phase.js';
import { activeRosterHeroes } from './roster-walk.js';

export const heroState: PhaseRun = (world, ctx) => {
  const events: EngineEvent[] = [];
  for (const { guild, hero } of activeRosterHeroes(world)) {
    events.push(...heroNight(hero, world, ctx));
    if (!retirementCheckDue(hero, ctx)) continue;
    const age = ageOf(hero, ctx.turn, ctx.config);
    if (!chance(streamOf(world, 'heroes'), retirementChance(hero, age, ctx.config))) continue;
    hero.retiredOnTurn = ctx.turn;
    guild.rosterIds = guild.rosterIds.filter((id) => id !== hero.id);
    events.push(
      ctx.emit({ type: 'hero.retired', participants: [hero.id], payload: { heroId: hero.id, guildId: guild.id, age } }),
    );
  }
  return events;
};

/** What a Hero's night reads of the phase's context. */
export type HeroNightContext = Pick<PhaseContext, 'config' | 'content' | 'turn' | 'emit'>;

/**
 * One night of `hero`'s State before the Retirement check: healing, Morale drift and Regard decay, in
 * that order, as described above. It draws nothing. The chance estimate runs it on copies of a
 * proposed Party for each night they would be away (v1.1.4-S5's verification, estimate.ts); the
 * Retirement check, which draws, is never due for a Hero away on a Quest.
 */
export function heroNight(hero: Hero, world: World, ctx: HeroNightContext): EngineEvent[] {
  return [...heal(hero, ctx), ...drift(hero, world, ctx), ...decayHeroRegard(hero, world, ctx)];
}

/**
 * Clears an Injury whose night has come, adding the Trait its type leaves if the Hero lacks it, in
 * place of each they hold that it conflicts with (`replacedBy`, v1.1.4-S7), each lost with
 * `hero.trait-lost`.
 */
function heal(hero: Hero, ctx: HeroNightContext): EngineEvent[] {
  const { injury } = hero;
  if (injury === null || injury.healsOnTurn > ctx.turn) return [];
  // A type content no longer defines heals on its night and leaves nothing (data-model rule 5).
  const type = rowOf(ctx.content.injuries, injury.typeKey);
  const leaves = type?.leavesTrait ?? null;
  const traitKey = leaves !== null && !hero.traits.includes(leaves) ? leaves : null;
  const lost = traitKey === null ? [] : replacedBy(hero.traits, traitKey, ctx.content);
  if (traitKey !== null) hero.traits = [...hero.traits.filter((held) => !lost.includes(held)), traitKey];
  hero.injury = null;
  return [
    ctx.emit({ type: 'hero.healed', participants: [hero.id], payload: { heroId: hero.id, typeKey: injury.typeKey, traitKey } }),
    ...lost.map((held) =>
      ctx.emit({ type: 'hero.trait-lost', participants: [hero.id], payload: { heroId: hero.id, traitKey: held, replacedBy: traitKey as string } }),
    ),
  ];
}

/** Moves Morale toward the Hero's baseline without passing it; an event only when a band is crossed. */
function drift(hero: Hero, world: World, ctx: HeroNightContext): EngineEvent[] {
  const baseline = moraleBaselineFor(hero, world, ctx.config, ctx.content);
  const step = ctx.config.moraleDrift;
  const before = hero.morale;
  hero.morale = before < baseline ? Math.min(baseline, before + step) : Math.max(baseline, before - step);
  if (moraleBand(before, ctx.config) === moraleBand(hero.morale, ctx.config)) return [];
  return [moraleChanged(hero, before, 'drift', ctx.config, ctx.emit)];
}

/**
 * The yearly chance `hero` retires at `age`: `heroRetirementChancePerYear` for each whole year past
 * `heroRetirementAge`, none at or below it, multiplied while injured, held inside 0 to 1.
 */
export function retirementChance(
  hero: Pick<Hero, 'injury'>,
  age: number,
  config: Pick<GameConfig, 'heroRetirementAge' | 'heroRetirementChancePerYear' | 'heroRetirementInjuredMultiplier'>,
): number {
  const yearsPast = Math.max(0, age - config.heroRetirementAge);
  const multiplier = hero.injury === null ? 1 : config.heroRetirementInjuredMultiplier;
  return Math.min(1, Math.max(0, config.heroRetirementChancePerYear * yearsPast * multiplier));
}

/**
 * Whether `hero`'s yearly check falls tonight: tonight is an anniversary night and the Hero is
 * home, or the Hero came home tonight from a Quest they were away on over the last anniversary
 * night. An away Hero is never checked. The `ageing` phase, which runs next, asks it too, so a
 * Hero's decline falls on the nights of their Retirement check (M3-S4, DL-37).
 */
export function retirementCheckDue(hero: Hero, ctx: PhaseContext): boolean {
  if (hero.partyId !== null) return false;
  if (lastAnniversaryNight(hero, ctx.turn, ctx.config) === ctx.turn) return true;
  const departed = departureOfAPartyHomeTonight(ctx.history, hero.id, ctx.turn);
  if (departed === null) return false;
  const missed = lastAnniversaryNight(hero, ctx.turn - 1, ctx.config);
  // A Party that left on an anniversary night left after that night's check.
  return missed !== null && missed > departed;
}

/**
 * The latest anniversary night of `hero` at or before `turn`, or `null` before the first: the night
 * Turn of the Day on which `enteredTurn + k × turnsPerYear` falls, for the largest whole `k` from 1
 * whose night is not after `turn`. Exported for its tests.
 */
export function lastAnniversaryNight(
  hero: Pick<Hero, 'enteredTurn'>,
  turn: Turn,
  config: Pick<GameConfig, 'turnsPerYear'>,
): Turn | null {
  // The last Day whose night is not after `turn`, and the last Turn of that Day.
  const lastDay = Math.floor((turn - nightOf(0)) / turnsPerDay);
  if (lastDay < 0) return null;
  const years = Math.floor((lastDay * turnsPerDay + (turnsPerDay - 1) - hero.enteredTurn) / config.turnsPerYear);
  if (years < 1) return null;
  return nightOf(dayOf(hero.enteredTurn + years * config.turnsPerYear));
}

/**
 * The Turn `heroId` set out on the Quest their Party came home from on `turn`, read from the latest
 * `quest.taken` entry naming them in the History before this Turn; `null` when that Party was not
 * due home tonight, or the Hero has never been sent.
 */
function departureOfAPartyHomeTonight(history: Readonly<History>, heroId: HeroId, turn: Turn): Turn | null {
  const positions = Object.hasOwn(history.byEntity, heroId) ? (history.byEntity[heroId] ?? []) : [];
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const entry = history.entries[positions[index] ?? -1];
    if (entry?.type !== 'quest.taken') continue;
    const { returnsOnTurn } = entry.payload as QuestTaken['payload'];
    return returnsOnTurn === turn ? entry.turn : null;
  }
  return null;
}
