import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  awaitingParties,
  commitParty,
  newCareer,
  projectedReturn,
  turnBackOutcome,
  wordOffer,
  type Career,
} from '@heroesim/engine';
import { content } from '../src/content';
import { Shell } from '../src/layout/Shell';
import { Roster } from '../src/panes/Roster';
import { Word } from '../src/panes/Word';
import { careerReducer, emptyCareerState, type CareerState } from '../src/state/careerReducer';
import { turnBackSentence, wordCards, wordCue } from '../src/state/selectors';
import { coin, formatDay, wordProse } from '../src/words';

/**
 * E6 in the browser: a Party that has stopped mid-Commission takes over the Report pane,
 * raises a badge on the bottom bar, and stops Advance from passing it silently.
 *
 * The rules the pane is written against. **Every option is shown**, including one the
 * Guild cannot pay for — greyed with its cost and the reason in **text**, never hidden.
 * **The default is marked in words**, not by colour. And nothing here works out a rule:
 * `wordCards` asks the engine and `narrate`, and the reducer asks the engine to answer.
 */

const SEED = 'web-word-01';

afterEach(() => {
  cleanup();
});

/** A Career on the Day a Party sent word, reached by play rather than by hand. */
function aCareerWaiting(coin = 5000): { career: Career; partyId: string } {
  const opened = newCareer(SEED, content, { startingCoin: coin, decisionChancePerBeat: 1 });
  const commission = opened.career.board[0];
  const hero = opened.career.guild.roster[0];
  if (commission === undefined || hero === undefined) throw new Error('expected work and a Hero');
  let career = commitParty(opened.career, commission.id, [hero.id], content).career;
  for (let day = 0; day < 60; day += 1) {
    career = advance(career, 1, content).career;
    const party = awaitingParties(career)[0];
    if (party !== undefined) return { career, partyId: party.id };
  }
  throw new Error('no Party sent word');
}

function renderShell(career: Career, overrides: Record<string, unknown> = {}) {
  return render(
    <Shell
      career={career}
      content={content}
      paragraphs={[]}
      pane="report"
      onPane={() => undefined}
      onAdvance={() => undefined}
      onAnswer={() => undefined}
      onSend={() => undefined}
      onOpenSaves={() => undefined}
      onOpenHall={() => undefined}
      onOpenApplicants={() => undefined}
      onOpenRivals={() => undefined}
      onOpenLeague={() => undefined}
      onOpenMore={() => undefined}
      onNewCareer={() => undefined}
      busy={false}
      {...overrides}
    />,
  );
}

describe('the Word pane', () => {
  it('shows the prompt, both clocks and the coin the Guild holds', () => {
    const { career, partyId } = aCareerWaiting();
    const offer = wordOffer(career, partyId, content);
    if (offer === undefined) throw new Error('expected an offer');
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    expect(screen.getByTestId('word-prompt')).toHaveTextContent(
      wordProse(offer, career, content).prompt.slice(0, 40),
    );
    expect(screen.getByTestId('word-clock')).toHaveTextContent(
      `act on their own judgement in ${String(offer.daysLeft)}`,
    );
    // Grouped, in `narrate`'s one number format, which both front ends now print (DL-27 §1).
    expect(screen.getByTestId('word-clock')).toHaveTextContent(
      `The Guild holds ${coin(career.guild.coin)}`,
    );
  });

  it('offers every option with its words, and the cost where there is one', () => {
    const { career, partyId } = aCareerWaiting();
    const offer = wordOffer(career, partyId, content);
    if (offer === undefined) throw new Error('expected an offer');
    const labels = wordProse(offer, career, content).labels;
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    for (const option of offer.options) {
      const button = screen.getByTestId(`answer-${partyId}-${option.id}`);
      expect(button).toHaveTextContent(labels[option.id] ?? '');
      if (option.cost !== undefined) expect(button).toHaveTextContent(`${String(option.cost)} coin`);
    }
  });

  it('marks the option the Party will take on its own, in words', () => {
    const { career, partyId } = aCareerWaiting();
    const offer = wordOffer(career, partyId, content);
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    const marks = screen.getAllByText('With no word from you, this is what they will do.');
    expect(marks).toHaveLength(1);
    expect(screen.getByTestId(`default-${offer?.defaultOptionId ?? ''}`)).toBeInTheDocument();
  });

  it('disables an option the Guild cannot pay for, with the reason in text and its cost still shown', () => {
    const { career, partyId } = aCareerWaiting(10);
    const offer = wordOffer(career, partyId, content);
    const dear = offer?.options.find((option) => !option.affordable);
    if (dear === undefined) throw new Error('the test expected an option out of reach');
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    const button = screen.getByTestId(`answer-${partyId}-${dear.id}`);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(`${String(dear.cost ?? 0)} coin`);
    const why = screen.getByTestId(`cannot-${dear.id}`);
    expect(why.textContent?.length ?? 0).toBeGreaterThan(10);
    expect(why).toHaveTextContent(/coin/);
    // The other options are still open, so the Party is never stuck.
    const open = offer?.options.filter((option) => option.affordable) ?? [];
    expect(open.length).toBeGreaterThan(0);
    for (const option of open) {
      expect(screen.getByTestId(`answer-${partyId}-${option.id}`)).toBeEnabled();
    }
  });

  it('asks the reducer to answer, and nothing else', () => {
    const { career, partyId } = aCareerWaiting();
    const onAnswer = vi.fn();
    render(<Word career={career} onAnswer={onAnswer} onLetTheDaysRun={() => undefined} disabled={false} />);
    fireEvent.click(screen.getByTestId(`answer-${partyId}-turn-back`));
    expect(onAnswer).toHaveBeenCalledWith(partyId, 'turn-back');
  });

  it('is silent when nobody is waiting', () => {
    const career = newCareer(SEED, content).career;
    expect(wordCards(career)).toEqual([]);
    const { container } = render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('the Shell while a Party waits', () => {
  it('puts the Word pane where the Report was, and badges the bar in words', () => {
    const { career } = aCareerWaiting();
    renderShell(career);
    expect(screen.getByTestId('pane-word')).toBeInTheDocument();
    expect(screen.queryByTestId('pane-report')).toBeNull();
    expect(screen.getByTestId('bar-report')).toHaveTextContent('Word (1)');
  });

  it('will not let Advance pass it, and says why in the header', () => {
    const { career } = aCareerWaiting();
    renderShell(career);
    expect(screen.getByTestId('advance')).toBeDisabled();
    const cue = screen.getByTestId('word-waiting');
    expect(cue).toHaveTextContent('waiting on your word');
    // Re-worded in DL-24 §A1. It used to say "the Days will not run until you answer",
    // which is true of this client and false of the engine, and there was nothing in the
    // client that could make it false. There is now, and it is named here.
    expect(cue).toHaveTextContent('Advance is held until you answer, or leave it to them');
    expect(cue).toHaveTextContent('acts on its own judgement in');
  });

  it('gives the Report and the Advance button back once the word is answered', () => {
    const { career, partyId } = aCareerWaiting();
    const answered = careerReducer(
      { ...emptyCareerState, career } satisfies CareerState,
      { type: 'answer', partyId, optionId: 'press-on' },
    );
    if (answered.career === null) throw new Error('expected a Career');
    renderShell(answered.career);
    expect(screen.getByTestId('pane-report')).toBeInTheDocument();
    expect(screen.queryByTestId('pane-word')).toBeNull();
    expect(screen.getByTestId('bar-report')).toHaveTextContent('Report');
    expect(screen.getByTestId('advance')).toBeEnabled();
  });
});

describe('the reducer', () => {
  it('answers through the engine and appends what was said', () => {
    const { career, partyId } = aCareerWaiting();
    const state = careerReducer({ ...emptyCareerState, career }, {
      type: 'answer',
      partyId,
      optionId: 'turn-back',
    });
    expect(state.message).toBeNull();
    expect(awaitingParties(state.career ?? career)).toEqual([]);
    expect(state.paragraphs.some((entry) => entry.kind === 'answer')).toBe(true);
  });

  it('turns a refusal into one sentence, and leaves the world alone', () => {
    const { career, partyId } = aCareerWaiting(10);
    const state = careerReducer({ ...emptyCareerState, career }, {
      type: 'answer',
      partyId,
      optionId: 'send-coin',
    });
    expect(state.career).toBe(career);
    expect(state.message).toBeTruthy();
    expect(state.message).toContain('coin');
  });

  it('refuses an option the Decision does not offer, in one sentence', () => {
    const { career, partyId } = aCareerWaiting();
    const state = careerReducer({ ...emptyCareerState, career }, {
      type: 'answer',
      partyId,
      optionId: 'run-away',
    });
    expect(state.career).toBe(career);
    expect(state.message).toBeTruthy();
  });

  it('drops a second answer that arrives while the first is still settling', () => {
    const { career, partyId } = aCareerWaiting();
    const busy = { ...emptyCareerState, career, busy: true };
    expect(careerReducer(busy, { type: 'answer', partyId, optionId: 'press-on' })).toBe(busy);
  });
});

describe('the selectors', () => {
  it('carry the words and the numbers together, and compute neither themselves', () => {
    const { career, partyId } = aCareerWaiting();
    const [card] = wordCards(career);
    const offer = wordOffer(career, partyId, content);
    if (card === undefined || offer === undefined) throw new Error('expected a card');
    expect(card.partyId).toBe(partyId);
    expect(card.daysLeft).toBe(offer.daysLeft);
    expect(card.daysWaited).toBe(offer.daysWaited);
    expect(card.defaultOptionId).toBe(offer.defaultOptionId);
    expect(card.options.map((option) => option.id)).toEqual(
      offer.options.map((option) => option.id),
    );
    expect(card.names.length).toBeGreaterThan(0);
    expect(card.prompt).toBe(wordProse(offer, career, content).prompt);
  });

  it('give the cue the count and the tightest clock', () => {
    const { career } = aCareerWaiting();
    const cue = wordCue(career);
    expect(cue.waiting).toBe(1);
    expect(cue.daysLeft).toBe(career.config.wordTimeoutDays);
    expect(wordCue(newCareer(SEED, content).career)).toEqual({ waiting: 0, daysLeft: 0 });
  });
});

// ── Two reads the browser must not compute for itself (F11) ─────────────────

describe('what turning back would pay, said before it is chosen', () => {
  it('rides on the card, and is the engine’s own figure in the engine’s own words', () => {
    const { career, partyId } = aCareerWaiting();
    const outcome = turnBackOutcome(career, partyId, content);
    if (outcome === undefined) throw new Error('the test expected a turn-back outcome');
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    const said = screen.getByTestId('outcome-turn-back');
    expect(said).toHaveTextContent(turnBackSentence(outcome));
    expect(said).toHaveTextContent(`${String(outcome.feePaid)} coin`);
    expect(said).toHaveTextContent(
      `for ${String(outcome.beatsResolved)} of ${String(outcome.beatCount)} Beats done`,
    );
  });

  it('says it of the turn-back option and of neither of the others', () => {
    const { career, partyId } = aCareerWaiting();
    render(<Word career={career} onAnswer={() => undefined} onLetTheDaysRun={() => undefined} disabled={false} />);
    const [card] = wordCards(career);
    for (const option of card?.options ?? []) {
      if (option.kind === 'turnBack') expect(option.outcome).toBeTruthy();
      else expect(option.outcome, option.id).toBeUndefined();
    }
    expect(screen.queryByTestId('outcome-press-on')).toBeNull();
    expect(screen.queryByTestId('outcome-send-coin')).toBeNull();
    expect(partyId.length).toBeGreaterThan(0);
  });

  it('is the coin the Patron then actually pays', () => {
    const { career, partyId } = aCareerWaiting();
    const outcome = turnBackOutcome(career, partyId, content);
    const answered = careerReducer({ ...emptyCareerState, career }, {
      type: 'answer',
      partyId,
      optionId: 'turn-back',
    });
    const run = advance(answered.career ?? career, 60, content);
    const home = run.events.find(
      (event) => event.type === 'PartyReturned' && event.partyId === partyId,
    );
    expect(home?.type).toBe('PartyReturned');
    if (home?.type === 'PartyReturned') expect(home.feePaid).toBe(outcome?.feePaid);
  });
});

describe('the Roster while a Party waits', () => {
  it('says "back no sooner than", on the engine’s own projected Day', () => {
    const { career, partyId } = aCareerWaiting();
    const due = projectedReturn(career, partyId);
    if (due === undefined) throw new Error('the engine should project a waiting Party');
    render(<Roster career={career} />);
    const where = screen.getAllByTestId('hero-where').find((node) => node.className === 'away');
    expect(where).toBeDefined();
    expect(where).toHaveTextContent('waiting on your word');
    expect(where).toHaveTextContent('back no sooner than');
    expect(where).toHaveTextContent(formatDay(due, career));
  });

  it('goes back to plain "until" the moment the Party is answered', () => {
    const { career, partyId } = aCareerWaiting();
    const answered = careerReducer({ ...emptyCareerState, career }, {
      type: 'answer',
      partyId,
      optionId: 'press-on',
    });
    if (answered.career === null) throw new Error('expected a Career');
    if (answered.career.parties.length === 0) return;
    render(<Roster career={answered.career} />);
    const where = screen.getAllByTestId('hero-where').find((node) => node.className === 'away');
    expect(where).toBeDefined();
    expect(where?.textContent).toContain(' until ');
    expect(where?.textContent).not.toContain('no sooner');
  });
});

// ── Letting the Days run, from the browser (DL-24 §A1) ─────────────────────

describe('leaving it to their judgement', () => {
  it('offers a way to let the Days run that the main Advance still refuses', () => {
    const { career } = aCareerWaiting();
    renderShell(career);
    // The parity gap: the engine has always let the Days run past a waiting Party, and
    // the browser had no way to do it at all (DL-23 §3).
    expect(screen.getByTestId('advance')).toBeDisabled();
    const leave = screen.getByTestId('leave-it');
    expect(leave).toBeEnabled();
    expect(leave).toHaveTextContent('Leave it to their judgement and let the Days run');
    // Quiet rather than loud: it is not the thing being asked, and it is not the primary.
    expect(leave.className).not.toContain('button--primary');
  });

  it('says in the header what is true of this client, and no longer what is not', () => {
    const { career } = aCareerWaiting();
    renderShell(career);
    const cue = screen.getByTestId('word-waiting');
    expect(cue).toHaveTextContent('Advance is held until you answer, or leave it to them');
    expect(cue.textContent).not.toContain('the Days will not run until you answer');
  });

  it('does nothing on the first tap but explain what would happen, and when', () => {
    const { career, partyId } = aCareerWaiting();
    const onLetTheDaysRun = vi.fn();
    render(
      <Word
        career={career}
        onAnswer={() => undefined}
        onLetTheDaysRun={onLetTheDaysRun}
        disabled={false}
      />,
    );
    expect(screen.queryByTestId('leave-it-explained')).toBeNull();

    fireEvent.click(screen.getByTestId('leave-it'));
    expect(onLetTheDaysRun).not.toHaveBeenCalled();

    const said = screen.getByTestId('leave-it-explained');
    const [card] = wordCards(career);
    if (card === undefined) throw new Error('expected a card');
    expect(said).toHaveTextContent(/stands? still until/);
    expect(said).toHaveTextContent(formatDay(card.decidesOn, career));
    // And what they will do when they stop waiting — the default's own words.
    const fallback = card.options.find((option) => option.id === card.defaultOptionId);
    expect(said).toHaveTextContent(fallback?.label ?? '');
    expect(said).toHaveTextContent('Tap again to let the Days run.');
    expect(card.partyId).toBe(partyId);
    expect(screen.getByTestId('leave-it')).toHaveTextContent('Yes — let the Days run');
  });

  it('lets the Days run on the second tap, and on the second only', () => {
    const { career } = aCareerWaiting();
    const onLetTheDaysRun = vi.fn();
    render(
      <Word
        career={career}
        onAnswer={() => undefined}
        onLetTheDaysRun={onLetTheDaysRun}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByTestId('leave-it'));
    fireEvent.click(screen.getByTestId('leave-it'));
    expect(onLetTheDaysRun).toHaveBeenCalledTimes(1);
    // And it is back behind two taps afterwards, so a third tap cannot run more Days.
    expect(screen.queryByTestId('leave-it-explained')).toBeNull();
    fireEvent.click(screen.getByTestId('leave-it'));
    expect(onLetTheDaysRun).toHaveBeenCalledTimes(1);
  });

  it('is what the header promises: the Days really do pass the waiting Party', () => {
    const { career, partyId } = aCareerWaiting();
    // The same call the control makes. The Party stands still, the Day moves, and the
    // timeout eventually takes the default for them (DL-23 §3).
    const state = careerReducer({ ...emptyCareerState, career }, { type: 'advance' });
    const ran = state.career;
    if (ran === null) throw new Error('expected a Career');
    expect(ran.day).toBeGreaterThan(career.day);
    // Nobody is left waiting on a question nobody answered: the default was taken for
    // them on the Day it timed out, and the Report says plainly that it was.
    expect(awaitingParties(ran).some((party) => party.id === partyId)).toBe(false);
    expect(
      state.paragraphs.some(
        (entry) => entry.kind === 'answer' && entry.text.startsWith('No word went back in time'),
      ),
    ).toBe(true);
  });

  it('cannot be tapped while an engine call is still settling', () => {
    const { career } = aCareerWaiting();
    render(
      <Word
        career={career}
        onAnswer={() => undefined}
        onLetTheDaysRun={() => undefined}
        disabled
      />,
    );
    expect(screen.getByTestId('leave-it')).toBeDisabled();
  });
});
