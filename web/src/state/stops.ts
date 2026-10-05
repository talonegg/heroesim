// Why time stopped, in the page's words (M7-S3, DL-66): the CLI's `narrateStop` adapted for the page,
// a Guild and a Hero by name alone, a Quest by its template's name and a Party counted, never an id;
// where the CLI points to a command, the page gives a button (`nextFor` in `views/stop.tsx`). The
// page's own framing, beside the narration's Namer (`namer.ts`, v1.1.6-S12, DL-186 item 1).

import type { GuildId, HeroId, StopReason, WorldDocument } from '@heroesim/engine';
import { listed, nightOf } from '@heroesim/words';
import type { Narration } from './namer';

/**
 * Why an advance or a fast forward stopped, in one sentence (the CLI's `narrateStop`). `document` is
 * where it stopped; `maxTurns` the cap it played under. Where the CLI points to a command, the page
 * gives a button (`nextFor` in `views/stop.tsx`).
 */
export function narrateStop(stop: StopReason, document: WorldDocument, maxTurns: number, narration: Narration): string {
  const { world } = document;
  const guildName = (guildId: GuildId): string => (Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId]?.name : undefined) ?? 'a Guild';
  const heroName = (heroId: HeroId): string => (Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId]?.name : undefined) ?? 'a Hero';
  switch (stop.kind) {
    case 'ended':
      return 'Stopped: the game is over.';
    case 'party-returned': {
      const parties = stop.partyIds.length === 1 ? 'Party' : `${stop.partyIds.length} Parties`;
      return `Stopped: ${guildName(stop.guildId)}'s ${parties} came home.`;
    }
    case 'below-floor':
      // M9-S1: the countdown stands in the header with the floor and the rest (`countdownView`).
      return (
        `Stopped: ${guildName(stop.guildId)} fell below the Bankruptcy floor: Bankruptcy on the night of Day ${stop.dueDay} ` +
        'unless its Wealth recovers by then.'
      );
    case 'decision-needed':
      return (
        `Stopped: a decision is needed: ${guildName(stop.guildId)} has no Party out, and could send one on ` +
        `${listed(stop.questIds.map((questId) => narration.questName(questId)))}.`
      );
    case 'quest-staffable':
      // M9-S1: the opt-in stop, whether or not a Party is out.
      return (
        `Stopped: a Quest to staff: ${guildName(stop.guildId)}'s Heroes at home could go on ` +
        `${listed(stop.questIds.map((questId) => narration.questName(questId)))}.`
      );
    case 'transfer-offer': {
      // M6-S2: each offer that arrived, and who made it.
      const offers = stop.offerIds.map((offerId) => {
        const offer = Object.hasOwn(world.offers, offerId) ? world.offers[offerId] : undefined;
        if (offer === undefined) return 'an Offer since withdrawn';
        return `${guildName(offer.toGuildId)} offers ${offer.fee} Wealth for ${heroName(offer.heroId)} until ${nightOf(offer.expiresOnTurn)}`;
      });
      return `Stopped: a Transfer Offer: ${listed(offers)}.`;
    }
    case 'module':
      // M8-S2: an installed module's hook asked for the stop.
      return `Stopped: the ${stop.moduleId} Module asked to stop.`;
    case 'max-turns':
      return `Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed':
      return `Stopped: new in the Unattached pool: ${listed(stop.heroIds.map(heroName))}.`;
  }
}
