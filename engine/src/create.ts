// `createWorld` (M1-S6, approach §3): a seeded World State at Turn 0 and the events that
// explain it. The order below is DL-19 item 9; changing it changes every seed's world.

import type { EngineDeps } from './config.js';
import type { BackgroundKey, DispositionKey } from './content-types.js';
import { emptyDocument, type Meta, type WorldDocument } from './document.js';
import type { EngineEvent, WorldCreated } from './events.js';
import { dealEvenly, sortedKeys, streamOf } from './generators/draw.js';
import { generateGuild } from './generators/guilds.js';
import { generateHero } from './generators/heroes.js';
import { generatePatron } from './generators/patrons.js';
import { append } from './history.js';
import { createStreams, int, streamNames } from './rng.js';

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
 * Every Rival's Disposition at creation: M2's one Disposition (INPUTS 4.12), a content key from
 * M2-S9. M6 adds the others.
 */
const firstDisposition: DispositionKey = 'steady';

/**
 * Creates a world from `seed` and the player's `setup`, under `deps.config` and `deps.content`
 * (DL-19 item 9): `meta`, one stream per core stream name, the player's Guild first (so it is
 * `guild-000001`), then `rivalCount` Rival Guilds, `patronCount` Patrons with their Spheres dealt
 * evenly, and `unattachedPoolSize` Unattached Heroes, every draw from `generation`. Appends
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

  for (let rival = 0; rival < config.rivalCount; rival += 1) {
    const rosterSize = int(generation, config.rivalRosterMin, config.rivalRosterMax);
    const wealth = int(generation, config.rivalStartingWealthMin, config.rivalStartingWealthMax);
    const controller = { kind: 'rival', disposition: firstDisposition } as const;
    generated.push(...generateGuild(world, deps, { controller, rosterSize, wealth }).events);
  }

  for (const sphereKey of dealEvenly(generation, sortedKeys(content.spheres), config.patronCount)) {
    generated.push(...generatePatron(world, deps, { sphereKey }).events);
  }

  for (let hero = 0; hero < config.unattachedPoolSize; hero += 1) {
    generated.push(...generateHero(world, deps).events);
  }

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
