/**
 * Resolving one Beat: choose the Vignette, fill its Hero slot, make the Check, and apply
 * what the outcome does to the world. A Commission is a run of Beats (ADR-0006).
 */

import { beatDc, resolveCheck } from './check.js';
import type { Consequence, Content, TraitDef } from './content.js';
import type { GameEvent } from './events.js';
import type { Rng } from './rng.js';
import {
  changeCoin,
  changeHeroRegardForGuildmaster,
  changePatronRegard,
  giveTrait,
  requireHero,
  requirePatron,
} from './state.js';
import type { Career, Hero, Party } from './types.js';
import { fillHeroSlot, selectVignette } from './vignette.js';

function applyConsequence(
  draft: Career,
  party: Party,
  hero: Hero,
  consequence: Consequence,
  events: GameEvent[],
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
      giveTrait(draft, hero, consequence.trait, consequence.days, events);
      break;
    case 'score':
      party.score += consequence.delta;
      break;
  }
}

/**
 * Resolve the next Beat of a Party's Commission. Appends its result to the Party and
 * everything that happened to `events`.
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
  const heroes = party.heroIds.map((id) => requireHero(draft, id));
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
  const dc = beatDc(vignette.difficulty, commission, config);
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

  for (const consequence of vignette.outcomes[check.result].consequences) {
    applyConsequence(draft, party, slot.hero, consequence, events);
  }
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
