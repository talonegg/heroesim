/**
 * The loop (E7 §4): read a key, call the engine, narrate what came back, render.
 *
 * The rules are the engine's, the words are `narrate`'s, the terminal is `screen.ts`'s
 * and the layout is `layout.ts`' and the views'. What is left here is the order things
 * happen in — and the two front-end rules the engine deliberately does not enforce: that
 * a Party waiting on word is never advanced past without a second keypress (DL-24), and
 * that no coin leaves the Guild on one bare press (DL-25 §3).
 *
 * **No Career is lost by any exit path.** Quitting, an interrupt and an error thrown while
 * a view is rendering all write the autosave slot first, and the autosave slot is never a
 * named one.
 */

import { readFileSync } from 'node:fs';
import {
  acceptApplicant,
  advanceUntilAttention,
  answerParty,
  applicantOffers,
  awaitingParties,
  commitParty,
  declineApplicant,
  EngineError,
  hallCost,
  HALL_IMPROVEMENTS,
  improveHall,
  newCareer,
  poachHero,
  proposeParty,
  rivalOffers,
  SaveError,
  transferHero,
  wordOffers,
  type Career,
  type Commission,
  type Content,
  type GameEvent,
  type Refusal,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { formatDay, narrateEvents, reckoningLines, wordProse } from '@heroesim/narrate';
import { errorSentence } from './errors.js';
import { entriesFrom, remember } from './history.js';
import {
  parseApplicantChoice,
  parseArgs,
  parseCommand,
  parseEndChoice,
  parseHallChoice,
  parsePageChoice,
  parseRivalChoice,
  parseSelection,
  parseWordChoice,
  saidYes,
  ROSTER_LETTERS,
  USAGE,
  UsageError,
  type Options,
  type ViewName,
} from './input.js';
import { hintLines, layOut, narrationLines, type Screenful, type WordForm } from './layout.js';
import {
  coin,
  detectScreen,
  keyHints,
  paginate,
  render,
  terminalPrompter,
  thisTerminal,
  wrapAt,
  writer,
  type Prompter,
  type Screen,
} from './screen.js';
import {
  deleteSlot,
  deleteSlotForCareer,
  listSlots,
  loadSlot,
  saveSlot,
  AUTOSAVE_SLOT,
  NAMED_SLOTS,
  type SlotSummary,
} from './slots.js';
import { insistenceLines, refusalLines, selectionLines } from './commit.js';
import {
  applicantConfirmLines,
  hallConfirmLines,
  moveConfirmLines,
  quitConfirmLines,
  wordConfirmLines,
} from './confirm.js';
import { advanceRefusedLines, wordLines } from './word.js';
import { applicantLines } from './views/applicants.js';
import { formerLines } from './views/former.js';
import { hallLines } from './views/hall.js';
import { leagueLines } from './views/league.js';
import { patronLines } from './views/patrons.js';
import { rosterLines } from './views/roster.js';
import { rivalLines } from './views/rivals.js';

/** Every read-only view is this shape and holds no state (E7 §4). */
export type View = (career: Career, width: number, content: Content) => string[];

/** The four views a key opens and a key closes. */
export type ViewTable = Record<ViewName, View>;

/** The views as they ship. A test may hand the loop a different table. */
export const VIEWS: ViewTable = {
  roster: rosterLines,
  patrons: patronLines,
  league: leagueLines,
  former: formerLines,
};

/** What the loop needs from the world, so that a test can hand it a world it controls. */
export interface Io {
  /** Where output goes. */
  out: (text: string) => void;
  /** The clock, read **only** for a slot's `savedOn` and the default seed (E7 §4). */
  clock: () => number;
  /** What the terminal can do. */
  screen: Screen;
  /** The views, so an error thrown inside one can be exercised. */
  views?: ViewTable;
  /**
   * How the main screen is laid out. Present for the same reason `views` is: the definition
   * of done promises no Career is lost when **anything** thrown on the way to the screen,
   * and the main screen is the one path a broken view cannot stand in for.
   */
  layout?: typeof layOut;
  /** Registers the interrupt handler. Absent in a test that drives `play` directly. */
  onInterrupt?: (handler: () => void) => void;
}

/** Everything an autosave needs, without the loop handing over its whole state. */
export interface AutosaveTarget {
  careerDir: string;
  career: () => Career;
  history: () => readonly string[];
  savedOn: () => string;
}

/**
 * Write the Career to the autosave slot. The autosave has a slot of its own and never
 * writes over a named one, so it can never overwrite a Career the player meant to keep
 * (E7 §5's risk table).
 *
 * @returns the path written, so the player can be told where it went
 */
export function autosave(target: AutosaveTarget): string {
  return saveSlot(
    target.careerDir,
    AUTOSAVE_SLOT,
    target.career(),
    target.history(),
    target.savedOn(),
  );
}

/**
 * The interrupt handler, as a function so that it can be called in a test. On Windows a
 * signal sent with `process.kill` terminates the target without running a handler, so what
 * a test can prove here is that this does the right thing and that the real program
 * installs it — never that the operating system delivers the signal (DL-25 §12).
 */
export function interrupted(target: AutosaveTarget, say: (text: string) => void): void {
  try {
    say(`Interrupted. The Career is autosaved to ${autosave(target)}.`);
  } catch (error) {
    say(`Interrupted, and the autosave failed: ${(error as Error).message}`);
  }
}

function scriptPrompter(path: string, echo: (text: string) => void): Prompter {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  const queue = lines.filter((line) => !line.trimStart().startsWith('#'));
  let index = 0;
  return {
    ask: (prompt) => {
      const line = queue[index];
      index += 1;
      if (line === undefined) return Promise.resolve(undefined);
      echo(`${prompt}${line}\n`);
      return Promise.resolve(line);
    },
    close: () => {
      /* nothing to close */
    },
  };
}

/**
 * What a slot listing says about each slot, without the Career being deserialised.
 * Exported so that the width rule can be held over it as it is over every view: the
 * longest Guild name anybody could give must wrap rather than run over (E7-S5).
 */
export function slotLines(summaries: readonly SlotSummary[], width: number): string[] {
  const lines = ['SAVED'];
  const known = new Map(summaries.map((summary) => [summary.name, summary]));
  const order = [AUTOSAVE_SLOT, ...NAMED_SLOTS];
  for (const name of [...order, ...summaries.map((s) => s.name).filter((n) => !order.includes(n))]) {
    const summary = known.get(name);
    if (summary === undefined) {
      lines.push(...wrapAt(`${name}: empty`, width, 2));
      continue;
    }
    if (summary.header === undefined) {
      lines.push(...wrapAt(`${name}: ${summary.problem ?? 'cannot be read'}`, width, 2));
      continue;
    }
    const { guildName, day, year, rosterSize, ended } = summary.header;
    lines.push(
      ...wrapAt(
        `${name}: ${guildName}, Year ${year}, Day ${day}, ${rosterSize} on the Roster` +
          (ended ? ', ended' : ''),
        width,
        2,
      ),
    );
  }
  return lines;
}

/**
 * Why a slot file would not do what was asked, as one sentence the player can act on.
 *
 * `SaveError` already carries one and is used as it is. Anything else is the file system
 * saying no — a read-only slot, a full disk, something else holding the file open — and
 * arrives as an errno message with two absolute paths in it, which is not a sentence. It
 * becomes one here, and the session goes on: a slot that cannot be written is an ordinary
 * thing that happens to a file and not a reason to end a Career. **Nothing is lost either
 * way** — the Career is in hand and the autosave is written on the way out (DL-25 §11).
 *
 * @param what the thing that could not be done, as a phrase: `save to slot "one"`
 */
export function whyTheFileWouldNotDo(error: unknown, what: string): string {
  if (error instanceof SaveError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  const why =
    code === 'EACCES' || code === 'EPERM'
      ? 'the file is not one this program is allowed to write'
      : code === 'ENOSPC'
        ? 'there is no room left on the disk'
        : code === 'EBUSY'
          ? 'something else has the file open'
          : code === 'EROFS'
            ? 'the disk it is on cannot be written to'
            : 'the file system would not have it';
  return `Could not ${what}: ${why}. The Career is untouched and still in hand.`;
}

/** What the commands are. Exported for the same reason `slotLines` is. */
export function helpLines(width: number): string[] {
  return [
    'COMMANDS',
    ...wrapAt('1 to 6: take that Commission; letters choose who goes and Enter sends them', width, 2),
    ...wrapAt('1 to 9 while a Party waits on your word: answers them', width, 2),
    ...wrapAt('w: what every waiting Party asks, in full, and a number answers there', width, 2),
    ...wrapAt('r: the Roster. p: the Patrons. g: the League. f: the Heroes who have left', width, 2),
    ...wrapAt('a: the Applicants at the door. o: the other Guilds. i: the Hall', width, 2),
    ...wrapAt('n: let the Days run until something wants you', width, 2),
    ...wrapAt('s [slot]: save. l: what is saved. l <slot>: load it. d <slot>: delete it', width, 2),
    ...wrapAt('h: this. q: leave', width, 2),
  ];
}

/** One playing session: the Career, what has been done to it, and the terminal. */
export async function play(
  options: Options,
  content: Content,
  prompter: Prompter,
  io: Io,
): Promise<number> {
  const { out } = io;
  const width = io.screen.width;
  const views = io.views ?? VIEWS;
  const say = (lines: readonly string[]): void => {
    if (lines.length > 0) out(render(lines, io.screen));
  };
  /** One message, wrapped to the width: even a long file path never runs over. */
  const tell = (text: string): void => {
    say(wrapAt(text, width, 0));
  };

  let slot = options.slot ?? AUTOSAVE_SLOT;
  let newCareers = 0;

  const overrides = {
    ...options.config,
    ...(options.years === undefined ? {} : { careerYears: options.years }),
  };
  const openCareer = (
    seed: string,
  ): { career: Career; events: readonly GameEvent[] } =>
    newCareer(seed, content, Object.keys(overrides).length === 0 ? undefined : overrides);

  let career: Career;
  let history: string[];
  if (options.slot !== undefined) {
    const loaded = loadSlot(options.careerDir, options.slot, content);
    career = loaded.career;
    history = loaded.history;
    tell(`Loaded slot "${options.slot}": ${career.guild.name}, ${formatDay(career.day, career)}.`);
  } else {
    const opened = openCareer(options.seed);
    career = opened.career;
    history = [];
    say(narrationLines(narrateEvents(opened.events, career, content), career, width));
  }

  /** A brand-new Career is unsaved from the first Day; a loaded one matches its slot. */
  let unsaved = options.slot === undefined;
  let endShown = false;
  /**
   * Set by the first `n` pressed while a Party is waiting, and cleared by anything else:
   * the second `n` is what accepts that the Days will run and the Party will act on its
   * own judgement (E6-S4, DL-24).
   */
  let lettingTheDaysRun = false;
  /**
   * Which form the waiting-Party block took the last time the screen was laid out. A
   * number answers only where the options are numbered in front of the player, which is
   * the full form; under the summary the answer is `w` and the hints say so (DL-26 §2).
   */
  let wordForm: WordForm;

  const target: AutosaveTarget = {
    careerDir: options.careerDir,
    career: () => career,
    history: () => history,
    savedOn: () => new Date(io.clock()).toISOString(),
  };
  io.onInterrupt?.(() => {
    interrupted(target, (text) => out(render([text], io.screen)));
    process.exit(0);
  });

  /** Narrate a step, remember what came of it, and note that the Career moved on. */
  const report = (events: readonly GameEvent[]): void => {
    const paragraphs = narrateEvents(events, career, content);
    const lines = narrationLines(paragraphs, career, width);
    if (lines.length > 0) out('\n');
    say(lines);
    if (paragraphs.some((entry) => entry.kind === 'end')) endShown = true;
    history = remember(history, entriesFrom(events, career, content));
    unsaved = true;
  };

  /** Ask once, and take anything but `y` for a no. */
  const confirmed = async (lines: readonly string[], prompt: string): Promise<boolean> => {
    say(lines);
    const answer = await prompter.ask(prompt);
    if (answer === undefined) return false;
    return saidYes(answer);
  };

  /**
   * Who among the chosen would refuse this Commission, asked of the engine rather than
   * worked out here (E2). Nothing is committed and nothing moves: `proposeParty` is a
   * pure read, so it is safe to call after every keypress.
   */
  const whoRefuses = (commission: Commission, chosen: readonly string[]): Refusal[] => {
    if (chosen.length === 0) return [];
    try {
      return proposeParty(career, commission.id, [...chosen], content).refusals;
    } catch {
      // A Hero who has just become unavailable is reported by the commit, not here.
      return [];
    }
  };

  /** A read-only view, paged, one keypress in and one keypress back (E7-S3). */
  const readAView = async (view: ViewName): Promise<boolean> => {
    let page = 1;
    for (;;) {
      const shown = paginate(views[view](career, width, content), page);
      page = shown.page;
      if (!options.quiet) {
        out('\n');
        say(shown.lines);
        say(keyHints(shown.pages > 1 ? ['[m] more', '[q] back'] : ['[q] back'], width));
      }
      const line = await prompter.ask(`${view}> `);
      if (line === undefined) return false;
      const choice = parsePageChoice(line);
      if (choice.kind === 'back') return true;
      if (choice.kind === 'more') {
        page = shown.page >= shown.pages ? 1 : shown.page + 1;
        continue;
      }
      tell(`"${choice.text}" is not one of the two things to do here.`);
    }
  };

  /**
   * The Hall (E3-S4). Every rejection is the engine's, printed as one sentence rather than
   * second-guessed here — and buying takes a confirming keypress, because it spends coin.
   */
  const visitTheHall = async (): Promise<boolean> => {
    let page = 1;
    for (;;) {
      const shown = paginate(hallLines(career, width), page);
      page = shown.page;
      if (!options.quiet) {
        out('\n');
        say(shown.lines);
        say(keyHints(['[1-3] buy that improvement', '[m] more', '[q] back'], width));
      }
      const line = await prompter.ask('hall> ');
      if (line === undefined) return false;
      const choice = parseHallChoice(line);
      if (choice.kind === 'cancel') return true;
      if (choice.kind === 'more') {
        page = shown.page >= shown.pages ? 1 : shown.page + 1;
        continue;
      }
      if (choice.kind === 'unknown') {
        tell(`"${choice.text}" is not an improvement. 1 to 3, or q to go back.`);
        continue;
      }
      const improvement = HALL_IMPROVEMENTS[choice.index - 1];
      if (improvement === undefined) {
        tell(`There is no improvement ${choice.index}.`);
        continue;
      }
      const cost = hallCost(improvement, career.config);
      if (!(await confirmed(hallConfirmLines(career, improvement, width), 'sure> '))) {
        tell('Nothing was bought.');
        continue;
      }
      try {
        const step = improveHall(career, improvement);
        career = step.career;
        report(step.events);
      } catch (error) {
        if (error instanceof EngineError) {
          tell(errorSentence(error.code, { detail: coin(cost) }));
        } else throw error;
      }
      // The view stays open: a player may want to buy a second thing, and one keypress
      // closes it either way.
      continue;
    }
  };

  /**
   * The Applicants waiting at the door (E4-S3). Taking somebody on spends coin and adds
   * to the Upkeep for as long as they stay, so it takes a confirming keypress; sending
   * somebody away costs nothing and takes none (DL-25 §3).
   */
  const meetTheApplicants = async (): Promise<boolean> => {
    let page = 1;
    for (;;) {
      const shown = paginate(applicantLines(career, width, content), page);
      page = shown.page;
      if (!options.quiet) {
        out('\n');
        say(shown.lines);
        say(
          keyHints(
            ['[1-9] take somebody on', '[d 1-9] send them away', '[m] more', '[q] back'],
            width,
          ),
        );
      }
      const line = await prompter.ask('applicants> ');
      if (line === undefined) return false;
      const choice = parseApplicantChoice(line);
      if (choice.kind === 'cancel') return true;
      if (choice.kind === 'more') {
        page = shown.page >= shown.pages ? 1 : shown.page + 1;
        continue;
      }
      if (choice.kind === 'unknown') {
        tell(`"${choice.text}" is not an Applicant. 1-9, d 1-9 to send one away, or q.`);
        continue;
      }
      const offer = applicantOffers(career)[choice.index - 1];
      if (offer === undefined) {
        tell(`Nobody is waiting as number ${choice.index}.`);
        continue;
      }
      const { applicant } = offer;
      if (choice.kind === 'accept') {
        if (!(await confirmed(applicantConfirmLines(career, offer, width), 'sure> '))) {
          tell(`${applicant.name} is left waiting.`);
          continue;
        }
      }
      try {
        const step =
          choice.kind === 'accept'
            ? acceptApplicant(career, applicant.id)
            : declineApplicant(career, applicant.id);
        career = step.career;
        report(step.events);
      } catch (error) {
        if (error instanceof EngineError) {
          tell(
            errorSentence(error.code, {
              hero: applicant.name,
              detail:
                error.code === 'RosterFull' ? career.config.rosterCap : coin(applicant.askingFee),
            }),
          );
        } else throw error;
      }
      // The door stays open: there may be somebody else at it.
      continue;
    }
  };

  /**
   * The other Guilds (E5-S2, E5-S3). Every fee and every reason a move cannot be made is
   * the engine's own answer, read off `rivalOffers` before anything is asked for.
   */
  const visitTheRivals = async (): Promise<boolean> => {
    let page = 1;
    for (;;) {
      const shown = paginate(rivalLines(career, width, content), page);
      page = shown.page;
      if (!options.quiet) {
        out('\n');
        say(shown.lines);
        say(
          keyHints(
            ['[t 1-9] bring somebody over', '[p 1-9] take somebody', '[m] more', '[q] back'],
            width,
          ),
        );
      }
      const line = await prompter.ask('rivals> ');
      if (line === undefined) return false;
      const choice = parseRivalChoice(line);
      if (choice.kind === 'cancel') return true;
      if (choice.kind === 'more') {
        page = shown.page >= shown.pages ? 1 : shown.page + 1;
        continue;
      }
      if (choice.kind === 'unknown') {
        tell(
          `"${choice.text}" is not a move. t <n> to bring somebody over, p <n> to take them, or q.`,
        );
        continue;
      }

      // The people are numbered straight through, across every Rival, so one number is
      // one person wherever they work.
      const everybody = career.rivals.flatMap((rival) =>
        rivalOffers(career, rival.id).map((offer) => ({ rival, offer })),
      );
      const picked = everybody[choice.index - 1];
      if (picked === undefined) {
        tell(`Nobody is numbered ${choice.index}.`);
        continue;
      }
      const transferring = choice.kind === 'transfer';
      // The screen that asks for the second keypress must never contradict the list the
      // player just read, so it is written from the engine's own offer, in the clause the
      // list itself uses, in one tested module (E7-S5, DL-26 §3).
      if (
        !(await confirmed(
          moveConfirmLines(
            career,
            transferring ? 'Transfer' : 'Poach',
            picked.offer,
            picked.rival.name,
            width,
          ),
          'sure> ',
        ))
      ) {
        tell('They stay where they are.');
        continue;
      }

      try {
        const step = transferring
          ? transferHero(career, picked.rival.id, picked.offer.hero.id)
          : poachHero(career, picked.rival.id, picked.offer.hero.id);
        career = step.career;
        report(step.events);
      } catch (error) {
        if (error instanceof EngineError) {
          tell(errorSentence(error.code, { hero: picked.offer.hero.name }));
        } else throw error;
      }
      // The view stays open: one keypress closes it whatever happened.
      continue;
    }
  };

  /** Put a Party together for one Commission and send it. */
  const sendParty = async (commission: Commission): Promise<boolean> => {
    const chosen: string[] = [];
    for (;;) {
      const refusals = whoRefuses(commission, chosen);
      if (!options.quiet) {
        out('\n');
        say(selectionLines(career, commission, chosen, width));
        say(refusalLines(career, refusals, width, content));
        say(keyHints(['[a-l] toggle a Hero', '[Enter] send them', '[q] back'], width));
      }
      const line = await prompter.ask('send> ');
      if (line === undefined) return false;
      const selection = parseSelection(line);

      if (selection.kind === 'cancel') return true;
      if (selection.kind === 'unknown') {
        tell(`"${selection.text}" is not a Hero. Letters a to l, Enter to send, q to go back.`);
        continue;
      }
      if (selection.kind === 'toggle') {
        for (const letter of selection.letters) {
          const hero = career.guild.roster[ROSTER_LETTERS.indexOf(letter)];
          if (hero === undefined) {
            tell(`Nobody is lettered ${letter}.`);
            continue;
          }
          const at = chosen.indexOf(hero.id);
          if (at >= 0) chosen.splice(at, 1);
          else chosen.push(hero.id);
        }
        continue;
      }

      // Enter with refusals outstanding never sends anybody: it states the price and
      // waits for a second keypress that accepts it (E2-S5).
      let insist = false;
      if (refusals.length > 0) {
        say(insistenceLines(career, refusals, width));
        const answer = await prompter.ask('insist> ');
        if (answer === undefined) return false;
        if (answer.trim().toLowerCase() !== 'i') {
          tell('Nobody was sent.');
          continue;
        }
        insist = true;
      }

      try {
        const step = commitParty(career, commission.id, chosen, content, { insist });
        career = step.career;
        report(step.events);
      } catch (error) {
        if (error instanceof EngineError) tell(errorSentence(error.code));
        else throw error;
      }
      return true;
    }
  };

  /** Answer a Party that has sent word. A number picks an option, counted through them all. */
  const answerTheWord = async (index: number): Promise<boolean> => {
    const numbered = wordOffers(career, content).flatMap((offer) =>
      offer.options.map((option) => ({ offer, option })),
    );
    const chosen = numbered[index - 1];
    if (chosen === undefined) {
      tell(`There is nothing numbered ${index} to answer.`);
      return true;
    }
    const cost = chosen.option.cost ?? 0;
    // The words content authored for this option, which are the words the list above the
    // player prints. An option's id is an identifier and no sentence names one (E7-S5).
    const label =
      wordProse(chosen.offer, career, content).labels[chosen.option.id] ?? 'the option chosen';
    if (cost > 0) {
      // Coin leaving the Guild always takes a second keypress (DL-25 §3).
      const answer = await confirmed(wordConfirmLines(chosen.option, label, width), 'sure> ');
      if (!answer) {
        tell('They are left waiting.');
        return true;
      }
    }
    try {
      const step = answerParty(career, chosen.offer.partyId, chosen.option.id, content);
      career = step.career;
      report(step.events);
    } catch (error) {
      if (error instanceof EngineError) {
        tell(
          errorSentence(error.code, {
            detail: error.code === 'InsufficientCoin' ? coin(cost) : label,
          }),
        );
      } else throw error;
    }
    return true;
  };

  /**
   * The Word view (DL-26 §2): every waiting Party's prompt and its options whole, paged at
   * twenty rows like every other view (E7-S3), with a single keypress still answering —
   * which is what E6-S4 asks for and what the main screen's twenty-four rows cannot hold
   * for two Parties at once.
   */
  const readTheWord = async (): Promise<boolean> => {
    let page = 1;
    for (;;) {
      if (wordOffers(career, content).length === 0) {
        tell('Nobody is waiting on your word.');
        return true;
      }
      const shown = paginate(wordLines(career, width, content), page);
      page = shown.page;
      if (!options.quiet) {
        out('\n');
        say(shown.lines);
        say(keyHints(['[1-9] answer them', '[m] more', '[q] back'], width));
      }
      const line = await prompter.ask('word> ');
      if (line === undefined) return false;
      const choice = parseWordChoice(line);
      if (choice.kind === 'cancel') return true;
      if (choice.kind === 'more') {
        page = shown.page >= shown.pages ? 1 : shown.page + 1;
        continue;
      }
      if (choice.kind === 'unknown') {
        tell(`"${choice.text}" is not an answer. 1-9, m for more, or q to go back.`);
        continue;
      }
      if (!(await answerTheWord(choice.index))) return false;
      // The view stays open: another Party may be waiting behind this one.
      continue;
    }
  };

  /**
   * A Career that has ended is readable, shows its reckoning, and offers exactly two
   * things: begin again, or leave (E7-S4).
   */
  const readTheEnding = async (): Promise<boolean> => {
    const ended = career.ended;
    if (ended !== undefined && !endShown) {
      out('\n');
      say([
        'THE CAREER IS OVER',
        ...reckoningLines(ended.reckoning, career).flatMap((line) => wrapAt(line, width, 0)),
      ]);
      endShown = true;
    }
    if (deleteSlotForCareer(options.careerDir, AUTOSAVE_SLOT, career)) {
      tell('The autosave for this Career has been removed.');
    }
    say(['', ...keyHints(['[b] begin a new Career', '[q] quit'], width)]);
    const line = await prompter.ask('> ');
    if (line === undefined) return false;
    const choice = parseEndChoice(line);
    if (choice.kind === 'quit') return false;
    if (choice.kind === 'new') {
      newCareers += 1;
      slot = AUTOSAVE_SLOT;
      endShown = false;
      unsaved = true;
      const opened = openCareer(`${options.seed}-${newCareers + 1}`);
      career = opened.career;
      history = [];
      say(narrationLines(narrateEvents(opened.events, career, content), career, width));
      return true;
    }
    tell('There are two things left to do here: b for a new Career, or q to leave.');
    return true;
  };

  for (;;) {
    if (career.ended !== undefined) {
      if (!(await readTheEnding())) return 0;
      continue;
    }

    let plan: Screenful;
    try {
      plan = (io.layout ?? layOut)(career, width, content, history);
    } catch (error) {
      // A view that throws must not take the Career with it (E7 DoD).
      tell(`The screen could not be drawn: ${(error as Error).message}`);
      tell(`The Career is autosaved to ${autosave(target)}.`);
      return 1;
    }
    wordForm = plan.word;
    if (!options.quiet) {
      out('\n');
      say(plan.lines);
    }

    const line = await prompter.ask('> ');
    if (line === undefined) {
      // The input ran out. Nothing is lost by it.
      tell(`The Career is autosaved to ${autosave(target)}.`);
      return 0;
    }
    const command = parseCommand(line);
    // Anything but a second `n` in a row withdraws the offer to let the Days run.
    if (command.kind !== 'advance') lettingTheDaysRun = false;

    try {
      switch (command.kind) {
        case 'nothing':
          break;

        case 'pick': {
          // While a Party is waiting on word, a bare number answers them rather than
          // taking work off the Board: there is one thing to decide and it is theirs. It
          // answers only where the options are numbered in front of the player, though —
          // under the summary they are one keypress away and the hints say so (DL-26 §2).
          if (awaitingParties(career).length > 0) {
            if (wordForm === 'summary') {
              tell(
                'Their options are not on this screen. Press w to read what each of them ' +
                  'asks, and answer there.',
              );
              break;
            }
            if (!(await answerTheWord(command.index))) return 0;
            break;
          }
          const commission = career.board[command.index - 1];
          if (commission === undefined) {
            tell(`There is no Commission ${command.index} on the Board.`);
            break;
          }
          if (!(await sendParty(commission))) return 0;
          break;
        }

        case 'view':
          if (!(await readAView(command.view))) return 0;
          break;

        case 'applicants':
          if (!(await meetTheApplicants())) return 0;
          break;

        case 'rivals':
          if (!(await visitTheRivals())) return 0;
          break;

        case 'hall':
          if (!(await visitTheHall())) return 0;
          break;

        case 'word':
          if (!(await readTheWord())) return 0;
          break;

        case 'advance': {
          // The CLI refuses to advance while a Party is waiting: it says which Party, how
          // long they have waited and how long is left, and takes a **second** n before it
          // will let the Days run. `advance` called twice without this guard takes a
          // default for the player (E6-S4, DL-23 §3, DL-24).
          if (awaitingParties(career).length > 0 && !lettingTheDaysRun) {
            say(advanceRefusedLines(career, width, content));
            lettingTheDaysRun = true;
            break;
          }
          lettingTheDaysRun = false;
          const step = advanceUntilAttention(career, content);
          career = step.career;
          if (step.events.length === 0) tell('The Days pass and nothing wants you.');
          else report(step.events);
          break;
        }

        case 'save':
          try {
            saveSlot(
              options.careerDir,
              command.slot,
              career,
              history,
              new Date(io.clock()).toISOString(),
            );
            unsaved = false;
            slot = command.slot;
            tell(`Saved to slot "${command.slot}".`);
          } catch (error) {
            // A slot that cannot be written is an ordinary thing that happens to a file —
            // it is read-only, the disk is full, something else has it open — and not a
            // reason to end the session. The Career is still in hand and still autosaved
            // on the way out, so the player is told and goes on playing.
            tell(whyTheFileWouldNotDo(error, `save to slot "${command.slot}"`));
          }
          break;

        case 'list':
          say(slotLines(listSlots(options.careerDir), width));
          break;

        case 'load':
          try {
            const loaded = loadSlot(options.careerDir, command.slot, content);
            career = loaded.career;
            history = loaded.history;
            unsaved = false;
            endShown = false;
            slot = command.slot;
            tell(
              `Loaded slot "${command.slot}": ${career.guild.name}, ${formatDay(career.day, career)}.`,
            );
          } catch (error) {
            tell(whyTheFileWouldNotDo(error, `load slot "${command.slot}"`));
          }
          break;

        case 'delete':
          try {
            tell(
              deleteSlot(options.careerDir, command.slot)
                ? `Slot "${command.slot}" is gone.`
                : `There is nothing saved in slot "${command.slot}".`,
            );
          } catch (error) {
            tell(whyTheFileWouldNotDo(error, `delete slot "${command.slot}"`));
          }
          break;

        case 'help':
          say(helpLines(width));
          say(hintLines(career, width, wordForm));
          break;

        case 'quit': {
          // Nothing is lost by leaving: the autosave is written first, whatever else
          // happens. A named slot is never written without being asked (DL-25 §11).
          tell(`The Career is autosaved to ${autosave(target)}.`);
          if (slot !== AUTOSAVE_SLOT && unsaved) {
            if (await confirmed(quitConfirmLines(slot, width), 'sure> ')) {
              saveSlot(
                options.careerDir,
                slot,
                career,
                history,
                new Date(io.clock()).toISOString(),
              );
              tell(`Saved to slot "${slot}".`);
            }
          }
          return 0;
        }

        default:
          tell(`"${command.text}" is not a command. Press h for the list.`);
          break;
      }
    } catch (error) {
      // Anything unexpected, from any screen: the Career goes to the autosave before a
      // word is said about it (E7 DoD).
      tell(`Something went wrong: ${(error as Error).message}`);
      tell(`The Career is autosaved to ${autosave(target)}.`);
      return 1;
    }
  }
}

/** The program. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  // The one clock reading in the whole front end: the default seed and a slot's `savedOn`
  // are the only things allowed to know what time it is (E7 §4).
  const clock = (): number => Date.now();

  let options: Options;
  try {
    options = parseArgs(argv, { now: clock() });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    const out = writer();
    if (error.message !== 'help') out(`${error.message}\n\n`);
    out(`${USAGE}\n`);
    process.exitCode = error.message === 'help' ? 0 : 2;
    return;
  }

  const overrides: Partial<Screen> = {};
  if (options.width !== undefined) overrides.width = options.width;
  if (options.colour !== undefined) overrides.colour = options.colour;
  if (options.ascii !== undefined) overrides.ascii = options.ascii;
  // A scripted session is never a terminal, whatever stdout says.
  if (options.script !== undefined && options.colour === undefined) overrides.colour = false;
  const screen = detectScreen(thisTerminal(), overrides);

  const content = loadContentFromDisk();
  const out = writer();
  const prompter =
    options.script === undefined
      ? terminalPrompter()
      : scriptPrompter(options.script, (text) => {
          if (!options.quiet) out(text);
        });

  try {
    process.exitCode = await play(options, content, prompter, {
      out,
      clock,
      screen,
      onInterrupt: (handler) => {
        process.on('SIGINT', handler);
      },
    });
  } finally {
    prompter.close();
  }
}
