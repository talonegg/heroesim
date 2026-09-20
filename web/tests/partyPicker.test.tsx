import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCareer, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import { PartyPicker } from '../src/panes/PartyPicker';

/**
 * E2 in the browser: the picker shows who will not go and why as Heroes are toggled, and
 * committing over a refusal takes two deliberate taps. The Career is put into the state
 * the rule is about — a Hero whose Regard has soured — the same way the engine's own
 * tests do it, because world generation never starts anybody that low.
 *
 * Nothing here reaches for an engine function of its own: the picker asks a selector, and
 * the selector asks the engine (`tests/engine-imports.test.ts` keeps that boundary).
 */

const SEED = 'web-refusals-01';

/** A Career in which the first Hero on the Roster refuses everything. */
function withASourHero(): { career: Career; sour: string; content: string } {
  const opened = newCareer(SEED, content).career;
  const career = JSON.parse(JSON.stringify(opened)) as Career;
  const sour = career.guild.roster[0];
  const content_ = career.guild.roster[1];
  if (sour === undefined || content_ === undefined) throw new Error('the test expected a Roster');
  sour.regardForGuildmaster = {
    value: career.config.refusalRegardThreshold,
    reason: 'you sent them anyway',
    nature: 'neutral',
  };
  return { career, sour: sour.id, content: content_.id };
}

function renderPicker(career: Career, onCommit = vi.fn()) {
  const commission = career.board[0];
  if (commission === undefined) throw new Error('the test expected a Commission');
  render(
    <PartyPicker
      career={career}
      commission={commission}
      onCommit={onCommit}
      onClose={() => undefined}
      disabled={false}
    />,
  );
  return { onCommit, commission };
}

/** The toggle for one Hero, found by the name it prints. A chosen one carries a tick too. */
function toggleFor(career: Career, heroId: string): HTMLElement {
  const name = career.guild.roster.find((hero) => hero.id === heroId)?.name ?? '';
  const found = screen
    .getAllByTestId('party-toggle')
    .find((toggle) => (toggle.textContent ?? '').includes(`${name} · `));
  if (found === undefined) throw new Error(`no toggle for ${name}`);
  return found;
}

describe('the Party picker and a Hero who will not go', () => {
  afterEach(() => {
    cleanup();
  });

  it('says nothing about refusals until a refusing Hero is chosen', () => {
    const { career, content: willing } = withASourHero();
    renderPicker(career);

    expect(screen.queryByTestId('refusals')).toBeNull();
    fireEvent.click(toggleFor(career, willing));
    expect(screen.queryByTestId('refusals')).toBeNull();
    expect(screen.getByTestId('commit-party').textContent).toContain('Commit');
  });

  it('names the Hero, the reason and the price as soon as they are chosen', () => {
    const { career, sour } = withASourHero();
    renderPicker(career);
    fireEvent.click(toggleFor(career, sour));

    const shown = screen.getByTestId('refusals');
    const entries = within(shown).getAllByTestId('refusal');
    expect(entries).toHaveLength(1);
    const name = career.guild.roster.find((hero) => hero.id === sour)?.name ?? '';
    expect(within(entries[0]!).getByRole('heading').textContent).toBe(name);
    expect(entries[0]!.textContent).toContain(String(career.config.refusalRegardThreshold));

    const cost = screen.getByTestId('insist-cost').textContent ?? '';
    expect(cost).toContain(`${String(Math.abs(career.config.insistenceRegardCost))} Regard`);
    expect(cost).toContain(String(career.config.departureRegardThreshold));
  });

  it('takes two taps to insist, and commits only on the second', () => {
    const { career, sour } = withASourHero();
    const { onCommit } = renderPicker(career);
    fireEvent.click(toggleFor(career, sour));

    const commit = screen.getByTestId('commit-party');
    expect(commit.textContent).toContain('Insist');
    expect(commit).toHaveAttribute('data-armed', 'no');

    fireEvent.click(commit);
    expect(onCommit).not.toHaveBeenCalled();
    expect(commit).toHaveAttribute('data-armed', 'yes');
    expect(commit.textContent).toContain('Regard');
    expect(screen.getByTestId('insist-cost').textContent).toContain('Tap again');

    fireEvent.click(commit);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([sour], true);
  });

  it('puts the insistence back behind two taps whenever the Party changes', () => {
    const { career, sour, content: willing } = withASourHero();
    const { onCommit } = renderPicker(career);
    fireEvent.click(toggleFor(career, sour));

    const commit = screen.getByTestId('commit-party');
    fireEvent.click(commit);
    expect(commit).toHaveAttribute('data-armed', 'yes');

    fireEvent.click(toggleFor(career, willing));
    expect(commit).toHaveAttribute('data-armed', 'no');

    fireEvent.click(commit);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(commit);
    expect(onCommit).toHaveBeenCalledWith([sour, willing], true);
  });

  it('commits a willing Party on one tap, and never claims to be insisting', () => {
    const { career, content: willing } = withASourHero();
    const { onCommit } = renderPicker(career);
    fireEvent.click(toggleFor(career, willing));

    const commit = screen.getByTestId('commit-party');
    expect(commit.textContent).not.toContain('Insist');
    fireEvent.click(commit);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([willing], false);
  });

  it('stops naming a refusal once the refusing Hero is taken back out', () => {
    const { career, sour } = withASourHero();
    renderPicker(career);
    fireEvent.click(toggleFor(career, sour));
    expect(screen.getByTestId('refusals')).toBeInTheDocument();
    fireEvent.click(toggleFor(career, sour));
    expect(screen.queryByTestId('refusals')).toBeNull();
  });
});
