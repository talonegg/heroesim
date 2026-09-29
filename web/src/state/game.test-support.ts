// Games in a given state, for the page's tests (M7-S3 part 2, DL-73). Tests outside `state/` take
// only types from the engine (M7-S2's import check), so the setups that need its values live here:
// a Transfer Offer standing, rules behind this release's, Items held, Wealth, Heroes dead, retired
// and gone from the world (DL-74); the Roster released, and a Party out, for fast forward's steps
// (v1.0.1-S5, DL-96). Never imported by the page, so never bundled.

import {
  addStack,
  availableHeroes,
  defaultConfig,
  durationDaysOf,
  makeId,
  offerTransfer,
  offeredQuests,
  partyFor,
  playerGuild,
  type EngineEventOf,
  type Guild,
  type Hero,
  type HeroId,
  type ItemDefinitionKey,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { gameReducer, initialGameState, type GameState, type Play } from './reducer';

/** Plays `action` as the page does, accepted then settled, a fast forward step by step, outside React. */
export function played(state: GameState, action: Play): GameState {
  let next = gameReducer(state, action);
  while (next.pending !== null) next = gameReducer(next, { kind: 'settle' });
  return next;
}

/** A new game of The Lantern, led by Ada Vell, from `seed`. */
export function started(seed = 'app-test'): GameState {
  return played(initialGameState, {
    kind: 'newGame',
    seed,
    guildName: 'The Lantern',
    guildmasterName: 'Ada Vell',
    createdAt: '2026-09-27T09:00:00.000Z',
  });
}

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

function playerOf(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild;
}

/** `state` with its world changed by `change` on a copy: the document the page holds is never written to. */
export function changed(state: GameState, change: (document: WorldDocument, player: Guild) => void): GameState {
  const document = structuredClone(documentOf(state));
  change(document, playerOf(document));
  return { ...state, document };
}

/** The player's Guild holding `quantity` of `definitionKey` besides what it held. */
export function holding(state: GameState, definitionKey: ItemDefinitionKey, quantity: number): GameState {
  return changed(state, (document, player) => addStack(document.world, definitionKey, quantity, { kind: 'guild', id: player.id }));
}

/**
 * The player's Guild with `wealth` Wealth; and, given `belowFloorSince`, below the Bankruptcy floor
 * since that Turn, as a Guild that fell below it before the play to come: its countdown stands, and
 * no new crossing stops a fast forward (M9-S1, DL-101).
 */
export function withWealth(state: GameState, wealth: number, belowFloorSince?: number): GameState {
  return changed(state, (_, player) => {
    player.wealth = wealth;
    if (belowFloorSince !== undefined) player.belowFloorSince = belowFloorSince;
  });
}

/**
 * The player's Roster released to the Unattached pool, as a fold releases a Rival's (DL-28), and
 * `wealth` to spare: no Party of theirs comes home, no decision is needed and no offer made for a
 * Hero of theirs, so a fast forward plays its whole cap unless the pool, a module or the end stops it.
 */
export function withRosterReleased(state: GameState, wealth = 1_000_000): GameState {
  return changed(state, (document, player) => {
    for (const heroId of player.rosterIds) {
      Object.assign(document.world.heroes[heroId] as Hero, { guildId: null, unattachedSince: document.world.turn });
    }
    player.rosterIds = [];
    player.wealth = wealth;
  });
}

/**
 * A Party of the player's out on the longest Quest on the Board the Roster can staff, sent by the
 * page's own dispatch: while it is out no decision is needed, so a fast forward stops when it
 * comes home (or for an offer, or at the end).
 */
export function withPartyOut(state: GameState): GameState {
  const document = documentOf(state);
  const available = availableHeroes(document.world, playerOf(document));
  const [longest] = offeredQuests(document.world)
    .flatMap((quest) => {
      const heroIds = partyFor(quest, available, content);
      return heroIds === null ? [] : [{ quest, heroIds }];
    })
    .sort((a, b) => durationDaysOf(b.quest) - durationDaysOf(a.quest));
  if (longest === undefined) throw new Error('no Quest on the Board the Roster can staff');
  const sent = played(state, { kind: 'dispatch', questId: longest.quest.id, heroIds: longest.heroIds });
  if (sent.rejection !== null) throw new Error(`dispatch refused: ${sent.rejection.reason}`);
  return sent;
}

/** `state` once a Party of the player's has come home: `withPartyOut`, then fast forward until it stops for it. */
export function cameHome(state: GameState): GameState {
  let next = withPartyOut(state);
  for (let tries = 0; tries < 5 && next.stoppedBecause?.kind !== 'party-returned'; tries += 1) {
    next = played(next, { kind: 'fastForward', until: [] });
  }
  if (next.stoppedBecause?.kind !== 'party-returned') throw new Error('no Party of the player came home');
  return next;
}

/** The namesakes `withNamesakesHurt` tells of: two Heroes who died and two injured, each pair of one name. */
export const namesakes = {
  died: [makeId('heroes', 901), makeId('heroes', 902)],
  injured: [makeId('heroes', 903), makeId('heroes', 904)],
  diedName: 'Finn Grimshaw',
  injuredName: 'Brenna Ashcombe',
} as const;

/**
 * `state`'s last play with the player's first outcome told again of namesakes (the M9 review): two
 * Heroes called Finn Grimshaw died on the Quest, and two called Brenna Ashcombe were injured, each
 * their own Hero. A Hero's name is not unique (`drawPersonName` avoids no name in use), so a row
 * tells them apart by id. The rest of the log is as it was.
 */
export function withNamesakesHurt(state: GameState): GameState {
  const guildId = playerOf(documentOf(state)).id;
  const index = state.log.findIndex((event) => event.type === 'quest.resolved' && (event as EngineEventOf<'quest.resolved'>).payload.guildId === guildId);
  const outcome = state.log[index] as EngineEventOf<'quest.resolved'> | undefined;
  if (outcome === undefined) throw new Error("no Party of the player's came home in the last play");
  const { died, injured, diedName, injuredName } = namesakes;
  const [typeKey] = Object.keys(content.injuries);
  if (typeKey === undefined) throw new Error('the content has no Injury');
  const told: EngineEventOf<'quest.resolved'> = {
    ...outcome,
    participants: [...outcome.participants, ...died, ...injured],
    labels: { ...outcome.labels, [died[0]]: diedName, [died[1]]: diedName, [injured[0]]: injuredName, [injured[1]]: injuredName },
    payload: {
      ...outcome.payload,
      heroIds: [...died, ...injured],
      deaths: [...died],
      injuries: injured.map((heroId, at) => ({ heroId, typeKey, healDays: 3 + at })),
    },
  };
  return { ...state, log: state.log.map((event, at) => (at === index ? told : event)) };
}

/** Every Rival rich enough to hire: whether one takes a Hero is then its Roster's and its Disposition's to say. */
export function withRichRivals(state: GameState): GameState {
  return changed(state, (document, player) => {
    for (const guild of Object.values(document.world.guilds)) if (guild.id !== player.id) guild.wealth = 100_000;
  });
}

/**
 * A Transfer Offer from the first Rival for the player's first Hero, made by the engine's own
 * `offerTransfer` (the Transfer Generator makes them at night, too rarely for a test to wait on);
 * the Rival is given the Wealth to make it.
 */
export function withOffer(state: GameState): GameState {
  const rich = withRichRivals(state);
  const document = documentOf(rich);
  const player = playerOf(document);
  const rival = Object.values(document.world.guilds).find((guild) => guild.id !== player.id);
  const heroId = player.rosterIds[0];
  if (rival === undefined || heroId === undefined) throw new Error('no Rival or Hero');
  const offered = offerTransfer(document, { guildId: rival.id, heroId }, { config: { ...defaultConfig, ...document.meta.config }, content });
  if (!offered.ok) throw new Error(`offerTransfer refused: ${offered.rejection.reason}`);
  return { ...rich, document: offered.document };
}

/** The game's rules `behind` config versions older than this release's, as a save from an earlier release has. */
export function withOlderRules(state: GameState, behind = 1): GameState {
  const document = documentOf(state);
  const config = { ...document.meta.config, configVersion: defaultConfig.configVersion - behind };
  return { ...state, document: { ...document, meta: { ...document.meta, config } } };
}

/** A Hero by id and name. */
export interface Named {
  id: HeroId;
  name: string;
}

/**
 * `state` with the player's first Hero dead and second retired, each off the Roster as the engine
 * leaves them, and a Hero of the Unattached pool gone from the world, whose History alone remains,
 * as it does for a Hero who left the pool: the Heroes the page opens from no Roster and no pool.
 */
export function withTheGone(state: GameState): { state: GameState; dead: Named; retired: Named; gone: Named } {
  let dead: Named | undefined;
  let retired: Named | undefined;
  let gone: Named | undefined;
  const next = changed(state, (document, player) => {
    const { world } = document;
    const [deadId, retiredId] = player.rosterIds;
    const deadHero = deadId === undefined ? undefined : world.heroes[deadId];
    const retiredHero = retiredId === undefined ? undefined : world.heroes[retiredId];
    const poolHero = Object.values(world.heroes).find((hero) => hero.unattachedSince !== null);
    if (deadHero === undefined || retiredHero === undefined || poolHero === undefined) throw new Error('expected two Heroes and a pool');
    deadHero.diedOnTurn = world.turn;
    retiredHero.retiredOnTurn = world.turn;
    player.rosterIds = player.rosterIds.filter((id) => id !== deadHero.id && id !== retiredHero.id);
    delete world.heroes[poolHero.id];
    dead = { id: deadHero.id, name: deadHero.name };
    retired = { id: retiredHero.id, name: retiredHero.name };
    gone = { id: poolHero.id, name: poolHero.name };
  });
  if (dead === undefined || retired === undefined || gone === undefined) throw new Error('unreachable');
  return { state: next, dead, retired, gone };
}
