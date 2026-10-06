import { describe, expect, test } from 'vitest';
import { chosenOf, faceted, toggled, type Facets } from './facets';

// One filter of several choices (v1.1.7-S7, DL-206 items 26 to 29, DL-213): a row shown when it
// matches every filter, a filter with nothing chosen (All) matching every row; each option's count
// what it would show with the other filters as they are.

interface Thing {
  name: string;
  colour: 'red' | 'blue' | 'green';
  size: 'small' | 'large' | null;
}

const things: readonly Thing[] = [
  { name: 'a', colour: 'red', size: 'small' },
  { name: 'b', colour: 'red', size: 'large' },
  { name: 'c', colour: 'blue', size: 'small' },
  { name: 'd', colour: 'blue', size: 'small' },
  { name: 'e', colour: 'green', size: null },
];

const facets: Facets<Thing, 'colour' | 'size'> = {
  colour: {
    label: 'Show of colour',
    options: [
      { key: 'red', label: 'Red' },
      { key: 'blue', label: 'Blue' },
      { key: 'green', label: 'Green' },
    ],
    of: (thing) => thing.colour,
  },
  size: {
    label: 'Show of size',
    options: [
      { key: 'small', label: 'Small' },
      { key: 'large', label: 'Large' },
    ],
    of: (thing) => thing.size,
  },
};

const names = (rows: readonly Thing[]): string[] => rows.map((row) => row.name);
const counts = (view: ReturnType<typeof faceted<Thing, 'colour' | 'size'>>, name: 'colour' | 'size'): Record<string, number> =>
  Object.fromEntries(view.facets[name].options.map((option) => [option.key, option.count]));

describe('faceted: the rows several filters show, and each option its count', () => {
  test('with nothing chosen, every row, in its order, and each option its whole count', () => {
    const view = faceted(things, facets, {});
    expect(names(view.rows)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(view.filtered).toBe(false);
    expect(counts(view, 'colour')).toEqual({ red: 2, blue: 2, green: 1 });
    // A row of no option (`e`'s size) is in no count, and shown while its filter is All.
    expect(counts(view, 'size')).toEqual({ small: 3, large: 1 });
    expect(view.facets.colour).toMatchObject({ label: 'Show of colour', chosen: [] });
    expect(view.facets.colour.options.map((option) => option.label)).toEqual(['Red', 'Blue', 'Green']);
  });

  test('an option chosen shows its rows; several chosen in one filter show the rows of any', () => {
    expect(names(faceted(things, facets, { colour: ['blue'] }).rows)).toEqual(['c', 'd']);
    const two = faceted(things, facets, { colour: ['green', 'red'] });
    expect(names(two.rows)).toEqual(['a', 'b', 'e']);
    // Chosen in the options' order, whatever order they were pressed in.
    expect(two.facets.colour.chosen).toEqual(['red', 'green']);
    expect(two.filtered).toBe(true);
  });

  test('two filters: a row shown when it matches both', () => {
    expect(names(faceted(things, facets, { colour: ['red'], size: ['small'] }).rows)).toEqual(['a']);
    expect(names(faceted(things, facets, { colour: ['green'], size: ['small', 'large'] }).rows)).toEqual(['e']);
    expect(names(faceted(things, facets, { colour: ['green'], size: ['small'] }).rows)).toEqual([]);
  });

  test("each option's count is what it would show with the other filters as they are, not its own", () => {
    const view = faceted(things, facets, { colour: ['red'], size: ['small'] });
    // Sizes counted among the red; colours among the small.
    expect(counts(view, 'size')).toEqual({ small: 1, large: 1 });
    expect(counts(view, 'colour')).toEqual({ red: 1, blue: 2, green: 0 });
    // The filter's own choice does not narrow its counts: Blue still counts 2 with Red chosen.
    expect(counts(faceted(things, facets, { colour: ['red'] }), 'colour')).toEqual({ red: 2, blue: 2, green: 1 });
  });

  test('every option chosen reads as All: the row of no option shown, nothing chosen', () => {
    const view = faceted(things, facets, { size: ['small', 'large'] });
    expect(names(view.rows)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(view.facets.size.chosen).toEqual([]);
    expect(view.filtered).toBe(false);
  });

  test('a choice no longer among the options is let go: alone, it reads as All', () => {
    expect(names(faceted(things, facets, { colour: ['purple'] }).rows)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const kept = faceted(things, facets, { colour: ['purple', 'blue'] });
    expect(names(kept.rows)).toEqual(['c', 'd']);
    expect(kept.facets.colour.chosen).toEqual(['blue']);
  });

  test('no rows: every count 0', () => {
    const view = faceted([], facets, { colour: ['red'] });
    expect(view.rows).toEqual([]);
    expect(counts(view, 'colour')).toEqual({ red: 0, blue: 0, green: 0 });
  });
});

describe('toggled and chosenOf: pressing an option, and what is chosen', () => {
  const { options } = facets.colour;

  test('an option pressed is added, pressed again let go', () => {
    expect(toggled(options, [], 'blue')).toEqual(['blue']);
    expect(toggled(options, ['blue'], 'red')).toEqual(['red', 'blue']);
    expect(toggled(options, ['red', 'blue'], 'blue')).toEqual(['red']);
    expect(toggled(options, ['red'], 'red')).toEqual([]);
  });

  test('the last option pressed, every option chosen, reads as All', () => {
    expect(toggled(options, ['red', 'blue'], 'green')).toEqual([]);
  });

  test('chosenOf keeps the options of the list in their order, and none for every one', () => {
    expect(chosenOf(options, undefined)).toEqual([]);
    expect(chosenOf(options, ['green', 'red', 'purple'])).toEqual(['red', 'green']);
    expect(chosenOf(options, ['green', 'red', 'blue'])).toEqual([]);
    // One option alone: chosen, it is every option.
    expect(chosenOf([{ key: 'red', label: 'Red' }], ['red'])).toEqual([]);
  });
});
