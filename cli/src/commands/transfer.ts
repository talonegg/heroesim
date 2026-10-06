// `transfer --hero <id> --to <guildId>`, `transfer --hero <id> --in`, `accept --offer <id>`,
// `decline --offer <id>` and `show offers` (M6-S2, R28, DL-57): the player's Guild sends a Hero to
// another Guild, takes one from another Guild's Roster, or answers a Rival's Transfer Offer. What the
// commands do to an open save and what they print; `main.ts` opens the save, and writes it back only
// when the command succeeds.
//
// The CLI holds no rule: the engine's Transfer actions decide, a refusal is their typed rejection
// put into words here (ADR-0003), and a fee is the engine's `transferFee`.

import {
  applyAction,
  offersTo,
  playerGuild,
  type AcceptTransferRejection,
  type DeclineTransferRejection,
  type EngineDeps,
  type EngineEvent,
  type Guild,
  type TransferInRejection,
  type TransferOutRejection,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { transferLockedWords, transferRefusalWords, type Calendar } from '@heroesim/words';
import { narrateLine } from '../namer.js';
import { renderTime, rowIn, table } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** A Hero by name and id, or the id alone when the save has no such Hero. */
function heroCalled(world: World, heroId: string): string {
  const hero = rowIn(world.heroes, heroId);
  return hero === undefined ? heroId : `${hero.name} (${heroId})`;
}

/** A Guild by name, or its id when the save has no such Guild. */
function guildCalled(world: World, guildId: string): string {
  return rowIn(world.guilds, guildId)?.name ?? guildId;
}

type Refusal = TransferInRejection | TransferOutRejection | AcceptTransferRejection | DeclineTransferRejection;

/** A Transfer action's rejection in words, its dates by the save's calendar. */
function explain(rejection: Refusal, player: Guild, world: World, calendar: Calendar): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guildCalled(world, rejection.guildId)} has folded and deals no more.`;
    case 'hero-not-on-roster':
      return rejection.action === 'transferOut'
        ? `${heroCalled(world, rejection.heroId)} is not on ${player.name}'s Roster (show roster).`
        : `${heroCalled(world, rejection.heroId)} is on no other Guild's Roster (show roster <guildId>).`;
    case 'same-guild':
      return rejection.action === 'transferOut'
        ? `${player.name} cannot transfer a Hero to itself.`
        : `That Hero is already on ${player.name}'s Roster.`;
    case 'hero-in-party':
      return `${heroCalled(world, rejection.heroId)} is away with ${rejection.partyId}; a Hero is transferred only from the Hall.`;
    case 'recently-transferred':
      return transferLockedWords(heroCalled(world, rejection.heroId), rejection.transferredOnTurn, rejection.untilTurn, calendar);
    case 'transfer-refused': {
      const other = rowIn(world.guilds, rejection.guildId);
      const way = rejection.side === 'out' ? 'part with' : 'take';
      return `${guildCalled(world, rejection.guildId)} will not ${way} ${heroCalled(world, rejection.heroId)}: ${transferRefusalWords(rejection.because, other)}.`;
    }
    case 'insufficient-wealth':
      return `The fee is ${rejection.fee} Wealth; ${guildCalled(world, rejection.guildId)} has ${rejection.wealth}.`;
    case 'offer-not-found':
      return `No Transfer Offer ${rejection.offerId} stands for ${player.name}'s Heroes (show offers).`;
  }
}

/** The lines a successful Transfer prints: each event in the CLI's words, then the Guild's Wealth and Roster. */
function done(document: WorldDocument, events: readonly EngineEvent[], guildId: Guild['id'], deps: EngineDeps): string[] {
  const guild = rowIn(document.world.guilds, guildId);
  return [
    ...events.map((event) => narrateLine(event, deps.content, deps.config)),
    `${guild?.name ?? guildId}: Wealth ${guild?.wealth ?? 0}; ${guild?.rosterIds.length ?? 0} Heroes on the Roster.`,
  ];
}

/**
 * `transfer --hero <id> --to <guildId>` sends a Hero of the player's Guild to another Guild, which
 * must consent and pays the fee (`transferOut`); `transfer --hero <id> --in` takes a Hero from another
 * Guild's Roster, which must consent, for the fee (`transferIn`).
 */
export function transferHero(
  command: Extract<Command, { name: 'transfer' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const { world } = document;
  const player = playerGuild(world);
  if (player === undefined) return { ok: false, problem: "The save has no player's Guild." };
  if ('to' in command) {
    if (rowIn(world.guilds, command.to) === undefined) return { ok: false, problem: `The save has no Guild ${command.to} (show guilds).` };
    const result = applyAction(document, { kind: 'transferOut', guildId: player.id, heroId: command.hero, toGuildId: command.to }, deps);
    if (!result.ok) return { ok: false, problem: explain(result.rejection, player, world, deps.config) };
    return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
  }
  const result = applyAction(document, { kind: 'transferIn', guildId: player.id, heroId: command.hero }, deps);
  if (!result.ok) return { ok: false, problem: explain(result.rejection, player, world, deps.config) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}

/** `accept --offer <id>` and `decline --offer <id>`: the player's Guild answers a Transfer Offer. */
export function answerOffer(
  command: Extract<Command, { name: 'accept' | 'decline' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const { world } = document;
  const player = playerGuild(world);
  if (player === undefined) return { ok: false, problem: "The save has no player's Guild." };
  const kind = command.name === 'accept' ? 'acceptTransfer' : 'declineTransfer';
  const result = applyAction(document, { kind, guildId: player.id, offerId: command.offer }, deps);
  if (!result.ok) return { ok: false, problem: explain(result.rejection, player, world, deps.config) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}

/**
 * `show offers`: the Transfer Offers standing for Heroes of the player's Guild, with the ids `accept`
 * and `decline` take, who offers what for whom, and the night each expires.
 */
export function renderOffers(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const player = playerGuild(world);
  if (player === undefined) return ["The save has no player's Guild."];
  const offers = offersTo(world, player.id);
  if (offers.length === 0) return [`No Transfer Offer stands for ${player.name}'s Heroes.`];
  return [
    `Transfer Offers for ${player.name}'s Heroes: ${offers.length}. Answer with accept --offer <id> or decline --offer <id>.`,
    '',
    ...table(
      [{ heading: 'Offer' }, { heading: 'From' }, { heading: 'For' }, { heading: 'Fee', align: 'right' }, { heading: 'Until' }],
      offers.map((offer) => [
        offer.id,
        guildCalled(world, offer.toGuildId),
        heroCalled(world, offer.heroId),
        String(offer.fee),
        renderTime(offer.expiresOnTurn, deps.config),
      ]),
    ),
  ];
}
