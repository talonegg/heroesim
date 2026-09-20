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
  /**
   * At least one named Hero refuses the Commission and the call did not say to insist.
   * Ask `proposeParty` who refuses and why before deciding whether to pay the price.
   */
  | 'HeroRefused'
  /** The Career has already ended, in Retirement or in insolvency. */
  | 'CareerEnded'
  /** The Guild cannot afford the Hall improvement it was asked to buy (E3). */
  | 'InsufficientCoin'
  /** The Hall already holds that improvement, and each is bought once (E3). */
  | 'AlreadyImproved'
  /** No Applicant of that id is waiting: the id is unknown, or they have expired (E4). */
  | 'NoSuchApplicant'
  /** The Roster is at `config.rosterCap` and nobody else can be taken on (E4). */
  | 'RosterFull'
  /** No Rival of that id is in this Career (E5). */
  | 'NoSuchRival'
  /** No Hero of that id is on the Roster this call named (E5). */
  | 'NoSuchHero'
  /** No Party of that id is away on a Commission (E6). */
  | 'NoSuchParty'
  /** That Party has not sent word, so there is nothing to answer (E6). */
  | 'NotAwaitingWord'
  /** The Decision that Party is waiting on offers no option of that id (E6). */
  | 'NoSuchOption'
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
