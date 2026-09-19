/**
 * Everything the terminal shows, as arrays of plain strings. Nothing here writes to
 * stdout, so the layout can be asserted on in a test: the Board, the Roster, the Parties
 * away, the money, and the narration as the player reads it.
 *
 * The screen is 80 columns and prose wraps at 78. Colour is a handful of ANSI codes
 * applied to finished lines, so widths are always measured on the plain text.
 */

import {
  availableHeroes,
  standing,
  type Career,
  type Commission,
  type Content,
  type GameConfig,
  type Hero,
  type Party,
} from '@heroesim/engine';
import { formatDay, type Paragraph } from '@heroesim/narrate';
import { ROSTER_LETTERS } from './input.js';
import type { SlotSummary } from './saves.js';

/** The widest a line may be. */
export const WIDTH = 80;
/** The width prose wraps at, leaving the last two columns clear. */
export const PROSE_WIDTH = 78;

/** How a finished line is dressed. Every method must leave the text itself alone. */
export interface Palette {
  heading(text: string): string;
  dim(text: string): string;
  strong(text: string): string;
}

/** No dressing at all: for a pipe, a file, or `--no-colour`. */
export const plainPalette: Palette = {
  heading: (text) => text,
  dim: (text) => text,
  strong: (text) => text,
};

const ESC = '[';

/** Bold and dim only. There is no colour library here and there will not be one. */
export const ansiPalette: Palette = {
  heading: (text) => `${ESC}1m${text}${ESC}0m`,
  dim: (text) => `${ESC}2m${text}${ESC}0m`,
  strong: (text) => `${ESC}1m${text}${ESC}0m`,
};

/** Cut a string to a width, marking where it was cut. */
export function clip(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, Math.max(0, width));
  return `${text.slice(0, width - 3).trimEnd()}...`;
}

/** Cut to a width and pad out to it, so columns line up. */
export function cell(text: string, width: number): string {
  return clip(text, width).padEnd(width);
}

/**
 * Break prose into lines no wider than `width`, keeping the author's own line breaks.
 * A word longer than the width is broken rather than allowed to run over.
 */
export function wrap(text: string, width: number = PROSE_WIDTH): string[] {
  const lines: string[] = [];
  for (const block of text.split('\n')) {
    const words = block.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      line = line.length === 0 ? word : `${line} ${word}`;
      while (line.length > width) {
        const head = line.slice(0, width);
        const lastSpace = head.lastIndexOf(' ');
        if (lastSpace > 0) {
          lines.push(head.slice(0, lastSpace));
          line = line.slice(lastSpace + 1);
        } else {
          lines.push(head);
          line = line.slice(width);
        }
      }
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** The difficulty as a word, banded across the range the config allows. */
export function difficultyBand(difficulty: number, config: GameConfig): string {
  const span = config.difficultyMax - config.difficultyMin;
  if (span <= 0) return 'fair';
  const ratio = (difficulty - config.difficultyMin) / span;
  if (ratio < 0.25) return 'easy';
  if (ratio < 0.5) return 'fair';
  if (ratio < 0.75) return 'hard';
  return 'grim';
}

/** "1 Day" / "4 Days". */
export function days(amount: number): string {
  return `${amount} ${amount === 1 ? 'Day' : 'Days'}`;
}

/** The next Day on which something that happens on a cycle falls due. */
export function nextDayOn(day: number, every: number): number {
  if (every <= 0) return day;
  return (Math.floor(day / every) + 1) * every;
}

function patronName(career: Career, patronId: string): string {
  return career.patrons.find((patron) => patron.id === patronId)?.name ?? 'an unknown Patron';
}

function sphereName(career: Career, content: Content, patronId: string): string {
  const patron = career.patrons.find((candidate) => candidate.id === patronId);
  if (patron === undefined) return 'an unknown Sphere';
  return content.spheres.find((sphere) => sphere.id === patron.sphere)?.name ?? patron.sphere;
}

function statsOf(hero: Hero): string {
  return `${hero.stats.Might}/${hero.stats.Craft}/${hero.stats.Nerve}/${hero.stats.Guile}`;
}

// ── The Board ───────────────────────────────────────────────────────────────

/** The Commissions on offer, numbered from one. */
export function boardLines(career: Career, content: Content, palette: Palette): string[] {
  const lines = [palette.heading('Board')];
  if (career.board.length === 0) {
    lines.push('  Nothing is on offer. Advance a stretch of Days and see what is posted.');
    return lines;
  }
  career.board.forEach((commission: Commission, index) => {
    // Numbers first and fixed-width, so that a long Patron or Sphere name is what gets
    // cut rather than the fee or the difficulty.
    const terms =
      `${String(commission.fee).padStart(3)} coin | ` +
      `${difficultyBand(commission.difficulty, career.config).padEnd(4)} | ` +
      `${days(commission.spanDays).padStart(7)} | ` +
      `${patronName(career, commission.patronId)}, ` +
      `${sphereName(career, content, commission.patronId)}`;
    lines.push(clip(`  ${index + 1}  ${commission.title}`, WIDTH));
    lines.push(palette.dim(clip(`     ${terms}`, WIDTH)));
  });
  return lines;
}

// ── The Roster ──────────────────────────────────────────────────────────────

const NAME_WIDTH = 20;
const STATS_WIDTH = 7;
const TRAITS_WIDTH = 29;
const STATUS_WIDTH = 15;

/** One Roster row: 2 + 2 + 1 + 20 + 1 + 7 + 2 + 29 + 1 + 15 comes to exactly 80. */
function rosterRow(label: string, name: string, stats: string, traits: string, status: string): string {
  return clip(
    `  ${cell(label, 2)} ${cell(name, NAME_WIDTH)} ${cell(stats, STATS_WIDTH)}  ` +
      `${cell(traits, TRAITS_WIDTH)} ${clip(status, STATUS_WIDTH)}`,
    WIDTH,
  ).trimEnd();
}

/** The Roster, lettered from a, with who is away and when they are back. */
export function rosterLines(career: Career, palette: Palette): string[] {
  const away = new Map<string, Party>();
  for (const party of career.parties) {
    for (const heroId of party.heroIds) away.set(heroId, party);
  }

  const lines = [palette.heading('Roster')];
  lines.push(palette.dim(rosterRow(' ', 'Hero', 'M/C/N/G', 'Traits', 'Where')));
  career.guild.roster.forEach((hero, index) => {
    const party = away.get(hero.id);
    const status =
      party === undefined ? 'available' : `back in ${days(party.returnsOn - career.day)}`;
    const traits = hero.traits.map((trait) => trait.name).join(', ');
    lines.push(
      rosterRow(ROSTER_LETTERS[index] ?? '-', hero.name, statsOf(hero), traits || '-', status),
    );
  });
  return lines;
}

/** The Parties out on work, with the Commission and the Day they are due. */
export function awayLines(career: Career, palette: Palette): string[] {
  if (career.parties.length === 0) return [];
  const lines = [palette.heading('Away')];
  for (const party of career.parties) {
    const names = party.heroIds
      .map((id) => career.guild.roster.find((hero) => hero.id === id)?.name ?? id)
      .join(', ');
    lines.push(clip(`  ${names} on ${party.commission.title}`, WIDTH));
    lines.push(
      palette.dim(
        clip(
          `    due back ${formatDay(party.returnsOn, career)} ` +
            `(in ${days(party.returnsOn - career.day)})`,
          WIDTH,
        ),
      ),
    );
  }
  return lines;
}

/** Where the Career stands: the Day, the Guild, the money and the two clocks. */
export function statusLines(career: Career, palette: Palette): string[] {
  const upkeep = nextDayOn(career.day, career.config.upkeepEveryDays);
  const refresh = nextDayOn(career.day, career.config.boardRefreshEveryDays);
  const owed = career.config.upkeepBase + career.config.upkeepPerHero * career.guild.roster.length;
  return [
    palette.strong(
      clip(
        `${formatDay(career.day, career)} | ${career.guild.name} | ` +
          `${career.guild.coin} coin | Standing ${standing(career)}`,
        WIDTH,
      ),
    ),
    palette.dim(
      clip(
        `Upkeep of ${owed} coin in ${days(upkeep - career.day)}. ` +
          `Board refreshes in ${days(refresh - career.day)}.`,
        WIDTH,
      ),
    ),
  ];
}

/** The last few things the player did, newest last. */
export function decisionLines(decisions: readonly string[], palette: Palette): string[] {
  if (decisions.length === 0) return [];
  const lines = [palette.heading('Lately')];
  for (const decision of decisions) lines.push(clip(`  ${decision}`, WIDTH));
  return lines;
}

/** The whole screen shown before each command. */
export function screenLines(
  career: Career,
  content: Content,
  decisions: readonly string[],
  palette: Palette,
): string[] {
  return [
    ...statusLines(career, palette),
    '',
    ...boardLines(career, content, palette),
    '',
    ...rosterLines(career, palette),
    ...blockOrNothing(awayLines(career, palette)),
    ...blockOrNothing(decisionLines(decisions, palette)),
    '',
    palette.dim('1-6 take work | n advance | s save | l load or list | d delete | h help | q quit'),
  ];
}

function blockOrNothing(lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ['', ...lines];
}

// ── Choosing who to send ────────────────────────────────────────────────────

/** The prompt shown while a Party is being put together. */
export function selectionLines(
  career: Career,
  commission: Commission,
  chosen: readonly string[],
  palette: Palette,
): string[] {
  const free = availableHeroes(career);
  const lines = [
    palette.heading(clip(commission.title, WIDTH)),
    palette.dim(
      clip(
        `  ${patronName(career, commission.patronId)} | ${commission.fee} coin | ` +
          `${difficultyBand(commission.difficulty, career.config)} | ` +
          `${days(commission.spanDays)} | ${commission.beatCount} Beats`,
        WIDTH,
      ),
    ),
    '',
  ];
  career.guild.roster.forEach((hero, index) => {
    const letter = ROSTER_LETTERS[index] ?? '-';
    const available = free.some((candidate) => candidate.id === hero.id);
    const mark = chosen.includes(hero.id) ? '*' : ' ';
    const traits = hero.traits.map((trait) => trait.name).join(', ');
    lines.push(
      rosterRow(
        `${letter}${mark}`,
        hero.name,
        statsOf(hero),
        traits || '-',
        available ? '' : 'away',
      ),
    );
  });
  lines.push('');
  lines.push(palette.dim('Letters toggle a Hero. Enter sends them. q goes back to the Board.'));
  return lines;
}

// ── Saves and help ──────────────────────────────────────────────────────────

/** A listing of the save slots. */
export function slotLines(summaries: readonly SlotSummary[], palette: Palette): string[] {
  if (summaries.length === 0) return ['Nothing is saved yet.'];
  const lines = [palette.heading('Saved')];
  for (const summary of summaries) {
    const detail =
      summary.problem !== undefined
        ? summary.problem
        : `${summary.guildName ?? 'a Guild'}, Day ${summary.day ?? '?'}, seed ${summary.seed ?? '?'}`;
    lines.push(clip(`  ${cell(summary.name, 16)} ${detail}`, WIDTH));
  }
  return lines;
}

/** What the commands are. */
export function helpLines(palette: Palette): string[] {
  return [
    palette.heading('Commands'),
    '  1 to 6       take that Commission; then letters choose who goes,',
    '                 and Enter sends them',
    '  n            let the Days run until something wants you',
    '  s [slot]     save (the slot is "autosave" unless you name another)',
    '  l            list what is saved',
    '  l <slot>     load that slot',
    '  d <slot>     delete that slot',
    '  h            this',
    '  q            leave',
  ];
}

// ── Narration ───────────────────────────────────────────────────────────────

/**
 * The paragraphs as the player reads them: a heading when the Day changes, prose
 * indented and wrapped, and the Board and Upkeep lines kept terse so that a long quiet
 * stretch does not fill the screen. A run of Upkeeps with nothing between them collapses
 * to one line marked with how many it stands for.
 */
export function narrationLines(
  paragraphs: readonly Paragraph[],
  career: Career,
  palette: Palette,
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
      out.push(palette.heading(formatDay(entry.day, career)));
      lastDay = entry.day;
    }

    const text = run > 1 ? `(x${run}) ${entry.text}` : entry.text;
    for (const line of wrap(text, PROSE_WIDTH - 2)) out.push(line === '' ? '' : `  ${line}`);
    if (!terse) out.push('');

    index += run;
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}
