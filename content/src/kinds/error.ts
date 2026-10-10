// What content that breaks its schema throws, read or checked.

/**
 * Content that breaks the schema. The message lists every problem found, one per line, and
 * each names the file or table and the offending key, so an author can go straight to it.
 */
export class ContentError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The content is invalid:\n  ${problems.join('\n  ')}`);
    this.name = 'ContentError';
    this.problems = problems;
  }
}
