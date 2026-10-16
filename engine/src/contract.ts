// Contracts (DL-294 item 6, DL-311, DL-315): a Hero's term with the Guild whose Roster they are on, its
// wage set at signing by one rule and fixed for the term, its length chosen by the signer from
// `contractLengthsYears`. Every signing signs one here, for every Guild alike (ADR-0002): `recruit`, a
// Transfer (`makeTransfer`) and a Guild's founding. A Hero leaving a Roster holds none (`leaveRoster`,
// a fold).

import type { Rejection } from './actions/result.js';
import type { EngineDeps, GameConfig } from './config.js';
import type { Contract, Guild, Hero, World } from './document.js';
import { streamOf } from './generators/draw.js';
import { feeFactor, guildmasterOf } from './guildmaster.js';
import { int } from './rng.js';
import { heroStatSum } from './selectors.js';
import { dayOf, daysPerYear } from './time.js';

/**
 * A Contract's wage (Q6, Q7b, DL-294 item 6): (`wageBase` + `wagePerLevel` × Level + the Hero's Stat
 * sum ÷ `wageStatDivisor` + `wageFameFactor` × the Guild's Fame) × the length's factor
 * (`contractWageFactors`) × the Guild's Guildmaster's Negotiation as a fee reads it (1 − negotiation,
 * `feeFactor`), rounded down once, at the end, to whole Silver.
 *
 * The one rule, reading the whole game, the Hero, the signing Guild and its Roster, so that the
 * backlog's terms (DL-294 item 8: reputation, personality, Regard, teammates' wages) join inside it.
 * The front ends show it at each length before signing. Throws on a length `contractLengthsYears`
 * does not hold: the actions refuse one first (`lengthNotOffered`).
 */
export function contractWage(
  world: World,
  hero: Hero,
  guild: Guild,
  years: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  const { config, content } = deps;
  const index = config.contractLengthsYears.indexOf(years);
  if (index < 0) throw new RangeError(`A Contract is ${config.contractLengthsYears.join(', ')} years long; got ${years}`);
  const factor = config.contractWageFactors[index] as number;
  const base =
    config.wageBase + config.wagePerLevel * hero.level + heroStatSum(hero, content) / config.wageStatDivisor + config.wageFameFactor * guild.fame;
  return Math.floor(base * factor * feeFactor(guildmasterOf(guild, world), content, config));
}

/** A signing's length is not one `contractLengthsYears` offers: the length asked, and those offered. */
export interface LengthNotOffered<Action extends string = string> extends Rejection<Action, 'length-not-offered'> {
  years: number;
  offered: number[];
}

/** The refusal of a signing for `years`, or `null` when `contractLengthsYears` offers it. */
export function lengthNotOffered<Action extends string>(
  action: Action,
  years: number,
  config: Pick<GameConfig, 'contractLengthsYears'>,
): LengthNotOffered<Action> | null {
  return config.contractLengthsYears.includes(years) ? null : { action, reason: 'length-not-offered', years, offered: [...config.contractLengthsYears] };
}

/**
 * Signs `hero` to `guild` for `years` now, replacing any Contract they held: the wage by the rule
 * (`contractWage`), this Turn, and the end Day `years` years of Days on (`daysPerYear`). Returns it.
 */
export function signContract(world: World, hero: Hero, guild: Guild, years: number, deps: Pick<EngineDeps, 'config' | 'content'>): Contract {
  const wage = contractWage(world, hero, guild, years, deps);
  const contract: Contract = { wage, signedOnTurn: world.turn, years, endDay: dayOf(world.turn) + years * daysPerYear(deps.config) };
  hero.contract = contract;
  return contract;
}

/**
 * A founding Contract (Q7c, Q-E, DL-311 item 2): its length drawn evenly from `contractLengthsYears`,
 * and its term already part-way run, its end Day drawn evenly over the term's Days from tomorrow, so that
 * a founding Roster's Contracts do not end together. Two draws from `contracts` whatever is drawn
 * (ADR-0009), so no draw of `generation` moves. The wage is the rule's at the drawn length.
 */
export function foundingContract(world: World, hero: Hero, guild: Guild, deps: Pick<EngineDeps, 'config' | 'content'>): Contract {
  const state = streamOf(world, 'contracts');
  const lengths = deps.config.contractLengthsYears;
  const years = lengths[int(state, 0, lengths.length - 1)] as number;
  const daysLeft = int(state, 1, years * daysPerYear(deps.config));
  const contract = signContract(world, hero, guild, years, deps);
  contract.endDay = dayOf(world.turn) + daysLeft;
  return contract;
}
