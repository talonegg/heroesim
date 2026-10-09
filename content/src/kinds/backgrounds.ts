// The Backgrounds (`backgrounds.json`): a Hero's or a Guild's, each with its draw weight, and a Hero
// Background with its Station, one of the Stations a picture is read in (DL-135 item 5).

import type { Background, BackgroundOwner } from '@heroesim/engine/content';
import { number, oneOf, optional, table, text } from './read.js';
import { checkRowKeys, checkWeight, type KindRules } from './rules.js';

const backgroundOwners: Record<BackgroundOwner, true> = { hero: true, guild: true };

export const backgroundsKind = table<'backgrounds', Background>(
  'backgrounds',
  'backgrounds.json',
  { name: text, owner: oneOf(backgroundOwners), station: optional(text), weight: optional(number) }, 'a Background',
);

export const backgroundsRules: KindRules = {
  key: 'backgrounds',
  check(set, problems) {
    checkRowKeys('backgrounds', set.backgrounds, problems);
    const stations = new Set(set.descriptions.stations);
    for (const [key, background] of Object.entries(set.backgrounds)) {
      checkWeight('backgrounds', key, background.weight, problems);
      const where = `backgrounds.${key}.station`;
      if (background.owner === 'guild') {
        if (background.station !== undefined) problems.push(`${where}: a Guild Background has none`);
      } else if (background.station === undefined) problems.push(`${where} is missing: a Hero Background has one`);
      else if (!stations.has(background.station)) {
        problems.push(`${where}: "${background.station}" is not a station defined in descriptions.stations`);
      }
    }
  },
};
