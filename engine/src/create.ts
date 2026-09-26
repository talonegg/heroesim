// `createWorld` (M1-S6, approach §3): a seeded World State at Turn 0 and the events that
// explain it. The order below is DL-19 item 9; changing it changes every seed's world. Since
// M2-S3 the first Board is drawn last, from the `board` stream, so a new game opens on a full
// Board rather than waiting for the first morning phase at Turn 3 (DL-25).

import type { EngineDeps } from './config.js';
import type { BackgroundKey } from './content-types.js';
import { emptyDocument, type Meta, type WorldDocument } from './document.js';
import type { EngineEvent, WorldCreated } from './events.js';
import { dealEvenly, sortedKeys, streamOf } from './generators/draw.js';
import { dealtDisposition, generateGuild, generateRival } from './generators/guilds.js';
import { generateHero } from './generators/heroes.js';
import { generatePatron } from './generators/patrons.js';
import { append } from './history.js';
import { boardRefresh } from './phases/board-refresh.js';
import { marketRefresh } from './phases/market-refresh.js';
import { phaseContext } from './phases/phase.js';
import { createStreams, streamNames } from './rng.js';

/** What the player chooses before a game begins. */
export interface WorldSetup {
  guildmasterName: string;
  guildName: string;
  /** A Background with `owner: "guild"`; drawn as a Rival's is when omitted. */
  backgroundKey?: BackgroundKey;
  /** Stored in `meta` and never read by a rule: a front end's clock, or `"harness"` (D10.1). */
  createdAt: string;
}

export interface CreatedWorld {
  document: WorldDocument;
  /** Every entry the History starts with, in order: the same objects, `world.created` first. */
  events: EngineEvent[];
}

/**
 * Creates a world from `seed` and the player's `setup`, under `deps.config` and `deps.content`
 * (DL-19 item 9): `meta`, one stream per core stream name, the player's Guild first (so it is
 * `guild-000001`), then `rivalCount` Rival Guilds, `patronCount` Patrons with their Spheres dealt
 * evenly, and `unattachedPoolSize` Unattached Heroes, every draw from `generation`; then the
 * morning's Board refresh, drawing `boardSize` Quests from `board` (DL-25), and its Market
 * refresh, drawing `marketSize` stacks from `market` (DL-51). Appends
 * `world.created` and every generator's events to the new History and returns them.
 *
 * Throws on a programming error: a blank name, or a `backgroundKey` that is not a Guild
 * Background. A front end checks its input before calling.
 */
export function createWorld(seed: string, setup: WorldSetup, deps: EngineDeps): CreatedWorld {
  const { config, content } = deps;
  const meta: Meta = {
    version: config.schemaVersion,
    seed,
    content: { id: content.id, version: content.version },
    config: { ...config },
    createdAt: setup.createdAt,
  };
  const document = emptyDocument(meta, createStreams(seed, streamNames));
  const { world } = document;
  const generation = streamOf(world);
  const generated: EngineEvent[] = [];

  const player = generateGuild(world, deps, {
    controller: { kind: 'player' },
    rosterSize: config.startingRosterSize,
    wealth: config.startingWealth,
    name: setup.guildName,
    guildmasterName: setup.guildmasterName,
    ...(setup.backgroundKey === undefined ? {} : { backgroundKey: setup.backgroundKey }),
  });
  generated.push(...player.events);

  // Each Rival draws its Roster size and Wealth before it is generated (DL-19 item 9), and is dealt
  // its Disposition round-robin, which draws nothing (M6-S1, DL-56).
  for (let rival = 0; rival < config.rivalCount; rival += 1) {
    const controller = { kind: 'rival', disposition: dealtDisposition(content, rival) } as const;
    generated.push(...generateRival(world, deps, { controller }).events);
  }

  for (const sphereKey of dealEvenly(generation, sortedKeys(content.spheres), config.patronCount)) {
    generated.push(...generatePatron(world, deps, { sphereKey }).events);
  }

  for (let hero = 0; hero < config.unattachedPoolSize; hero += 1) {
    generated.push(...generateHero(world, deps).events);
  }

  // Turn 0 is a morning whose phases never run (DL-24), so its Board is drawn here, by the same
  // refresh, from `board` alone: the world above is what it was before M2-S3.
  generated.push(...boardRefresh(world, phaseContext(world, deps)));
  // The Market likewise (M5-S4, DL-51), from `market` alone, after the Board as on every morning.
  generated.push(...marketRefresh(world, phaseContext(world, deps)));

  const created: WorldCreated = {
    turn: world.turn,
    type: 'world.created',
    participants: [],
    labels: {},
    milestone: false,
    payload: { seed },
  };
  const events: EngineEvent[] = [created, ...generated];
  for (const event of events) append(document.history, event);
  return { document, events };
}
