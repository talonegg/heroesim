import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, newCareer, type Applicant, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import { Applicants } from '../src/panes/Applicants';
import { Shell } from '../src/layout/Shell';
import {
  careerReducer,
  emptyCareerState,
  type CareerAction,
  type CareerState,
} from '../src/state/careerReducer';

/**
 * E4 in the browser: the Applicants sheet, the cue on the main screen, and the two
 * decisions the reducer gained. The ordering assertion is the one that matters — the
 * Background and the Traits come before the Stats, and calibre is never shown at all
 * (E4 §5).
 *
 * Nothing here reaches for an engine function of its own: the components ask a selector
 * and the reducer asks the engine (`tests/engine-imports.test.ts` keeps that boundary).
 */

const SEED = 'web-applicants-01';

afterEach(() => {
  cleanup();
});

/** A Career with a batch waiting: the first one arrives on Day 10 at the shipped defaults. */
function withApplicants(coin = 10_000): Career {
  const opened = newCareer(SEED, content, { startingCoin: coin }).career;
  const career = advance(opened, 10, content).career;
  if (career.applicants.length === 0) throw new Error('the test expected a batch');
  return JSON.parse(JSON.stringify({ ...career, guild: { ...career.guild, coin } })) as Career;
}

/** The same Career, with the first Applicant marked as somebody coming back. */
function withAReturner(coin = 10_000): { career: Career; name: string } {
  const career = withApplicants(coin);
  const first = career.applicants[0] as Applicant;
  first.formerHeroId = first.id;
  career.guild.formerHeroes.push({
    ...career.guild.roster[0],
    id: first.id,
    name: first.name,
    exit: { kind: 'departure', onDay: 1, reason: 'you sent them anyway' },
  } as never);
  return { career, name: first.name };
}

function started(years = 1): CareerState {
  const begun = careerReducer(emptyCareerState, { type: 'newCareer', seed: SEED, years });
  return careerReducer(begun, { type: 'settled' });
}

function drive(state: CareerState, actions: CareerAction[]): CareerState {
  return actions.reduce(
    (held, action) => careerReducer(careerReducer(held, action), { type: 'settled' }),
    state,
  );
}

function renderSheet(career: Career, handlers?: { accept?: () => void; decline?: () => void }) {
  return render(
    <Applicants
      career={career}
      onAccept={handlers?.accept ?? vi.fn()}
      onDecline={handlers?.decline ?? vi.fn()}
      onClose={() => undefined}
      disabled={false}
    />,
  );
}

describe('the Applicants sheet', () => {
  it('shows everybody waiting, with the Background and the Traits before the Stats', () => {
    const career = withApplicants();
    renderSheet(career);
    const cards = screen.getAllByTestId('applicant');
    expect(cards).toHaveLength(career.applicants.length);

    const card = cards[0] as HTMLElement;
    const text = card.textContent ?? '';
    const applicant = career.applicants[0];
    if (applicant === undefined) throw new Error('the test expected an Applicant');
    expect(text).toContain(applicant.name);
    expect(text).toContain(applicant.background);
    expect(text).toContain(`asks ${applicant.askingFee} coin`);
    expect(text).toContain(`Age`);
    expect(text).toContain(String(applicant.age));

    // The Background line comes before the Stats block, in the document order a screen
    // reader and a sighted player both follow.
    const scope = within(card);
    const order = [...card.querySelectorAll('*')];
    const background = order.indexOf(scope.getByTestId('applicant-background'));
    const chips = order.indexOf(card.querySelector('.chips') as Element);
    const stats = order.indexOf(card.querySelector('.stats') as Element);
    expect(background).toBeGreaterThanOrEqual(0);
    expect(chips).toBeGreaterThan(background);
    expect(stats).toBeGreaterThan(chips);
  });

  it('never shows a calibre, as a number, a star or a grade', () => {
    renderSheet(withApplicants());
    const said = screen
      .getAllByTestId('applicant')
      .map((card) => card.textContent ?? '')
      .join('\n');
    expect(said.toLowerCase()).not.toContain('calibre');
    expect(said).not.toContain('★');
    expect(said).not.toContain('*');
  });

  it('marks somebody coming back in text, not in colour alone', () => {
    const { career, name } = withAReturner();
    renderSheet(career);
    const marks = screen.getAllByTestId('applicant-returning');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toContain('Coming back');
    expect(marks[0]?.textContent).toContain('walked out');
    const card = screen
      .getAllByTestId('applicant')
      .find((node) => node.textContent?.includes(name));
    expect(card?.textContent).toContain('Coming back');
  });

  it('enables Accept when the Guild can pay and there is a place', () => {
    const career = withApplicants();
    renderSheet(career);
    for (const applicant of career.applicants) {
      const button = screen.getByTestId(`accept-${applicant.id}`);
      expect(button).toBeEnabled();
      expect(button.getAttribute('data-state')).toBe('ready');
    }
    expect(screen.queryAllByTestId('applicant-why')).toHaveLength(0);
  });

  it('disables Accept with the reason in text when the Guild cannot pay', () => {
    const career = withApplicants(20);
    renderSheet(career);
    const applicant = career.applicants[0];
    if (applicant === undefined) throw new Error('the test expected an Applicant');
    const button = screen.getByTestId(`accept-${applicant.id}`);
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-state')).toBe('refused');
    const reasons = screen.getAllByTestId('applicant-why').map((node) => node.textContent ?? '');
    expect(reasons[0]).toContain('cannot pay');
    expect(reasons[0]).toContain(`${applicant.askingFee} coin`);
    expect(reasons[0]).toContain(`${applicant.askingFee - 20} short`);
    // Declining is still open: turning somebody away costs nothing.
    expect(screen.getByTestId(`decline-${applicant.id}`)).toBeEnabled();
  });

  it('disables Accept with the reason in text when the Roster is full', () => {
    const career = withApplicants();
    career.config = { ...career.config, rosterCap: career.guild.roster.length };
    renderSheet(career);
    const applicant = career.applicants[0];
    if (applicant === undefined) throw new Error('the test expected an Applicant');
    expect(screen.getByTestId(`accept-${applicant.id}`)).toBeDisabled();
    const reasons = screen.getAllByTestId('applicant-why').map((node) => node.textContent ?? '');
    expect(reasons[0]).toContain('Roster is full');
    expect(reasons[0]).toContain(String(career.guild.roster.length));
  });

  it('says so plainly when nobody is waiting', () => {
    renderSheet(newCareer(SEED, content).career);
    expect(screen.getByTestId('applicants-empty').textContent).toContain('Nobody is waiting');
    expect(screen.queryAllByTestId('applicant')).toHaveLength(0);
  });

  it('asks for the Applicant the player tapped, and nothing else', () => {
    const career = withApplicants();
    const accept = vi.fn();
    const decline = vi.fn();
    renderSheet(career, { accept, decline });
    const [first, second] = career.applicants;
    if (first === undefined || second === undefined) throw new Error('the test expected two');
    fireEvent.click(screen.getByTestId(`accept-${first.id}`));
    fireEvent.click(screen.getByTestId(`decline-${second.id}`));
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith(first.id);
    expect(decline).toHaveBeenCalledTimes(1);
    expect(decline).toHaveBeenCalledWith(second.id);
  });

  it('is shut while an engine call is in flight', () => {
    const career = withApplicants();
    render(
      <Applicants
        career={career}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={() => undefined}
        disabled
      />,
    );
    const applicant = career.applicants[0];
    expect(screen.getByTestId(`accept-${applicant?.id ?? ''}`)).toBeDisabled();
    expect(screen.getByTestId(`decline-${applicant?.id ?? ''}`)).toBeDisabled();
  });
});

describe('the cue on the main screen', () => {
  function renderShell(career: Career) {
    return render(
      <Shell
        career={career}
        content={content}
        paragraphs={[]}
        pane="board"
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
      />,
    );
  }

  it('says how many are waiting and how long the first will stay', () => {
    const career = withApplicants();
    renderShell(career);
    const cue = screen.getByTestId('applicants-waiting').textContent ?? '';
    expect(cue).toContain(String(career.applicants.length));
    expect(cue).toContain('waiting at the door');
    expect(cue).toContain('the first goes in');
    const button = screen.getByTestId('open-applicants');
    expect(button.textContent).toContain(`(${career.applicants.length})`);
    expect(button.getAttribute('data-waiting')).toBe(String(career.applicants.length));
  });

  it('says nothing when nobody is waiting, and still offers the door', () => {
    renderShell(newCareer(SEED, content).career);
    expect(screen.queryAllByTestId('applicants-waiting')).toHaveLength(0);
    const button = screen.getByTestId('open-applicants');
    expect(button.textContent).toBe('Applicants');
    expect(button.getAttribute('data-waiting')).toBe('0');
  });

  /**
   * Finding C2: the cue used to say "the first goes in N Days" regardless of whether any
   * offer waiting could actually be accepted — at a full Roster, none of them could be.
   * The button stays reachable; the line must say plainly why nobody can be taken on.
   */
  it('says plainly that none can be taken on, and names the Roster cap, at a full Roster', () => {
    const career = withApplicants();
    career.config = { ...career.config, rosterCap: career.guild.roster.length };
    renderShell(career);
    const cue = screen.getByTestId('applicants-waiting').textContent ?? '';
    expect(cue).toContain(String(career.applicants.length));
    expect(cue).toContain('waiting at the door');
    expect(cue).toContain('none can be taken on');
    expect(cue).toContain(`Roster is full at ${String(career.guild.roster.length)}`);
    expect(cue).not.toContain('the first goes in');
    // The door is still reachable: the button still opens the sheet.
    expect(screen.getByTestId('open-applicants')).toBeEnabled();
  });

  it('says plainly that none can be taken on, for want of coin, when the Guild is too poor for any of them', () => {
    const career = withApplicants(1);
    renderShell(career);
    const cue = screen.getByTestId('applicants-waiting').textContent ?? '';
    expect(cue).toContain('none can be taken on');
    expect(cue).toContain('cannot pay any of them yet');
    expect(cue).not.toContain('the first goes in');
    expect(screen.getByTestId('open-applicants')).toBeEnabled();
  });
});

describe('the reducer’s accept and decline', () => {
  /** A started Career advanced to the first batch, through the reducer alone. */
  function toTheFirstBatch(): CareerState {
    let state = started();
    for (let step = 0; step < 6 && (state.career?.applicants.length ?? 0) === 0; step += 1) {
      state = drive(state, [{ type: 'advance' }]);
    }
    if ((state.career?.applicants.length ?? 0) === 0) throw new Error('no batch arrived');
    return state;
  }

  it('takes somebody on, spends the fee and says so in the report', () => {
    const before = toTheFirstBatch();
    const applicant = before.career?.applicants[0];
    if (applicant === undefined || before.career === null) throw new Error('no Applicant');
    const coin = before.career.guild.coin;
    const roster = before.career.guild.roster.length;

    const state = drive(before, [{ type: 'accept', applicantId: applicant.id }]);
    expect(state.career?.guild.roster).toHaveLength(roster + 1);
    expect(state.career?.guild.coin).toBe(coin - applicant.askingFee);
    expect(state.career?.applicants.map((entry) => entry.id)).not.toContain(applicant.id);
    expect(state.message).toBeNull();
    const said = state.paragraphs.map((paragraph) => paragraph.text).join('\n');
    expect(said).toContain(applicant.name);
    expect(said).toContain('joins the Roster');
  });

  it('sends somebody away, changes nothing else, and says the player did it', () => {
    const before = toTheFirstBatch();
    const applicant = before.career?.applicants[0];
    if (applicant === undefined || before.career === null) throw new Error('no Applicant');
    const coin = before.career.guild.coin;

    const state = drive(before, [{ type: 'decline', applicantId: applicant.id }]);
    expect(state.career?.guild.coin).toBe(coin);
    expect(state.career?.applicants.map((entry) => entry.id)).not.toContain(applicant.id);
    expect(state.paragraphs.map((paragraph) => paragraph.text).join('\n')).toContain(
      `You send ${applicant.name} away`,
    );
  });

  it('refuses an offer the Guild cannot pay for, and says what it would cost', () => {
    const before = toTheFirstBatch();
    const career = before.career;
    const applicant = career?.applicants[0];
    if (career === null || career === undefined || applicant === undefined) {
      throw new Error('no Applicant');
    }
    const broke: CareerState = {
      ...before,
      career: { ...career, guild: { ...career.guild, coin: 0 } },
    };
    const state = drive(broke, [{ type: 'accept', applicantId: applicant.id }]);
    expect(state.career?.guild.roster).toHaveLength(career.guild.roster.length);
    expect(state.career?.guild.coin).toBe(0);
    expect(state.message).toContain('cannot pay for that yet');
    expect(state.message).toContain(`${applicant.askingFee} coin`);
  });

  it('refuses an id nobody is waiting under, and says so by name', () => {
    const state = drive(toTheFirstBatch(), [{ type: 'accept', applicantId: 'nobody' }]);
    expect(state.message).toContain('not waiting any more');
  });

  it('drops a second decision that arrives before the first has settled', () => {
    const before = toTheFirstBatch();
    const [first, second] = before.career?.applicants ?? [];
    if (first === undefined || second === undefined) throw new Error('the test expected two');
    const busy = careerReducer(before, { type: 'accept', applicantId: first.id });
    const again = careerReducer(busy, { type: 'decline', applicantId: second.id });
    expect(again).toBe(busy);
    expect(again.career?.applicants.map((entry) => entry.id)).toContain(second.id);
  });
});
