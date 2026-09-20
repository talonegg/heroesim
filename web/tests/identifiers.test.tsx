import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advance,
  awaitingParties,
  commitParty,
  newCareer,
  proposeParty,
  wordOffers,
  type Career,
  type Content,
  type Hero,
} from '@heroesim/engine';
import { App } from '../src/App';
import { content } from '../src/content';
import { Former } from '../src/panes/Former';
import { Patrons } from '../src/panes/Patrons';
import { PartyPicker } from '../src/panes/PartyPicker';
import { Word } from '../src/panes/Word';

/**
 * **No line the player reads names an identifier** (E7-S5, DL-26 §3).
 *
 * The terminal grew this check in E7 after its paid-Decision confirmation printed
 * "Sending word costs 60 coin: send-coin" one line under the authored label for the same
 * option, and nothing caught it; `cli/tests/sweep.test.ts` has swept every terminal view
 * against the content's own id sets ever since. The browser had the same class of fault in
 * ten places — `Word.tsx` fell back to `card.defaultOptionId`, `selectors.ts` to an option
 * id, a Commission id, a Sphere id, a Rival id and a Hero id, `PartyPicker.tsx` to a Hero
 * id and `careerReducer.ts` to an Applicant id and a Hero id — and this is the assertion
 * that keeps them shut.
 *
 * The forbidden set is read from the **content's and the engine's own ids**, never from a
 * guess at what an identifier looks like: the authored Decision, option, Vignette and
 * Sphere ids, and every id the Career in hand actually carries.
 */

afterEach(() => {
  cleanup();
});

/**
 * Every identifier the content owns, in the terminal sweep's own terms: kebab-case or
 * camelCase, and long enough that a real word could never be mistaken for one. A Trait's
 * name, a Background's name and a Commission's title are **not** here — they are authored
 * words the player is meant to read.
 */
function contentIdentifiers(loaded: Content): string[] {
  const out = new Set<string>();
  const add = (id: string | undefined): void => {
    if (id === undefined || id.length < 5) return;
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(id) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(id)) out.add(id);
  };
  for (const decision of loaded.decisions) {
    add(decision.id);
    for (const option of decision.options) add(option.id);
  }
  for (const vignette of loaded.vignettes) add(vignette.id);
  for (const sphere of loaded.spheres) add(sphere.id);
  return [...out];
}

/** Every id the Career itself carries — a Hero's, a Commission's, a Party's, a Patron's. */
function careerIdentifiers(career: Career): string[] {
  const out = new Set<string>();
  const add = (id: string): void => {
    // `h1`, `c12.1`, `pa3`, `r2`: short, so they are matched as whole tokens below.
    if (id.length >= 2) out.add(id);
  };
  for (const hero of career.guild.roster) add(hero.id);
  for (const hero of career.guild.formerHeroes) add(hero.id);
  for (const commission of career.board) add(commission.id);
  for (const commission of career.recentCommissions) add(commission.id);
  for (const party of career.parties) {
    add(party.id);
    // The work a Party is out on has left the Board, which is exactly the lookup that used
    // to fall back to the id: `commissionTitle` is what the Word pane's heading reads.
    add(party.commissionId);
  }
  for (const patron of career.patrons) add(patron.id);
  for (const rival of career.rivals) {
    add(rival.id);
    for (const hero of rival.roster) add(hero.id);
  }
  for (const applicant of career.applicants) add(applicant.id);
  for (const offer of wordOffers(career, content)) {
    for (const option of offer.options) add(option.id);
  }
  return [...out];
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Everything on the screen right now, one text node to a line. Attributes are deliberately
 * not read: a `data-testid` is a handle for a test and never a line the player reads.
 *
 * The nodes are kept apart rather than run together, because `textContent` glues the end of
 * one element straight onto the start of the next — "…river-towns" + "Fee 120 coin" reads
 * as `river-townsFee`, and a word-boundary check would then miss the very identifier it is
 * looking for. This is the browser's equivalent of the terminal sweep's line array.
 */
function onScreen(): string {
  const lines: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const text = node.textContent ?? '';
    if (text.trim().length > 0) lines.push(text);
    node = walker.nextNode();
  }
  return lines.join('\n');
}

/** Fail naming the identifier and the text it reached, as the terminal's sweep does. */
function expectNoIdentifier(said: string, forbidden: readonly string[], where: string): void {
  for (const id of forbidden) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escape(id)}($|[^A-Za-z0-9-])`);
    const found = pattern.exec(said);
    if (found !== null) {
      const at = Math.max(0, found.index - 40);
      expect(id, `${where}: names an identifier in "${said.slice(at, found.index + 60)}"`).toBe('');
    }
  }
}

/** A Career on the Day a Party sent word, reached by play rather than by hand. */
function aCareerWaiting(): Career {
  const opened = newCareer('web-ids-word', content, {
    startingCoin: 5000,
    decisionChancePerBeat: 1,
  });
  const commission = opened.career.board[0];
  const hero = opened.career.guild.roster[0];
  if (commission === undefined || hero === undefined) throw new Error('expected work and a Hero');
  let career = commitParty(opened.career, commission.id, [hero.id], content).career;
  for (let day = 0; day < 60; day += 1) {
    career = advance(career, 1, content).career;
    if (awaitingParties(career).length > 0) return career;
  }
  throw new Error('no Party sent word');
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

/** A copy in which one Patron's Regard has reached the floor and they post nothing. */
function withASilentPatron(career: Career): Career {
  const copy = JSON.parse(JSON.stringify(career)) as Career;
  const patron = copy.patrons[0];
  if (patron === undefined) throw new Error('the test expected a Patron');
  patron.regardForGuild.value = copy.config.patronPostsAboveRegard - 1;
  patron.regardForGuild.reason = 'the business at the weir went badly';
  return copy;
}

const CONTENT_IDS = contentIdentifiers(content);

describe('no line the player reads names an identifier', () => {
  it('finds the identifiers it is checking against', () => {
    // The check is against the real id sets, so it cannot pass by having none to look for.
    expect(CONTENT_IDS).toContain('send-coin');
    expect(CONTENT_IDS).toContain('turn-back');
    expect(CONTENT_IDS.length).toBeGreaterThan(5);
  });

  it('in any pane or sheet of a played Career, driven through the real controls', () => {
    globalThis.localStorage.clear();
    render(<App seed="web-ids-01" />);
    fireEvent.click(screen.getByTestId('begin'));

    const reached: string[] = [];
    const sweep = (where: string): void => {
      expectNoIdentifier(onScreen(), CONTENT_IDS, where);
      reached.push(where);
    };

    sweep('the Board, the Roster and the Report');

    // Every sheet the header opens, and the three behind More.
    for (const [open, name] of [
      ['open-applicants', 'the Applicants sheet'],
      ['open-rivals', 'the other Guilds sheet'],
      ['open-league', 'the League sheet'],
      ['open-hall', 'the Hall sheet'],
      ['open-saves', 'the Saves sheet'],
    ] as const) {
      fireEvent.click(screen.getByTestId(open));
      sweep(name);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
    for (const [open, name] of [
      ['open-patrons', 'the Patrons sheet'],
      ['open-former', 'the former Heroes sheet'],
      ['open-history', 'the history sheet'],
    ] as const) {
      fireEvent.click(screen.getByTestId('open-more'));
      sweep('the More sheet');
      fireEvent.click(screen.getByTestId(open));
      sweep(name);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }

    // The Party picker over a real Commission, and then some Days.
    fireEvent.click(within(screen.getAllByTestId('commission')[0]!).getByRole('button'));
    sweep('the Party picker');
    fireEvent.click(screen.getAllByTestId('party-toggle')[0]!);
    sweep('the Party picker with a Hero chosen');
    fireEvent.click(screen.getByTestId('commit-party'));
    for (let step = 0; step < 6; step += 1) {
      const button = screen.queryByTestId('advance');
      if (button === null || (button as HTMLButtonElement).disabled) break;
      fireEvent.click(button);
      sweep(`the Report after ${String(step + 1)} more stretches`);
    }

    expect(reached.length).toBeGreaterThan(12);
  });

  it('on the Word pane, whose option labels are the very ids E7 caught', () => {
    const career = aCareerWaiting();
    render(
      <Word
        career={career}
        onAnswer={() => undefined}
        onLetTheDaysRun={() => undefined}
        disabled={false}
      />,
    );
    // The pane is really showing a Decision, so the check has something to catch.
    expect(screen.getAllByTestId('word-prompt').length).toBeGreaterThan(0);
    expectNoIdentifier(onScreen(), CONTENT_IDS, 'the Word pane');
    expectNoIdentifier(onScreen(), careerIdentifiers(career), 'the Word pane');

    // And the explanation behind the second tap, which names the default option by label.
    fireEvent.click(screen.getByTestId('leave-it'));
    expect(screen.getByTestId('leave-it-explained')).toBeInTheDocument();
    expectNoIdentifier(onScreen(), CONTENT_IDS, 'letting the Days run');
    expectNoIdentifier(onScreen(), careerIdentifiers(career), 'letting the Days run');
  });

  it('on the former Heroes sheet, with every exit kind the engine records', () => {
    const career = withFormerHeroes(newCareer('web-ids-01', content).career);
    render(<Former career={career} onClose={() => undefined} />);
    expect(screen.getAllByTestId('former')).toHaveLength(3);
    expectNoIdentifier(onScreen(), CONTENT_IDS, 'the former Heroes sheet');
    // Their exit kinds are the engine's tokens and must never be printed either.
    expectNoIdentifier(onScreen(), ['departure', 'retirement'], 'the former Heroes sheet');
  });

  it('on the Patrons sheet, with a Patron at the posting floor', () => {
    const career = withASilentPatron(newCareer('web-ids-01', content).career);
    render(<Patrons career={career} onClose={() => undefined} />);
    expect(screen.getAllByTestId('patron-silent').length).toBeGreaterThan(0);
    expectNoIdentifier(onScreen(), CONTENT_IDS, 'the Patrons sheet');
    expectNoIdentifier(onScreen(), careerIdentifiers(career), 'the Patrons sheet');
  });

  it('on the Party picker, where a Hero is away and another will not go', () => {
    // A Career with somebody out on work, so the picker has a Hero it cannot name from the
    // Roster's own list, and a refusal to explain.
    const opened = newCareer('web-ids-01', content, { refusalRegardThreshold: 0 });
    const commission = opened.career.board[0];
    const first = opened.career.guild.roster[0];
    if (commission === undefined || first === undefined) throw new Error('expected work');
    const career = commitParty(opened.career, commission.id, [first.id], content, {
      insist: true,
    }).career;
    const next = career.board[0];
    if (next === undefined) throw new Error('expected another Commission');

    render(
      <PartyPicker
        career={career}
        commission={next}
        disabled={false}
        onCommit={() => undefined}
        onClose={() => undefined}
      />,
    );
    // Somebody is away, which is the card that used to carry a Hero id.
    expect(screen.getAllByTestId('unavailable-hero').length).toBeGreaterThan(0);
    // And every Hero the engine would refuse, chosen one at a time, so the refusal cards
    // render too.
    for (const hero of career.guild.roster) {
      let refuses: boolean;
      try {
        refuses = proposeParty(career, next.id, [hero.id], content).refusals.length > 0;
      } catch {
        continue;
      }
      if (!refuses) continue;
      const toggles = screen.getAllByTestId('party-toggle');
      const toggle = toggles.find((button) => (button.textContent ?? '').includes(hero.name));
      if (toggle === undefined) continue;
      fireEvent.click(toggle);
      break;
    }
    expectNoIdentifier(onScreen(), CONTENT_IDS, 'the Party picker');
    expectNoIdentifier(onScreen(), careerIdentifiers(career), 'the Party picker');
  });
});
