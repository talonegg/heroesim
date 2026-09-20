/**
 * The end-to-end test (DL-04), and **E7's gate**: the real process, driven by a script,
 * played to an ending, quit mid-Career, resumed from the autosave and carried on to the
 * very same Career byte for byte, and read at 40 columns.
 *
 * It spawns Node directly with tsx as an import hook rather than going through a shell,
 * which is what makes it behave the same on Windows as anywhere else.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const entry = join(root, 'cli', 'src', 'index.ts');
const workspace = mkdtempSync(join(tmpdir(), 'heroesim-e2e-'));
const careerDir = join(workspace, '.career');

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function script(name: string, lines: readonly string[]): string {
  const path = join(workspace, name);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  return path;
}

function play(args: readonly string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Every line the run printed, with nothing over the width and nothing cut short. */
function expectEveryLineFits(output: string, width: number): void {
  for (const line of output.split(/\r?\n/)) {
    expect(line.trimEnd().length, line).toBeLessThanOrEqual(width);
    expect(line.includes('...'), `cut short: ${line}`).toBe(false);
  }
}

/** The Career a slot holds, as the exact string the engine serialised. */
function careerIn(dir: string, slot: string): string {
  const raw = JSON.parse(readFileSync(join(dir, `${slot}.json`), 'utf8')) as { career: string };
  return raw.career;
}

const first = play([
  '--seed',
  'e2e',
  '--years',
  '1',
  '--career-dir',
  careerDir,
  '--script',
  // Take the first Commission, send two Heroes, let the Days run, save twice, leave.
  script('first.txt', ['1', 'a', 'b', '', 'n', 'n', 'n', 'n', 's', 's one', 'q']),
  '--no-colour',
]);

const second = play([
  '--career-dir',
  careerDir,
  '--slot',
  'one',
  '--script',
  script('second.txt', [...Array.from({ length: 400 }, () => 'n'), 'q']),
  '--no-colour',
]);

describe('a scripted Career, played twice', () => {
  it('runs both times without failing', () => {
    expect(first.status, first.output.slice(-2000)).toBe(0);
    expect(second.status, second.output.slice(-2000)).toBe(0);
  });

  it('shows the Board, sends a Party and narrates what happened', () => {
    expect(first.output).toContain('BOARD');
    expect(first.output).toContain('set out on');
    expect(first.output).toContain('Saved to slot "one".');
  });

  it('wrote the save the first run asked for', () => {
    expect(existsSync(join(careerDir, 'one.json'))).toBe(true);
  });

  it('carried the Career on from the save rather than starting a new one', () => {
    expect(second.output).toContain('Loaded slot "one"');
  });

  it('reaches the end of the Career and prints the reckoning', () => {
    expect(second.output).toContain('Commissions:');
    expect(second.output).toContain('Standing:');
    expect(second.output).toContain('Coin:');
    expect(second.output).toMatch(/(retires on Year|cannot meet its Upkeep)/);
  });

  it('says what the harm came to, counting Injuries and not people', () => {
    expect(second.output).toMatch(/Harm: \d+ (Injury|Injuries) and \d+ (Scar|Scars) between them\./);
    expect(second.output).not.toMatch(/\d+ Heroes injured/);
  });

  it('offers only a new Career and quitting once it is over', () => {
    const ending = second.output.slice(second.output.indexOf('Standing:'));
    expect(ending).toContain('[b] begin a new Career');
    expect(ending).toContain('[q] quit');
    expect(ending).toContain('There are two things left to do here');
    // And `n`, which everywhere else lets the Days run, does not begin one by accident.
    expect(ending).not.toContain('You take over');
  });

  it('leaves no dangling autosave for a Career that has ended', () => {
    expect(existsSync(join(careerDir, 'autosave.json'))).toBe(false);
    expect(existsSync(join(careerDir, 'one.json'))).toBe(true);
    expect(second.output).toContain('The autosave for this Career has been removed.');
  });

  it('names the Heroes the player was given', () => {
    const saved = JSON.parse(careerIn(careerDir, 'one')) as {
      guild: { roster: { name: string }[] };
    };
    const names = saved.guild.roster.map((hero) => hero.name);
    expect(names.length).toBeGreaterThan(0);
    const together = `${first.output}\n${second.output}`;
    expect(names.some((name) => together.includes(name))).toBe(true);
  });

  it('keeps every line it printed inside 80 columns', () => {
    expectEveryLineFits(first.output, 80);
  });
});

describe('--quiet', () => {
  const quiet = play([
    '--seed',
    'e2e-quiet',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.quiet'),
    '--script',
    script('quiet.txt', ['n', 'n', 'q']),
    '--quiet',
    '--no-colour',
  ]);

  it('leaves out the screen redraw and keeps the narration', () => {
    expect(quiet.status, quiet.output.slice(-2000)).toBe(0);
    expect(quiet.output).not.toContain('[1-6] commission');
    expect(quiet.output).not.toContain('BOARD');
    expect(quiet.output).toMatch(/Year 1, Day \d+/);
  });
});

/**
 * E2-S5: the commit screen shows who will not go and why, and sending them anyway takes a
 * second keypress. `--config refusalRegardThreshold=5` puts the threshold above every
 * starting Regard, so that every Hero in this Career refuses.
 */
describe('a Roster that will not go', () => {
  const insisted = play([
    '--seed',
    'e2e-refusals',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.refusals'),
    '--config',
    'refusalRegardThreshold=5',
    '--script',
    script('insisted.txt', ['1', 'a', '', 'i', 'n', 'q']),
    '--no-colour',
  ]);

  const declined = play([
    '--seed',
    'e2e-refusals',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.declined'),
    '--config',
    'refusalRegardThreshold=5',
    '--script',
    script('declined.txt', ['1', 'a', '', 'x', 'q', 'q']),
    '--no-colour',
  ]);

  it('runs both times without failing', () => {
    expect(insisted.status, insisted.output.slice(-2000)).toBe(0);
    expect(declined.status, declined.output.slice(-2000)).toBe(0);
  });

  it('shows who will not go, with the reason, before anything is paid', () => {
    expect(insisted.output).toContain('WHO WILL NOT GO');
    expect(insisted.output).toContain('Regard for you stands at');
    expect(insisted.output).toContain('will not go. Insisting costs each of them 2 Regard');
    expect(insisted.output).toContain('[i] insist and send them');
  });

  it('sends nobody on the Enter that reaches the refusal, and asks a second time', () => {
    const askedAt = insisted.output.indexOf('insist> ');
    const sentAt = insisted.output.indexOf('set out on');
    expect(askedAt).toBeGreaterThan(-1);
    expect(sentAt).toBeGreaterThan(askedAt);
  });

  it('sends nobody at all when the second keypress is anything else', () => {
    expect(declined.output).toContain('insist> x');
    expect(declined.output).toContain('Nobody was sent.');
    expect(declined.output).not.toContain('set out on');
  });

  it('says nothing about refusals in a Career where nobody refuses', () => {
    expect(first.output).not.toContain('WHO WILL NOT GO');
    expect(first.output).not.toContain('insist> ');
  });

  it('keeps every line it printed inside 80 columns', () => {
    expectEveryLineFits(insisted.output, 80);
  });

  it('refuses a --config key the game has no tunable for', () => {
    const wrong = play(['--config', 'refusalThreshold=5', '--seed', 'x']);
    expect(wrong.status).toBe(2);
    expect(wrong.output).toContain('refusalThreshold');
  });
});

/**
 * E3-S4 and DL-25 §3: the Hall is offered from the main screen, buying takes a confirming
 * keypress because it spends coin, and the engine decides whether it can be bought.
 */
describe('the Hall from the main screen', () => {
  const bought = play([
    '--seed',
    'e2e-hall',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.hall'),
    '--config',
    'startingCoin=1000',
    '--script',
    // Open the Hall, buy the infirmary and confirm; open it again, try to buy it twice.
    script('hall.txt', ['i', '1', 'y', 'i', '1', 'y', 'q', 'q']),
    '--no-colour',
  ]);

  const thoughtBetterOfIt = play([
    '--seed',
    'e2e-hall',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.hall-no'),
    '--config',
    'startingCoin=1000',
    '--script',
    script('hall-no.txt', ['i', '1', 'n', 'q', 'q']),
    '--no-colour',
  ]);

  const broke = play([
    '--seed',
    'e2e-hall-broke',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.hall-broke'),
    '--config',
    'startingCoin=10',
    '--script',
    script('hall-broke.txt', ['i', '1', 'y', 'q', 'q']),
    '--no-colour',
  ]);

  it('runs every time without failing', () => {
    expect(bought.status, bought.output.slice(-2000)).toBe(0);
    expect(broke.status, broke.output.slice(-2000)).toBe(0);
    expect(thoughtBetterOfIt.status, thoughtBetterOfIt.output.slice(-2000)).toBe(0);
  });

  it('offers the three improvements with a cost and an effect, nothing cut', () => {
    expect(bought.output).toContain('THE HALL');
    expect(bought.output).toMatch(/1 {2}Infirmary, \d+ coin/);
    expect(bought.output).toMatch(/2 {2}Training yard, \d+ coin/);
    expect(bought.output).toMatch(/3 {2}Quarters, \d+ coin/);
    expect(bought.output).toContain('hall> ');
  });

  it('asks a second time before the coin leaves the Guild (DL-25 section 3)', () => {
    expect(bought.output).toContain('sure> ');
    expect(bought.output).toMatch(/That costs \d+ coin, and the Guild holds/);
  });

  it('buys one, says what it cost, and then says it is already built', () => {
    expect(bought.output).toContain('The Hall has an infirmary at last');
    expect(bought.output).toContain('Already built.');
    expect(bought.output).toContain('The Hall already has that');
  });

  it('buys nothing when the second keypress is anything else', () => {
    expect(thoughtBetterOfIt.output).toContain('Nothing was bought.');
    expect(thoughtBetterOfIt.output).not.toContain('The Hall has an infirmary at last');
  });

  it('says plainly when the Guild cannot pay for it, and buys nothing', () => {
    expect(broke.output).toContain('coin short');
    expect(broke.output).toContain('The Guild cannot pay for that yet');
    expect(broke.output).not.toContain('The Hall has an infirmary at last');
  });

  it('keeps the size of the Roster on the main screen', () => {
    expect(bought.output).toContain('ROSTER');
    expect(bought.output).toMatch(/\d+ of \d+ places taken/);
  });

  it('keeps every line it printed inside 80 columns', () => {
    expectEveryLineFits(bought.output, 80);
    expectEveryLineFits(broke.output, 80);
  });
});

/**
 * E4-S2, E4-S3 and DL-25 §3 through the real process: the door opened from the main
 * screen, somebody taken on behind a confirming keypress, somebody sent away for free.
 */
describe('the Applicants from the main screen', () => {
  const took = play([
    '--seed',
    'e2e-applicants',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.applicants'),
    '--config',
    'startingCoin=1000',
    '--script',
    script('applicants.txt', ['n', 'a', '1', 'y', 'a', 'd 1', 'a', 'q', 'q']),
    '--no-colour',
  ]);

  const broke = play([
    '--seed',
    'e2e-applicants-broke',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.applicants-broke'),
    '--config',
    'startingCoin=10',
    '--script',
    script('applicants-broke.txt', ['n', 'a', '1', 'y', 'q', 'q']),
    '--no-colour',
  ]);

  it('runs both times without failing', () => {
    expect(took.status, took.output.slice(-2000)).toBe(0);
    expect(broke.status, broke.output.slice(-2000)).toBe(0);
  });

  it('cues the main screen and opens on a command', () => {
    expect(took.output).toContain('waiting for an answer');
    expect(took.output).toContain('[a] applicants');
    expect(took.output).toContain('applicants> ');
  });

  it('shows the Background and the Traits before the Stats, and never a calibre', () => {
    const view = took.output.slice(took.output.indexOf('applicants> ') - 2500);
    expect(view).toContain('Traits:');
    expect(view).toMatch(/Age \d+, Might \d+, Craft \d+, Nerve \d+, Guile \d+/);
    expect(view).toMatch(/Asks \d+ coin/);
    expect(took.output.toLowerCase()).not.toContain('calibre');
  });

  it('asks a second time, naming the fee and the Upkeep the place will cost', () => {
    expect(took.output).toMatch(/asks \d+ coin, and their place adds \d+ coin to every Upkeep/);
    expect(took.output).toContain('[y] take them on');
  });

  it('takes somebody on, and the narration says so', () => {
    expect(took.output).toContain('joins the Roster');
  });

  it('sends somebody away with no second keypress, because it costs nothing', () => {
    expect(took.output).toMatch(/You send .+ away/);
  });

  it('says plainly when the Guild cannot pay the asking fee, and takes nobody on', () => {
    expect(broke.output).toContain('The Guild cannot pay for that yet');
    expect(broke.output).not.toContain('joins the Roster');
  });

  it('keeps every line it printed inside 80 columns', () => {
    expectEveryLineFits(took.output, 80);
    expectEveryLineFits(broke.output, 80);
  });
});

describe('the other Guilds and the League from the main screen', () => {
  const flowed = (text: string): string => text.replace(/\s+/g, ' ');

  const dealt = play([
    '--seed',
    'e2e-rivals',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.rivals'),
    '--config',
    'startingCoin=5000',
    '--script',
    // Open the other Guilds, bring the first person over, look again, read the League.
    script('rivals.txt', ['o', 't 1', 'y', 'q', 'r', 'q', 'g', 'q', 'q']),
    '--no-colour',
  ]);

  const refused = play([
    '--seed',
    'e2e-rivals',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.rivals-broke'),
    '--config',
    'startingCoin=10',
    '--script',
    script('rivals-broke.txt', ['o', 't 1', 'y', 'q', 'q']),
    '--no-colour',
  ]);

  const thoughtBetterOfIt = play([
    '--seed',
    'e2e-rivals',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.rivals-no'),
    '--config',
    'startingCoin=5000',
    '--script',
    script('rivals-no.txt', ['o', 't 1', 'n', 'q', 'q']),
    '--no-colour',
  ]);

  it('runs all three times without failing', () => {
    expect(dealt.status, dealt.output.slice(-2000)).toBe(0);
    expect(refused.status, refused.output.slice(-2000)).toBe(0);
    expect(thoughtBetterOfIt.status, thoughtBetterOfIt.output.slice(-2000)).toBe(0);
  });

  it('offers the other Guilds and the League from the keys and the help', () => {
    expect(dealt.output).toContain('[o] other guilds');
    expect(dealt.output).toContain('[g] league');
    expect(dealt.output).toContain('rivals> ');
    expect(dealt.output).toContain('league> ');
  });

  it('shows each Guild’s Standing, its Regard for you and why it stands there', () => {
    expect(dealt.output).toContain('THE OTHER GUILDS');
    expect(dealt.output).toMatch(/Standing -?\d+, \d+ on their Roster, Regard for you [+-]?\d+/);
    expect(dealt.output).toContain('Regard: nothing has passed between you');
  });

  it('reads their people Background first and Stats second', () => {
    expect(dealt.output).toContain('Traits:');
    expect(dealt.output).toMatch(/Age \d+, Might \d+, Craft \d+, Nerve \d+, Guile \d+/);
    expect(flowed(dealt.output)).toMatch(/What they make of The .+ Guild: [+-]?\d+,/);
    const view = dealt.output.slice(
      dealt.output.indexOf('THE OTHER GUILDS'),
      dealt.output.indexOf('THE LEAGUE'),
    );
    expect(view.length).toBeGreaterThan(500);
    expect(view.toLowerCase()).not.toContain('calibre');
  });

  it('prints both fees and says in a sentence whether each move is possible now', () => {
    expect(dealt.output).toMatch(/Transfer for [\d,]+ coin: /);
    expect(dealt.output).toMatch(/Poach for [\d,]+ coin: /);
    expect(dealt.output).toContain('you can do this now');
    expect(dealt.output).toContain('they are content enough where they are');
  });

  it('asks a second time before any coin leaves the Guild, and takes no for an answer', () => {
    expect(thoughtBetterOfIt.output).toContain('sure> ');
    expect(thoughtBetterOfIt.output).toContain('They stay where they are.');
    expect(thoughtBetterOfIt.output).not.toContain('comes over from');
  });

  it('brings somebody over, and the narration says so once', () => {
    expect(flowed(dealt.output)).toMatch(/comes over from The .+ Guild at \d+, for \d+ coin/);
    expect(flowed(dealt.output)).toContain('nobody has been wronged by it');
    expect(dealt.output).toContain('you brought them over from another Guild');
  });

  it('says plainly when the Guild cannot pay, and nobody moves', () => {
    expect(flowed(refused.output)).toMatch(/the Guild is \d+ coin short/);
    expect(refused.output).not.toContain('comes over from');
  });

  it('marks your own row in the League with a leading arrow, and explains Standing', () => {
    const view = dealt.output.slice(dealt.output.indexOf('THE LEAGUE'));
    expect(view).toMatch(/^ {2}> /m);
    expect(view).toContain('on the Roster');
    expect(flowed(view)).toContain('It is not a score');
    expect(flowed(view)).toContain('the only way to climb is to earn their Regard');
  });

  it('keeps every line it printed inside 80 columns, wrapped rather than cut', () => {
    for (const run of [dealt, refused, thoughtBetterOfIt]) expectEveryLineFits(run.output, 80);
  });
});

describe('the Roster, the Patrons and the former Heroes, one keypress away', () => {
  const read = play([
    '--seed',
    'e2e-views',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.views'),
    '--script',
    script('views.txt', ['r', 'm', 'q', 'p', 'q', 'f', 'q', 'h', 'l', 'q']),
    '--no-colour',
  ]);

  it('runs without failing', () => {
    expect(read.status, read.output.slice(-2000)).toBe(0);
  });

  it('opens each of them and comes back on one keypress', () => {
    expect(read.output).toContain('roster> ');
    expect(read.output).toContain('patrons> ');
    expect(read.output).toContain('former> ');
    expect(read.output).toContain('THE ROSTER');
    expect(read.output).toContain('PATRONS');
    expect(read.output).toContain('FORMER HEROES');
  });

  it('pages a view that does not fit, with a clear indicator', () => {
    expect(read.output).toMatch(/-- page \d+ of \d+ --/);
    expect(read.output).toContain('[m] more');
  });

  it('lists what is saved, with the Guild, the Day, the Year and the Roster size', () => {
    expect(read.output).toContain('SAVED');
    expect(read.output).toMatch(/autosave: (empty|.+Year \d+, Day \d+, \d+ on the Roster)/);
  });

  it('keeps every line inside 80 columns', () => {
    expectEveryLineFits(read.output, 80);
  });
});

describe('the command line', () => {
  it('explains itself and refuses a flag it does not know', () => {
    const help = play(['--help']);
    expect(help.status).toBe(0);
    expect(help.output).toContain('--career-dir');
    expect(help.output).toContain('--width');

    const wrong = play(['--turbo']);
    expect(wrong.status).toBe(2);
    expect(wrong.output).toContain('--turbo');
  });
});

/**
 * E6-S4 in the real process. `--config decisionChancePerBeat=1` makes the Commission stop
 * on its second Beat rather than one time in five, which is the cheapest way to drive the
 * whole arc without waiting years of play for it.
 */
describe('a Party that sends word', () => {
  const answered = play([
    '--seed',
    'e2e-word',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.word'),
    '--config',
    'decisionChancePerBeat=1',
    '--config',
    'startingCoin=5000',
    '--script',
    // `w` opens the Word view and `1` answers there, which is the one path that works
    // whichever form the main screen took: whole, or the loud summary (DL-26 §2).
    script('word.txt', [
      '1',
      'a',
      'b',
      '',
      'n',
      'n',
      'w',
      '1',
      ...Array.from({ length: 400 }, () => 'n'),
      'q',
    ]),
    '--no-colour',
  ]);

  const ignored = play([
    '--seed',
    'e2e-word',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.word-ignored'),
    '--config',
    'decisionChancePerBeat=1',
    '--config',
    'startingCoin=5000',
    '--script',
    script('ignored.txt', ['1', 'a', 'b', '', ...Array.from({ length: 400 }, () => 'n'), 'q']),
    '--no-colour',
  ]);

  /** The same word, answered with the option that **costs coin** (option 2 on this seed). */
  const paid = play([
    '--seed',
    'e2e-word',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.word-paid'),
    '--config',
    'decisionChancePerBeat=1',
    '--config',
    'startingCoin=5000',
    '--script',
    script('paid.txt', ['1', 'a', 'b', '', 'n', 'n', 'w', '2', 'y', 'q']),
    '--no-colour',
  ]);

  it('runs both times without failing', () => {
    expect(answered.status, answered.output.slice(-3000)).toBe(0);
    expect(ignored.status, ignored.output.slice(-3000)).toBe(0);
    expect(paid.status, paid.output.slice(-3000)).toBe(0);
  });

  it('names the option in the authored words, and never its identifier', () => {
    // The real output before this was fixed: "Sending word costs 60 coin: send-coin",
    // one line under a list that read "Send sixty coin ahead for fresh beasts, a night
    // under a roof and somebody to carry. (60 coin)" (E7-S5, DL-26 §3).
    expect(paid.output).toContain('Sending word costs 60 coin: Send sixty coin ahead');
    expect(paid.output).not.toContain('send-coin');
    expect(paid.output).not.toContain('press-on');
    expect(paid.output).not.toContain('turn-back');
    expect(paid.output).toContain('sure> ');
    expect(paid.output).toContain('It cost the Guild 60 coin');
  });

  it('makes the waiting Party the loudest thing on the screen', () => {
    expect(answered.output).toContain('WAITING ON YOUR WORD');
    // Whole where the rows are there for it, and the loud summary with one named key
    // where they are not (DL-26 §2). Either way the Party is the top block, the keys say
    // which of the two is true, and a single keypress answers.
    expect(
      answered.output.includes('[1-9] answer them') ||
        answered.output.includes('[w] read and answer them'),
      answered.output.slice(-2000),
    ).toBe(true);
    expect(answered.output).toContain('[their own judgement]');
    expect(answered.output).toContain('The Guild holds');
  });

  it('shows the prompt and the options whole behind w, and answers there', () => {
    // The summary names who is waiting, on what, how long they have waited and how long
    // is left, and points at the key; the Word view behind it is the whole block.
    expect(answered.output).toMatch(
      /waited \d+ Days?, and acts on their own judgement in \d+ Days?/,
    );
    expect(answered.output).toContain('Press w to read what');
    expect(answered.output).toContain('word> ');
  });

  it('refuses to advance while a Party waits, and says which and for how long', () => {
    expect(ignored.output).toContain('has been waiting');
    expect(ignored.output).toContain('acts on their own judgement in');
    expect(ignored.output).toContain('press n again to let the Days run');
  });

  it('lets a second n run the Days, and the Party then decides for itself', () => {
    expect(ignored.output).toContain(
      'No word went back in time, and they did what they thought best.',
    );
  });

  it('answers on a single keypress where the option costs nothing', () => {
    expect(answered.output).toContain('Word goes back up the road.');
    expect(answered.output).not.toContain('No word went back in time');
  });

  it('reaches the end of the Career either way', () => {
    for (const run of [answered, ignored]) {
      expect(run.output).toMatch(/(retires on Year|cannot meet its Upkeep)/);
    }
  });

  it('keeps every line it printed inside 80 columns', () => {
    expectEveryLineFits(answered.output, 80);
    expectEveryLineFits(ignored.output, 80);
    expectEveryLineFits(paid.output, 80);
  });
});

/**
 * **The E7 gate.** A full Career played end to end in an 80-column terminal without
 * reaching for the scrollback, quit and resumed from an autosave, and read at 40 columns
 * without breaking.
 */
describe('the E7 gate', () => {
  const gateDir = join(workspace, '.gate');
  const brokenDir = join(workspace, '.gate-broken');

  /**
   * One cycle of play, as a script: take the first two Commissions, send two Heroes to
   * each, and let the Days run.
   *
   * The two `cancel`s after each commit are what make a blind script honest rather than
   * lucky. A commit either goes through — in which case `cancel` is an unknown command at
   * the main screen and says so — or meets a refusal, in which case the first `cancel`
   * declines to insist and the second leaves the Party picker. Either way the cycle ends
   * back at the main screen having consumed exactly the same number of lines, so the
   * script can never drift into a sub-screen and stop advancing the Days.
   */
  const CYCLE = ['1', 'a', 'c', '', 'cancel', 'cancel', '2', 'd', 'e', '', 'cancel', 'cancel', 'n', 'n'];
  const cycles = (count: number): string[] => Array.from({ length: count }, () => CYCLE).flat();

  /** Played straight through and saved at a fixed point, well before the ending. */
  const straight = play([
    '--seed',
    'gate-e7',
    '--config',
    'startingCoin=2500',
    '--career-dir',
    gateDir,
    '--script',
    script('gate-straight.txt', [...cycles(20), 's mark', 'q']),
    '--no-colour',
  ]);

  /** The same Career, interrupted half way: `q` autosaves and says where it went. */
  const half = play([
    '--seed',
    'gate-e7',
    '--config',
    'startingCoin=2500',
    '--career-dir',
    brokenDir,
    '--script',
    script('gate-half.txt', [...cycles(10), 'q']),
    '--no-colour',
  ]);

  /** Resumed from that autosave and carried to the very same point. */
  const resumed = play([
    '--career-dir',
    brokenDir,
    '--slot',
    'autosave',
    '--script',
    script('gate-resumed.txt', [...cycles(10), 's mark', 'q']),
    '--no-colour',
  ]);

  it('plays, quits and resumes without failing', () => {
    expect(straight.status, straight.output.slice(-2000)).toBe(0);
    expect(half.status, half.output.slice(-2000)).toBe(0);
    expect(resumed.status, resumed.output.slice(-2000)).toBe(0);
  });

  it('plays: Parties go out and come back', () => {
    expect(straight.output).toContain('set out on');
    expect(straight.output).toContain('came back');
  });

  it('says where the autosave went when the player leaves', () => {
    // Wrapped across lines like everything else, so the path is matched across them.
    expect(half.output.replace(/\s+/g, ' ')).toMatch(/The Career is autosaved to .+autosave\.json/);
    expect(existsSync(join(brokenDir, 'autosave.json'))).toBe(true);
  });

  it('continues to the very same Career, byte for byte', () => {
    expect(careerIn(brokenDir, 'mark')).toBe(careerIn(gateDir, 'mark'));
  });

  it('keeps the whole of an 80-column run inside 80 columns', () => {
    expectEveryLineFits(straight.output, 80);
    expectEveryLineFits(resumed.output, 80);
  });

  it('plays a full Career to Retirement without reaching for the scrollback', () => {
    const ending = play([
      '--seed',
      'gate-e7',
      '--years',
      '1',
      '--config',
      'startingCoin=2500',
      '--career-dir',
      join(workspace, '.gate-end'),
      '--script',
      script('gate-end.txt', [...cycles(220), 'q']),
      '--no-colour',
    ]);
    expect(ending.status, ending.output.slice(-3000)).toBe(0);
    expect(ending.output).toMatch(/retires on Year/);
    expect(ending.output).toContain('Commissions:');
    expect(ending.output).toContain('Harm:');
    expect(ending.output).toContain('[b] begin a new Career');
    expectEveryLineFits(ending.output, 80);
  }, 240_000);

  it('reads at 40 columns without breaking', () => {
    const narrow = play([
      '--seed',
      'gate-e7',
      '--years',
      '1',
      '--career-dir',
      join(workspace, '.gate-40'),
      '--width',
      '40',
      '--script',
      script('gate-40.txt', ['r', 'm', 'q', 'p', 'q', 'g', 'q', 'i', 'q', 'a', 'q', 'o', 'q', 'n', 'n', 'q']),
      '--no-colour',
    ]);
    expect(narrow.status, narrow.output.slice(-2000)).toBe(0);
    expectEveryLineFits(narrow.output, 40);
    // Headings shorten to one word, and the keys go one per line.
    expect(narrow.output).toContain('GUILDS');
    expect(narrow.output).toMatch(/^\[r\] roster$/m);
  });

  it('puts no ANSI escape at all in the output under NO_COLOR', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        entry,
        '--seed',
        'gate-no-color',
        '--years',
        '1',
        '--career-dir',
        join(workspace, '.gate-nocolor'),
        '--script',
        script('gate-nocolor.txt', ['r', 'q', 'n', 'q']),
        '--colour',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status, output.slice(-2000)).toBe(0);
    expect(output).not.toContain(String.fromCharCode(27));
  });

  it('is pure ASCII under a locale that is not UTF-8', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        entry,
        '--seed',
        'gate-ascii',
        '--years',
        '1',
        '--career-dir',
        join(workspace, '.gate-ascii'),
        '--script',
        script('gate-ascii.txt', ['r', 'q', 'n', 'q']),
        '--no-colour',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'en_GB.ISO-8859-1', LANG: 'en_GB.ISO-8859-1' },
      },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status, output.slice(-2000)).toBe(0);
    for (const character of output) {
      expect(character.charCodeAt(0), `not ASCII: ${character}`).toBeLessThan(128);
    }
  });
});
