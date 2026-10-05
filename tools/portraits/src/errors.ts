// A draft the portrait tool refuses before it changes anything. A command undone once it has begun
// throws `Undone` or `NotUndone`, from `@heroesim/content/write` (v1.1.6-S4).

/** A draft that cannot be taken, before anything is changed. */
export class DraftError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`The draft is refused:\n  ${problems.join('\n  ')}`);
    this.name = 'DraftError';
  }
}
