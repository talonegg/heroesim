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
    expect(command('show', 'rankings')).toMatchObject({ view: { kind: 'rankings', by: 'fame' } });
    expect(command('show', 'rankings', '--by', 'wealth')).toMatchObject({ view: { kind: 'rankings', by: 'wealth' } });
    expect(command('show', 'rankings', '--by=fame')).toMatchObject({ view: { kind: 'rankings', by: 'fame' } });
    expect(command('show', 'hero', 'hero-000001')).toMatchObject({ view: { kind: 'hero', heroId: 'hero-000001' } });
    expect(command('show', 'guildmaster')).toMatchObject({ view: { kind: 'guildmaster' } });
    expect(command('show', 'guildmaster', 'guild-000002')).toMatchObject({ view: { kind: 'guildmaster', guildId: 'guild-000002' } });
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

  test('reads advance --until and --max as a fast forward, in the CLI words for the stops (M2-S11)', () => {
    expect(command('advance', '--until', 'party-returns')).toEqual({ name: 'advance', save: 'current', until: ['party-returned'] });
    expect(command('advance', '--until', 'decision,ended, pool-refreshed', '--max', '40', '--save', 'demo')).toEqual({
      name: 'advance',
      save: 'demo',
      until: ['decision-needed', 'ended', 'pool-refreshed'],
      max: 40,
    });
    expect(command('advance', '--max=7')).toEqual({ name: 'advance', save: 'current', until: [], max: 7 });
  });

  test('reads dispatch: a Quest id and Hero ids joined by commas (M2-S4)', () => {
    expect(command('dispatch', '--quest', 'quest-000003', '--heroes', 'hero-000001,hero-000002')).toEqual({
      name: 'dispatch',
      save: 'current',
      quest: 'quest-000003',
      heroes: ['hero-000001', 'hero-000002'],
    });
    expect(command('dispatch', '--heroes=hero-000004', '--quest=quest-000001', '--save', 'demo')).toMatchObject({
      save: 'demo',
      heroes: ['hero-000004'],
    });
    expect(command('dispatch', '--quest', 'quest-000003', '--heroes', 'hero-000001, hero-000002')).toMatchObject({
      heroes: ['hero-000001', 'hero-000002'],
    });
  });

  test('reads preview as dispatch is read: a Quest id and Hero ids joined by commas (M4-S5)', () => {
    expect(command('preview', '--quest', 'quest-000003', '--heroes', 'hero-000001,hero-000002', '--save', 'demo')).toEqual({
      name: 'preview',
      save: 'demo',
      quest: 'quest-000003',
      heroes: ['hero-000001', 'hero-000002'],
    });
    expect(parseArgs(['preview', '--quest', 'the-barrow', '--heroes', 'hero-000001']).ok).toBe(false);
    expect(parseArgs(['preview', '--quest', 'quest-000001']).ok).toBe(false);
  });

  test('reads --consumables on dispatch and preview: key:n pairs joined by commas, each key once (M5-S3)', () => {
    const consumables = [
      { definitionKey: 'healing-draught', quantity: 2 },
      { definitionKey: 'whetstone', quantity: 1 },
    ];
    for (const name of ['dispatch', 'preview']) {
      expect(command(name, '--quest', 'quest-000003', '--heroes', 'hero-000001', '--consumables', 'healing-draught:2, whetstone:1')).toEqual({
        name,
        save: 'current',
        quest: 'quest-000003',
        heroes: ['hero-000001'],
        consumables,
      });
    }
  });

  test('reads build: a facility in the CLI’s words (M3-S6)', () => {
    expect(command('build', '--facility', 'infirmary')).toEqual({ name: 'build', save: 'current', facility: 'infirmary' });
    expect(command('build', '--facility=training-yard', '--save', 'demo')).toEqual({
      name: 'build',
      save: 'demo',
      facility: 'trainingYard',
    });
    expect(command('build', '--facility', 'quarters')).toMatchObject({ facility: 'quarters' });
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
    [['show', 'rankings', '--by', 'level'], '--by takes fame or wealth; got "level"'],
    [['show', 'rankings', 'wealth'], 'does not take "wealth"'],
    [['show', 'pool', '--by', 'wealth'], '--by is taken by show rankings alone'],
    [['show', '--by', 'wealth'], '--by is taken by show rankings alone'],
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
    [['advance', '--turns', '2', '--until', 'ended'], 'advance takes --turns, or --until and --max, not both'],
    [['advance', '--turns', '2', '--max', '5'], 'not both'],
    [['advance', '--until', 'party-returned'], '--until takes party-returns, decision, ended, pool-refreshed, joined by commas; got "party-returned"'],
    [['advance', '--until', 'ended,,decision'], 'got ""'],
    [['advance', '--until', 'ended,ended'], '--until names ended twice'],
    [['advance', '--until', 'ended', '--max', '0'], '--max needs a whole number from 1; got "0"'],
    [['advance', '--until'], '--until needs a value'],
    [['rebase', '--turns', '2'], 'rebase takes no flag --turns'],
    [['dispatch', '--heroes', 'hero-000001'], 'dispatch needs --quest'],
    [['dispatch', '--quest', 'quest-000001'], 'dispatch needs --heroes'],
    [['dispatch', '--quest', 'hero-000001', '--heroes', 'hero-000002'], '--quest needs a Quest id such as quest-000001; got "hero-000001"'],
    [['dispatch', '--quest', 'quest-000001', '--heroes', 'hero-000001,,hero-000002'], '--heroes needs Hero ids'],
    [['dispatch', '--quest', 'quest-000001', '--heroes', 'Brenna'], 'got "Brenna"'],
    [['dispatch', '--quest', 'quest-000001', '--heroes', 'hero-000001,hero-000001'], '--heroes names hero-000001 twice'],
    [['dispatch', 'quest-000001'], 'does not take "quest-000001"'],
    ...(['whetstone', 'Whetstone:1', 'whetstone:', 'whetstone:x', ':2', 'whetstone:1,,lockpicks:1'].map((value) => [
      ['dispatch', '--quest', 'quest-000001', '--heroes', 'hero-000001', '--consumables', value],
      '--consumables needs key:n pairs such as healing-draught:2, joined by commas',
    ]) as [string[], string][]),
    [['preview', '--quest', 'quest-000001', '--heroes', 'hero-000001', '--consumables', 'whetstone:0'], '--consumables whetstone needs a whole number from 1; got "0"'],
    [['dispatch', '--quest', 'quest-000001', '--heroes', 'hero-000001', '--consumables', 'whetstone:1,whetstone:2'], '--consumables names whetstone twice'],
    [['build'], 'build needs --facility'],
    [['build', '--facility', 'stables'], '--facility takes infirmary, training-yard, quarters; got "stables"'],
    [['build', '--facility', 'trainingYard'], 'got "trainingYard"'],
    [['build', 'infirmary'], 'does not take "infirmary"'],
  ])('refuses %j', (argv, expected) => {
    expect(problem(...argv)).toContain(expected);
  });
});
