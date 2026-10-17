// One seed of the Transfer Generator's twenty-year box (DL-324): `sweep` plays it whole and returns its tally and
// what the box checks of it. `transfer-generator.harness.test.ts` plays its seeds in child processes, each
// importing this module, so that where a seed is played does not change it. It names no Node API: the engine
// holds none.

import { createWorld } from '../create.js';
import type { Guild, GuildId, WorldDocument } from '../document.js';
import { append } from '../history.js';
import { phaseContext } from '../phases/phase.js';
import { runTurn } from '../pipeline.js';
import { dispositionOf } from '../selectors.js';
import { validate } from '../validate.js';
import { deps, newWatch, rivalsInPlay, setup, stillPlayer, unwatchPhase, watchPhase, type Watch } from './transfer-generator.test-support.js';

/** What a seed's twenty years showed. */
export interface Tally extends Watch {
  /** Every Rival-to-Rival Transfer, of either kind: the afternoon's and the Generator's. */
  rivalToRival: number;
  /** The Roster size of each Rival in play at each year's end, by year from 1. */
  yearEnds: number[][];
}

/** A seed's tally, and what the box expects to be null and empty: how its game ended, and the validator's problems. */
export interface Swept {
  seed: string;
  tally: Tally;
  ended: WorldDocument['world']['ended'];
  problems: unknown[];
}

/** Plays `seed` for `years` in place, watching the phase, and validates the end. */
export function sweep(seed: string, years: number): Swept {
  const document: WorldDocument = createWorld(seed, setup, deps).document;
  const { world } = document;
  stillPlayer(world, deps);
  const tally = watchPhase<Tally>({ ...newWatch(seed, world), rivalToRival: 0, yearEnds: [] });
  const turns = years * deps.config.turnsPerYear;
  let lastYearFrom = 0;
  try {
    while (world.turn < turns && world.ended === null) {
      if (world.turn === turns - deps.config.turnsPerYear) lastYearFrom = document.history.entries.length;
      world.turn += 1;
      for (const event of runTurn(world, phaseContext(world, deps, document.history))) {
        append(document.history, event);
        if (event.type !== 'hero.transferred') continue;
        const { fromGuildId, toGuildId } = event.payload;
        const rival = (id: GuildId) => dispositionOf(world.guilds[id] as Guild) !== null;
        if (rival(fromGuildId) && rival(toGuildId)) tally.rivalToRival += 1;
      }
      if (world.turn % deps.config.turnsPerYear === 0) tally.yearEnds.push(rivalsInPlay(world).map((guild) => guild.rosterIds.length));
    }
  } finally {
    unwatchPhase();
  }
  // The World State in full and the last year's History (DL-34), neither refused nor warned about.
  const validated = validate(document, deps, { historyFrom: lastYearFrom });
  return { seed, tally, ended: world.ended, problems: validated.ok ? validated.warnings : validated.failures };
}
