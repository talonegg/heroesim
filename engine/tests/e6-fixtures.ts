/**
 * A fixture world that ships Decisions, kept apart from `fixtures.ts` on purpose.
 *
 * `fixtureContent` ships **none**, and nothing here changes it: a Commission with no
 * eligible Decision never stops, so every E1–E5 test and every verification fleet goes on
 * measuring the world it always measured, unedited (DL-23 §3). Only the tests in this epic
 * and the authored content on disk carry Decisions.
 *
 * `validateContent` is fed a whole content set here rather than a raw TOML table, which
 * works because a validated `Content` is structurally what the validator reads — the same
 * property `oneVignetteContent` already relies on.
 */

import { advance, commitParty } from '../src/career.js';
import { cloneCareer } from '../src/clone.js';
import { validateContent, type Content } from '../src/content.js';
import type { GameEvent } from '../src/events.js';
import { newCareer } from '../src/world.js';
import type { Career, GameConfig, Party, Step } from '../src/index.js';
import { fixtureContent } from './fixtures.js';

/**
 * One Decision on every Commission, so a test does not have to hunt for a seed whose work
 * happens to carry the right tags. `press-on` is the default, as all three shipped
 * Decisions' are: the default is what a Party does when nobody answers, and it must be
 * something the Guild can always afford (`validateContent` refuses one that is not).
 */
export const ASK_THE_GUIDE = {
  id: 'ask-the-guide',
  name: 'The guide wants more',
  weight: 3,
  tags: [],
  conditions: { minBeat: 2 },
  slots: { hero: 'highest:Guile' },
  prompt: '{hero} asks what to do about the guide.',
  options: [
    {
      id: 'press-on',
      kind: 'pressOn',
      label: 'Go on without him.',
      default: true,
      consequences: [{ kind: 'score', delta: -1 }],
      effect: { dcDelta: 1 },
    },
    {
      id: 'send-coin',
      kind: 'sendCoin',
      label: 'Send forty coin up the road.',
      cost: 40,
      requires: { minCoin: 40 },
      consequences: [],
      effect: { backingDelta: 1 },
    },
    {
      id: 'turn-back',
      kind: 'turnBack',
      label: 'Bring them home.',
      consequences: [{ kind: 'patronRegard', delta: -1, reason: 'came home without finishing' }],
    },
  ],
};

/** A second Decision, so selection has something to pick between and to weigh. */
export const THE_WATER_IS_UP = {
  id: 'the-water-is-up',
  name: 'The water is up',
  weight: 1,
  tags: [],
  conditions: { minBeat: 2, tags: ['water'] },
  slots: { hero: 'lowest:Nerve' },
  prompt: '{hero} sends word that the water is up.',
  options: [
    { id: 'press-on', kind: 'pressOn', label: 'Cross it.', default: true, consequences: [] },
    {
      id: 'send-coin',
      kind: 'sendCoin',
      label: 'Send for a boat.',
      cost: 4000,
      requires: { minCoin: 4000 },
      consequences: [],
    },
    { id: 'turn-back', kind: 'turnBack', label: 'Come back.', consequences: [] },
  ],
};

/**
 * A Decision whose `pressOn` gives the slot Hero a timed Trait that is **not** an Injury —
 * the case DL-16 §5 left open and E6 closes. `Steady` is a `disposition` in the fixture
 * world, so its holder must stay committable and must not be reported as injured.
 */
export const A_STEADYING_WORD = {
  id: 'a-steadying-word',
  name: 'A steadying word',
  weight: 1,
  tags: [],
  conditions: { minBeat: 2 },
  slots: { hero: 'any' },
  prompt: '{hero} asks for a word.',
  options: [
    {
      id: 'press-on',
      kind: 'pressOn',
      label: 'Tell them to hold.',
      default: true,
      consequences: [{ kind: 'trait', trait: 'Steady', days: 200 }],
    },
    { id: 'turn-back', kind: 'turnBack', label: 'Come home.', consequences: [] },
  ],
};

/** The fixture world with whichever Decisions a test wants in it. */
export function withDecisions(...decisions: unknown[]): Content {
  return validateContent({ ...fixtureContent, decisions });
}

/** The usual E6 world: two Decisions, one of which only fires on work tagged `water`. */
export const decisionContent: Content = withDecisions(ASK_THE_GUIDE, THE_WATER_IS_UP);

/** The world in which pressing on gives a timed Trait that is not an Injury. */
export const steadyingContent: Content = withDecisions(A_STEADYING_WORD);

/**
 * A Career with plenty of coin, so affordability is a thing a test sets rather than meets —
 * with its opening events, `CareerStarted` among them. A test that walks an event stream
 * for what it carries has to be given the first event of the Career too, or a field only
 * that event holds can never be seen (F13).
 */
export function openRichStep(seed: string, content: Content, config?: Partial<GameConfig>): Step {
  return newCareer(seed, content, { startingCoin: 5000, ...config });
}

/** The same Career, for a test that does not need what was said as it opened. */
export function openRich(seed: string, content: Content, config?: Partial<GameConfig>): Career {
  return openRichStep(seed, content, config).career;
}

/** Send the whole available Roster on the first Commission on the Board. */
export function sendEverybody(career: Career, content: Content): Step {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission on the Board');
  return commitParty(
    career,
    commission.id,
    career.guild.roster.slice(0, 2).map((hero) => hero.id),
    content,
  );
}

/**
 * Run a Career forward until a Party sends word, or give up. Deliberately uses `advance`
 * one Day at a time so that the Day a word arrives is never in doubt.
 */
export function untilWord(
  career: Career,
  content: Content,
  limit = 60,
): { career: Career; events: GameEvent[]; party: Party | undefined } {
  let held = career;
  const events: GameEvent[] = [];
  for (let step = 0; step < limit; step += 1) {
    const run = advance(held, 1, content);
    held = run.career;
    events.push(...run.events);
    const waiting = held.parties.find((party) => party.pendingWord !== undefined);
    if (waiting !== undefined) return { career: held, events, party: waiting };
    if (held.ended !== undefined) break;
  }
  return { career: held, events, party: undefined };
}

/**
 * A Career in which exactly one Party is waiting on word, reached by play rather than by
 * hand: send a Party, and let the Days run until one of them stops to ask.
 */
export function aPartyWaiting(
  seed: string,
  content: Content = decisionContent,
  config?: Partial<GameConfig>,
): { career: Career; party: Party } {
  const sent = sendEverybody(openRich(seed, content, config), content).career;
  const found = untilWord(sent, content);
  if (found.party === undefined) throw new Error(`no Party sent word on seed "${seed}"`);
  return { career: found.career, party: found.party };
}

/** A copy of a Career, edited in place by the caller. Never touches the original. */
export function edit(career: Career, change: (draft: Career) => void): Career {
  const copy = cloneCareer(career);
  change(copy);
  return copy;
}

/** Every event of one type in a list. */
export function of<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}
