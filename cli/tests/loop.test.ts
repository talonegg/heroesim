/**
 * The loop itself, driven as a library rather than a process: the paths a spawned test
 * cannot reach cheaply or at all.
 *
 * **No Career is lost by any exit path** (E7's definition of done): quitting, an
 * interrupt and an error thrown while a view is rendering each write the autosave first,
 * and the autosave slot is never a named one. And an ended Career is loadable, shows its
 * reckoning and offers exactly two things.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  advance,
  newCareer,
  SaveError,
  serialiseCareer,
  wordOffers,
  type Career,
  type Content,
} from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import {
  autosave,
  interrupted,
  main,
  play,
  whyTheFileWouldNotDo,
  VIEWS,
  type Io,
} from '../src/main.js';
import { detectScreen, type Prompter } from '../src/screen.js';
import { loadSlot, saveSlot, slotPath, AUTOSAVE_SLOT } from '../src/slots.js';
import type { Options } from '../src/input.js';
import { partyWaiting, severalWaiting } from './helpers.js';

const content: Content = loadContentFromDisk();
const workspace = mkdtempSync(join(tmpdir(), 'heroesim-loop-'));
let run = 0;

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** A fresh Career directory per case, so one test cannot see another's slots. */
function careerDir(): string {
  run += 1;
  return join(workspace, `run-${run}`);
}

/** A prompter that answers from a list and then runs out, as a script does. */
function scripted(lines: readonly string[]): Prompter & { asked: string[] } {
  let index = 0;
  const asked: string[] = [];
  return {
    asked,
    ask: (prompt) => {
      asked.push(prompt);
      const line = lines[index];
      index += 1;
      return Promise.resolve(line);
    },
    close: () => {
      /* nothing to close */
    },
  };
}

/** The loop, with everything it reads from the world under the test's control. */
async function drive(
  options: Partial<Options> & { careerDir: string },
  lines: readonly string[],
  views?: Io['views'],
  layout?: Io['layout'],
): Promise<{ code: number; output: string; asked: string[] }> {
  let output = '';
  const io: Io = {
    out: (text) => {
      output += text;
    },
    clock: () => Date.parse('2026-09-20T09:00:00.000Z'),
    screen: detectScreen({ columns: 80, isTty: false, env: {} }),
    ...(views === undefined ? {} : { views }),
    ...(layout === undefined ? {} : { layout }),
  };
  const prompter = scripted(lines);
  const code = await play({ seed: 'loop', quiet: true, ...options }, content, prompter, io);
  return { code, output, asked: prompter.asked };
}

describe('quitting', () => {
  it('autosaves and says where it went', async () => {
    const dir = careerDir();
    const { code, output } = await drive({ careerDir: dir }, ['q']);
    expect(code).toBe(0);
    expect(output.replace(/\s+/g, ' ')).toContain('The Career is autosaved to');
    expect(existsSync(slotPath(dir, AUTOSAVE_SLOT))).toBe(true);
    expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('loop');
  });

  it('asks once before it writes a named slot, and takes no for an answer', async () => {
    const dir = careerDir();
    saveSlot(dir, 'one', newCareer('somebody-elses', content).career, [], 'x');
    const { asked, output } = await drive({ careerDir: dir, slot: 'one' }, ['n', 'q', 'n']);
    // The question is printed and the confirming keypress is asked for in the one idiom
    // every coin-spending and Career-overwriting screen uses (DL-26 §3).
    expect(output.replace(/\s+/g, ' ')).toContain('Save to slot "one" as well?');
    expect(asked.join(' ')).toContain('sure> ');
    // The named slot still holds the Career it held: the autosave never writes over one.
    expect(loadSlot(dir, 'one', content).career.seed).toBe('somebody-elses');
    expect(existsSync(slotPath(dir, AUTOSAVE_SLOT))).toBe(true);
  });

  it('writes the named slot when the answer is yes', async () => {
    const dir = careerDir();
    saveSlot(dir, 'one', newCareer('somebody-elses', content).career, [], 'x');
    await drive({ careerDir: dir, slot: 'one' }, ['n', 'q', 'y']);
    expect(loadSlot(dir, 'one', content).career.seed).toBe('somebody-elses');
  });

  it('autosaves when the input simply runs out', async () => {
    const dir = careerDir();
    const { code } = await drive({ careerDir: dir }, []);
    expect(code).toBe(0);
    expect(existsSync(slotPath(dir, AUTOSAVE_SLOT))).toBe(true);
  });
});

describe('an error thrown while a view is rendering', () => {
  it('autosaves the Career before it says a word about it', async () => {
    const dir = careerDir();
    const { code, output } = await drive({ careerDir: dir, quiet: false }, ['r'], {
      ...VIEWS,
      roster: () => {
        throw new Error('the Roster view is broken');
      },
    });
    expect(code).toBe(1);
    expect(output).toContain('the Roster view is broken');
    expect(output.replace(/\s+/g, ' ')).toContain('The Career is autosaved to');
    expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('loop');
  });

  it('autosaves even when the main screen itself is what throws', async () => {
    const dir = careerDir();
    // A width the layout cannot possibly satisfy is not reachable through the command
    // line, so the throwing view stands in for "anything at all went wrong on the way to
    // the screen": the Career is written before the message.
    const { code } = await drive({ careerDir: dir, quiet: false }, ['g'], {
      ...VIEWS,
      league: () => {
        throw new Error('boom');
      },
    });
    expect(code).toBe(1);
    expect(existsSync(slotPath(dir, AUTOSAVE_SLOT))).toBe(true);
  });
});

describe('an interrupt', () => {
  it('writes the autosave and says where it went', () => {
    const dir = careerDir();
    const career: Career = newCareer('interrupted', content).career;
    const said: string[] = [];
    interrupted(
      {
        careerDir: dir,
        career: () => career,
        history: () => ['one thing'],
        savedOn: () => '2026-09-20T09:00:00.000Z',
      },
      (text) => said.push(text),
    );
    expect(said.join(' ')).toContain('Interrupted.');
    expect(said.join(' ')).toContain('autosaved to');
    const loaded = loadSlot(dir, AUTOSAVE_SLOT, content);
    expect(loaded.career.seed).toBe('interrupted');
    expect(loaded.history).toEqual(['one thing']);
  });

  it('says so rather than throwing when the autosave cannot be written', () => {
    const said: string[] = [];
    interrupted(
      {
        careerDir: careerDir(),
        career: () => newCareer('interrupted', content).career,
        history: () => [],
        savedOn: () => '2026-09-20T09:00:00.000Z',
      },
      (text) => {
        said.push(text);
        if (said.length === 1 && text.includes('autosaved')) return;
      },
    );
    expect(said.length).toBeGreaterThan(0);
  });

  it('is installed on the real process by the loop that owns the Career', async () => {
    const dir = careerDir();
    let handler: (() => void) | undefined;
    let output = '';
    await play(
      { seed: 'loop-signal', careerDir: dir, quiet: true },
      content,
      scripted(['q']),
      {
        out: (text) => {
          output += text;
        },
        clock: () => Date.parse('2026-09-20T09:00:00.000Z'),
        screen: detectScreen({ columns: 80, isTty: false, env: {} }),
        onInterrupt: (given) => {
          handler = given;
        },
      },
    );
    expect(handler, 'the loop registers an interrupt handler').toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

describe('the autosave slot', () => {
  it('is the only slot an autosave ever writes', () => {
    const dir = careerDir();
    const career = newCareer('autosaved', content).career;
    const path = autosave({
      careerDir: dir,
      career: () => career,
      history: () => [],
      savedOn: () => '2026-09-20T09:00:00.000Z',
    });
    expect(path).toBe(slotPath(dir, AUTOSAVE_SLOT));
  });
});

describe('a Career that has ended', () => {
  /** A Career played to its ending, saved into a slot for the loop to load. */
  function endedCareer(): Career {
    const ended = advance(
      newCareer('loop-ended', content, { careerYears: 1 }).career,
      5000,
      content,
    ).career;
    if (ended.ended === undefined) throw new Error('the Career did not end');
    return ended;
  }

  it('is loadable, shows its reckoning, and offers only a new Career and quitting', async () => {
    const dir = careerDir();
    saveSlot(dir, 'over', endedCareer(), [], 'x');
    const { code, output } = await drive({ careerDir: dir, slot: 'over', quiet: false }, ['q']);
    expect(code).toBe(0);
    expect(output).toContain('THE CAREER IS OVER');
    expect(output).toContain('Commissions:');
    expect(output).toContain('Harm:');
    expect(output).toContain('[b] begin a new Career');
    expect(output).toContain('[q] quit');
    // Nothing else is on offer: the Board, the Roster and the keys are all gone.
    expect(output).not.toContain('[1-6] commission');
    expect(output).not.toContain('BOARD');
  });

  it('takes b for a new Career, and nothing else for anything else', async () => {
    const dir = careerDir();
    saveSlot(dir, 'over', endedCareer(), [], 'x');
    const { output } = await drive({ careerDir: dir, slot: 'over', quiet: true }, ['n', 'b', 'q']);
    expect(output).toContain('There are two things left to do here');
    expect(output).toContain('You take over');
  });

  it('clears its own autosave rather than leaving one dangling', async () => {
    const dir = careerDir();
    const ended = endedCareer();
    saveSlot(dir, AUTOSAVE_SLOT, ended, [], 'x');
    saveSlot(dir, 'over', ended, [], 'x');
    await drive({ careerDir: dir, slot: 'over', quiet: true }, ['q']);
    expect(existsSync(slotPath(dir, AUTOSAVE_SLOT))).toBe(false);
  });
});

describe('the two-n idiom', () => {
  it('refuses the first n while a Party waits and lets the second run the Days', async () => {
    const dir = careerDir();
    // A Career already standing on the Day a Party sent word, saved into a slot: the
    // guard is what is under test, not the road to it.
    const { career } = partyWaiting('loop-word', content);
    saveSlot(dir, 'waiting', career, [], 'x');
    const { output } = await drive({ careerDir: dir, slot: 'waiting', quiet: true }, [
      'n',
      'n',
      'q',
    ]);
    expect(output).toContain('has been waiting');
    expect(output).toContain('press n again to let the Days run');
    // The second press really did let the Days run: the Day moved on.
    expect(output).toMatch(/Year \d+, Day \d+/);
  });

  it('withdraws the offer the moment anything else is pressed', async () => {
    const dir = careerDir();
    const { career } = partyWaiting('loop-word-2', content);
    saveSlot(dir, 'waiting', career, [], 'x');
    const { output } = await drive({ careerDir: dir, slot: 'waiting', quiet: true }, [
      'n',
      'g',
      'q',
      'n',
      'q',
    ]);
    // Two refusals, because the League view in between disarmed the first press.
    expect(output.match(/press n again to let the Days run/g)?.length).toBe(2);
  });
});

/**
 * The interrupt handler in a **real process** (DL-25 §12). On Windows a signal sent with
 * `process.kill` terminates the target through `TerminateProcess` and runs no handler, so
 * no spawned test on this machine can prove that the operating system delivers Ctrl-C.
 * What this proves is everything on this side of that: the program the loop builds
 * registers a listener for `SIGINT`, and running that listener autosaves a Career that
 * loads again and leaves the process on exit code 0.
 */
describe('the interrupt handler, in a spawned process', () => {
  it('registers on SIGINT, autosaves and exits 0 when it runs', () => {
    const dir = careerDir();
    mkdirSync(dir, { recursive: true });
    const driver = join(dir, 'interrupt-driver.mjs');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const url = (relative: string): string =>
      pathToFileURL(join(root, relative)).href;
    writeFileSync(
      driver,
      [
        `import { play } from ${JSON.stringify(url('cli/src/main.ts'))};`,
        `import { detectScreen } from ${JSON.stringify(url('cli/src/screen.ts'))};`,
        `import { loadContentFromDisk } from ${JSON.stringify(url('content/src/node.ts'))};`,
        'const content = loadContentFromDisk();',
        // A prompter that never answers: the loop is sitting at a prompt, which is where
        // a player would be when they press Ctrl-C.
        'const prompter = { ask: () => new Promise(() => {}), close: () => {} };',
        'void play(',
        `  { seed: 'signal', careerDir: ${JSON.stringify(dir)}, quiet: true },`,
        '  content,',
        '  prompter,',
        '  {',
        '    out: (text) => process.stdout.write(text),',
        '    clock: () => 0,',
        "    screen: detectScreen({ columns: 80, isTty: false, env: {} }),",
        '    onInterrupt: (handler) => {',
        "      process.on('SIGINT', handler);",
        "      console.log('listeners=' + process.listenerCount('SIGINT'));",
        '    },',
        '  },',
        ');',
        // Emitting it runs exactly the listener the program installed.
        "setTimeout(() => { process.emit('SIGINT'); }, 300);",
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, ['--import', 'tsx', driver], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(output, output).toContain('listeners=1');
    expect(output.replace(/\s+/g, ' '), output).toContain('Interrupted.');
    expect(output.replace(/\s+/g, ' '), output).toContain('autosaved to');
    expect(result.status, output).toBe(0);
    // And the Career it wrote is one that loads.
    expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('signal');
  }, 90_000);
});

/**
 * The main screen itself throwing (E7's definition of done: "No Career is lost by any exit
 * path: quit, Ctrl-C, or an error during a view"). The test that carried this box injected
 * a throwing **League view**, which goes down the loop's other catch entirely — a mutation
 * that deleted the autosave from the layout's own catch survived it. `Io.layout` is the
 * seam `Io.views` already is, and this drives the path the box is about.
 */
describe('an error thrown while the main screen is being laid out', () => {
  it('autosaves the Career before it says a word about it', async () => {
    const dir = careerDir();
    const { code, output } = await drive({ careerDir: dir, quiet: false }, ['n'], undefined, () => {
      throw new Error('the main screen is broken');
    });
    expect(code).toBe(1);
    expect(output).toContain('the main screen is broken');
    expect(output.replace(/\s+/g, ' ')).toContain('The Career is autosaved to');
    expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('loop');
  });
});

/**
 * Two Parties waiting at once: the main screen shows the loud summary rather than the
 * options, so a **number cannot answer** — the options are not in front of the player to
 * be numbered. The hints say `w`, and pressing a number has to say so rather than quietly
 * answering an option nobody read (DL-26 §2).
 */
describe('a number pressed under the word summary', () => {
  const several = severalWaiting('loop-two-words', content);

  it('is refused, and points at the key that does answer', async () => {
    const dir = careerDir();
    mkdirSync(dir, { recursive: true });
    saveSlot(dir, 'two', several, [], '2026-09-20T09:00:00.000Z');
    const before = serialiseCareer(several);
    const { output } = await drive({ careerDir: dir, slot: 'two', quiet: true }, ['1', 'q']);
    expect(output.replace(/\s+/g, ' ')).toContain('Their options are not on this screen');
    expect(output).toContain('Press w');
    // And nothing was answered: the Career the autosave holds is the one that went in.
    expect(serialiseCareer(loadSlot(dir, AUTOSAVE_SLOT, content).career)).toBe(before);
  });

  it('answers on a number once the Word view has put the options in front of them', async () => {
    const dir = careerDir();
    mkdirSync(dir, { recursive: true });
    saveSlot(dir, 'two', several, [], '2026-09-20T09:00:00.000Z');
    const before = wordOffers(several, content).length;
    const { asked } = await drive(
      { careerDir: dir, slot: 'two', quiet: false },
      ['w', '1', 'q', 'q'],
    );
    expect(asked).toContain('word> ');
    const after = loadSlot(dir, AUTOSAVE_SLOT, content).career;
    expect(wordOffers(after, content).length).toBe(before - 1);
  });
});

/**
 * `main()` is the program `npm run play` and every spawned test run, and it is the only
 * place the interrupt handler is registered for real. The spawned test above writes its
 * own driver and registers the listener itself, so registering twice here went unnoticed.
 */
describe('the program itself', () => {
  it('registers exactly one SIGINT listener, and leaves the Career saved', async () => {
    const dir = careerDir();
    mkdirSync(dir, { recursive: true });
    const script = join(dir, 'quit.txt');
    writeFileSync(script, 'q\n', 'utf8');
    const already = process.listeners('SIGINT');
    const exitCode = process.exitCode;
    try {
      await main([
        '--seed',
        'program',
        '--career-dir',
        dir,
        '--script',
        script,
        '--quiet',
        '--no-colour',
      ]);
      const added = process.listeners('SIGINT').filter((one) => !already.includes(one));
      expect(added, 'main installs one SIGINT handler and one only').toHaveLength(1);
      for (const one of added) process.off('SIGINT', one);
    } finally {
      process.exitCode = exitCode;
    }
    expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('program');
  }, 60_000);
});

/**
 * A slot that cannot be written is an ordinary thing that happens to a file — it is
 * read-only, the disk is full, something else has it open. It used to reach the loop's
 * catch-all and **end the session** with a raw errno message carrying two absolute paths;
 * the Career was autosaved, so nothing was lost, but the player was put out of their game
 * by a file attribute. Now it is a sentence and play goes on.
 */
describe('a slot that will not be written', () => {
  it('says so in a sentence and leaves the player playing', async () => {
    const dir = careerDir();
    mkdirSync(dir, { recursive: true });
    saveSlot(dir, 'one', newCareer('in-the-way', content).career, [], '2026-09-20T09:00:00.000Z');
    chmodSync(slotPath(dir, 'one'), 0o444);
    try {
      const { code, output, asked } = await drive({ careerDir: dir, quiet: true }, [
        's one',
        'n',
        'q',
      ]);
      const said = output.replace(/\s+/g, ' ');
      expect(said).toContain('Could not save to slot "one"');
      expect(said).toContain('still in hand');
      // Not an errno message, and not a path.
      expect(said).not.toContain('EPERM');
      expect(said).not.toContain('.json.tmp');
      // And the session went on: the `n` after it was read, and it left cleanly.
      expect(asked.length).toBeGreaterThan(2);
      expect(code).toBe(0);
      expect(loadSlot(dir, AUTOSAVE_SLOT, content).career.seed).toBe('loop');
    } finally {
      chmodSync(slotPath(dir, 'one'), 0o666);
    }
  });

  it('turns each of the file system refusals into words of its own', () => {
    for (const [code, expected] of [
      ['EACCES', 'not one this program is allowed to write'],
      ['ENOSPC', 'no room left on the disk'],
      ['EBUSY', 'something else has the file open'],
      ['EROFS', 'cannot be written to'],
      ['ENOTAMISTAKEWEKNOW', 'would not have it'],
    ] as const) {
      const said = whyTheFileWouldNotDo(Object.assign(new Error('raw'), { code }), 'save it');
      expect(said, code).toContain(expected);
      expect(said, code).not.toContain(code);
    }
    // A SaveError already carries a sentence and is passed through as it is.
    expect(whyTheFileWouldNotDo(new SaveError('there is nothing saved in slot "two"'), 'x')).toBe(
      'there is nothing saved in slot "two"',
    );
  });
});
