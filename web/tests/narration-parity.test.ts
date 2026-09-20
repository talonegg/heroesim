/**
 * The same seed and the same list of decisions, driven down **both** front ends' own
 * paths, with the paragraphs diffed (E8-S2's last acceptance box, E8-S6 box 5, and the
 * last risk row in E8 §5).
 *
 * Both front ends call `narrateEvents` from `@heroesim/narrate`, so there is no second
 * implementation to drift — but "there is nothing to diverge" is an argument, not a test,
 * and what each front end does **around** the narration is its own: the terminal lays the
 * paragraphs out in `cli/src/layout.ts`'s `narrationLines`, and the browser appends them
 * in `careerReducer`. Either could come to re-word one, and until now nothing would have
 * said so. The CLI's narration is the **expected** side, because the terminal is the
 * reference front end (DL-01).
 *
 * **Where this lives, and why.** ESLint forbids `web` from importing `cli`, and
 * `web/tsconfig.json`'s `rootDir` makes a static cross-package import a compile error.
 * Both boundaries are real and stay. `web/tests/save-interop.test.ts` had the same problem
 * — it has to hold both ends of DL-02 at once — and solved it by loading the terminal's
 * module through its **file URL** at run time; this follows it, for the same reason and in
 * the same place: the browser's reducer is bundled by Vite, and only this project's Vitest
 * configuration can load it at all.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advanceUntilAttention,
  answerParty,
  applicantOffers,
  awaitingParties,
  commitParty,
  declineApplicant,
  improveHall,
  newCareer,
  poachHero,
  proposeParty,
  rivalOffers,
  transferHero,
  wordOffer,
  type Career,
  type GameEvent,
  type Step,
} from '@heroesim/engine';
import { content } from '../src/content';
import { narrateEvents } from '../src/words';
import {
  careerReducer,
  emptyCareerState,
  type CareerAction,
  type CareerState,
} from '../src/state/careerReducer';

/** `cli/src/layout.ts`, loaded at run time. See the header for why it is not imported. */
interface LayoutModule {
  narrationLines: (
    paragraphs: readonly { kind: string; day: number; text: string }[],
    career: Career,
    width: number,
  ) => string[];
}

function layoutModulePath(): string {
  const here = process.cwd();
  for (const from of [here, join(here, '..')]) {
    const candidate = join(from, 'cli', 'src', 'layout.ts');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot find cli/src/layout.ts from ${here}`);
}

const { narrationLines } = (await import(
  pathToFileURL(layoutModulePath()).href
)) as LayoutModule;

/**
 * Wide enough that `narrationLines` wraps nothing, so every paragraph comes back as one
 * indented line and the prose can be read off the layout exactly. The terminal's own
 * wrapping is arrangement and is tested where it belongs, in `cli/tests`.
 */
const UNWRAPPED = 100_000;

/** The `(xN) ` a run of collapsed coin lines carries. It is a count, not a word. */
const RUN = /^\(x\d+\) /;

/**
 * The prose the terminal actually prints for a step, read back off its own renderer.
 *
 * `narrationLines` indents each paragraph by two spaces and puts a Day heading and blank
 * lines around them, so an indented line is a paragraph and nothing else is. A run of
 * consecutive `coin` paragraphs is collapsed to the last of them with an `(xN)` count
 * (E7); the count is stripped here, because it is a count of repetitions rather than a
 * word about the world — and the run it stands for is a run of *identical* paragraphs, so
 * nothing is lost by comparing one of them.
 */
function terminalProse(events: readonly GameEvent[], career: Career): string[] {
  const paragraphs = narrateEvents(events, career, content);
  return narrationLines(paragraphs, career, UNWRAPPED)
    .filter((line) => line.startsWith('  '))
    .map((line) => line.slice(2).replace(RUN, ''));
}

/**
 * The prose the browser shows, at the same grain. A `Paragraph` whose text carries its own
 * newlines — the reckoning is one paragraph of a dozen lines — is one block in the browser
 * and a dozen lines in the terminal, which is arrangement and not wording (E8 §3), so both
 * sides are read a line at a time and every **word** still has to match.
 */
const NEWLINE = String.fromCharCode(10);

function browserProse(texts: readonly string[]): string[] {
  return texts.flatMap((text) => text.split(NEWLINE));
}

// ── The decision list ───────────────────────────────────────────────────────

/**
 * One decision, expressed once and taken on both sides. Each carries the engine call the
 * terminal makes and the reducer action the browser dispatches; the ids are resolved from
 * the Career in hand, which is the same Career on both sides at every step, so the two
 * runs cannot drift into making different decisions.
 *
 * `skip` lets a decision stand down when the world has not offered it — a door with
 * nobody at it, a Guild that will not deal — without the list silently doing nothing: the
 * run reports which kinds it actually exercised and the assertions below check the list.
 */
interface Decision {
  what: string;
  /**
   * What to call this decision when the step it took carried a Party acting on its own
   * judgement. Set only on the timeout, so that "a Party that timed out" is recorded from
   * the engine's own `PartyAnswered.byDefault` rather than from the list's intention.
   */
  timedOut?: string;
  /** Undefined when the world does not offer this decision today. */
  plan: (career: Career) => { step: (career: Career) => Step; action: CareerAction } | undefined;
}

/** True when a step carried a Party taking its Decision's default because nobody answered. */
function tookItsOwnJudgement(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'PartyAnswered' && event.byDefault);
}

function commit(insist: boolean): Decision {
  return {
    what: insist ? 'an insistence' : 'a Party committed',
    plan: (career) => {
      for (const commission of career.board) {
        const free = career.guild.roster.filter(
          (hero) => !career.parties.some((party) => party.heroIds.includes(hero.id)),
        );
        for (const hero of free) {
          let refuses: boolean;
          try {
            refuses = proposeParty(career, commission.id, [hero.id], content).refusals.length > 0;
          } catch {
            continue;
          }
          if (refuses !== insist) continue;
          const ids = [hero.id];
          return {
            step: (now) => commitParty(now, commission.id, ids, content, { insist }),
            action: { type: 'commit', commissionId: commission.id, heroIds: ids, insist },
          };
        }
      }
      return undefined;
    },
  };
}

const ADVANCE: Decision = {
  what: 'a stretch of Days',
  plan: () => ({
    step: (now) => advanceUntilAttention(now, content),
    action: { type: 'advance' },
  }),
};

const BUY_THE_HALL: Decision = {
  what: 'a Hall purchase',
  plan: (career) =>
    career.guild.hall.includes('infirmary')
      ? undefined
      : {
          step: (now) => improveHall(now, 'infirmary'),
          action: { type: 'improveHall', improvement: 'infirmary' },
        },
};

function atTheDoor(take: boolean): Decision {
  return {
    what: take ? 'an Applicant taken on' : 'an Applicant declined',
    plan: (career) => {
      const offer = applicantOffers(career).find((entry) =>
        take ? entry.refusal === undefined : true,
      );
      if (offer === undefined) return undefined;
      const id = offer.applicant.id;
      return take
        ? { step: (now) => acceptApplicant(now, id), action: { type: 'accept', applicantId: id } }
        : { step: (now) => declineApplicant(now, id), action: { type: 'decline', applicantId: id } };
    },
  };
}

function aMove(kind: 'transfer' | 'poach', wanted: 'allowed' | 'refused'): Decision {
  return {
    what: `a ${kind === 'transfer' ? 'Transfer' : 'Poaching'} that is ${wanted}`,
    plan: (career) => {
      for (const rival of career.rivals) {
        for (const offer of rivalOffers(career, rival.id)) {
          const refusal = kind === 'transfer' ? offer.transferRefusal : offer.poachRefusal;
          const allowed = refusal === undefined;
          if (allowed !== (wanted === 'allowed')) continue;
          const rivalId = rival.id;
          const heroId = offer.hero.id;
          return {
            step: (now) =>
              kind === 'transfer' ? transferHero(now, rivalId, heroId) : poachHero(now, rivalId, heroId),
            action: { type: kind, rivalId, heroId },
          };
        }
      }
      return undefined;
    },
  };
}

/** Answer whichever Party is waiting with an option of the named kind (E6). */
function answer(kind: 'pressOn' | 'turnBack' | 'spend'): Decision {
  return {
    what: `a Party answered: ${kind}`,
    plan: (career) => {
      for (const party of awaitingParties(career)) {
        const offer = wordOffer(career, party.id, content);
        const option = offer?.options.find((entry) =>
          kind === 'turnBack'
            ? entry.kind === 'turnBack'
            : kind === 'spend'
              ? entry.cost !== undefined && entry.affordable
              : entry.kind !== 'turnBack' && entry.cost === undefined,
        );
        if (offer === undefined || option === undefined) continue;
        const partyId = party.id;
        const optionId = option.id;
        return {
          step: (now) => answerParty(now, partyId, optionId, content),
          action: { type: 'answer', partyId, optionId },
        };
      }
      return undefined;
    },
  };
}

/**
 * Let the Days run past a waiting Party until it acts on its own judgement — the timeout
 * (DL-23 §3). Both front ends reach it the same way: Advance, with nothing said. It is
 * recorded as a timeout only when one actually fired, which the engine says on
 * `PartyAnswered.byDefault`, so the list can never claim a kind it did not reach.
 */
const LET_IT_TIME_OUT: Decision = {
  what: 'a stretch of Days',
  timedOut: 'a Party that timed out',
  plan: (career) => (awaitingParties(career).length === 0 ? undefined : ADVANCE.plan(career)),
};

/**
 * The list, in the order it is played. It is long because E8-S6 box 5 names what it must
 * exercise; `ADVANCE` between the decisions is what actually makes the world produce
 * Applicants, returns and Parties that send word.
 */
const DECISIONS: Decision[] = [
  commit(false),
  ADVANCE,
  answer('pressOn'),
  ADVANCE,
  commit(true),
  ADVANCE,
  BUY_THE_HALL,
  ADVANCE,
  atTheDoor(true),
  atTheDoor(false),
  ADVANCE,
  aMove('transfer', 'allowed'),
  aMove('poach', 'refused'),
  // Send, let the Days run, answer: three times over, because which Beat a Party stops on
  // is the world's business and not the list's, and each answer needs one waiting.
  ...[...Array(3)].flatMap(() => [commit(false), ADVANCE, answer('spend'), ADVANCE]),
  ...[...Array(3)].flatMap(() => [commit(false), ADVANCE, answer('turnBack'), ADVANCE]),
  // And then send one more out and say nothing at all to it, until it acts on its own.
  ...[...Array(3)].flatMap(() => [
    commit(false),
    ADVANCE,
    LET_IT_TIME_OUT,
    LET_IT_TIME_OUT,
    LET_IT_TIME_OUT,
    LET_IT_TIME_OUT,
  ]),
  ADVANCE,
  ADVANCE,
];

// ── Driving both sides ──────────────────────────────────────────────────────

interface Run {
  /** Every paragraph, in order, as each front end ended up with it. */
  paragraphs: string[];
  /** Which decisions the world actually let the list take, in order. */
  taken: string[];
  /** Per decision: the paragraphs that decision produced. */
  steps: string[][];
  /**
   * The kinds of decision the run actually reached. Filled on the terminal side, which has
   * the events in hand, so that "a Party that timed out" is the engine's own
   * `PartyAnswered.byDefault` rather than the list's intention.
   */
  reached: Set<string>;
}

/**
 * The terminal's path: the same engine calls `cli/src/main.ts` makes, narrated by
 * `narrateEvents` and laid out by the terminal's own `narrationLines`, with the prose read
 * back off it. This is the **expected** side.
 */
function throughTheTerminal(opened: Career): Run {
  let career = opened;
  const run: Run = { paragraphs: [], taken: [], steps: [], reached: new Set() };

  for (const decision of DECISIONS) {
    if (career.ended !== undefined) break;
    const plan = decision.plan(career);
    if (plan === undefined) continue;
    let step: Step;
    try {
      step = plan.step(career);
    } catch {
      // The world moved; the terminal would print a refusal, which is not narration.
      continue;
    }
    career = step.career;
    const said = terminalProse(step.events, career);
    run.taken.push(decision.what);
    run.reached.add(decision.what);
    if (decision.timedOut !== undefined && tookItsOwnJudgement(step.events)) {
      run.reached.add(decision.timedOut);
    }
    run.steps.push(said);
    run.paragraphs.push(...said);
  }
  return run;
}

/** The browser's path: the very reducer the client dispatches into. */
function throughTheBrowser(opened: Career): Run {
  // Through the reducer's own `load`, which is what a player pressing Load goes through.
  // Its one note — "<Guild>, taken up again at …" — is the client's own label rather than
  // narration of an event, so the comparison starts at the first decision after it.
  let state: CareerState = careerReducer(emptyCareerState, { type: 'load', career: opened });
  const run: Run = { paragraphs: [], taken: [], steps: [], reached: new Set() };

  for (const decision of DECISIONS) {
    const career = state.career;
    if (career === null || career.ended !== undefined) break;
    const plan = decision.plan(career);
    if (plan === undefined) continue;
    const before = state.paragraphs.length;
    const next = careerReducer({ ...state, busy: false }, plan.action);
    // A refusal leaves the Career where it was and says so as a message, not a paragraph;
    // the terminal's side skipped the same decision for the same reason.
    if (next.career === career) continue;
    state = next;
    const said = browserProse(state.paragraphs.slice(before).map((entry) => entry.text));
    run.taken.push(decision.what);
    run.steps.push(said);
    run.paragraphs.push(...said);
  }
  return run;
}

const SEED = 'parity-e8s6';

/**
 * The Career both runs start from. Three config fields are turned up so that the run
 * actually reaches every kind of decision E8-S6 names: a Guild that goes insolvent on Day
 * 50 narrates nothing about a Transfer or a timeout, a Roster nobody has soured on never
 * refuses, and a Decision at the shipped rate is rare on purpose (DL-24). They are
 * overrides in one test — the same assist `cli/tests/e2e.test.ts`,
 * `cli/tests/rows.test.ts`, `web/tests/word.test.tsx` and `web/tests/save-interop.test.ts`
 * already use — and nothing about the shipped defaults changes.
 */
const opened = newCareer(SEED, content, {
  startingCoin: 2500,
  refusalRegardThreshold: 0,
  decisionChancePerBeat: 0.5,
});
const terminal = throughTheTerminal(opened.career);
const browser = throughTheBrowser(opened.career);

describe('the same seed and the same decisions, down both front ends', () => {
  it('takes the same decisions on both sides, in the same order', () => {
    expect(browser.taken).toEqual(terminal.taken);
  });

  it('exercises every kind of decision E8-S6 names', () => {
    const said = [...terminal.reached].join(' | ');
    for (const kind of [
      'a Party committed',
      'an insistence',
      'a stretch of Days',
      'a Hall purchase',
      'an Applicant taken on',
      'an Applicant declined',
      'a Party answered: pressOn',
      'a Party answered: turnBack',
      'a Party that timed out',
    ]) {
      expect(said, `the run never reached: ${kind}`).toContain(kind);
    }
    // A Transfer or a Poaching, and a refusal of one: which of the four the world offers
    // depends on the seed, so the list asks for both and this asserts at least one move
    // and at least one refusal were actually taken.
    expect(said).toMatch(/a (Transfer|Poaching) that is allowed/);
    expect(said).toMatch(/a (Transfer|Poaching) that is refused/);
  });

  it('narrates a return, which is what the paragraphs are mostly about', () => {
    expect(terminal.paragraphs.join('\n')).toMatch(/came back/);
  });

  it('says the same thing, paragraph for paragraph, with the terminal as the expected side', () => {
    // The whole stream at once, so a missing, extra or re-worded paragraph is shown in
    // place rather than as a count.
    expect(browser.paragraphs).toEqual(terminal.paragraphs);
  });

  it('says the same thing at every single decision, not merely over the whole run', () => {
    expect(browser.steps.length).toBe(terminal.steps.length);
    for (const [index, said] of terminal.steps.entries()) {
      expect(browser.steps[index], `at decision ${String(index)}: ${terminal.taken[index] ?? ''}`)
        .toEqual(said);
    }
  });

  it('compares enough paragraphs to mean something', () => {
    // A run that narrated nothing would pass every assertion above.
    // 142 paragraphs over 26 decisions, measured 2026-09-20. Held as a floor rather than
    // an equality, because the number moves with the content and the point is that the
    // comparison has something to compare.
    expect(terminal.paragraphs.length).toBeGreaterThan(100);
    expect(new Set(terminal.paragraphs).size).toBeGreaterThan(20);
  });
});
