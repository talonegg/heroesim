// The Patron Generator (M1-S6). A Patron is a name, a Sphere and Regard. The Quest templates a
// Patron offers are looked up by Sphere in content when the Board is drawn (M2-S3), never stored,
// so a content change reaches every Patron without a migration (pre-M0 review D3).

import type { EngineDeps } from '../config.js';
import type { SphereKey } from '../content-types.js';
import { takeId, type EntityId, type Patron, type World } from '../document.js';
import type { PatronGenerated } from '../events.js';
import { pick } from '../rng.js';
import { checkName, pickUnused, sortedKeys, streamOf, type DrawsFrom } from './draw.js';

export interface PatronOptions extends DrawsFrom {
  /** Drawn uniformly from content's Spheres when omitted. */
  sphereKey?: SphereKey;
  /** Drawn from content's Patron names that no Patron in the world has, when omitted. */
  name?: string;
}

export interface GeneratedPatron {
  patron: Patron;
  events: PatronGenerated[];
}

/**
 * Generates a Patron into `world` (DL-19 item 8), drawing from `options.stream` (`generation` by
 * default), and returns it with its `patron.generated` event for the caller to append.
 *
 * Throws, changing nothing, on a programming error: an unknown Sphere, a blank name, a stream the
 * world does not have, or no Patron name in content left unused.
 */
export function generatePatron(world: World, deps: EngineDeps, options: PatronOptions = {}): GeneratedPatron {
  const { content } = deps;
  if (options.sphereKey !== undefined && !Object.hasOwn(content.spheres, options.sphereKey)) {
    throw new RangeError(`No Sphere in content is keyed ${JSON.stringify(options.sphereKey)}`);
  }
  if (options.name !== undefined) checkName(options.name, 'Patron');
  const state = streamOf(world, options.stream);

  const usedNames = new Set(Object.values(world.patrons).map((patron) => patron.name));
  const name = options.name ?? pickUnused(state, content.names.patron, usedNames, 'Patron');
  const sphereKey = options.sphereKey ?? pick(state, sortedKeys(content.spheres));

  const id = takeId(world, 'patrons');
  const patron: Patron = { id, name, sphereKey, regard: {} };
  world.patrons[id] = patron;

  const labels: Record<EntityId, string> = {};
  labels[id] = name;
  const event: PatronGenerated = {
    turn: world.turn,
    type: 'patron.generated',
    participants: [id],
    labels,
    milestone: false,
    payload: { patronId: id, sphereKey },
  };
  return { patron, events: [event] };
}
