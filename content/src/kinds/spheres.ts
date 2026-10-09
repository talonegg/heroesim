// The Spheres (`spheres.json`): what a Patron is concerned with, each with its draw weight. A Patron's
// Quests are found by Sphere when the Board is drawn (pre-M0 review D3), so every Sphere is served.

import type { Sphere } from '@heroesim/engine/content';
import { number, optional, table, text } from './read.js';
import { checkRowKeys, checkWeight, type KindRules } from './rules.js';

export const spheresKind = table<'spheres', Sphere>('spheres', 'spheres.json', { name: text, weight: optional(number) }, 'a Sphere');

export const spheresRules: KindRules = {
  key: 'spheres',
  check(set, problems) {
    checkRowKeys('spheres', set.spheres, problems);
    for (const [key, sphere] of Object.entries(set.spheres)) checkWeight('spheres', key, sphere.weight, problems);
    // A Sphere no template serves would leave its Patrons offering nothing.
    const served = new Set(Object.values(set.questTemplates).flatMap((template) => template.sphereKeys));
    for (const sphereKey of Object.keys(set.spheres)) {
      if (!served.has(sphereKey)) problems.push(`spheres.${sphereKey}: no Quest template names it in sphereKeys`);
    }
  },
};
