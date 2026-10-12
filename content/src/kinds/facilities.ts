// The Facilities (`facilities.json`, DL-294 item 3): each a part of every Guild's Hall from its
// founding, at grade 0, in the order every Hall lists them and a Rival builds them. Each has a name as a
// sentence says it, whether that name is plural, an upkeep in whole Silver of 0 or more, and its
// effects' values at grade 0, at least one, from the closed set described once (`facility-effects.ts`).
// Its grades are the Improvements (`improvements.ts`); one with none stays at grade 0.

import type { Facility } from '@heroesim/engine/content';
import { checkFacilityEffects, facilityEffectsField } from './facility-effects.js';
import { boolean, integer, table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

export const facilitiesKind = table<'facilities', Facility>(
  'facilities',
  'facilities.json',
  { name: text, plural: boolean, upkeep: integer, effects: facilityEffectsField },
  'a Facility',
);

export const facilitiesRules: KindRules = {
  key: 'facilities',
  check(set, problems) {
    checkRowKeys('facilities', set.facilities, problems);
    for (const [key, facility] of Object.entries(set.facilities)) {
      const where = `facilities.${key}`;
      if (facility.name.trim() === '') problems.push(`${where}.name is empty`);
      if (!(Number.isInteger(facility.upkeep) && facility.upkeep >= 0)) problems.push(`${where}.upkeep is ${facility.upkeep}; it is a whole number of 0 or more`);
      if (Object.keys(facility.effects).length === 0) problems.push(`${where}.effects is empty: a Facility has at least one effect`);
      checkFacilityEffects(`${where}.effects`, facility.effects, problems);
    }
  },
};
