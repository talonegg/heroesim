import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { improveHall, newCareer, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import { Hall } from '../src/panes/Hall';
import { Roster } from '../src/panes/Roster';
import { PartyPicker } from '../src/panes/PartyPicker';
import {
  careerReducer,
  emptyCareerState,
  type CareerAction,
  type CareerState,
} from '../src/state/careerReducer';

/**
 * E3 in the browser: the Hall where the three improvements are bought, an age and the
 * Injuries and Scars on the Roster, and an injured Hero visibly unable to go.
 *
 * Nothing here reaches for an engine function of its own: the components ask a selector
 * and the reducer asks the engine (`tests/engine-imports.test.ts` keeps that boundary).
 */

const SEED = 'web-hall-01';

afterEach(() => {
  cleanup();
});

/** A Career holding exactly this much coin. */
function withCoin(coin: number): Career {
  const career = JSON.parse(JSON.stringify(newCareer(SEED, content).career)) as Career;
  career.guild.coin = coin;
  return career;
}

/**
 * A Career in which the first Hero is carrying an Injury that lifts on a known Day. The
 * Career starts on Day 1, so a `liftsOn` of 41 is forty Days of it still to run.
 */
function withAnInjury(liftsOn: number): { career: Career; hurt: string; name: string } {
  const career = JSON.parse(JSON.stringify(newCareer(SEED, content).career)) as Career;
  const hero = career.guild.roster[0];
  if (hero === undefined) throw new Error('the test expected a Roster');
  hero.traits.push({ name: 'Bruised', since: career.day, liftsOn });
  return { career, hurt: hero.id, name: hero.name };
}

/** Start a Career through the reducer and settle it, so the next action is accepted. */
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

describe('the Hall surface', () => {
  it('offers all three improvements with the cost and the effect', () => {
    render(
      <Hall career={withCoin(10_000)} onBuy={vi.fn()} onClose={() => undefined} disabled={false} />,
    );
    const offers = screen.getAllByTestId('hall-offer');
    expect(offers).toHaveLength(3);

    const config = withCoin(0).config;
    const together = offers.map((offer) => offer.textContent ?? '').join('\n');
    expect(together).toContain('Infirmary');
    expect(together).toContain('Training yard');
    expect(together).toContain('Quarters');
    expect(together).toContain(`${config.hallInfirmaryCost} coin`);
    expect(together).toContain(`${config.hallTrainingYardCost} coin`);
    expect(together).toContain(`${config.hallQuartersCost} coin`);
    // The effect of each, not only its name.
    expect(together).toContain('Injury');
    expect(together).toContain('Backing');
    expect(together).toContain('idle');
  });

  it('enables every improvement the Guild can afford, and says what it holds', () => {
    render(
      <Hall career={withCoin(10_000)} onBuy={vi.fn()} onClose={() => undefined} disabled={false} />,
    );
    // Grouped, in `narrate`'s one number format, which both front ends now print (DL-27 §1).
    expect(screen.getByTestId('hall-coin').textContent).toContain('10,000 coin');
    for (const id of ['hall-buy-infirmary', 'hall-buy-trainingYard', 'hall-buy-quarters']) {
      expect(screen.getByTestId(id)).toBeEnabled();
      expect(screen.getByTestId(id).getAttribute('data-state')).toBe('ready');
    }
    expect(screen.queryAllByTestId('hall-why')).toHaveLength(0);
  });

  it('disables what cannot be afforded and says how far short the Guild is', () => {
    const career = withCoin(10);
    render(<Hall career={career} onBuy={vi.fn()} onClose={() => undefined} disabled={false} />);
    const button = screen.getByTestId('hall-buy-infirmary');
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-state')).toBe('unaffordable');
    const reasons = screen.getAllByTestId('hall-why').map((node) => node.textContent ?? '');
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain(`${career.config.hallInfirmaryCost - 10} coin short`);
  });

  it('disables what is already built and says so', () => {
    const career = improveHall(withCoin(10_000), 'quarters').career;
    render(<Hall career={career} onBuy={vi.fn()} onClose={() => undefined} disabled={false} />);
    const button = screen.getByTestId('hall-buy-quarters');
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-state')).toBe('bought');
    expect(button.textContent).toContain('already built');
    expect(screen.getByTestId('hall-buy-infirmary')).toBeEnabled();
  });

  it('asks for the improvement the player tapped, and nothing else', () => {
    const onBuy = vi.fn();
    render(<Hall career={withCoin(10_000)} onBuy={onBuy} onClose={() => undefined} disabled={false} />);
    fireEvent.click(screen.getByTestId('hall-buy-trainingYard'));
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onBuy).toHaveBeenCalledWith('trainingYard');
  });

  it('is shut while an engine call is in flight', () => {
    render(<Hall career={withCoin(10_000)} onBuy={vi.fn()} onClose={() => undefined} disabled />);
    expect(screen.getByTestId('hall-buy-infirmary')).toBeDisabled();
  });
});

describe('the reducer’s improveHall', () => {
  it('buys an improvement, spends the coin and says so in the report', () => {
    const begun = started();
    const before = begun.career?.guild.coin ?? 0;
    const state = drive(begun, [{ type: 'improveHall', improvement: 'infirmary' }]);
    expect(state.career?.guild.hall).toEqual(['infirmary']);
    expect(state.career?.guild.coin).toBe(before - (state.career?.config.hallInfirmaryCost ?? 0));
    expect(state.message).toBeNull();
    expect(state.paragraphs.map((paragraph) => paragraph.text).join('\n')).toContain('infirmary');
  });

  it('refuses a second purchase of the same thing, and changes nothing', () => {
    const once = drive(started(), [{ type: 'improveHall', improvement: 'infirmary' }]);
    const twice = drive(once, [{ type: 'improveHall', improvement: 'infirmary' }]);
    expect(twice.career?.guild.hall).toEqual(['infirmary']);
    expect(twice.career?.guild.coin).toBe(once.career?.guild.coin);
    expect(twice.message).toContain('already has that');
  });

  it('refuses a purchase the Guild cannot pay for, and says what it would cost', () => {
    const begun = started();
    const career = begun.career;
    if (career === null) throw new Error('the test expected a Career');
    const broke: CareerState = {
      ...begun,
      career: { ...career, guild: { ...career.guild, coin: 0 } },
    };
    const state = drive(broke, [{ type: 'improveHall', improvement: 'quarters' }]);
    expect(state.career?.guild.hall).toEqual([]);
    expect(state.career?.guild.coin).toBe(0);
    expect(state.message).toContain('cannot pay for that yet');
    expect(state.message).toContain(`${career.config.hallQuartersCost} coin`);
  });

  it('drops a second purchase that arrives before the first has settled', () => {
    const begun = started();
    const busy = careerReducer(begun, { type: 'improveHall', improvement: 'infirmary' });
    const again = careerReducer(busy, { type: 'improveHall', improvement: 'quarters' });
    expect(again).toBe(busy);
    expect(again.career?.guild.hall).toEqual(['infirmary']);
  });
});

describe('the Roster after E3', () => {
  it('shows each Hero’s age', () => {
    const career = withCoin(500);
    render(<Roster career={career} />);
    const first = career.guild.roster[0];
    expect(first).toBeDefined();
    const card = screen.getAllByTestId('hero')[0];
    expect(card).toBeDefined();
    expect(within(card as HTMLElement).getByTestId('hero-age').textContent).toContain(
      String(first?.age ?? ''),
    );
  });

  it('shows an Injury with the Day it lifts, and says the Hero cannot be sent', () => {
    const { career, name } = withAnInjury(41);
    render(<Roster career={career} />);
    const card = screen.getAllByTestId('hero').find((node) => node.textContent?.includes(name));
    expect(card).toBeDefined();
    const scope = within(card as HTMLElement);
    expect(scope.getByTestId('hero-injuries')).toBeDefined();
    expect(scope.getByTestId('chip-injury').textContent).toContain('Bruised');
    expect(scope.getByTestId('chip-injury').textContent).toContain('lifts');
    expect(scope.getByTestId('hero-where').textContent).toContain('cannot be sent');
  });

  it('marks a Scar as one, in words as well as in colour', () => {
    const career = JSON.parse(JSON.stringify(withCoin(500))) as Career;
    const hero = career.guild.roster[0];
    if (hero === undefined) throw new Error('the test expected a Roster');
    hero.traits.push({ name: 'Limps', since: 1 });
    render(<Roster career={career} />);
    const card = screen.getAllByTestId('hero')[0];
    const chips = within(card as HTMLElement)
      .getAllByTestId('chip-scar')
      .map((node) => node.textContent ?? '');
    expect(chips.some((chip) => chip.includes('Limps'))).toBe(true);
    expect(chips.some((chip) => chip.includes('Scar'))).toBe(true);
  });

  it('says a Hero who is neither away nor hurt is available', () => {
    render(<Roster career={withCoin(500)} />);
    expect(
      screen.getAllByTestId('hero-where').some((node) => node.textContent?.includes('Available')),
    ).toBe(true);
  });
});

describe('the Party picker after E3', () => {
  it('does not offer an injured Hero, and says why they cannot go', () => {
    const { career, name } = withAnInjury(41);
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    render(
      <PartyPicker
        career={career}
        commission={commission}
        onCommit={vi.fn()}
        onClose={() => undefined}
        disabled={false}
      />,
    );

    // They are not among the people who can be toggled…
    const toggles = screen.getAllByTestId('party-toggle').map((node) => node.textContent ?? '');
    expect(toggles.some((label) => label.startsWith(`${name} · `))).toBe(false);

    // …and the picker says so, naming the Injury and the Day it lifts.
    const listed = screen.getAllByTestId('unavailable-hero');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.getAttribute('data-reason')).toBe('injured');
    expect(listed[0]?.textContent).toContain(name);
    expect(listed[0]?.textContent).toContain('Bruised');
    expect(listed[0]?.textContent).toContain('injured');
  });

  it('says nothing at all when everybody can go', () => {
    const career = withCoin(500);
    const commission = career.board[0];
    if (commission === undefined) throw new Error('the test expected a Commission');
    render(
      <PartyPicker
        career={career}
        commission={commission}
        onCommit={vi.fn()}
        onClose={() => undefined}
        disabled={false}
      />,
    );
    expect(screen.queryAllByTestId('unavailable')).toHaveLength(0);
  });
});
