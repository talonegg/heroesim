import type { Sphere } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { readKinds } from '../parse.js';
import { validateKinds } from '../validate.js';
import { changed, realFiles, refusalOf, shipped } from './content.test-support.js';
import { contentFieldNames, contentKinds, contentRules } from './index.js';
import { number, optional, table, text } from './read.js';
import type { KindRules } from './rules.js';
import { spheresKind, spheresRules } from './spheres.js';

// The content kinds (DL-243): one module per kind holds its shape, how it is read, its defaults and its
// rules, and the drivers, `readContent` and `validateContent`, run every kind's. So a new field is
// written in its kind's module alone: here a Sphere's colour, read where written and held to a palette.

/** A Sphere with a colour, as a content file would write one. */
type ColouredSphere = Sphere & { colour?: string };

/** The Sphere's module with the field added: its shape, with `colour`, and its rules, with the colour's. */
const coloured = {
  kind: table<'spheres', ColouredSphere>('spheres', 'spheres.json', { name: text, weight: optional(number), colour: optional(text) }, 'a Sphere'),
  rules: {
    key: 'spheres',
    check(set, problems, known) {
      spheresRules.check(set, problems, known);
      for (const [key, sphere] of Object.entries(set.spheres as Record<string, ColouredSphere>)) {
        if (sphere.colour !== undefined && !['gold', 'grey'].includes(sphere.colour)) problems.push(`spheres.${key}.colour is "${sphere.colour}"; it is gold or grey`);
      }
    },
  } satisfies KindRules,
};

/** Every kind's reader, the Sphere's with its colour. */
const readers = contentKinds.map((kind) => (kind === spheresKind ? coloured.kind : kind));
/** Every kind's rules, the Sphere's with its colour's. */
const rules = contentRules.map((kind) => (kind === spheresRules ? coloured.rules : kind));

/** The content of `files` read and checked by the kinds with the Sphere's colour. */
const withColour = (files: Readonly<Record<string, string>>) => validateKinds(rules, readKinds(readers, files));
const colourOfCrown = (colour: string) =>
  changed(realFiles(), 'spheres.json', (json) => {
    Object.assign(json['crown'] ?? {}, { colour });
  });

describe('a new field', () => {
  test('is refused by the kinds as shipped, as a field the Sphere does not have', () => {
    expect(refusalOf(() => validateKinds(contentRules, readKinds(contentKinds, colourOfCrown('gold')))).problems).toEqual([
      'spheres.json: crown.colour is not a field of a Sphere',
    ]);
  });

  test("is read, defaulted and checked once it is written in its kind's module alone", () => {
    const set = withColour(colourOfCrown('gold'));

    expect((set.spheres['crown'] as ColouredSphere).colour).toBe('gold');
    expect(set.spheres['church']).toEqual(shipped.spheres['church']);
    expect(refusalOf(() => withColour(colourOfCrown('green'))).problems).toEqual(['spheres.crown.colour is "green"; it is gold or grey']);
    expect(refusalOf(() => withColour(changed(realFiles(), 'spheres.json', (json) => Object.assign(json['crown'] ?? {}, { colour: 3 })))).problems).toEqual([
      'spheres.json: crown.colour is 3; expected a string',
    ]);
  });

  test('is a field a tool finds by its name', () => {
    expect(contentFieldNames()).toContain('statModifiers');
    expect(contentFieldNames()).not.toContain('colour');
  });
});

describe('the kinds', () => {
  test('read every place of the content set but its id, each from its own file, and check each of their places once', () => {
    const places = Object.keys(shipped).filter((place) => place !== 'id');

    expect(contentKinds.map((kind) => kind.key)).toEqual(places);
    expect(new Set(contentKinds.map((kind) => kind.file)).size).toBe(contentKinds.length);
    expect(contentRules.map((kind) => kind.key)).toEqual(places.filter((place) => place !== 'version'));
  });
});
