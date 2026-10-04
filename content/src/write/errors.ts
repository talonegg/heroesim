// The two ways a command of the tools that changes files fails once it has begun (v1.1.3-S8): undone
// whole, or with some file it could not put back. Shared by the portrait tool and the content editor
// through `@heroesim/content/write` (v1.1.6-S4, DL-186 item 14).

/** A failure of a command that changes files: every change was undone, and each problem is named. */
export class Undone extends Error {
  constructor(
    readonly problems: readonly string[],
    what: string,
  ) {
    super(`${what} was undone:\n  ${problems.join('\n  ')}`);
    this.name = 'Undone';
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
