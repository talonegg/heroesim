// The Patron Generator (M1-S6). A Patron is a name, its sex (v1.1.2-S3), a Sphere and Regard. The Quest templates a
// Patron offers are looked up by Sphere in content when the Board is drawn (M2-S3), never stored,
// so a content change reaches every Patron without a migration (pre-M0 review D3).

import type { EngineDeps } from '../config.js';
import type { SphereKey } from '../content-types.js';
import { takeId, type EntityId, type Patron, type Sex, type World } from '../document.js';
import type { PatronGenerated } from '../events.js';
import { checkName, pickByWeight, pickUnusedBy, sortedRows, streamOf, type DrawsFrom } from './draw.js';

export interface PatronOptions extends DrawsFrom {
  /** Drawn from content's Spheres by their weights (`pickByWeight`, DL-202) when omitted. */
  sphereKey?: SphereKey;
  /**
   * Drawn from content's Patron names that no Patron in the world has, when omitted, with the sex
   * that comes with it (v1.1.2-S3, DL-125 item 5). Given, it comes with `sex`.
   */
  name?: string;
  /** The sex of the Patron `name` names: given with a name and only with one; `null` for a body. */
  sex?: Sex | null;
}

export interface GeneratedPatron {
  patron: Patron;
  events: PatronGenerated[];
}

/**
 * Generates a Patron into `world` (DL-19 item 8), drawing from `options.stream` (`generation` by
 * default), and returns it with its `patron.generated` event for the caller to append.
 *
 * Throws, changing nothing, on a programming error: an unknown Sphere, a blank name, a name given
 * without a sex or a sex without a name (v1.1.2-S3), a stream the world does not have, or no Patron
 * name in content left unused.
 */
export function generatePatron(world: World, deps: EngineDeps, options: PatronOptions = {}): GeneratedPatron {
  const { content } = deps;
  if (options.sphereKey !== undefined && !Object.hasOwn(content.spheres, options.sphereKey)) {
    throw new RangeError(`No Sphere in content is keyed ${JSON.stringify(options.sphereKey)}`);
  }
  if (options.name !== undefined) checkName(options.name, 'Patron');
  if (options.name !== undefined && options.sex === undefined) {
    throw new RangeError(`A Patron given a name is given a sex with it; ${JSON.stringify(options.name)} has none`);
  }
  if (options.name === undefined && options.sex !== undefined) {
    throw new RangeError('A Patron is given a sex only with a name');
  }
  const state = streamOf(world, options.stream);

  const usedNames = new Set(Object.values(world.patrons).map((patron) => patron.name));
  // The same names in the same order as before each came with its sex, so the same one is drawn.
  const { name, sex } =
    options.name === undefined
      ? pickUnusedBy(state, content.names.patron, (row) => row.name, usedNames, 'Patron')
      : { name: options.name, sex: options.sex ?? null };
  const sphereKey = options.sphereKey ?? pickByWeight(state, sortedRows(content.spheres)).key;

  const id = takeId(world, 'patrons');
  const patron: Patron = { id, name, sex, sphereKey, regard: {} };
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
