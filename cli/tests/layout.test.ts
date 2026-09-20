/**
 * The main screen (E7-S1): 80 columns, 24 rows, actable without scrolling. The Upkeep
 * timer, the coin, the Day and the size of the Roster are always on it; an awaiting Party
 * displaces the Board; coin is grouped and never abbreviated; and nothing is on it that
 * the player cannot act on from it.
 */

import { describe, expect, it } from 'vitest';
import {
  advance,
  awaitingParties,
  commissionById,
  commitParty,
  newCareer,
  serialiseCareer,
  wordOffers,
  type Career,
  type Content,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { formatDay } from '@heroesim/narrate';
import { hintLines, layOut, mainScreen, narrationLines, ROWS } from '../src/layout.js';
import { expectFits, flow, partyWaiting, severalWaiting, WIDTHS } from './helpers.js';

const content: Content = loadContentFromDisk();
const plain = newCareer('display', content).career;

const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';

/** The same Career with every name as long as anything could plausibly be. */
function stretched(career: Career): Career {
  return {
    ...career,
    guild: {
      ...career.guild,
      name: `${LONG} Guild of the Grand and Ancient Company of Hired Swords`,
      roster: career.guild.roster.map((hero) => ({ ...hero, name: LONG })),
    },
    patrons: career.patrons.map((patron) => ({ ...patron, name: `${LONG}, Patron` })),
    board: career.board.map((commission) => ({
      ...commission,
      title: `${LONG} and the matter of the missing tithe barge, urgently`,
    })),
  };
}

const history = [
  'Year 1, Day 3 · Brenna, Oswin and Tam set out on the tithe barge down to Lowford.',
  'Year 1, Day 9 · Tam came off worst: Turned ankle, and no work until Year 1, Day 23.',
];

describe('the main screen at 80 columns', () => {
  const lines = mainScreen(plain, 80, content, history);

  it('fits 80 columns and cuts nothing', () => {
    expectFits(lines, 80, 'main screen');
  });

  // The 24-row promise is held to a fleet of played Careers at two widths, not to this one
  // fresh state, which is what let 87% of the one-Party screens run over it unnoticed
  // (file: `cli/tests/rows.test.ts`, DL-26 §1).
  it('fits 24 rows, and gives nothing up to do it on a quiet Day', () => {
    const plan = layOut(plain, 80, content, history);
    expect(plan.lines.length).toBeLessThanOrEqual(ROWS);
    expect(plan.yielded).toBe(0);
  });

  it('always shows the Guild, the Day, the Year, the coin and Standing', () => {
    const said = flow(lines);
    expect(said).toContain(plain.guild.name);
    expect(said).toContain(formatDay(plain.day, plain));
    expect(said).toContain('coin');
    expect(said).toContain('Standing');
  });

  it('always shows the Upkeep owed and the Days until it', () => {
    expect(flow(lines)).toMatch(/Upkeep of [\d,]+ coin in \d+ Days?/);
  });

  it('shows both clocks: the Upkeep and the next Board', () => {
    expect(flow(lines)).toMatch(/Board refreshes in \d+ Days?/);
  });

  it('always shows how big the Roster is', () => {
    expect(flow(lines)).toContain(
      `${plain.guild.roster.length} of ${plain.config.rosterCap} places taken`,
    );
  });

  it('numbers the Board and gives each Commission its terms on one line', () => {
    const rows = lines.filter((line) => /^ {2}\d {2}/.test(line));
    expect(rows).toHaveLength(plain.board.length);
    for (const row of rows) expect(row).toMatch(/\d+ coin/);
    expect(flow(lines)).toContain('Beats');
  });

  it('groups a four-figure sum and never abbreviates coin', () => {
    const rich: Career = { ...plain, guild: { ...plain.guild, coin: 1140 } };
    const said = flow(mainScreen(rich, 80, content, history));
    expect(said).toContain('1,140 coin');
    expect(said).not.toContain('1.1k');
    expect(said).not.toMatch(/\b\d+(\.\d+)?k\b/);
  });

  it('offers a key for everything on it, and nothing it cannot act on', () => {
    const hints = flow(hintLines(plain, 80));
    for (const key of ['[r]', '[p]', '[g]', '[i]', '[a]', '[o]', '[f]', '[n]', '[s]', '[q]']) {
      expect(hints).toContain(key);
    }
  });
});

describe('the main screen at every width', () => {
  for (const width of WIDTHS) {
    it(`fits ${width} columns, with the longest names anybody could give`, () => {
      expectFits(mainScreen(plain, width, content, history), width, 'main screen');
      expectFits(
        mainScreen(stretched(plain), width, content, history),
        width,
        'main screen (long names)',
      );
    });

    it(`is the same screen as last time, at ${width}`, () => {
      expect(mainScreen(plain, width, content, history).join('\n')).toMatchSnapshot(
        `main screen at ${width}`,
      );
    });
  }

  it('stacks below 80 columns: no table rows, one thing per line', () => {
    const narrow = mainScreen(plain, 60, content, history);
    // The Board's one-line row is a table; below 80 the terms are on their own line.
    const rows = narrow.filter((line) => /^ {2}\d {2}/.test(line));
    expect(rows).toHaveLength(plain.board.length);
    for (const row of rows) expect(row).not.toMatch(/coin/);
  });

  it('puts the key hints one per line at 40 columns', () => {
    const hints = hintLines(plain, 40);
    expect(hints.length).toBeGreaterThan(6);
    for (const hint of hints) expect(hint.startsWith('[')).toBe(true);
  });

  it('shortens the headings to one word at 40 columns', () => {
    const { career } = partyWaiting('layout-word', content);
    expect(mainScreen(career, 40, content, []).join('\n')).toContain('WORD');
    expect(mainScreen(career, 80, content, []).join('\n')).toContain('WAITING ON YOUR WORD');
  });
});

describe('an awaiting Party', () => {
  const { career } = partyWaiting('layout-await', content);
  const lines = mainScreen(career, 80, content, history);

  it('displaces the Board as the top block', () => {
    const said = lines.join('\n');
    expect(said).toContain('WAITING ON YOUR WORD');
    expect(said).not.toContain('\nBOARD');
    expectFits(lines, 80, 'main screen (awaiting)');
  });

  it('cannot be ignored: the keys say a number answers them', () => {
    expect(flow(hintLines(career, 80))).toContain('[1-9] answer them');
    expect(flow(hintLines(career, 80))).toContain('[n] let the Days run');
  });
});

describe('who is away', () => {
  it('names them and says when they can be back', () => {
    const commission = plain.board[0];
    const [one, two] = plain.guild.roster;
    if (commission === undefined || one === undefined || two === undefined) {
      throw new Error('no world');
    }
    const out = commitParty(plain, commission.id, [one.id, two.id], content).career;
    const said = flow(mainScreen(out, 80, content, []));
    expect(said).toContain('AWAY');
    expect(said).toContain(one.name);
    expect(said).toContain(commission.title);
    expect(said).toMatch(/back Year \d+, Day \d+/);
  });

  it('leaves a waiting Party out of it, because the top block already names them', () => {
    const { career } = partyWaiting('layout-away', content);
    const said = flow(mainScreen(career, 80, content, []));
    // Said once, at the top, with both of its clocks — and not a second time below.
    expect(said).toContain('WAITING ON YOUR WORD');
    expect(said.match(/ON YOUR WORD/g) ?? []).toHaveLength(1);
    const waiting = career.parties.find((party) => party.pendingWord !== undefined);
    expect(waiting).toBeDefined();
    expect(said).not.toContain('AWAY');
  });
});

describe('what is wrong with the Roster', () => {
  it('counts the injured and the people another Guild could take, in words', () => {
    const career = JSON.parse(serialiseCareer(plain)) as Career;
    const hurt = career.guild.roster[0];
    if (hurt === undefined) throw new Error('no Roster');
    hurt.traits = [...hurt.traits, { name: 'Bruised', since: 1, liftsOn: career.day + 12 }];
    for (const rival of career.rivals) rival.regardForGuild = { ...rival.regardForGuild, value: -5 };
    for (const hero of career.guild.roster) {
      hero.regardForGuildmaster = { value: -2, reason: 'the business at Thurrow', nature: 'neutral' };
    }
    const said = flow(mainScreen(career, 80, content, []));
    expect(said).toContain('1 injured');
    expect(said).toMatch(/\d+ another Guild could take/);
    // "Unhappy" is not vocabulary and is not printed.
    expect(said.toLowerCase()).not.toContain('unhappy');
  });
});

describe('the room the screen has', () => {
  it('gives up the oldest history entries rather than running past 24 rows', () => {
    const five = Array.from(
      { length: 5 },
      (_, at) =>
        `Year 1, Day ${at + 1} · ` +
        'A very long entry indeed about what happened, which takes two whole lines of the ' +
        'screen all by itself, every time, without fail.',
    );
    const lines = mainScreen(plain, 80, content, five);
    expect(lines.length).toBeLessThanOrEqual(ROWS);
    // Whatever it dropped, it dropped from the oldest end.
    const shown = flow(lines);
    if (shown.includes('Year 1, Day 1')) expect(shown).toContain('Year 1, Day 5');
  });

  it('keeps the Upkeep, the coin, the Day and the Roster whatever it gives up', () => {
    const five = Array.from({ length: 5 }, () => `Year 1, Day 1 · ${'word '.repeat(60)}`);
    const said = flow(mainScreen(plain, 80, content, five));
    expect(said).toContain('Upkeep of');
    expect(said).toContain('coin');
    expect(said).toContain(formatDay(plain.day, plain));
    expect(said).toContain('places taken');
  });
});

// ── The priority order, and the awaiting-Party rule (DL-26 §1, §2) ──────────

/** A Career on a Day when `howMany` Parties are all standing on a word at once. */
function partiesWaiting(seed: string, howMany: number): Career {
  const started = newCareer(seed, content, { startingCoin: 9000, decisionChancePerBeat: 1 });
  // The same guard `partyWaiting` uses: a Commission no Decision's tags admit never stops.
  const couldStop = (tags: readonly string[]): boolean =>
    content.decisions.some((decision) => {
      const wanted = decision.conditions.tags;
      return wanted === undefined || wanted.some((tag) => tags.includes(tag));
    });
  let career = started.career;
  let at = 0;
  for (const commission of career.board) {
    if (!couldStop(commission.tags)) continue;
    const hero = started.career.guild.roster[at];
    if (hero === undefined) break;
    at += 1;
    try {
      career = commitParty(career, commission.id, [hero.id], content).career;
    } catch {
      /* the Hero refused or is gone; the next Commission is tried */
    }
  }
  for (let day = 0; day < 90; day += 1) {
    if (awaitingParties(career).length >= howMany) return career;
    career = advance(career, 1, content).career;
  }
  throw new Error(`no ${howMany} Parties waiting on seed "${seed}"`);
}

/** The same Career with people at the door, so the Applicants cue is on the screen. */
function withApplicants(career: Career): Career {
  const background = content.backgrounds[0];
  if (background === undefined) throw new Error('the content should ship Backgrounds');
  return {
    ...career,
    applicants: ['Nerys of Wend Water', 'Corran the Quiet'].map((name, index) => ({
      id: `a${index + 1}`,
      name,
      pronouns: 'they' as const,
      stats: { Might: 3, Craft: 3, Nerve: 2, Guile: 2 },
      background: background.name,
      traits: background.traits.map((trait) => ({ name: trait, since: career.day })),
      age: 27,
      calibre: 1 as const,
      askingFee: 80,
      arrivedOn: career.day,
      expiresOn: career.day + 12,
    })),
  };
}

const fiveEntries = Array.from(
  { length: 5 },
  (_, at) =>
    `Year 1, Day ${at + 1} · ` +
    'A very long entry indeed about what happened, which takes two whole lines of the ' +
    'screen all by itself, every time, without fail.',
);

describe('the priority order the screen gives blocks up in', () => {
  // Exactly one Party waiting, so the word block starts whole and has a rung to give up.
  const busy = withApplicants(partyWaiting('layout-order', content).career);

  /** A Career with Heroes out on two Commissions and people at the door, nobody waiting. */
  const out = withApplicants(
    (() => {
      let career = plain;
      for (const [index, commission] of plain.board.slice(0, 2).entries()) {
        const hero = plain.guild.roster[index];
        if (hero === undefined) break;
        career = commitParty(career, commission.id, [hero.id], content).career;
      }
      return career;
    })(),
  );

  it('yields in the stated order and never out of it', () => {
    // Walked from a budget nothing has to give up for down to one that gives up
    // everything it may: at every rung the yields are a **prefix** of the order, which is
    // the whole of what "a stated priority order" means. Two states, because one screen
    // does not carry every block at once.
    for (let rows = 40; rows >= 8; rows -= 1) {
      const waiting = layOut(busy, 80, content, fiveEntries, rows);
      const waitingText = waiting.lines.join('\n');
      if (waitingText.includes('Press a.')) {
        expect(waitingText.includes('RECENTLY'), `word, rows ${rows}`).toBe(false);
      }
      if (waiting.word === 'summary') {
        expect(waitingText.includes('Press a.'), `word, rows ${rows}`).toBe(true);
      }

      const away = layOut(out, 80, content, fiveEntries, rows).lines.join('\n');
      if (away.includes('Press a.')) {
        expect(away.includes('RECENTLY'), `away, rows ${rows}`).toBe(false);
      }
      if (away.includes('Press r to see where.')) {
        expect(away.includes('Press a.'), `away, rows ${rows}`).toBe(true);
      }
    }
  });

  it('keeps the header, the Upkeep, the Roster and the keys at every rung', () => {
    for (let rows = 40; rows >= 8; rows -= 1) {
      const said = flow(layOut(busy, 80, content, fiveEntries, rows).lines);
      expect(said, `rows ${rows}`).toContain(busy.guild.name);
      expect(said, `rows ${rows}`).toContain(formatDay(busy.day, busy));
      expect(said, `rows ${rows}`).toMatch(/Upkeep of [\d,]+ coin in \d+ Days?/);
      expect(said, `rows ${rows}`).toContain('places taken');
      expect(said, `rows ${rows}`).toContain('[q] quit');
    }
  });

  it('never gives up the Board, whatever the budget', () => {
    // The Board is bounded by config.boardSizeMax and the numbers on it are the actions:
    // a screen that hides it is not a screen a player can act from (DL-26 §1).
    for (let rows = 40; rows >= 8; rows -= 1) {
      const lines = layOut(plain, 80, content, fiveEntries, rows).lines;
      expect(lines, `rows ${rows}`).toContain('BOARD');
      expect(lines.filter((line) => /^ {2}\d {2}/.test(line)), `rows ${rows}`).toHaveLength(
        plain.board.length,
      );
    }
  });

  it('points at the key that shows a block it has shortened', () => {
    const tight = layOut(busy, 80, content, fiveEntries, 10).lines.join('\n');
    expect(tight).toContain('Press a.');
    expect(tight).not.toContain('...');
    expect(tight).not.toContain('…');
  });
});

describe('an awaiting Party the screen cannot hold whole', () => {
  const two = partiesWaiting('layout-two', 2);
  const one = partyWaiting('layout-await', content).career;

  it('is the summary at every width when two or more are waiting', () => {
    expect(awaitingParties(two).length).toBeGreaterThanOrEqual(2);
    for (const width of WIDTHS) {
      const said = layOut(two, width, content, []);
      expect(said.word, `at ${width}`).toBe('summary');
      expectFits(said.lines, width, 'main screen (two waiting)');
    }
  });

  it('names who is waiting, on what, how long, and how long is left, soonest first', () => {
    const said = flow(layOut(two, 80, content, []).lines);
    const offers = wordOffers(two, content);
    for (const offer of offers) {
      const party = two.parties.find((entry) => entry.id === offer.partyId);
      const first = party === undefined ? undefined : party.heroIds[0];
      const hero = two.guild.roster.find((entry) => entry.id === first);
      if (hero !== undefined) expect(said).toContain(hero.name);
      expect(said).toContain(commissionById(two, offer.commissionId)?.title ?? '');
    }
    expect(said).toMatch(/waited \d+ Days?, and acts on their own judgement in \d+ Days?/);
    // Soonest first: the Days left never go down the block.
    const left = [...flow(layOut(two, 80, content, []).lines).matchAll(
      /own judgement in (\d+) Days?/g,
    )].map((found) => Number(found[1]));
    expect(left.length).toBeGreaterThanOrEqual(2);
    expect([...left].sort((a, b) => a - b)).toEqual(left);
  });

  it('sends the player to the key that shows the whole of it', () => {
    expect(flow(layOut(two, 80, content, []).lines)).toContain(
      'Press w to read what each of them asks, and answer.',
    );
  });

  it('still displaces the Board and still cannot be ignored', () => {
    const lines = layOut(two, 80, content, []).lines;
    expect(lines.join('\n')).toContain('WAITING ON YOUR WORD');
    expect(lines.join('\n')).not.toContain('\nBOARD');
    expect(lines[3] ?? '').toContain('WAITING ON YOUR WORD');
  });

  it('shows one Party whole where the rows are there for it', () => {
    // The state the fleet reaches 116 times: one Party, a prompt short enough to fit.
    const said = layOut(one, 80, content, []);
    expect(said.word).toBe('full');
    expect(said.lines.length).toBeLessThanOrEqual(ROWS);
  });

  it('says in the keys exactly what is true in each case', () => {
    expect(flow(hintLines(one, 80, 'full'))).toContain('[1-9] answer them');
    expect(flow(hintLines(one, 80, 'full'))).toContain('[w] their word in full');
    const summary = flow(hintLines(two, 80, 'summary'));
    expect(summary).toContain('[w] read and answer them');
    expect(summary).not.toContain('[1-9] answer them');
    expect(summary).toContain('[n] let the Days run');
    expect(flow(hintLines(plain, 80, 'none'))).toContain('[1-6] commission');
    expect(flow(hintLines(plain, 80, 'none'))).not.toContain('[w]');
  });
});

describe('narration after a step', () => {
  it('heads each Day once and wraps the prose', () => {
    const lines = narrationLines(
      [
        { kind: 'beat', day: 3, text: 'A '.repeat(90).trim() },
        { kind: 'note', day: 3, text: 'Something else happened.' },
        { kind: 'beat', day: 4, text: 'Later.' },
      ],
      plain,
      80,
    );
    expect(lines.filter((line) => line === 'Year 1, Day 3')).toHaveLength(1);
    expect(lines.filter((line) => line === 'Year 1, Day 4')).toHaveLength(1);
    expectFits(lines, 80, 'narration');
  });

  it('collapses a run of Upkeeps with nothing between them into one line', () => {
    const lines = narrationLines(
      [
        { kind: 'coin', day: 10, text: 'Upkeep of 88 coin falls due. 412 coin remains.' },
        { kind: 'coin', day: 20, text: 'Upkeep of 88 coin falls due. 324 coin remains.' },
        { kind: 'coin', day: 30, text: 'Upkeep of 88 coin falls due. 236 coin remains.' },
      ],
      plain,
      80,
    );
    const body = lines.filter((line) => line.includes('Upkeep'));
    expect(body).toHaveLength(1);
    expect(body[0]).toContain('(x3)');
    expect(lines).toContain('Year 1, Day 30');
    expect(lines).not.toContain('Year 1, Day 10');
  });

  it('does not collapse Upkeeps that had something between them', () => {
    const lines = narrationLines(
      [
        { kind: 'coin', day: 10, text: 'Upkeep of 88 coin falls due.' },
        { kind: 'beat', day: 15, text: 'Something happened.' },
        { kind: 'coin', day: 20, text: 'Upkeep of 88 coin falls due.' },
      ],
      plain,
      80,
    );
    expect(lines.filter((line) => line.includes('Upkeep'))).toHaveLength(2);
  });

  it('keeps the Board and the Upkeep terse and gives prose room to breathe', () => {
    // A quiet stretch is a run of one-line facts with nothing between them, and prose is
    // what gets the blank line after it: the Board and the Upkeep sit shoulder to
    // shoulder, and the block never ends on an empty row.
    const lines = narrationLines(
      [
        { kind: 'coin', day: 10, text: 'Upkeep of 50 coin falls due. 450 coin remains.' },
        { kind: 'board', day: 10, text: 'New on the Board: one thing.' },
        { kind: 'return', day: 10, text: 'Work, for a Patron: the work was finished.' },
      ],
      plain,
      80,
    );
    const upkeepAt = lines.findIndex((line) => line.includes('Upkeep'));
    const boardAt = lines.findIndex((line) => line.includes('New on the Board'));
    expect(boardAt).toBe(upkeepAt + 1);
    expect(lines[lines.length - 1]).not.toBe('');
  });

  it('says nothing about nothing', () => {
    expect(narrationLines([], plain, 80)).toEqual([]);
  });
});

/**
 * The budget itself. Every other row assertion in this repository reads `ROWS`, so moving
 * the constant moved them all with it and a mutation that set it to forty passed the whole
 * suite. E7-S1's promise is a number — "80 columns, 24 rows" — so the number is asserted
 * here once, against the literal.
 */
describe('the twenty-four rows E7-S1 promises', () => {
  it('is twenty-four, and not whatever the constant happens to say', () => {
    expect(ROWS).toBe(24);
  });

  /**
   * Two Parties waiting cannot be shown whole on one screen at any width, so the summary is
   * where they start — at **every** width, because a 40-column player handed a seventy-row
   * screen is no better served than an 80-column one (DL-26 §2). Below 80 the ladder is not
   * walked at all, so nothing else would bring the summary about there.
   */
  it('summarises two waiting Parties at 40 and 60 columns too, where the ladder never runs', () => {
    const several = severalWaiting('layout-two-words', content);
    for (const width of [40, 60, 80, 120]) {
      const plan = layOut(several, width, content, []);
      expect(plan.word, `at ${width}`).toBe('summary');
      expect(plan.lines.join('\n'), `at ${width}`).toContain('Press w to read what each');
    }
  });

  it('shows one waiting Party whole at 40 columns, where there is no budget to keep', () => {
    const { career } = partyWaiting('layout-one-word', content);
    const plan = layOut(career, 40, content, []);
    expect(plan.word).toBe('full');
  });
});
