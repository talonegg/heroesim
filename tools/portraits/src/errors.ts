// The two ways a command that changes files refuses: before it changes anything, or after
// undoing everything it changed.

/** A failure of intake or apply: every change was undone, and each problem is named. */
export class Undone extends Error {
  constructor(
    readonly problems: readonly string[],
    what: string,
  ) {
    super(`${what} was undone:\n  ${problems.join('\n  ')}`);
    this.name = 'Undone';
  }
}

/** A draft that cannot be taken, before anything is changed. */
export class DraftError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`The draft is refused:\n  ${problems.join('\n  ')}`);
    this.name = 'DraftError';
  }
}
