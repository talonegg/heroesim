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

/**
 * A failure whose changes could not all be put back (v1.1.3-S8): the failure, and each file left as
 * the command made it. Every other file was put back.
 */
export class NotUndone extends Error {
  constructor(
    readonly problems: readonly string[],
    readonly left: readonly string[],
  ) {
    super(`${problems.join('\n')}\nAnd these could not be put back, and are left as the command made them:\n  ${left.join('\n  ')}`);
    this.name = 'NotUndone';
  }
}
