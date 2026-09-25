import { describe, expect, test } from 'vitest';
import { parseArgs } from './args.js';

function command(...argv: string[]) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) throw new Error(`Expected ${argv.join(' ')} to parse: ${parsed.problem}`);
  return parsed.command;
}

function problem(...argv: string[]): string {
  const parsed = parseArgs(argv);
  if (parsed.ok) throw new Error(`Expected ${argv.join(' ')} to be refused`);
  return parsed.problem;
}

describe('parseArgs', () => {
  test('reads new with its flags, spaced or joined by =, and the current save by default', () => {
    expect(command('new', '--seed', 'demo', '--guild', 'The Test', '--master=Ada')).toEqual({
      name: 'new',
      save: 'current',
      seed: 'demo',
      guild: 'The Test',
      master: 'Ada',
      force: false,
    });
    expect(command('new', '--guild', 'G', '--master', 'M', '--background', 'breakaway', '--force', '--save', 'x')).toEqual({
      name: 'new',
      save: 'x',
      guild: 'G',
      master: 'M',
      background: 'breakaway',
      force: true,
    });
  });

  test('reads every view of show', () => {
    expect(command('show')).toMatchObject({ view: { kind: 'summary' } });
    expect(command('show', 'guilds')).toMatchObject({ view: { kind: 'guilds' } });
    expect(command('show', 'roster')).toMatchObject({ view: { kind: 'roster' } });
    expect(command('show', 'roster', 'guild-000002')).toMatchObject({ view: { kind: 'roster', guildId: 'guild-000002' } });
    expect(command('show', 'pool')).toMatchObject({ view: { kind: 'pool' } });
    expect(command('show', 'patrons')).toMatchObject({ view: { kind: 'patrons' } });
    expect(command('show', 'board')).toMatchObject({ view: { kind: 'board' } });
    expect(command('show', 'hero', 'hero-000001')).toMatchObject({ view: { kind: 'hero', heroId: 'hero-000001' } });
    expect(command('show', 'history')).toMatchObject({ view: { kind: 'history' } });
    expect(command('show', 'history', 'hero-000001', '--save', 'demo')).toMatchObject({
      save: 'demo',
      view: { kind: 'history', entityId: 'hero-000001' },
    });
  });

  test('reads advance, one Turn unless given more, and rebase', () => {
    expect(command('advance')).toEqual({ name: 'advance', save: 'current', turns: 1 });
    expect(command('advance', '--turns', '12', '--save', 'demo')).toEqual({ name: 'advance', save: 'demo', turns: 12 });
    expect(command('advance', '--turns=3')).toMatchObject({ turns: 3 });
    expect(command('rebase')).toEqual({ name: 'rebase', save: 'current' });
  });

  test('reads save, load and help', () => {
    expect(command('save', '--as', 'backup')).toEqual({ name: 'save', save: 'current', as: 'backup' });
    expect(command('load', 'backup')).toEqual({ name: 'load', save: 'current', file: 'backup' });
    expect(command('help')).toEqual({ name: 'help' });
    expect(command('--help')).toEqual({ name: 'help' });
  });

  test.each([
    [[], 'No command'],
    [['play'], 'Unknown command "play"'],
    [['show', '--verbose'], 'show takes no flag --verbose'],
    [['show', 'market'], 'no view "market"'],
    [['show', 'pool', 'extra'], 'does not take "extra"'],
    [['show', 'hero'], 'needs a Hero id'],
    [['new', '--master', 'Ada'], 'new needs --guild'],
    [['new', '--guild', 'G', '--master'], '--master needs a value'],
    [['new', '--guild', '--master', 'Ada'], '--guild needs a value'],
    [['new', '--guild', 'G', '--guild', 'H', '--master', 'M'], '--guild is given twice'],
    [['new', '--guild', 'G', '--master', 'M', '--force=yes'], '--force takes no value'],
    [['save'], 'save needs --as'],
    [['save', '--as='], '--as needs a value'],
    [['load'], 'load needs a file'],
    [['load', 'a', 'b'], 'does not take "b"'],
    ...['0', '-1', '1.5', 'three', '1e3', ' 2'].map((turns): [string[], string] => [
      ['advance', `--turns=${turns}`],
      `--turns needs a whole number from 1; got "${turns}"`,
    ]),
    [['advance', 'three'], 'does not take "three"'],
    [['rebase', '--turns', '2'], 'rebase takes no flag --turns'],
  ])('refuses %j', (argv, expected) => {
    expect(problem(...argv)).toContain(expected);
  });
});
