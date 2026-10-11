// Bands (DL-280, the architecture review's candidate 6; DL-282): the named ranges a value falls in,
// lowest first, each from where it starts. Morale's, Regard's, an estimated chance's, a Potential
// hint's and Fatigue's are each read through `bandOf`, and a rule that asks whether a band has
// reached another, such as a Guild's rest band, through `atOrPast`.

/**
 * The band of `names`, lowest first, that `value` falls in: the highest whose start in `starts` it
 * has reached, a start itself included, and the lowest for a value below every start. Only the
 * lowest band may go without a start, as the lowest chance band does (`chanceBands`).
 */
export function bandOf<Name extends string>(names: readonly Name[], starts: Readonly<Partial<Record<Name, number>>>, value: number): Name {
  let band = names[0] as Name;
  for (const name of names) {
    const start = starts[name];
    if (start !== undefined && value >= start) band = name;
  }
  return band;
}

/** Whether `band` is `threshold` or a band above it, in the order of `names`, lowest first. */
export function atOrPast<Name extends string>(names: readonly Name[], band: Name, threshold: Name): boolean {
  return names.indexOf(band) >= names.indexOf(threshold);
}
