// The per-Turn copy of the World State (data-model §1, ADR-0008): `advance` and the actions'
// `applyToCopy` each play on a copy of `world`, made here, so that the document they were given is
// left as it was. One named function, so the copy can be timed by the harness (v1.1.6-S17, DL-186
// item 11).
//
// The write-once rows, those out of play that no rule writes again (`writeOnce`), are what the
// harness counts as each year ends beside the live ones.

import type { Guild, Guildmaster, Hero, World } from './document.js';

/**
 * Whether each table's row is out of play for good, never written again by a rule (DL-84 item 6): a
 * Hero dead, retired, or gone from the pool unrecruited (DL-27); a retired Guildmaster (DL-100 item
 * 3); a folded Guild (M2-S10).
 */
export const writeOnce = {
  heroes: (hero: Pick<Hero, 'diedOnTurn' | 'retiredOnTurn' | 'leftPoolOnTurn'>): boolean =>
    hero.diedOnTurn !== null || hero.retiredOnTurn !== null || hero.leftPoolOnTurn !== null,
  guildmasters: (guildmaster: Pick<Guildmaster, 'retiredOnTurn'>): boolean => guildmaster.retiredOnTurn !== null,
  guilds: (guild: Pick<Guild, 'foldedOnTurn'>): boolean => guild.foldedOnTurn !== null,
} as const;

/** A copy of `world` for the next Turn or action to play on: `world` itself is left as it was. */
export function copyWorld(world: World): World {
  return structuredClone(world);
}
