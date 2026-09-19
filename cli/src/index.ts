/**
 * The terminal front end (E1-S6, E1-S7). It owns the loop, the terminal and the files;
 * the rules are the engine's and the words are `narrate`'s.
 *
 * Architecture §9: show the Board, the Roster, the money and the two clocks; take a
 * command; call the engine; narrate what came back; repeat until the Career ends.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import {
  advanceUntilAttention,
  commitParty,
  EngineError,
  newCareer,
  SaveError,
  type Career,
  type Commission,
  type Content,
  type GameEvent,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import { errorSentence, formatDay, narrateEvents, reckoningLines } from '@heroesim/narrate';
import {
  ansiPalette,
  helpLines,
  narrationLines,
  plainPalette,
  screenLines,
  selectionLines,
  slotLines,
  type Palette,
} from './display.js';
import {
  parseArgs,
  parseCommand,
  parseSelection,
  ROSTER_LETTERS,
  USAGE,
  UsageError,
  type Options,
} from './input.js';
import {
  AUTOSAVE_SLOT,
  deleteSlot,
  deleteSlotForCareer,
  listSlots,
  loadSlot,
  saveSlot,
} from './saves.js';

/** How the loop asks for the next line. A script and a terminal both satisfy it. */
interface Prompter {
  /** The next line, or undefined when there is no more input. */
  ask(prompt: string): Promise<string | undefined>;
  close(): void;
}

/** How many decisions the screen remembers. */
const DECISIONS_KEPT = 5;

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

function terminalPrompter(): Prompter {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: async (prompt) => {
      try {
        return await rl.question(prompt);
      } catch {
        return undefined;
      }
    },
    close: () => rl.close(),
  };
}

/** One playing session: the Career, what has been done to it, and the terminal. */
async function play(options: Options, content: Content, prompter: Prompter): Promise<void> {
  const palette: Palette = options.colour ? ansiPalette : plainPalette;
  const out = (text: string): void => {
    process.stdout.write(text);
  };
  const say = (lines: readonly string[]): void => {
    if (lines.length > 0) out(`${lines.join('\n')}\n`);
  };

  let career: Career;
  if (options.slot !== undefined) {
    career = loadSlot(options.careerDir, options.slot);
    say([`Loaded slot "${options.slot}": ${career.guild.name}, ${formatDay(career.day, career)}.`]);
  } else {
    const opened = newCareer(
      options.seed,
      content,
      options.years === undefined ? undefined : { careerYears: options.years },
    );
    career = opened.career;
    say(narrationLines(narrateEvents(opened.events, career, content), career, palette));
  }

  const decisions: string[] = [];
  /** A brand-new Career is unsaved from the first Day; a loaded one matches its slot. */
  let unsaved = options.slot === undefined;
  let endShown = false;

  const remember = (text: string): void => {
    decisions.push(`${formatDay(career.day, career)}  ${text}`);
    while (decisions.length > DECISIONS_KEPT) decisions.shift();
  };

  /** Narrate a step, remember what came of it, and note that the Career moved on. */
  const report = (events: readonly GameEvent[]): void => {
    const paragraphs = narrateEvents(events, career, content);
    const lines = narrationLines(paragraphs, career, palette);
    if (lines.length > 0) out('\n');
    say(lines);
    if (paragraphs.some((entry) => entry.kind === 'end')) endShown = true;
    for (const event of events) {
      if (event.type !== 'PartyReturned') continue;
      const title = career.recentCommissions.find((entry) => entry.id === event.commissionId)?.title;
      remember(
        `${title ?? 'work'} ${event.succeeded ? 'finished' : 'was not finished'}` +
          `${event.feePaid > 0 ? ` (+${event.feePaid} coin)` : ''}`,
      );
    }
    unsaved = true;
  };

  /** Put a Party together for one Commission and send it. */
  const sendParty = async (commission: Commission): Promise<boolean> => {
    const chosen: string[] = [];
    for (;;) {
      if (!options.quiet) {
        out('\n');
        say(selectionLines(career, commission, chosen, palette));
      }
      const line = await prompter.ask('send> ');
      if (line === undefined) return false;
      const selection = parseSelection(line);

      if (selection.kind === 'cancel') return true;
      if (selection.kind === 'unknown') {
        say([`"${selection.text}" is not a Hero. Letters a to l, Enter to send, q to go back.`]);
        continue;
      }
      if (selection.kind === 'toggle') {
        for (const letter of selection.letters) {
          const hero = career.guild.roster[ROSTER_LETTERS.indexOf(letter)];
          if (hero === undefined) {
            say([`Nobody is lettered ${letter}.`]);
            continue;
          }
          const at = chosen.indexOf(hero.id);
          if (at >= 0) chosen.splice(at, 1);
          else chosen.push(hero.id);
        }
        continue;
      }

      try {
        const step = commitParty(career, commission.id, chosen, content);
        career = step.career;
        const names = chosen
          .map((id) => career.guild.roster.find((hero) => hero.id === id)?.name ?? id)
          .join(', ');
        remember(`sent ${names} on ${commission.title}`);
        report(step.events);
      } catch (error) {
        if (error instanceof EngineError) say([errorSentence(error.code)]);
        else throw error;
      }
      return true;
    }
  };

  for (;;) {
    if (career.ended !== undefined) {
      if (!endShown) {
        out('\n');
        say([
          palette.heading('The Career is over.'),
          ...reckoningLines(career.ended.reckoning, career),
        ]);
      }
      if (deleteSlotForCareer(options.careerDir, AUTOSAVE_SLOT, career)) {
        say([`The autosave for this Career has been removed.`]);
      }
      return;
    }

    if (!options.quiet) {
      out('\n');
      say(screenLines(career, content, decisions, palette));
    }

    const line = await prompter.ask('> ');
    if (line === undefined) return;
    const command = parseCommand(line);

    switch (command.kind) {
      case 'nothing':
        break;

      case 'pick': {
        const commission = career.board[command.index - 1];
        if (commission === undefined) {
          say([`There is no Commission ${command.index} on the Board.`]);
          break;
        }
        if (!(await sendParty(commission))) return;
        break;
      }

      case 'advance': {
        const step = advanceUntilAttention(career, content);
        career = step.career;
        if (step.events.length === 0) say(['The Days pass and nothing wants you.']);
        else report(step.events);
        break;
      }

      case 'save':
        try {
          saveSlot(options.careerDir, command.slot, career);
          unsaved = false;
          remember(`saved to "${command.slot}"`);
          say([`Saved to slot "${command.slot}".`]);
        } catch (error) {
          if (error instanceof SaveError) say([error.message]);
          else throw error;
        }
        break;

      case 'list':
        say(slotLines(listSlots(options.careerDir), palette));
        break;

      case 'load':
        try {
          career = loadSlot(options.careerDir, command.slot);
          unsaved = false;
          endShown = false;
          decisions.length = 0;
          say([
            `Loaded slot "${command.slot}": ${career.guild.name}, ${formatDay(career.day, career)}.`,
          ]);
        } catch (error) {
          if (error instanceof SaveError) say([error.message]);
          else throw error;
        }
        break;

      case 'delete':
        try {
          say([
            deleteSlot(options.careerDir, command.slot)
              ? `Slot "${command.slot}" is gone.`
              : `There is nothing saved in slot "${command.slot}".`,
          ]);
        } catch (error) {
          if (error instanceof SaveError) say([error.message]);
          else throw error;
        }
        break;

      case 'help':
        say(helpLines(palette));
        break;

      case 'quit': {
        if (!unsaved) return;
        const answer = await prompter.ask('Nothing has been saved since the last change. Leave anyway? (y/n) ');
        if (answer === undefined || answer.trim().toLowerCase().startsWith('y')) return;
        break;
      }

      default:
        say([`"${command.text}" is not a command. Press h for the list.`]);
        break;
    }
  }
}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2), {
      now: Date.now(),
      isTty: process.stdout.isTTY === true,
    });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    if (error.message !== 'help') process.stdout.write(`${error.message}\n\n`);
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = error.message === 'help' ? 0 : 2;
    return;
  }

  const content = loadContentFromDisk();
  const prompter =
    options.script === undefined
      ? terminalPrompter()
      : scriptPrompter(options.script, (text) => {
          if (!options.quiet) process.stdout.write(text);
        });

  try {
    await play(options, content, prompter);
  } finally {
    prompter.close();
  }
}

await main();
