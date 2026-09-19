/**
 * `@heroesim/narrate` — events in, English out (ADR-0002, DL-08). The engine reports
 * facts with ids and numbers; this package is where the writing craft lives, and both
 * front ends render the same Paragraphs so that they say the same thing.
 *
 * Pure: no clock, no global random, no output. ESLint enforces it.
 *
 * Two kinds of prose meet here. A Beat's sentences are authored in the Vignette and
 * filled from the Beat's slots; everything else — the report a Party comes back with,
 * the Board, Upkeep, the reckoning — is written in `lines.ts` and here.
 */

import {
  commissionById,
  type Career,
  type Content,
  type GameEvent,
  type Hero,
  type Vignette,
} from '@heroesim/engine';
import { count, errorSentence, formatDay, joinNames, reckoningLines } from './lines.js';
import { fillTokens, NarrationError, pronounForms } from './tokens.js';

export const PACKAGE_NAME = '@heroesim/narrate';

export { errorSentence, formatDay, reckoningLines };
export { NarrationError } from './tokens.js';

/** What a Paragraph is about, so a front end can lay it out without reading it. */
export type ParagraphKind = 'beat' | 'return' | 'board' | 'coin' | 'commit' | 'end' | 'note';

/**
 * One paragraph of the story, ready to print. Paragraphs come back in the order the
 * events happened, which is Day order; a Party's report is its Beats and its return,
 * which share a `partyId`.
 */
export interface Paragraph {
  kind: ParagraphKind;
  /** The Day the events behind it happened on. */
  day: number;
  /** The prose. Never empty, and never contains an unfilled `{token}`. */
  text: string;
  /** Set when the paragraph belongs to one Party's report. */
  partyId?: string;
}

function paragraph(
  kind: ParagraphKind,
  day: number,
  text: string,
  partyId?: string,
): Paragraph {
  return partyId === undefined ? { kind, day, text } : { kind, day, text, partyId };
}

/** Ends a clause with a full stop without doubling one the author already wrote. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The lookups a paragraph needs, built once per call. */
interface World {
  heroes: ReadonlyMap<string, Hero>;
  patrons: ReadonlyMap<string, string>;
  spheres: ReadonlyMap<string, string>;
  rivals: ReadonlyMap<string, string>;
  vignettes: ReadonlyMap<string, Vignette>;
}

function indexWorld(career: Career, content: Content): World {
  const heroes = new Map<string, Hero>();
  for (const hero of career.guild.roster) heroes.set(hero.id, hero);
  for (const hero of career.guild.formerHeroes) if (!heroes.has(hero.id)) heroes.set(hero.id, hero);
  return {
    heroes,
    patrons: new Map(career.patrons.map((patron) => [patron.id, patron.name])),
    spheres: new Map(content.spheres.map((sphere) => [sphere.id, sphere.name])),
    rivals: new Map(career.rivals.map((rival) => [rival.id, rival.name])),
    vignettes: new Map(content.vignettes.map((vignette) => [vignette.id, vignette])),
  };
}

/** A Hero's name, or a plain stand-in if they have left the Guild's memory entirely. */
function heroName(world: World, id: string): string {
  return world.heroes.get(id)?.name ?? 'one of the Party';
}

function patronName(world: World, id: string): string {
  return world.patrons.get(id) ?? 'the Patron';
}

/** What the Board and the reports call a Commission once it is no longer resolvable. */
function commissionTitle(career: Career, world: World, commissionId: string, patronId: string): string {
  return commissionById(career, commissionId)?.title ?? `work from ${patronName(world, patronId)}`;
}

// ── The Beat ────────────────────────────────────────────────────────────────

function beatText(
  event: Extract<GameEvent, { type: 'BeatResolved' }>,
  career: Career,
  world: World,
): string {
  const vignette = world.vignettes.get(event.vignetteId);
  if (vignette === undefined) {
    throw new NarrationError(`vignettes: no Vignette with id "${event.vignetteId}" is loaded`);
  }
  const hero = world.heroes.get(event.slots.heroId);
  const forms = hero === undefined ? undefined : pronounForms(hero.pronouns);
  const values: Record<string, string | undefined> = {
    hero: hero?.name,
    'hero.they': forms?.they,
    'hero.them': forms?.them,
    'hero.their': forms?.their,
    'hero.is': forms?.is,
    'hero.has': forms?.has,
    'hero.moves': forms?.moves,
    patron: world.patrons.get(event.slots.patronId),
    sphere: world.spheres.get(event.slots.sphereId),
    guildmaster: career.guild.guildmaster.name,
    commission: commissionById(career, event.commissionId)?.title,
    trait: event.slots.trait,
  };
  return fillTokens(
    vignette.outcomes[event.result].narrative,
    values,
    `vignettes/${vignette.id}.toml: outcomes.${event.result}.narrative`,
  );
}

// ── The Board ───────────────────────────────────────────────────────────────

interface BoardBuffer {
  day: number;
  posted: { commissionId: string; patronId: string }[];
  expired: { commissionId: string; patronId: string }[];
  taken: { commissionId: string; patronId: string; rivalId: string }[];
}

function boardText(buffer: BoardBuffer, career: Career, world: World): string {
  const sentences: string[] = [];

  if (buffer.posted.length === 0) {
    sentences.push('Nothing new was posted to the Board.');
  } else {
    const titles = buffer.posted.map((entry) =>
      commissionTitle(career, world, entry.commissionId, entry.patronId),
    );
    sentences.push(`New on the Board: ${titles.join('; ')}.`);
  }

  for (const entry of buffer.taken) {
    const rival = world.rivals.get(entry.rivalId) ?? 'another Guild';
    const title = commissionTitle(career, world, entry.commissionId, entry.patronId);
    sentences.push(`${rival} took ${title}.`);
  }

  if (buffer.expired.length > 0) {
    // A Commission that lapsed has left the Board, so its title is often gone with it.
    // Name the ones still resolvable and gather the rest under the Patrons they came from.
    const titles: string[] = [];
    const patrons = new Set<string>();
    for (const entry of buffer.expired) {
      const commission = commissionById(career, entry.commissionId);
      if (commission === undefined) patrons.add(patronName(world, entry.patronId));
      else titles.push(commission.title);
    }
    const parts: string[] = [];
    if (titles.length > 0) parts.push(titles.join('; '));
    if (patrons.size > 0) parts.push(`work from ${joinNames([...patrons])}`);
    sentences.push(
      `${count(buffer.expired.length, 'Commission', 'Commissions')} lapsed unclaimed: ` +
        `${parts.join('; ')}.`,
    );
  }

  return sentences.join(' ');
}

// ── The whole stream ────────────────────────────────────────────────────────

/**
 * Turn a step's events into paragraphs.
 *
 * Accounting events — a Consequence, a coin movement, a Regard movement, a Trait given
 * or lifted — never get a paragraph of their own. A coin movement is folded into the
 * Beat or the return that caused it; the rest are folded into one short `note` attached
 * after it. Commission score is deliberately silent: the Beat already says how it went.
 *
 * @param events what the engine reported, in the order it reported them
 * @param career the Career **after** the step, so that every name and title resolves
 * @param content the authored content the Beats came from
 * @throws NarrationError if a Vignette is missing or a token cannot be filled
 */
export function narrateEvents(
  events: readonly GameEvent[],
  career: Career,
  content: Content,
): Paragraph[] {
  const world = indexWorld(career, content);
  const out: Paragraph[] = [];

  /**
   * Accounting sentences waiting to be attached. Each carries the Day it happened on,
   * because a Trait lifts at the start of a Day before any Beat has anchored it.
   */
  let notes: { day: number; partyId: string | undefined; text: string }[] = [];
  let noteDay = career.day;
  let notePartyId: string | undefined;
  /** The Beat or return a coin movement folds into. */
  let attachTo: Paragraph | undefined;
  let board: BoardBuffer | undefined;

  /** A note belongs to the anchor it follows only when it happened on the same Day. */
  const addNote = (day: number, text: string): void => {
    const owner = board === undefined && noteDay === day ? notePartyId : undefined;
    notes.push({ day, partyId: owner, text });
  };

  /** One paragraph per run of notes sharing a Day and a Party, in the order they arrived. */
  const flushNotes = (): void => {
    let index = 0;
    while (index < notes.length) {
      const head = notes[index];
      if (head === undefined) break;
      let end = index + 1;
      while (end < notes.length) {
        const next = notes[end];
        if (next === undefined || next.day !== head.day || next.partyId !== head.partyId) break;
        end += 1;
      }
      const text = notes
        .slice(index, end)
        .map((note) => note.text)
        .join(' ');
      out.push(paragraph('note', head.day, text, head.partyId));
      index = end;
    }
    notes = [];
  };

  const closeBoard = (): void => {
    if (board === undefined) return;
    const text = boardText(board, career, world);
    const day = board.day;
    board = undefined;
    out.push(paragraph('board', day, text));
    flushNotes();
  };

  /** Everything that is not a Board event closes the Board and any pending note. */
  const anchor = (day: number, partyId?: string): void => {
    closeBoard();
    flushNotes();
    noteDay = day;
    notePartyId = partyId;
    attachTo = undefined;
  };

  const openBoard = (day: number): BoardBuffer => {
    if (board !== undefined && board.day === day) return board;
    closeBoard();
    flushNotes();
    noteDay = day;
    notePartyId = undefined;
    attachTo = undefined;
    board = { day, posted: [], expired: [], taken: [] };
    return board;
  };

  for (const event of events) {
    switch (event.type) {
      case 'CareerStarted': {
        anchor(event.day);
        const names = event.heroIds.map((id) => heroName(world, id));
        out.push(
          paragraph(
            'note',
            event.day,
            `You take over ${event.guildName}. ${career.guild.guildmaster.name} is Guildmaster, ` +
              `and ${joinNames(names)} came with the Guild.`,
          ),
        );
        break;
      }

      case 'CommissionPosted':
        openBoard(event.day).posted.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
        });
        break;

      case 'CommissionExpired':
        openBoard(event.day).expired.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
        });
        break;

      case 'CommissionTakenByRival':
        openBoard(event.day).taken.push({
          commissionId: event.commissionId,
          patronId: event.patronId,
          rivalId: event.rivalId,
        });
        break;

      case 'BoardRefreshed':
        openBoard(event.day);
        closeBoard();
        break;

      case 'PartyCommitted': {
        anchor(event.day, event.partyId);
        const commission = commissionById(career, event.commissionId);
        const title = commission?.title ?? 'the work';
        const patron =
          commission === undefined ? 'their Patron' : patronName(world, commission.patronId);
        const names = joinNames(event.heroIds.map((id) => heroName(world, id)));
        const backing =
          event.backing === 0 ? 'with no Backing' : `with Backing of ${event.backing}`;
        out.push(
          paragraph(
            'commit',
            event.day,
            `${names} set out on ${title}, for ${patron}, ${backing}. ` +
              `They are due back on ${formatDay(event.returnsOn, career)}.`,
            event.partyId,
          ),
        );
        break;
      }

      case 'BeatResolved': {
        anchor(event.day, event.partyId);
        const built = paragraph('beat', event.day, beatText(event, career, world), event.partyId);
        out.push(built);
        attachTo = built;
        break;
      }

      case 'PartyReturned': {
        anchor(event.day, event.partyId);
        const title = commissionTitle(career, world, event.commissionId, event.patronId);
        const names = joinNames(event.heroIds.map((id) => heroName(world, id)));
        const outcome = event.succeeded ? 'the work was finished' : 'the work was not finished';
        const fee =
          event.feePaid > 0
            ? `The fee of ${event.feePaid} coin was paid.`
            : 'Nothing was paid for it.';
        const built = paragraph(
          'return',
          event.day,
          `${title}, for ${patronName(world, event.patronId)}: ${outcome}. ` +
            `${names} came back. ${fee}`,
          event.partyId,
        );
        out.push(built);
        attachTo = built;
        break;
      }

      case 'UpkeepOwed':
        anchor(event.day);
        out.push(
          paragraph(
            'coin',
            event.day,
            `Upkeep of ${event.amount} coin falls due. ${event.balance} coin remains.`,
          ),
        );
        break;

      case 'CoinChanged': {
        if (event.reason === 'upkeep') break;
        if (event.reason === 'fee') {
          if (attachTo !== undefined) {
            attachTo.text += ` The Guild holds ${event.balance} coin.`;
          }
          break;
        }
        const movement =
          event.delta < 0
            ? `It cost the Guild ${Math.abs(event.delta)} coin`
            : `It brought the Guild ${event.delta} coin`;
        const line = `${movement}; ${event.balance} coin remains.`;
        if (attachTo === undefined) addNote(event.day, line);
        else attachTo.text += ` ${line}`;
        break;
      }

      case 'PatronRegardChanged':
        if (event.delta !== 0) {
          addNote(
            event.day,
            sentence(
              `Regard from ${patronName(world, event.patronId)} moved ` +
                `${event.delta > 0 ? 'up' : 'down'}: ${event.reason}`,
            ),
          );
        }
        break;

      case 'HeroRegardForGuildmasterChanged':
        if (event.delta !== 0) {
          addNote(
            event.day,
            sentence(
              `${heroName(world, event.heroId)} thinks ` +
                `${event.delta > 0 ? 'better' : 'worse'} of you: ${event.reason}`,
            ),
          );
        }
        break;

      case 'TraitGained':
        addNote(
          event.day,
          event.liftsOn === undefined
            ? `${heroName(world, event.heroId)} carries ${event.trait} from now on.`
            : `${heroName(world, event.heroId)} carries ${event.trait} until ` +
              `${formatDay(event.liftsOn, career)}.`,
        );
        break;

      case 'TraitLifted':
        addNote(event.day, `${heroName(world, event.heroId)} is clear of ${event.trait}.`);
        break;

      case 'ConsequenceApplied':
        // Deliberately silent: the movement it announces arrives as its own event with
        // the clamping applied, and a score change is already told by the Beat.
        break;

      case 'CareerEnded': {
        anchor(event.day);
        const opening =
          event.reason === 'retirement'
            ? `${career.guild.guildmaster.name} retires on ${formatDay(event.day, career)}.`
            : `The Guild cannot meet its Upkeep. ${career.guild.name} closes on ` +
              `${formatDay(event.day, career)}.`;
        out.push(
          paragraph(
            'end',
            event.day,
            [opening, ...reckoningLines(event.reckoning, career)].join('\n'),
          ),
        );
        break;
      }

      default: {
        const unreachable: never = event;
        throw new NarrationError(
          `no narration for event ${String((unreachable as { type: string }).type)}`,
        );
      }
    }
  }

  closeBoard();
  flushNotes();
  return out;
}
