/**
 * The one place a decision is made (E8-S2). Every action here is an engine call; the
 * reducer replaces the Career with the one the engine returned and appends what
 * `narrate` made of the events. Nothing in this file computes a rule, and nothing
 * outside `state/` calls the engine.
 *
 * The reducer is pure — it is safe to drive it directly in a test — and an `EngineError`
 * is caught at this boundary and turned into one sentence for the player.
 */

import { useEffect, useReducer, type Dispatch } from 'react';
import {
  acceptApplicant,
  advanceUntilAttention,
  answerParty,
  applicantById,
  commissionById,
  commitParty,
  declineApplicant,
  EngineError,
  hallCost,
  improveHall,
  newCareer,
  poachHero,
  rivalHeroOffer,
  transferHero,
  wordOffer,
  type Career,
  type HallImprovement,
  type Step,
} from '@heroesim/engine';
import { content } from '../content';
import {
  coin,
  entriesFrom,
  errorSentence,
  formatDay,
  narrateEvents,
  remember,
  type Paragraph,
} from '../words';

/** How much of the report is kept. Older Paragraphs fall off the top. */
export const MAX_PARAGRAPHS = 200;

/** Everything the app renders from. */
export interface CareerState {
  /** The world, or `null` before a Career has been started or loaded. */
  career: Career | null;
  /** The report, oldest first, capped at {@link MAX_PARAGRAPHS}. */
  paragraphs: Paragraph[];
  /**
   * The last five things the player did and what came of them, oldest first, at **full
   * length** (E7-S2, E8-S6). Derived from the step's events through `narrate`'s own
   * `entriesFrom` — the very function the terminal uses — so neither front end re-words an
   * entry and the two remember the same eight kinds of moment (DL-27 §6). The browser
   * wraps, so nothing is trimmed here or on the way to storage.
   */
  history: string[];
  /** A dismissible sentence about a refused action. */
  message: string | null;
  /**
   * True from the moment an engine action is accepted until the app settles it on the
   * next commit. A second action arriving before that is dropped, so two rapid taps
   * cannot drive two engine calls (E8-S2).
   */
  busy: boolean;
}

/** Before anything has been started or loaded. */
export const emptyCareerState: CareerState = {
  career: null,
  paragraphs: [],
  history: [],
  message: null,
  busy: false,
};

/** What the player can ask for. Each of the first four is one engine call. */
export type CareerAction =
  | { type: 'newCareer'; seed: string; years?: number }
  | { type: 'commit'; commissionId: string; heroIds: string[]; insist?: boolean }
  | { type: 'improveHall'; improvement: HallImprovement }
  | { type: 'accept'; applicantId: string }
  | { type: 'decline'; applicantId: string }
  | { type: 'transfer'; rivalId: string; heroId: string }
  | { type: 'poach'; rivalId: string; heroId: string }
  /** Tell a Party that has sent word what to do (E6-S3; E8-S2 names it `answer`). */
  | { type: 'answer'; partyId: string; optionId: string }
  | { type: 'advance' }
  | { type: 'load'; career: Career; history?: readonly string[] }
  | { type: 'settled' }
  | { type: 'notice'; message: string }
  | { type: 'dismiss' };

/** The actions that call the engine, and so cannot overlap one another. */
const ENGINE_ACTIONS: ReadonlySet<CareerAction['type']> = new Set([
  'newCareer',
  'commit',
  'improveHall',
  'accept',
  'decline',
  'transfer',
  'poach',
  'answer',
  'advance',
  'load',
]);

function trim(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.length <= MAX_PARAGRAPHS
    ? paragraphs
    : paragraphs.slice(paragraphs.length - MAX_PARAGRAPHS);
}

/**
 * Take a Step: keep the new Career, append what was said about it, and remember the step
 * if anything in it was worth remembering.
 *
 * The history goes through this one funnel, exactly as the report does, so no action can
 * be added that changes the world and leaves no trace of the decision behind it.
 */
function accept(state: CareerState, step: Step, keepLog: boolean): CareerState {
  const said = narrateEvents(step.events, step.career, content);
  const entries = entriesFrom(step.events, step.career, content);
  return {
    career: step.career,
    paragraphs: trim(keepLog ? [...state.paragraphs, ...said] : said),
    history: remember(keepLog ? state.history : [], entries),
    message: null,
    busy: true,
  };
}

/** Refuse an action: the world is untouched and the player is told why, once. */
function refuse(
  state: CareerState,
  error: unknown,
  ctx?: Record<string, string | number>,
): CareerState {
  if (error instanceof EngineError) {
    return { ...state, busy: true, message: errorSentence(error.code, ctx) };
  }
  return {
    ...state,
    busy: true,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** The reducer. Pure: same state and action in, same state out. */
export function careerReducer(state: CareerState, action: CareerAction): CareerState {
  if (state.busy && ENGINE_ACTIONS.has(action.type)) return state;

  switch (action.type) {
    case 'newCareer': {
      try {
        const step = newCareer(
          action.seed,
          content,
          action.years === undefined ? undefined : { careerYears: action.years },
        );
        return accept(state, step, false);
      } catch (error) {
        return refuse(state, error);
      }
    }

    case 'commit': {
      const career = state.career;
      if (career === null) return state;
      try {
        // `insist` is only ever set by a second, deliberate tap: no Hero is committed
        // against their will by a single press of Commit (E2-S2).
        return accept(
          state,
          commitParty(career, action.commissionId, action.heroIds, content, {
            insist: action.insist === true,
          }),
          true,
        );
      } catch (error) {
        const title = commissionById(career, action.commissionId)?.title;
        return refuse(state, error, title === undefined ? undefined : { commission: title });
      }
    }

    case 'improveHall': {
      const career = state.career;
      if (career === null) return state;
      try {
        // The engine decides whether it can be bought — whether there is coin for it, and
        // whether the Hall already has it. The client only asks (E3-S4).
        return accept(state, improveHall(career, action.improvement), true);
      } catch (error) {
        return refuse(state, error, {
          detail: coin(hallCost(action.improvement, career.config)),
        });
      }
    }

    case 'accept': {
      const career = state.career;
      if (career === null) return state;
      try {
        // The engine decides whether they can be taken on — whether there is a place on
        // the Roster and coin for the fee. The client only asks (E4-S3).
        return accept(state, acceptApplicant(career, action.applicantId), true);
      } catch (error) {
        const applicant = applicantById(career, action.applicantId);
        // `detail` means the Roster cap to `RosterFull` and the fee to `InsufficientCoin`,
        // so which one is sent depends on which the engine threw — as the CLI already does.
        const rosterFull = error instanceof EngineError && error.code === 'RosterFull';
        return refuse(state, error, {
          hero: applicant?.name ?? 'Somebody',
          detail: rosterFull ? career.config.rosterCap : coin(applicant?.askingFee ?? 0),
        });
      }
    }

    case 'decline': {
      const career = state.career;
      if (career === null) return state;
      try {
        return accept(state, declineApplicant(career, action.applicantId), true);
      } catch (error) {
        return refuse(state, error, {
          hero: applicantById(career, action.applicantId)?.name ?? 'Somebody',
        });
      }
    }

    case 'transfer':
    case 'poach': {
      const career = state.career;
      if (career === null) return state;
      try {
        // The engine decides whether the move can be made — whether the other Guild will
        // deal with you, whether that Hero has had enough of them, whether there is room
        // and whether there is coin. The client only asks (E8-S2). A refusal comes back as
        // a `TransferRefused` event and is narrated like anything else that happened; it
        // is not an error and is not swallowed (E5-S2).
        return accept(
          state,
          action.type === 'transfer'
            ? transferHero(career, action.rivalId, action.heroId)
            : poachHero(career, action.rivalId, action.heroId),
          true,
        );
      } catch (error) {
        const offer = rivalHeroOffer(career, action.rivalId, action.heroId);
        return refuse(state, error, { hero: offer?.hero.name ?? 'Somebody' });
      }
    }

    case 'answer': {
      const career = state.career;
      if (career === null) return state;
      try {
        // The engine decides whether the option can be taken — whether that Party is
        // waiting at all, whether the Decision offers it, and whether the Guild can pay
        // for it. The client only asks (E6-S3, E8-S2).
        return accept(state, answerParty(career, action.partyId, action.optionId, content), true);
      } catch (error) {
        const option = wordOffer(career, action.partyId, content)?.options.find(
          (entry) => entry.id === action.optionId,
        );
        return refuse(state, error, {
          detail: option?.cost === undefined ? action.optionId : coin(option.cost),
        });
      }
    }

    case 'advance': {
      const career = state.career;
      if (career === null) return state;
      try {
        return accept(state, advanceUntilAttention(career, content), true);
      } catch (error) {
        return refuse(state, error);
      }
    }

    case 'load': {
      const { career } = action;
      return {
        career,
        paragraphs: [
          {
            kind: 'note',
            day: career.day,
            text: `${career.guild.name}, taken up again at ${formatDay(career.day, career)}.`,
          },
        ],
        // The five that were saved beside the Career, at full length. A slot holding none
        // — one written before the history was kept, or cleared — comes back empty rather
        // than refusing the Career it sits beside.
        history: [...(action.history ?? [])],
        message: null,
        busy: true,
      };
    }

    case 'settled':
      return state.busy ? { ...state, busy: false } : state;

    case 'notice':
      return { ...state, message: action.message };

    case 'dismiss':
      return state.message === null ? state : { ...state, message: null };

    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/**
 * The reducer, wired to React, with the settle that re-opens the door after an action
 * has been taken. Engine calls are synchronous, so the flag is cleared on the very next
 * commit — long enough to swallow a double tap, short enough not to be noticed.
 */
export function useCareer(): [CareerState, Dispatch<CareerAction>] {
  const [state, dispatch] = useReducer(careerReducer, emptyCareerState);

  useEffect(() => {
    if (state.busy) dispatch({ type: 'settled' });
  }, [state.busy]);

  return [state, dispatch];
}
