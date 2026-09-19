/**
 * The error classes the engine throws. Each sets `name` so a front end can tell them
 * apart after they have crossed a package boundary.
 */

/** The documented reasons a public engine call can be rejected. */
export type EngineErrorCode =
  /** The Commission is not on the Board, or it has expired. */
  | 'CommissionNotOnBoard'
  /** A named Hero is not on the Roster, is already away on a Party, or was named twice. */
  | 'HeroNotAvailable'
  /** No Heroes were named. */
  | 'EmptyParty'
  /** The Career has already ended, in Retirement or in insolvency. */
  | 'CareerEnded'
  /** The engine reached a state it believes unreachable. Never part of normal play. */
  | 'InternalError';

/** A rejected engine call: the player asked for something the world does not allow. */
export class EngineError extends Error {
  /** Which documented rejection this is. Callers branch on this, never on the message. */
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

/** A save document that cannot be trusted: wrong format version, malformed, or missing fields. */
export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Authored content that does not meet the contract. The message names the file and field. */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}
