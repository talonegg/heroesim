// The page's one filter (v1.1.7-S7, DL-206 items 26 to 29, DL-213): a filter of several choices over a
// list's rows, each row of one option of it or of none. A row is shown when it matches every filter,
// a filter with nothing chosen ("All") matching every row, and every option chosen reading as All.
// Each option's count is what it would show with the other filters as they are (item 29). The Roster,
// the Stores, the Treasury and the Market filter through it; `FilterChips` draws one filter.

/** A choice of a filter: its key, and its words on its chip. */
export interface FacetOption {
  key: string;
  label: string;
}

/** A filter over rows: the words that name it, its options in their order, and the option a row is of. */
export interface Facet<Row> {
  /** The group's name, `Show of kind`; a view may show it before the chips (`FilterChips`' `labelShown`). */
  label: string;
  options: readonly FacetOption[];
  /** The key of the option `row` is of; `null` for none, a row only All shows. */
  of: (row: Row) => string | null;
}

/** A list's filters, by name. */
export type Facets<Row, Name extends string> = Readonly<Record<Name, Facet<Row>>>;

/** The options chosen in each filter, by its name; none, or a filter left out, is All. */
export type FacetChoices<Name extends string> = Readonly<Partial<Record<Name, readonly string[]>>>;

/** A filter as its chips show it: each option with its count, and the options chosen, none for All. */
export interface FacetView {
  label: string;
  options: { key: string; label: string; count: number }[];
  /** The options chosen, in the options' order; empty for All. */
  chosen: string[];
}

export interface Faceted<Row, Name extends string> {
  /** The rows every filter shows, in their order. */
  rows: Row[];
  facets: Record<Name, FacetView>;
  /** Whether any filter has an option chosen, so that some row may be hidden. */
  filtered: boolean;
}

/**
 * The options of `options` that `chosen` names, in the options' order: a key no longer among them is
 * let go, and every option chosen reads as none, All.
 */
export function chosenOf(options: readonly FacetOption[], chosen: readonly string[] | undefined): string[] {
  const kept = options.filter((option) => chosen?.includes(option.key) === true).map((option) => option.key);
  return kept.length === options.length ? [] : kept;
}

/** What is chosen once `key` is pressed: added, or let go when it was chosen; every option chosen is All. */
export function toggled(options: readonly FacetOption[], chosen: readonly string[], key: string): string[] {
  return chosenOf(options, chosen.includes(key) ? chosen.filter((each) => each !== key) : [...chosen, key]);
}

/**
 * The rows of `rows` that `facets` show as `choices` choose, each filter's options with their counts.
 * One pass: a row that fails no filter is shown and counts in each; a row that fails one filter alone
 * counts in that one's options, as it would be shown were that filter's choice the option it is of.
 */
export function faceted<Row, Name extends string>(rows: readonly Row[], facets: Facets<Row, Name>, choices: FacetChoices<Name>): Faceted<Row, Name> {
  const names = Object.keys(facets) as Name[];
  const filters = names.map((name) => {
    const { label, options, of } = facets[name];
    const chosen = chosenOf(options, choices[name]);
    return { name, label, options, of, chosen, matches: new Set(chosen), counts: new Map(options.map((option) => [option.key, 0])) };
  });
  const count = (filter: (typeof filters)[number], key: string | null): void => {
    const was = key === null ? undefined : filter.counts.get(key);
    if (key !== null && was !== undefined) filter.counts.set(key, was + 1);
  };
  const shown: Row[] = [];
  for (const row of rows) {
    const keys = filters.map((filter) => filter.of(row));
    const failing = filters.flatMap((filter, at) => (filter.matches.size === 0 || filter.matches.has(keys[at] ?? '') ? [] : [at]));
    if (failing.length === 0) {
      shown.push(row);
      filters.forEach((filter, at) => count(filter, keys[at] ?? null));
    } else if (failing.length === 1) {
      const at = failing[0] ?? 0;
      const filter = filters[at];
      if (filter !== undefined) count(filter, keys[at] ?? null);
    }
  }
  const views = Object.fromEntries(
    filters.map((filter) => [
      filter.name,
      { label: filter.label, options: filter.options.map(({ key, label }) => ({ key, label, count: filter.counts.get(key) ?? 0 })), chosen: filter.chosen },
    ]),
  ) as Record<Name, FacetView>;
  return { rows: shown, facets: views, filtered: filters.some((filter) => filter.chosen.length > 0) };
}
