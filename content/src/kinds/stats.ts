// The Stats (R8, R14; `stats.json`): a Hero's and a Guildmaster's, each a whole-number range with a
// default within it, a Stat's area for display, and whose it is. No Stat is both (pre-M0 review D4).
// One Hero Stat is marked the captaincy's, the one a Captain's effects are scaled by (DL-287).

import type { Stat, StatArea, StatOwner } from '@heroesim/engine/content';
import { boolean, integer, oneOf, optional, table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

// Keyed by the engine's unions, so the compiler refuses a list that misses or invents a member.
const statAreas: Record<StatArea, true> = { physical: true, mental: true, magical: true, social: true };
const statOwners: Record<StatOwner, true> = { hero: true, guildmaster: true };

export const statsKind = table<'stats', Stat>(
  'stats',
  'stats.json',
  {
    name: text,
    area: oneOf(statAreas),
    min: integer,
    max: integer,
    default: integer,
    owner: oneOf(statOwners),
    // The captaincy Stat's mark (DL-287; the architecture review's candidate 5): true or false on the
    // Stat's own row; absent, false. The rules hold exactly one Hero Stat to it.
    captaincy: optional(boolean),
  },
  'a Stat',
);

export const statsRules: KindRules = {
  key: 'stats',
  check(set, problems) {
    checkRowKeys('stats', set.stats, problems);
    for (const [key, stat] of Object.entries(set.stats)) {
      if (stat.min > stat.max) {
        problems.push(`stats.${key}: min ${stat.min} is greater than max ${stat.max}`);
      } else if (stat.default < stat.min || stat.default > stat.max) {
        problems.push(`stats.${key}: default ${stat.default} is outside ${stat.min} to ${stat.max}`);
      }
      // A Check reads a Stat as `max`, which agrees with the old `best`, Math.max(0, …), only while no
      // Hero's effective value is below 0, which a least value of 0 or more holds (DL-151).
      if (stat.owner === 'hero' && !(stat.min >= 0)) {
        problems.push(`stats.${key}.min is ${stat.min}; a Hero Stat's least value is 0 or more, as a Check reads it (DL-151)`);
      }
      if (stat.captaincy === true && stat.owner !== 'hero') {
        problems.push(`stats.${key}.captaincy marks a Guildmaster's Stat; a Captain is a Hero, so mark a Hero Stat`);
      }
    }
    // One Stat scales the Captain's effects (DL-287): none would leave a Captain doing nothing, two
    // would leave the engine to choose between them.
    const marked = Object.entries(set.stats).filter(([, stat]) => stat.captaincy === true).map(([key]) => key);
    if (marked.length === 0) problems.push('stats: no Stat is marked captaincy; mark one Hero Stat, the one a Captain is scaled by');
    if (marked.length > 1) problems.push(`stats: ${marked.join(' and ')} are both marked captaincy; mark one`);
  },
};
