/**
 * What a failed Beat costs the person who failed it (E3-S1). A plain failure may leave an
 * Injury that lifts; a badly failed one may leave a Scar that never does, or kill them.
 *
 * Three rules hold this together and are worth stating in one place:
 *
 * - **Critical failure is not a fourth `BeatResult`.** `Vignette.outcomes` is keyed on the
 *   three results, so a fourth would invalidate every authored Vignette. It is a failure
 *   whose margin the engine reads off the numbers the Check already produced (E3 §3).
 * - **Authored harm wins.** A Vignette outcome that already carries a `trait` Consequence
 *   says what happens, and the engine adds nothing on top of it. Harm is the fallback for
 *   the outcomes content did not speak for, never a burden on the ones it did.
 * - **One harm per Beat.** The margin is classified once and at most one Trait is given,
 *   so a Hero never comes home with three new Injuries from one Check.
 *
 * An Injury, a Scar and a Death are `HeroTrait`s or an exit; there is no parallel harm
 * system anywhere (ADR-0005).
 */

import type { GameConfig } from './config.js';
import type { Content, TraitDef } from './content.js';
import type { GameEvent } from './events.js';
import type { Rng } from './rng.js';
import { giveTrait } from './state.js';
import type { Career, Hero, Party } from './types.js';

/** Why a Hero left the Roster having died on the work. */
export const REASON_DIED_ON_THE_WORK = 'did not come back from the work';

/** How badly a Check went, as far as harm is concerned. */
export type InjuryOutcome = 'none' | 'injury' | 'critical';

/**
 * Classify a Check's margin. Pure, and the RNG draws are made by the caller, so the whole
 * of the rule is table-testable against a total and a DC.
 *
 * @param total the Check's total: roll plus Stat plus Trait modifiers plus Backing
 * @param dc what it had to reach
 * @returns `'none'` where the Check was not failed at all, `'critical'` where it was
 * failed by `config.criticalMargin` or more, and `'injury'` for every failure between.
 */
export function injuryOutcome(total: number, dc: number, config: GameConfig): InjuryOutcome {
  if (total >= dc) return 'none';
  return total <= dc - config.criticalMargin ? 'critical' : 'injury';
}

/** The Traits of one kind this Hero does not already hold. */
function pool(content: Content, kind: TraitDef['kind'], hero: Hero): TraitDef[] {
  const held = new Set(hero.traits.map((trait) => trait.name));
  return content.traits.filter((trait) => trait.kind === kind && !held.has(trait.name));
}

/** Move a Hero who died off the Roster, out of their Party, and into the Guild's history. */
function die(draft: Career, hero: Hero, party: Party, beatIndex: number, events: GameEvent[]): void {
  draft.guild.roster = draft.guild.roster.filter((candidate) => candidate.id !== hero.id);
  // Out of the Party as well as off the Roster, so the Commission's later Beats cannot
  // draw them and the return names only the people who walked back through the door. A
  // Party with nobody left comes home the same Day (DL-16 §6).
  party.heroIds = party.heroIds.filter((id) => id !== hero.id);
  hero.exit = { kind: 'death', onDay: draft.day, reason: REASON_DIED_ON_THE_WORK };
  draft.guild.formerHeroes.push(hero);
  draft.ledger.heroesDied += 1;
  events.push({
    type: 'HeroDied',
    day: draft.day,
    heroId: hero.id,
    partyId: party.id,
    beatIndex,
  });
}

/**
 * Whether this outcome already says what happens to the slot Hero. Authored harm wins:
 * one `trait` Consequence anywhere in the outcome suppresses engine harm entirely.
 */
export function outcomeCarriesHarm(consequences: readonly { kind: string }[]): boolean {
  return consequences.some((consequence) => consequence.kind === 'trait');
}

/**
 * Give the slot Hero whatever the Beat cost them, if anything. Called once per Beat, after
 * the outcome's own Consequences have been applied.
 *
 * Death is drawn before the Scar, so that the rare case is never swallowed by the common
 * one (E3-S1). A Trait the Hero already holds is never drawn, and where the pool is empty
 * nothing happens at all.
 *
 * @param outcome the margin classification from {@link injuryOutcome}
 */
export function applyHarm(
  draft: Career,
  party: Party,
  hero: Hero,
  beatIndex: number,
  outcome: InjuryOutcome,
  content: Content,
  rng: Rng,
  events: GameEvent[],
): void {
  const { config } = draft;
  if (outcome === 'none') return;

  if (outcome === 'injury') {
    if (!rng.chance(config.injuryChanceOnFailure)) return;
    const candidates = pool(content, 'injury', hero);
    if (candidates.length === 0) return;
    const trait = rng.pick(candidates);
    const span = rng.between(config.injurySpanMin, config.injurySpanMax);
    const liftsOn = giveTrait(draft, hero, trait.name, span, events, trait.kind);
    if (liftsOn === undefined) return;
    draft.ledger.heroesInjured += 1;
    events.push({
      type: 'HeroInjured',
      day: draft.day,
      heroId: hero.id,
      trait: trait.name,
      liftsOn,
      partyId: party.id,
      beatIndex,
    });
    return;
  }

  if (rng.chance(config.deathChanceOnCriticalFailure)) {
    die(draft, hero, party, beatIndex, events);
    return;
  }
  if (!rng.chance(config.scarChanceOnCriticalFailure)) return;
  const candidates = pool(content, 'scar', hero);
  if (candidates.length === 0) return;
  const trait = rng.pick(candidates);
  giveTrait(draft, hero, trait.name, undefined, events, trait.kind);
  draft.ledger.heroesScarred += 1;
  events.push({
    type: 'HeroScarred',
    day: draft.day,
    heroId: hero.id,
    trait: trait.name,
    partyId: party.id,
    beatIndex,
  });
}
