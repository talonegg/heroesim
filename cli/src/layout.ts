/**
 * The main screen (E7-S1): one screen, 80 columns, 24 rows, that a player can act from
 * without reaching for the scrollback.
 *
 * What is always on it: the Guild, the Day, the Year and the coin; the Board with the
 * Upkeep owed and the Days until it falls due; who is away and when they are back; the
 * size of the Roster and what is wrong with it; what happened lately; and the keys.
 * **An awaiting Party displaces the Board**, because it is the one thing that cannot be
 * left for later (E6-S4, DL-24).
 *
 * Nothing is on it that the player cannot act on from here, and nothing on it is ever cut
 * short: where the room runs out the oldest entries of the history go, and then the cue
 * for a view that is one keypress away anyway.
 */

import {
  awaitingParties,
  daysUntilBoardRefresh,
  daysUntilUpkeep,
  injuredHeroes,
  retaliationRisks,
  standing,
  upkeepDue,
  wordOffers,
  type Career,
  type Commission,
  type Content,
} from '@heroesim/engine';
import { difficultyWord, formatDay, joinNames, type Paragraph } from '@heroesim/narrate';
import { historyLines } from './history.js';
import {
  coin,
  days,
  hanging,
  heading,
  keyHints,
  pad,
  padLeft,
  rule,
  wrapAt,
  FLOOR,
  WIDE,
} from './screen.js';
import { applicantCueLines } from './views/applicants.js';
import { partyNames, projectedReturnWords } from './views/shared.js';
import { wordLines, wordSummaryLines } from './word.js';

/** The rows a terminal is assumed to have, and the budget the screen is laid out inside. */
export const ROWS = 24;

/**
 * Which form the waiting-Party block is in: absent, the prompt and the options whole, or
 * the loud summary that points at the key showing them whole (DL-26 §2).
 */
export type WordForm = 'none' | 'full' | 'summary';

/**
 * The paragraphs as the player reads them after a step: a heading when the Day changes,
 * prose indented and wrapped, and the Board and Upkeep lines kept terse so that a long
 * quiet stretch does not fill the screen. A run of Upkeeps with nothing between them
 * collapses to one line marked with how many it stands for.
 *
 * Not one word of it is this front end's: `narrate` writes the sentences and this decides
 * only where they sit.
 */
export function narrationLines(
  paragraphs: readonly Paragraph[],
  career: Career,
  width: number,
): string[] {
  const out: string[] = [];
  let lastDay: number | undefined;

  let index = 0;
  while (index < paragraphs.length) {
    const first = paragraphs[index];
    if (first === undefined) break;

    let run = 1;
    if (first.kind === 'coin') {
      while (paragraphs[index + run]?.kind === 'coin') run += 1;
    }
    const entry = paragraphs[index + run - 1] ?? first;
    const terse = entry.kind === 'coin' || entry.kind === 'board';

    if (entry.day !== lastDay) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(formatDay(entry.day, career));
      lastDay = entry.day;
    }

    const text = run > 1 ? `(x${run}) ${entry.text}` : entry.text;
    for (const line of wrapAt(text, width, 2)) out.push(line);
    if (!terse) out.push('');

    index += run;
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/** The terms of one Commission, right-aligned in their columns at 80 and stacked below it. */
function boardRow(commission: Commission, career: Career, index: number, width: number): string[] {
  const number = `${index + 1}`;
  const fee = coin(commission.fee);
  const band = difficultyWord(commission.difficulty, career.config);
  const span = days(commission.spanDays);
  const beats = `${commission.beatCount} Beats`;
  const terms = `${padLeft(fee, 8)}  ${pad(band, 4)}  ${padLeft(span, 7)}  ${beats}`;
  if (width >= WIDE) {
    const room = width - 5 - 1 - terms.length;
    if (commission.title.length <= room) {
      return [`  ${number}  ${pad(commission.title, room)} ${terms}`];
    }
    // A title too long for its column takes lines of its own rather than being cut.
    return [...hanging(`${number}  `, commission.title, width), ...wrapAt(terms, width, 5)];
  }
  return [
    ...hanging(`${number}  `, commission.title, width),
    ...wrapAt(`${fee}, ${band}, ${span}, ${beats}`, width, 5),
  ];
}

/** The Board, numbered from one. */
function boardBlock(career: Career, width: number): string[] {
  const lines = [heading('Board', 'Board', width)];
  if (career.board.length === 0) {
    lines.push(
      ...wrapAt('Nothing is on offer. Let the Days run and see what is posted.', width, 2),
    );
    return lines;
  }
  career.board.forEach((commission, index) => {
    lines.push(...boardRow(commission, career, index, width));
  });
  return lines;
}

/** Who is out, on how many Commissions, ignoring any Party the top block already names. */
function whoIsOut(career: Career, waiting: boolean): { heroes: number; parties: number } {
  const out = career.parties.filter((party) => !waiting || party.pendingWord === undefined);
  return { heroes: new Set(out.flatMap((party) => party.heroIds)).size, parties: out.length };
}

/**
 * Who is away, on what, and when they can be back. A Party that has sent word is left out
 * of it: it is the block at the top of the screen, named there with both of its clocks,
 * and saying it twice would cost rows the screen has not got.
 */
function awayBlock(career: Career, width: number, waiting: boolean): string[] {
  const out = career.parties.filter((party) => !waiting || party.pendingWord === undefined);
  if (out.length === 0) return [];
  const lines = [heading('Away', 'Away', width)];
  for (const party of out) {
    lines.push(
      ...wrapAt(`${joinNames(partyNames(career, party))}, on ${party.commission.title}`, width, 2),
    );
    lines.push(...wrapAt(projectedReturnWords(career, party), width, 5));
  }
  return lines;
}

/**
 * The Away block as a count and a key, for a screen that has not the rows for it whole
 * (DL-26 §1). Nothing is cut: the block gives way to a pointer at the view that says where
 * every one of them is, in full.
 */
function awayCountLine(career: Career, width: number, waiting: boolean): string[] {
  const { heroes, parties } = whoIsOut(career, waiting);
  if (parties === 0) return [];
  return wrapAt(
    `${heading('Away', 'Away', width)}  ${heroes} away on ${parties} ` +
      `${parties === 1 ? 'Commission' : 'Commissions'}. Press r to see where.`,
    width,
    0,
  );
}

/**
 * How the Roster stands, in the words the selectors give. "Unhappy" is not vocabulary and
 * is not a thing the engine knows: what it knows is who is injured, who is out, and who
 * another Guild could take — which is the honest form of the same warning (E7-S1).
 */
function rosterBlock(career: Career, width: number): string[] {
  const injured = injuredHeroes(career).length;
  const away = new Set(career.parties.flatMap((party) => party.heroIds)).size;
  const takeable = retaliationRisks(career).length;
  const parts = [`${career.guild.roster.length} of ${career.config.rosterCap} places taken`];
  if (injured > 0) parts.push(`${injured} injured`);
  if (away > 0) parts.push(`${away} away`);
  if (takeable > 0) {
    parts.push(`${takeable} another Guild could take`);
  }
  const head = heading('Roster', 'Roster', width);
  if (width >= WIDE) {
    const line = `${head}  ${parts.join(' · ')}`;
    if (line.length <= width) return [line];
  }
  return [head, ...parts.flatMap((part) => wrapAt(part, width, 2))];
}

/** The Guild, the Day, the money, and the two clocks. Always visible, whatever else is. */
function headerBlock(career: Career, width: number): string[] {
  const facts = `${formatDay(career.day, career)} · ${coin(career.guild.coin)} · Standing ${standing(career)}`;
  const clocks =
    `Upkeep of ${coin(upkeepDue(career))} in ${days(daysUntilUpkeep(career))} · ` +
    `Board refreshes in ${days(daysUntilBoardRefresh(career))}`;
  if (width >= WIDE && career.guild.name.length + 2 + facts.length <= width) {
    return [`${pad(career.guild.name, width - facts.length)}${facts}`, ...wrapAt(clocks, width, 0)];
  }
  if (width > FLOOR) {
    return [...wrapAt(career.guild.name, width, 0), ...wrapAt(facts, width, 0), ...wrapAt(clocks, width, 0)];
  }
  // At the floor, one label and one value per line and nothing else (E7-S5).
  return [
    ...wrapAt(career.guild.name, width, 0),
    ...wrapAt(formatDay(career.day, career), width, 0),
    ...wrapAt(coin(career.guild.coin), width, 0),
    ...wrapAt(`Standing ${standing(career)}`, width, 0),
    ...wrapAt(`Upkeep ${coin(upkeepDue(career))} in ${days(daysUntilUpkeep(career))}`, width, 0),
    ...wrapAt(`Board refreshes in ${days(daysUntilBoardRefresh(career))}`, width, 0),
  ];
}

/**
 * The keys, packed to the width and one per line at the floor — and saying exactly what is
 * true of the screen they sit under (DL-26 §2). A number answers a waiting Party only
 * where the options are numbered in front of the player, which is the full form; under the
 * summary the only way to answer is `w`, and the hint says so rather than offering a
 * number that would be refused.
 */
export function hintLines(
  career: Career,
  width: number,
  word: WordForm = awaitingParties(career).length > 0 ? 'full' : 'none',
): string[] {
  const answering =
    word === 'full'
      ? ['[1-9] answer them', '[w] their word in full']
      : word === 'summary'
        ? ['[w] read and answer them']
        : ['[1-6] commission'];
  return keyHints(
    [
      ...answering,
      '[r] roster',
      '[p] patrons',
      '[g] league',
      '[i] hall',
      '[a] applicants',
      '[o] other guilds',
      '[f] former',
      word === 'none' ? '[n] advance' : '[n] let the Days run',
      '[s] save',
      '[l] slots',
      '[h] help',
      '[q] quit',
    ],
    width,
  );
}

/** How much of each block a rung of the priority order keeps (DL-26 §1). */
interface Give {
  /** How many of the newest history entries survive. */
  history: number;
  cue: 'whole' | 'short' | 'none';
  away: 'whole' | 'short' | 'none';
  word: 'whole' | 'summary';
}

/**
 * The main screen, and what the loop needs to know about how it came out: which form the
 * waiting-Party block took, because that decides whether a number answers (DL-26 §2), and
 * how far down the priority order the screen had to go, which is what the fleet test reads
 * to prove the order is exercised rather than merely written down.
 */
export interface Screenful {
  lines: string[];
  word: WordForm;
  /** The rung reached: 0 is every block whole. */
  yielded: number;
}

/**
 * The whole main screen, laid out inside its budget.
 *
 * **Always on it, whatever else goes:** the Guild, the Day, the Year, the coin and
 * Standing; the Upkeep owed with its two clocks; the size of the Roster and what is wrong
 * with it; and the keys. That is E7-S1's own acceptance box and nothing below touches it.
 *
 * **What yields, in this order, until the screen fits** (DL-26 §1): RECENTLY, its oldest
 * entry at a time, until it is gone; then the Applicants cue, to one line naming its key;
 * then the AWAY block, to a one-line count naming its key; then the waiting-Party block,
 * to the loud summary naming its key; then the AWAY count altogether, because the Roster
 * line already says how many are away. **The Board never yields**: it is bounded by
 * `config.boardSizeMax` and the numbers on it are what the screen is for. Nothing is ever
 * cut mid-sentence and nothing carries an ellipsis (E7-S5) — a block is whole, is in a
 * shorter form, or is a pointer at the key that shows it.
 *
 * @param history the rolling five, oldest first, at full length
 * @param rows the rows to lay out inside
 */
export function layOut(
  career: Career,
  width: number,
  content: Content | undefined,
  history: readonly string[],
  rows = ROWS,
): Screenful {
  const offers = content === undefined ? [] : wordOffers(career, content);
  const waiting = offers.length > 0;
  // Two or more Parties waiting cannot be shown whole on one screen at any width, so the
  // summary is where they start — at **every** width, because a 40-column player handed a
  // seventy-row screen is no better served than an 80-column one (DL-26 §2).
  const opening: Give['word'] = offers.length >= 2 ? 'summary' : 'whole';

  const header = headerBlock(career, width);
  const board = boardBlock(career, width);
  const wordWhole = wordLines(career, width, content);
  const wordShort = wordSummaryLines(career, width, content);
  const awayWhole = awayBlock(career, width, waiting);
  const awayShort = awayCountLine(career, width, waiting);
  const cueWhole = applicantCueLines(career, width);
  const cueShort = applicantCueLines(career, width, true);
  const roster = rosterBlock(career, width);

  const build = (give: Give): Screenful => {
    const form: WordForm = !waiting ? 'none' : give.word === 'whole' ? 'full' : 'summary';
    const top = !waiting ? board : form === 'full' ? wordWhole : wordShort;
    const away = give.away === 'whole' ? awayWhole : give.away === 'short' ? awayShort : [];
    const cue = give.cue === 'whole' ? cueWhole : give.cue === 'short' ? cueShort : [];
    const kept = history.slice(history.length - give.history);
    const recently =
      kept.length === 0
        ? []
        : ['', heading('Recently', 'Recently', width), ...historyLines(kept, width)];
    return {
      lines: [
        ...header,
        rule(width),
        ...top,
        ...(away.length === 0 ? [] : ['', ...away]),
        '',
        ...roster,
        ...(cue.length === 0 ? [] : ['', ...cue]),
        ...recently,
        rule(width),
        ...hintLines(career, width, form),
      ],
      word: form,
      yielded: 0,
    };
  };

  const ladder: Give[] = [];
  for (let kept = history.length; kept >= 0; kept -= 1) {
    ladder.push({ history: kept, cue: 'whole', away: 'whole', word: opening });
  }
  ladder.push({ history: 0, cue: 'short', away: 'whole', word: opening });
  ladder.push({ history: 0, cue: 'short', away: 'short', word: opening });
  ladder.push({ history: 0, cue: 'short', away: 'short', word: 'summary' });
  ladder.push({ history: 0, cue: 'short', away: 'none', word: 'summary' });

  const first = ladder[0];
  if (first === undefined) throw new Error('the priority order is never empty');
  // Below 80 the layout is stacked and a narrow terminal scrolls anyway, so the row budget
  // does not run there: hiding the history at 40 columns would lose a whole block to a
  // budget that does not apply to it. §2's summary rule still does, and `opening` holds it.
  if (width < WIDE) return build(first);

  let screen = build(first);
  for (let rung = 1; rung < ladder.length && screen.lines.length > rows; rung += 1) {
    const give = ladder[rung];
    if (give === undefined) break;
    screen = { ...build(give), yielded: rung };
  }
  return screen;
}

/** The whole main screen, for a caller that wants only the text. */
export function mainScreen(
  career: Career,
  width: number,
  content: Content | undefined,
  history: readonly string[],
  rows = ROWS,
): string[] {
  return layOut(career, width, content, history, rows).lines;
}
