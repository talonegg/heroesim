// The CLI's framing of an advance (M2-S11, DL-33): why a fast forward stopped, in one line, and what
// `advance` prints, each event one line in the CLI's words (`narrateLine`, the narration's sentence
// filled by the CLI's Namer). The stop's words are the CLI's own: the ids its commands take, and the
// command that answers, where the page puts a button (`web/src/state/stops.ts`).

import type { EngineDeps, StopReason, TurnEvent, WorldDocument } from '@heroesim/engine';
import { listed, nightOf } from '@heroesim/words';
import { narrateLine } from './namer.js';
import { renderCountdown, renderTime, rowIn, table } from './render.js';

/**
 * Why a fast forward stopped, in one line. `document` is where it stopped; `maxTurns` the cap it
 * played under.
 */
export function narrateStop(stop: StopReason, document: WorldDocument, maxTurns: number): string {
  const { world } = document;
  switch (stop.kind) {
    case 'ended':
      return 'Stopped: the game is over.';
    case 'party-returned': {
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      const parties = stop.partyIds.length === 1 ? 'Party' : 'Parties';
      return `Stopped: ${guild}'s ${parties} came home: ${listed(stop.partyIds)}.`;
    }
    case 'below-floor': {
      // M9-S1: the countdown's line follows with the floor and the rest (renderAdvance).
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: ${guild} fell below the Bankruptcy floor: Bankruptcy on the night of Day ${stop.dueDay} unless its Wealth recovers by then.`;
    }
    case 'decision-needed': {
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: a decision is needed: ${guild} has no Party out, and could send one on ${listed(stop.questIds)} (show board).`;
    }
    case 'quest-staffable': {
      // M9-S1: `--until staffable`, whether or not a Party is out.
      const guild = rowIn(world.guilds, stop.guildId)?.name ?? stop.guildId;
      return `Stopped: a Quest to staff: ${guild}'s Heroes at home could go on ${listed(stop.questIds)} (show board).`;
    }
    case 'transfer-offer': {
      // M6-S2: each offer that arrived, as `show offers` lists it, and the two commands that answer it.
      const offers = stop.offerIds.map((offerId) => {
        const offer = rowIn(world.offers, offerId);
        if (offer === undefined) return offerId;
        const bidder = rowIn(world.guilds, offer.toGuildId)?.name ?? offer.toGuildId;
        const wanted = rowIn(world.heroes, offer.heroId)?.name ?? offer.heroId;
        return `${bidder} offers ${offer.fee} Wealth for ${wanted} (${offer.heroId}) until ${nightOf(offer.expiresOnTurn)} (${offerId})`;
      });
      return `Stopped: a Transfer Offer: ${listed(offers)}. Answer with accept --offer <id> or decline --offer <id> (show offers).`;
    }
    case 'module':
      // M8-S2: an installed module's hook asked for the stop.
      return `Stopped: the ${stop.moduleId} Module asked to stop.`;
    case 'max-turns':
      return `Stopped: played the most Turns allowed, ${maxTurns}.`;
    case 'pool-refreshed': {
      const heroes = stop.heroIds.map((id) => {
        const row = rowIn(world.heroes, id);
        return row === undefined ? id : `${row.name} (${id})`;
      });
      return `Stopped: new in the Unattached pool: ${listed(heroes)} (show pool).`;
    }
  }
}

// ── Advancing ────────────────────────────────────────────────────────────────────────────────

/**
 * `advance`: how many Turns were played, where time stands now, why a fast forward stopped when it
 * was one (`stop`), the Bankruptcy countdown while the player's Guild is below the floor
 * (`renderCountdown`, DL-95), whether the game has ended, and each event of the Turns played,
 * oldest first, one line each in the CLI's words.
 */
export function renderAdvance(
  played: number,
  events: readonly TurnEvent[],
  document: WorldDocument,
  deps: EngineDeps,
  stop?: string,
): string[] {
  const { turn, ended } = document.world;
  return [
    `Played ${played} ${played === 1 ? 'Turn' : 'Turns'}. Now ${renderTime(turn, deps.config)}.`,
    ...(stop === undefined ? [] : [stop]),
    ...renderCountdown(document, deps),
    ...(ended === null ? [] : [`The game ended on Turn ${ended.turn}: ${ended.reason}.`]),
    '',
    ...(events.length === 0
      ? ['No events.']
      : [
          `Events: ${events.length}, oldest first`,
          '',
          ...table(
            [{ heading: 'Turn', align: 'right' }, { heading: 'What happened' }],
            events.map((event) => [String(event.turn), narrateLine(event, deps.content)]),
          ),
        ]),
  ];
}
