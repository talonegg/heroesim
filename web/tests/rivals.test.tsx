import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCareer, retaliationRisks, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import { League } from '../src/panes/League';
import { Rivals } from '../src/panes/Rivals';
import { Roster } from '../src/panes/Roster';
import {
  careerReducer,
  emptyCareerState,
  type CareerState,
} from '../src/state/careerReducer';
import { STANDING_EXPLAINED } from '../src/state/selectors';

/**
 * E5 in the browser: the other Guilds, what taking one of their people costs, and the
 * League.
 *
 * Two rules the sheet is written against. **Every reason a move cannot be made is in
 * text**, beside the disabled control rather than implied by it. And **a Poaching warns
 * before the tap**: what it costs in another Guild's goodwill is on screen before the
 * player's finger moves, not in the report afterwards.
 *
 * Nothing here reaches for an engine function of its own: the components ask a selector
 * and the reducer asks the engine (`tests/engine-imports.test.ts` keeps that boundary).
 */

const SEED = 'web-rivals-01';

afterEach(() => {
  cleanup();
});

/** A fresh Career, deep-copied so a test can put it where it needs it. */
function aCareer(coin = 10_000): Career {
  const career = JSON.parse(JSON.stringify(newCareer(SEED, content).career)) as Career;
  career.guild.coin = coin;
  return career;
}

/** The Career as it opens, for reading a config field off. */
function career0(): Career {
  return newCareer(SEED, content).career;
}

/** A copy in which one of a Rival's Heroes thinks exactly this much of them. */
function souring(career: Career, heroId: string, value: number): Career {
  const copy = JSON.parse(JSON.stringify(career)) as Career;
  for (const rival of copy.rivals) {
    for (const hero of rival.roster) {
      if (hero.id === heroId) hero.regardForRival.value = value;
    }
  }
  return copy;
}

function firstRivalHero(career: Career): { rivalId: string; heroId: string; name: string } {
  const rival = career.rivals[0];
  const hero = rival?.roster[0];
  if (rival === undefined || hero === undefined) throw new Error('the test expected a Rival Hero');
  return { rivalId: rival.id, heroId: hero.id, name: hero.name };
}

function show(career: Career, handlers: Partial<Record<'transfer' | 'poach', () => void>> = {}) {
  const onTransfer = vi.fn(handlers.transfer);
  const onPoach = vi.fn(handlers.poach);
  render(
    <Rivals
      career={career}
      onTransfer={onTransfer}
      onPoach={onPoach}
      onClose={() => undefined}
      disabled={false}
    />,
  );
  return { onTransfer, onPoach };
}

describe('the other Guilds sheet', () => {
  it('names every Guild, its Standing, its Roster size and what it makes of yours', () => {
    const career = aCareer();
    show(career);
    expect(screen.getAllByTestId('rival')).toHaveLength(career.rivals.length);
    for (const rival of career.rivals) {
      const card = screen
        .getAllByTestId('rival')
        .find((element) => within(element).queryByText(rival.name) !== null);
      expect(card, rival.id).toBeDefined();
      const standing = within(card as HTMLElement).getByTestId('rival-standing');
      expect(standing.textContent).toContain(String(rival.standing));
      expect(standing.textContent).toContain(String(rival.roster.length));
      expect(standing.textContent).toContain('Regard for your Guild');
      // The reason it stands where it does, which is the warning before a Board empties.
      expect(within(card as HTMLElement).getByTestId('rival-reason').textContent).toBe(
        rival.regardForGuild.reason,
      );
    }
  });

  it('reads each person Background first and Stats second, and never a calibre', () => {
    const career = aCareer();
    show(career);
    const people = screen.getAllByTestId('rival-hero');
    expect(people.length).toBeGreaterThan(3);
    const first = people[0] as HTMLElement;
    expect(within(first).getByTestId('rival-hero-background')).toBeTruthy();
    expect(first.querySelector('.chips')).toBeTruthy();
    expect(first.querySelector('.stats')).toBeTruthy();
    expect(within(first).getByTestId('rival-hero-terms').textContent).toContain('Age');
    expect(within(first).getByTestId('rival-hero-terms').textContent).toContain('what they make of');
    const said = people.map((element) => element.textContent ?? '').join('\n');
    expect(said.toLowerCase()).not.toContain('calibre');
    expect(said).not.toContain('★');
  });

  it('shows both fees as numbers on the controls themselves', () => {
    const career = aCareer();
    const { heroId } = firstRivalHero(career);
    show(career);
    expect(screen.getByTestId(`transfer-${heroId}`).textContent).toMatch(/Transfer for \d+ coin/);
    expect(screen.getByTestId(`poach-${heroId}`).textContent).toMatch(/Poach for \d+ coin/);
  });

  it('warns what a Poaching costs besides coin, before anything is tapped', () => {
    const career = aCareer();
    show(career);
    const warning = screen.getByTestId('poach-warning').textContent ?? '';
    expect(warning).toContain(String(career.config.poachRivalRegardCost));
    expect(warning).toContain('Regard');
    expect(warning).toContain('Board');
    expect(warning).toContain('back off your Roster');
  });

  it('disables a move with the reason in text, for each of the four reasons', () => {
    const base = aCareer();
    const { rivalId, heroId } = firstRivalHero(base);

    // Content enough where they are: the Poaching is refused and says so.
    const content_ = souring(base, heroId, 2);
    show(content_);
    expect(screen.getByTestId(`poach-${heroId}`)).toBeDisabled();
    expect(screen.getByTestId(`poach-${heroId}`)).toHaveAttribute('data-state', 'refused');
    expect(
      within(screen.getByTestId(`poach-${heroId}`).closest('.card') as HTMLElement)
        .getByTestId('why-not-poach').textContent,
    ).toContain('content enough');
    expect(screen.getByTestId(`transfer-${heroId}`)).toBeEnabled();
    cleanup();

    // They will not deal with you: the Transfer is refused and says why.
    const hostile = JSON.parse(JSON.stringify(base)) as Career;
    for (const rival of hostile.rivals) {
      if (rival.id === rivalId) rival.regardForGuild.value = -1;
    }
    show(hostile);
    expect(screen.getByTestId(`transfer-${heroId}`)).toBeDisabled();
    expect(
      within(screen.getByTestId(`transfer-${heroId}`).closest('.card') as HTMLElement)
        .getByTestId('why-not-transfer').textContent,
    ).toContain('will not deal with you');
    cleanup();

    // No coin: the shortfall is written out.
    const broke = aCareer(0);
    show(broke);
    expect(screen.getByTestId(`transfer-${heroId}`)).toBeDisabled();
    expect(
      within(screen.getByTestId(`transfer-${heroId}`).closest('.card') as HTMLElement)
        .getByTestId('why-not-transfer').textContent,
    ).toMatch(/The Guild is \d+ coin short/);
    cleanup();

    // No room: the cap, in words.
    const full = JSON.parse(JSON.stringify(base)) as Career;
    full.config.rosterCap = full.guild.roster.length;
    show(full);
    expect(screen.getByTestId(`transfer-${heroId}`)).toBeDisabled();
    expect(
      within(screen.getByTestId(`transfer-${heroId}`).closest('.card') as HTMLElement)
        .getByTestId('why-not-transfer').textContent,
    ).toContain('no room on your Roster');
  });

  it('marks a Guild you have wronged, in words', () => {
    const base = aCareer();
    const wronged = JSON.parse(JSON.stringify(base)) as Career;
    const first = wronged.rivals[0];
    if (first === undefined) throw new Error('the test expected a Rival');
    first.regardForGuild.value = wronged.config.souredRivalThreshold;
    show(wronged);
    const soured = screen.getAllByTestId('rival-soured');
    expect(soured).toHaveLength(1);
    expect(soured[0]?.textContent).toContain('wronged them');
    expect(soured[0]?.textContent).toContain('Board');
  });

  it('says whether a wronged Guild has room to take anybody (finding C7)', () => {
    const wronged = (rivalRosterMax: number): Career => {
      const copy = JSON.parse(JSON.stringify(aCareer())) as Career;
      copy.config.rivalRosterMax = rivalRosterMax;
      for (const rival of copy.rivals) rival.regardForGuild.value = copy.config.souredRivalThreshold;
      return copy;
    };
    show(wronged(20));
    for (const flag of screen.getAllByTestId('rival-soured')) {
      expect(flag.textContent).toContain('They have room to take somebody off your Roster.');
    }
    cleanup();

    // A wronged Guild whose own Roster is full is completely harmless, and says so.
    show(wronged(1));
    for (const flag of screen.getAllByTestId('rival-soured')) {
      expect(flag.textContent).toContain(
        'Their own Roster is full, so they can take nobody off yours just now.',
      );
    }
  });

  it('asks the reducer, which asks the engine', () => {
    const base = aCareer();
    const { rivalId, heroId } = firstRivalHero(base);
    const { onTransfer } = show(base);
    fireEvent.click(screen.getByTestId(`transfer-${heroId}`));
    expect(onTransfer).toHaveBeenCalledWith(rivalId, heroId);
  });
});

describe('the reducer', () => {
  function stateWith(career: Career): CareerState {
    return { ...emptyCareerState, career };
  }

  it('brings somebody over and narrates it', () => {
    const career = aCareer();
    const { rivalId, heroId, name } = firstRivalHero(career);
    const next = careerReducer(stateWith(career), { type: 'transfer', rivalId, heroId });
    expect(next.career?.guild.roster.some((hero) => hero.id === heroId)).toBe(true);
    expect(next.message).toBeNull();
    expect(next.paragraphs.map((paragraph) => paragraph.text).join('\n')).toContain(name);
  });

  it('takes somebody without asking, and the other Guild sours for it', () => {
    const career = souring(aCareer(), firstRivalHero(aCareer()).heroId, -3);
    const { rivalId, heroId } = firstRivalHero(career);
    const next = careerReducer(stateWith(career), { type: 'poach', rivalId, heroId });
    expect(next.career?.guild.roster.some((hero) => hero.id === heroId)).toBe(true);
    expect(next.career?.rivals.find((rival) => rival.id === rivalId)?.regardForGuild.value).toBe(
      -career.config.poachRivalRegardCost,
    );
  });

  it('narrates a refusal rather than swallowing it, and moves nobody', () => {
    // The Guild cannot pay: the engine says so with a `TransferRefused` event, which is a
    // thing that happened and is reported like one (E5-S2).
    const career = aCareer(0);
    const { rivalId, heroId } = firstRivalHero(career);
    const next = careerReducer(stateWith(career), { type: 'transfer', rivalId, heroId });
    expect(next.career?.guild.roster.some((hero) => hero.id === heroId)).toBe(false);
    expect(next.message).toBeNull();
    const said = next.paragraphs.map((paragraph) => paragraph.text).join('\n');
    expect(said).toContain('cannot pay');
    expect(said.length).toBeGreaterThan(0);
  });

  it('narrates the other three refusals too, which the browser cannot reach', () => {
    /**
     * Finding F9, half closed here (DL-22). `web/e2e/rivals.spec.ts` claimed to narrate a
     * refusal and in fact performed a **successful** Poaching, and no `TransferRefused` is
     * produced anywhere in the browser suite — because the Rivals sheet disables each
     * control exactly when the engine's own `rivalOffers` says the move would be refused,
     * and React re-renders from the same Career the tap then acts on, so there is no
     * window in which the two disagree. That leaves the reducer as the place the promise
     * "a refusal is a thing that happened, not an error" is actually kept, and this is it.
     */
    const refusal = (make: (career: Career) => Career, kind: 'transfer' | 'poach', says: string) => {
      const career = make(aCareer());
      const { rivalId, heroId } = firstRivalHero(career);
      const next = careerReducer(stateWith(career), { type: kind, rivalId, heroId });
      // Nobody moved, nothing was thrown, and the Report says what happened.
      expect(next.career?.guild.roster.some((hero) => hero.id === heroId), says).toBe(false);
      expect(next.message, says).toBeNull();
      expect(next.paragraphs.map((paragraph) => paragraph.text).join('\n'), says).toContain(says);
    };

    refusal(
      (career) => {
        const copy = JSON.parse(JSON.stringify(career)) as Career;
        for (const rival of copy.rivals) rival.regardForGuild.value = -5;
        return copy;
      },
      'transfer',
      'will not deal',
    );
    refusal(
      (career) => souring(career, firstRivalHero(career).heroId, 0),
      'poach',
      'content enough',
    );
    refusal(
      (career) => {
        const copy = JSON.parse(JSON.stringify(career)) as Career;
        copy.config.rosterCap = copy.guild.roster.length;
        return copy;
      },
      'transfer',
      'no room',
    );
  });

  it('turns a programming error into one sentence and leaves the world alone', () => {
    const career = aCareer();
    const next = careerReducer(stateWith(career), {
      type: 'transfer',
      rivalId: 'r99',
      heroId: 'nobody',
    });
    expect(next.career).toBe(career);
    expect(next.message).toContain('no such Guild');
  });
});

describe('the Roster, and who another Guild could take (finding C9)', () => {
  /** A copy in which every Hero thinks this of the Guildmaster and every Rival this of you. */
  function feeling(mine: number, theirs: number): Career {
    const copy = JSON.parse(JSON.stringify(aCareer())) as Career;
    for (const hero of copy.guild.roster) {
      hero.regardForGuildmaster = { value: mine, reason: 'the business at Thurrow', nature: 'neutral' };
    }
    for (const rival of copy.rivals) rival.regardForGuild.value = theirs;
    return copy;
  }

  it('marks nobody on a Roster nobody can take from', () => {
    render(<Roster career={feeling(5, -5)} />);
    expect(screen.queryAllByTestId('hero-at-risk')).toHaveLength(0);
  });

  it('marks a Hero in words and names the Guilds minded to try', () => {
    const career = feeling(career0().config.poachRegardThreshold, -5);
    render(<Roster career={career} />);
    const marks = screen.getAllByTestId('hero-at-risk');
    expect(marks).toHaveLength(career.guild.roster.length);
    const said = marks[0]?.textContent ?? '';
    expect(said).toContain('Another Guild could take them.');
    expect(said).toContain('are minded to.');
    for (const rival of career.rivals) expect(said).toContain(rival.name);
  });

  it('says so even when nobody is presently minded to try', () => {
    const career = feeling(career0().config.poachRegardThreshold, 0);
    render(<Roster career={career} />);
    const marks = screen.getAllByTestId('hero-at-risk');
    expect(marks).toHaveLength(career.guild.roster.length);
    expect(marks[0]?.textContent).toBe(
      'Another Guild could take them, though none is minded to just now.',
    );
  });

  it('names a single Guild in the singular', () => {
    const career = feeling(career0().config.poachRegardThreshold, 0);
    const first = career.rivals[0];
    if (first === undefined) throw new Error('the test expected a Rival');
    first.regardForGuild.value = -5;
    render(<Roster career={career} />);
    expect(screen.getAllByTestId('hero-at-risk')[0]?.textContent).toBe(
      `Another Guild could take them. ${first.name} is minded to.`,
    );
  });

  it('marks exactly the Heroes the engine names, on a Roster that is a mixture', () => {
    const career = feeling(0, -5);
    career.guild.roster.forEach((hero, index) => {
      hero.regardForGuildmaster = { value: index - 3, reason: 'x', nature: 'neutral' };
    });
    const risky = new Set(retaliationRisks(career).map((risk) => risk.heroId));
    expect(risky.size).toBeGreaterThan(0);
    expect(risky.size).toBeLessThan(career.guild.roster.length);
    render(<Roster career={career} />);
    for (const card of screen.getAllByTestId('hero')) {
      const name = card.querySelector('.card__title')?.textContent ?? '';
      const hero = career.guild.roster.find((entry) => entry.name === name);
      expect(hero, name).toBeDefined();
      expect(within(card).queryByTestId('hero-at-risk') !== null, name).toBe(
        risky.has(hero?.id ?? ''),
      );
    }
  });
});

describe('the League sheet', () => {
  it('lists every Guild ordered by Standing, with your row marked in text', () => {
    const career = aCareer();
    render(<League career={career} onClose={() => undefined} />);
    const rows = screen.getAllByTestId('league-row');
    expect(rows).toHaveLength(career.rivals.length + 1);
    const standings = rows.map((row) =>
      Number(/Standing (-?\d+)/.exec(row.textContent ?? '')?.[1] ?? 0),
    );
    expect([...standings].sort((one, other) => other - one)).toEqual(standings);
    const mine = rows.filter((row) => row.dataset['player'] === 'yes');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.textContent).toContain('your Guild');
    expect(mine[0]?.textContent).toContain(career.guild.name);
  });

  it('does not move your row for being yours', () => {
    const career = aCareer();
    const bottom = JSON.parse(JSON.stringify(career)) as Career;
    for (const patron of bottom.patrons) patron.regardForGuild.value = -5;
    for (const [index, rival] of bottom.rivals.entries()) rival.standing = 10 + index;
    render(<League career={bottom} onClose={() => undefined} />);
    const rows = screen.getAllByTestId('league-row');
    expect(rows[rows.length - 1]?.dataset['player']).toBe('yes');
  });

  it('says in the footer what Standing is, and that it is not a score', () => {
    render(<League career={aCareer()} onClose={() => undefined} />);
    const footer = screen.getByTestId('league-footer').textContent ?? '';
    expect(footer).toContain('not a score');
    expect(footer).toContain('earn their Regard');
    // Word for word what the terminal says under its own League, in the domain's own word
    // (DL-22). The two used to disagree on the last clause. E4's rule forbids showing
    // calibre as a star, a grade or a number *for a person*, which this is not.
    expect(footer).toContain('It buys one thing — the calibre of the people who come to your door.');
    expect(STANDING_EXPLAINED).toBe(footer);
  });

  it('shows no person’s calibre anywhere, however the footer names the mechanism', () => {
    show(aCareer());
    for (const card of screen.getAllByTestId('rival-hero')) {
      expect(card.textContent?.toLowerCase()).not.toContain('calibre');
      expect(card.textContent).not.toContain('★');
    }
  });

  it('uses no table at all, so there is nothing to drag sideways at 320px', () => {
    const { container } = render(<League career={aCareer()} onClose={() => undefined} />);
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('.card').length).toBeGreaterThan(1);
  });
});
