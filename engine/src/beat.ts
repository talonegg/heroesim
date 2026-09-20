/**
 * Resolving one Beat: choose the Vignette, fill its Hero slot, make the Check, and apply
 * what the outcome does to the world. A Commission is a run of Beats (ADR-0006).
 */

import { beatDc, resolveCheck } from './check.js';
import { clamp } from './config.js';
import type { Consequence, Content, TraitDef } from './content.js';
import type { GameEvent } from './events.js';
import { applyHarm, injuryOutcome, outcomeCarriesHarm } from './harm.js';
import { rivalById } from './rival.js';
import { rngOn, seedRng, type Rng } from './rng.js';
import {
  changeCoin,
  changeHeroRegardForGuildmaster,
  changePatronRegard,
  changeRivalRegard,
  findHero,
  giveTrait,
  requirePatron,
} from './state.js';
import type { Career, Hero, Party, Rival } from './types.js';
import { fillHeroSlot, selectVignette } from './vignette.js';

/**
 * The Rival a `rivalRegard` Consequence lands on when the authored outcome does not name
 * one — and it cannot name one, because Rivals are generated and their ids mean nothing
 * to an author (E5 §4).
 *
 * The choice is drawn from a stream derived from the Career's seed and this exact Beat,
 * never from `career.rng`. That is deliberate: authoring a Vignette which can sour a Rival
 * must not reshuffle the Beats of every Career that never fires it, and a Consequence is a
 * property of the Beat rather than of the sequence of play (DL-16 §1, DL-19 §1).
 */
function chosenRival(draft: Career, party: Party): Rival | undefined {
  if (draft.rivals.length === 0) return undefined;
  const rng = rngOn({
    rng: seedRng(`${draft.seed}:rival-regard:${party.id}:${party.beatsResolved.length}`),
  });
  return rng.pick(draft.rivals);
}

/**
 * Do what an authored outcome says, and report it. Shared with E6's Decisions: an option's
 * `consequences` are the same vocabulary as a Vignette outcome's and are applied by the
 * same code, so the two can never drift apart (E6 §4).
 */
export function applyConsequence(
  draft: Career,
  party: Party,
  hero: Hero,
  consequence: Consequence,
  events: GameEvent[],
  /** The TraitDefs, so a `trait` Consequence can put its kind on the Trait it gives (E6). */
  traits: ReadonlyMap<string, TraitDef>,
): void {
  events.push(
    consequence.kind === 'trait' || consequence.kind === 'heroRegardForGuildmaster'
      ? { type: 'ConsequenceApplied', day: draft.day, partyId: party.id, consequence, heroId: hero.id }
      : { type: 'ConsequenceApplied', day: draft.day, partyId: party.id, consequence },
  );
  switch (consequence.kind) {
    case 'coin':
      changeCoin(draft, consequence.delta, 'consequence', events);
      break;
    case 'patronRegard':
      changePatronRegard(
        draft,
        requirePatron(draft, party.commission.patronId),
        consequence.delta,
        consequence.reason,
        events,
      );
      break;
    case 'heroRegardForGuildmaster':
      changeHeroRegardForGuildmaster(draft, hero, consequence.delta, consequence.reason, events);
      break;
    case 'trait':
      giveTrait(draft, hero, consequence.trait, consequence.days, events, traits.get(consequence.trait)?.kind);
      break;
    case 'score':
      party.score += consequence.delta;
      break;
    case 'backing':
      // The Party works better or worse for what happened, for the rest of the Commission.
      // Clamped like every other Backing movement, so nothing authored can take a Party
      // past the bounds a committed one is held to (E6 §4).
      party.backing = clamp(
        party.backing + consequence.delta,
        draft.config.backingMin,
        draft.config.backingMax,
      );
      break;
    case 'rivalRegard': {
      // A named Rival that this Career does not hold does nothing at all, rather than
      // landing on somebody the author did not mean (E5 §4).
      const rival =
        consequence.rivalId === undefined
          ? chosenRival(draft, party)
          : rivalById(draft, consequence.rivalId);
      if (rival === undefined) break;
      const delta = changeRivalRegard(draft, rival, consequence.delta, consequence.reason);
      events.push({
        type: 'RivalRegardChanged',
        day: draft.day,
        rivalId: rival.id,
        delta,
        value: rival.regardForGuild.value,
        reason: consequence.reason,
      });
      break;
    }
  }
}

/**
 * Resolve the next Beat of a Party's Commission. Appends its result to the Party and
 * everything that happened to `events`.
 *
 * A Party whose members have all died resolves nothing: it comes home instead, which
 * `returnParties` does on the same Day (E3-S1).
 */
export function resolveBeat(
  draft: Career,
  party: Party,
  content: Content,
  rng: Rng,
  events: GameEvent[],
  traits: ReadonlyMap<string, TraitDef>,
): void {
  const { config } = draft;
  const commission = party.commission;
  const patron = requirePatron(draft, commission.patronId);
  // A Hero who died earlier in this Commission is off the Roster and out of `heroIds`, so
  // the Party is only ever the people still on it — short-handed, and still working.
  const heroes = party.heroIds
    .map((id) => findHero(draft, id))
    .filter((hero): hero is Hero => hero !== undefined);
  if (heroes.length === 0) return;
  const beatIndex = party.beatsResolved.length + 1;

  const vignette = selectVignette(
    content,
    {
      beatIndex,
      commissionTags: commission.tags,
      sphereId: patron.sphere,
      heroes,
      used: party.vignettesUsed,
    },
    rng,
  );
  const slot = fillHeroSlot(vignette, heroes, rng);
  // `party.dcDelta` is what an answered Decision did to the rest of the work: pressing on
  // without the guide makes every Beat that follows harder (E6-S3). Zero on a Party that
  // has never been asked anything, which is every Party before E6.
  const dc = beatDc(vignette.difficulty, commission, config, party.dcDelta);
  const check = resolveCheck(
    slot.hero,
    vignette.stat,
    vignette.tags,
    party.backing,
    dc,
    content,
    config,
    rng,
    traits,
  );

  party.beatsResolved.push(check.result);
  party.vignettesUsed.push(vignette.id);

  events.push({
    type: 'BeatResolved',
    day: draft.day,
    partyId: party.id,
    commissionId: commission.id,
    vignetteId: vignette.id,
    beatIndex,
    heroId: slot.hero.id,
    stat: vignette.stat,
    roll: check.roll,
    total: check.total,
    dc: check.dc,
    result: check.result,
    slots:
      slot.trait === undefined
        ? { heroId: slot.hero.id, patronId: patron.id, sphereId: patron.sphere }
        : { heroId: slot.hero.id, patronId: patron.id, sphereId: patron.sphere, trait: slot.trait },
  });

  party.score +=
    check.result === 'critical'
      ? config.scoreCritical
      : check.result === 'success'
        ? config.scoreSuccess
        : config.scoreFailure;

  const outcome = vignette.outcomes[check.result];
  for (const consequence of outcome.consequences) {
    applyConsequence(draft, party, slot.hero, consequence, events, traits);
  }

  // Authored harm wins: an outcome that already gives the slot Hero a Trait has said what
  // happens, and the engine adds nothing on top of it. Every probability and span below
  // is a named `GameConfig` field; no literal appears here (E3-S1).
  if (outcomeCarriesHarm(outcome.consequences)) return;
  applyHarm(
    draft,
    party,
    slot.hero,
    beatIndex,
    injuryOutcome(check.total, check.dc, config),
    content,
    rng,
    events,
  );
}

/**
 * Where a Commission's Beats fall. The span is divided into as many buckets as there are
 * Beats and one Day is drawn from each, so Beats are spread but never predictable, and
 * every Beat Day lies between the Day after departure and the Day of return.
 */
export function beatDaysFor(departedOn: number, returnsOn: number, beatCount: number, rng: Rng): number[] {
  const first = departedOn + 1;
  const slots = Math.max(1, returnsOn - first + 1);
  const days: number[] = [];
  for (let index = 0; index < beatCount; index += 1) {
    if (beatCount >= slots) {
      days.push(first + Math.min(index, slots - 1));
      continue;
    }
    const start = first + Math.floor((index * slots) / beatCount);
    const end = first + Math.floor(((index + 1) * slots) / beatCount) - 1;
    days.push(rng.between(start, Math.max(start, end)));
  }
  return days;
}
