import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advance,
  awaitingParties,
  commitParty,
  newCareer,
  postingPatrons,
  type Career,
  type Hero,
} from '@heroesim/engine';
import { App } from '../src/App';
import { content } from '../src/content';
import { Former } from '../src/panes/Former';
import { History } from '../src/panes/History';
import { Patrons } from '../src/panes/Patrons';
import { Roster } from '../src/panes/Roster';
import {
  careerReducer,
  emptyCareerState,
  type CareerState,
} from '../src/state/careerReducer';
import { formerCards, patronsBySphere, traitSummary } from '../src/state/selectors';
import { AUTOSAVE_SLOT, createCareerStorage, historyKey, memoryStore } from '../src/state/storage';
import { postingNothingSentence, WORTH_REMEMBERING } from '../src/words';

/**
 * E8-S6: every view the terminal has now has a browser counterpart reading the same
 * selectors (E7 §4). The three this story added are the Patrons by Sphere, the Heroes who
 * are no longer on the Roster, and the rolling history of five.
 *
 * Parity is of **information**, not of pixels (E8 §3): what is asserted here is that the
 * same facts reach the player, in `narrate`'s own words, not that the arrangement matches.
 *
 * Nothing here reaches for an engine function on a component's behalf: the panes ask a
 * selector and the reducer asks the engine (`tests/engine-imports.test.ts` keeps that
 * boundary).
 */

const SEED = 'web-parity-01';

afterEach(() => {
  cleanup();
});

/** A fresh Career, deep-copied so a test can put it where it needs it. */
function aCareer(): Career {
  return JSON.parse(JSON.stringify(newCareer(SEED, content).career)) as Career;
}

/** A copy in which one named Patron's Regard has reached the floor and stays there. */
function withASilentPatron(career: Career): { career: Career; name: string } {
  const copy = JSON.parse(JSON.stringify(career)) as Career;
  const patron = copy.patrons[0];
  if (patron === undefined) throw new Error('the test expected a Patron');
  // Below the floor the engine itself reads. Nothing here decides where the floor is.
  patron.regardForGuild.value = copy.config.patronPostsAboveRegard - 1;
  patron.regardForGuild.reason = 'the business at the weir went badly';
  return { career: copy, name: patron.name };
}

/** A copy with one former Hero of each kind the engine records. */
function withFormerHeroes(career: Career): Career {
  const copy = JSON.parse(JSON.stringify(career)) as Career;
  const kinds = [
    { kind: 'departure' as const, onDay: 40, reason: 'had enough of being sent out alone' },
    { kind: 'death' as const, onDay: 30, reason: 'did not come back from the weir' },
    { kind: 'retirement' as const, onDay: 20, reason: 'reached the end of a working life' },
  ];
  const taken: Hero[] = [];
  kinds.forEach((exit, index) => {
    const source = copy.guild.roster[index];
    if (source === undefined) throw new Error('the test expected a Roster');
    const gone = JSON.parse(JSON.stringify(source)) as Hero;
    gone.id = `${source.id}-gone-${String(index)}`;
    gone.exit = exit;
    taken.push(gone);
  });
  copy.guild.formerHeroes = taken;
  return copy;
}

describe('the Patrons, by Sphere', () => {
  it('groups by Sphere and gives each Patron a Regard and the reason it last moved', () => {
    const career = aCareer();
    render(<Patrons career={career} onClose={() => undefined} />);

    const spheres = screen.getAllByTestId('sphere');
    expect(spheres.length).toBeGreaterThan(0);
    expect(spheres.length).toBe(patronsBySphere(career).length);

    const patrons = screen.getAllByTestId('patron');
    expect(patrons).toHaveLength(career.patrons.length);
    for (const card of patrons) {
      const regard = within(card).getByTestId('patron-regard').textContent ?? '';
      // A bare number is never the whole cell (E7-S3): the reason is beside it.
      expect(regard).toMatch(/Regard for the Guild [+-]?\d+ · \S/);
    }
  });

  it('names every Sphere in words, and never as an identifier', () => {
    const career = aCareer();
    render(<Patrons career={career} onClose={() => undefined} />);
    const known = new Set(content.spheres.map((sphere) => sphere.name));
    for (const heading of screen.getAllByTestId('sphere-name')) {
      const said = heading.textContent ?? '';
      expect(known.has(said) || said === 'Another Sphere', said).toBe(true);
    }
  });

  it('says what each Patron has on the Board, or that they have nothing on it', () => {
    const career = aCareer();
    render(<Patrons career={career} onClose={() => undefined} />);
    const said = screen
      .getAllByTestId('patron-board')
      .map((element) => element.textContent ?? '')
      .join('\n');
    for (const commission of career.board) {
      expect(said).toContain(commission.title);
    }
  });

  it('says explicitly that a Patron at the floor is posting nothing', () => {
    const { career, name } = withASilentPatron(aCareer());
    // The engine agrees, which is the point: nothing in `web/` decides where the floor is.
    expect(postingPatrons(career).map((patron) => patron.name)).not.toContain(name);

    render(<Patrons career={career} onClose={() => undefined} />);
    const silent = screen.getAllByTestId('patron').find(
      (card) => (within(card).getByTestId('patron-name').textContent ?? '') === name,
    );
    expect(silent, 'the silent Patron is on the sheet').toBeDefined();
    expect(within(silent!).getByTestId('patron-silent').textContent).toBe(postingNothingSentence);
    expect(within(silent!).queryByTestId('patron-board')).toBeNull();
  });

  it('says so in words when no Patron holds an opinion yet', () => {
    const career = aCareer();
    career.patrons = [];
    render(<Patrons career={career} onClose={() => undefined} />);
    expect(screen.getByTestId('patrons-empty')).toBeInTheDocument();
  });
});

describe('the Heroes who are no longer on the Roster', () => {
  it('says how each one went, and when', () => {
    const career = withFormerHeroes(aCareer());
    render(<Former career={career} onClose={() => undefined} />);
    const said = screen
      .getAllByTestId('former-exit')
      .map((element) => element.textContent ?? '')
      .join('\n');
    expect(said).toContain('walked out');
    expect(said).toContain('did not come back');
    expect(said).toContain('reached the end of a working life');
    // The Day as the player reads it, never a bare Day number (E7-S3).
    expect(said).toMatch(/Year 1, Day 40/);
    expect(said).not.toMatch(/\bdeparture\b|\bdeath\b|\bretirement\b/);
    // And never says the going twice: a Retirement's reason on the Career *is* the exit
    // words, so this read "reached the end of a working life, Year 1, Day 20: reached the
    // end of a working life" until `narrate`'s `exitReason` dropped it, in both front ends.
    expect(said.match(/reached the end of a working life/g)).toHaveLength(1);
    expect(said).not.toContain('working life: reached');
    // The reasons that do say something the going did not are kept.
    expect(said).toContain('had enough of being sent out alone');
    expect(said).toContain('did not come back from the weir');
  });

  it('keeps their Traits and their Regard readable', () => {
    const career = withFormerHeroes(aCareer());
    render(<Former career={career} onClose={() => undefined} />);
    for (const card of screen.getAllByTestId('former')) {
      expect(within(card).getByTestId('former-regard').textContent).toMatch(
        /Regard [+-]?\d+ · \S/,
      );
      expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0);
    }
  });

  it('is newest first', () => {
    const career = withFormerHeroes(aCareer());
    const days = formerCards(career).map((card) => card.hero.exit?.onDay ?? 0);
    expect(days).toEqual([...days].sort((left, right) => right - left));
  });

  it('shows a departed or dead Hero nowhere on the Roster', () => {
    const career = withFormerHeroes(aCareer());
    const gone = career.guild.formerHeroes.map((hero) => hero.id);
    render(<Roster career={career} />);
    const shown = screen.getAllByTestId('hero').map((card) => card.textContent ?? '');
    for (const hero of career.guild.formerHeroes) {
      expect(shown.filter((text) => text.includes(hero.name)).length).toBe(
        career.guild.roster.filter((kept) => kept.name === hero.name).length,
      );
    }
    expect(gone.length).toBe(3);
  });

  it('says so in words when nobody has left yet', () => {
    render(<Former career={aCareer()} onClose={() => undefined} />);
    expect(screen.getByTestId('former-empty')).toBeInTheDocument();
  });
});

describe('the Roster at parity with the terminal', () => {
  it('gives every Trait the summary content gives it', () => {
    const career = aCareer();
    render(<Roster career={career} />);
    const said = screen.getAllByTestId('hero').map((card) => card.textContent ?? '').join('\n');
    let checked = 0;
    for (const hero of career.guild.roster) {
      for (const trait of hero.traits) {
        const summary = traitSummary(trait.name);
        if (summary === undefined) continue;
        expect(said, `${trait.name} has no summary on the Roster`).toContain(summary);
        checked += 1;
      }
    }
    expect(checked, 'no Trait on this Roster carries a summary at all').toBeGreaterThan(0);
  });
});

describe('the rolling history of five', () => {
  /** A Career played far enough that several decisions are behind it. */
  function played(): CareerState {
    let state: CareerState = careerReducer(emptyCareerState, {
      type: 'newCareer',
      seed: SEED,
    });
    const career = state.career;
    if (career === null) throw new Error('expected a Career');
    for (const commission of career.board.slice(0, 2)) {
      const free = career.guild.roster[0];
      if (free === undefined) break;
      state = careerReducer({ ...state, busy: false }, {
        type: 'commit',
        commissionId: commission.id,
        heroIds: [free.id],
      });
      break;
    }
    for (let step = 0; step < 12; step += 1) {
      state = careerReducer({ ...state, busy: false }, { type: 'advance' });
    }
    return state;
  }

  it('keeps at most five, newest last', () => {
    const state = played();
    expect(state.history.length).toBeGreaterThan(0);
    expect(state.history.length).toBeLessThanOrEqual(5);
  });

  it('is narrate’s own words, Day-stamped and never re-worded here', () => {
    const state = played();
    for (const entry of state.history) {
      expect(entry).toMatch(/^Year \d+, Day \d+ · \S/);
    }
  });

  it('covers the same moments the terminal remembers, and nothing else decides which', () => {
    // The set is `narrate`'s, shared by both front ends (DL-27 §6), so the browser cannot
    // come to remember a different eight kinds of moment from the terminal.
    expect(WORTH_REMEMBERING.has('PartyCommitted')).toBe(true);
    expect(WORTH_REMEMBERING.has('PartyReturned')).toBe(true);
    expect(WORTH_REMEMBERING.has('HallImproved')).toBe(true);
    expect(WORTH_REMEMBERING.has('UpkeepOwed' as never)).toBe(false);
  });

  it('actually carries each of those moments into the browser’s own window', () => {
    // The assertion above reads the very constant it claims to pin, and a reducer that
    // filtered `HallImproved` out before `entriesFrom` passed every test in the suite.
    // This drives the real reducer and reads what a player would see in the sheet.
    const seen: string[] = [];
    let state: CareerState = careerReducer(emptyCareerState, {
      type: 'newCareer',
      seed: SEED,
      years: 3,
    });
    const opened = state.career;
    if (opened === null) throw new Error('expected a Career');

    // A Party going out.
    const commission = opened.board[0];
    const hero = opened.guild.roster[0];
    if (commission === undefined || hero === undefined) throw new Error('expected work');
    state = careerReducer({ ...state, busy: false }, {
      type: 'commit',
      commissionId: commission.id,
      heroIds: [hero.id],
      insist: true,
    });
    expect(state.history.join(String.fromCharCode(10)), 'a Party going out').toContain(commission.title);
    seen.push('PartyCommitted');

    // Coin spent on the Hall, which is the kind the mutation silently dropped.
    state = careerReducer({ ...state, busy: false }, {
      type: 'improveHall',
      improvement: 'infirmary',
    });
    const afterHall = state.history.join(String.fromCharCode(10));
    if (afterHall.includes('infirmary')) seen.push('HallImproved');
    expect(afterHall, 'a Hall purchase').toContain('infirmary');

    // And the Party coming back, some Days later.
    for (let step = 0; step < 12 && !state.history.join(String.fromCharCode(10)).includes('came back'); step += 1) {
      state = careerReducer({ ...state, busy: false }, { type: 'advance' });
    }
    expect(state.history.join(String.fromCharCode(10)), 'a Party coming back').toContain('came back');
    seen.push('PartyReturned');

    expect(seen).toEqual(['PartyCommitted', 'HallImproved', 'PartyReturned']);
  });

  it('renders every entry whole, with its Day stamp above it', () => {
    const state = played();
    render(<History history={state.history} onClose={() => undefined} />);
    const entries = screen.getAllByTestId('history-entry');
    expect(entries).toHaveLength(state.history.length);
    for (const [index, entry] of entries.entries()) {
      const stamp = within(entry).getByTestId('history-stamp').textContent ?? '';
      const text = within(entry).getByTestId('history-text').textContent ?? '';
      // Whole: the browser wraps, so nothing is trimmed and nothing carries an ellipsis.
      expect(state.history[index]).toBe(`${stamp} · ${text}`);
      expect(text).not.toContain('…');
      expect(text).not.toMatch(/\.\.\.$/);
    }
  });

  it('renders fewer than five with no padding and no placeholder rows', () => {
    render(<History history={['Year 1, Day 3 · Something happened.']} onClose={() => undefined} />);
    expect(screen.getAllByTestId('history-entry')).toHaveLength(1);
  });

  it('says so in words when nothing has been decided yet', () => {
    render(<History history={[]} onClose={() => undefined} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('history-entry')).toHaveLength(0);
  });

  it('is written beside the Career, read back with it, and cleared with its slot', () => {
    const storage = createCareerStorage(memoryStore());
    const career = aCareer();
    const history = ['Year 1, Day 3 · A Party set out.', 'Year 1, Day 9 · They came back.'];

    expect(storage.save('1', career, '2026-09-20T00:00:00Z', history).ok).toBe(true);
    const loaded = storage.load('1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.history).toEqual(history);

    storage.clear('1');
    expect(storage.loadHistory('1')).toEqual([]);
  });

  it('keeps the Career even when the history beside it is nonsense', () => {
    const store = memoryStore();
    const storage = createCareerStorage(store);
    expect(storage.save('1', aCareer(), '2026-09-20T00:00:00Z', ['one']).ok).toBe(true);
    store.setItem(historyKey('1'), 'not json at all');
    const loaded = storage.load('1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.history).toEqual([]);
  });

  it('survives save, reload and load through the real controls', () => {
    globalThis.localStorage.clear();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    fireEvent.click(within(screen.getAllByTestId('commission')[0]!).getByRole('button'));
    fireEvent.click(screen.getAllByTestId('party-toggle')[0]!);
    fireEvent.click(screen.getByTestId('commit-party'));
    // Far enough to have something behind us, and never past the ending: a Career with no
    // fee coming in goes insolvent, and an ended one offers no Saves to press (E8-S6).
    for (let step = 0; step < 4; step += 1) {
      const advanceButton = screen.queryByTestId('advance');
      if (advanceButton === null || (advanceButton as HTMLButtonElement).disabled) break;
      fireEvent.click(advanceButton);
    }
    expect(screen.queryByTestId('reckoning'), 'the Career ended before the save').toBeNull();

    fireEvent.click(screen.getByTestId('open-more'));
    fireEvent.click(screen.getByTestId('open-history'));
    const before = screen
      .getAllByTestId('history-entry')
      .map((entry) => entry.textContent ?? '');
    expect(before.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('save-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // The page again, from the documents in storage and nothing else.
    cleanup();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));
    fireEvent.click(screen.getByTestId('open-more'));
    fireEvent.click(screen.getByTestId('open-history'));
    const after = screen.getAllByTestId('history-entry').map((entry) => entry.textContent ?? '');
    expect(after).toEqual(before);
  });

  it('follows the autosave, so it is never a Day behind the Career', () => {
    globalThis.localStorage.clear();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    fireEvent.click(within(screen.getAllByTestId('commission')[0]!).getByRole('button'));
    fireEvent.click(screen.getAllByTestId('party-toggle')[0]!);
    fireEvent.click(screen.getByTestId('commit-party'));

    const storage = createCareerStorage(globalThis.localStorage);
    const saved = storage.loadHistory(AUTOSAVE_SLOT);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[saved.length - 1]).toMatch(/^Year \d+, Day \d+ · \S/);
  });
});

describe('every sheet, from the keyboard', () => {
  /** The three E8-S6 added, plus one that was already there, opened as a player does. */
  function openThrough(which: 'open-patrons' | 'open-former' | 'open-history'): void {
    fireEvent.click(screen.getByTestId('open-more'));
    fireEvent.click(screen.getByTestId(which));
  }

  function started(): void {
    globalThis.localStorage.clear();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
  }

  it('is labelled, and takes the focus when it opens', () => {
    started();
    for (const [which, title] of [
      ['open-patrons', 'Patrons'],
      ['open-former', 'Former Heroes'],
      ['open-history', 'What has happened'],
    ] as const) {
      openThrough(which);
      const sheet = screen.getByRole('dialog', { name: title });
      expect(sheet).toHaveAttribute('aria-modal', 'true');
      // Focus is inside the sheet rather than on a control now behind a scrim.
      expect(sheet.contains(document.activeElement)).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
  });

  it('closes on Escape, and gives the focus back to the control that opened it', () => {
    started();
    const more = screen.getByTestId('open-more');
    more.focus();
    fireEvent.click(more);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'More' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('open-more'));
  });

  it('says what each control on the More sheet opens, tied to the control', () => {
    started();
    fireEvent.click(screen.getByTestId('open-more'));
    for (const which of ['open-patrons', 'open-former', 'open-history'] as const) {
      const control = screen.getByTestId(which);
      const describedBy = control.getAttribute('aria-describedby');
      expect(describedBy, `${which} says nothing about what it opens`).not.toBeNull();
      const says = document.getElementById(describedBy ?? '');
      expect(says?.textContent ?? '').toMatch(/\S/);
    }
  });
});

describe('a Career that has ended', () => {
  /** A one-Year Career, played until it stops. */
  function ended(): Career {
    let career = newCareer('web-parity-end', content, { careerYears: 1 }).career;
    for (let step = 0; step < 400 && career.ended === undefined; step += 1) {
      const commission = career.board[0];
      const free = career.guild.roster[0];
      if (commission !== undefined && free !== undefined) {
        try {
          career = commitParty(career, commission.id, [free.id], content, { insist: true }).career;
        } catch {
          // Nobody can go today; the Days still run.
        }
      }
      career = advance(career, 5, content).career;
    }
    if (career.ended === undefined) throw new Error('the Career did not end');
    return career;
  }

  /**
   * A Career that ended while a Party was still standing mid-Commission, waiting on a word
   * that can now never be given. It is not a contrived state: a sweep of sixty seeds found
   * it on nine of them, and `ended()` above happens to land on one of the fifty-one, which
   * is why `pane-word` being absent there proved nothing on its own.
   *
   * The seed and the three overrides are the sweep's; they are what makes a Decision
   * common enough, and the Guild solvent long enough, to reach the state inside a Year.
   */
  function endedWithAPartyWaiting(): Career {
    let career = newCareer('probe-1', content, {
      careerYears: 1,
      decisionChancePerBeat: 0.9,
      startingCoin: 4000,
    }).career;
    for (let step = 0; step < 400 && career.ended === undefined; step += 1) {
      const commission = career.board[0];
      const free = career.guild.roster[0];
      if (commission !== undefined && free !== undefined) {
        try {
          career = commitParty(career, commission.id, [free.id], content, { insist: true }).career;
        } catch {
          // Nobody can go today; the Days still run.
        }
      }
      career = advance(career, 5, content).career;
    }
    if (career.ended === undefined) throw new Error('the Career did not end');
    if (awaitingParties(career).length === 0) {
      throw new Error('the Career ended with nobody waiting on a word');
    }
    return career;
  }

  /** Load an ended Career through the real slot picker, as a player would. */
  function loadEnded(career: Career, history: readonly string[] = []): void {
    globalThis.localStorage.clear();
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('1', career, '2026-09-20T00:00:00Z', history);
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));
  }

  it('says nothing about an Upkeep that will never fall due or a Board that will never refresh', () => {
    loadEnded(ended());
    // Both clocks are cues about Days still to come, and there are none: the screen said
    // "Next Upkeep 88 coin in 10 Days · Board refreshes in 10 Days" under a reckoning.
    expect(screen.queryByTestId('upkeep-cue')).toBeNull();
    expect(screen.queryByTestId('refresh-cue')).toBeNull();
    const header = screen.getByTestId('guild-name').closest('header');
    const said = header?.textContent ?? '';
    expect(said).not.toContain('Next Upkeep');
    expect(said).not.toContain('Board refreshes');
    // What the Guild ended with stays: the Day it reached, its coin and its Standing.
    expect(screen.getByTestId('day').textContent).toMatch(/^Year \d+, Day \d+$/);
    expect(screen.getByTestId('coin').textContent).toMatch(/coin$/);
    expect(screen.getByTestId('standing')).toBeInTheDocument();
  });

  it('shows both clocks while the Career is still running', () => {
    // The other half of the pair, so the assertions above cannot pass by the cues having
    // been deleted outright.
    globalThis.localStorage.clear();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    expect(screen.getByTestId('upkeep-cue').textContent).toMatch(/Next Upkeep [\d,]+ coin in \d+ Days?$/);
    expect(screen.getByTestId('refresh-cue').textContent).toMatch(/Board refreshes in \d+ Days?$/);
  });

  it('asks for no word on a Party the Days can never reach again', () => {
    const career = endedWithAPartyWaiting();
    loadEnded(career);
    // The pane that asks, its options, its countdown and its "let the Days run" are all
    // decisions about a Career that is over (E8-S6 box 2, DL-27 §9).
    expect(screen.queryByTestId('pane-word')).toBeNull();
    expect(screen.queryByTestId('leave-it')).toBeNull();
    expect(screen.queryByTestId('word-waiting')).toBeNull();
    // And the bottom bar carries the Report rather than a badge counting the wait.
    expect(screen.getByTestId('bar-report').textContent).toBe('Report');
  });

  it('renders the reckoning, with the harm line and the Heroes another Guild took', () => {
    const career = ended();
    globalThis.localStorage.clear();
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('begin'));
    cleanup();

    // Through the real load path: a slot holding an ended Career, loaded by the picker.
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('1', career, '2026-09-20T00:00:00Z', []);
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));

    const reckoning = screen.getByTestId('reckoning').textContent ?? '';
    expect(reckoning).toMatch(/Harm: \d+ (Injury|Injuries) and \d+ (Scar|Scars) between them\./);
    expect(reckoning).toMatch(/Taken by another Guild: \d+ (Hero|Heroes)\./);
  });

  it('offers no decision about itself: no Advance, no Send, no Applicants, no Hall, no deal', () => {
    const career = ended();
    globalThis.localStorage.clear();
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('1', career, '2026-09-20T00:00:00Z', []);
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));

    for (const gone of ['advance', 'open-applicants', 'open-hall', 'open-rivals', 'open-saves']) {
      expect(screen.queryByTestId(gone), gone).toBeNull();
    }
    // The Board is readable, and nothing on it can be sent to.
    expect(screen.queryByTestId('pane-board')).toBeInTheDocument();
    for (const card of screen.queryAllByTestId('commission')) {
      expect(within(card).queryAllByRole('button')).toHaveLength(0);
    }
    expect(screen.queryByTestId('pane-word')).toBeNull();
    // And no cue about a decision it can no longer take.
    expect(screen.queryByTestId('applicants-waiting')).toBeNull();
    expect(screen.queryByTestId('word-waiting')).toBeNull();
  });

  it('keeps the read-only views, which is how a player reads what the Guild became', () => {
    const career = ended();
    globalThis.localStorage.clear();
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('1', career, '2026-09-20T00:00:00Z', ['Year 1, Day 3 · A Party set out.']);
    render(<App seed={SEED} />);
    fireEvent.click(screen.getByTestId('open-saves'));
    fireEvent.click(screen.getByTestId('load-1'));

    expect(screen.getByTestId('new-career')).toBeInTheDocument();
    expect(screen.getByTestId('open-league')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-more'));
    fireEvent.click(screen.getByTestId('open-patrons'));
    expect(screen.getAllByTestId('patron').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByTestId('open-more'));
    fireEvent.click(screen.getByTestId('open-history'));
    expect(screen.getAllByTestId('history-entry')).toHaveLength(1);
  });
});
