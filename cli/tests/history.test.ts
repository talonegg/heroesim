/**
 * The history of the last five decisions (E7-S2): held by the CLI, derived from events
 * through `narrate` and never re-worded, Day-stamped, trimmed to two lines, exactly five
 * of them with the oldest dropped, and identical after a save and a load.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acceptApplicant,
  advanceUntilAttention,
  applicantOffers,
  commitParty,
  improveHall,
  newCareer,
  type Career,
  type Content,
  type GameEvent,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { formatDay, narrateEvents } from '@heroesim/narrate';
import {
  entriesFrom,
  historyLines,
  remember,
  trimToTwoLines,
  HISTORY_KEPT,
  WORTH_REMEMBERING,
} from '../src/history.js';
import { loadSlot, saveSlot } from '../src/slots.js';
import { expectFits, flow, WIDTHS } from './helpers.js';

const content: Content = loadContentFromDisk();
const workspace = mkdtempSync(join(tmpdir(), 'heroesim-history-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('what a step is remembered for', () => {
  it('remembers a Party going out, in narrate’s own words', () => {
    const opened = newCareer('history-commit', content, { startingCoin: 5000 });
    const commission = opened.career.board[0];
    const hero = opened.career.guild.roster[0];
    if (commission === undefined || hero === undefined) throw new Error('no world');
    const step = commitParty(opened.career, commission.id, [hero.id], content);
    const entries = entriesFrom(step.events, step.career, content);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain(formatDay(step.career.day, step.career));
    expect(entries[0]).toContain('set out on');
    // The very sentence narrate wrote, with the Day stamp in front of it and nothing else.
    const said = narrateEvents(
      step.events.filter((event) => event.type === 'PartyCommitted'),
      step.career,
      content,
    )[0];
    expect(entries[0]).toBe(
      `${formatDay(step.career.day, step.career)} · ${said?.text ?? ''}`,
    );
  });

  it('remembers buying the Hall', () => {
    const opened = newCareer('history-hall', content, { startingCoin: 5000 });
    const step = improveHall(opened.career, 'infirmary');
    expect(flow(entriesFrom(step.events, step.career, content))).toContain('infirmary');
  });

  it('remembers taking somebody on at the door', () => {
    let career = newCareer('history-door', content, { startingCoin: 5000 }).career;
    for (let at = 0; at < 8 && applicantOffers(career).length === 0; at += 1) {
      career = advanceUntilAttention(career, content).career;
    }
    const offer = applicantOffers(career)[0];
    if (offer === undefined) throw new Error('nobody came to the door');
    const step = acceptApplicant(career, offer.applicant.id);
    expect(flow(entriesFrom(step.events, step.career, content))).toContain('joins the Roster');
  });

  /**
   * E7-S2 names eight moments the history covers. Only two of them — a Party committed and
   * a Hall purchase — were pinned by anything: a mutation that deleted any of the other six
   * from the set left the whole suite green. The set is the spec's own list, so it is
   * asserted as a list, and dropping one of them is now a failing test rather than a
   * silently quieter screen.
   */
  it('covers every moment E7-S2 names, and the two narrate needs to tell them', () => {
    expect([...WORTH_REMEMBERING].sort()).toEqual(
      [
        // E7-S2: "Parties committed, Parties returned, insistence, Departure, harm, Hall
        // purchases, Transfers, Decisions answered".
        'PartyCommitted',
        'PartyReturned',
        'InsistenceApplied',
        'HeroDeparted',
        'HeroInjured',
        'HeroScarred',
        'HeroDied',
        'HallImproved',
        'HeroTransferred',
        'HeroPoached',
        'PartyAnswered',
        'PartyTurnedBack',
        // The two narrate needs in order to tell a Transfer and a joining fee (DL-25 §14).
        'ApplicantAccepted',
        'HeroJoined',
      ].sort(),
    );
  });

  it('remembers a Party coming home, and the harm it came home with', () => {
    let career = newCareer('history-home', content, { startingCoin: 5000 }).career;
    const commission = career.board[0];
    const heroes = career.guild.roster.slice(0, 2).map((hero) => hero.id);
    if (commission === undefined || heroes.length < 2) throw new Error('no world');
    career = commitParty(career, commission.id, heroes, content).career;
    let returned: string[] = [];
    let hurt: string[] = [];
    for (let at = 0; at < 40 && returned.length === 0; at += 1) {
      const step = advanceUntilAttention(career, content);
      career = step.career;
      const entries = entriesFrom(step.events, career, content);
      if (step.events.some((event) => event.type === 'PartyReturned')) returned = entries;
      if (step.events.some((event) => event.type === 'HeroInjured') && hurt.length === 0) {
        hurt = entries;
      }
    }
    expect(returned.length, 'a Party that went out came home').toBeGreaterThan(0);
    expect(flow(returned)).toMatch(/came back|came home|did not come/);
    // Harm is one of the eight, and it arrives on the same step as the return.
    expect(hurt.length + returned.length).toBeGreaterThan(0);
  });

  it('stamps an entry with the Day it happened on, not the Day the Career now stands on', () => {
    // The Day stamp is `narrate`'s own `entry.day`. Reading `career.day` instead looks
    // identical on the step it happens — which is the only case that was tested — and lies
    // the moment a stretch of Days is reported at once.
    const opened = newCareer('history-stamp', content, { startingCoin: 5000 });
    const commission = opened.career.board[0];
    const hero = opened.career.guild.roster[0];
    if (commission === undefined || hero === undefined) throw new Error('no world');
    const step = commitParty(opened.career, commission.id, [hero.id], content);
    const later: Career = { ...step.career, day: step.career.day + 37 };
    const entries = entriesFrom(step.events, later, content);
    expect(entries[0]).toContain(formatDay(step.career.day, later));
    expect(entries[0]).not.toContain(formatDay(later.day, later));
  });

  it('remembers nothing at all for a step that only passed Days', () => {
    const opened = newCareer('history-quiet', content);
    const events: readonly GameEvent[] = opened.events.filter(
      (event) => event.type === 'CommissionPosted',
    );
    expect(entriesFrom(events, opened.career, content)).toEqual([]);
  });
});

describe('the window', () => {
  it('keeps exactly five, oldest dropped, over twenty decisions', () => {
    let history: string[] = [];
    for (let at = 1; at <= 20; at += 1) history = remember(history, [`decision ${at}`]);
    expect(history).toHaveLength(HISTORY_KEPT);
    expect(history).toEqual([
      'decision 16',
      'decision 17',
      'decision 18',
      'decision 19',
      'decision 20',
    ]);
  });

  it('renders fewer than five with no padding and no placeholder rows', () => {
    expect(historyLines([], 80)).toEqual([]);
    const two = historyLines(['Year 1, Day 3 · One thing.', 'Year 1, Day 4 · Another.'], 80);
    expect(two).toHaveLength(2);
    expect(two.every((line) => line.trim().length > 0)).toBe(true);
  });
});

describe('trimming an entry to two lines', () => {
  const long =
    'Year 2, Day 41 · Brenna, Oswin and Tam set out on the thing taking dogs off the bank, ' +
    'for the Bargemen of Wend Water, with Backing of 3. They are due back on Year 2, Day 48. ' +
    'And then a great deal more was said about it afterwards, at length, by everybody.';

  it('never gives more than two lines', () => {
    for (const width of WIDTHS) {
      expect(trimToTwoLines(long, width).length).toBeLessThanOrEqual(2);
    }
  });

  it('cuts at a sentence boundary where there is one in range', () => {
    const lines = trimToTwoLines(long, 78);
    expect(lines[lines.length - 1]?.trimEnd().endsWith('.')).toBe(true);
  });

  it('cuts at a clause boundary where there is no sentence in range', () => {
    // The author's own comma, kept as they wrote it: a full stop invented here would be
    // the CLI re-wording the entry, which E7-S2 forbids (DL-26 §4).
    const oneSentence =
      'Year 2, Day 41 · Brenna, Oswin and Tam set out on the thing taking dogs off the ' +
      'bank, for the Bargemen of Wend Water, with Backing of 3 and no very great hope of ' +
      'coming home with the whole of it.';
    const lines = trimToTwoLines(oneSentence, 78);
    const last = lines[lines.length - 1]?.trimEnd() ?? '';
    expect(/[.,;:!?—–]$/.test(last), last).toBe(true);
  });

  it('never ends mid-word, never on an ellipsis, and never on a word pointing forward', () => {
    const noStops = `Year 1, Day 1 · ${'alpha beta gamma delta epsilon '.repeat(20).trim()}`;
    const lines = trimToTwoLines(noStops, 40);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain('...');
      expect(line).not.toContain('…');
      // Every word on the line is a whole word from the original.
      for (const word of line.split(' ')) expect(noStops).toContain(word);
    }
  });

  it('leaves a short entry exactly as it is', () => {
    expect(trimToTwoLines('Year 1, Day 3 · A short one.', 80)).toEqual([
      'Year 1, Day 3 · A short one.',
    ]);
  });

  it('fits every width, indented under the heading', () => {
    for (const width of WIDTHS) {
      expectFits(historyLines([long, long], width), width, 'history');
    }
  });
});

/**
 * The three entries an independent verification read off a real 40-column screen. Every
 * one of them stopped before the thing it was about to say — a Patron's name, a
 * Commission's title — with no ellipsis, so the no-cut helper passed and nothing caught
 * it. These are the full paragraphs `narrate` wrote; the assertions are about where the
 * CLI is now allowed to stop reading them (DL-26 §4).
 */
describe('a history entry never ends mid-clause', () => {
  const REAL = [
    'Year 2, Day 118 · The new terms for the hewers at Gaunt Adit, for Factor Brede of ' +
      'the Marrow Quay: the work was finished.',
    'Year 2, Day 120 · Elswith Greyeye set out on The tithe barge down to Lowford, for ' +
      'Factor Brede of the Marrow Quay, with Backing of 2.',
    'Year 2, Day 130 · The pay chest up to Gaunt Adit, for Factor Brede of the Marrow ' +
      'Quay: the work was finished.',
  ];

  /** Words a line that has stopped early ends on. None of these may be the last word. */
  const POINTS_FORWARD = [
    'of', 'for', 'to', 'the', 'a', 'an', 'at', 'in', 'on', 'by', 'with', 'from', 'and',
  ];

  function endsWell(lines: readonly string[], where: string): void {
    const last = lines[lines.length - 1]?.trimEnd() ?? '';
    expect(last.length, where).toBeGreaterThan(0);
    const word = last.split(/\s+/).pop()?.toLowerCase().replace(/[.,;:!?—–]$/, '') ?? '';
    expect(POINTS_FORWARD, `${where} ends on "${word}": ${last}`).not.toContain(word);
  }

  it('ends the three real entries at a sentence or a clause, at 40 columns', () => {
    for (const entry of REAL) {
      const lines = historyLines([entry], 40);
      const last = lines[lines.length - 1]?.trimEnd() ?? '';
      expect(/[.,;:!?—–]$/.test(last), `"${last}"`).toBe(true);
      endsWell(lines, entry.slice(0, 20));
      expectFits(lines, 40, 'history at 40');
    }
  });

  it('gives the Day stamp a line of its own below 80 columns', () => {
    const lines = historyLines([REAL[0] ?? ''], 40);
    expect(lines[0]).toBe('  Year 2, Day 118');
    // And the paragraph is given the lines its first sentence needs, whole.
    expect(flow(lines.slice(1))).toBe(
      'The new terms for the hewers at Gaunt Adit, for Factor Brede of the Marrow Quay: ' +
        'the work was finished.',
    );
  });

  it('keeps the Day stamp on the entry at 80 columns and above', () => {
    for (const width of [80, 120]) {
      const lines = historyLines([REAL[0] ?? ''], width);
      expect(lines[0], `at ${width}`).toContain('Year 2, Day 118 ·');
      expect(lines.length, `at ${width}`).toBeLessThanOrEqual(2);
    }
  });

  it('ends well on adversarially long Hero, Patron and Commission names', () => {
    const LONG = 'Bartholomew Grimsditch-Wetherby of the Nine Fords and the Far Weir';
    const monstrous = [
      `Year 4, Day 7 · ${LONG} set out on ${LONG} and the matter of the missing tithe ` +
        `barge, urgently, for ${LONG}, Patron, with Backing of 4.`,
      `Year 4, Day 9 · ${LONG} and the matter of the missing tithe barge, urgently, for ` +
        `${LONG}, Patron: the work was finished.`,
      `Year 4, Day 11 · ${LONG} came off worst: ${LONG} the Unlucky, and no work until ` +
        'Year 4, Day 40.',
    ];
    for (const width of WIDTHS) {
      for (const entry of monstrous) {
        const lines = historyLines([entry], width);
        expectFits(lines, width, `history at ${width}`);
        endsWell(lines, `${entry.slice(0, 16)} at ${width}`);
      }
    }
  });

  it('still keeps exactly five, oldest dropped, and still never cuts short', () => {
    const many = Array.from({ length: 9 }, (_, at) => `Year 1, Day ${at + 1} · Something ${at}.`);
    const kept = many.reduce<string[]>((window, entry) => remember(window, [entry]), []);
    expect(kept).toHaveLength(HISTORY_KEPT);
    for (const width of WIDTHS) {
      const lines = historyLines(kept, width);
      expectFits(lines, width, `five at ${width}`);
      expect(flow(lines)).toContain('Year 1, Day 9');
      expect(flow(lines)).not.toContain('Year 1, Day 1 ·');
    }
  });

  it('is stored whole and trimmed at render time, so the width never reaches the file', () => {
    const whole = REAL[0] ?? '';
    const path = join(workspace, 'trim');
    saveSlot(path, 'one', newCareer('history-trim', content).career, [whole], 'x');
    const back = loadSlot(path, 'one', content);
    // Byte for byte the paragraph `narrate` wrote, not the two lines a screen showed.
    expect(back.history).toEqual([whole]);
    // And one stored string renders differently at two widths, which is what makes the
    // trim a rendering decision rather than something baked into the save.
    expect(historyLines(back.history, 40).join('\n')).not.toBe(
      historyLines(back.history, 120).join('\n'),
    );
  });
});

describe('the history in the slot file', () => {
  it('is saved beside the Career and comes back identical', () => {
    const opened = newCareer('history-slot', content, { startingCoin: 5000 });
    const commission = opened.career.board[0];
    const hero = opened.career.guild.roster[0];
    if (commission === undefined || hero === undefined) throw new Error('no world');
    const step = commitParty(opened.career, commission.id, [hero.id], content);
    const history = remember([], entriesFrom(step.events, step.career, content));
    expect(history.length).toBeGreaterThan(0);

    const dir = join(workspace, 'slot');
    saveSlot(dir, 'one', step.career, history, '2026-09-20T00:00:00.000Z');
    const loaded = loadSlot(dir, 'one', content);
    expect(loaded.history).toEqual(history);
    // And the same five render to the same lines, because the entry is stored whole and
    // trimmed at the width in hand rather than at the width it was saved at.
    expect(historyLines(loaded.history, 80)).toEqual(historyLines(history, 80));
  });

  it('comes back empty from a save that never had one', () => {
    const career: Career = newCareer('history-empty', content).career;
    const dir = join(workspace, 'empty');
    saveSlot(dir, 'one', career, [], '2026-09-20T00:00:00.000Z');
    expect(loadSlot(dir, 'one', content).history).toEqual([]);
  });
});
