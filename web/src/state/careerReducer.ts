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
  advanceUntilAttention,
  commissionById,
  commitParty,
  EngineError,
  newCareer,
  type Career,
  type Step,
} from '@heroesim/engine';
import { content } from '../content';
import { errorSentence, formatDay, narrateEvents, type Paragraph } from '../words';

/** How much of the report is kept. Older Paragraphs fall off the top. */
export const MAX_PARAGRAPHS = 200;

/** Everything the app renders from. */
export interface CareerState {
  /** The world, or `null` before a Career has been started or loaded. */
  career: Career | null;
  /** The report, oldest first, capped at {@link MAX_PARAGRAPHS}. */
  paragraphs: Paragraph[];
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
  message: null,
  busy: false,
};

/** What the player can ask for. Each of the first four is one engine call. */
export type CareerAction =
  | { type: 'newCareer'; seed: string; years?: number }
  | { type: 'commit'; commissionId: string; heroIds: string[] }
  | { type: 'advance' }
  | { type: 'load'; career: Career }
  | { type: 'settled' }
  | { type: 'notice'; message: string }
  | { type: 'dismiss' };

/** The actions that call the engine, and so cannot overlap one another. */
const ENGINE_ACTIONS: ReadonlySet<CareerAction['type']> = new Set([
  'newCareer',
  'commit',
  'advance',
  'load',
]);

function trim(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.length <= MAX_PARAGRAPHS
    ? paragraphs
    : paragraphs.slice(paragraphs.length - MAX_PARAGRAPHS);
}

/** Take a Step: keep the new Career, append what was said about it. */
function accept(state: CareerState, step: Step, keepLog: boolean): CareerState {
  const said = narrateEvents(step.events, step.career, content);
  return {
    career: step.career,
    paragraphs: trim(keepLog ? [...state.paragraphs, ...said] : said),
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
        return accept(state, commitParty(career, action.commissionId, action.heroIds, content), true);
      } catch (error) {
        const title = commissionById(career, action.commissionId)?.title;
        return refuse(state, error, title === undefined ? undefined : { commission: title });
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
