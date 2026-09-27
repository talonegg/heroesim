// Games in a given state, for the page's tests (M7-S3 part 2, DL-73). Tests outside `state/` take
// only types from the engine (M7-S2's import check), so the setups that need its values live here:
// a Transfer Offer standing, rules behind this release's, Items held, Wealth, Heroes dead, retired
// and gone from the world (DL-74). Never imported by the page, so never bundled.

import {
  addStack,
  defaultConfig,
  offerTransfer,
  playerGuild,
  type Guild,
  type HeroId,
  type ItemDefinitionKey,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { gameReducer, initialGameState, type GameState, type Play } from './reducer';

/** Plays `action` as the page does, accepted then settled, outside React. */
export function played(state: GameState, action: Play): GameState {
  return gameReducer(gameReducer(state, action), { kind: 'settle' });
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

/** The player's Guild with `wealth` Wealth. */
export function withWealth(state: GameState, wealth: number): GameState {
  return changed(state, (_, player) => {
    player.wealth = wealth;
  });
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
