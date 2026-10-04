import { descriptiveAttributeMaxLength } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { parseArgs, usage } from './args.js';

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

  test("reads new's Guildmaster flags: the sex, the age, the Traits by key, and the three descriptive Attributes (M9-S2)", () => {
    expect(
      command(
        'new', '--guild', 'G', '--master', 'M', '--sex', 'female', '--age', '40', '--traits', 'thrifty, miser',
        '--birthplace', 'Harrowgate', '--appearance', 'Grey at the temples.', '--biography=A life at sea.',
      ),
    ).toEqual({
      name: 'new',
      save: 'current',
      guild: 'G',
      master: 'M',
      force: false,
      sex: 'female',
      age: 40,
      traits: ['thrifty', 'miser'],
      birthplace: 'Harrowgate',
      appearance: 'Grey at the temples.',
      biography: 'A life at sea.',
    });
    // The Portrait by its key (v1.1.2-S3); whether content has it is the engine's to say.
    expect(command('new', '--guild', 'G', '--master', 'M', '--portrait', 'gm-female-01')).toMatchObject({ portrait: 'gm-female-01' });
    expect(command('new', '--guild', 'G', '--master', 'M')).not.toHaveProperty('portrait');
    // Whether content lists it is the engine's to say (`unknown-portrait`), whatever its form (v1.1.2-S6).
    expect(command('new', '--guild', 'G', '--master', 'M', '--portrait', 'GM Female 1')).toMatchObject({ portrait: 'GM Female 1' });
    // `none` is no Trait at all; left out, the Traits are drawn.
    expect(command('new', '--guild', 'G', '--master', 'M', '--traits', 'none')).toMatchObject({ traits: [] });
    expect(command('new', '--guild', 'G', '--master', 'M')).not.toHaveProperty('traits');
    // A repeated key or one content lacks is the engine's to refuse, with the setup's own words.
    expect(command('new', '--guild', 'G', '--master', 'M', '--traits', 'miser,miser,brave')).toMatchObject({ traits: ['miser', 'miser', 'brave'] });
  });

  test("reads new's --stats as key=number pairs, refusing a pair of another form or a key named twice (v1.1.4-S11)", () => {
    expect(command('new', '--guild', 'G', '--master', 'M', '--stats', 'inspiration=12, influence=8,judgement=30')).toMatchObject({
      stats: { inspiration: 12, influence: 8, judgement: 30 },
    });
    expect(command('new', '--guild', 'G', '--master', 'M')).not.toHaveProperty('stats');
    // Which keys content has, whether all are given, the range and the points are new's and the engine's to say.
    expect(command('new', '--guild', 'G', '--master', 'M', '--stats', 'charm=3')).toMatchObject({ stats: { charm: 3 } });
    for (const [given, problem] of [
      ['inspiration', '--stats needs each Guildmaster Stat as key=number, such as inspiration=12, joined by commas; got "inspiration"'],
      ['inspiration=-1', 'got "inspiration=-1"'],
      ['inspiration=1.5', 'got "inspiration=1.5"'],
      ['Inspiration=10', 'got "Inspiration=10"'],
      ['inspiration=10,inspiration=11', '--stats names inspiration twice'],
    ] as const) {
      expect(parseArgs(['new', '--guild', 'G', '--master', 'M', '--stats', given])).toEqual({ ok: false, problem: expect.stringContaining(problem) });
    }
    // The printer adds the full stop, so the problem carries none.
    expect(parseArgs(['new', '--guild', 'G', '--master', 'M', '--stats', 'inspiration=10,inspiration=11'])).toEqual({
      ok: false,
      problem: '--stats names inspiration twice',
    });
  });

  test('reads every view of show', () => {
    expect(command('show')).toMatchObject({ view: { kind: 'summary' } });
    expect(command('show', 'guilds')).toMatchObject({ view: { kind: 'guilds' } });
    expect(command('show', 'roster')).toMatchObject({ view: { kind: 'roster' } });
    expect(command('show', 'roster', 'guild-000002')).toMatchObject({ view: { kind: 'roster', guildId: 'guild-000002' } });
    expect(command('show', 'hall')).toMatchObject({ view: { kind: 'hall' } });
    expect(command('show', 'hall', 'guild-000002')).toMatchObject({ view: { kind: 'hall', guildId: 'guild-000002' } });
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

  test('reads --until staffable, the opt-in stop for a Quest the Heroes at home can staff, and below-floor (M9-S1)', () => {
    expect(command('advance', '--until', 'staffable')).toEqual({ name: 'advance', save: 'current', until: ['quest-staffable'] });
    expect(command('advance', '--until', 'staffable,below-floor', '--max', '90')).toEqual({
      name: 'advance',
      save: 'current',
      until: ['quest-staffable', 'below-floor'],
      max: 90,
    });
  });

  // The bounds the engine's, read rather than repeated (DL-186 item 6, v1.1.6-S5's verification).
  test("the usage gives the engine's bounds of a Birthplace, an Appearance and a Biography", () => {
    const { birthplace, appearance, biography } = descriptiveAttributeMaxLength;
    expect(usage.replace(/\s+/g, ' ')).toContain(`(at most ${birthplace}, ${appearance} and ${biography.toLocaleString('en-GB')} characters)`);
  });

  test("the usage names every --until word, and says which stop without being named (M9-S1)", () => {
    const fastForward = usage.slice(usage.indexOf('  advance --until'), usage.indexOf('  recruit '));
    for (const word of ['party-returns', 'decision', 'staffable', 'transfer-offer', 'below-floor', 'ended', 'pool-refreshed']) {
      expect(fastForward).toContain(word);
    }
    expect(fastForward).toMatch(/falls below the\s+Bankruptcy floor/);
    expect(fastForward).toMatch(/staffable \(a Quest the Heroes at home could take reaches the Board, even with a\s+Party out\)/);
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

  test('reads show market, buy and sell (M5-S4)', () => {
    expect(command('show', 'market')).toEqual({ name: 'show', save: 'current', view: { kind: 'market' } });
    expect(command('buy', '--item', 'padded-jack')).toEqual({ name: 'buy', save: 'current', item: 'padded-jack', quantity: 1 });
    expect(command('buy', '--item=whetstone', '--quantity', '3', '--save', 'demo')).toEqual({
      name: 'buy',
      save: 'demo',
      item: 'whetstone',
      quantity: 3,
    });
    expect(command('sell', '--stack', 'stack-000004')).toEqual({ name: 'sell', save: 'current', stack: 'stack-000004', quantity: 1 });
    expect(command('sell', '--stack', 'stack-000004', '--quantity', '2')).toMatchObject({ quantity: 2 });
    expect(command('sell', '--item', 'item-000002')).toEqual({ name: 'sell', save: 'current', item: 'item-000002' });
  });

  test('reads transfer --to and --in, accept, decline and show offers (M6-S2)', () => {
    expect(command('transfer', '--hero', 'hero-000003', '--to', 'guild-000002')).toEqual({
      name: 'transfer',
      save: 'current',
      hero: 'hero-000003',
      to: 'guild-000002',
    });
    expect(command('transfer', '--in', '--hero=hero-000009', '--save', 'demo')).toEqual({
      name: 'transfer',
      save: 'demo',
      hero: 'hero-000009',
      in: true,
    });
    expect(command('accept', '--offer', 'offer-000001')).toEqual({ name: 'accept', save: 'current', offer: 'offer-000001' });
    expect(command('decline', '--offer=offer-000002')).toEqual({ name: 'decline', save: 'current', offer: 'offer-000002' });
    expect(command('show', 'offers')).toEqual({ name: 'show', save: 'current', view: { kind: 'offers' } });
    expect(command('advance', '--until', 'transfer-offer')).toEqual({ name: 'advance', save: 'current', until: ['transfer-offer'] });
  });

  test('reads --modules on new, load and advance: the test-only modules to install, by id, joined by commas (M8-S4)', () => {
    expect(command('new', '--guild', 'G', '--master', 'M', '--modules', 'probe')).toEqual({
      name: 'new',
      save: 'current',
      guild: 'G',
      master: 'M',
      force: false,
      modules: ['probe'],
    });
    expect(command('advance', '--modules', 'probe')).toEqual({ name: 'advance', save: 'current', turns: 1, modules: ['probe'] });
    expect(command('advance', '--turns', '11', '--modules= probe ')).toEqual({ name: 'advance', save: 'current', turns: 11, modules: ['probe'] });
    expect(command('advance', '--until', 'decision', '--modules', 'probe')).toEqual({
      name: 'advance',
      save: 'current',
      until: ['decision-needed'],
      modules: ['probe'],
    });
    expect(command('load', 'backup', '--modules', 'probe')).toEqual({ name: 'load', save: 'current', file: 'backup', modules: ['probe'] });
    // None unless given: the commands read as they did before M8.
    expect(command('advance')).not.toHaveProperty('modules');
    expect(command('new', '--guild', 'G', '--master', 'M')).not.toHaveProperty('modules');
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
    [['show', 'bazaar'], 'no view "bazaar"'],
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
    [['new', '--guild', 'G', '--master', 'M', '--sex', 'other'], '--sex takes female or male; got "other"'],
    [['new', '--guild', 'G', '--master', 'M', '--age', 'forty'], '--age needs a whole number of years; got "forty"'],
    [['new', '--guild', 'G', '--master', 'M', '--age', '40.5'], '--age needs a whole number of years; got "40.5"'],
    [['new', '--guild', 'G', '--master', 'M', '--traits', 'thrifty,,miser'], '--traits needs Trait keys such as old-soldier, joined by commas, or none; got ""'],
    [['new', '--guild', 'G', '--master', 'M', '--traits', 'none,miser'], 'got "none"'],
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
    [['advance', '--until', 'party-returned'], '--until takes party-returns, decision, staffable, transfer-offer, below-floor, ended, pool-refreshed, joined by commas; got "party-returned"'],
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
    [['show', 'market', 'extra'], 'does not take "extra"'],
    [['buy'], 'buy needs --item'],
    [['buy', '--item', 'whetstone', '--quantity', '0'], '--quantity needs a whole number from 1; got "0"'],
    [['buy', 'whetstone'], 'does not take "whetstone"'],
    [['sell'], 'sell needs --stack or --item'],
    [['sell', '--stack', 'stack-000001', '--item', 'item-000001'], 'sell takes --stack or --item, not both'],
    [['sell', '--item', 'item-000001', '--quantity', '2'], '--quantity goes with --stack'],
    [['sell', '--stack', 'item-000001'], '--stack needs a stack id such as stack-000001; got "item-000001"'],
    [['sell', '--item', 'healing-draught'], 'such as item-000001; got "healing-draught"'],
    [['sell', '--stack', 'stack-000001', '--quantity', 'all'], '--quantity needs a whole number from 1; got "all"'],
    [['transfer', '--to', 'guild-000002'], 'transfer needs --hero'],
    [['transfer', '--hero', 'hero-000001'], 'transfer takes --to <guildId> or --in, and one of them only'],
    [['transfer', '--hero', 'hero-000001', '--in', '--to', 'guild-000002'], 'one of them only'],
    [['transfer', '--hero', 'hero-000001', '--to', 'hero-000002'], '--to needs a Guild id such as guild-000002; got "hero-000002"'],
    [['transfer', '--hero', 'Brenna', '--in'], '--hero needs a Hero id such as hero-000001; got "Brenna"'],
    [['transfer', '--hero', 'hero-000001', '--in=yes'], '--in takes no value'],
    [['accept'], 'accept needs --offer'],
    [['decline', '--offer', 'quest-000001'], '--offer needs an offer id such as offer-000001; got "quest-000001"'],
    [['show', 'offers', 'extra'], 'does not take "extra"'],
    [['advance', '--modules', 'weather'], '--modules takes probe, joined by commas; got "weather"'],
    [['advance', '--modules', 'Probe'], 'got "Probe"'],
    [['new', '--guild', 'G', '--master', 'M', '--modules', 'probe,,probe'], 'got ""'],
    [['load', 'backup', '--modules', 'probe,probe'], '--modules names probe twice'],
    [['advance', '--modules'], '--modules needs a value'],
    [['show', '--modules', 'probe'], 'show takes no flag --modules'],
    [['dispatch', '--quest', 'quest-000001', '--heroes', 'hero-000001', '--modules', 'probe'], 'dispatch takes no flag --modules'],
  ])('refuses %j', (argv, expected) => {
    expect(problem(...argv)).toContain(expected);
  });
});
