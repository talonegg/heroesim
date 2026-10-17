// `transfer --hero <id> --to <guildId>`, `transfer --hero <id> --in`, `transfer --hero <id> --offer`
// (DL-326), `accept --offer <id>`, `decline --offer <id>` and `show offers` (M6-S2, R28, DL-57): the
// player's Guild sends a Hero to another Guild, takes one from another Guild's Roster, makes an Offer
// for one, or answers a Rival's Transfer Offer. What the commands do to an open save and what they
// print; `main.ts` opens the save, and writes it back only when the command succeeds.
//
// The CLI holds no rule: the engine's Transfer actions decide, a refusal is their typed rejection in
// the refusals' words (ADR-0003, DL-240), and a fee is the engine's `transferFee`.

import {
  applyAction,
  freeOffer,
  offersTo,
  playerGuild,
  type EngineDeps,
  type EngineEvent,
  type Guild,
  type World,
  type WorldDocument,
} from '@heroesim/engine';
import { coinLetters, rowOf } from '@heroesim/words';
import type { Command } from '../args.js';
import { narrateLine, refusalLine } from '../namer.js';
import { renderTime, table } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** A Hero by name and id, or the id alone when the save has no such Hero. */
function heroCalled(world: World, heroId: string): string {
  const hero = rowOf(world.heroes, heroId);
  return hero === undefined ? heroId : `${hero.name} (${heroId})`;
}

/** A Guild by name, or its id when the save has no such Guild. */
function guildCalled(world: World, guildId: string): string {
  return rowOf(world.guilds, guildId)?.name ?? guildId;
}

/** The lines a successful Transfer prints: each event in the CLI's words, then the Guild's Wealth and Roster. */
export function done(document: WorldDocument, events: readonly EngineEvent[], guildId: Guild['id'], deps: EngineDeps): string[] {
  const guild = rowOf(document.world.guilds, guildId);
  return [
    ...events.map((event) => narrateLine(event, deps.content, deps.config)),
    `${guild?.name ?? guildId}: Wealth ${coinLetters(guild?.wealth ?? 0)}; ${guild?.rosterIds.length ?? 0} Heroes on the Roster.`,
  ];
}

/**
 * `transfer --hero <id> --to <guildId>` sends a Hero of the player's Guild to another Guild, which
 * must consent and pays the fee (`transferOut`); `transfer --hero <id> --in` takes a Hero from another
 * Guild's Roster, which must consent, for the fee (`transferIn`); `transfer --hero <id> --offer
 * --years <y>` makes the player's Guild's Offer for a Hero (`offerTransfer`, as the Hero page's Offer
 * does): free for a Hero Out of Contract, priced for a Hero of a Guild that answers Offers (DL-326).
 */
export function transferHero(
  command: Extract<Command, { name: 'transfer' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const { world } = document;
  const setting = { world, content: deps.content, calendar: deps.config };
  const player = playerGuild(world);
  if (player === undefined) return { ok: false, problem: refusalLine({ action: 'transfer', reason: 'no-player-guild' }, setting) };
  if ('to' in command) {
    if (rowOf(world.guilds, command.to) === undefined) return { ok: false, problem: `The save has no Guild ${command.to} (show guilds).` };
    const result = applyAction(document, { kind: 'transferOut', guildId: player.id, heroId: command.hero, toGuildId: command.to }, deps);
    if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
    return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
  }
  const kind = 'offer' in command ? 'offerTransfer' : 'transferIn';
  const result = applyAction(document, { kind, guildId: player.id, heroId: command.hero, years: command.years }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}

/** `accept --offer <id>` and `decline --offer <id>`: the player's Guild answers a Transfer Offer. */
export function answerOffer(
  command: Extract<Command, { name: 'accept' | 'decline' }>,
  document: WorldDocument,
  deps: EngineDeps,
): CommandOutcome {
  const { world } = document;
  const setting = { world, content: deps.content, calendar: deps.config };
  const player = playerGuild(world);
  if (player === undefined) return { ok: false, problem: refusalLine({ action: command.name, reason: 'no-player-guild' }, setting) };
  const kind = command.name === 'accept' ? 'acceptTransfer' : 'declineTransfer';
  const result = applyAction(document, { kind, guildId: player.id, offerId: command.offer }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };
  return { ok: true, document: result.document, lines: done(result.document, result.events, player.id, deps) };
}

/**
 * `show offers`: the Transfer Offers standing for Heroes of the player's Guild, with the ids `accept`
 * and `decline` take, who offers what for whom, and the night each expires.
 */
export function renderOffers(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const player = playerGuild(world);
  if (player === undefined) return [refusalLine({ action: 'show', reason: 'no-player-guild' }, { world, content: deps.content, calendar: deps.config })];
  const offers = offersTo(world, player.id);
  if (offers.length === 0) return [`No Transfer Offer stands for ${player.name}'s Heroes.`];
  return [
    `Transfer Offers for ${player.name}'s Heroes: ${offers.length}. Answer with accept --offer <id> or decline --offer <id>.`,
    ...(offers.some((offer) => freeOffer(world, offer))
      ? ['A free Offer, for a Hero Out of Contract, cannot be declined: answer it with renew --hero <id> --years <years>, or the Hero goes when it expires.']
      : []),
    '',
    ...table(
      [{ heading: 'Offer' }, { heading: 'From' }, { heading: 'For' }, { heading: 'Fee', align: 'right' }, { heading: 'Until' }],
      offers.map((offer) => [
        offer.id,
        guildCalled(world, offer.toGuildId),
        heroCalled(world, offer.heroId),
        freeOffer(world, offer) ? 'Free' : coinLetters(offer.fee),
        renderTime(offer.expiresOnTurn, deps.config),
      ]),
    ),
  ];
}
